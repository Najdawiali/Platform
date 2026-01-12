import json
import logging
from typing import List, Dict, Any, Optional
from openai import OpenAI
from app.config import settings
from app.services.connection_service import ConnectionService
from app.services.dataset_service import DatasetService
from app.services.query_service import QueryService
from app.schemas.query import QuerySource
from app.database import SessionLocal
from app.models.user import User

logger = logging.getLogger(__name__)

class AIService:
    def __init__(self):
        self.client = OpenAI(
            api_key=settings.DEEPINFRA_API_KEY,
            base_url=settings.DEEPINFRA_BASE_URL,
        )
        self.model = settings.LLM_MODEL or "Qwen/Qwen3-14B"

    def get_system_prompt(self, db, user: User) -> str:
        # Fetch available connections and datasets to provide context
        connections = ConnectionService.get_user_connections(user, db)
        datasets = DatasetService.get_user_datasets(user, db)
        
        
        context_str = "Available Data Sources:\n"
        
        # Filter out file-based connections from the prompt to avoid ambiguity.
        # We want the LLM to use the 'Dataset' entity for files, which supports querying via federation.
        ignored_types = ['csv', 'excel', 'json', 'txt', 'md', 'mdx', 'pdf']
        
        # Build a lookup for LLM to use names instead of IDs
        self._source_lookup = {}  # name -> id mapping for internal use
        
        for conn in connections:
            if conn.source_type.value in ignored_types:
                continue
            self._source_lookup[conn.name] = conn.id
            context_str += f"- Database: \"{conn.name}\" (type: {conn.source_type.value})\n"
        
        for ds in datasets:
            # Derive effective table name
            table_name = ds.name
            if table_name.lower().endswith('.csv'):
                table_name = table_name[:-4]
            
            self._source_lookup[ds.name] = ds.id
            self._source_lookup[table_name] = ds.id  # Also map by table name
            
            # Extract column names from schema_info if available
            columns_str = ""
            if ds.schema_info and isinstance(ds.schema_info, dict):
                cols = ds.schema_info.get("columns", [])
                if isinstance(cols, list) and cols:
                    columns_str = f" - Columns: {cols[:15]}"
                elif isinstance(cols, dict):
                    columns_str = f" - Columns: {list(cols.keys())[:15]}"

            context_str += f"- Dataset: \"{ds.name}\" (table: `{table_name}`){columns_str}\n"

        return f"""/no_think
You are a smart data assistant for a Data Platform. Help users analyze data, create visualizations, and build workflows.

{context_str}

TOOLS:
1. `execute_sql_query`: Query a dataset or database. Use standard SQL with double quotes for table names (e.g., SELECT * FROM "table_name").
2. `create_dashboard_chart`: Create a chart visualization (bar, pie, line, etc.) and save it as an Insight.
3. `create_workflow`: Build an automated workflow using the Workflow Builder.

GUIDELINES:
- Be concise. Give brief answers by default. Only provide details when the user asks (e.g., "show me the data", "give details").
- Never mention database IDs or UUIDs. Refer to data by human-readable names only.
- For "overview" or "summary" requests, query a sample first (LIMIT 5) then summarize the content.
- IMPORTANT: Use double quotes for table names in SQL, NOT backticks. Example: SELECT * FROM "finance_test_data" LIMIT 5
- When users ask about automation, ETL, or data processing, suggest using `create_workflow`.
- When users want to visualize data, use `create_dashboard_chart` to create and save the chart.
"""

    def _execute_sql(self, db, user: User, connection_id: str, query: str) -> Dict[str, Any]:
        """Execute SQL query on connection or dataset"""
        logger.info(f"EXECUTE SQL: id={connection_id} query='{query}' user={user.id}")
        try:
            # Resolve name to ID if the LLM passed a name instead of UUID
            resolved_id = connection_id
            
            # Log the lookup table for debugging
            if hasattr(self, '_source_lookup'):
                logger.info(f"Source lookup keys: {list(self._source_lookup.keys())}")
            
            # Try exact match first
            if hasattr(self, '_source_lookup') and connection_id in self._source_lookup:
                resolved_id = self._source_lookup[connection_id]
                logger.info(f"Exact match: '{connection_id}' -> '{resolved_id}'")
            else:
                # Try case-insensitive and partial matching
                if hasattr(self, '_source_lookup'):
                    for key, val in self._source_lookup.items():
                        # Case insensitive match
                        if key.lower() == connection_id.lower():
                            resolved_id = val
                            logger.info(f"Case-insensitive match: '{connection_id}' -> '{resolved_id}'")
                            break
                        # Partial match (key contains the search or vice versa)
                        if connection_id.lower() in key.lower() or key.lower() in connection_id.lower():
                            resolved_id = val
                            logger.info(f"Partial match: '{connection_id}' -> '{resolved_id}'")
                            break
            
            # Check if it's a dataset
            dataset = DatasetService.get_dataset_by_id(resolved_id, user, db)
            
            if dataset:
                logger.info(f"Target is Dataset: {dataset.name} ({dataset.id})")
                # Use Federated Query Service for Datasets (CSV, Excel, etc.)
                # We register the dataset with its name (stem) as the alias so the query works.
                alias = dataset.name
                if alias.lower().endswith('.csv'):
                    alias = alias[:-4]
                
                # Create a source definition
                source = QuerySource(
                    id=dataset.id,
                    type="dataset",
                    alias=alias,
                    source_identifier=dataset.source_identifier
                )
                
                # Execute using QueryService
                df = QueryService.execute_query_to_dataframe_federated(
                    query=query,
                    sources=[source],
                    user=user,
                    db=db,
                    max_rows=100
                )
                
                logger.info(f"Query Result Rows: {len(df)}")
                return {
                    "columns": df.columns.tolist(),
                    "rows": df.to_dict('records'),
                    "row_count": len(df)
                }

            # If not dataset, try connection
            connection = ConnectionService.get_connection_by_id(resolved_id, user, db)
            
            if connection:
                # Execute direct via connector
                connector = QueryService._get_connector_for_connection(connection, "dummy")
                if connector.connect():
                    try:
                        df = connector.execute_query(query)
                        return {
                            "columns": df.columns.tolist(),
                            "rows": df.to_dict('records')[:10], # Limit rows for LLM context
                            "row_count": len(df)
                        }
                    finally:
                        connector.disconnect()
            
            return {"error": "Connection or Dataset not found"}

        except Exception as e:
            logger.error(f"SQL Execution Error: {e}")
            return {"error": str(e)}

    def _normalize_history(self, history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Convert frontend history (which has simplified/nested tool calls) 
        into strict OpenAI structure (Assistant with tool_calls -> Tool messages).
        """
        import time 
        normalized_messages = []
        
        for msg in history:
            # Deep copy to avoid mutating original
            msg = msg.copy()
            role = msg.get("role")
            
            if role == "assistant" and msg.get("tool_calls"):
                # Converting custom tool calls back to OpenAI format
                openai_tool_calls = []
                tool_results = []
                
                custom_calls = msg.get("tool_calls")
                
                for output in custom_calls:
                    # Check if it's already in OpenAI format (from previous turn persistence?)
                    # Frontend usually persists what we returned.
                    
                    # Reconstruct the tool call object
                    # We need to make sure we have an ID.
                    tool_call_id = output.get("id") or output.get("tool_call_id") or f"call_{int(time.time()*1000)}" 
                    
                    # Backend simplified format has 'tool' and 'args'. 
                    # OpenAI strict has 'function': {'name', 'arguments'}
                    
                    tool_name = output.get("tool") or (output.get("function") or {}).get("name")
                    args = output.get("args") 
                    if args is None and output.get("function"):
                         # Try to get from arguments string if it's already standard
                         try:
                            args = json.loads(output["function"]["arguments"])
                         except:
                            args = {}
                    
                    openai_tool_calls.append({
                        "id": tool_call_id,
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "arguments": json.dumps(args or {})
                        }
                    })
                    
                    # Reconstruct the result message
                    # Backend simplified format has 'result'
                    # OpenAI needs 'role': 'tool', 'content': ...
                    result_content = output.get("result")
                    
                    tool_results.append({
                        "role": "tool",
                        "tool_call_id": tool_call_id,
                        "content": json.dumps(result_content or {}, default=str)
                    })
                
                # Add the Assistant message with the properly formatted tool_calls
                assistant_msg = {
                    "role": "assistant",
                    "content": msg.get("content"),
                    "tool_calls": openai_tool_calls
                }
                normalized_messages.append(assistant_msg)
                
                # Append the tool result messages immediately after
                normalized_messages.extend(tool_results)
                
            else:
                # User or System messages (or Assistant without tools) passed through
                clean_msg = {"role": role, "content": msg.get("content")}
                normalized_messages.append(clean_msg)
                
        return normalized_messages

    def process_message(self, message: str, history: List[Dict[str, str]] = None, user: User = None) -> Dict[str, Any]:
        db = SessionLocal()
        try:
            if history is None:
                history = []

            # Prepare context
            system_prompt = self.get_system_prompt(db, user)
            
            # Normalize history to match OpenAI strict format
            normalized_history = self._normalize_history(history)
            
            messages = [{"role": "system", "content": system_prompt}] + normalized_history + [{"role": "user", "content": message}]
            
            # DEBUG: Log the messages sending to OpenAI
            logger.info(f"OPENAI MESSAGES: {json.dumps(messages, default=str, indent=2)}")

            # Define tools
            tools = [
                {
                    "type": "function",
                    "function": {
                        "name": "execute_sql_query",
                        "description": "Execute a SQL query against a database connection OR a Dataset (CSV/Excel). Returns the query results.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "connection_id": {"type": "string", "description": "The ID of the connection or dataset to query."},
                                "query": {"type": "string", "description": "The SQL query to execute."}
                            },
                            "required": ["connection_id", "query"]
                        }
                    }
                },
                {
                    "type": "function",
                    "function": {
                        "name": "create_dashboard_chart",
                        "description": "Create a chart configuration.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "dataset_id": {"type": "string"},
                                "chart_type": {"type": "string", "enum": ["bar", "pie", "line", "area", "scatter", "heatmap"]},
                                "title": {"type": "string"},
                                "x_column": {"type": "string"},
                                "y_column": {"type": "string"},
                                "aggregation": {"type": "string"}
                            },
                            "required": ["dataset_id", "chart_type", "title", "x_column", "y_column"]
                        }
                    }
                },
                 {
                    "type": "function",
                    "function": {
                        "name": "create_workflow",
                        "description": "Create a new workflow.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "steps": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "name": {"type": "string"},
                                            "operation": {"type": "string"},
                                            "description": {"type": "string"}
                                        }
                                    }
                                }
                            },
                            "required": ["name", "steps"]
                        }
                    }
                }
            ]

            # 1. First LLM Call
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=tools,
                tool_choice="auto"
            )

            assistant_msg = response.choices[0].message
            
            # 2. Check for tool calls
            if assistant_msg.tool_calls:
                tool_outputs = []
                messages.append(assistant_msg) # Add Assistant's tool call to history

                for tool_call in assistant_msg.tool_calls:
                    function_name = tool_call.function.name
                    arguments = json.loads(tool_call.function.arguments)
                    
                    output_result = None

                    if function_name == "execute_sql_query":
                        # Execute SQL and get data
                        result_data = self._execute_sql(db, user, arguments.get('connection_id'), arguments.get('query'))
                        
                        # Return JSON to frontend as requested by user
                        output_result = {
                            "status": "executed", 
                            "query": arguments.get('query'), 
                            "data": result_data 
                        }
                        
                        # Add tool result to messages for the second turn
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps(result_data, default=str)
                        })

                    elif function_name == "create_dashboard_chart":
                        # Persist the chart as a new Insight
                        try:
                            from app.services.dashboard_service import DashboardService
                            from types import SimpleNamespace
                            
                            dataset_id = arguments.get('dataset_id')
                            # Resolve dataset name to ID if needed
                            if dataset_id and hasattr(self, '_source_lookup') and dataset_id in self._source_lookup:
                                dataset_id = self._source_lookup[dataset_id]
                            
                            # Get dataset to use for insight creation
                            dataset = DatasetService.get_dataset_by_id(dataset_id, user, db)
                            if not dataset:
                                output_result = {"status": "error", "message": "Dataset not found"}
                            else:
                                # Create a simple SELECT * query for the chart data
                                table_name = dataset.name
                                if table_name.lower().endswith('.csv'):
                                    table_name = table_name[:-4]
                                
                                # Build insight data for create_sql_insight
                                insight_data = SimpleNamespace(
                                    name=arguments.get('title', 'AI Generated Chart'),
                                    description=f"Chart created by AI assistant",
                                    query=f'SELECT * FROM "{table_name}"',
                                    sources=[QuerySource(
                                        id=dataset.id,
                                        type="dataset",
                                        alias=table_name,
                                        source_identifier=dataset.source_identifier
                                    )],
                                    chart=SimpleNamespace(
                                        chart_type=arguments.get('chart_type', 'bar'),
                                        x_column=arguments.get('x_column'),
                                        y_column=arguments.get('y_column'),
                                        title=arguments.get('title'),
                                        config={"aggregation": arguments.get('aggregation', 'sum')}
                                    )
                                )
                                
                                dashboard = DashboardService.create_sql_insight(user, insight_data, db)
                                output_result = {
                                    "status": "created", 
                                    "message": f"Chart '{arguments.get('title')}' saved as Insight!",
                                    "insight_name": dashboard.name,
                                    "config": arguments
                                }
                        except Exception as e:
                            logger.error(f"Error creating chart insight: {e}")
                            output_result = {"status": "created", "config": arguments, "note": "Chart config generated (save failed)"}
                        
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps(output_result, default=str)
                        })
                    
                    elif function_name == "create_workflow":
                        # Return workflow config for the Workflow Builder
                        workflow_name = arguments.get('name', 'AI Generated Workflow')
                        steps = arguments.get('steps', [])
                        
                        output_result = {
                            "status": "created", 
                            "message": f"Workflow '{workflow_name}' is ready. Open the Workflow Builder to configure and run it.",
                            "workflow": {
                                "name": workflow_name,
                                "steps": steps
                            }
                        }
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": f"Workflow '{workflow_name}' created with {len(steps)} steps."
                        })

                    # Add to outputs for frontend
                    tool_outputs.append({
                        "id": tool_call.id,          # Essential for history reconstruction
                        "type": "function",
                        "tool": function_name,
                        "args": arguments,
                        "result": output_result
                    })
                
                # 3. Second LLM Call (Final Answer)
                # The LLM sees the tool results and generates a natural language response
                final_response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    # No tools for final response to prevent loops? Or allow?
                    # Safer to disable tools for final text generation to avoid loops.
                )
                
                final_content = final_response.choices[0].message.content
                
                return {
                    "role": "assistant",
                    "content": final_content,
                    "tool_calls": tool_outputs
                }

            else:
                return {
                    "role": "assistant",
                    "content": assistant_msg.content
                }

        except Exception as e:
            logger.error(f"Error in chat processing: {e}")
            return {
                "role": "assistant",
                "content": f"I'm sorry, I encountered an error: {str(e)}"
            }
        finally:
            db.close()

ai_service = AIService()

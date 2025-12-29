import duckdb
import pandas as pd
import time
import logging
import sqlglot
import re
import math
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.dataset import Dataset
from ..models.connection import Connection
from ..services.dataset_service import DatasetService
from ..services.connection_service import ConnectionService
from ..schemas.query import QuerySource, QueryResult

class QueryService:
    logger = logging.getLogger(__name__)

    @staticmethod
    def _strip_trailing_semicolons(query: str) -> str:
        """Remove trailing semicolons so queries can be safely wrapped as subqueries.

        DuckDB allows `SELECT ...;` in direct execution, but `SELECT * FROM (<query>);`
        becomes invalid if the inner query still contains a statement terminator.
        """
        q = (query or "").strip()
        while q.endswith(";"):
            q = q[:-1].rstrip()
        return q

    @staticmethod
    def validate_query(query: str) -> Dict[str, Any]:
        """
        Validate SQL query syntax using sqlglot.
        Returns a dict with 'is_valid' and 'errors'.
        """
        try:
            # Parse the query using DuckDB dialect (since that's our engine)
            sqlglot.transpile(query, read="duckdb", write="duckdb")
            return {"is_valid": True, "errors": []}
        except sqlglot.errors.ParseError as e:
            return {
                "is_valid": False, 
                "errors": [str(e)]
            }
        except Exception as e:
            return {
                "is_valid": False,
                "errors": [f"Unexpected error: {str(e)}"]
            }

    @staticmethod
    def execute_query(
        query: str,
        sources: List[QuerySource],
        user: User,
        db: Session,
        page: int = 1,
        page_size: int = 100
    ) -> QueryResult:
        """
        Execute a SQL query across multiple heterogeneous sources using DuckDB.
        Supports pagination for large result sets.
        """
        start_time = time.time()
        
        # OPTIMIZATION: Check for Single-Source Connection Query
        # If all sources point to the same connection ID, we can execute directly on the DB.
        # This avoids fetching data into memory and allows full DB syntax.
        unique_connection_ids = set()
        for s in sources:
            if s.type == "connection":
                unique_connection_ids.add(s.id)
            elif s.type == "dataset":
                # If any dataset is involved, we MUST use DuckDB (Federated)
                unique_connection_ids.add("mixed") 
                break
        
        # If exactly one connection and no datasets involved -> Passthrough
        if len(unique_connection_ids) == 1 and "mixed" not in unique_connection_ids:
            connection_id = list(unique_connection_ids)[0]
            
            # Check if connection supports SQL passthrough
            connection = ConnectionService.get_connection_by_id(connection_id, user, db)
            if connection and connection.source_type in ["mysql", "postgresql", "snowflake", "sqlserver"]:
                return QueryService._execute_direct_query(connection_id, query, sources, user, db, start_time, page, page_size)
            # If MongoDB or other non-SQL source, fall through to Federated Mode (DuckDB)

        # Otherwise -> Federated Query (DuckDB)
        con = duckdb.connect(database=':memory:')
        
        try:
            # 1. Register all sources as DuckDB views/tables
            for source in sources:
                if source.type == "dataset":
                    QueryService._register_dataset(con, source, user, db)
                elif source.type == "connection":
                    QueryService._register_connection(con, source, user, db)
                else:
                    raise ValueError(f"Unknown source type: {source.type}")

            # 2. Execute the query
            # We use .df() to get result as Pandas DataFrame
            result_df = con.execute(query).df()
            
            total_rows = len(result_df)
            
            # 3. Apply pagination
            offset = (page - 1) * page_size
            paginated_df = result_df.iloc[offset:offset + page_size]
            
            # 4. Format results
            # Replace NaN with None for JSON compatibility
            paginated_df = paginated_df.where(pd.notnull(paginated_df), None)
            
            execution_time = (time.time() - start_time) * 1000
            
            return QueryResult(
                columns=paginated_df.columns.tolist(),
                rows=paginated_df.to_dict('records'),
                row_count=total_rows,
                execution_time_ms=execution_time,
                page=page,
                page_size=page_size,
                total_pages=math.ceil(total_rows / page_size) if total_rows > 0 else 0
            )
            
        except Exception as e:
            QueryService.logger.error(f"Query execution failed: {str(e)}")
            raise e
        finally:
            con.close()

    @staticmethod
    def execute_query_to_dataframe_federated(
        query: str,
        sources: List[QuerySource],
        user: User,
        db: Session,
        max_rows: int = 100000,
    ) -> pd.DataFrame:
        """Execute a federated query in DuckDB and return a DataFrame.

        This intentionally forces federated mode (DuckDB) so we can register datasets/connections
        uniformly and apply a safety row cap.
        """
        con = duckdb.connect(database=':memory:')
        try:
            for source in sources:
                if source.type == "dataset":
                    QueryService._register_dataset(con, source, user, db)
                elif source.type == "connection":
                    QueryService._register_connection(con, source, user, db)
                else:
                    raise ValueError(f"Unknown source type: {source.type}")

            sanitized_query = QueryService._strip_trailing_semicolons(query)
            limited_query = sanitized_query
            if max_rows and max_rows > 0:
                limited_query = f"SELECT * FROM ({sanitized_query}) AS __q LIMIT {int(max_rows)}"

            df = con.execute(limited_query).df()
            df = df.where(pd.notnull(df), None)
            return df
        finally:
            con.close()

    @staticmethod
    def _execute_direct_query(connection_id: str, query: str, sources: List[QuerySource], user: User, db: Session, start_time: float, page: int = 1, page_size: int = 100) -> QueryResult:
        """Execute query directly on the source database (Passthrough) with pagination"""
        connection = ConnectionService.get_connection_by_id(connection_id, user, db)
        if not connection:
            raise ValueError(f"Connection {connection_id} not found")
            
        # Rewrite query to remove UI aliases (e.g. "postgresql.orders" -> "orders")
        # This is necessary because the underlying DB doesn't know about our UI aliases.
        # Sort sources by alias length desc to avoid partial replacements
        sorted_sources = sorted(sources, key=lambda s: len(s.alias), reverse=True)
        for source in sorted_sources:
            if source.alias and source.source_identifier:
                # Case-insensitive replacement of alias with source_identifier
                # We use regex to ensure we match the full alias
                pattern = re.compile(re.escape(source.alias), re.IGNORECASE)
                query = pattern.sub(source.source_identifier, query)

        # We need a dummy source identifier to init the connector, but for raw query it might not matter
        # depending on connector impl. Most connectors need DB name etc which are in connection.credentials
        # We'll pass "dummy" as table name if needed.
        connector = QueryService._get_connector_for_connection(connection, "dummy_table")
        
        if not connector.connect():
            raise Exception(f"Failed to connect to {connection.name}")
            
        try:
            # Execute directly
            result_df = connector.execute_query(query)
            
            total_rows = len(result_df)
            
            # Apply pagination
            offset = (page - 1) * page_size
            paginated_df = result_df.iloc[offset:offset + page_size]
            
            # Format results
            paginated_df = paginated_df.where(pd.notnull(paginated_df), None)
            
            execution_time = (time.time() - start_time) * 1000
            
            return QueryResult(
                columns=paginated_df.columns.tolist(),
                rows=paginated_df.to_dict('records'),
                row_count=total_rows,
                execution_time_ms=execution_time,
                page=page,
                page_size=page_size,
                total_pages=math.ceil(total_rows / page_size) if total_rows > 0 else 0
            )
        finally:
            connector.disconnect()

    @staticmethod
    def _ensure_schema_exists(con, alias: str):
        """Create schema if the alias contains a dot (e.g. 'mysql_db.users')"""
        if "." in alias:
            schema = alias.split(".")[0]
            # Use double quotes to handle special characters in schema name
            con.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')

    @staticmethod
    def _register_dataset(con, source: QuerySource, user: User, db: Session):
        """Register a local Parquet dataset as a view"""
        dataset = DatasetService.get_dataset_by_id(source.id, user, db)
        if not dataset:
            raise ValueError(f"Dataset {source.id} not found")
            
        # Ensure Parquet exists (using the helper we added earlier)
        parquet_path = dataset.schema_info.get("parquet_path") if dataset.schema_info else None
        
        if not parquet_path:
            # Trigger conversion if missing
            parquet_path = DatasetService._convert_to_parquet(dataset)
            
        QueryService._ensure_schema_exists(con, source.alias)
        
        # Properly quote schema and table
        if "." in source.alias:
            schema, table = source.alias.split(".", 1)
            view_name = f'"{schema}"."{table}"'
        else:
            view_name = f'"{source.alias}"'
            
        con.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM '{parquet_path}'")

    @staticmethod
    def _register_connection(con, source: QuerySource, user: User, db: Session):
        """
        Fetch data from a remote connection and register as a table.
        WARNING: This fetches data into memory. For large tables, this needs limits.
        """
        connection = ConnectionService.get_connection_by_id(source.id, user, db)
        if not connection:
            raise ValueError(f"Connection {source.id} not found")
            
        if not source.source_identifier:
            raise ValueError(f"Source identifier (table/collection) required for connection {source.alias}")

        # Use the appropriate connector to fetch data
        connector = QueryService._get_connector_for_connection(connection, source.source_identifier)
        
        if not connector.connect():
            raise Exception(f"Failed to connect to {source.alias}")
            
        try:
            # Fetch data (Limit to 100k rows for safety in this V1)
            df = connector.fetch_data(limit=100000)
            
            QueryService._ensure_schema_exists(con, source.alias)
            
            # Register with a temp name first to avoid issues with dot notation in register()
            # Use a safe temp name
            temp_name = f"temp_{source.id.replace('-', '_')}_{int(time.time())}"
            con.register(temp_name, df)
            
            # Create the view with the proper alias, quoting schema and table
            if "." in source.alias:
                schema, table = source.alias.split(".", 1)
                view_name = f'"{schema}"."{table}"'
            else:
                view_name = f'"{source.alias}"'
            
            con.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM {temp_name}")
            
        finally:
            connector.disconnect()

    @staticmethod
    def _get_connector_for_connection(connection: Connection, source_identifier: str):
        """Factory to get connector for a live connection"""
        from ..models.connection import SourceType
        
        # Import connectors here to avoid circular imports if any
        from ..connectors.postgresql_connector import PostgreSQLConnector
        from ..connectors.mongodb_connector import MongoDBConnector
        # Add others as needed
        
        if connection.source_type == SourceType.POSTGRESQL:
            return PostgreSQLConnector(
                host=connection.credentials.get('host'),
                port=connection.credentials.get('port'),
                database=connection.credentials.get('database'),
                username=connection.credentials.get('username'),
                password=connection.credentials.get('password'),
                table=source_identifier
            )
        elif connection.source_type == SourceType.MONGODB:
            return MongoDBConnector(
                connection_string=connection.credentials.get('connection_string'),
                database=connection.credentials.get('database'),
                collection=source_identifier
            )
        elif connection.source_type == SourceType.MYSQL:
             from ..connectors.mysql_connector import MySQLConnector
             return MySQLConnector(
                host=connection.credentials.get('host'),
                port=connection.credentials.get('port'),
                database=connection.credentials.get('database'),
                username=connection.credentials.get('username'),
                password=connection.credentials.get('password'),
                table=source_identifier
             )
        # Add other connectors...
        else:
            raise ValueError(f"Querying source type {connection.source_type} is not yet supported in federation.")

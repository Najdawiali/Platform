# backend/app/connectors/postgresql_connector.py
import pandas as pd
from typing import Dict, Any, Optional, List, Generator
from .base import BaseConnector
import psycopg2
from psycopg2 import Error
from psycopg2.extras import RealDictCursor


class PostgreSQLConnector(BaseConnector):
    """
    Connector for PostgreSQL databases
    
    Supports:
    - PostgreSQL connection with credentials
    - Database and table/schema listing
    - Schema inference from table structure
    - Data streaming with chunking
    """

    def __init__(
            self,
            host: str,
            port: int,
            database: str,
            username: str,
            password: Optional[str] = None,
            schema: str = "public",
            table: Optional[str] = None,
            **kwargs
    ):
        """
        Initialize PostgreSQL connector
        
        Args:
            host: PostgreSQL server host
            port: PostgreSQL server port
            database: Database name
            username: PostgreSQL username
            password: PostgreSQL password (optional)
            schema: Schema name (default: public)
            table: Table name (optional, can be set later)
        """
        super().__init__(f"postgresql://{host}:{port}/{database}", **kwargs)
        
        self.host = host
        self.port = port
        self.database_name = database
        self.username = username
        self.password = password or ''
        self.schema_name = schema
        self.table_name = table
        
        self.connection = None
        self.cursor = None

    def connect(self) -> bool:
        """Establish connection to PostgreSQL"""
        try:
            self.connection = psycopg2.connect(
                host=self.host,
                port=self.port,
                database=self.database_name,
                user=self.username,
                password=self.password,
                connect_timeout=10
            )
            
            if self.connection:
                self.cursor = self.connection.cursor(cursor_factory=RealDictCursor)
                self.is_connected = True
                return True
            
            return False

        except Error as e:
            print(f"PostgreSQL connection failed: {e}")
            self.is_connected = False
            return False
        except Exception as e:
            print(f"Error connecting to PostgreSQL: {e}")
            self.is_connected = False
            return False

    def disconnect(self) -> bool:
        """Close PostgreSQL connection"""
        try:
            if self.cursor:
                self.cursor.close()
                self.cursor = None
            
            if self.connection:
                self.connection.close()
                self.connection = None
            
            self.is_connected = False
            return True
        except Exception as e:
            print(f"Error disconnecting from PostgreSQL: {e}")
            return False

    def execute_query(self, query: str) -> pd.DataFrame:
        """Execute raw SQL query"""
        if not self.is_connected:
            if not self.connect():
                raise Exception("Not connected to PostgreSQL")
        
        try:
            # Use pandas read_sql for convenience
            return pd.read_sql(query, self.connection)
        except Exception as e:
            raise Exception(f"Query execution failed: {e}")

    def test_connection(self) -> Dict[str, Any]:
        """Test PostgreSQL connection without storing it"""
        try:
            test_conn = psycopg2.connect(
                host=self.host,
                port=self.port,
                database=self.database_name,
                user=self.username,
                password=self.password,
                connect_timeout=10
            )
            
            cursor = test_conn.cursor()
            cursor.execute("SELECT version();")
            version_info = cursor.fetchone()[0]
            
            cursor.close()
            test_conn.close()
            
            return {
                "status": "success",
                "message": f"Successfully connected to PostgreSQL",
                "details": {
                    "version": version_info,
                    "database": self.database_name,
                    "host": self.host
                }
            }

        except Error as e:
            return {
                "status": "failed",
                "message": f"Connection failed: {str(e)}",
                "details": None
            }
        except Exception as e:
            return {
                "status": "failed",
                "message": f"Error: {str(e)}",
                "details": None
            }

    def list_tables(self) -> List[str]:
        """List all tables in the current schema"""
        if not self.is_connected:
            if not self.connect():
                return []

        try:
            query = """
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = %s 
                AND table_type = 'BASE TABLE'
                ORDER BY table_name;
            """
            
            self.cursor.execute(query, (self.schema_name,))
            results = self.cursor.fetchall()
            
            return [row['table_name'] for row in results]

        except Error as e:
            print(f"Error listing tables: {e}")
            return []
        except Exception as e:
            print(f"Error listing tables: {e}")
            return []

    def list_schemas(self) -> List[str]:
        """List all schemas in the database"""
        if not self.is_connected:
            if not self.connect():
                return []

        try:
            query = """
                SELECT schema_name 
                FROM information_schema.schemata 
                WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY schema_name;
            """
            
            self.cursor.execute(query)
            results = self.cursor.fetchall()
            
            return [row['schema_name'] for row in results]

        except Error as e:
            print(f"Error listing schemas: {e}")
            return []
        except Exception as e:
            print(f"Error listing schemas: {e}")
            return []
    
    def get_databases(self) -> List[str]:
        """Get list of all databases on the PostgreSQL server"""
        if not self.is_connected:
            if not self.connect():
                return []

        try:
            query = """
                SELECT datname 
                FROM pg_database 
                WHERE datistemplate = false 
                AND datname NOT IN ('postgres')
                ORDER BY datname;
            """
            
            self.cursor.execute(query)
            results = self.cursor.fetchall()
            
            return [row['datname'] for row in results]

        except Error as e:
            print(f"Error listing databases: {e}")
            return []
        except Exception as e:
            print(f"Error listing databases: {e}")
            return []
    
    def get_databases_with_tables(self) -> Dict[str, List[str]]:
        """Get all databases with their tables (schemas in PostgreSQL terms)"""
        if not self.is_connected:
            if not self.connect():
                return {}

        try:
            # For PostgreSQL, we'll treat schemas as "databases" for user clarity
            # Get all schemas and their tables
            schemas = self.list_schemas()
            result = {}
            
            for schema in schemas:
                query = """
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = %s 
                    AND table_type = 'BASE TABLE'
                    ORDER BY table_name;
                """
                
                self.cursor.execute(query, (schema,))
                results = self.cursor.fetchall()
                tables = [row['table_name'] for row in results]
                result[schema] = tables
            
            return result

        except Error as e:
            print(f"Error fetching databases with tables: {e}")
            return {}
        except Exception as e:
            print(f"Error fetching databases with tables: {e}")
            return {}

    def infer_schema(self, table_name: Optional[str] = None) -> Dict[str, str]:
        """
        Infer schema from PostgreSQL table
        
        Returns:
            Dict mapping column names to data types
        """
        table = table_name or self.table_name
        
        if not table:
            raise ValueError("No table name provided")

        if not self.is_connected:
            if not self.connect():
                return {}

        try:
            query = """
                SELECT 
                    column_name, 
                    data_type,
                    character_maximum_length,
                    numeric_precision,
                    numeric_scale
                FROM information_schema.columns 
                WHERE table_schema = %s 
                AND table_name = %s
                ORDER BY ordinal_position;
            """
            
            self.cursor.execute(query, (self.schema_name, table))
            columns = self.cursor.fetchall()
            
            schema = {}
            for col in columns:
                col_name = col['column_name']
                data_type = col['data_type']
                
                # Map PostgreSQL types to generic types
                if data_type in ('integer', 'bigint', 'smallint'):
                    schema[col_name] = 'integer'
                elif data_type in ('numeric', 'decimal', 'real', 'double precision'):
                    schema[col_name] = 'float'
                elif data_type in ('boolean',):
                    schema[col_name] = 'boolean'
                elif data_type in ('date', 'timestamp', 'timestamp without time zone', 'timestamp with time zone'):
                    schema[col_name] = 'datetime'
                else:
                    schema[col_name] = 'string'

            return schema

        except Error as e:
            print(f"Error inferring schema: {e}")
            return {}
        except Exception as e:
            print(f"Error inferring schema: {e}")
            return {}

    def get_sample_data(self, table_name: Optional[str] = None, limit: int = 100) -> pd.DataFrame:
        """
        Get sample data from a PostgreSQL table
        
        Args:
            table_name: Name of the table
            limit: Maximum number of rows to return
            
        Returns:
            DataFrame with sample data
        """
        table = table_name or self.table_name
        
        if not table:
            raise ValueError("No table name provided")

        if not self.is_connected:
            if not self.connect():
                return pd.DataFrame()

        try:
            # Use parameterized query for schema/table - but identifiers need special handling
            query = f"""
                SELECT * 
                FROM {psycopg2.extensions.quote_ident(self.schema_name, self.connection)}.{psycopg2.extensions.quote_ident(table, self.connection)}
                LIMIT %s;
            """
            
            self.cursor.execute(query, (limit,))
            rows = self.cursor.fetchall()
            
            if not rows:
                return pd.DataFrame()
            
            # Convert to DataFrame
            df = pd.DataFrame([dict(row) for row in rows])
            
            return df

        except Error as e:
            print(f"Error fetching sample data: {e}")
            return pd.DataFrame()
        except Exception as e:
            print(f"Error fetching sample data: {e}")
            return pd.DataFrame()

    def fetch_data(
            self,
            limit: Optional[int] = None,
            offset: int = 0,
            table_name: Optional[str] = None,
            query: Optional[str] = None
    ) -> pd.DataFrame:
        """
        Fetch data from PostgreSQL table
        
        Args:
            limit: Maximum number of rows to fetch
            offset: Number of rows to skip
            table_name: Name of the table (optional override)
            query: Optional custom SQL query
            
        Returns:
            DataFrame with requested data
        """
        table = table_name or self.table_name
        
        if not query and not table:
            raise ValueError("Either table_name or query must be provided")

        if not self.is_connected:
            if not self.connect():
                return pd.DataFrame()

        try:
            if query:
                sql_query = query
            else:
                sql_query = f"""
                    SELECT * 
                    FROM {psycopg2.extensions.quote_ident(self.schema_name, self.connection)}.{psycopg2.extensions.quote_ident(table, self.connection)}
                """
            
            # Add LIMIT and OFFSET if provided and not already in query
            # Note: This is a simple check, might need more robust parsing for complex queries
            if limit is not None and "LIMIT" not in sql_query.upper():
                sql_query += f" LIMIT {limit}"
            
            if offset > 0 and "OFFSET" not in sql_query.upper():
                sql_query += f" OFFSET {offset}"
                
            self.cursor.execute(sql_query)
            rows = self.cursor.fetchall()
            
            if not rows:
                return pd.DataFrame()
            
            df = pd.DataFrame([dict(row) for row in rows])
            return df

        except Error as e:
            print(f"Error fetching data: {e}")
            return pd.DataFrame()
        except Exception as e:
            print(f"Error fetching data: {e}")
            return pd.DataFrame()

    def fetch_data_chunked(
            self,
            chunk_size: int = 10000,
            table_name: Optional[str] = None,
            query: Optional[str] = None
    ) -> Generator[pd.DataFrame, None, None]:
        """
        Fetch data from PostgreSQL table in chunks
        
        Args:
            chunk_size: Number of rows per chunk
            table_name: Name of the table
            query: Optional custom SQL query
            
        Yields:
            DataFrame chunks
        """
        table = table_name or self.table_name
        
        if not query and not table:
            raise ValueError("Either table_name or query must be provided")

        if not self.is_connected:
            if not self.connect():
                return

        try:
            if query:
                sql_query = query
            else:
                sql_query = f"""
                    SELECT * 
                    FROM {psycopg2.extensions.quote_ident(self.schema_name, self.connection)}.{psycopg2.extensions.quote_ident(table, self.connection)};
                """
            
            self.cursor.execute(sql_query)
            
            while True:
                rows = self.cursor.fetchmany(chunk_size)
                
                if not rows:
                    break
                
                df = pd.DataFrame([dict(row) for row in rows])
                yield df

        except Error as e:
            print(f"Error fetching data: {e}")
            return
        except Exception as e:
            print(f"Error fetching data: {e}")
            return

    def get_metadata(self) -> Dict[str, Any]:
        """Get metadata about the PostgreSQL connection and selected table"""
        metadata = {
            "source_type": "postgresql",
            "host": self.host,
            "port": self.port,
            "database": self.database_name,
            "schema": self.schema_name,
            "connected": self.is_connected
        }

        if self.table_name and self.is_connected:
            try:
                # Get row count
                query = f"""
                    SELECT COUNT(*) as count 
                    FROM {psycopg2.extensions.quote_ident(self.schema_name, self.connection)}.{psycopg2.extensions.quote_ident(self.table_name, self.connection)};
                """
                self.cursor.execute(query)
                result = self.cursor.fetchone()
                metadata["table"] = self.table_name
                metadata["row_count"] = result['count'] if result else 0
                metadata["schema"] = self.infer_schema()

            except Exception as e:
                print(f"Error getting metadata: {e}")
                metadata["error"] = str(e)

        return metadata

    def get_schema(self) -> Dict[str, Any]:
        """Get schema information for the current table (required by BaseConnector)"""
        if not self.is_connected:
            raise Exception("Not connected to PostgreSQL. Call connect() first.")
        
        if not self.table_name:
            raise Exception("No table specified. Set table_name first.")
        
        try:
            # Get column information
            query = """
                SELECT 
                    column_name, 
                    data_type,
                    is_nullable,
                    column_default,
                    character_maximum_length
                FROM information_schema.columns 
                WHERE table_schema = %s 
                AND table_name = %s
                ORDER BY ordinal_position;
            """
            
            self.cursor.execute(query, (self.schema_name, self.table_name))
            columns_info = self.cursor.fetchall()
            
            # Get row count
            count_query = f"""
                SELECT COUNT(*) as count 
                FROM {psycopg2.extensions.quote_ident(self.schema_name, self.connection)}.{psycopg2.extensions.quote_ident(self.table_name, self.connection)};
            """
            self.cursor.execute(count_query)
            row_count = self.cursor.fetchone()['count']
            
            columns = []
            for col in columns_info:
                columns.append({
                    "name": col['column_name'],
                    "type": col['data_type'],
                    "nullable": col['is_nullable'] == 'YES',
                    "default": col['column_default']
                })
            
            return {
                "table": self.table_name,
                "schema": self.schema_name,
                "row_count": row_count,
                "column_count": len(columns),
                "columns": columns
            }
        except Error as e:
            raise Exception(f"Error getting schema: {str(e)}")

    def get_row_count(self) -> int:
        """Get total number of rows in the current table"""
        if not self.is_connected:
            raise Exception("Not connected to PostgreSQL. Call connect() first.")
        
        if not self.table_name:
            raise Exception("No table specified. Set table_name first.")
        
        try:
            query = f"""
                SELECT COUNT(*) as count 
                FROM {psycopg2.extensions.quote_ident(self.schema_name, self.connection)}.{psycopg2.extensions.quote_ident(self.table_name, self.connection)};
            """
            self.cursor.execute(query)
            result = self.cursor.fetchone()
            return result['count'] if result else 0
        except Error as e:
            print(f"Error getting row count: {e}")
            return 0

    def fetch_data_chunked(self, chunk_size: int = 10000) -> Generator[pd.DataFrame, None, None]:
        """
        Fetch data in chunks as a generator (required by BaseConnector)
        
        Args:
            chunk_size: Number of rows per chunk
            
        Yields:
            DataFrame chunks
        """
        if not self.is_connected:
            raise Exception("Not connected to PostgreSQL. Call connect() first.")
        
        if not self.table_name:
            raise Exception("No table specified. Set table_name first.")
        
        try:
            for chunk_df in self.fetch_data(table_name=self.table_name, chunk_size=chunk_size):
                yield chunk_df
        except Error as e:
            raise Exception(f"Error fetching data chunks: {str(e)}")

    def validate_source(self) -> Dict[str, Any]:
        """Validate PostgreSQL table structure and data"""
        if not self.is_connected:
            return {
                "valid": False,
                "errors": ["Not connected to PostgreSQL"]
            }
        
        if not self.table_name:
            return {
                "valid": False,
                "errors": ["No table specified"]
            }
        
        try:
            schema = self.get_schema()
            sample_data = self.get_sample_data(self.table_name, limit=5)
            
            return {
                "valid": True,
                "row_count": schema["row_count"],
                "column_count": schema["column_count"],
                "columns": [col["name"] for col in schema["columns"]],
                "sample_preview": sample_data.head().to_dict('records') if not sample_data.empty else []
            }
        except Exception as e:
            return {
                "valid": False,
                "errors": [str(e)]
            }

    def __repr__(self) -> str:
        return f"PostgreSQLConnector(host={self.host}, database={self.database_name}, schema={self.schema_name}, table={self.table_name})"

# backend/app/connectors/mysql_connector.py
import pandas as pd
from typing import Dict, Any, Optional, List, Generator
from .base import BaseConnector
import mysql.connector
from mysql.connector import Error


class MySQLConnector(BaseConnector):
    """
    Connector for MySQL databases
    
    Supports:
    - MySQL connection with credentials
    - Database and table listing
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
            table: Optional[str] = None,
            **kwargs
    ):
        """
        Initialize MySQL connector
        
        Args:
            host: MySQL server host
            port: MySQL server port
            database: Database name
            username: MySQL username
            password: MySQL password (optional)
            table: Table name (optional, can be set later)
        """
        super().__init__(f"mysql://{host}:{port}/{database}", **kwargs)
        
        self.host = host
        self.port = port
        self.database_name = database
        self.username = username
        self.password = password or ''
        self.table_name = table
        
        self.connection = None
        self.cursor = None

    def connect(self) -> bool:
        """Establish connection to MySQL"""
        try:
            self.connection = mysql.connector.connect(
                host=self.host,
                port=self.port,
                database=self.database_name,
                user=self.username,
                password=self.password,
                connection_timeout=10
            )
            
            if self.connection.is_connected():
                self.cursor = self.connection.cursor(dictionary=True)
                self.is_connected = True
                return True
            
            return False

        except Error as e:
            print(f"MySQL connection failed: {e}")
            self.is_connected = False
            return False
        except Exception as e:
            print(f"Error connecting to MySQL: {e}")
            self.is_connected = False
            return False

    def disconnect(self) -> bool:
        """Close MySQL connection"""
        try:
            if self.cursor:
                self.cursor.close()
                self.cursor = None
            
            if self.connection and self.connection.is_connected():
                self.connection.close()
                self.connection = None
            
            self.is_connected = False
            return True
        except Exception as e:
            print(f"Error disconnecting from MySQL: {e}")
            return False

    def test_connection(self) -> Dict[str, Any]:
        """Test MySQL connection without storing it"""
        try:
            if not self.connect():
                return {
                    "success": False,
                    "message": "Failed to connect to MySQL server"
                }
            
            # Get list of tables
            tables = self.get_tables()
            
            self.disconnect()
            
            return {
                "success": True,
                "message": f"Successfully connected to MySQL database '{self.database_name}'",
                "tables": tables,
                "table_count": len(tables)
            }

        except Exception as e:
            self.disconnect()
            return {
                "success": False,
                "message": f"Connection test failed: {str(e)}"
            }

    def get_tables(self) -> List[str]:
        """Get list of all tables in the database"""
        if not self.is_connected:
            raise Exception("Not connected to MySQL. Call connect() first.")
        
        try:
            self.cursor.execute("SHOW TABLES")
            results = self.cursor.fetchall()
            
            # Extract table names from results
            # Result format is: [{'Tables_in_dbname': 'table1'}, ...]
            # MySQL returns the key with lowercase database name
            if results:
                # Get the actual key from the first result
                table_key = list(results[0].keys())[0]
                tables = [row[table_key] for row in results]
                return sorted(tables)
            
            return []
        except Error as e:
            print(f"Error fetching tables: {e}")
            return []

    def get_schema(self) -> Dict[str, Any]:
        """Get schema information for the current table"""
        if not self.is_connected:
            raise Exception("Not connected to MySQL. Call connect() first.")
        
        if not self.table_name:
            raise Exception("No table specified. Set table_name first.")
        
        try:
            # Get column information
            self.cursor.execute(f"DESCRIBE `{self.table_name}`")
            columns_info = self.cursor.fetchall()
            
            # Get row count
            self.cursor.execute(f"SELECT COUNT(*) as count FROM `{self.table_name}`")
            row_count = self.cursor.fetchone()['count']
            
            columns = []
            for col in columns_info:
                columns.append({
                    "name": col['Field'],
                    "type": col['Type'],
                    "nullable": col['Null'] == 'YES',
                    "key": col['Key'],
                    "default": col['Default']
                })
            
            return {
                "table": self.table_name,
                "row_count": row_count,
                "column_count": len(columns),
                "columns": columns
            }
        except Error as e:
            raise Exception(f"Error getting schema: {str(e)}")

    def get_row_count(self) -> int:
        """Get total number of rows in the current table"""
        if not self.is_connected:
            raise Exception("Not connected to MySQL. Call connect() first.")
        
        if not self.table_name:
            raise Exception("No table specified. Set table_name first.")
        
        try:
            self.cursor.execute(f"SELECT COUNT(*) as count FROM `{self.table_name}`")
            result = self.cursor.fetchone()
            return result['count']
        except Error as e:
            print(f"Error getting row count: {e}")
            return 0

    def fetch_data(self, limit: int = 1000, offset: int = 0) -> pd.DataFrame:
        """
        Fetch data from MySQL table with pagination
        
        Args:
            limit: Maximum number of rows to fetch
            offset: Number of rows to skip
            
        Returns:
            pandas DataFrame containing the data
        """
        if not self.is_connected:
            raise Exception("Not connected to MySQL. Call connect() first.")
        
        if not self.table_name:
            raise Exception("No table specified. Set table_name first.")
        
        try:
            query = f"SELECT * FROM `{self.table_name}` LIMIT {limit} OFFSET {offset}"
            self.cursor.execute(query)
            rows = self.cursor.fetchall()
            
            if not rows:
                return pd.DataFrame()
            
            df = pd.DataFrame(rows)
            return df
        except Error as e:
            raise Exception(f"Error fetching data: {str(e)}")

    def execute_query(self, query: str) -> pd.DataFrame:
        """Execute a custom SQL query and return results as DataFrame"""
        if not self.is_connected:
            raise Exception("Not connected to MySQL. Call connect() first.")
        
        try:
            self.cursor.execute(query)
            rows = self.cursor.fetchall()
            
            if not rows:
                return pd.DataFrame()
            
            df = pd.DataFrame(rows)
            return df
        except Error as e:
            raise Exception(f"Error executing query: {str(e)}")

    def get_sample_data(self, n: int = 5) -> pd.DataFrame:
        """Get sample data from the table"""
        return self.fetch_data(limit=n, offset=0)

    def fetch_data_chunked(self, chunk_size: int = 10000) -> Generator[pd.DataFrame, None, None]:
        """
        Fetch data in chunks as a generator
        
        Args:
            chunk_size: Number of rows per chunk
            
        Yields:
            DataFrame chunks
        """
        if not self.is_connected:
            raise Exception("Not connected to MySQL. Call connect() first.")
        
        if not self.table_name:
            raise Exception("No table specified. Set table_name first.")
        
        try:
            total_rows = self.get_row_count()
            offset = 0
            
            while offset < total_rows:
                df = self.fetch_data(limit=chunk_size, offset=offset)
                if df.empty:
                    break
                yield df
                offset += chunk_size
        except Error as e:
            raise Exception(f"Error fetching data chunks: {str(e)}")

    def validate_source(self) -> Dict[str, Any]:
        """Validate MySQL table structure and data"""
        return self.validate_data()

    def validate_data(self) -> Dict[str, Any]:
        """Validate MySQL table structure and data"""
        if not self.is_connected:
            return {
                "valid": False,
                "errors": ["Not connected to MySQL"]
            }
        
        if not self.table_name:
            return {
                "valid": False,
                "errors": ["No table specified"]
            }
        
        try:
            schema = self.get_schema()
            sample_data = self.get_sample_data()
            
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

# backend/app/connectors/json_connector.py
import os
import pandas as pd
import polars as pl
from typing import Optional, Dict, Any, Generator
from .base import BaseConnector


class JSONConnector(BaseConnector):
    """
    Connector for JSON files
    Supports both JSON arrays and newline-delimited JSON (NDJSON)
    """

    def __init__(self, file_path: str, chunk_size: Optional[int] = None):
        """
        Initialize JSON connector

        Args:
            file_path: Path to the JSON file
            chunk_size: Optional chunk size for reading large files
        """
        super().__init__(file_path)
        self.file_path = file_path
        self.chunk_size = chunk_size or 10000
        self.df: Optional[pd.DataFrame] = None
        self.total_rows: int = 0
        self.is_ndjson: bool = False

    def connect(self) -> bool:
        """Test if file exists and is readable"""
        try:
            if not os.path.exists(self.file_path):
                return False
            
            if not os.path.isfile(self.file_path):
                return False

            # Detect if it's NDJSON
            with open(self.file_path, 'r') as f:
                first_line = f.readline().strip()
                second_line = f.readline().strip()
            
            self.is_ndjson = first_line.startswith('{') and second_line.startswith('{')
            
            # Count rows
            if self.is_ndjson:
                with open(self.file_path, 'r') as f:
                    self.total_rows = sum(1 for _ in f)
            else:
                # For JSON array, need to load to count
                df_temp = pl.read_json(self.file_path)
                self.total_rows = len(df_temp)
            
            self.is_connected = True
            return True

        except Exception as e:
            print(f"Connection test failed: {str(e)}")
            return False

    def fetch_data(self, limit: Optional[int] = None, offset: int = 0) -> pd.DataFrame:
        """
        Fetch data from JSON file with pagination

        Args:
            limit: Maximum number of rows to fetch
            offset: Number of rows to skip

        Returns:
            Pandas DataFrame
        """
        try:
            if self.is_ndjson:
                df = pl.read_ndjson(self.file_path)
            else:
                df = pl.read_json(self.file_path)

            # Apply offset and limit
            if offset > 0:
                df = df.slice(offset, len(df))
            
            if limit is not None:
                df = df.head(limit)

            # Convert to pandas for compatibility
            return df.to_pandas()

        except Exception as e:
            print(f"Failed to fetch JSON data: {str(e)}")
            raise

    def fetch_data_chunked(self, chunk_size: int = 10000) -> Generator[pd.DataFrame, None, None]:
        """
        Fetch data in chunks as a generator

        Args:
            chunk_size: Number of rows per chunk

        Yields:
            DataFrame chunks
        """
        try:
            # Load full data first
            if self.is_ndjson:
                df = pl.read_ndjson(self.file_path)
            else:
                df = pl.read_json(self.file_path)

            # Yield in chunks
            total_rows = len(df)
            for start in range(0, total_rows, chunk_size):
                end = min(start + chunk_size, total_rows)
                chunk = df.slice(start, end - start)
                yield chunk.to_pandas()

        except Exception as e:
            print(f"Failed to fetch chunked data: {str(e)}")
            raise

    def get_row_count(self) -> int:
        """
        Get total number of rows in JSON file

        Returns:
            Total row count
        """
        return self.total_rows

    def validate_source(self) -> Dict[str, Any]:
        """
        Validate JSON file structure and content

        Returns:
            Dictionary with validation results
        """
        validation_result = {
            "is_valid": True,
            "errors": [],
            "warnings": []
        }

        try:
            if not self.is_connected:
                self.connect()

            # Try to read first few rows
            df = self.fetch_data(limit=100)

            if len(df) == 0:
                validation_result["is_valid"] = False
                validation_result["errors"].append("JSON file is empty")
                return validation_result

            if len(df.columns) == 0:
                validation_result["is_valid"] = False
                validation_result["errors"].append("No columns found in JSON")
                return validation_result

            return validation_result

        except Exception as e:
            validation_result["is_valid"] = False
            validation_result["errors"].append(f"Validation error: {str(e)}")
            return validation_result

    def get_schema(self) -> Dict[str, Any]:
        """
        Get schema information from the JSON file

        Returns:
            Dictionary with schema details
        """
        try:
            # Read a small sample to infer schema
            df_pandas = self.fetch_data(limit=100)

            columns = []
            for col_name in df_pandas.columns:
                col_type = str(df_pandas[col_name].dtype)
                columns.append({
                    'name': col_name,
                    'type': col_type,
                    'nullable': bool(df_pandas[col_name].isnull().any())  # Convert numpy bool_ to Python bool
                })

            schema = {
                'columns': columns,
                'row_count': int(self.total_rows),  # Convert to native Python int
                'column_count': int(len(df_pandas.columns)),  # Convert to native Python int
                'format': 'json'
            }

            return schema

        except Exception as e:
            print(f"Failed to get schema: {str(e)}")
            raise

    def disconnect(self) -> bool:
        """Cleanup resources"""
        self.df = None
        self.is_connected = False
        return True

    def validate_credentials(self, credentials: Dict[str, Any]) -> bool:
        """
        Validate JSON file credentials (just file path)

        Args:
            credentials: Dictionary with file_path

        Returns:
            True if valid
        """
        try:
            file_path = credentials.get('file_path')
            if not file_path:
                return False

            import os
            return os.path.exists(file_path) and os.path.isfile(file_path)

        except Exception as e:
            self.logger.error(f"Credential validation failed: {str(e)}")
            return False

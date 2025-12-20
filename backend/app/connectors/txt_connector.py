# backend/app/connectors/txt_connector.py
import os
import pandas as pd
from typing import Dict, Any, Optional, Generator
from .base import BaseConnector


class TXTConnector(BaseConnector):
    """
    Connector for TXT files
    Supports tab-delimited, space-delimited, and other common text formats
    """

    def __init__(self, file_path: str, chunk_size: Optional[int] = None, delimiter: str = '\t'):
        """
        Initialize TXT connector

        Args:
            file_path: Path to the TXT file
            chunk_size: Optional chunk size for reading large files
            delimiter: Delimiter to use (default: tab)
        """
        super().__init__(file_path)
        self.file_path = file_path
        self.chunk_size = chunk_size or 10000
        self.delimiter = delimiter
        self.df: Optional[pd.DataFrame] = None
        self.total_rows: int = 0
        self.encoding: Optional[str] = None

    def _detect_encoding(self) -> str:
        """Detect file encoding"""
        import chardet
        try:
            with open(self.file_path, 'rb') as f:
                result = chardet.detect(f.read(100000))
                return result['encoding'] or 'utf-8'
        except:
            return 'utf-8'

    def _detect_delimiter(self) -> str:
        """Auto-detect delimiter from first few lines"""
        try:
            with open(self.file_path, 'r', encoding=self.encoding) as f:
                first_line = f.readline()
                
            # Try common delimiters
            for delim in ['\t', '|', ' ', ',']:
                if delim in first_line:
                    return delim
            
            return '\t'  # Default to tab
        except:
            return '\t'

    def connect(self) -> bool:
        """Load TXT file metadata"""
        try:
            if not os.path.exists(self.file_path):
                return False
            
            if not os.path.isfile(self.file_path):
                return False

            # Detect encoding
            self.encoding = self._detect_encoding()
            
            # Auto-detect delimiter if not specified
            if self.delimiter == '\t':
                self.delimiter = self._detect_delimiter()

            # Read sample to validate
            sample_df = pd.read_csv(
                self.file_path,
                sep=self.delimiter,
                encoding=self.encoding,
                nrows=100,
                engine='python'
            )

            # Count total rows
            with open(self.file_path, 'r', encoding=self.encoding) as f:
                self.total_rows = sum(1 for _ in f) - 1  # Subtract header
            
            self.is_connected = True
            return True

        except Exception as e:
            print(f"Connection test failed: {str(e)}")
            return False

    def disconnect(self) -> bool:
        """Cleanup resources"""
        self.df = None
        self.is_connected = False
        return True

    def fetch_data(self, limit: Optional[int] = None, offset: int = 0) -> pd.DataFrame:
        """
        Fetch data from TXT file with pagination

        Args:
            limit: Maximum number of rows to fetch
            offset: Number of rows to skip

        Returns:
            Pandas DataFrame
        """
        try:
            # Read with offset
            if offset > 0:
                df = pd.read_csv(
                    self.file_path,
                    sep=self.delimiter,
                    encoding=self.encoding,
                    skiprows=range(1, offset + 1),
                    nrows=limit,
                    engine='python'
                )
            else:
                df = pd.read_csv(
                    self.file_path,
                    sep=self.delimiter,
                    encoding=self.encoding,
                    nrows=limit,
                    engine='python'
                )

            return df

        except Exception as e:
            print(f"Failed to fetch TXT data: {str(e)}")
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
            chunks = pd.read_csv(
                self.file_path,
                sep=self.delimiter,
                encoding=self.encoding,
                chunksize=chunk_size,
                engine='python'
            )
            
            for chunk in chunks:
                yield chunk

        except Exception as e:
            print(f"Failed to fetch chunked data: {str(e)}")
            raise

    def get_row_count(self) -> int:
        """
        Get total number of rows in TXT file

        Returns:
            Total row count
        """
        return self.total_rows

    def validate_source(self) -> Dict[str, Any]:
        """
        Validate TXT file structure and content

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
                validation_result["errors"].append("TXT file is empty")
                return validation_result

            if len(df.columns) == 0:
                validation_result["is_valid"] = False
                validation_result["errors"].append("No columns found in TXT file")
                return validation_result

            return validation_result

        except Exception as e:
            validation_result["is_valid"] = False
            validation_result["errors"].append(f"Validation error: {str(e)}")
            return validation_result

    def get_schema(self) -> Dict[str, Any]:
        """
        Get schema information from the TXT file

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
                    'nullable': bool(df_pandas[col_name].isnull().any())
                })

            schema = {
                'columns': columns,
                'row_count': int(self.total_rows),
                'column_count': int(len(df_pandas.columns)),
                'format': 'txt',
                'delimiter': self.delimiter
            }

            return schema

        except Exception as e:
            print(f"Failed to get schema: {str(e)}")
            raise

    def validate_credentials(self, credentials: Dict[str, Any]) -> bool:
        """
        Validate TXT file credentials

        Args:
            credentials: Dictionary with file_path

        Returns:
            True if valid
        """
        try:
            file_path = credentials.get('file_path')
            if not file_path:
                return False

            return os.path.exists(file_path) and os.path.isfile(file_path)

        except Exception as e:
            print(f"Credential validation failed: {str(e)}")
            return False

# backend/app/connectors/mdx_connector.py
import os
import pandas as pd
import re
from typing import Dict, Any, Optional, Generator
from .base import BaseConnector


class MDXConnector(BaseConnector):
    """
    Connector for MDX (Markdown with JSX) files
    Supports markdown tables and converts them to structured data
    Strips JSX components and focuses on data extraction
    """

    def __init__(self, file_path: str, chunk_size: Optional[int] = None):
        """
        Initialize MDX connector

        Args:
            file_path: Path to the MDX file
            chunk_size: Optional chunk size for reading large files
        """
        super().__init__(file_path)
        self.file_path = file_path
        self.chunk_size = chunk_size or 10000
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

    def _strip_jsx_components(self, content: str) -> str:
        """Remove JSX components and focus on markdown content"""
        # Remove import statements
        content = re.sub(r'^import\s+.*?from\s+[\'"].*?[\'"];?\s*$', '', content, flags=re.MULTILINE)
        
        # Remove export statements
        content = re.sub(r'^export\s+.*?$', '', content, flags=re.MULTILINE)
        
        # Remove JSX self-closing tags (e.g., <Component />)
        content = re.sub(r'<[A-Z][a-zA-Z0-9]*\s*\/>', '', content)
        
        # Remove JSX opening and closing tags (e.g., <Component>...</Component>)
        content = re.sub(r'<[A-Z][a-zA-Z0-9]*[^>]*>|<\/[A-Z][a-zA-Z0-9]*>', '', content)
        
        # Remove curly brace expressions {variable}
        content = re.sub(r'\{[^}]+\}', '', content)
        
        return content

    def _extract_markdown_tables(self, content: str) -> pd.DataFrame:
        """Extract tables from markdown content"""
        # Strip JSX components first
        content = self._strip_jsx_components(content)
        
        # Find all markdown tables
        table_pattern = r'\|.+\|[\r\n]+\|[-:\s|]+\|[\r\n]+((?:\|.+\|[\r\n]*)+)'
        matches = re.finditer(table_pattern, content)
        
        dfs = []
        for match in matches:
            table_text = match.group(0)
            lines = [line.strip() for line in table_text.split('\n') if line.strip()]
            
            if len(lines) < 3:
                continue
            
            # Extract header
            headers = [col.strip() for col in lines[0].split('|')[1:-1]]
            
            # Extract data rows (skip separator line)
            data_rows = []
            for line in lines[2:]:
                if '|' in line:
                    row = [col.strip() for col in line.split('|')[1:-1]]
                    if len(row) == len(headers):
                        data_rows.append(row)
            
            if data_rows:
                df = pd.DataFrame(data_rows, columns=headers)
                dfs.append(df)
        
        # If tables found, concatenate them
        if dfs:
            return pd.concat(dfs, ignore_index=True)
        
        # If no tables, create a single-column dataframe with content
        lines = [line.strip() for line in content.split('\n') if line.strip()]
        return pd.DataFrame({'content': lines})

    def connect(self) -> bool:
        """Load MDX file metadata"""
        try:
            if not os.path.exists(self.file_path):
                return False
            
            if not os.path.isfile(self.file_path):
                return False

            # Detect encoding
            self.encoding = self._detect_encoding()

            # Read and parse MDX content
            with open(self.file_path, 'r', encoding=self.encoding) as f:
                content = f.read()
            
            df = self._extract_markdown_tables(content)
            self.total_rows = len(df)
            
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
        Fetch data from MDX file with pagination

        Args:
            limit: Maximum number of rows to fetch
            offset: Number of rows to skip

        Returns:
            Pandas DataFrame
        """
        try:
            with open(self.file_path, 'r', encoding=self.encoding) as f:
                content = f.read()
            
            df = self._extract_markdown_tables(content)
            
            # Apply offset and limit
            if offset > 0:
                df = df.iloc[offset:]
            
            if limit is not None:
                df = df.head(limit)

            return df

        except Exception as e:
            print(f"Failed to fetch MDX data: {str(e)}")
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
            with open(self.file_path, 'r', encoding=self.encoding) as f:
                content = f.read()
            
            df = self._extract_markdown_tables(content)
            
            # Yield in chunks
            total_rows = len(df)
            for start in range(0, total_rows, chunk_size):
                end = min(start + chunk_size, total_rows)
                yield df.iloc[start:end]

        except Exception as e:
            print(f"Failed to fetch chunked data: {str(e)}")
            raise

    def get_row_count(self) -> int:
        """
        Get total number of rows in MDX file

        Returns:
            Total row count
        """
        return self.total_rows

    def validate_source(self) -> Dict[str, Any]:
        """
        Validate MDX file structure and content

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
                validation_result["errors"].append("MDX file has no extractable data")
                return validation_result

            if len(df.columns) == 0:
                validation_result["is_valid"] = False
                validation_result["errors"].append("No columns found in MDX file")
                return validation_result

            return validation_result

        except Exception as e:
            validation_result["is_valid"] = False
            validation_result["errors"].append(f"Validation error: {str(e)}")
            return validation_result

    def get_schema(self) -> Dict[str, Any]:
        """
        Get schema information from the MDX file

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
                'format': 'mdx'
            }

            return schema

        except Exception as e:
            print(f"Failed to get schema: {str(e)}")
            raise

    def validate_credentials(self, credentials: Dict[str, Any]) -> bool:
        """
        Validate MDX file credentials

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

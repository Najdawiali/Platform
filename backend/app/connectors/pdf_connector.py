# backend/app/connectors/pdf_connector.py
import os
import pandas as pd
from typing import Dict, Any, Optional, Generator
from .base import BaseConnector


class PDFConnector(BaseConnector):
    """
    Connector for PDF files
    Extracts tables from PDF documents and converts them to structured data
    """

    def __init__(self, file_path: str, chunk_size: Optional[int] = None):
        """
        Initialize PDF connector

        Args:
            file_path: Path to the PDF file
            chunk_size: Optional chunk size for reading large files
        """
        super().__init__(file_path)
        self.file_path = file_path
        self.chunk_size = chunk_size or 10000
        self.df: Optional[pd.DataFrame] = None
        self.total_rows: int = 0

    def _extract_tables_from_pdf(self) -> pd.DataFrame:
        """Extract tables from PDF using pdfplumber"""
        try:
            import pdfplumber
        except ImportError as e:
            print(f"PDF connector error: pdfplumber not installed - {str(e)}")
            raise ImportError(
                "pdfplumber is required for PDF support. "
                "Install it with: pip install pdfplumber"
            )

        all_tables = []
        
        try:
            with pdfplumber.open(self.file_path) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    # Extract tables from the page
                    tables = page.extract_tables()
                    
                    if tables:
                        for table in tables:
                            if len(table) > 1:  # Need at least header + 1 row
                                # First row is header
                                headers = table[0]
                                data_rows = table[1:]
                                
                                # Clean headers (remove None, empty strings)
                                headers = [str(h).strip() if h else f"Column_{i}" 
                                          for i, h in enumerate(headers)]
                                
                                # Create DataFrame
                                df = pd.DataFrame(data_rows, columns=headers)
                                
                                # Remove rows where all values are None or empty
                                df = df.dropna(how='all')
                                
                                # Clean data - convert None to empty string
                                df = df.fillna('')
                                
                                if len(df) > 0:
                                    all_tables.append(df)
        except Exception as e:
            raise Exception(f"Failed to extract tables from PDF: {str(e)}")

        if not all_tables:
            # If no tables found, try to extract text and create a simple dataframe
            try:
                with pdfplumber.open(self.file_path) as pdf:
                    text_content = []
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            text_content.append(text)
                    
                    if text_content:
                        return pd.DataFrame({'content': text_content})
            except:
                pass
            
            raise Exception("No tables found in PDF file")

        # Concatenate all tables
        return pd.concat(all_tables, ignore_index=True)

    def connect(self) -> bool:
        """Load PDF file metadata"""
        try:
            if not os.path.exists(self.file_path):
                print(f"PDF connector error: File does not exist at {self.file_path}")
                return False
            
            if not os.path.isfile(self.file_path):
                print(f"PDF connector error: Path is not a file: {self.file_path}")
                return False

            # Verify it's a PDF file
            if not self.file_path.lower().endswith('.pdf'):
                print(f"PDF connector error: File is not a PDF: {self.file_path}")
                return False

            # Try to extract tables to verify PDF is readable
            df = self._extract_tables_from_pdf()
            self.total_rows = len(df)
            
            self.is_connected = True
            return True

        except Exception as e:
            print(f"PDF connector error in connect(): {str(e)}")
            import traceback
            traceback.print_exc()
            return False

    def disconnect(self) -> bool:
        """Cleanup resources"""
        self.df = None
        self.is_connected = False
        return True

    def fetch_data(self, limit: Optional[int] = None, offset: int = 0) -> pd.DataFrame:
        """
        Fetch data from PDF file with pagination

        Args:
            limit: Maximum number of rows to fetch
            offset: Number of rows to skip

        Returns:
            Pandas DataFrame
        """
        try:
            df = self._extract_tables_from_pdf()
            
            # Apply offset and limit
            if offset > 0:
                df = df.iloc[offset:]
            
            if limit is not None:
                df = df.head(limit)

            return df

        except Exception as e:
            print(f"Failed to fetch PDF data: {str(e)}")
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
            df = self._extract_tables_from_pdf()
            
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
        Get total number of rows in PDF file

        Returns:
            Total row count
        """
        return self.total_rows

    def validate_source(self) -> Dict[str, Any]:
        """
        Validate PDF file structure and content

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
                validation_result["errors"].append("PDF file has no extractable data")
                return validation_result

            if len(df.columns) == 0:
                validation_result["is_valid"] = False
                validation_result["errors"].append("No columns found in PDF file")
                return validation_result

            return validation_result

        except Exception as e:
            validation_result["is_valid"] = False
            validation_result["errors"].append(f"Validation error: {str(e)}")
            return validation_result

    def get_schema(self) -> Dict[str, Any]:
        """
        Get schema information from the PDF file

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
                'format': 'pdf'
            }

            return schema

        except Exception as e:
            print(f"Failed to get schema: {str(e)}")
            raise

    def validate_credentials(self, credentials: Dict[str, Any]) -> bool:
        """
        Validate PDF file credentials

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

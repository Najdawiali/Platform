# backend/app/connectors/csv_connector.py
import os
import pandas as pd
import chardet
from typing import Dict, Any, Optional, List, Generator
from .base import BaseConnector


class CSVConnector(BaseConnector):
    """Enhanced connector for CSV files with chunking and validation"""

    def __init__(self, file_path: str, chunk_size: int = 10000, **kwargs):
        super().__init__(file_path, **kwargs)
        self.file_path = file_path  # Alias for compatibility
        self.chunk_size = chunk_size
        self.df: Optional[pd.DataFrame] = None
        self.encoding: Optional[str] = None
        self.total_rows: int = 0

    def connect(self) -> bool:
        """Load CSV file metadata without loading full data"""
        try:
            if not os.path.exists(self.file_path):
                raise FileNotFoundError(f"File not found: {self.file_path}")

            # Detect encoding
            self.encoding = self._detect_encoding()

            # Read just the header and first few rows to validate
            sample_df = pd.read_csv(
                self.file_path,
                encoding=self.encoding,
                nrows=100,
                low_memory=False
            )

            # Count total rows efficiently
            self.total_rows = sum(1 for _ in open(self.file_path, 'r', encoding=self.encoding)) - 1

            self.is_connected = True
            return True

        except Exception as e:
            print(f"Error connecting to CSV: {e}")
            self.is_connected = False
            return False

    def disconnect(self) -> bool:
        """Clear DataFrame from memory"""
        self.df = None
        self.is_connected = False
        return True

    def validate_source(self) -> Dict[str, Any]:
        """Alias for validate_file to match base interface"""
        return self.validate_file()

    def validate_file(self) -> Dict[str, Any]:
        """Validate CSV file structure and content"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        validation_result = {
            "is_valid": True,
            "errors": [],
            "warnings": []
        }

        try:
            # Read first chunk for validation
            df_sample = pd.read_csv(
                self.file_path,
                encoding=self.encoding,
                nrows=1000,
                low_memory=False
            )

            # Check 1: Empty file
            if len(df_sample) == 0:
                validation_result["is_valid"] = False
                validation_result["errors"].append("File is empty")
                return validation_result

            # Check 2: No columns
            if len(df_sample.columns) == 0:
                validation_result["is_valid"] = False
                validation_result["errors"].append("No columns found")
                return validation_result

            # Check 3: Duplicate column names
            duplicate_cols = df_sample.columns[df_sample.columns.duplicated()].tolist()
            if duplicate_cols:
                validation_result["warnings"].append(
                    f"Duplicate column names found: {duplicate_cols}"
                )

            # Check 4: Unnamed columns
            unnamed_cols = [col for col in df_sample.columns if 'Unnamed:' in str(col)]
            if unnamed_cols:
                validation_result["warnings"].append(
                    f"Unnamed columns found: {unnamed_cols}"
                )

            # Check 5: All columns are null
            all_null_cols = df_sample.columns[df_sample.isnull().all()].tolist()
            if all_null_cols:
                validation_result["warnings"].append(
                    f"Columns with all null values: {all_null_cols}"
                )

            # Check 6: Mixed data types in columns (sample check)
            for col in df_sample.columns:
                if df_sample[col].dtype == 'object':
                    # Check if it's mixed numeric/text
                    non_null_values = df_sample[col].dropna()
                    if len(non_null_values) > 0:
                        try:
                            pd.to_numeric(non_null_values)
                            validation_result["warnings"].append(
                                f"Column '{col}' contains numeric values stored as text"
                            )
                        except (ValueError, TypeError):
                            pass

        except Exception as e:
            validation_result["is_valid"] = False
            validation_result["errors"].append(f"Validation error: {str(e)}")

        return validation_result

    def get_schema(self) -> Dict[str, Any]:
        """Extract schema information from CSV"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        # Read a sample for schema inference
        df_sample = pd.read_csv(
            self.file_path,
            encoding=self.encoding,
            nrows=10000,  # Larger sample for better statistics
            low_memory=False,
            na_values=['', 'NULL', 'null', 'N/A', 'n/a', '#N/A']
        )

        columns = []
        for col in df_sample.columns:
            col_info = {
                "name": col,
                "type": str(df_sample[col].dtype),
                "nullable": bool(df_sample[col].isnull().any()),
                "unique_count": int(df_sample[col].nunique()),
                "null_count": int(df_sample[col].isnull().sum()),
                "null_percentage": round(float(df_sample[col].isnull().sum() / len(df_sample) * 100), 2)
            }

            # Add statistics for numeric columns
            if pd.api.types.is_numeric_dtype(df_sample[col]):
                non_null_data = df_sample[col].dropna()
                if len(non_null_data) > 0:
                    col_info.update({
                        "min": float(non_null_data.min()),
                        "max": float(non_null_data.max()),
                        "mean": float(non_null_data.mean()),
                        "median": float(non_null_data.median()),
                        "std": float(non_null_data.std())
                    })

            # Add sample values
            col_info["sample_values"] = df_sample[col].dropna().head(5).tolist()

            columns.append(col_info)

        return {
            "columns": columns,
            "row_count": self.total_rows,
            "column_count": len(df_sample.columns),
        }

    def fetch_data_chunked(self) -> Generator[pd.DataFrame, None, None]:
        """Fetch data in chunks as a generator"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        reader = pd.read_csv(
            self.file_path,
            encoding=self.encoding,
            chunksize=self.chunk_size,
            low_memory=False,
            na_values=['', 'NULL', 'null', 'N/A', 'n/a', '#N/A']
        )

        for chunk in reader:
            yield chunk

    def fetch_data(self, limit: Optional[int] = None, offset: int = 0) -> pd.DataFrame:
        """Fetch data with optional pagination"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        if limit is None:
            # Read entire file
            df = pd.read_csv(
                self.file_path,
                encoding=self.encoding,
                skiprows=range(1, offset + 1) if offset > 0 else None,
                low_memory=False,
                na_values=['', 'NULL', 'null', 'N/A', 'n/a', '#N/A']
            )
        else:
            # Read with limit
            df = pd.read_csv(
                self.file_path,
                encoding=self.encoding,
                skiprows=range(1, offset + 1) if offset > 0 else None,
                nrows=limit,
                low_memory=False,
                na_values=['', 'NULL', 'null', 'N/A', 'n/a', '#N/A']
            )

        return df

    def get_row_count(self) -> int:
        """Get total number of rows"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")
        return self.total_rows

    def _detect_encoding(self) -> str:
        """Detect file encoding"""
        try:
            with open(self.file_path, 'rb') as f:
                result = chardet.detect(f.read(100000))
                return result['encoding'] or 'utf-8'
        except Exception:
            return 'utf-8'
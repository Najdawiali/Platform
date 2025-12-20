# backend/app/connectors/excel_connector.py
import os
import pandas as pd
from typing import Dict, Any, Optional, List, Generator
from .base import BaseConnector


class ExcelConnector(BaseConnector):
    """Connector for Excel files with multi-sheet support"""

    def __init__(self, file_path: str, sheet_name: Optional[str] = None, chunk_size: int = 10000, **kwargs):
        super().__init__(file_path, **kwargs)
        self.file_path = file_path
        self.sheet_name = sheet_name  # None = all sheets, specific name = that sheet
        self.chunk_size = chunk_size
        self.excel_file = None
        self.sheet_names: List[str] = []
        self.total_rows: int = 0

    def connect(self) -> bool:
        """Load Excel file and detect sheets"""
        try:
            if not os.path.exists(self.file_path):
                raise FileNotFoundError(f"File not found: {self.file_path}")

            # Load Excel file
            self.excel_file = pd.ExcelFile(self.file_path)
            self.sheet_names = self.excel_file.sheet_names

            # If no specific sheet requested, we'll work with all sheets
            # If specific sheet requested, validate it exists
            if self.sheet_name and self.sheet_name not in self.sheet_names:
                raise ValueError(f"Sheet '{self.sheet_name}' not found. Available sheets: {self.sheet_names}")

            self.is_connected = True
            return True

        except Exception as e:
            print(f"Error connecting to Excel: {e}")
            self.is_connected = False
            return False

    def disconnect(self) -> bool:
        """Close Excel file"""
        if self.excel_file:
            self.excel_file.close()
        self.excel_file = None
        self.is_connected = False
        return True

    def get_sheet_names(self) -> List[str]:
        """Get all sheet names in the Excel file"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")
        return self.sheet_names

    def get_sheet_info(self) -> List[Dict[str, Any]]:
        """Get information about all sheets"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        sheets_info = []
        for sheet_name in self.sheet_names:
            try:
                # Read just first row to get columns
                df_sample = pd.read_excel(
                    self.file_path,
                    sheet_name=sheet_name,
                    nrows=1
                )

                # Count rows (approximation)
                df_full = pd.read_excel(self.file_path, sheet_name=sheet_name)

                sheets_info.append({
                    "sheet_name": sheet_name,
                    "row_count": len(df_full),
                    "column_count": len(df_full.columns),
                    "columns": df_full.columns.tolist()
                })
            except Exception as e:
                sheets_info.append({
                    "sheet_name": sheet_name,
                    "error": str(e)
                })

        return sheets_info

    def validate_source(self) -> Dict[str, Any]:
        """Validate Excel file structure"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        validation_result = {
            "is_valid": True,
            "errors": [],
            "warnings": []
        }

        try:
            # Check 1: Has sheets
            if not self.sheet_names:
                validation_result["is_valid"] = False
                validation_result["errors"].append("Excel file has no sheets")
                return validation_result

            # Determine which sheet(s) to validate
            sheets_to_validate = [self.sheet_name] if self.sheet_name else self.sheet_names

            for sheet in sheets_to_validate:
                try:
                    df_sample = pd.read_excel(
                        self.file_path,
                        sheet_name=sheet,
                        nrows=1000
                    )

                    # Check 2: Empty sheet
                    if len(df_sample) == 0:
                        validation_result["warnings"].append(f"Sheet '{sheet}' is empty")
                        continue

                    # Check 3: No columns
                    if len(df_sample.columns) == 0:
                        validation_result["errors"].append(f"Sheet '{sheet}' has no columns")
                        validation_result["is_valid"] = False

                    # Check 4: Duplicate column names
                    duplicate_cols = df_sample.columns[df_sample.columns.duplicated()].tolist()
                    if duplicate_cols:
                        validation_result["warnings"].append(
                            f"Sheet '{sheet}' has duplicate column names: {duplicate_cols}"
                        )

                    # Check 5: Unnamed columns
                    unnamed_cols = [col for col in df_sample.columns if 'Unnamed:' in str(col)]
                    if unnamed_cols:
                        validation_result["warnings"].append(
                            f"Sheet '{sheet}' has unnamed columns: {unnamed_cols}"
                        )

                except Exception as e:
                    validation_result["errors"].append(f"Error validating sheet '{sheet}': {str(e)}")
                    validation_result["is_valid"] = False

        except Exception as e:
            validation_result["is_valid"] = False
            validation_result["errors"].append(f"Validation error: {str(e)}")

        return validation_result

    def get_schema(self) -> Dict[str, Any]:
        """Extract schema information from Excel sheet"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        if not self.sheet_name:
            raise ValueError("Must specify sheet_name to get schema")

        # Read sample for schema inference
        df_sample = pd.read_excel(
            self.file_path,
            sheet_name=self.sheet_name,
            nrows=10000
        )

        # Read full to count rows (for Excel, this is manageable usually)
        df_full = pd.read_excel(self.file_path, sheet_name=self.sheet_name)
        self.total_rows = len(df_full)

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

            col_info["sample_values"] = df_sample[col].dropna().head(5).tolist()
            columns.append(col_info)

        return {
            "columns": columns,
            "row_count": self.total_rows,
            "column_count": len(df_sample.columns),
        }

    def fetch_data_chunked(self, chunk_size: Optional[int] = None) -> Generator[pd.DataFrame, None, None]:
        """Fetch data in chunks as a generator"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        if not self.sheet_name:
            raise ValueError("Must specify sheet_name to fetch data")

        chunk_size = chunk_size or self.chunk_size

        # Excel doesn't support native chunking, so we read and yield in chunks
        df = pd.read_excel(self.file_path, sheet_name=self.sheet_name)

        for i in range(0, len(df), chunk_size):
            yield df.iloc[i:i + chunk_size]

    def fetch_data(self, limit: Optional[int] = None, offset: int = 0) -> pd.DataFrame:
        """Fetch data with optional pagination"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        if not self.sheet_name:
            raise ValueError("Must specify sheet_name to fetch data")

        # Read full sheet
        df = pd.read_excel(self.file_path, sheet_name=self.sheet_name)

        # Apply offset and limit
        if offset > 0:
            df = df.iloc[offset:]

        if limit:
            df = df.head(limit)

        return df

    def get_row_count(self) -> int:
        """Get total number of rows"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")
        return self.total_rows
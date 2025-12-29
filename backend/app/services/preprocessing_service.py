# backend/app/services/preprocessing_service.py
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Tuple
import re
from datetime import datetime
import warnings


class DataPreprocessingService:
    """
    Enterprise-grade data preprocessing service
    Handles ALL edge cases before quality checks and visualization

    Based on best practices from:
    - Tableau Prep
    - Alteryx
    - Power BI Data Flow
    - Databricks Delta Lake
    - Snowflake
    """

    @staticmethod
    def preprocess_dataframe(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """
        Main preprocessing pipeline - applies all transformations

        Returns:
            - Cleaned DataFrame
            - Preprocessing report with applied transformations
        """
        report = {
            "original_shape": df.shape,
            "transformations_applied": [],
            "issues_fixed": [],
            "data_types_inferred": {},
            "columns_cleaned": []
        }

        # Step 1: Clean column names
        df, col_report = DataPreprocessingService._clean_column_names(df)
        if col_report["changes"]:
            report["transformations_applied"].append("column_name_cleaning")
            report["issues_fixed"].extend(col_report["changes"])

        # Step 2: Handle completely empty columns
        df, empty_cols = DataPreprocessingService._remove_empty_columns(df)
        if empty_cols:
            report["transformations_applied"].append("empty_column_removal")
            report["issues_fixed"].append(f"Removed {len(empty_cols)} empty columns: {empty_cols}")

        # Step 3: Handle duplicate columns
        df, dup_report = DataPreprocessingService._handle_duplicate_columns(df)
        if dup_report["duplicates_found"]:
            report["transformations_applied"].append("duplicate_column_handling")
            report["issues_fixed"].extend(dup_report["actions"])

        # Step 4: Clean data values (whitespace, special chars, etc.)
        df = DataPreprocessingService._clean_data_values(df)
        report["transformations_applied"].append("data_value_cleaning")

        # Step 5: Infer and optimize data types
        df, type_report = DataPreprocessingService._infer_and_convert_types(df)
        report["data_types_inferred"] = type_report
        report["transformations_applied"].append("data_type_inference")

        # Step 6: Handle mixed data types in columns
        df = DataPreprocessingService._standardize_mixed_types(df)
        report["transformations_applied"].append("mixed_type_standardization")

        # Step 7: Clean numeric columns
        df = DataPreprocessingService._clean_numeric_columns(df)
        report["transformations_applied"].append("numeric_cleaning")

        # Step 8: Clean string columns
        df = DataPreprocessingService._clean_string_columns(df)
        report["transformations_applied"].append("string_cleaning")

        # Step 9: Handle datetime columns - DISABLED to preserve ISO string format
        # df = DataPreprocessingService._parse_datetime_columns(df)
        # report["transformations_applied"].append("datetime_parsing")

        # Step 10: Final validation
        df = DataPreprocessingService._final_validation(df)

        report["final_shape"] = df.shape
        report["preprocessing_complete"] = True

        return df, report

    @staticmethod
    def _clean_column_names(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """
        Clean column names following enterprise best practices
        """
        report = {"changes": []}
        original_cols = df.columns.tolist()
        new_cols = []

        for col in original_cols:
            original = col
            cleaned = str(col)

            # Remove leading/trailing whitespace
            cleaned = cleaned.strip()

            # Replace problematic characters
            cleaned = re.sub(r'[^\w\s-]', '_', cleaned)  # Special chars to underscore
            cleaned = re.sub(r'\s+', '_', cleaned)  # Spaces to underscore
            cleaned = re.sub(r'_+', '_', cleaned)  # Multiple underscores to single
            cleaned = cleaned.strip('_')  # Remove leading/trailing underscores

            # Handle empty or numeric-only column names
            if not cleaned or cleaned.isdigit():
                cleaned = f"column_{len(new_cols)}"

            # Ensure uniqueness
            base_name = cleaned
            counter = 1
            while cleaned in new_cols:
                cleaned = f"{base_name}_{counter}"
                counter += 1

            new_cols.append(cleaned)

            if original != cleaned:
                report["changes"].append(f"Renamed '{original}' → '{cleaned}'")

        df.columns = new_cols
        return df, report

    @staticmethod
    def _remove_empty_columns(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
        """Remove completely empty columns"""
        empty_cols = []

        for col in df.columns:
            if df[col].isna().all() or (df[col].astype(str).str.strip() == '').all():
                empty_cols.append(col)

        if empty_cols:
            df = df.drop(columns=empty_cols)

        return df, empty_cols

    @staticmethod
    def _handle_duplicate_columns(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """Handle duplicate column names"""
        report = {"duplicates_found": False, "actions": []}

        # Check for duplicate column names
        col_counts = pd.Series(df.columns).value_counts()
        duplicates = col_counts[col_counts > 1].index.tolist()

        if duplicates:
            report["duplicates_found"] = True
            # Rename duplicates by adding suffix
            new_cols = []
            col_counter = {}

            for col in df.columns:
                if col in duplicates:
                    if col not in col_counter:
                        col_counter[col] = 0
                        new_cols.append(col)
                    else:
                        col_counter[col] += 1
                        new_name = f"{col}_{col_counter[col]}"
                        new_cols.append(new_name)
                        report["actions"].append(f"Renamed duplicate '{col}' → '{new_name}'")
                else:
                    new_cols.append(col)

            df.columns = new_cols

        return df, report

    @staticmethod
    def _clean_data_values(df: pd.DataFrame) -> pd.DataFrame:
        """
        Clean data values - whitespace, special characters, etc.
        """
        for col in df.columns:
            if df[col].dtype == 'object':
                # Strip whitespace
                df.loc[:, col] = df[col].astype(str).str.strip()

                # Replace common null representations with actual NaN
                null_values = ['', 'null', 'NULL', 'None', 'NONE', 'N/A', 'n/a',
                               'NA', 'na', '#N/A', '#NA', 'NaN', 'nan', '-', '--',
                               'undefined', 'Undefined', 'UNDEFINED', 'nil', 'NIL']
                df.loc[:, col] = df[col].replace(null_values, np.nan)

                # Replace empty strings with NaN
                df.loc[:, col] = df[col].replace('', np.nan)

        return df

    @staticmethod
    def _infer_and_convert_types(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, str]]:
        """
        Intelligent data type inference and conversion
        Enterprise-grade type detection
        """
        type_report = {}

        for col in df.columns:
            original_type = str(df[col].dtype)

            # CRITICAL: Convert datetime64 to ISO string FIRST to avoid parquet epoch issues
            if df[col].dtype == 'datetime64[ns]' or pd.api.types.is_datetime64_any_dtype(df[col]):
                try:
                    df[col] = pd.to_datetime(df[col], errors='coerce').dt.strftime('%Y-%m-%dT%H:%M:%S').replace({'NaT': None})
                    type_report[col] = "string (ISO timestamp)"
                    print(f"[PREPROCESS] Converted datetime64 column '{col}' to ISO string format")
                    continue
                except Exception as e:
                    print(f"[PREPROCESS] Error converting datetime64 column '{col}': {e}")
                    pass

            # Skip if already optimal type
            if df[col].dtype in ['int64', 'float64', 'bool']:
                type_report[col] = original_type
                continue

            # Get non-null values for inference
            non_null = df[col].dropna()

            if len(non_null) == 0:
                type_report[col] = "empty"
                continue

            # Try boolean first
            if DataPreprocessingService._is_boolean_column(non_null):
                df[col] = DataPreprocessingService._convert_to_boolean(df[col])
                type_report[col] = "boolean"
                continue

            # Try integer
            if DataPreprocessingService._is_integer_column(non_null):
                try:
                    # Convert to numeric first
                    numeric_vals = pd.to_numeric(df[col], errors='coerce')

                    # Check if values are within Int64 range after conversion
                    int64_min = -9223372036854775808
                    int64_max = 9223372036854775807

                    valid_mask = (numeric_vals.notna()) & (numeric_vals >= int64_min) & (numeric_vals <= int64_max)

                    if valid_mask.all():
                        # Safe to convert to Int64
                        df[col] = numeric_vals.astype('Int64')
                        type_report[col] = "integer"
                        continue
                    else:
                        # Values out of range, use float instead
                        df[col] = numeric_vals
                        type_report[col] = "float"
                        continue
                except Exception:
                    # If Int64 conversion fails, try float
                    pass

            # Try float
            if DataPreprocessingService._is_numeric_column(non_null):
                try:
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                    type_report[col] = "float"
                    continue
                except Exception:
                    pass

            # Try datetime - but keep as string if already in ISO format
            if DataPreprocessingService._is_datetime_column(non_null):
                try:
                    # Check if values are already ISO timestamp strings or datetime objects
                    sample_vals = non_null.head(5)
                    
                    # Check if already datetime-like (Timestamp, datetime64, etc.)
                    is_already_datetime = pd.api.types.is_datetime64_any_dtype(df[col])
                    
                    # Check if string values are in ISO format
                    sample_str = sample_vals.astype(str)
                    has_date_separator = all(('-' in str(v) or '/' in str(v)) and len(str(v)) >= 10 for v in sample_str if pd.notna(v))
                    
                    print(f"[PREPROCESS] Column '{col}' is datetime-like. Already datetime: {is_already_datetime}, Has date separator: {has_date_separator}")
                    
                    if is_already_datetime or has_date_separator:
                        # Convert to string in ISO format to preserve in parquet
                        df[col] = pd.to_datetime(df[col], errors='coerce').dt.strftime('%Y-%m-%dT%H:%M:%S').replace({'NaT': None})
                        type_report[col] = "string (ISO timestamp)"
                        print(f"[PREPROCESS] Converted '{col}' to ISO string format")
                    else:
                        # Convert to datetime
                        df[col] = pd.to_datetime(df[col], errors='coerce')
                        type_report[col] = "datetime"
                        print(f"[PREPROCESS] Converted '{col}' to datetime64")
                    continue
                except Exception as e:
                    print(f"[PREPROCESS] Error processing '{col}': {e}")
                    pass

            # Default to string/object
            type_report[col] = "string"

        return df, type_report

    @staticmethod
    def _is_boolean_column(series: pd.Series) -> bool:
        """Check if column contains boolean values"""
        unique_vals = series.astype(str).str.lower().unique()
        bool_values = {'true', 'false', '1', '0', 'yes', 'no', 'y', 'n',
                       't', 'f', 'on', 'off'}
        return len(unique_vals) <= 2 and all(val in bool_values for val in unique_vals)

    @staticmethod
    def _convert_to_boolean(series: pd.Series) -> pd.Series:
        """Convert to boolean with common representations"""
        true_values = {'true', '1', 'yes', 'y', 't', 'on', 'True', 'TRUE', 'Yes', 'YES'}
        series_str = series.astype(str)
        return series_str.isin(true_values)

    @staticmethod
    def _is_integer_column(series: pd.Series) -> bool:
        """Check if column contains integers"""
        try:
            numeric = pd.to_numeric(series, errors='coerce')
            non_null = numeric.dropna()
            if len(non_null) == 0:
                return False

            # Check if values are within Int64 range
            int64_min = -9223372036854775808
            int64_max = 9223372036854775807

            # Check if all values are whole numbers AND within Int64 range
            is_whole = (non_null == non_null.astype(int)).all()
            in_range = (non_null >= int64_min).all() and (non_null <= int64_max).all()

            return is_whole and in_range
        except Exception:
            return False

    @staticmethod
    def _is_numeric_column(series: pd.Series) -> bool:
        """Check if column is numeric"""
        try:
            numeric = pd.to_numeric(series, errors='coerce')
            # At least 80% of non-null values should convert successfully
            conversion_rate = numeric.notna().sum() / len(series.dropna())
            return conversion_rate > 0.8
        except Exception:
            return False

    @staticmethod
    def _is_datetime_column(series: pd.Series) -> bool:
        """Check if column contains datetime values"""
        try:
            sample_size = min(100, len(series))
            sample = series.dropna().head(sample_size)

            if len(sample) == 0:
                return False

            sample_str = sample.astype(str)

            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                parsed = pd.to_datetime(sample_str, errors='coerce')

            success_rate = parsed.notna().mean()
            return success_rate > 0.8

        except Exception:
            return False

    @staticmethod
    def _standardize_mixed_types(df: pd.DataFrame) -> pd.DataFrame:
        """
        Handle columns with mixed data types
        Convert to most appropriate common type
        """
        for col in df.columns:
            if df[col].dtype == 'object':
                try:
                    df.loc[:, col] = df[col].astype(str).str.replace(',', '')  # Remove commas
                    df.loc[:, col] = df[col].str.replace('$', '')
                    df.loc[:, col] = df[col].str.replace('%', '')
                except Exception:
                    pass

        return df

    @staticmethod
    def _clean_numeric_columns(df: pd.DataFrame) -> pd.DataFrame:
        """
        Clean numeric columns - handle infinity, extreme values, etc.
        """
        numeric_cols = df.select_dtypes(include=[np.number]).columns

        for col in numeric_cols:
            df[col] = df[col].replace([np.inf, -np.inf], np.nan)

            if df[col].std() > 0:
                mean = df[col].mean()
                std = df[col].std()
                lower_bound = mean - (10 * std)
                upper_bound = mean + (10 * std)
                df[col] = df[col].clip(lower=lower_bound, upper=upper_bound)

        return df

    @staticmethod
    def _clean_string_columns(df: pd.DataFrame) -> pd.DataFrame:
        """
        Clean string columns - encoding issues, special characters, etc.
        """
        string_cols = df.select_dtypes(include=['object']).columns

        for col in string_cols:
            if df[col].dtype != 'object':
                continue

            df.loc[:, col] = df[col].astype(str).apply(
                lambda x: re.sub(r'[\x00-\x1f\x7f-\x9f]', '', x) if isinstance(x, str) else x
            )
            df.loc[:, col] = df[col].str.replace(r'\s+', ' ', regex=True)
            df.loc[:, col] = df[col].str.strip()

        return df

    @staticmethod
    def _parse_datetime_columns(df: pd.DataFrame) -> pd.DataFrame:
        """
        Intelligently parse datetime columns
        """
        for col in df.columns:
            if df[col].dtype == 'object':
                sample = df[col].dropna().head(100)
                if len(sample) > 0:
                    try:
                        sample_str = sample.astype(str)
                        with warnings.catch_warnings():
                            warnings.simplefilter("ignore", UserWarning)
                            parsed = pd.to_datetime(sample_str, errors='coerce')
                        success_rate = parsed.notna().sum() / len(sample)

                        if success_rate > 0.8:
                            df[col] = pd.to_datetime(df[col].astype(str), errors='coerce')
                    except Exception:
                        pass

        return df

    @staticmethod
    def _final_validation(df: pd.DataFrame) -> pd.DataFrame:
        """
        Final validation and cleanup
        """
        df = df.dropna(how='all')
        df = df.reset_index(drop=True)

        if df.columns.duplicated().any():
            df.columns = [f"{col}_{i}" if df.columns.tolist().count(col) > 1
                          else col for i, col in enumerate(df.columns)]

        return df

    @staticmethod
    def get_preprocessing_summary(report: Dict[str, Any]) -> str:
        """
        Generate human-readable preprocessing summary
        """
        summary = []
        summary.append(f"Original shape: {report['original_shape']}")
        summary.append(f"Final shape: {report['final_shape']}")
        summary.append(f"\nTransformations applied: {len(report['transformations_applied'])}")

        for transform in report['transformations_applied']:
            summary.append(f"  - {transform}")

        if report['issues_fixed']:
            summary.append(f"\nIssues fixed: {len(report['issues_fixed'])}")
            for issue in report['issues_fixed'][:10]:
                summary.append(f"  - {issue}")

            if len(report['issues_fixed']) > 10:
                summary.append(f"  ... and {len(report['issues_fixed']) - 10} more")

        return "\n".join(summary)

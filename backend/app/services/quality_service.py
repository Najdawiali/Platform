# backend/app/services/quality_service.py
import pandas as pd
import numpy as np
from typing import Dict, Any, List
from datetime import datetime


class QualityService:
    """Service for performing data quality checks"""

    @staticmethod
    def perform_quality_checks(df_chunk: pd.DataFrame, is_first_chunk: bool = True) -> Dict[str, Any]:
        """
        Perform comprehensive quality checks on a data chunk
        Returns quality metrics and issues
        """

        quality_report = {
            "overall_score": 0,
            "checks_performed": datetime.utcnow().isoformat(),
            "row_count": len(df_chunk),
            "column_count": len(df_chunk.columns),
            "columns": [],
            "issues": {
                "critical": [],
                "warning": [],
                "info": []
            },
            "summary": {}
        }

        column_reports = []

        for col in df_chunk.columns:
            col_report = QualityService._check_column_quality(df_chunk, col)
            column_reports.append(col_report)

            # Collect issues
            if col_report["completeness_score"] < 50:
                quality_report["issues"]["critical"].append(
                    f"Column '{col}' has {col_report['null_percentage']:.1f}% missing values"
                )
            elif col_report["completeness_score"] < 80:
                quality_report["issues"]["warning"].append(
                    f"Column '{col}' has {col_report['null_percentage']:.1f}% missing values"
                )

            # Check for duplicates
            if col_report.get("duplicate_percentage", 0) > 90:
                quality_report["issues"]["warning"].append(
                    f"Column '{col}' has {col_report['duplicate_percentage']:.1f}% duplicate values"
                )

            # Check for outliers in numeric columns
            if col_report.get("outlier_count", 0) > 0:
                quality_report["issues"]["info"].append(
                    f"Column '{col}' has {col_report['outlier_count']} potential outliers"
                )

        quality_report["columns"] = column_reports

        # Calculate overall score
        quality_report["overall_score"] = QualityService._calculate_overall_score(column_reports)

        # Generate summary
        quality_report["summary"] = {
            "total_cells": len(df_chunk) * len(df_chunk.columns),
            "missing_cells": int(df_chunk.isnull().sum().sum()),
            "completeness_percentage": round(
                (1 - df_chunk.isnull().sum().sum() / (len(df_chunk) * len(df_chunk.columns))) * 100,
                2
            ),
            "critical_issues": len(quality_report["issues"]["critical"]),
            "warnings": len(quality_report["issues"]["warning"]),
            "info_items": len(quality_report["issues"]["info"])
        }

        return quality_report

    @staticmethod
    def _check_column_quality(df: pd.DataFrame, column: str) -> Dict[str, Any]:
        """Perform quality checks on a single column"""

        col_data = df[column]
        total_rows = len(col_data)

        report = {
            "name": column,
            "data_type": str(col_data.dtype),
            "null_count": int(col_data.isnull().sum()),
            "null_percentage": round(float(col_data.isnull().sum() / total_rows * 100), 2),
            "unique_count": int(col_data.nunique()),
            "duplicate_count": total_rows - int(col_data.nunique()),
            "duplicate_percentage": round((1 - col_data.nunique() / total_rows) * 100, 2),
        }

        # Completeness score (0-100)
        report["completeness_score"] = round(100 - report["null_percentage"], 2)

        # Non-null data for further analysis
        non_null_data = col_data.dropna()

        if len(non_null_data) > 0:
            # Numeric column checks
            if pd.api.types.is_numeric_dtype(col_data):
                report.update(QualityService._check_numeric_column(non_null_data))

            # String column checks
            elif pd.api.types.is_string_dtype(col_data) or col_data.dtype == 'object':
                report.update(QualityService._check_string_column(non_null_data))

            # DateTime column checks
            elif pd.api.types.is_datetime64_any_dtype(col_data):
                report.update(QualityService._check_datetime_column(non_null_data))

        return report

    @staticmethod
    def _check_numeric_column(data: pd.Series) -> Dict[str, Any]:
        """Quality checks specific to numeric columns"""

        try:
            checks = {
                "min": float(data.min()),
                "max": float(data.max()),
                "mean": float(data.mean()),
                "median": float(data.median()),
                "std": float(data.std()),
                "q25": float(data.quantile(0.25)),
                "q75": float(data.quantile(0.75)),
            }

            # Detect outliers using IQR method
            q1 = checks["q25"]
            q3 = checks["q75"]
            iqr = q3 - q1
            lower_bound = q1 - (1.5 * iqr)
            upper_bound = q3 + (1.5 * iqr)

            # Safe outlier detection - convert to numpy array first
            try:
                values = data.values
                outlier_mask = (values < lower_bound) | (values > upper_bound)
                outlier_count = int(outlier_mask.sum())
                checks["outlier_count"] = outlier_count
                checks["outlier_percentage"] = round(float(outlier_count / len(data) * 100), 2)
            except Exception:
                # If outlier detection fails, set to 0
                checks["outlier_count"] = 0
                checks["outlier_percentage"] = 0.0

            # Check for negative values
            try:
                checks["negative_count"] = int((data < 0).sum())
            except Exception:
                checks["negative_count"] = 0

            # Check for zeros
            try:
                checks["zero_count"] = int((data == 0).sum())
            except Exception:
                checks["zero_count"] = 0

            # Consistency score (lower std relative to mean is better)
            if checks["mean"] != 0:
                cv = abs(checks["std"] / checks["mean"])
                checks["consistency_score"] = round(max(0, 100 - (cv * 10)), 2)
            else:
                checks["consistency_score"] = 100

        except Exception as e:
            # If numeric checks fail completely, return minimal info
            checks = {
                "min": None,
                "max": None,
                "mean": None,
                "median": None,
                "std": None,
                "outlier_count": 0,
                "outlier_percentage": 0.0,
                "consistency_score": 100
            }

        return checks

    @staticmethod
    def _check_string_column(data: pd.Series) -> Dict[str, Any]:
        """Quality checks specific to string columns"""

        checks = {
            "min_length": int(data.astype(str).str.len().min()),
            "max_length": int(data.astype(str).str.len().max()),
            "avg_length": round(float(data.astype(str).str.len().mean()), 2),
        }

        # Check for empty strings
        empty_count = int((data.astype(str).str.strip() == '').sum())
        checks["empty_string_count"] = empty_count
        checks["empty_string_percentage"] = round(empty_count / len(data) * 100, 2)

        # Check for whitespace issues
        whitespace_issues = int(
            (data.astype(str).str.startswith(' ') | data.astype(str).str.endswith(' ')).sum()
        )
        checks["whitespace_issues"] = whitespace_issues

        # Pattern consistency (all values follow similar length pattern)
        length_std = data.astype(str).str.len().std()
        checks["pattern_consistency_score"] = round(max(0, 100 - (length_std * 2)), 2)

        return checks

    @staticmethod
    def _check_datetime_column(data: pd.Series) -> Dict[str, Any]:
        """Quality checks specific to datetime columns"""

        checks = {
            "min_date": str(data.min()),
            "max_date": str(data.max()),
            "date_range_days": (data.max() - data.min()).days,
        }

        # Check for future dates
        now = pd.Timestamp.now()
        future_dates = int((data > now).sum())
        checks["future_date_count"] = future_dates

        # Check for very old dates (before 1900)
        old_dates = int((data < pd.Timestamp('1900-01-01')).sum())
        checks["anomalous_old_dates"] = old_dates

        return checks

    @staticmethod
    def _calculate_overall_score(column_reports: List[Dict[str, Any]]) -> float:
        """Calculate overall quality score based on column reports"""

        if not column_reports:
            return 0

        total_score = 0

        for col_report in column_reports:
            # Weight: 60% completeness, 40% consistency/validity
            completeness = col_report["completeness_score"]

            consistency = col_report.get("consistency_score", 100)
            if "pattern_consistency_score" in col_report:
                consistency = col_report["pattern_consistency_score"]

            col_score = (completeness * 0.6) + (consistency * 0.4)
            total_score += col_score

        overall = total_score / len(column_reports)
        return round(overall, 2)

    @staticmethod
    def aggregate_chunk_reports(chunk_reports: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Aggregate quality reports from multiple chunks"""

        if not chunk_reports:
            return {}

        # Use the first report as base
        aggregated = chunk_reports[0].copy()

        # Aggregate row counts
        total_rows = sum(r["row_count"] for r in chunk_reports)
        aggregated["row_count"] = total_rows

        # Aggregate issues
        all_critical = []
        all_warnings = []
        all_info = []

        for report in chunk_reports:
            all_critical.extend(report["issues"]["critical"])
            all_warnings.extend(report["issues"]["warning"])
            all_info.extend(report["issues"]["info"])

        # Remove duplicates while preserving order
        aggregated["issues"]["critical"] = list(dict.fromkeys(all_critical))
        aggregated["issues"]["warning"] = list(dict.fromkeys(all_warnings))
        aggregated["issues"]["info"] = list(dict.fromkeys(all_info))

        # Update summary
        aggregated["summary"]["critical_issues"] = len(aggregated["issues"]["critical"])
        aggregated["summary"]["warnings"] = len(aggregated["issues"]["warning"])
        aggregated["summary"]["info_items"] = len(aggregated["issues"]["info"])

        return aggregated
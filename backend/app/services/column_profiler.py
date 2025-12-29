"""
Column Profiler Service

This module provides intelligent data profiling capabilities to analyze
columns in datasets and determine optimal aggregation strategies.

Based on industry standards from Tableau and Power BI, this profiler:
1. Detects column data types (temporal, numeric, categorical, etc.)
2. Calculates cardinality and statistical properties
3. Provides semantic classification (money, age, ID, etc.)
4. Recommends appropriate aggregation functions
5. Determines optimal time grains for date columns

Author: Data Platform Team
Date: 2025-12-26
"""

import re
from typing import Dict, Any, Optional, List, Tuple
from enum import Enum
import duckdb


class ColumnType(Enum):
    """Column type classification based on data characteristics"""
    TEMPORAL = "temporal"              # Dates, timestamps, time
    NUMERIC_CONTINUOUS = "numeric_continuous"  # Float, decimal measures
    NUMERIC_DISCRETE = "numeric_discrete"      # Integer counts, quantities
    CATEGORICAL_LOW = "categorical_low"        # < 100 unique values
    CATEGORICAL_MEDIUM = "categorical_medium"  # 100-1000 unique values
    CATEGORICAL_HIGH = "categorical_high"      # > 1000 unique values
    BOOLEAN = "boolean"                        # True/False, 0/1
    IDENTIFIER = "identifier"                  # IDs, UUIDs, keys
    MIXED = "mixed"                           # Multiple types present


class SemanticType(Enum):
    """Semantic classification based on column name and content"""
    TEMPORAL = "temporal"              # Date, time, timestamp
    MONETARY = "monetary"              # Money, revenue, price
    QUANTITY = "quantity"              # Count, number, amount
    RATE = "rate"                      # Percentage, ratio, rate
    IDENTIFIER = "identifier"          # ID, key, code
    MEASUREMENT = "measurement"        # Weight, height, temperature
    TEXT = "text"                      # Names, descriptions
    CATEGORY = "category"              # Status, type, category
    UNKNOWN = "unknown"                # Cannot determine


class AggregationFunction(Enum):
    """Recommended aggregation functions"""
    SUM = "SUM"
    AVG = "AVG"
    MIN = "MIN"
    MAX = "MAX"
    COUNT = "COUNT"
    COUNT_DISTINCT = "COUNT_DISTINCT"
    NONE = "NONE"


class DateGrain(Enum):
    """Time granularity for date aggregation"""
    YEAR = "year"
    QUARTER = "quarter"
    MONTH = "month"
    WEEK = "week"
    DAY = "day"
    HOUR = "hour"
    MINUTE = "minute"


class ColumnProfiler:
    """
    Analyzes dataset columns to provide intelligent aggregation recommendations.
    
    This class implements the industry-standard approach used by Tableau and Power BI
    for automatic aggregation and visualization optimization.
    """
    
    # Semantic pattern matching
    TEMPORAL_PATTERNS = [
        'date', 'time', 'timestamp', 'created', 'updated', 'modified',
        'deleted', 'started', 'ended', 'year', 'month', 'day', 'hour'
    ]
    
    MONETARY_PATTERNS = [
        'price', 'cost', 'revenue', 'amount', 'total', 'payment',
        'salary', 'fee', 'charge', 'balance', 'usd', 'eur', 'money'
    ]
    
    QUANTITY_PATTERNS = [
        'quantity', 'count', 'number', 'num', 'qty', 'volume',
        'units', 'items', 'records'
    ]
    
    RATE_PATTERNS = [
        'rate', 'percentage', 'percent', 'ratio', 'avg', 'average',
        'mean', 'median', 'score'
    ]
    
    ID_PATTERNS = [
        r'_id$', r'^id_', r'^id$', 'uuid', 'guid', 'key', 'code', 'identifier'
    ]
    
    MEASUREMENT_PATTERNS = [
        'weight', 'height', 'width', 'length', 'depth', 'size',
        'area', 'volume', 'temperature', 'speed', 'age'
    ]
    
    @staticmethod
    def profile_column(
        parquet_path: str,
        column_name: str,
        total_rows: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Analyze a single column to determine its characteristics and optimal handling.
        
        Args:
            parquet_path: Path to the parquet file
            column_name: Name of the column to profile
            total_rows: Pre-calculated total row count (optional, for performance)
            
        Returns:
            Dict containing:
                - column_type: ColumnType enum
                - semantic_type: SemanticType enum
                - cardinality: Number of unique values
                - cardinality_ratio: unique/total ratio
                - null_count: Number of NULL values
                - fill_rate: non-null/total ratio
                - sql_type: DuckDB data type
                - min_value: Minimum value
                - max_value: Maximum value
                - recommended_aggregation: AggregationFunction enum
                - date_grain: DateGrain enum (if temporal)
                - date_span_days: Number of days in date range (if temporal)
        """
        con = duckdb.connect(database=':memory:')
        
        try:
            # First get the SQL type separately (TYPEOF doesn't work well in aggregations)
            type_query = f"""
            SELECT TYPEOF("{column_name}") as sql_type
            FROM parquet_scan('{parquet_path}')
            LIMIT 1
            """
            sql_type = con.execute(type_query).fetchone()[0]
            
            # Build comprehensive profiling query
            profiling_query = f"""
            WITH base_stats AS (
                SELECT 
                    COUNT(*) as total_rows,
                    COUNT("{column_name}") as non_null_count,
                    COUNT(*) - COUNT("{column_name}") as null_count,
                    COUNT(DISTINCT "{column_name}") as unique_values
                FROM parquet_scan('{parquet_path}')
            ),
            value_stats AS (
                SELECT 
                    MIN("{column_name}") as min_value,
                    MAX("{column_name}") as max_value
                FROM parquet_scan('{parquet_path}')
                WHERE "{column_name}" IS NOT NULL
            )
            SELECT 
                b.*,
                v.min_value,
                v.max_value,
                CAST(b.unique_values AS DOUBLE) / NULLIF(b.total_rows, 0) as cardinality_ratio,
                CAST(b.non_null_count AS DOUBLE) / NULLIF(b.total_rows, 0) as fill_rate
            FROM base_stats b, value_stats v
            """
            
            result = con.execute(profiling_query).fetchone()
            
            if not result:
                raise Exception(f"Failed to profile column {column_name}")
            
            # Unpack results (sql_type already retrieved separately)
            (total, non_null, nulls, unique, min_val, max_val, 
             card_ratio, fill_rate) = result
            
            # Classify column type
            column_type = ColumnProfiler._classify_column_type(
                sql_type, unique, total, card_ratio, column_name
            )
            
            # Determine semantic type
            semantic_type = ColumnProfiler._classify_semantic_type(
                column_name, sql_type, min_val, max_val
            )
            
            # Build profile result
            profile = {
                'column_name': column_name,
                'column_type': column_type,
                'semantic_type': semantic_type,
                'cardinality': unique,
                'cardinality_ratio': float(card_ratio) if card_ratio else 0,
                'total_rows': total,
                'non_null_count': non_null,
                'null_count': nulls,
                'fill_rate': float(fill_rate) if fill_rate else 0,
                'sql_type': sql_type,
                'min_value': str(min_val) if min_val is not None else None,
                'max_value': str(max_val) if max_val is not None else None,
            }
            
            # Add date-specific profiling if temporal
            if column_type == ColumnType.TEMPORAL or semantic_type == SemanticType.TEMPORAL:
                date_profile = ColumnProfiler._profile_date_column(
                    con, parquet_path, column_name
                )
                profile.update(date_profile)
            
            # Recommend aggregation function
            profile['recommended_aggregation'] = ColumnProfiler._recommend_aggregation(
                column_type, semantic_type, column_name
            )
            
            return profile
            
        finally:
            con.close()
    
    @staticmethod
    def _classify_column_type(
        sql_type: str,
        unique_values: int,
        total_rows: int,
        cardinality_ratio: float,
        column_name: str
    ) -> ColumnType:
        """
        Classify column into a ColumnType based on characteristics.
        
        Classification Rules:
        - TEMPORAL: Date/timestamp types or date-like patterns
        - BOOLEAN: Boolean type or 2 unique values with 0/1 or True/False
        - IDENTIFIER: Very high cardinality (>95%) or ID patterns
        - NUMERIC_CONTINUOUS: Float/decimal types
        - NUMERIC_DISCRETE: Integer types with reasonable cardinality
        - CATEGORICAL_*: String types classified by cardinality
        """
        sql_type_lower = sql_type.lower()
        
        # Temporal detection
        if any(t in sql_type_lower for t in ['date', 'time', 'timestamp']):
            return ColumnType.TEMPORAL
        
        # Boolean detection
        if 'bool' in sql_type_lower or unique_values == 2:
            return ColumnType.BOOLEAN
        
        # Identifier detection (very high cardinality)
        if cardinality_ratio > 0.95:
            return ColumnType.IDENTIFIER
        
        # Check for ID patterns in column name
        if any(re.search(pattern, column_name.lower()) for pattern in ColumnProfiler.ID_PATTERNS):
            return ColumnType.IDENTIFIER
        
        # Numeric types
        if any(t in sql_type_lower for t in ['double', 'float', 'decimal', 'real']):
            return ColumnType.NUMERIC_CONTINUOUS
        
        if any(t in sql_type_lower for t in ['int', 'bigint', 'smallint', 'tinyint']):
            # High cardinality integers are likely IDs
            if cardinality_ratio > 0.5:
                return ColumnType.IDENTIFIER
            return ColumnType.NUMERIC_DISCRETE
        
        # Categorical (string types) - classify by cardinality
        if cardinality_ratio < 0.01 or unique_values < 100:
            return ColumnType.CATEGORICAL_LOW
        elif unique_values < 1000:
            return ColumnType.CATEGORICAL_MEDIUM
        else:
            return ColumnType.CATEGORICAL_HIGH
    
    @staticmethod
    def _classify_semantic_type(
        column_name: str,
        sql_type: str,
        min_value: Any,
        max_value: Any
    ) -> SemanticType:
        """
        Determine semantic meaning of column based on name patterns.
        
        This helps select appropriate aggregation functions and visualizations.
        """
        name_lower = column_name.lower()
        
        # Check each semantic pattern
        if any(pattern in name_lower for pattern in ColumnProfiler.TEMPORAL_PATTERNS):
            return SemanticType.TEMPORAL
        
        if any(pattern in name_lower for pattern in ColumnProfiler.MONETARY_PATTERNS):
            return SemanticType.MONETARY
        
        if any(pattern in name_lower for pattern in ColumnProfiler.QUANTITY_PATTERNS):
            return SemanticType.QUANTITY
        
        if any(pattern in name_lower for pattern in ColumnProfiler.RATE_PATTERNS):
            return SemanticType.RATE
        
        if any(re.search(pattern, name_lower) for pattern in ColumnProfiler.ID_PATTERNS):
            return SemanticType.IDENTIFIER
        
        if any(pattern in name_lower for pattern in ColumnProfiler.MEASUREMENT_PATTERNS):
            return SemanticType.MEASUREMENT
        
        # Default based on SQL type
        if 'char' in sql_type.lower() or 'text' in sql_type.lower():
            return SemanticType.TEXT
        
        return SemanticType.UNKNOWN
    
    @staticmethod
    def _profile_date_column(
        con: duckdb.DuckDBPyConnection,
        parquet_path: str,
        column_name: str
    ) -> Dict[str, Any]:
        """
        Profile temporal columns to determine date grain and span.
        
        Returns:
            - date_span_days: Total days between min and max
            - unique_days: Number of unique days
            - unique_months: Number of unique months
            - recommended_grain: DateGrain enum
        """
        date_query = f"""
        WITH normalized_dates AS (
            SELECT 
                CASE 
                    WHEN TRY_CAST("{column_name}" AS TIMESTAMP) IS NOT NULL 
                        THEN CAST("{column_name}" AS TIMESTAMP)
                    WHEN TRY_CAST("{column_name}" AS BIGINT) > 1000000000000000 
                        THEN to_timestamp(CAST("{column_name}" AS BIGINT) / 1000000)
                    WHEN TRY_CAST("{column_name}" AS BIGINT) > 1000000000000 
                        THEN to_timestamp(CAST("{column_name}" AS BIGINT) / 1000)
                    WHEN TRY_CAST("{column_name}" AS BIGINT) > 1000000000 
                        THEN to_timestamp(CAST("{column_name}" AS BIGINT))
                    WHEN TRY_CAST("{column_name}" AS DATE) IS NOT NULL
                        THEN CAST(CAST("{column_name}" AS DATE) AS TIMESTAMP)
                END as normalized_date
            FROM parquet_scan('{parquet_path}')
            WHERE "{column_name}" IS NOT NULL
        )
        SELECT 
            MIN(normalized_date) as min_date,
            MAX(normalized_date) as max_date,
            COUNT(DISTINCT DATE_TRUNC('day', normalized_date)) as unique_days,
            COUNT(DISTINCT DATE_TRUNC('month', normalized_date)) as unique_months,
            DATE_DIFF('day', MIN(normalized_date), MAX(normalized_date)) as day_span
        FROM normalized_dates
        WHERE normalized_date IS NOT NULL
        """
        
        try:
            result = con.execute(date_query).fetchone()
            if not result:
                return {}
            
            min_date, max_date, unique_days, unique_months, day_span = result
            
            # Determine recommended grain
            grain = ColumnProfiler._determine_date_grain(day_span)
            
            return {
                'date_span_days': day_span,
                'unique_days': unique_days,
                'unique_months': unique_months,
                'min_date': str(min_date) if min_date else None,
                'max_date': str(max_date) if max_date else None,
                'recommended_grain': grain
            }
        except Exception as e:
            # If date profiling fails, return empty dict
            print(f"[Warning] Date profiling failed for {column_name}: {e}")
            return {}
    
    @staticmethod
    def _determine_date_grain(day_span: Optional[int]) -> DateGrain:
        """
        Determine optimal date grain based on data span.
        
        Rules (based on Tableau/Power BI):
        - <= 1 day: HOUR
        - <= 7 days: DAY
        - <= 90 days: DAY
        - <= 365 days: WEEK
        - <= 730 days: MONTH
        - > 730 days: QUARTER or YEAR
        """
        if not day_span:
            return DateGrain.DAY
        
        if day_span <= 1:
            return DateGrain.HOUR
        elif day_span <= 90:
            return DateGrain.DAY
        elif day_span <= 365:
            return DateGrain.WEEK
        elif day_span <= 730:
            return DateGrain.MONTH
        else:
            return DateGrain.QUARTER
    
    @staticmethod
    def _recommend_aggregation(
        column_type: ColumnType,
        semantic_type: SemanticType,
        column_name: str
    ) -> AggregationFunction:
        """
        Recommend aggregation function based on column characteristics.
        
        Decision Tree:
        1. Identifiers → COUNT_DISTINCT
        2. Monetary/Quantity → SUM
        3. Rates/Percentages/Measurements → AVG
        4. Boolean → SUM (count of trues)
        5. High cardinality → COUNT
        6. Numeric continuous → AVG
        7. Default → SUM
        """
        # Identifiers should be counted distinct
        if column_type == ColumnType.IDENTIFIER or semantic_type == SemanticType.IDENTIFIER:
            return AggregationFunction.COUNT_DISTINCT
        
        # Semantic-based rules
        if semantic_type == SemanticType.MONETARY:
            return AggregationFunction.SUM
        
        if semantic_type == SemanticType.QUANTITY:
            return AggregationFunction.SUM
        
        if semantic_type in [SemanticType.RATE, SemanticType.MEASUREMENT]:
            return AggregationFunction.AVG
        
        # Type-based rules
        if column_type == ColumnType.BOOLEAN:
            return AggregationFunction.SUM
        
        if column_type in [ColumnType.CATEGORICAL_HIGH, ColumnType.CATEGORICAL_MEDIUM]:
            return AggregationFunction.COUNT
        
        if column_type == ColumnType.NUMERIC_CONTINUOUS:
            return AggregationFunction.AVG
        
        if column_type == ColumnType.NUMERIC_DISCRETE:
            return AggregationFunction.SUM
        
        # Default
        return AggregationFunction.SUM

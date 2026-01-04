# backend/app/services/dashboard_service.py
"""
Dashboard Service

Manages dashboard creation, updates, and data retrieval with intelligent aggregation.

This service implements industry-standard automatic aggregation strategies similar to
Tableau and Power BI, ensuring optimal chart visualization regardless of data size.

Key Features:
- Intelligent column profiling and type detection
- Chart-type specific aggregation rules
- Automatic date grain selection
- Cardinality-based grouping (TOP N + Others)
- Smart aggregation function selection
- Performance-optimized queries

Author: Data Platform Team
Date: 2025-12-26
"""

from typing import List, Optional, Dict, Any, Union
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from datetime import timezone
from pathlib import Path
import os
import math
import duckdb
import pandas as pd
import numpy as np
import re

from ..models.dashboard import Dashboard, DashboardChart
from ..models.user import User
from ..models.dataset import Dataset
from ..schemas.dashboard import (
    DashboardCreate, DashboardUpdate, DashboardListItem,
    DashboardChartCreate, DashboardChartUpdate
)
from ..services.query_service import QueryService
from ..services.dataset_service import DatasetService


class DashboardService:
    """Service for managing dashboards"""

    @staticmethod
    def _unset_other_main_dashboards(user_id: str, db: Session, *, exclude_dashboard_id: Optional[str] = None) -> None:
        """Ensure only one dashboard is marked main per user (dashboards only, not insights)."""
        q = db.query(Dashboard).filter(
            Dashboard.user_id == user_id,
            Dashboard.is_insight == False,
            Dashboard.is_main == True,
        )
        if exclude_dashboard_id:
            q = q.filter(Dashboard.id != exclude_dashboard_id)
        q.update({Dashboard.is_main: False}, synchronize_session=False)

    @staticmethod
    def create_dashboard(
        user: User,
        dashboard_data: DashboardCreate,
        db: Session
    ) -> Dashboard:
        """Create a new dashboard with charts"""
        
        # Create dashboard
        dashboard = Dashboard(
            user_id=user.id,
            name=dashboard_data.name,
            description=dashboard_data.description,
            is_main=getattr(dashboard_data, "is_main", False),
            is_private=getattr(dashboard_data, "is_private", True),
            is_insight=False  # This is a regular dashboard, not an insight
        )
        
        db.add(dashboard)
        db.flush()  # Get dashboard.id before creating charts

        # If this dashboard is being set as main, unset any existing main dashboard for this user.
        if getattr(dashboard_data, "is_main", False):
            DashboardService._unset_other_main_dashboards(user.id, db, exclude_dashboard_id=dashboard.id)
        
        # Create charts
        for chart_data in dashboard_data.charts:
            # Verify dataset exists and belongs to user
            dataset = db.query(Dataset).filter(
                Dataset.id == chart_data.dataset_id,
                Dataset.user_id == user.id
            ).first()
            
            if not dataset:
                raise ValueError(f"Dataset {chart_data.dataset_id} not found")
            
            chart = DashboardChart(
                dashboard_id=dashboard.id,
                dataset_id=chart_data.dataset_id,
                chart_type=chart_data.chart_type,
                x_column=chart_data.x_column,
                y_column=chart_data.y_column,
                title=chart_data.title,
                config=chart_data.config,
                position_x=chart_data.position_x,
                position_y=chart_data.position_y,
                width=chart_data.width,
                height=chart_data.height
            )
            db.add(chart)
        
        db.commit()
        db.refresh(dashboard)
        
        return dashboard

    @staticmethod
    def create_sql_insight(user: User, insight_data, db: Session) -> Dashboard:
        """Create a single-chart dashboard backed by a materialized parquet dataset."""
        query_text = (insight_data.query or "").strip()
        if not query_text:
            raise ValueError("Query is required")
        if not insight_data.sources or len(insight_data.sources) == 0:
            raise ValueError("At least one source is required")

        df = QueryService.execute_query_to_dataframe_federated(
            query=query_text,
            sources=insight_data.sources,
            user=user,
            db=db,
            max_rows=100000,
        )

        dataset_name = f"{insight_data.name} (SQL)" if insight_data.name else "SQL Insight Dataset"
        dataset = DatasetService.create_dataset_from_dataframe(
            df=df,
            user=user,
            name=dataset_name,
            description=insight_data.description,
            db=db,
            source_type="sql",
            source_identifier="sql_query",
        )

        dashboard = Dashboard(
            user_id=user.id,
            name=insight_data.name,
            description=insight_data.description,
            is_insight=True  # This is an insight, not a regular dashboard
        )
        db.add(dashboard)
        db.flush()

        chart_cfg = insight_data.chart.config or {}
        # Persist SQL + sources on the chart so the Insight template can show them.
        chart_cfg = {
            **chart_cfg,
            "sql_query": query_text,
            "sql_sources": [s.model_dump() for s in insight_data.sources],
        }
        
        # Debug logs removed

        chart = DashboardChart(
            dashboard_id=dashboard.id,
            dataset_id=dataset.id,
            chart_type=insight_data.chart.chart_type,
            x_column=insight_data.chart.x_column,
            y_column=insight_data.chart.y_column,
            title=insight_data.chart.title or insight_data.name,
            config=chart_cfg,
            position_x=0,
            position_y=0,
            width=12,
            height=6,
        )
        db.add(chart)
        db.commit()
        db.refresh(dashboard)
        return dashboard

    @staticmethod
    def get_user_dashboards(user: User, db: Session) -> List[DashboardListItem]:
        """Get all dashboards for a user with chart count (excludes insights)"""
        
        dashboards = db.query(
            Dashboard.id,
            Dashboard.name,
            Dashboard.description,
            Dashboard.is_main,
            Dashboard.is_private,
            Dashboard.created_at,
            Dashboard.updated_at,
            func.count(DashboardChart.id).label('chart_count'),
            func.max(DashboardChart.chart_type).label('first_chart_type')
        ).outerjoin(
            DashboardChart, Dashboard.id == DashboardChart.dashboard_id
        ).filter(
            Dashboard.user_id == user.id,
            Dashboard.is_insight == False  # Only return dashboards, not insights
        ).group_by(
            Dashboard.id,
            Dashboard.name,
            Dashboard.description,
            Dashboard.is_main,
            Dashboard.is_private,
            Dashboard.created_at,
            Dashboard.updated_at
        ).all()
        
        return [
            DashboardListItem(
                id=d.id,
                name=d.name,
                description=d.description,
                is_main=getattr(d, "is_main", False),
                is_private=getattr(d, "is_private", True),
                chart_count=d.chart_count,
                first_chart_type=d.first_chart_type,
                created_at=d.created_at,
                updated_at=d.updated_at
            )
            for d in dashboards
        ]

    @staticmethod
    def get_user_insights(user: User, db: Session) -> List[DashboardListItem]:
        """Get all insights for a user with chart count (excludes regular dashboards)"""
        
        dashboards = db.query(
            Dashboard.id,
            Dashboard.name,
            Dashboard.description,
            Dashboard.is_main,
            Dashboard.is_private,
            Dashboard.created_at,
            Dashboard.updated_at,
            func.count(DashboardChart.id).label('chart_count'),
            func.max(DashboardChart.chart_type).label('first_chart_type')
        ).outerjoin(
            DashboardChart, Dashboard.id == DashboardChart.dashboard_id
        ).filter(
            Dashboard.user_id == user.id,
            Dashboard.is_insight == True  # Only return insights, not regular dashboards
        ).group_by(
            Dashboard.id,
            Dashboard.name,
            Dashboard.description,
            Dashboard.is_main,
            Dashboard.is_private,
            Dashboard.created_at,
            Dashboard.updated_at
        ).all()
        
        return [
            DashboardListItem(
                id=d.id,
                name=d.name,
                description=d.description,
                is_main=getattr(d, "is_main", False),
                is_private=getattr(d, "is_private", True),
                chart_count=d.chart_count,
                first_chart_type=d.first_chart_type,
                created_at=d.created_at,
                updated_at=d.updated_at
            )
            for d in dashboards
        ]

    @staticmethod
    def get_dashboard_by_id(
        dashboard_id: str,
        user: User,
        db: Session
    ) -> Optional[Dashboard]:
        """Get a specific dashboard by ID"""
        
        dashboard = db.query(Dashboard).filter(
            Dashboard.id == dashboard_id,
            Dashboard.user_id == user.id
        ).first()
        
        # DEBUG: Log what we're loading
        if dashboard:
            import logging
            logger = logging.getLogger(__name__)
            # Debug logs removed
        
        return dashboard

    @staticmethod
    def update_dashboard(
        dashboard_id: str,
        user: User,
        dashboard_data: DashboardUpdate,
        db: Session
    ) -> Optional[Dashboard]:
        """Update dashboard metadata"""
        
        dashboard = DashboardService.get_dashboard_by_id(dashboard_id, user, db)
        
        if not dashboard:
            return None
        
        if dashboard_data.name is not None:
            dashboard.name = dashboard_data.name
        
        if dashboard_data.description is not None:
            dashboard.description = dashboard_data.description

        # Only dashboards (not insights) can be marked as main.
        if getattr(dashboard_data, "is_main", None) is not None:
            if dashboard.is_insight:
                dashboard.is_main = False
            else:
                if dashboard_data.is_main:
                    DashboardService._unset_other_main_dashboards(user.id, db, exclude_dashboard_id=dashboard.id)
                    dashboard.is_main = True
                else:
                    dashboard.is_main = False

        if getattr(dashboard_data, "is_private", None) is not None:
            dashboard.is_private = bool(dashboard_data.is_private)
        
        db.commit()
        db.refresh(dashboard)
        
        return dashboard
    
    @staticmethod
    def update_sql_insight(
        dashboard_id: str,
        user: User,
        insight_data,  # SQLInsightCreate from API
        db: Session
    ) -> Optional[Dashboard]:
        """Update a SQL-based dashboard/insight by re-materializing query results."""
        import logging
        logger = logging.getLogger(__name__)
        
        # 1. Get existing dashboard
        dashboard = DashboardService.get_dashboard_by_id(dashboard_id, user, db)
        if not dashboard:
            return None
        
        # 2. Get the first (and should be only) chart
        if not dashboard.charts or len(dashboard.charts) == 0:
            logger.error(f"Dashboard {dashboard_id} has no charts")
            return None
        
        chart = dashboard.charts[0]
        
        # 3. Re-materialize the dataset with new query
        from ..services.query_service import QueryService
        
        query_text = str(insight_data.query).strip()
        if not query_text:
            raise ValueError("Query is required")
        if not insight_data.sources or len(insight_data.sources) == 0:
            raise ValueError("At least one source is required")
        
        # Execute query and get dataframe (same as create_sql_insight)
        df = QueryService.execute_query_to_dataframe_federated(
            query=query_text,
            sources=insight_data.sources,
            user=user,
            db=db,
            max_rows=100000,
        )
        
        # 4. Create or update dataset
        from ..services.dataset_service import DatasetService
        
        # Delete old dataset if exists
        if chart.dataset_id:
            old_dataset = db.query(Dataset).filter(Dataset.id == chart.dataset_id).first()
            if old_dataset:
                db.delete(old_dataset)
                db.flush()
        
        # Create new dataset
        dataset_name = f"{insight_data.name} (SQL)" if insight_data.name else "SQL Insight Dataset"
        dataset = DatasetService.create_dataset_from_dataframe(
            df=df,
            user=user,
            name=dataset_name,
            description=insight_data.description,
            db=db
        )
        
        # 5. Update dashboard metadata
        dashboard.name = insight_data.name
        if insight_data.description:
            dashboard.description = insight_data.description
        
        # 6. Update chart
        chart_cfg = insight_data.chart.config or {}
        chart_cfg = {
            **chart_cfg,
            "sql_query": query_text,
            "sql_sources": [s.model_dump() for s in insight_data.sources],
        }
        
        chart.dataset_id = dataset.id
        chart.chart_type = insight_data.chart.chart_type
        chart.x_column = insight_data.chart.x_column
        chart.y_column = insight_data.chart.y_column
        chart.title = insight_data.chart.title or insight_data.name
        chart.config = chart_cfg
        
        db.commit()
        db.refresh(dashboard)
        
        return dashboard

    @staticmethod
    def delete_dashboard(
        dashboard_id: str,
        user: User,
        db: Session
    ) -> bool:
        """Delete a dashboard"""
        
        dashboard = DashboardService.get_dashboard_by_id(dashboard_id, user, db)
        
        if not dashboard:
            return False
        
        db.delete(dashboard)
        db.commit()
        
        return True

    @staticmethod
    def add_chart_to_dashboard(
        dashboard_id: str,
        user: User,
        chart_data: DashboardChartCreate,
        db: Session
    ) -> Optional[DashboardChart]:
        """Add a new chart to an existing dashboard"""
        
        dashboard = DashboardService.get_dashboard_by_id(dashboard_id, user, db)
        
        if not dashboard:
            return None
        
        # Verify dataset exists and belongs to user
        dataset = db.query(Dataset).filter(
            Dataset.id == chart_data.dataset_id,
            Dataset.user_id == user.id
        ).first()
        
        if not dataset:
            raise ValueError(f"Dataset {chart_data.dataset_id} not found")
        
        chart = DashboardChart(
            dashboard_id=dashboard_id,
            dataset_id=chart_data.dataset_id,
            chart_type=chart_data.chart_type,
            x_column=chart_data.x_column,
            y_column=chart_data.y_column,
            title=chart_data.title,
            config=chart_data.config,
            position_x=chart_data.position_x,
            position_y=chart_data.position_y,
            width=chart_data.width,
            height=chart_data.height
        )
        
        db.add(chart)
        db.commit()
        db.refresh(chart)
        
        return chart

    @staticmethod
    def update_chart(
        chart_id: str,
        dashboard_id: str,
        user: User,
        chart_data: DashboardChartUpdate,
        db: Session
    ) -> Optional[DashboardChart]:
        """Update a chart in a dashboard"""
        
        # Verify dashboard belongs to user
        dashboard = DashboardService.get_dashboard_by_id(dashboard_id, user, db)
        
        if not dashboard:
            return None
        
        # Get chart
        chart = db.query(DashboardChart).filter(
            DashboardChart.id == chart_id,
            DashboardChart.dashboard_id == dashboard_id
        ).first()
        
        if not chart:
            return None
        
        # Update fields
        if chart_data.chart_type is not None:
            chart.chart_type = chart_data.chart_type
        if chart_data.x_column is not None:
            chart.x_column = chart_data.x_column
        if chart_data.y_column is not None:
            chart.y_column = chart_data.y_column
        if chart_data.title is not None:
            chart.title = chart_data.title
        if chart_data.config is not None:
            chart.config = chart_data.config
        if chart_data.position_x is not None:
            chart.position_x = chart_data.position_x
        if chart_data.position_y is not None:
            chart.position_y = chart_data.position_y
        if chart_data.width is not None:
            chart.width = chart_data.width
        if chart_data.height is not None:
            chart.height = chart_data.height
        
        db.commit()
        db.refresh(chart)
        
        return chart

    @staticmethod
    def delete_chart(
        chart_id: str,
        dashboard_id: str,
        user: User,
        db: Session
    ) -> bool:
        """Delete a chart from a dashboard"""
        
        # Verify dashboard belongs to user
        dashboard = DashboardService.get_dashboard_by_id(dashboard_id, user, db)
        
        if not dashboard:
            return False
        
        # Get and delete chart
        chart = db.query(DashboardChart).filter(
            DashboardChart.id == chart_id,
            DashboardChart.dashboard_id == dashboard_id
        ).first()
        
        if not chart:
            return False
        
        db.delete(chart)
        db.commit()
        
        return True

    @staticmethod
    def get_chart_aggregated_data(
        chart: DashboardChart,
        db: Session,
        aggregation: Optional[str] = None,
        offset: Optional[int] = None,
        limit: Optional[int] = None,
        columns: Optional[str] = None,
        sort_column: Optional[str] = None,
        sort_dir: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get chart data for visualization.

        NOTE: Aggregation is intentionally disabled. This method returns raw rows from the
        underlying parquet file (optionally paginated via offset/limit).
        
        Args:
            chart: DashboardChart model with configuration
            db: Database session
            aggregation: Optional override for aggregation function (not used with intelligent mode)
            
        Returns:
            Dict containing:
                - columns: List of column names
                - data: List of dict records
                - row_count: Number of rows returned
                - total_source_rows: Total rows in source data
                - is_aggregated: Always False
                - aggregation_strategy: Always "raw_data"
                - metadata: Additional info (pagination)
        """
        try:
            # Get dataset to access parquet file
            dataset = db.query(Dataset).filter(Dataset.id == chart.dataset_id).first()
            if not dataset:
                raise Exception(f"Dataset {chart.dataset_id} not found")
            
            # Get parquet path from dataset schema_info
            parquet_path = dataset.schema_info.get("parquet_path") if dataset.schema_info else None

            schema_cols_raw = []
            try:
                if dataset.schema_info and isinstance(dataset.schema_info.get("schema"), dict):
                    schema_cols_raw = dataset.schema_info.get("schema", {}).get("columns") or []
            except Exception:
                schema_cols_raw = []
            available_cols: set[str] = set()
            if isinstance(schema_cols_raw, list):
                for c in schema_cols_raw:
                    if isinstance(c, dict) and isinstance(c.get("name"), str) and c.get("name").strip():
                        available_cols.add(c.get("name").strip())

            # Parquet paths are often stored as relative (e.g. "./uploads/..."), which is
            # sensitive to the process working directory. Resolve relative paths against
            # the backend folder to make runtime stable.
            if parquet_path:
                p = Path(str(parquet_path))
                if not p.is_absolute():
                    backend_dir = Path(__file__).resolve().parents[2]  # .../backend
                    p = (backend_dir / p).resolve()
                parquet_path = os.fspath(p)

            if not parquet_path or not os.path.exists(parquet_path):
                raise Exception(f"Data file not found: {parquet_path}")
            
            # Connect to DuckDB
            con = duckdb.connect(database=':memory:')

            cfg = chart.config or {}

            # Total row count for metadata
            total_rows = con.execute(
                f"SELECT COUNT(*) as total FROM parquet_scan('{parquet_path}')"
            ).fetchone()[0]

            def _split_columns(v: Optional[str]) -> list[str]:
                if not v:
                    return []
                parts = [p.strip() for p in v.split(',')]
                return [p for p in parts if p]

            def _validate_ident(name: str) -> str:
                # Avoid SQL injection via identifier; we quote identifiers, but reject quotes/newlines.
                if '"' in name or '\n' in name or '\r' in name or '\t' in name:
                    raise ValueError(f"Invalid column name: {name}")
                return name

            def _build_filters_predicate(raw_filters: Any) -> tuple[str, list[Any]]:
                """Compile saved chart config filters into a DuckDB predicate and params.

                Returns (predicate_sql_without_where, params).
                """
                if not raw_filters or not isinstance(raw_filters, list):
                    return "", []

                parts: list[str] = []
                params: list[Any] = []

                def _get_str(d: dict, k: str) -> str:
                    v = d.get(k)
                    return v.strip() if isinstance(v, str) else ""

                def _get_num(d: dict, k: str) -> Optional[float]:
                    v = d.get(k)
                    if isinstance(v, (int, float)) and math.isfinite(float(v)):
                        return float(v)
                    if isinstance(v, str):
                        try:
                            vv = float(v)
                            if math.isfinite(vv):
                                return vv
                        except Exception:
                            return None
                    return None

                for f in raw_filters:
                    if not isinstance(f, dict):
                        continue
                    col = _get_str(f, "column")
                    op = _get_str(f, "op").lower()
                    if not col or not op:
                        continue
                    if available_cols and col not in available_cols:
                        # Ignore unknown columns rather than failing the whole chart.
                        continue
                    col = _validate_ident(col)

                    s_expr = f"lower(trim(coalesce(cast(\"{col}\" as varchar), '')))"
                    n_expr = f"try_cast(\"{col}\" as double)"
                    ts_expr = f"try_cast(\"{col}\" as timestamp)"
                    d_expr = f"cast({ts_expr} as date)"

                    # Null checks
                    if op == "is_null":
                        parts.append(f"\"{col}\" IS NULL")
                        continue
                    if op == "is_not_null":
                        parts.append(f"\"{col}\" IS NOT NULL")
                        continue

                    # Boolean
                    if op == "is_true":
                        parts.append(f"try_cast(\"{col}\" as boolean) IS TRUE")
                        continue
                    if op == "is_false":
                        parts.append(f"try_cast(\"{col}\" as boolean) IS FALSE")
                        continue

                    # String operators
                    if op in {"eq", "neq", "contains", "not_contains", "starts_with", "ends_with"}:
                        v = _get_str(f, "value")
                        if not v:
                            continue
                        if op == "eq":
                            parts.append(f"{s_expr} = lower(?)")
                            params.append(v)
                            continue
                        if op == "neq":
                            parts.append(f"{s_expr} <> lower(?)")
                            params.append(v)
                            continue
                        if op == "contains":
                            parts.append(f"{s_expr} LIKE lower(?)")
                            params.append(f"%{v}%")
                            continue
                        if op == "not_contains":
                            parts.append(f"NOT ({s_expr} LIKE lower(?))")
                            params.append(f"%{v}%")
                            continue
                        if op == "starts_with":
                            parts.append(f"{s_expr} LIKE lower(?)")
                            params.append(f"{v}%")
                            continue
                        if op == "ends_with":
                            parts.append(f"{s_expr} LIKE lower(?)")
                            params.append(f"%{v}")
                            continue

                    if op == "in":
                        vals = f.get("values")
                        if not isinstance(vals, list):
                            vals = []
                        cleaned = [str(x).strip() for x in vals if isinstance(x, (str, int, float)) and str(x).strip()]
                        if not cleaned:
                            continue
                        placeholders = ", ".join(["lower(?)"] * len(cleaned))
                        parts.append(f"{s_expr} IN ({placeholders})")
                        params.extend(cleaned)
                        continue

                    # Numeric operators
                    if op in {"gt", "gte", "lt", "lte"}:
                        v = _get_num(f, "value")
                        if v is None:
                            continue
                        if op == "gt":
                            parts.append(f"{n_expr} > ?")
                        elif op == "gte":
                            parts.append(f"{n_expr} >= ?")
                        elif op == "lt":
                            parts.append(f"{n_expr} < ?")
                        else:
                            parts.append(f"{n_expr} <= ?")
                        params.append(v)
                        continue

                    if op == "between":
                        v1 = _get_num(f, "from")
                        v2 = _get_num(f, "to")
                        if v1 is None or v2 is None:
                            continue
                        lo = min(v1, v2)
                        hi = max(v1, v2)
                        parts.append(f"{n_expr} BETWEEN ? AND ?")
                        params.extend([lo, hi])
                        continue

                    # Date/time operators
                    if op in {"on", "before", "after"}:
                        v = _get_str(f, "value")
                        if not v:
                            continue
                        if op == "on":
                            parts.append(f"{d_expr} = cast(? as date)")
                            params.append(v)
                            continue
                        if op == "before":
                            parts.append(f"{ts_expr} < try_cast(? as timestamp)")
                            params.append(v)
                            continue
                        if op == "after":
                            parts.append(f"{ts_expr} > try_cast(? as timestamp)")
                            params.append(v)
                            continue

                    if op == "date_between":
                        v1 = _get_str(f, "from")
                        v2 = _get_str(f, "to")
                        if not v1 or not v2:
                            continue
                        parts.append(f"{d_expr} BETWEEN cast(? as date) AND cast(? as date)")
                        params.extend([v1, v2])
                        continue

                    # Relative date presets (computed in DuckDB)
                    if op == "today":
                        parts.append(f"{d_expr} = current_date")
                        continue
                    if op == "yesterday":
                        parts.append(f"{d_expr} = (current_date - interval '1 day')")
                        continue
                    if op == "last_30_days":
                        parts.append(f"{d_expr} >= (current_date - interval '30 day') AND {d_expr} <= current_date")
                        continue
                    if op in {"last_n_days", "last_n_weeks", "last_n_months"}:
                        n = f.get("n")
                        try:
                            n_int = int(n)
                        except Exception:
                            n_int = 0
                        if n_int <= 0:
                            continue
                        unit = "day" if op == "last_n_days" else ("week" if op == "last_n_weeks" else "month")
                        parts.append(f"{d_expr} >= (current_date - (? * interval '1 {unit}')) AND {d_expr} <= current_date")
                        params.append(n_int)
                        continue

                    if op == "this_week":
                        parts.append(f"{d_expr} >= cast(date_trunc('week', current_date) as date) AND {d_expr} < cast(date_trunc('week', current_date) + interval '1 week' as date)")
                        continue
                    if op == "prev_week":
                        parts.append(f"{d_expr} >= cast(date_trunc('week', current_date) - interval '1 week' as date) AND {d_expr} < cast(date_trunc('week', current_date) as date)")
                        continue
                    if op == "this_month":
                        parts.append(f"{d_expr} >= cast(date_trunc('month', current_date) as date) AND {d_expr} < cast(date_trunc('month', current_date) + interval '1 month' as date)")
                        continue
                    if op == "prev_month":
                        parts.append(f"{d_expr} >= cast(date_trunc('month', current_date) - interval '1 month' as date) AND {d_expr} < cast(date_trunc('month', current_date) as date)")
                        continue
                    if op == "this_year":
                        parts.append(f"{d_expr} >= cast(date_trunc('year', current_date) as date) AND {d_expr} < cast(date_trunc('year', current_date) + interval '1 year' as date)")
                        continue
                    if op == "prev_year":
                        parts.append(f"{d_expr} >= cast(date_trunc('year', current_date) - interval '1 year' as date) AND {d_expr} < cast(date_trunc('year', current_date) as date)")
                        continue

                if not parts:
                    return "", []
                return " AND ".join([f"({p})" for p in parts]), params

            def _safe_alias(s: str) -> str:
                out = re.sub(r"\s+", "_", (s or "").strip())
                out = re.sub(r"[^A-Za-z0-9_]+", "_", out)
                out = out.strip("_")
                return (out[:64] or "metric")

            offset_val = int(offset) if offset is not None else 0
            limit_clause = f"LIMIT {int(limit)}" if limit is not None else ""
            offset_clause = f"OFFSET {offset_val}" if offset_val else ""

            filter_predicate, filter_params = _build_filters_predicate((chart.config or {}).get("filters") if isinstance(chart.config, dict) else None)

            total_result_rows = total_rows
            is_aggregated = False
            aggregation_strategy = "raw_data"

            # Decide which columns to return
            if chart.chart_type == 'table' or (not chart.x_column and not chart.y_column):
                enable_table_agg = bool(cfg.get("tableEnableAggregation"))
                group_cols_raw = cfg.get("tableGroupByColumns") if isinstance(cfg.get("tableGroupByColumns"), list) else []
                metrics_raw = cfg.get("tableMetrics") if isinstance(cfg.get("tableMetrics"), list) else []

                group_cols = [_validate_ident(str(c)) for c in group_cols_raw if isinstance(c, str) and c.strip()]
                metrics = []
                used_aliases = set()
                agg_whitelist = {"sum", "avg", "min", "max", "count", "count_distinct"}

                if enable_table_agg and group_cols and metrics_raw:
                    for m in metrics_raw:
                        if not isinstance(m, dict):
                            continue
                        agg = str(m.get("agg") or "").strip().lower()
                        col = str(m.get("column") or "").strip()
                        alias_in = str(m.get("alias") or "").strip()

                        if agg not in agg_whitelist:
                            continue

                        if agg in ("sum", "avg", "min", "max", "count_distinct"):
                            if not col or col == "*":
                                continue
                            col = _validate_ident(col)

                        if agg == "count" and (not col or col == "*"):
                            col = "*"
                        elif agg == "count":
                            col = _validate_ident(col)

                        base_alias = alias_in or _safe_alias(f"{agg}_{'rows' if col == '*' else col}")
                        alias = _safe_alias(base_alias)
                        if '"' in alias or '\n' in alias or '\r' in alias or '\t' in alias:
                            continue
                        if alias in used_aliases:
                            i = 2
                            while f"{alias}_{i}" in used_aliases:
                                i += 1
                            alias = _safe_alias(f"{alias}_{i}")
                        used_aliases.add(alias)

                        if agg == "count" and col == "*":
                            expr = "COUNT(*)"
                        elif agg == "count":
                            expr = f'COUNT("{col}")'
                        elif agg == "count_distinct":
                            expr = f'COUNT(DISTINCT "{col}")'
                        else:
                            expr = f'{agg.upper()}("{col}")'

                        metrics.append({"agg": agg, "column": col, "alias": alias, "expr": expr})

                # Aggregated table path
                if enable_table_agg and group_cols and metrics:
                    is_aggregated = True
                    aggregation_strategy = "table_groupby"

                    requested = [_validate_ident(c) for c in _split_columns(columns)]
                    output_cols = [*group_cols, *[m["alias"] for m in metrics]]
                    allowed_cols = set(output_cols)

                    group_select = ", ".join([f'"{c}"' for c in group_cols])
                    metric_select = ", ".join([f"{m['expr']} AS \"{m['alias']}\"" for m in metrics])
                    inner_select = ", ".join([x for x in [group_select, metric_select] if x])
                    group_by_clause = f"GROUP BY {group_select}" if group_select else ""
                    where_clause = f"WHERE {filter_predicate}" if filter_predicate else ""
                    cte = f"WITH agg AS (SELECT {inner_select} FROM parquet_scan('{parquet_path}') {where_clause} {group_by_clause})"

                    # total groups/rows in aggregated result
                    total_result_rows = con.execute(f"{cte} SELECT COUNT(*) FROM agg").fetchone()[0]

                    # Outer select (optionally subset)
                    if requested:
                        requested_subset = [c for c in requested if c in allowed_cols]
                        select_clause = ", ".join([f'"{c}"' for c in requested_subset]) if requested_subset else "*"
                    else:
                        select_clause = "*"

                    order_clause = ""
                    sort_col = (sort_column or "").strip()
                    sort_direction = (sort_dir or "").strip().lower()
                    if sort_col and sort_col in allowed_cols:
                        sort_col = _validate_ident(sort_col)
                        if sort_direction not in ("asc", "desc"):
                            sort_direction = "asc"
                        order_clause = f'ORDER BY "{sort_col}" {sort_direction.upper()}'

                    where_clause = f"WHERE {filter_predicate}" if filter_predicate else ""

                    query = f"""
                    {cte}
                    SELECT {select_clause}
                    FROM agg
                    {order_clause}
                    {limit_clause}
                    {offset_clause}
                    """
                else:
                    # Raw table path
                    requested = [_validate_ident(c) for c in _split_columns(columns)]
                    select_clause = ", ".join([f'"{c}"' for c in requested]) if requested else "*"
                    where_clause = f"WHERE {filter_predicate}" if filter_predicate else ""

                    order_clause = ""
                    sort_col = (sort_column or "").strip()
                    sort_direction = (sort_dir or "").strip().lower()
                    if sort_col:
                        sort_col = _validate_ident(sort_col)
                        if sort_direction not in ("asc", "desc"):
                            sort_direction = "asc"
                        order_clause = f'ORDER BY "{sort_col}" {sort_direction.upper()}'

                    query = f"""
                    SELECT {select_clause}
                    FROM parquet_scan('{parquet_path}')
                    {where_clause}
                    {order_clause}
                    {limit_clause}
                    {offset_clause}
                    """
            else:
                requested = []
                for c in _split_columns(columns):
                    requested.append(_validate_ident(c))

                base_cols = [c for c in [chart.x_column, chart.y_column] if c]
                # Prefer requested columns when provided, but always include x/y if present.
                cols = list(dict.fromkeys([*requested, *base_cols]))

                # For line/area charts, match the builder's "full data" behavior by
                # applying time grain + aggregation server-side when configured.
                xy_series_by = cfg.get('seriesBy') if isinstance(cfg.get('seriesBy'), str) else None
                xy_time_grain = cfg.get('xTimeGrain') if isinstance(cfg.get('xTimeGrain'), str) else None
                xy_agg = cfg.get('aggregation') if isinstance(cfg.get('aggregation'), str) else None
                if aggregation and isinstance(aggregation, str):
                    xy_agg = aggregation

                xy_y_axes = cfg.get('yAxes') if isinstance(cfg.get('yAxes'), list) else None
                if xy_y_axes:
                    y_cols = [str(c).strip() for c in xy_y_axes if isinstance(c, str) and str(c).strip()]
                else:
                    y_cols = [str(chart.y_column).strip()] if chart.y_column else []

                def _normalize_xy_agg(v: Optional[str]) -> str:
                    vv = (v or '').strip().lower()
                    if vv in ('sum', 'avg', 'min', 'max', 'count'):
                        return vv
                    return 'none'

                def _normalize_xy_grain(v: Optional[str]) -> str:
                    vv = (v or '').strip().lower()
                    if vv in ('minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'):
                        return vv
                    return 'none'

                xy_agg_norm = _normalize_xy_agg(xy_agg)
                xy_grain_norm = _normalize_xy_grain(xy_time_grain)

                wants_xy_aggregation = (
                    chart.chart_type in ['line', 'area']
                    and bool(chart.x_column)
                    and (xy_agg_norm != 'none' or xy_grain_norm != 'none')
                    and len(y_cols) > 0
                )

                if wants_xy_aggregation:
                    x_col = _validate_ident(str(chart.x_column))
                    y_cols = [_validate_ident(c) for c in y_cols]
                    series_col = None
                    if xy_series_by and xy_series_by.strip():
                        series_col = _validate_ident(xy_series_by.strip())

                    # Build x bucketing expression. Parquet stores timestamps as ISO strings
                    # for SQL insights; DuckDB can cast ISO strings to TIMESTAMP.
                    ts_expr = f'try_cast("{x_col}" AS TIMESTAMP)'
                    if xy_grain_norm == 'none':
                        x_expr = f'"{x_col}"'
                    else:
                        # DuckDB supports date_trunc for minute/hour/day/week/month/quarter/year.
                        x_expr = f"date_trunc('{xy_grain_norm}', {ts_expr})"

                    metric_selects = []
                    if xy_agg_norm == 'count':
                        metric_selects.append('COUNT(*) AS "count"')
                    else:
                        fn = xy_agg_norm.upper()
                        for yc in y_cols:
                            metric_selects.append(f'{fn}("{yc}") AS "{yc}"')

                    group_cols = [f'{x_expr} AS "{x_col}"']
                    # IMPORTANT: when using date_trunc, GROUP BY the expression (not the alias),
                    # otherwise DuckDB groups by the original column and returns unbucketed rows.
                    group_by_cols = [f'"{x_col}"'] if xy_grain_norm == 'none' else [x_expr]
                    select_cols = [f'"{x_col}"']
                    if series_col:
                        group_cols.append(f'"{series_col}"')
                        group_by_cols.append(f'"{series_col}"')
                        select_cols.append(f'"{series_col}"')

                    inner_select = ", ".join([*group_cols, *metric_selects])
                    group_by_clause = f"GROUP BY {', '.join(group_by_cols)}"

                    where_clause = f"WHERE {filter_predicate}" if filter_predicate else ""
                    cte = f"WITH agg AS (SELECT {inner_select} FROM parquet_scan('{parquet_path}') {where_clause} {group_by_clause})"
                    total_result_rows = con.execute(f"{cte} SELECT COUNT(*) FROM agg").fetchone()[0]

                    # Columns returned
                    select_clause = ", ".join([*select_cols, *(["\"count\""] if xy_agg_norm == 'count' else [f'\"{c}\"' for c in y_cols])])

                    order_clause = f'ORDER BY "{x_col}" ASC'
                    if series_col:
                        order_clause = f'{order_clause}, "{series_col}" ASC'

                    query = f"""
                    {cte}
                    SELECT {select_clause}
                    FROM agg
                    {order_clause}
                    {limit_clause}
                    {offset_clause}
                    """

                    is_aggregated = True
                    aggregation_strategy = "xy_groupby"
                elif chart.chart_type == 'heatmap':
                    # Heatmap aggregation: group by X and Y, aggregate value column
                    x_col = cfg.get('xAxis') or chart.x_column
                    y_col = cfg.get('yAxis') or chart.y_column
                    value_col = cfg.get('heatmapValueColumn') or cfg.get('valueColumn')
                    heatmap_agg = cfg.get('heatmapAggregation') or cfg.get('aggregation') or 'sum'
                    
                    if not x_col or not y_col or not value_col:
                        # Fallback to raw data if columns not configured
                        quoted = ", ".join([f'"{c}"' for c in cols]) if cols else "*"
                        query = f"""
                        SELECT {quoted}
                        FROM parquet_scan('{parquet_path}')
                        {limit_clause}
                        {offset_clause}
                        """
                    else:
                        # Validate identifiers
                        x_col = _validate_ident(str(x_col))
                        y_col = _validate_ident(str(y_col))
                        value_col = _validate_ident(str(value_col))
                        
                        # Normalize aggregation function
                        agg_func = str(heatmap_agg).strip().lower()
                        if agg_func not in ('sum', 'avg', 'min', 'max', 'count'):
                            agg_func = 'sum'
                        
                        # Build aggregation query - keep original column name for value
                        if agg_func == 'count':
                            metric_expr = f'COUNT(*) AS "{value_col}"'
                        else:
                            metric_expr = f'{agg_func.upper()}("{value_col}") AS "{value_col}"'
                        
                        base_pred = f"\"{x_col}\" IS NOT NULL AND \"{y_col}\" IS NOT NULL"
                        if filter_predicate:
                            base_pred = f"{base_pred} AND ({filter_predicate})"
                        cte = f"""
                        WITH agg AS (
                            SELECT 
                                "{x_col}",
                                "{y_col}",
                                {metric_expr}
                            FROM parquet_scan('{parquet_path}')
                            WHERE {base_pred}
                            GROUP BY "{x_col}", "{y_col}"
                        )
                        """
                        
                        total_result_rows = con.execute(f"{cte} SELECT COUNT(*) FROM agg").fetchone()[0]
                        
                        query = f"""
                        {cte}
                        SELECT "{x_col}", "{y_col}", "{value_col}"
                        FROM agg
                        ORDER BY "{x_col}", "{y_col}"
                        {limit_clause}
                        {offset_clause}
                        """
                        
                        is_aggregated = True
                        aggregation_strategy = "heatmap_groupby"
                elif chart.chart_type == 'histogram':
                    # Histogram: return raw numeric values (binning happens in frontend)
                    value_col = cfg.get('histogramValueColumn') or chart.x_column
                    
                    print(f"📊 Histogram query config: histogramValueColumn={cfg.get('histogramValueColumn')}, x_column={chart.x_column}, final value_col={value_col}")
                    
                    if not value_col:
                        # Fallback to raw data if column not configured
                        quoted = ", ".join([f'"{c}"' for c in cols]) if cols else "*"
                        query = f"""
                        SELECT {quoted}
                        FROM parquet_scan('{parquet_path}')
                        {limit_clause}
                        {offset_clause}
                        """
                    else:
                        # Validate identifier
                        value_col = _validate_ident(str(value_col))
                        
                        # Just select the value column (non-null numeric values)
                        base_pred = f"\"{value_col}\" IS NOT NULL"
                        if filter_predicate:
                            base_pred = f"{base_pred} AND ({filter_predicate})"
                        query = f"""
                        SELECT "{value_col}"
                        FROM parquet_scan('{parquet_path}')
                        WHERE {base_pred}
                        {limit_clause}
                        {offset_clause}
                        """
                        
                        print(f"📊 Histogram query: {query}")
                        
                        is_aggregated = False
                        aggregation_strategy = "histogram_raw"
                elif chart.chart_type == 'boxplot':
                    # Box plot: return raw values (statistics calculated in frontend)
                    value_col = cfg.get('boxPlotValueColumn') or chart.x_column
                    category_col = cfg.get('boxPlotCategoryColumn')
                    
                    if not value_col:
                        # Fallback to raw data if column not configured
                        quoted = ", ".join([f'"{c}"' for c in cols]) if cols else "*"
                        query = f"""
                        SELECT {quoted}
                        FROM parquet_scan('{parquet_path}')
                        {limit_clause}
                        {offset_clause}
                        """
                    else:
                        # Validate identifiers
                        value_col = _validate_ident(str(value_col))
                        
                        # Select value column and optional category column
                        if category_col:
                            category_col = _validate_ident(str(category_col))
                            base_pred = f"\"{value_col}\" IS NOT NULL"
                            if filter_predicate:
                                base_pred = f"{base_pred} AND ({filter_predicate})"
                            query = f"""
                            SELECT "{value_col}", "{category_col}"
                            FROM parquet_scan('{parquet_path}')
                            WHERE {base_pred}
                            {limit_clause}
                            {offset_clause}
                            """
                        else:
                            base_pred = f"\"{value_col}\" IS NOT NULL"
                            if filter_predicate:
                                base_pred = f"{base_pred} AND ({filter_predicate})"
                            query = f"""
                            SELECT "{value_col}"
                            FROM parquet_scan('{parquet_path}')
                            WHERE {base_pred}
                            {limit_clause}
                            {offset_clause}
                            """
                        
                        is_aggregated = False
                        aggregation_strategy = "boxplot_raw"
                else:
                    quoted = ", ".join([f'\"{c}\"' for c in cols]) if cols else "*"
                    select_clause = quoted

                    # Filter: require the primary dimension to be present.
                    # For radar in metrics-mode, the primary dimension is the series column
                    # (radarSeriesBy if set; else x_column). Using x_column unconditionally can
                    # drop rows if x_column isn't the actual series key.
                    x_cols: list[str] = []
                    if chart.chart_type == 'radar':
                        axis_mode = cfg.get('radarAxisMode')
                        if axis_mode == 'metrics':
                            series_col = cfg.get('radarSeriesBy') or cfg.get('seriesBy') or chart.x_column
                            if isinstance(series_col, str) and series_col.strip():
                                x_cols = [_validate_ident(series_col.strip())]
                        else:
                            if chart.x_column:
                                x_cols = [_validate_ident(str(chart.x_column))]
                    else:
                        if chart.x_column:
                            x_cols = [_validate_ident(str(chart.x_column))]

                    filters = [f'\"{c}\" IS NOT NULL' for c in x_cols]
                    if filter_predicate:
                        filters.append(f"({filter_predicate})")
                    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
                    # For line/area, ordering by X helps a lot; for others leave stable ordering.
                    if chart.chart_type in ['line', 'area'] and chart.x_column:
                        order_clause = f'ORDER BY "{chart.x_column}" ASC'
                    else:
                        order_clause = ""

                    query = f"""
                    SELECT {select_clause}
                    FROM parquet_scan('{parquet_path}')
                    {where_clause}
                    {order_clause}
                    {limit_clause}
                    {offset_clause}
                    """

            if filter_params:
                result_df = con.execute(query, filter_params).df()
            else:
                result_df = con.execute(query).df()
            # Make results JSON-safe:
            # - Starlette JSONResponse uses allow_nan=False and will 500 on NaN/Infinity.
            # - pandas/numpy scalars should be converted to Python primitives.
            temporal_name_re = re.compile(r"(date|time|timestamp)", re.IGNORECASE)

            def _coerce_epoch_to_iso(n: Union[int, float]) -> Optional[str]:
                if not isinstance(n, (int, float)) or not math.isfinite(float(n)):
                    return None
                # Heuristic: interpret large numbers as epoch timestamps.
                # ns: ~1e18, ms: ~1e12, s: ~1e9
                abs_n = abs(float(n))
                try:
                    if abs_n >= 1e15:
                        dt = datetime.fromtimestamp(float(n) / 1e9, tz=timezone.utc)
                    elif abs_n >= 1e12:
                        dt = datetime.fromtimestamp(float(n) / 1e3, tz=timezone.utc)
                    elif abs_n >= 1e9:
                        dt = datetime.fromtimestamp(float(n), tz=timezone.utc)
                    else:
                        return None
                    return dt.isoformat()
                except Exception:
                    return None

            def _json_safe_value(key: str, v: Any) -> Any:
                if v is None:
                    return None
                # Convert numpy scalar types to native Python
                if isinstance(v, np.generic):
                    v = v.item()
                # Normalize non-finite floats
                if isinstance(v, float) and not math.isfinite(v):
                    return None
                # numpy datetime64
                if isinstance(v, np.datetime64):
                    try:
                        return pd.Timestamp(v).to_pydatetime().replace(tzinfo=timezone.utc).isoformat()
                    except Exception:
                        return str(v)
                # Datetime-like values
                if isinstance(v, (datetime, pd.Timestamp)):
                    try:
                        if isinstance(v, pd.Timestamp):
                            v = v.to_pydatetime()
                        if isinstance(v, datetime) and v.tzinfo is None:
                            v = v.replace(tzinfo=timezone.utc)
                        return v.isoformat()
                    except Exception:
                        return str(v)
                # String values that look like ISO timestamps - keep them as-is
                if isinstance(v, str) and len(v) >= 10 and 'T' in v:
                    return v
                # Epoch-like ints/floats in temporal-looking columns
                if temporal_name_re.search(key) and isinstance(v, (int, float)):
                    iso = _coerce_epoch_to_iso(v)
                    if iso is not None:
                        return iso
                return v

            records = result_df.to_dict('records')
            records = [
                {k: _json_safe_value(k, v) for k, v in (row or {}).items()}
                for row in records
            ]
            con.close()

            return {
                "columns": result_df.columns.tolist(),
                "data": records,
                "row_count": len(records),
                "total_source_rows": total_rows,
                "total_result_rows": total_result_rows,
                "is_aggregated": is_aggregated,
                "aggregation_strategy": aggregation_strategy,
                "metadata": {
                    "offset": offset_val,
                    "limit": int(limit) if limit is not None else None,
                    "returned_columns": result_df.columns.tolist(),
                    "has_more": (offset_val + len(records)) < total_result_rows,
                },
            }
                
        except Exception as e:
            print(f"[Error] Failed to load chart data: {str(e)}")
            import traceback
            traceback.print_exc()
            raise Exception(f"Failed to load data for {chart.chart_type}: {str(e)}")

    @staticmethod
    def get_chart_raw_data_paginated(
        chart: DashboardChart,
        db: Session,
        page: int = 1,
        page_size: int = 100
    ) -> Dict[str, Any]:
        """
        Get paginated raw data for the Data Preview tab.
        
        Args:
            chart: The chart configuration
            db: Database session
            page: Page number (1-based)
            page_size: Rows per page
            
        Returns:
            Dict with columns, data, pagination info
        """
        dataset = db.query(Dataset).filter(Dataset.id == chart.dataset_id).first()
        if not dataset:
            raise Exception("Dataset not found")
        
        parquet_path = dataset.schema_info.get("parquet_path")
        if not parquet_path or not os.path.exists(parquet_path):
            raise Exception("Data file not found")
        
        offset = (page - 1) * page_size
        
        query = f"""
            SELECT * FROM parquet_scan('{parquet_path}')
            LIMIT {page_size} OFFSET {offset}
        """
        
        count_query = f"SELECT COUNT(*) as total FROM parquet_scan('{parquet_path}')"
        
        con = duckdb.connect(database=':memory:')
        try:
            total_rows = con.execute(count_query).fetchone()[0]
            result_df = con.execute(query).df()
            result_df = result_df.where(pd.notnull(result_df), None)
            
            return {
                "columns": result_df.columns.tolist(),
                "data": result_df.to_dict('records'),
                "page": page,
                "page_size": page_size,
                "total_rows": total_rows,
                "total_pages": (total_rows + page_size - 1) // page_size
            }
        finally:
            con.close()

    @staticmethod
    def refresh_dashboard_data(
        dashboard_id: str,
        user: User,
        db: Session
    ) -> Dict[str, Any]:
        """
        Manually refresh dashboard data by re-executing SQL queries.
        
        This is used for:
        1. Manual refresh button
        2. Scheduled refresh jobs
        
        Only works for SQL insights (dashboards with sql_query in chart config).
        
        Args:
            dashboard_id: Dashboard ID
            user: User object
            db: Database session
            
        Returns:
            Dict with refresh status
        """
        dashboard = DashboardService.get_dashboard_by_id(dashboard_id, user, db)
        if not dashboard:
            raise ValueError("Dashboard not found")
        
        # Only single-chart SQL insights can be refreshed
        if len(dashboard.charts) != 1:
            raise ValueError("Only SQL insights can be refreshed")
        
        chart = dashboard.charts[0]
        sql_query = chart.config.get("sql_query") if chart.config else None
        sql_sources = chart.config.get("sql_sources") if chart.config else None
        
        if not sql_query or not sql_sources:
            raise ValueError("This dashboard doesn't have a SQL query to refresh")
        
        print(f"[Refresh] Re-executing SQL query for dashboard {dashboard_id}")
        
        # Re-execute the query
        df = QueryService.execute_query_to_dataframe_federated(
            query=sql_query,
            sources=sql_sources,
            user=user,
            db=db,
            max_rows=100000,
        )
        
        # Update the existing dataset
        DatasetService.update_dataset_from_dataframe(
            dataset_id=chart.dataset_id,
            df=df,
            db=db
        )
        
        # Update last_refreshed_at timestamp
        dashboard.last_refreshed_at = datetime.utcnow()
        db.commit()
        
        print(f"[Refresh] Successfully refreshed {len(df)} rows")
        
        return {
            "status": "success",
            "rows_refreshed": len(df),
            "refreshed_at": dashboard.last_refreshed_at.isoformat()
        }

    @staticmethod
    def execute_live_query(
        chart: DashboardChart,
        user: User,
        db: Session
    ) -> Dict[str, Any]:
        """
        Execute live query for real-time data.
        
        This bypasses the materialized dataset and executes the query directly.
        Used when execution_mode = 'live'.
        
        Args:
            chart: The chart configuration
            user: User object
            db: Database session
            
        Returns:
            Query results with aggregation applied
        """
        sql_query = chart.config.get("sql_query") if chart.config else None
        sql_sources = chart.config.get("sql_sources") if chart.config else None
        
        if not sql_query or not sql_sources:
            raise ValueError("Chart doesn't have SQL query configuration")
        
        print(f"[Live Query] Executing for chart {chart.id}")
        
        # Execute the query
        df = QueryService.execute_query_to_dataframe_federated(
            query=sql_query,
            sources=sql_sources,
            user=user,
            db=db,
            max_rows=100000,
        )
        
        # Now aggregate based on chart type
        # For now, return raw data - aggregation will be added
        return {
            "columns": df.columns.tolist(),
            "data": df.to_dict('records'),
            "row_count": len(df),
            "is_live": True
        }

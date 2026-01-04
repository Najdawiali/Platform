# backend/app/api/dashboards.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models.user import User
from ..schemas.dashboard import (
    Dashboard, DashboardCreate, DashboardUpdate, DashboardListItem,
    DashboardChart, DashboardChartCreate, DashboardChartUpdate
)
from ..services.dashboard_service import DashboardService
from .auth import get_current_user

from ..schemas.query import QuerySource
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


class SQLInsightChart(BaseModel):
    chart_type: str
    x_column: Optional[str] = None
    y_column: Optional[str] = None
    title: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class SQLInsightCreate(BaseModel):
    name: str
    description: Optional[str] = None
    query: str
    sources: List[QuerySource]
    chart: SQLInsightChart


@router.post("/", response_model=Dashboard, status_code=status.HTTP_201_CREATED)
def create_dashboard(
    dashboard: DashboardCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new dashboard"""
    try:
        created_dashboard = DashboardService.create_dashboard(current_user, dashboard, db)
        return DashboardService.build_dashboard_response(created_dashboard, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/from-sql", response_model=Dashboard, status_code=status.HTTP_201_CREATED)
def create_sql_insight(
    insight: SQLInsightCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a 1-chart dashboard (Insight) from a SQL query by materializing results to a dataset."""
    try:
        created = DashboardService.create_sql_insight(current_user, insight, db)
        return DashboardService.build_dashboard_response(created, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/", response_model=List[DashboardListItem])
def get_dashboards(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all dashboards for the current user (excludes insights)"""
    return DashboardService.get_user_dashboards(current_user, db)


@router.get("/insights", response_model=List[DashboardListItem])
def get_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all insights for the current user (excludes regular dashboards)"""
    return DashboardService.get_user_insights(current_user, db)


@router.get("/{dashboard_id}", response_model=Dashboard)
def get_dashboard(
    dashboard_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific dashboard by ID"""
    dashboard = DashboardService.get_dashboard_by_id(dashboard_id, current_user, db)
    
    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found"
        )
    
    return DashboardService.build_dashboard_response(dashboard, db)


@router.put("/{dashboard_id}", response_model=Dashboard)
def update_dashboard(
    dashboard_id: str,
    dashboard_data: DashboardUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update dashboard metadata"""
    dashboard = DashboardService.update_dashboard(dashboard_id, current_user, dashboard_data, db)
    
    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found"
        )
    
    return DashboardService.build_dashboard_response(dashboard, db)


@router.put("/{dashboard_id}/from-sql", response_model=Dashboard)
def update_sql_insight(
    dashboard_id: str,
    insight: SQLInsightCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a SQL-based dashboard/insight by re-materializing the query results."""
    try:
        updated = DashboardService.update_sql_insight(dashboard_id, current_user, insight, db)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Dashboard not found"
            )
        return DashboardService.build_dashboard_response(updated, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dashboard(
    dashboard_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a dashboard"""
    success = DashboardService.delete_dashboard(dashboard_id, current_user, db)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found"
        )
    
    return None


@router.post("/{dashboard_id}/charts", response_model=DashboardChart, status_code=status.HTTP_201_CREATED)
def add_chart_to_dashboard(
    dashboard_id: str,
    chart: DashboardChartCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a new chart to a dashboard"""
    try:
        created_chart = DashboardService.add_chart_to_dashboard(dashboard_id, current_user, chart, db)
        
        if not created_chart:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Dashboard not found"
            )
        
        return created_chart
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{dashboard_id}/charts/{chart_id}", response_model=DashboardChart)
def update_chart(
    dashboard_id: str,
    chart_id: str,
    chart_data: DashboardChartUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a chart in a dashboard"""
    chart = DashboardService.update_chart(chart_id, dashboard_id, current_user, chart_data, db)
    
    if not chart:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chart or dashboard not found"
        )
    
    return chart


@router.delete("/{dashboard_id}/charts/{chart_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chart(
    dashboard_id: str,
    chart_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a chart from a dashboard"""
    success = DashboardService.delete_chart(chart_id, dashboard_id, current_user, db)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chart or dashboard not found"
        )
    
    return None


@router.get("/{dashboard_id}/charts/{chart_id}/aggregated-data")
def get_chart_aggregated_data(
    dashboard_id: str,
    chart_id: str,
    aggregation: Optional[str] = None,
    columns: Optional[str] = None,
    offset: Optional[int] = None,
    limit: Optional[int] = None,
    sort_column: Optional[str] = None,
    sort_dir: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get pre-aggregated data for chart visualization (SNAPSHOT/SCHEDULED mode).
    
    This endpoint:
    - Reads from the materialized parquet file
    - Performs server-side aggregation using DuckDB
    - Returns only the data points needed for the chart (10-100 rows)
    - Dramatically reduces network transfer and improves performance
    - Supports progressive/lazy loading with offset/limit for large datasets
    
    Query params:
    - aggregation: Override aggregation function (sum, avg, min, max, count)
    - offset: Starting position for pagination (0-based)
    - limit: Number of records to return (default: chart-specific)
    """
    dashboard = DashboardService.get_dashboard_by_id(dashboard_id, current_user, db)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    
    chart = next((c for c in dashboard.charts if str(c.id) == str(chart_id)), None)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    
    try:
        result = DashboardService.get_chart_aggregated_data(
            chart, db, aggregation, offset, limit, columns, sort_column, sort_dir,
            dashboard_config=(dashboard.config if hasattr(dashboard, "config") else None),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{dashboard_id}/charts/{chart_id}/raw-data")
def get_chart_raw_data(
    dashboard_id: str,
    chart_id: str,
    page: int = 1,
    page_size: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get paginated raw data for the Data Preview tab.
    
    This endpoint:
    - Returns paginated raw data from the parquet file
    - Used for the "Data Preview" tab
    - Prevents loading entire dataset into browser
    
    Query params:
    - page: Page number (1-based)
    - page_size: Rows per page (default 100)
    """
    dashboard = DashboardService.get_dashboard_by_id(dashboard_id, current_user, db)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    
    chart = next((c for c in dashboard.charts if str(c.id) == str(chart_id)), None)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    
    try:
        result = DashboardService.get_chart_raw_data_paginated(chart, db, page, page_size)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{dashboard_id}/refresh")
def refresh_dashboard(
    dashboard_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually refresh dashboard data (SNAPSHOT/SCHEDULED mode).
    
    This endpoint:
    - Re-executes the SQL query
    - Updates the materialized parquet file
    - Updates last_refreshed_at timestamp
    
    Only works for SQL insights.
    """
    try:
        result = DashboardService.refresh_dashboard_data(dashboard_id, current_user, db)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upgrade-linked-tiles")
def upgrade_linked_tiles(
    dashboard_id: Optional[str] = None,
    dry_run: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upgrade existing snapshot dashboard tiles to linked tiles (best-effort).

    - When `dashboard_id` is provided, upgrades a single dashboard.
    - Otherwise upgrades all dashboards for the current user.
    - When `dry_run=true`, returns what would be changed without persisting.
    """
    try:
        return DashboardService.upgrade_user_dashboards_to_linked_tiles(
            current_user,
            db,
            dashboard_id=dashboard_id,
            dry_run=dry_run,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{dashboard_id}/charts/{chart_id}/live-data")
def get_chart_live_data(
    dashboard_id: str,
    chart_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Execute live query and return fresh data (LIVE mode).
    
    This endpoint:
    - Executes the SQL query directly (no caching)
    - Returns fresh data from the source
    - Slower but always up-to-date
    
    Only use when execution_mode = 'live'.
    """
    dashboard = DashboardService.get_dashboard_by_id(dashboard_id, current_user, db)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    
    chart = next((c for c in dashboard.charts if str(c.id) == str(chart_id)), None)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    
    try:
        result = DashboardService.execute_live_query(chart, current_user, db)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

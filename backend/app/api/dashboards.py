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

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


@router.post("/", response_model=Dashboard, status_code=status.HTTP_201_CREATED)
def create_dashboard(
    dashboard: DashboardCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new dashboard"""
    try:
        created_dashboard = DashboardService.create_dashboard(current_user, dashboard, db)
        return created_dashboard
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/", response_model=List[DashboardListItem])
def get_dashboards(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all dashboards for the current user"""
    return DashboardService.get_user_dashboards(current_user, db)


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
    
    return dashboard


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
    
    return dashboard


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

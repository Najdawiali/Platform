# backend/app/schemas/dashboard.py
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class DashboardChartBase(BaseModel):
    """Base schema for dashboard chart"""
    dataset_id: str
    chart_type: str
    x_column: Optional[str] = None
    y_column: Optional[str] = None
    title: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    position_x: int = 0
    position_y: int = 0
    width: int = 6
    height: int = 4


class DashboardChartCreate(DashboardChartBase):
    """Schema for creating a dashboard chart"""
    pass


class DashboardChartUpdate(BaseModel):
    """Schema for updating a dashboard chart"""
    chart_type: Optional[str] = None
    x_column: Optional[str] = None
    y_column: Optional[str] = None
    title: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None


class DashboardChart(DashboardChartBase):
    """Schema for dashboard chart response"""
    id: str
    dashboard_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class DashboardBase(BaseModel):
    """Base schema for dashboard"""
    name: str
    description: Optional[str] = None


class DashboardCreate(DashboardBase):
    """Schema for creating a dashboard"""
    charts: List[DashboardChartCreate] = []


class DashboardUpdate(BaseModel):
    """Schema for updating a dashboard"""
    name: Optional[str] = None
    description: Optional[str] = None


class Dashboard(DashboardBase):
    """Schema for dashboard response"""
    id: str
    user_id: str
    is_insight: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    charts: List[DashboardChart] = []

    class Config:
        from_attributes = True


class DashboardListItem(BaseModel):
    """Schema for dashboard in list view"""
    id: str
    name: str
    description: Optional[str] = None
    chart_count: int
    first_chart_type: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

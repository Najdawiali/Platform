# backend/app/models/dashboard.py
from sqlalchemy import Column, String, Text, DateTime, Integer, JSON, ForeignKey, Float, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from ..database import Base


class Dashboard(Base):
    """Store user-created dashboards"""
    __tablename__ = "dashboards"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    
    # Execution Mode Configuration
    execution_mode = Column(String, default="snapshot")  # 'snapshot', 'live', 'scheduled'
    
    # Refresh Configuration (for scheduled mode)
    refresh_schedule = Column(String, nullable=True)  # Cron expression: "0 */6 * * *"
    auto_refresh_enabled = Column(Boolean, default=False)
    last_refreshed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Cache Configuration (for live mode)
    cache_ttl_seconds = Column(Integer, nullable=True)  # Cache duration in seconds
    
    # Distinguish Insights from Dashboards
    is_insight = Column(Boolean, default=False)  # True for insights, False for dashboards

    # Mark a dashboard as the user's main dashboard
    is_main = Column(Boolean, default=False)

    # Visibility
    is_private = Column(Boolean, default=True)

    # Dashboard-level configuration (e.g., global filters). Kept separate from chart configs.
    config = Column(JSON, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="dashboards")
    charts = relationship("DashboardChart", back_populates="dashboard", cascade="all, delete-orphan")


class DashboardChart(Base):
    """Store individual charts within a dashboard"""
    __tablename__ = "dashboard_charts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dashboard_id = Column(String, ForeignKey("dashboards.id"), nullable=False)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False)
    
    # Chart configuration
    chart_type = Column(String, nullable=False)  # 'bar', 'line', 'pie', 'scatter', etc.
    x_column = Column(String, nullable=True)
    y_column = Column(String, nullable=True)
    title = Column(String, nullable=True)
    config = Column(JSON, nullable=True)  # Additional chart-specific config
    
    # Position and size (for grid layout)
    position_x = Column(Integer, default=0)
    position_y = Column(Integer, default=0)
    width = Column(Integer, default=6)  # Grid units (12-column grid)
    height = Column(Integer, default=4)  # Grid units
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    dashboard = relationship("Dashboard", back_populates="charts")
    dataset = relationship("Dataset")

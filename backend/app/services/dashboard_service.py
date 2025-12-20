# backend/app/services/dashboard_service.py
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models.dashboard import Dashboard, DashboardChart
from ..models.user import User
from ..models.dataset import Dataset
from ..schemas.dashboard import (
    DashboardCreate, DashboardUpdate, DashboardListItem,
    DashboardChartCreate, DashboardChartUpdate
)


class DashboardService:
    """Service for managing dashboards"""

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
            description=dashboard_data.description
        )
        
        db.add(dashboard)
        db.flush()  # Get dashboard.id before creating charts
        
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
    def get_user_dashboards(user: User, db: Session) -> List[DashboardListItem]:
        """Get all dashboards for a user with chart count"""
        
        dashboards = db.query(
            Dashboard.id,
            Dashboard.name,
            Dashboard.description,
            Dashboard.created_at,
            Dashboard.updated_at,
            func.count(DashboardChart.id).label('chart_count')
        ).outerjoin(
            DashboardChart, Dashboard.id == DashboardChart.dashboard_id
        ).filter(
            Dashboard.user_id == user.id
        ).group_by(
            Dashboard.id,
            Dashboard.name,
            Dashboard.description,
            Dashboard.created_at,
            Dashboard.updated_at
        ).all()
        
        return [
            DashboardListItem(
                id=d.id,
                name=d.name,
                description=d.description,
                chart_count=d.chart_count,
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
        
        return db.query(Dashboard).filter(
            Dashboard.id == dashboard_id,
            Dashboard.user_id == user.id
        ).first()

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

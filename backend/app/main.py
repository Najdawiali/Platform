# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import os
import asyncio
import logging
from typing import Optional
from .database import engine, Base
from sqlalchemy import text
from .database import SessionLocal
from .config import settings

# Import all models to ensure they're registered
from .models import user, dataset, connection, dashboard, table_snapshot, saved_query

# Import routers
from .api import auth, datasets, connections, dashboards, query, saved_queries


UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Create database tables
Base.metadata.create_all(bind=engine)


def _ensure_schema() -> None:
    """Best-effort lightweight migrations for local SQLite."""
    try:
        if engine.dialect.name != "sqlite":
            return
        with engine.begin() as conn:
            cols = [row[1] for row in conn.execute(text("PRAGMA table_info(dashboards)"))]
            if "is_main" not in cols:
                conn.execute(text("ALTER TABLE dashboards ADD COLUMN is_main BOOLEAN DEFAULT 0"))
            if "is_private" not in cols:
                conn.execute(text("ALTER TABLE dashboards ADD COLUMN is_private BOOLEAN DEFAULT 1"))
    except Exception:
        # Do not block app startup if migration fails.
        pass


_ensure_schema()

app = FastAPI(
    title="Data Platform API",
    description="API for data integration and analytics platform",
    version="2.0.0",
    redirect_slashes=False  # Disable automatic redirects for trailing slashes
)

# Add Session Middleware (required for OAuth)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    max_age=3600  # 1 hour session
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5204", 
        "http://localhost:3000",
        "*"  # Allow ngrok and other testing URLs
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "message": "Data Platform API",
        "status": "running",
        "version": "2.0.0",
        "supported_sources": [
            "csv",
            "excel",
            "snowflake",
            "sqlserver",
            "mongodb",
            "postgresql",
            "mysql"
        ]
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}


# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(connections.router, prefix="/api/connections", tags=["Connections"])
app.include_router(datasets.router, prefix="/api/datasets", tags=["Datasets"])
app.include_router(dashboards.router)
app.include_router(query.router, prefix="/api/query", tags=["Query"])
app.include_router(saved_queries.router)


logger = logging.getLogger("data-platform")
_auto_sync_task: Optional[asyncio.Task] = None


async def _auto_sync_loop() -> None:
    """Periodically sync all active connections using saved credentials."""
    # Run forever until cancelled
    while True:
        # Tick frequently; each connection decides whether it's due
        await asyncio.sleep(60)

        if not settings.AUTO_SYNC_ENABLED:
            continue

        db = SessionLocal()
        try:
            from .models.connection import Connection
            from .services.connection_service import ConnectionService

            connections_to_sync = (
                db.query(Connection)
                .filter(Connection.is_active == "true")
                .all()
            )

            for conn in connections_to_sync:
                try:
                    ConnectionService.sync_connection_system(conn.id, db)
                except Exception as e:
                    logger.warning("Auto-sync failed for %s: %s", conn.id, str(e))
        finally:
            db.close()


@app.on_event("startup")
async def _startup_auto_sync() -> None:
    global _auto_sync_task
    if _auto_sync_task is None:
        _auto_sync_task = asyncio.create_task(_auto_sync_loop())


@app.on_event("shutdown")
async def _shutdown_auto_sync() -> None:
    global _auto_sync_task
    if _auto_sync_task is not None:
        _auto_sync_task.cancel()
        _auto_sync_task = None
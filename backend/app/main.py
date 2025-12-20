# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from .database import engine, Base

# Import all models to ensure they're registered
from .models import user, dataset, connection, dashboard

# Import routers
from .api import auth, datasets, connections, dashboards


UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Data Platform API",
    description="API for data integration and analytics platform",
    version="2.0.0",
    redirect_slashes=False  # Disable automatic redirects for trailing slashes
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5202", "http://localhost:3000"],
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
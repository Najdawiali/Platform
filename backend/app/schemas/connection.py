# backend/app/schemas/connection.py
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum


class SourceType(str, Enum):
    """Supported data source types"""
    CSV = "csv"
    EXCEL = "excel"
    JSON = "json"
    TXT = "txt"
    MD = "md"
    MDX = "mdx"
    PDF = "pdf"
    SNOWFLAKE = "snowflake"
    SQLSERVER = "sqlserver"
    MONGODB = "mongodb"
    POSTGRESQL = "postgresql"
    MYSQL = "mysql"


# ===== CSV/Excel/JSON/TXT Schemas =====
class FileUploadCredentials(BaseModel):
    """Credentials for file upload (CSV/Excel/JSON/TXT)"""
    files: List[str]  # File paths after upload


# ===== Snowflake Schemas =====
class SnowflakeCredentials(BaseModel):
    """Credentials for Snowflake connection"""
    account: str
    username: str
    password: str
    warehouse: str
    database: str
    schema_name: Optional[str] = None
    role: Optional[str] = None


# ===== SQL Server Schemas =====
class SQLServerCredentials(BaseModel):
    """Credentials for SQL Server connection"""
    host: str
    port: int = 1433
    database: str
    username: str
    password: str
    driver: str = "ODBC Driver 17 for SQL Server"


# ===== MongoDB Schemas =====
class MongoDBCredentials(BaseModel):
    """Credentials for MongoDB connection"""
    connection_string: str
    database: str
    collection: Optional[str] = None


# ===== PostgreSQL Schemas =====
class PostgreSQLCredentials(BaseModel):
    """Credentials for PostgreSQL connection"""
    host: str
    port: int = 5432
    database: str
    username: str
    password: str


# ===== Connection Base Schemas =====
class ConnectionBase(BaseModel):
    name: str
    source_type: SourceType
    description: Optional[str] = None


class ConnectionCreate(ConnectionBase):
    credentials: Dict[str, Any]  # Dynamic based on source_type


class ConnectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    credentials: Optional[Dict[str, Any]] = None


class ConnectionResponse(ConnectionBase):
    id: str
    user_id: str
    is_active: str
    test_status: Optional[str]
    test_message: Optional[str]
    last_tested: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class ConnectionTestRequest(BaseModel):
    """Request to test a connection"""
    source_type: SourceType
    credentials: Dict[str, Any]


class ConnectionTestResponse(BaseModel):
    """Response from testing a connection"""
    success: bool
    message: str
    metadata: Optional[Dict[str, Any]] = None  # e.g., available databases, tables


# ===== Source Selection =====
class SourceSelectionRequest(BaseModel):
    """User selects data source type"""
    source_type: SourceType


class SourceSelectionResponse(BaseModel):
    """Return what the frontend needs to collect"""
    source_type: SourceType
    required_fields: List[Dict[str, Any]]
    instructions: str


# Example required_fields:
# [
#   {"name": "account", "type": "text", "label": "Account ID", "required": true},
#   {"name": "password", "type": "password", "label": "Password", "required": true}
# ]


# ===== Sheet Information (for Excel) =====
class SheetInfo(BaseModel):
    """Information about an Excel sheet"""
    sheet_name: str
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    columns: Optional[List[str]] = None
    error: Optional[str] = None


class ExcelSheetsResponse(BaseModel):
    """Response containing all sheets in Excel file"""
    file_name: str
    sheets: List[SheetInfo]
    total_sheets: int
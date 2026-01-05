# backend/app/models/connection.py
from sqlalchemy import Column, String, Text, DateTime, JSON, ForeignKey, Enum as SQLEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
import enum
from ..database import Base


class SourceType(str, enum.Enum):
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
    SALESFORCE = "salesforce"


class Connection(Base):
    """Store data source connections with credentials"""
    __tablename__ = "connections"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Connection details
    name = Column(String, nullable=False)  # User-friendly name
    source_type = Column(SQLEnum(SourceType), nullable=False)
    description = Column(Text)

    # Encrypted credentials stored as JSON
    # Structure depends on source_type:
    # CSV/Excel: {"file_paths": [...]}
    # Snowflake: {"account": "", "username": "", "password": "", "warehouse": "", "database": ""}
    # SQL Server: {"host": "", "port": "", "database": "", "username": "", "password": ""}
    # MongoDB: {"connection_string": "", "database": ""}
    credentials = Column(JSON)  # Should be encrypted in production!

    # Connection metadata
    is_active = Column(String, default="true")  # "true"/"false" as string for SQLite
    last_tested = Column(DateTime(timezone=True))
    test_status = Column(String)  # "success", "failed", "pending"
    test_message = Column(Text)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="connections")
    datasets = relationship("Dataset", back_populates="connection", cascade="all, delete-orphan")

# Add to User model relationship
# In app/models/user.py add:
# connections = relationship("Connection", back_populates="user", cascade="all, delete-orphan")
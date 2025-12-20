# backend/app/models/dataset.py
from sqlalchemy import Column, String, Integer, BigInteger, Text, DateTime, JSON, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from ..database import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    connection_id = Column(String, ForeignKey("connections.id", ondelete="CASCADE"), nullable=True)

    # Basic info
    name = Column(String, nullable=False)
    description = Column(Text)

    # Source information
    source_type = Column(String)  # csv, excel, snowflake, etc.
    source_identifier = Column(String)  # file_path, table_name, collection_name, etc.

    # For Excel: track which sheet this dataset represents
    sheet_name = Column(String)  # If source is Excel with multiple sheets
    parent_dataset_id = Column(String)  # If this is a sheet from multi-sheet file

    # File info (for file-based sources)
    original_filename = Column(String)
    file_path = Column(String)
    file_size = Column(BigInteger)

    # Data info
    row_count = Column(Integer)
    column_count = Column(Integer)
    schema_info = Column(JSON)  # Column names, types, statistics, quality report

    # Status tracking
    status = Column(String, default="processing")  # processing, ready, error
    error_message = Column(Text)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="datasets")
    connection = relationship("Connection", back_populates="datasets")
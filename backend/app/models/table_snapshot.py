# backend/app/models/table_snapshot.py

from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.sql import func
import uuid

from ..database import Base


class TableSnapshot(Base):
    """Stores a lightweight per-table snapshot at the last sync.

    Snapshot is used to:
    - show schema (columns)
    - show row counts
    - show sample rows
    - avoid reflecting live DB changes until sync
    """

    __tablename__ = "table_snapshots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    connection_id = Column(String, ForeignKey("connections.id", ondelete="CASCADE"), nullable=False)

    # For MySQL: database_name
    # For PostgreSQL: schema_name
    # For MongoDB: database_name
    database_name = Column(String, nullable=True)
    schema_name = Column(String, nullable=True)

    table_name = Column(String, nullable=False)

    # Stored snapshot payload
    columns = Column(JSON, nullable=True)  # list[dict] or list[str]
    row_count = Column(Integer, nullable=True)
    sample_rows = Column(JSON, nullable=True)  # list[dict]

    synced_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("connection_id", "database_name", "schema_name", "table_name", name="uq_snapshot_key"),
    )

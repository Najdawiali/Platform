"""Database wiring.

Important: SQLite URLs like `sqlite:///./data_platform.db` are relative to the *process
working directory*, which can vary depending on how uvicorn is launched. That can
accidentally create/use a different DB file (and produce 500s like "no such table").

We resolve relative sqlite file paths against the backend directory so the DB location
is stable.
"""

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker


def _resolve_database_url(raw_url: str) -> str:
    if not raw_url:
        return raw_url

    # For SQLite, SQLAlchemy treats `sqlite:///relative.db` as relative to CWD.
    # Convert relative paths into absolute paths anchored at the backend folder.
    if raw_url.startswith("sqlite:////"):
        return raw_url  # already absolute on POSIX

    if raw_url.startswith("sqlite:///"):
        sqlite_path = raw_url[len("sqlite:///"):]
        if sqlite_path.startswith("/"):
            return raw_url  # already absolute

        backend_dir = Path(__file__).resolve().parents[1]  # .../backend
        abs_path = (backend_dir / sqlite_path).resolve()
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{abs_path.as_posix()}"

    return raw_url


DATABASE_URL = _resolve_database_url(os.getenv("DATABASE_URL", "sqlite:///./data_platform.db"))

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
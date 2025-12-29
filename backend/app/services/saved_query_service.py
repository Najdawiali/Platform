from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
import uuid

import pandas as pd
from sqlalchemy.orm import Session

from ..models.saved_query import SavedQuery
from ..models.user import User
from ..schemas.saved_query import SavedQueryCreate


@dataclass
class SavedQueryWithText:
    saved_query: SavedQuery
    query: str


class SavedQueryService:
    BASE_DIR = Path("./uploads") / "saved_queries"

    @staticmethod
    def _sanitize_name(name: str) -> str:
        return (name or "").strip()

    @staticmethod
    def _sanitize_description(description: Optional[str]) -> Optional[str]:
        if description is None:
            return None
        d = description.strip()
        return d if d else None

    @classmethod
    def create_saved_query(cls, current_user: User, payload: SavedQueryCreate, db: Session) -> SavedQuery:
        name = cls._sanitize_name(payload.name)
        if not name:
            raise ValueError("Name is required")

        query = (payload.query or "").strip()
        if not query:
            raise ValueError("Query is required")

        description = cls._sanitize_description(payload.description)

        saved_query_id = str(uuid.uuid4())
        user_dir = cls.BASE_DIR / str(current_user.id)
        user_dir.mkdir(parents=True, exist_ok=True)
        parquet_path = user_dir / f"{saved_query_id}.parquet"

        created_at = datetime.now(timezone.utc)

        # Store the saved query as Parquet (as requested).
        df = pd.DataFrame(
            [
                {
                    "id": saved_query_id,
                    "user_id": str(current_user.id),
                    "name": name,
                    "description": description,
                    "query": query,
                    "created_at": created_at.isoformat(),
                }
            ]
        )

        df.to_parquet(parquet_path, index=False)

        record = SavedQuery(
            id=saved_query_id,
            user_id=str(current_user.id),
            name=name,
            description=description,
            parquet_path=str(parquet_path),
        )

        db.add(record)
        db.commit()
        db.refresh(record)
        return record

    @staticmethod
    def list_saved_queries(current_user: User, db: Session) -> List[SavedQuery]:
        return (
            db.query(SavedQuery)
            .filter(SavedQuery.user_id == str(current_user.id))
            .order_by(SavedQuery.created_at.desc())
            .all()
        )

    @staticmethod
    def get_saved_query(current_user: User, saved_query_id: str, db: Session) -> Optional[SavedQuery]:
        return (
            db.query(SavedQuery)
            .filter(SavedQuery.id == saved_query_id)
            .filter(SavedQuery.user_id == str(current_user.id))
            .first()
        )

    @staticmethod
    def read_query_text(saved_query: SavedQuery) -> str:
        path = Path(saved_query.parquet_path)
        if not path.exists():
            raise FileNotFoundError("Saved query file not found")

        df = pd.read_parquet(path)
        if df.empty or "query" not in df.columns:
            return ""
        return str(df.iloc[0]["query"] or "")

    @staticmethod
    def delete_saved_query(current_user: User, saved_query_id: str, db: Session) -> bool:
        record = (
            db.query(SavedQuery)
            .filter(SavedQuery.id == saved_query_id)
            .filter(SavedQuery.user_id == str(current_user.id))
            .first()
        )
        if not record:
            return False

        # Best-effort file removal
        try:
            path = Path(record.parquet_path)
            if path.exists():
                path.unlink()
        except Exception:
            # Don't block deletion if filesystem cleanup fails
            pass

        db.delete(record)
        db.commit()
        return True

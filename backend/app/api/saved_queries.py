from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import logging

from ..database import get_db
from ..models.user import User
from ..schemas.saved_query import SavedQueryCreate, SavedQueryListItem, SavedQueryDetail
from ..services.saved_query_service import SavedQueryService
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/saved-queries", tags=["Saved Queries"])


@router.get("/", response_model=List[SavedQueryListItem])
def list_saved_queries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SavedQueryService.list_saved_queries(current_user, db)


@router.post("/", response_model=SavedQueryListItem, status_code=status.HTTP_201_CREATED)
def create_saved_query(
    payload: SavedQueryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return SavedQueryService.create_saved_query(current_user, payload, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception:
        logger.exception("Failed to create saved query")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create saved query")


@router.get("/{saved_query_id}", response_model=SavedQueryDetail)
def get_saved_query(
    saved_query_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = SavedQueryService.get_saved_query(current_user, saved_query_id, db)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved query not found")

    try:
        query_text = SavedQueryService.read_query_text(record)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved query file not found")
    except Exception:
        logger.exception("Failed to read saved query file")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to read saved query")

    return {
        "id": record.id,
        "name": record.name,
        "description": record.description,
        "created_at": record.created_at,
        "query": query_text,
    }


@router.delete("/{saved_query_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_query(
    saved_query_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        deleted = SavedQueryService.delete_saved_query(current_user, saved_query_id, db)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved query not found")
        return None
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to delete saved query")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete saved query")

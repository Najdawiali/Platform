from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from datetime import datetime, timedelta, timezone

from ..database import get_db
from ..models.saved_workflow import SavedWorkflow
from ..models.user import User
from ..schemas import saved_workflow as schemas
from .auth import get_current_user

router = APIRouter(prefix="/api/saved_workflows", tags=["Saved Workflows"])

RETENTION_DAYS = 7

@router.get("", response_model=List[schemas.SavedWorkflow])
def get_saved_workflows(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all saved workflows for the current user.
    Automatically filters out expired workflows (older than 7 days).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    
    # Optional: Delete expired ones while we are here (Lazy expiration)
    db.query(SavedWorkflow).filter(
        SavedWorkflow.user_id == current_user.id,
        SavedWorkflow.updated_at < cutoff
    ).delete(synchronize_session=False)
    db.commit()

    return db.query(SavedWorkflow)\
        .filter(SavedWorkflow.user_id == current_user.id)\
        .order_by(desc(SavedWorkflow.updated_at))\
        .all()

@router.post("", response_model=schemas.SavedWorkflow)
def create_saved_workflow(
    workflow: schemas.SavedWorkflowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new saved workflow. 
    """
    db_workflow = SavedWorkflow(
        name=workflow.name,
        workflow_data=workflow.workflow_data,
        user_id=current_user.id
    )
    db.add(db_workflow)
    db.commit()
    db.refresh(db_workflow)
    return db_workflow

@router.put("/{workflow_id}", response_model=schemas.SavedWorkflow)
def update_saved_workflow(
    workflow_id: str,
    workflow_update: schemas.SavedWorkflowUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update an existing saved workflow.
    This refreshes the updated_at timestamp, resetting the 7-day retention.
    """
    db_workflow = db.query(SavedWorkflow).filter(
        SavedWorkflow.id == workflow_id,
        SavedWorkflow.user_id == current_user.id
    ).first()

    if not db_workflow:
        raise HTTPException(status_code=404, detail="Saved workflow not found")

    if workflow_update.name:
        db_workflow.name = workflow_update.name
    
    if workflow_update.workflow_data:
        db_workflow.workflow_data = workflow_update.workflow_data
    
    # Verify retention policy
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    if db_workflow.updated_at and db_workflow.updated_at.replace(tzinfo=timezone.utc) < cutoff:
         # It expired before this update?
         # If the user somehow had the ID and tried to update it, but it was technically expired...
         # We allow the "revival" since they are actively working on it?
         # Or strictly fail? Requirements say: "If a saved workflow expires while listed: It must be removed automatically on refresh"
         # "If a user attempts to open an expired workflow: Show a clear error message"
         # But here they are UPDATING it. If they are updating, they must have it open. 
         # So we should allow updating and resetting the timer.
         pass

    # Force updated_at update (SQLAlchemy handles onupdate, but explicit touch ensures it)
    db_workflow.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(db_workflow)
    return db_workflow

@router.get("/{workflow_id}", response_model=schemas.SavedWorkflow)
def get_saved_workflow(
    workflow_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get a specific saved workflow.
    """
    db_workflow = db.query(SavedWorkflow).filter(
        SavedWorkflow.id == workflow_id,
        SavedWorkflow.user_id == current_user.id
    ).first()

    if not db_workflow:
        raise HTTPException(status_code=404, detail="Saved workflow not found")

    # Check expiration
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    # Ensure timezone awareness compatibility
    updated_at = db_workflow.updated_at
    if updated_at.tzinfo is None:
        # Fallback if DB doesn't start with TZ (SQLite often doesn't)
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    
    if updated_at < cutoff:
        # Expired
        db.delete(db_workflow)
        db.commit()
        raise HTTPException(status_code=404, detail="This saved workflow has expired.")

    return db_workflow

@router.delete("/{workflow_id}")
def delete_saved_workflow(
    workflow_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a saved workflow.
    """
    db_workflow = db.query(SavedWorkflow).filter(
        SavedWorkflow.id == workflow_id,
        SavedWorkflow.user_id == current_user.id
    ).first()

    if not db_workflow:
        raise HTTPException(status_code=404, detail="Saved workflow not found")

    db.delete(db_workflow)
    db.commit()
    return {"status": "success"}

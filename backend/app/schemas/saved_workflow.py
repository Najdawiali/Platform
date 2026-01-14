from pydantic import BaseModel
from typing import Optional, Any, Dict
from datetime import datetime

class SavedWorkflowBase(BaseModel):
    name: str
    workflow_data: Any # JSON Workflow Definition

class SavedWorkflowCreate(SavedWorkflowBase):
    pass

class SavedWorkflowUpdate(BaseModel):
    name: Optional[str] = None
    workflow_data: Optional[Any] = None

class SavedWorkflow(SavedWorkflowBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

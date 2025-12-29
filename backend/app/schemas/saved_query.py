from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SavedQueryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    query: str


class SavedQueryListItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SavedQueryDetail(SavedQueryListItem):
    query: str

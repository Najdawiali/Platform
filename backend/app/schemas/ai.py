from typing import List, Optional, Dict, Any
from pydantic import BaseModel

class ChatMessage(BaseModel):
    role: str
    content: Optional[str] = None
    tool_calls: Optional[List[Any]] = None

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []

class ChatResponse(BaseModel):
    role: str
    content: Optional[str]
    tool_calls: Optional[List[Dict[str, Any]]] = None

from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from app.schemas.ai import ChatRequest, ChatResponse
from app.services.ai_service import ai_service
import logging
from app.models.user import User
from app.api.auth import get_current_user

router = APIRouter(tags=["ai"])
logger = logging.getLogger(__name__)

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, current_user: User = Depends(get_current_user)):
    try:
        # Convert Pydantic history to list of dicts for service
        history_dicts = []
        if request.history:
            for msg in request.history:
                msg_dict = msg.dict(exclude_none=True)
                history_dicts.append(msg_dict)

        response = ai_service.process_message(request.message, history_dicts, current_user)
        return response
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

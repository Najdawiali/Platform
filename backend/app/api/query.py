from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import logging

from ..database import get_db
from ..models.user import User
from ..services.query_service import QueryService
from ..schemas.query import QueryRequest, QueryResult
from ..schemas.validation import QueryValidationRequest, QueryValidationResponse
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/validate", response_model=QueryValidationResponse)
def validate_query(
    request: QueryValidationRequest,
    current_user: User = Depends(get_current_user)
) -> QueryValidationResponse:
    """
    Validate SQL query syntax without executing it.
    """
    try:
        return QueryService.validate_query(request.query)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception:
        logger.exception("Query validation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Query validation failed"
        )

@router.post("/", response_model=QueryResult)
def execute_query(
    request: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> QueryResult:
    """
    Execute a federated query across multiple sources (Datasets and Connections).
    Supports pagination via page and page_size in request body.
    """
    try:
        result = QueryService.execute_query(
            query=request.query,
            sources=request.sources,
            user=current_user,
            db=db,
            page=request.page or 1,
            page_size=request.page_size or 100
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception:
        logger.exception("Query execution failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Query execution failed"
        )

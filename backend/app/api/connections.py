# backend/app/api/connections.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models.user import User
from ..models.connection import SourceType
from ..schemas.connection import (
    ConnectionCreate,
    ConnectionUpdate,
    ConnectionResponse,
    ConnectionTestRequest,
    ConnectionTestResponse,
    SourceSelectionRequest,
    SourceSelectionResponse
)
from ..services.connection_service import ConnectionService
from .auth import get_current_user

router = APIRouter()

# Disable redirect_slashes to avoid 307 redirects
# This allows both /api/connections and /api/connections/ to work


@router.post("/select-source", response_model=SourceSelectionResponse)
def select_source(
        request: SourceSelectionRequest,
        current_user: User = Depends(get_current_user)
):
    """
    Step 1: User selects data source type
    Returns required fields and instructions
    """
    required_fields = ConnectionService.get_required_fields(request.source_type)
    instructions = ConnectionService.get_instructions(request.source_type)

    return {
        "source_type": request.source_type,
        "required_fields": required_fields,
        "instructions": instructions
    }


@router.post("/test", response_model=ConnectionTestResponse)
def test_connection(
        request: ConnectionTestRequest,
        current_user: User = Depends(get_current_user)
):
    """
    Step 2: Test connection with provided credentials
    """
    result = ConnectionService.test_connection(
        source_type=request.source_type,
        credentials=request.credentials
    )

    return result


@router.post("/", response_model=ConnectionResponse, status_code=status.HTTP_201_CREATED)
def create_connection(
        connection_data: ConnectionCreate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Step 3: Create and save connection
    """
    try:
        connection = ConnectionService.create_connection(
            user=current_user,
            name=connection_data.name,
            source_type=connection_data.source_type,
            credentials=connection_data.credentials,
            description=connection_data.description,
            db=db
        )
        return connection
    except ValueError as e:
        # Handle duplicate connection error
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create connection: {str(e)}"
        )


@router.get("/", response_model=List[ConnectionResponse])
def list_connections(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Get all connections for current user
    """
    connections = ConnectionService.get_user_connections(current_user, db)
    return connections


@router.get("/{connection_id}", response_model=ConnectionResponse)
def get_connection(
        connection_id: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Get a specific connection
    """
    connection = ConnectionService.get_connection_by_id(connection_id, current_user, db)

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )

    return connection


@router.put("/{connection_id}", response_model=ConnectionResponse)
def update_connection(
        connection_id: str,
        connection_data: ConnectionUpdate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Update an existing connection
    """
    try:
        connection = ConnectionService.update_connection(
            connection_id=connection_id,
            user=current_user,
            name=connection_data.name,
            description=connection_data.description,
            credentials=connection_data.credentials,
            db=db
        )
        
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found"
            )
        
        return connection
    except ValueError as e:
        # Handle duplicate connection error
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update connection: {str(e)}"
        )


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(
        connection_id: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Delete a connection
    """
    success = ConnectionService.delete_connection(connection_id, current_user, db)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )

    return None

@router.get("/{connection_id}/collections")
def get_connection_collections(
        connection_id: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Get list of collections/tables from a database connection (MongoDB, Snowflake, etc.)
    """
    collections = ConnectionService.get_connection_collections(connection_id, current_user, db)
    return {"collections": collections}


@router.get("/{connection_id}/data")
def query_connection_data(
        connection_id: str,
        collection: str = Query(..., description="Collection/table name to query"),
        limit: int = Query(1000, le=10000, description="Max rows to return"),
        offset: int = Query(0, ge=0, description="Number of rows to skip"),
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Query data directly from a database connection without importing.
    Returns data in chunks for efficient streaming.
    """
    data = ConnectionService.query_connection_data(
        connection_id, collection, limit, offset, current_user, db
    )
    return data

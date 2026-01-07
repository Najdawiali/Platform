# backend/app/api/connections.py
import logging
import base64
import hashlib
import secrets
from datetime import datetime, timedelta
from urllib.parse import quote, urlencode
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional

from jose import jwt

from ..database import get_db
from ..models.user import User
from ..models.connection import Connection, SourceType
from ..schemas.connection import (
    ConnectionCreate,
    ConnectionUpdate,
    ConnectionResponse,
    ConnectionConfigResponse,
    ConnectionTestRequest,
    ConnectionTestResponse,
    SourceSelectionRequest,
    SourceSelectionResponse
)
from ..services.connection_service import ConnectionService
from .auth import get_current_user
from ..config import settings


class SalesforceOAuthStartRequest(BaseModel):
    """Request to start Salesforce OAuth for creating a connection."""

    name: Optional[str] = None
    auth_base_url: Optional[str] = None
    api_version: Optional[str] = None

router = APIRouter()

logger = logging.getLogger(__name__)


def _b64url_no_pad(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _generate_pkce_pair() -> tuple[str, str]:
    """Generate (code_verifier, code_challenge) for PKCE (S256)."""
    # RFC 7636: verifier length 43-128 chars (unreserved charset). urlsafe_b64 of 32 bytes -> 43 chars.
    verifier = _b64url_no_pad(secrets.token_bytes(32))
    challenge = _b64url_no_pad(hashlib.sha256(verifier.encode("ascii")).digest())
    return verifier, challenge

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


@router.post("/salesforce/oauth/start")
def salesforce_oauth_start(
    body: SalesforceOAuthStartRequest,
    current_user: User = Depends(get_current_user),
):
    """Start Salesforce OAuth (Authorization Code) flow.

    Returns an `authorize_url` that the frontend should redirect the browser to.
    """
    logger.info(f"Salesforce OAuth start requested by user {current_user.id}")
    
    if not settings.SALESFORCE_CLIENT_ID or not settings.SALESFORCE_CLIENT_SECRET:
        logger.error("Salesforce OAuth not configured - missing client credentials")
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=(
                "Salesforce OAuth not configured. Set SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET "
                "in backend/.env (see backend/.env.example) and restart the backend."
            ),
        )

    logger.info(f"Using auth_base_url: {body.auth_base_url or settings.SALESFORCE_AUTH_BASE_URL}")
    auth_base_url = (body.auth_base_url or settings.SALESFORCE_AUTH_BASE_URL or "").strip()
    if not auth_base_url:
        auth_base_url = "https://login.salesforce.com"
    auth_base_url = auth_base_url.rstrip("/")
    if not auth_base_url.startswith("http://") and not auth_base_url.startswith("https://"):
        auth_base_url = "https://" + auth_base_url

    payload = {
        "uid": current_user.id,
        "nonce": str(uuid4()),
        "name": (body.name or "Salesforce").strip() or "Salesforce",
        "auth_base_url": auth_base_url,
        "api_version": (body.api_version or "").strip(),
        "exp": datetime.utcnow() + timedelta(minutes=10),
    }

    # Generate PKCE pair (required by this Salesforce Connected App)
    pkce_verifier, pkce_challenge = _generate_pkce_pair()
    payload["pkce_v"] = pkce_verifier
    
    state = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    params = {
        "response_type": "code",
        "client_id": settings.SALESFORCE_CLIENT_ID,
        "redirect_uri": settings.SALESFORCE_REDIRECT_URI,
        "scope": settings.SALESFORCE_SCOPES,
        "state": state,
        # PKCE (S256) - required by Connected App
        "code_challenge": pkce_challenge,
        "code_challenge_method": "S256",
    }
    authorize_url = f"{auth_base_url}/services/oauth2/authorize?{urlencode(params)}"
    logger.info(f"Returning authorize_url: {authorize_url}")
    return {"authorize_url": authorize_url}


@router.get("/salesforce/oauth/callback")
async def salesforce_oauth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Handle Salesforce OAuth callback.

    Exchanges the authorization code for tokens, creates a Salesforce connection,
    then redirects back to the frontend create flow.
    """

    # If the user denies access or Salesforce returns an error, they will often
    # redirect here with `error` query params (and without `code`). Handle this
    # explicitly so we can show a friendly message in the UI.
    if error:
        msg = (error_description or error).strip()
        redirect_url = f"{settings.FRONTEND_URL}/databases/create?salesforce_oauth_error={quote(msg)}"
        return RedirectResponse(url=redirect_url, status_code=303)

    # If someone opens this URL directly, or the provider did not include params,
    # redirect back with guidance instead of returning a FastAPI 422.
    if not code or not state:
        msg = (
            "Missing OAuth query parameters (code/state). "
            "Do not open this URL directly; start from 'Sign in with Salesforce' in the app. "
            f"Verify your Salesforce callback URL is set to: {settings.SALESFORCE_REDIRECT_URI}"
        )
        redirect_url = f"{settings.FRONTEND_URL}/databases/create?salesforce_oauth_error={quote(msg)}"
        return RedirectResponse(url=redirect_url, status_code=303)

    try:
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except Exception:
        msg = "Invalid OAuth state. Please retry 'Sign in with Salesforce'."
        redirect_url = f"{settings.FRONTEND_URL}/databases/create?salesforce_oauth_error={quote(msg)}"
        return RedirectResponse(url=redirect_url, status_code=303)

    user_id = payload.get("uid")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found")

    if not settings.SALESFORCE_CLIENT_ID or not settings.SALESFORCE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=(
                "Salesforce OAuth not configured. Set SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET "
                "in backend/.env (see backend/.env.example) and restart the backend."
            ),
        )

    auth_base_url = (payload.get("auth_base_url") or settings.SALESFORCE_AUTH_BASE_URL or "https://login.salesforce.com").rstrip("/")
    token_url = f"{auth_base_url}/services/oauth2/token"

    code_verifier = (payload.get("pkce_v") or "").strip()

    data = {
        "grant_type": "authorization_code",
        "client_id": settings.SALESFORCE_CLIENT_ID,
        "client_secret": settings.SALESFORCE_CLIENT_SECRET,
        "redirect_uri": settings.SALESFORCE_REDIRECT_URI,
        "code": code,
    }

    # Include PKCE verifier if present (required by some orgs)
    if code_verifier:
        data["code_verifier"] = code_verifier

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(token_url, data=data)
        if resp.status_code >= 400:
            # Try to surface a useful message
            detail = None
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Salesforce token exchange failed: {detail}")
        token = resp.json() if resp.content else {}

    refresh_token = token.get("refresh_token")
    instance_url = token.get("instance_url")
    access_token = token.get("access_token")
    identity_url = token.get("id")

    if not refresh_token or not instance_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Salesforce did not return a refresh_token/instance_url. Ensure your Connected App allows refresh tokens and requested scopes include refresh_token.",
        )

    # Best-effort identity lookup for friendlier naming + metadata.
    sf_identity: dict = {}
    if access_token and identity_url:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                ident_resp = await client.get(
                    identity_url,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if ident_resp.status_code < 400:
                    sf_identity = ident_resp.json() if ident_resp.content else {}
        except Exception:
            sf_identity = {}

    sf_username = None
    sf_display_name = None
    sf_user_id = None
    sf_org_id = None
    sf_org_name = None
    try:
        sf_username = sf_identity.get("username")
        sf_display_name = sf_identity.get("display_name")
        sf_user_id = sf_identity.get("user_id")
        sf_org_id = sf_identity.get("organization_id")
    except Exception:
        pass

    # Best-effort org name lookup for "Database" naming in UI.
    # Keep this lightweight + failure-safe.
    if access_token and instance_url:
        try:
            api_version = (payload.get("api_version") or "").strip() or "59.0"
            async with httpx.AsyncClient(timeout=5) as client:
                q_url = f"{instance_url.rstrip('/')}/services/data/v{api_version}/query"
                org_resp = await client.get(
                    q_url,
                    params={"q": "SELECT Name FROM Organization"},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if org_resp.status_code < 400:
                    data = org_resp.json() if org_resp.content else {}
                    recs = data.get("records") if isinstance(data, dict) else None
                    if isinstance(recs, list) and recs:
                        name = recs[0].get("Name")
                        if isinstance(name, str) and name.strip():
                            sf_org_name = name.strip()
        except Exception:
            sf_org_name = None

    base_name = (payload.get("name") or "Salesforce").strip() or "Salesforce"
    connection_name = base_name
    if sf_org_name:
        connection_name = sf_org_name
    elif sf_username:
        connection_name = f"Salesforce - {sf_username}"
    elif sf_display_name:
        connection_name = f"Salesforce - {sf_display_name}"

    credentials = {
        "auth_type": "oauth",
        "refresh_token": refresh_token,
        "instance_url": instance_url,
        "access_token": access_token,
        "auth_base_url": auth_base_url,
        "identity_url": identity_url,
        "sf_username": sf_username,
        "sf_display_name": sf_display_name,
        "sf_user_id": sf_user_id,
        "sf_org_id": sf_org_id,
        "sf_org_name": sf_org_name,
        "api_version": (payload.get("api_version") or "").strip() or None,
        "selected_objects": [],
        "selected_fields": {},
        "retention_days": 90,
        "auto_sync_enabled": True,
        "auto_sync_interval_seconds": 3600,
    }

    # Check if connection already exists for this Salesforce org
    existing = db.query(Connection).filter(
        Connection.user_id == user.id,
        Connection.source_type == SourceType.SALESFORCE
    ).all()
    
    for conn in existing:
        if conn.credentials.get("sf_org_id") == sf_org_id:
            # Connection already exists - tell user to edit it instead
            error_msg = f"This Salesforce org ({sf_org_name or 'organization'}) is already connected as '{conn.name}'. Please edit the existing connection instead of creating a new one."
            redirect_url = f"{settings.FRONTEND_URL}/databases/create?salesforce_oauth_error={quote(error_msg)}"
            return RedirectResponse(url=redirect_url, status_code=303)

    connection = ConnectionService.create_connection(
        user=user,
        name=connection_name,
        source_type=SourceType.SALESFORCE,
        credentials=credentials,
        description="Salesforce (OAuth)",
        db=db,
    )

    redirect_url = f"{settings.FRONTEND_URL}/databases/create?salesforce_connection_id={connection.id}"
    return RedirectResponse(url=redirect_url, status_code=303)


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

    try:
        counts = {}
        for c in connections:
            st = str(getattr(c, 'source_type', 'unknown'))
            counts[st] = counts.get(st, 0) + 1
        logger.info(
            "List connections",
            extra={
                "user_id": getattr(current_user, 'id', None),
                "connection_count": len(connections),
                "counts_by_source_type": counts,
            },
        )
        logger.debug(
            "Connections detail",
            extra={
                "user_id": getattr(current_user, 'id', None),
                "connections": [
                    {
                        "id": getattr(c, 'id', None),
                        "name": getattr(c, 'name', None),
                        "source_type": str(getattr(c, 'source_type', None)),
                        "is_active": getattr(c, 'is_active', None),
                    }
                    for c in connections
                ],
            },
        )
    except Exception:
        # Never break the endpoint due to logging
        pass
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


@router.get("/{connection_id}/config", response_model=ConnectionConfigResponse)
def get_connection_config(
        connection_id: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """Get editable connection config including credentials."""
    connection = ConnectionService.get_connection_by_id(connection_id, current_user, db)

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )

    return {
        "id": connection.id,
        "user_id": connection.user_id,
        "name": connection.name,
        "source_type": connection.source_type,
        "description": connection.description,
        "credentials": connection.credentials or {},
        "is_active": connection.is_active,
        "test_status": connection.test_status,
        "test_message": connection.test_message,
        "last_tested": connection.last_tested,
        "created_at": connection.created_at,
        "updated_at": connection.updated_at,
    }


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


@router.get("/{connection_id}/fields")
def get_salesforce_fields(
    connection_id: str,
    object_name: str = Query(..., description="Salesforce object API name (e.g., Account)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List fields for a Salesforce object (for field selection UI)."""
    fields = ConnectionService.get_salesforce_object_fields(connection_id, current_user, db, object_name)
    return {"fields": fields}


@router.get("/{connection_id}/databases")
def get_databases_with_tables(
        connection_id: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Get all databases with their tables/collections from a connection
    """
    databases = ConnectionService.get_databases_with_tables(connection_id, current_user, db)
    return {"databases": databases}


@router.get("/{connection_id}/data")
def get_connection_data(
        connection_id: str,
        collection: str = Query(..., description="Table or collection name"),
        limit: int = Query(100, description="Number of rows to fetch"),
        offset: int = Query(0, description="Offset for pagination"),
        database: str = Query(None, description="Database name (optional)"),
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Get data from a connection (table/collection)
    """
    data = ConnectionService.get_connection_data(
        connection_id=connection_id,
        user=current_user,
        db=db,
        collection=collection,
        limit=limit,
        offset=offset,
        database=database
    )
    return data


@router.get("/{connection_id}/stats")
def get_connection_stats(
        connection_id: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Get statistics about a database connection (total tables/collections and total rows)
    """
    stats = ConnectionService.get_connection_stats(connection_id, current_user, db)
    return stats


@router.get("/{connection_id}/salesforce/objects")
def get_salesforce_objects(
        connection_id: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """Get Salesforce objects for an existing OAuth connection."""
    connection = ConnectionService.get_connection_by_id(connection_id, current_user, db)
    
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )
    
    if connection.source_type != "salesforce":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is only for Salesforce connections"
        )
    
    # Get the stored OAuth credentials
    creds = connection.credentials or {}
    access_token = creds.get("access_token")
    instance_url = creds.get("instance_url")
    
    if not access_token or not instance_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing OAuth credentials. Please re-authenticate."
        )
    
    # Use the SalesforceConnector to get objects
    try:
        from app.connectors.salesforce_connector import SalesforceConnector
        
        connector = SalesforceConnector(
            auth_type="oauth",
            access_token=access_token,
            instance_url=instance_url,
            refresh_token=creds.get("refresh_token"),
            client_id=creds.get("client_id"),
            client_secret=creds.get("client_secret"),
        )
        
        connector.connect()
        objects = connector.list_objects()
        
        # Format like the test_connection response
        return {
            "success": True,
            "message": f"Found {len(objects)} Salesforce objects",
            "metadata": {
                "objects": [{"name": obj} for obj in objects]
            }
        }
    except Exception as e:
        logger.error(f"Error fetching Salesforce objects: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch Salesforce objects: {str(e)}"
        )


@router.post("/{connection_id}/sync")
def sync_connection(
    connection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Sync a connection by re-reading schema (tables/collections) using saved credentials."""
    return ConnectionService.sync_connection(connection_id, current_user, db)


@router.get("/{connection_id}/data/live")
def query_connection_data_live(
        connection_id: str,
        collection: str = Query(..., description="Collection/table name to query"),
    database: str = Query(None, description="Database name (required for multi-database connections)"),
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
        connection_id, collection, limit, offset, current_user, db, database
    )
    return data

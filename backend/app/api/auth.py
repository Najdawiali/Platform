# backend/app/api/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import Optional
from authlib.integrations.starlette_client import OAuth
from starlette.requests import Request
import httpx

from ..database import get_db
from ..models.user import User
from ..schemas.user import UserCreate, UserLogin, UserResponse, Token
from ..utils.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_access_token
)
from ..config import settings

router = APIRouter()
security = HTTPBearer()

# Initialize OAuth
oauth = OAuth()

# Configure Google OAuth
if settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
    oauth.register(
        name='google',
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile'}
    )

# Configure GitHub OAuth
if settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET:
    oauth.register(
        name='github',
        client_id=settings.GITHUB_CLIENT_ID,
        client_secret=settings.GITHUB_CLIENT_SECRET,
        authorize_url='https://github.com/login/oauth/authorize',
        authorize_params=None,
        access_token_url='https://github.com/login/oauth/access_token',
        access_token_params=None,
        client_kwargs={'scope': 'user:email'}
    )


# Dependency to get current user from token
async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user from JWT token"""
    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

    email: str = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return user


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.post("/login", response_model=Token)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    """Login and get access token"""

    # Find user by email
    user = db.query(User).filter(User.email == user_data.email).first()

    # Verify user exists and password is correct
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Create access token
    access_token = create_access_token(data={"sub": user.email})

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return current_user


# ============================================================================
# GOOGLE OAUTH
# ============================================================================

@router.get("/google")
async def google_login(request: Request):
    """Initiate Google OAuth login"""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth not configured"
        )
    
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    """Handle Google OAuth callback"""
    try:
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get('userinfo')
        
        print(f"[DEBUG] Google OAuth - Got user info: {user_info}")
        
        if not user_info:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get user info from Google"
            )
        
        email = user_info.get('email')
        full_name = user_info.get('name', '')
        
        print(f"[DEBUG] Email: {email}, Name: {full_name}")
        
        # Find or create user
        user = db.query(User).filter(User.email == email).first()
        
        if not user:
            print(f"[DEBUG] Creating new user for {email}")
            # Create new user with OAuth
            user = User(
                email=email,
                full_name=full_name,
                hashed_password=get_password_hash(str(user_info.get('sub')))  # Use Google sub as password hash
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            print(f"[DEBUG] Found existing user: {user.email}")
        
        # Create access token
        access_token = create_access_token(data={"sub": user.email})
        
        redirect_url = f"{settings.FRONTEND_URL}/auth/callback?token={access_token}"
        print(f"[DEBUG] Redirecting to: {redirect_url}")
        
        # Redirect to frontend with token
        return RedirectResponse(
            url=redirect_url,
            status_code=303  # Use 303 See Other for GET after POST pattern
        )
        
    except Exception as e:
        print(f"[ERROR] OAuth callback failed: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OAuth authentication failed: {str(e)}"
        )


# ============================================================================
# GITHUB OAUTH
# ============================================================================

@router.get("/github")
async def github_login(request: Request):
    """Initiate GitHub OAuth login"""
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="GitHub OAuth not configured"
        )
    
    redirect_uri = settings.GITHUB_REDIRECT_URI
    return await oauth.github.authorize_redirect(request, redirect_uri)


@router.get("/github/callback")
async def github_callback(request: Request, db: Session = Depends(get_db)):
    """Handle GitHub OAuth callback"""
    try:
        token = await oauth.github.authorize_access_token(request)
        
        # Get user info from GitHub API
        async with httpx.AsyncClient() as client:
            headers = {
                'Authorization': f"Bearer {token['access_token']}",
                'Accept': 'application/json'
            }
            
            # Get user profile
            user_response = await client.get(
                'https://api.github.com/user',
                headers=headers
            )
            user_info = user_response.json()
            
            # Get user emails (primary email)
            email_response = await client.get(
                'https://api.github.com/user/emails',
                headers=headers
            )
            emails = email_response.json()
            
            # Find primary email
            email = None
            for email_data in emails:
                if email_data.get('primary'):
                    email = email_data.get('email')
                    break
            
            if not email and emails:
                email = emails[0].get('email')
            
            if not email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No email found in GitHub account"
                )
        
        full_name = user_info.get('name', user_info.get('login', ''))
        
        print(f"[DEBUG] GitHub - Email: {email}, Name: {full_name}")
        
        # Find or create user
        user = db.query(User).filter(User.email == email).first()
        
        if not user:
            print(f"[DEBUG] Creating new user for {email}")
            # Create new user with OAuth
            user = User(
                email=email,
                full_name=full_name,
                hashed_password=get_password_hash(str(user_info.get('id')))  # Use GitHub ID as password hash
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            print(f"[DEBUG] Found existing user: {user.email}")
        
        # Create access token
        access_token = create_access_token(data={"sub": user.email})
        
        redirect_url = f"{settings.FRONTEND_URL}/auth/callback?token={access_token}"
        print(f"[DEBUG] Redirecting to: {redirect_url}")
        
        # Redirect to frontend with token
        return RedirectResponse(
            url=redirect_url,
            status_code=303  # Use 303 See Other for GET after POST pattern
        )
        
    except Exception as e:
        print(f"[ERROR] GitHub OAuth callback failed: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OAuth authentication failed: {str(e)}"
        )
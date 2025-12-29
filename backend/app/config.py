# backend/app/config.py
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite:///./data_platform.db"  # Start with SQLite for simplicity

    # Security
    SECRET_KEY: str = "123456"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # File Upload
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE: int = 104857600  # 100MB

    # CORS
    CORS_ORIGINS: list = ["http://localhost:5204", "http://localhost:3000"]

    # OAuth - Google
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"

    # OAuth - GitHub
    GITHUB_CLIENT_ID: Optional[str] = None
    GITHUB_CLIENT_SECRET: Optional[str] = None
    GITHUB_REDIRECT_URI: str = "http://localhost:8000/api/auth/github/callback"

    # Frontend URL for redirects after OAuth
    FRONTEND_URL: str = "http://localhost:5204"

    # Scheduled connection sync
    AUTO_SYNC_ENABLED: bool = True
    # Global tick interval is handled in code; per-connection interval lives in credentials.
    AUTO_SYNC_INTERVAL_SECONDS: int = 3600  # Kept for backward compatibility

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
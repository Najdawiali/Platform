# backend/app/config.py
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Load `.env` from the backend directory (not the current working dir)
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[1] / ".env"),
        case_sensitive=True,
    )

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

    # DeepInfra / LLM Configuration
    DEEPINFRA_API_KEY: str = "eEAxQfpqUrCUf1NDQEt5eeD541vn5Pob"
    DEEPINFRA_BASE_URL: str = "https://api.deepinfra.com/v1/openai"
    LLM_MODEL: str = "Qwen/Qwen3-14B"

    # OAuth - Salesforce (for data source connections)
    SALESFORCE_CLIENT_ID: Optional[str] = None
    SALESFORCE_CLIENT_SECRET: Optional[str] = None
    # Callback handled by backend, then redirects to FRONTEND_URL
    SALESFORCE_REDIRECT_URI: str = "http://localhost:8000/api/connections/salesforce/oauth/callback"
    # Default auth base URL (prod). For sandbox use https://test.salesforce.com
    SALESFORCE_AUTH_BASE_URL: str = "https://login.salesforce.com"
    # Request refresh token + API access
    SALESFORCE_SCOPES: str = "refresh_token api"

    # Scheduled connection sync
    AUTO_SYNC_ENABLED: bool = True
    # Global tick interval is handled in code; per-connection interval lives in credentials.
    AUTO_SYNC_INTERVAL_SECONDS: int = 3600  # Kept for backward compatibility

settings = Settings()
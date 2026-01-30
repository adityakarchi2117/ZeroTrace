
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, computed_field
from typing import List
from functools import lru_cache
import json


def clean_origin(origin: str) -> str:
    """Clean origin URL - fix common typos"""
    origin = origin.strip()
    # Fix double protocols
    origin = origin.replace("https://https://", "https://")
    origin = origin.replace("http://http://", "http://")
    # Remove trailing slash
    origin = origin.rstrip("/")
    return origin


def parse_env_list(env_value: str, default: List[str]) -> List[str]:
    """Parse environment variable as JSON list or comma-separated values"""
    if not env_value:
        return default
    env_value = env_value.strip()
    if not env_value:
        return default
    try:
        parsed = json.loads(env_value)
        if isinstance(parsed, list):
            return [clean_origin(item) for item in parsed]
        return [clean_origin(str(parsed))]
    except json.JSONDecodeError:
        return [clean_origin(item) for item in env_value.split(",") if item.strip()]


class Settings(BaseSettings):
    # ============ Application ============
    APP_NAME: str = "CipherLink"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"
    
    # ============ API Settings ============
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "CipherLink API"
    
    # ============ Security ============
    SECRET_KEY: str = Field(default="your-secret-key-here-change-in-production-use-openssl-rand-hex-32")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # ============ Database ============
    # Defaults to SQLite for local dev, override with DATABASE_URL env var for PostgreSQL
    DATABASE_URL: str = Field(default="sqlite:///./cipherlink_v3.db")
    
    # ============ CORS - Env vars for configuration ============
    CORS_ORIGINS: str = Field(default="", description="Comma-separated or JSON list of allowed origins")
    CORS_HOSTS: str = Field(default="", description="Comma-separated or JSON list of allowed hosts")
    FILE_TYPES: str = Field(default="", description="Comma-separated or JSON list of allowed file types")
    
    # ============ WebSocket ============
    WS_MESSAGE_QUEUE_SIZE: int = 100
    WS_PING_INTERVAL: int = 30
    WS_CONNECTION_TIMEOUT: int = 60
    
    # ============ Rate Limiting ============
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW: int = 60  # seconds
    
    # ============ Encryption Settings ============
    MIN_PREKEY_COUNT: int = 10
    MAX_PREKEY_BATCH: int = 100
    SIGNED_PREKEY_ROTATION_DAYS: int = 7
    
    # ============ Message Settings ============
    MAX_MESSAGE_SIZE: int = 65536
    MESSAGE_CLEANUP_INTERVAL: int = 60
    
    # ============ Vault Settings ============
    MAX_VAULT_ITEMS: int = 1000
    MAX_VAULT_ITEM_SIZE: int = 1048576
    
    # ============ File Upload ============
    MAX_FILE_SIZE: int = 52428800
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
        populate_by_name=True,
    )
    
    @computed_field
    @property
    def ALLOWED_ORIGINS(self) -> List[str]:
        """Get allowed origins from CORS_ORIGINS env var or defaults"""
        defaults = [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
            # Deployed frontend
            "https://zero-trace-virid.vercel.app",
        ]
        # Parse and clean origins
        return parse_env_list(self.CORS_ORIGINS, defaults)
    
    @computed_field
    @property
    def ALLOWED_HOSTS(self) -> List[str]:
        defaults = ["localhost", "127.0.0.1", "*"]
        return parse_env_list(self.CORS_HOSTS, defaults)
    
    @computed_field
    @property
    def ALLOWED_FILE_TYPES(self) -> List[str]:
        defaults = [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "application/pdf",
            "text/plain",
            "application/zip",
        ]
        return parse_env_list(self.FILE_TYPES, defaults)
    
    @computed_field
    @property
    def is_postgres(self) -> bool:
        return "postgresql" in self.DATABASE_URL.lower() or "postgres" in self.DATABASE_URL.lower()


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

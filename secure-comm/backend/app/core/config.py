
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, computed_field
from typing import List
from functools import lru_cache
import json


def parse_env_list(env_value: str, default: List[str]) -> List[str]:
    """Parse environment variable as JSON list or comma-separated values"""
    if not env_value:
        return default
    env_value = env_value.strip()
    if not env_value:
        return default
    try:
        # Try JSON first
        parsed = json.loads(env_value)
        if isinstance(parsed, list):
            return parsed
        return [str(parsed)]
    except json.JSONDecodeError:
        # Fall back to comma-separated
        return [item.strip() for item in env_value.split(",") if item.strip()]


class Settings(BaseSettings):
    # ============ Application ============
    APP_NAME: str = "CipherLink"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"
    
    # ============ API Settings ============
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "CipherLink API"
    
    # ============ Security ============
    SECRET_KEY: str = "your-secret-key-here-change-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # ============ Database ============
    DATABASE_URL: str = "sqlite:///./cipherlink_v3.db"
    
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
    MIN_PREKEY_COUNT: int = 10  # Trigger refill below this
    MAX_PREKEY_BATCH: int = 100  # Max prekeys per upload
    SIGNED_PREKEY_ROTATION_DAYS: int = 7
    
    # ============ Message Settings ============
    MAX_MESSAGE_SIZE: int = 65536  # 64KB max message size
    MESSAGE_CLEANUP_INTERVAL: int = 60  # seconds
    
    # ============ Vault Settings ============
    MAX_VAULT_ITEMS: int = 1000
    MAX_VAULT_ITEM_SIZE: int = 1048576  # 1MB per item
    
    # ============ File Upload ============
    MAX_FILE_SIZE: int = 52428800  # 50MB
    
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
        ]
        return parse_env_list(self.CORS_ORIGINS, defaults)
    
    @computed_field
    @property
    def ALLOWED_HOSTS(self) -> List[str]:
        """Get allowed hosts from CORS_HOSTS env var or defaults"""
        defaults = ["localhost", "127.0.0.1", "*"]
        return parse_env_list(self.CORS_HOSTS, defaults)
    
    @computed_field
    @property
    def ALLOWED_FILE_TYPES(self) -> List[str]:
        """Get allowed file types from FILE_TYPES env var or defaults"""
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


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance"""
    return Settings()


settings = get_settings()

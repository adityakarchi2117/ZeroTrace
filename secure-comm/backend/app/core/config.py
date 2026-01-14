
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from functools import lru_cache


class Settings(BaseSettings):
    # ============ Application ============
    APP_NAME: str = "CipherLink"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # ============ API Settings ============
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "CipherLink API"
    
    # ============ Security ============
    SECRET_KEY: str = "your-secret-key-here-change-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # ============ Database ============
    DATABASE_URL: str = "sqlite:///./cipherlink.db"
    
    # ============ CORS ============
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]
    
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
    ALLOWED_FILE_TYPES: List[str] = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "text/plain",
        "application/zip",
    ]
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance"""
    return Settings()


settings = get_settings()

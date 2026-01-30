
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from functools import lru_cache
import json
import os


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
    
    # ============ CORS ============
    # Use string for env compatibility, parsed in model_post_init
    ALLOWED_ORIGINS_STR: str = ""
    ALLOWED_HOSTS_STR: str = ""
    
    # Runtime computed fields
    ALLOWED_ORIGINS: List[str] = []
    ALLOWED_HOSTS: List[str] = []
    
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
    ALLOWED_FILE_TYPES_STR: str = ""
    ALLOWED_FILE_TYPES: List[str] = []
    MAX_FILE_SIZE: int = 52428800  # 50MB
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )
    
    def model_post_init(self, __context):
        # Parse ALLOWED_ORIGINS
        default_origins = [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
        self.ALLOWED_ORIGINS = parse_env_list(self.ALLOWED_ORIGINS_STR, default_origins)
        
        # Parse ALLOWED_HOSTS
        default_hosts = ["localhost", "127.0.0.1", "*"]
        self.ALLOWED_HOSTS = parse_env_list(self.ALLOWED_HOSTS_STR, default_hosts)
        
        # Parse ALLOWED_FILE_TYPES
        default_types = [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "application/pdf",
            "text/plain",
            "application/zip",
        ]
        self.ALLOWED_FILE_TYPES = parse_env_list(self.ALLOWED_FILE_TYPES_STR, default_types)


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance"""
    return Settings()


settings = get_settings()

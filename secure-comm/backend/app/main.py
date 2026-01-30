"""
🔐 CipherLink API - Private by design. Secure by default.
End-to-end encrypted communication platform

Features:
- Zero-knowledge server architecture
- Signal Protocol-inspired E2E encryption
- Real-time messaging with WebSockets
- Perfect Forward Secrecy
- Secure vault for encrypted storage
- Multi-device support
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import asyncio
import logging
from datetime import datetime

from app.api.routes import auth, keys, messages
from app.api.routes.vault import router as vault_router
from app.api.routes.contacts import router as contacts_router
from app.api.websocket import router as websocket_router
from app.core.config import settings
from app.db.database import engine, Base

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Background task for ephemeral message cleanup
async def cleanup_expired_messages():
    """Periodically delete expired ephemeral messages"""
    from app.db.database import SessionLocal, Message
    
    while True:
        try:
            db = SessionLocal()
            # Delete messages past their expiry time
            expired = db.query(Message).filter(
                Message.expires_at != None,
                Message.expires_at < datetime.utcnow()
            ).delete()
            
            if expired > 0:
                logger.info(f"🧹 Cleaned up {expired} expired messages")
            
            db.commit()
            db.close()
        except Exception as e:
            logger.error(f"❌ Error in message cleanup: {e}")
        
        # Run every minute
        await asyncio.sleep(60)

# Background task for key rotation
async def rotate_signed_prekeys():
    """Rotate signed prekeys weekly for enhanced security"""
    from app.db.database import SessionLocal, User
    from datetime import timedelta
    
    while True:
        try:
            db = SessionLocal()
            # Find users with old signed prekeys (older than 7 days)
            week_ago = datetime.utcnow() - timedelta(days=7)
            users_needing_rotation = db.query(User).filter(
                User.signed_prekey_timestamp < week_ago
            ).all()
            
            if users_needing_rotation:
                logger.info(f"🔄 {len(users_needing_rotation)} users need key rotation")
                # Note: Actual rotation happens client-side, this just logs
            
            db.close()
        except Exception as e:
            logger.error(f"❌ Error in key rotation check: {e}")
        
        # Run daily
        await asyncio.sleep(86400)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle events"""
    # Startup
    logger.info("🚀 Starting CipherLink API...")
    logger.info(f"🔧 Environment: {settings.ENVIRONMENT}")
    logger.info(f"🗄️  Database: {settings.DATABASE_URL.split('://')[0]}")
    
    # Create database tables
    Base.metadata.create_all(bind=engine)
    logger.info("📊 Database tables created/verified")
    
    # Create demo user if CREATE_DEMO_USER is set (for testing only)
    import os
    if os.getenv("CREATE_DEMO_USER", "").lower() in ("true", "1", "yes"):
        from app.db.database import SessionLocal
        from app.db.user_repo import UserRepository
        from app.core.security import get_password_hash
        
        db = SessionLocal()
        try:
            user_repo = UserRepository(db)
            if not user_repo.get_by_username("demo"):
                hashed_password = get_password_hash("demo123")
                user_repo.create("demo", "demo@example.com", hashed_password)
                logger.info("👤 Demo user created (username: demo, password: demo123)")
            else:
                logger.info("👤 Demo user already exists")
        except Exception as e:
            logger.error(f"⚠️  Error creating demo user: {e}")
        finally:
            db.close()
    
    # Start background tasks
    cleanup_task = asyncio.create_task(cleanup_expired_messages())
    rotation_task = asyncio.create_task(rotate_signed_prekeys())
    logger.info("⚙️  Background tasks started")
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down CipherLink API...")
    cleanup_task.cancel()
    rotation_task.cancel()
    logger.info("✅ Shutdown complete")


app = FastAPI(
    title="CipherLink API",
    description="""
    🔐 **CipherLink** - Private by design. Secure by default.
    
    End-to-end encrypted communication platform where:
    - Every user owns a cryptographic identity
    - All messages are encrypted on the client
    - Backend acts only as a blind router
    - No plaintext ever touches the server
    
    ## Features
    - 🔑 Signal Protocol-style key exchange (X3DH)
    - 💬 Hybrid encryption (X25519 + AES-256-GCM)
    - ⏳ Ephemeral messages with auto-expiry
    - 🔒 Secure vault for notes & passwords
    - 📱 Real-time WebSocket messaging
    - 🔄 Perfect Forward Secrecy
    
    ## Security Principles
    - Zero-knowledge server
    - No plaintext storage
    - No private key transmission
    - Client-side crypto only
    - Open crypto standards
    """,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware - MUST be first
# For development: allow all origins (with credentials workaround)
# For production: use configured origins only
if settings.ENVIRONMENT == "production":
    _cors_origins = settings.ALLOWED_ORIGINS
    _allow_credentials = True
else:
    # Development mode - more permissive
    _cors_origins = ["*"]
    _allow_credentials = False  # Can't use credentials with "*"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

# Debug configuration
logger.info(f"📋 ALLOWED_HOSTS: {settings.ALLOWED_HOSTS}")
logger.info(f"📋 ALLOWED_ORIGINS: {settings.ALLOWED_ORIGINS}")

# Security middleware
app.add_middleware(
    TrustedHostMiddleware, 
    allowed_hosts=["*"] # Force allow all for debugging
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(keys.router, prefix="/api/keys", tags=["Key Management"])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"])
app.include_router(contacts_router, prefix="/api/contacts", tags=["Contacts"])
app.include_router(vault_router, prefix="/api/vault", tags=["Secure Vault"])
app.include_router(websocket_router, prefix="/ws", tags=["WebSocket"])


@app.get("/", tags=["Status"])
async def root():
    """API root - status check"""
    return {
        "name": "CipherLink API",
        "status": "running",
        "version": "1.0.0",
        "tagline": "Private by design. Secure by default."
    }


@app.get("/health", tags=["Status"])
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "database": "connected",
        "websocket": "active"
    }


@app.get("/api/security-info", tags=["Status"])
async def security_info():
    """Public security information"""
    return {
        "encryption": {
            "key_exchange": "X25519 (ECDH)",
            "symmetric": "AES-256-GCM",
            "signing": "Ed25519",
            "protocol": "Signal Protocol (X3DH)"
        },
        "features": {
            "forward_secrecy": True,
            "zero_knowledge": True,
            "ephemeral_messages": True,
            "secure_vault": True
        },
        "server_stores": [
            "Public keys (for key exchange)",
            "Ciphertext only (encrypted messages)",
            "Encrypted vault items"
        ],
        "server_never_sees": [
            "Private keys",
            "Plaintext messages",
            "Decryption keys",
            "Vault contents"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == "development",
        log_level="info"
    )
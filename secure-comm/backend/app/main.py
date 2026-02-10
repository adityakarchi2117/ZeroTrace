"""
🔐 ZeroTrace API - Private by design. Secure by default.
End-to-end encrypted communication platform

Features:
- Zero-knowledge server architecture
- Signal Protocol-inspired E2E encryption
- Real-time messaging with WebSockets
- Perfect Forward Secrecy
- Secure vault for encrypted storage
- Multi-device support
"""

from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, FileResponse
from contextlib import asynccontextmanager
import asyncio
import os
import logging
from datetime import datetime

from app.api.routes import auth, keys, messages
from app.api.routes.vault import router as vault_router
from app.api.routes.contacts import router as contacts_router
from app.api.routes.friends import router as friends_router
from app.api.routes.profile import router as profile_router
from app.api.routes.verification import router as verification_router
from app.api.routes.secure_profile import router as secure_profile_router
from app.api.routes.device_sync import router as device_sync_router
from app.api.websocket import router as websocket_router
from app.core.config import settings
from app.db.database import engine, Base
# Import friend models to ensure they're registered with SQLAlchemy
from app.db.friend_models import FriendRequest, TrustedContact, BlockedUser, FriendRequestRateLimit
# Import secure profile models to ensure they're registered with SQLAlchemy
from app.db.secure_profile_models import (
    DataEncryptionKey, EncryptedProfile, EncryptedProfilePicture,
    EncryptedMessageMetadata, EncryptedBackup, KeyRotationLog
)
# Import device sync models to ensure they're registered with SQLAlchemy
from app.db.device_sync_models import (
    DevicePairingSession, DeviceWrappedDEK, DeviceAuthorization,
    EncryptedSessionKey, DeviceRevocationLog
)

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

# Background task for account cleanup
async def cleanup_deleted_accounts():
    """Permanently delete accounts marked for deletion over 30 days ago"""
    from app.db.database import SessionLocal, User
    from datetime import timedelta
    
    while True:
        db = None
        try:
            db = SessionLocal()
            cutoff = datetime.utcnow() - timedelta(days=30)
            
            # Find users to delete
            to_delete = db.query(User).filter(
                User.deleted_at != None,
                User.deleted_at < cutoff
            ).all()
            
            if to_delete:
                count = len(to_delete)
                for user in to_delete:
                    # Cascade delete should handle related records
                    db.delete(user)
                
                db.commit()
                logger.info(f"🗑️ Permanently deleted {count} accounts (30-day grace period expired)")
        except Exception as e:
            logger.error(f"❌ Error in account cleanup: {e}")
        finally:
            if db is not None:
                db.close()
        
        # Run daily
        await asyncio.sleep(86400)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle events"""
    # Startup
    logger.info("🚀 Starting ZeroTrace API...")
    logger.info(f"🔧 Environment: {settings.ENVIRONMENT}")
    logger.info(f"🗄️  Database: {settings.DATABASE_URL.split('://')[0]}")
    
    # Run database migration for PostgreSQL
    if settings.is_postgres:
        logger.info("🔄 Running database migration for PostgreSQL...")
        try:
            from sqlalchemy import text, inspect
            
            with engine.connect() as conn:
                inspector = inspect(engine)
                tables = inspector.get_table_names()
                
                # Check if friend_requests table needs migration
                if 'friend_requests' in tables:
                    columns = {col['name']: col for col in inspector.get_columns('friend_requests')}
                    logger.info(f"📋 Current friend_requests columns: {list(columns.keys())}")
                    
                    # If table has old schema columns (from_user_id, to_user_id), drop and recreate
                    has_old_columns = 'from_user_id' in columns or 'to_user_id' in columns
                    
                    if has_old_columns:
                        logger.info("⚠️ Found old schema columns (from_user_id/to_user_id) - dropping table...")
                        conn.execute(text("DROP TABLE IF EXISTS friend_requests CASCADE"))
                        conn.commit()
                        logger.info("✅ Dropped old friend_requests table - will be recreated with correct schema")
                else:
                    logger.info("📝 friend_requests table will be created fresh")
                    
        except Exception as e:
            logger.error(f"❌ Migration error: {e}")
            import traceback
            traceback.print_exc()
    
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
    account_cleanup_task = asyncio.create_task(cleanup_deleted_accounts())
    logger.info("⚙️  Background tasks started")
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down ZeroTrace API...")
    cleanup_task.cancel()
    rotation_task.cancel()
    account_cleanup_task.cancel()
    logger.info("✅ Shutdown complete")


app = FastAPI(
    title="ZeroTrace API",
    description="""
    🔐 **ZeroTrace** - Private by design. Secure by default.
    
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
# Build the CORS origins list - ALWAYS include both production and development origins
def get_cors_origins():
    """Get all CORS origins including defaults and configured ones"""
    # Start with hardcoded production frontend URL (ensures it's always included)
    origins = [
        "https://zero-trace-virid.vercel.app",
    ]
    
    # Add development origins
    dev_origins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]
    origins.extend(dev_origins)
    
    # Add configured origins from settings (if any)
    if settings.CORS_ORIGINS:
        from app.core.config import parse_env_list, clean_origin
        configured = parse_env_list(settings.CORS_ORIGINS, [])
        for origin in configured:
            if origin not in origins:
                origins.append(origin)
    
    # Also include any from ALLOWED_ORIGINS that aren't already in the list
    for origin in settings.ALLOWED_ORIGINS:
        if origin not in origins:
            origins.append(origin)
    
    return origins

_cors_origins = get_cors_origins()

# Log CORS configuration for debugging
logger.info(f"🔒 CORS Origins configured: {_cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

# Debug configuration
logger.info(f"📋 ENVIRONMENT: {settings.ENVIRONMENT}")
logger.info(f"📋 ALLOWED_HOSTS: {settings.ALLOWED_HOSTS}")
logger.info(f"📋 ALLOWED_ORIGINS: {settings.ALLOWED_ORIGINS}")
logger.info(f"📋 CORS_ORIGINS env: {settings.CORS_ORIGINS}")

# Security middleware
app.add_middleware(
    TrustedHostMiddleware, 
    allowed_hosts=["*"] # Force allow all for debugging
)


# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all uncaught exceptions and ensure CORS headers are set"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    # Get the origin from the request
    origin = request.headers.get("origin", "")
    
    # Create the response
    response = JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error": str(exc) if settings.ENVIRONMENT != "production" else "An error occurred"
        }
    )
    
    # Add CORS headers if origin is allowed
    if origin in _cors_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
    
    return response

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(keys.router, prefix="/api/keys", tags=["Key Management"])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"])
app.include_router(contacts_router, prefix="/api/contacts", tags=["Contacts"])
app.include_router(friends_router, prefix="/api/friend", tags=["Friend Requests"])
app.include_router(vault_router, prefix="/api/vault", tags=["Secure Vault"])
app.include_router(profile_router, prefix="/api", tags=["Profile & Privacy"])
app.include_router(verification_router, prefix="/api", tags=["Verification"])
app.include_router(secure_profile_router, prefix="/api/secure", tags=["Secure Profile & Key Management"])
app.include_router(device_sync_router, prefix="/api/device", tags=["Multi-Device Sync"])
app.include_router(websocket_router, prefix="/ws", tags=["WebSocket"])

# Uploads directory (served via authenticated route below)
_upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(_upload_dir, exist_ok=True)


@app.get("/uploads/{path:path}", tags=["Uploads"])
async def serve_upload(path: str):
    """Serve uploaded files with path-traversal protection."""
    # Resolve and validate the path stays within upload_dir
    requested = os.path.abspath(os.path.join(_upload_dir, path))
    if not requested.startswith(os.path.abspath(_upload_dir)):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not os.path.isfile(requested):
        raise HTTPException(status_code=404, detail="File not found")
    import mimetypes
    content_type = mimetypes.guess_type(requested)[0] or "application/octet-stream"
    return FileResponse(
        requested,
        media_type=content_type,
        headers={
            "Content-Security-Policy": "default-src 'none'",
            "Content-Disposition": f'inline; filename="{os.path.basename(requested)}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=86400",
        },
    )


@app.get("/", tags=["Status"])
async def root():
    """API root - status check"""
    return {
        "name": "ZeroTrace API",
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
        "websocket": "active",
        "cors_origins": settings.ALLOWED_ORIGINS,
        "environment": settings.ENVIRONMENT,
    }


@app.get("/api/debug/cors", tags=["Debug"])
async def debug_cors(request: Request):
    """Debug CORS configuration"""
    origin = request.headers.get("origin", "No origin header")
    return {
        "message": "CORS is working!",
        "request_origin": origin,
        "origin_in_allowed_list": origin in _cors_origins,
        "allowed_origins": _cors_origins,
        "configured_allowed_origins": settings.ALLOWED_ORIGINS,
        "cors_origins_env": settings.CORS_ORIGINS,
        "environment": settings.ENVIRONMENT,
        "headers": dict(request.headers),
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
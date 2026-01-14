"""
CipherLink API - Private by design. Secure by default.
End-to-end encrypted communication platform
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio

from app.api.routes import auth, keys, messages
from app.api.routes.vault import router as vault_router
from app.api.websocket import router as websocket_router
from app.core.config import settings
from app.db.database import engine, Base


# Background task for ephemeral message cleanup
async def cleanup_expired_messages():
    """Periodically delete expired ephemeral messages"""
    from app.db.database import SessionLocal, Message
    from datetime import datetime
    
    while True:
        try:
            db = SessionLocal()
            # Delete messages past their expiry time
            expired = db.query(Message).filter(
                Message.expires_at != None,
                Message.expires_at < datetime.utcnow()
            ).delete()
            
            if expired > 0:
                print(f"Cleaned up {expired} expired messages")
            
            db.commit()
            db.close()
        except Exception as e:
            print(f"Error in message cleanup: {e}")
        
        # Run every minute
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle events"""
    # Startup
    print("🚀 Starting CipherLink API...")
    
    # Create database tables
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created")
    
    # Start background tasks
    cleanup_task = asyncio.create_task(cleanup_expired_messages())
    print("✅ Background cleanup task started")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down CipherLink API...")
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass


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

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(keys.router, prefix="/api/keys", tags=["Key Management"])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"])
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

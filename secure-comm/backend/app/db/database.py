from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Date, Text, ForeignKey, Enum, Index, JSON
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
from datetime import datetime
import enum
from app.core.config import settings

# Fix DATABASE_URL for Render (postgres:// -> postgresql://)
database_url = settings.DATABASE_URL
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

# Configure engine based on database type
if settings.is_postgres:
    # PostgreSQL configuration with SSL for production (Render, etc.)
    connect_args = {}
    if settings.ENVIRONMENT == "production":
        # Use SSL for production PostgreSQL (required by Render)
        connect_args = {"sslmode": "require"}
    
    engine = create_engine(
        database_url,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
        pool_recycle=1800,
        connect_args=connect_args,
        # Prevent SQL injection logging
        echo=settings.DEBUG,  # Only log SQL in debug mode
    )
else:
    # SQLite configuration
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
        echo=settings.DEBUG,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ============ Enums ============

class DeviceTypeEnum(str, enum.Enum):
    WEB = "web"
    MOBILE = "mobile"
    DESKTOP = "desktop"


class MessageTypeEnum(str, enum.Enum):
    TEXT = "text"
    IMAGE = "image"
    FILE = "file"
    VOICE = "voice"
    KEY_EXCHANGE = "key_exchange"
    SYSTEM = "system"


class ExpiryTypeEnum(str, enum.Enum):
    NONE = "none"
    AFTER_READ = "after_read"
    TIMED_10S = "10s"
    TIMED_1M = "1m"
    TIMED_1H = "1h"
    TIMED_24H = "24h"


class MessageStatusEnum(str, enum.Enum):
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    EXPIRED = "expired"
    DELETED = "deleted"


class VaultItemTypeEnum(str, enum.Enum):
    NOTE = "note"
    PASSWORD = "password"
    DOCUMENT = "document"
    CREDENTIAL = "credential"
    CRYPTO_KEY = "crypto_key"
    CUSTOM = "custom"


class VisibilityLevel(str, enum.Enum):
    EVERYONE = "everyone"
    FRIENDS = "friends"
    NOBODY = "nobody"


class VerificationTypeEnum(str, enum.Enum):
    IDENTITY = "identity"
    EMAIL = "email"
    PHONE = "phone"
    ORGANIZATION = "organization"
    CUSTOM = "custom"


class VerificationStatusEnum(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


# ============ Database Models ============

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    
    # Cryptographic identity
    public_key = Column(Text, nullable=True)  # RSA/ECC public key for encryption
    identity_key = Column(Text, nullable=True)  # Long-term Ed25519 identity key
    signed_prekey = Column(Text, nullable=True)  # X25519 signed pre-key
    signed_prekey_signature = Column(Text, nullable=True)
    signed_prekey_timestamp = Column(DateTime, nullable=True)
    
    # Account status
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    is_disabled = Column(Boolean, default=False)  # User-initiated disable
    disabled_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete timestamp
    created_at = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, nullable=True)
    settings = Column(JSON, nullable=True)  # User preferences (theme, etc.)
    
    # Username change tracking
    last_username_change = Column(DateTime, nullable=True)
    previous_usernames = Column(JSON, nullable=True)  # List of previous usernames
    
    # Relationships
    devices = relationship("Device", back_populates="user", cascade="all, delete-orphan")
    one_time_prekeys = relationship("OneTimePreKey", back_populates="user", cascade="all, delete-orphan")
    sent_messages = relationship("Message", foreign_keys="Message.sender_id", back_populates="sender")
    received_messages = relationship("Message", foreign_keys="Message.recipient_id", back_populates="recipient")
    vault_items = relationship("VaultItem", back_populates="user", cascade="all, delete-orphan")
    contacts = relationship("Contact", foreign_keys="Contact.user_id", back_populates="user")
    initiated_calls = relationship("CallLog", foreign_keys="CallLog.caller_id", back_populates="caller")
    received_calls = relationship("CallLog", foreign_keys="CallLog.receiver_id", back_populates="receiver")
    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    privacy = relationship("PrivacySettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('ix_users_identity_key', 'identity_key'),
    )


class CallTypeEnum(str, enum.Enum):
    AUDIO = "audio"
    VIDEO = "video"


class CallStatusEnum(str, enum.Enum):
    COMPLETED = "completed"
    MISSED = "missed"
    REJECTED = "rejected"
    FAILED = "failed"


class CallLog(Base):
    __tablename__ = "call_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    caller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    call_type = Column(Enum(CallTypeEnum), default=CallTypeEnum.AUDIO)
    status = Column(Enum(CallStatusEnum), default=CallStatusEnum.COMPLETED)
    
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0)
    
    caller_deleted = Column(Boolean, default=False)
    receiver_deleted = Column(Boolean, default=False)
    
    caller = relationship("User", foreign_keys=[caller_id], back_populates="initiated_calls")
    receiver = relationship("User", foreign_keys=[receiver_id], back_populates="received_calls")


class UserProfile(Base):
    __tablename__ = "user_profiles"
    
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    display_name = Column(String(100), nullable=True)
    bio = Column(Text, nullable=True)
    birthday = Column(Date, nullable=True)
    location_city = Column(String(120), nullable=True)
    website = Column(String(255), nullable=True)
    social_links = Column(JSON, nullable=True)
    status_message = Column(String(160), nullable=True)
    pronouns = Column(String(32), nullable=True)
    emoji_badge = Column(String(16), nullable=True)
    theme = Column(JSON, nullable=True)
    banner_url = Column(String(512), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    avatar_blur = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="profile")


class PrivacySettings(Base):
    __tablename__ = "privacy_settings"
    
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    
    profile_visibility = Column(Enum(VisibilityLevel), default=VisibilityLevel.FRIENDS)
    avatar_visibility = Column(Enum(VisibilityLevel), default=VisibilityLevel.FRIENDS)
    field_visibility = Column(JSON, nullable=True)  # granular per-field map
    
    last_seen_visibility = Column(Enum(VisibilityLevel), default=VisibilityLevel.FRIENDS)
    online_visibility = Column(Enum(VisibilityLevel), default=VisibilityLevel.FRIENDS)
    typing_visibility = Column(Enum(VisibilityLevel), default=VisibilityLevel.FRIENDS)
    read_receipts_visibility = Column(Enum(VisibilityLevel), default=VisibilityLevel.FRIENDS)
    
    discovery_opt_in = Column(Boolean, default=True)
    message_request_policy = Column(Enum(VisibilityLevel), default=VisibilityLevel.FRIENDS)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="privacy")


class Device(Base):
    """Multi-device support"""
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    device_id = Column(String(100), unique=True, index=True, nullable=False)
    device_type = Column(Enum(DeviceTypeEnum), default=DeviceTypeEnum.WEB)
    device_name = Column(String(100), nullable=True)
    
    # Device-specific keys
    public_key = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    
    # Push notification token
    push_token = Column(String(255), nullable=True)
    
    user = relationship("User", back_populates="devices")


class OneTimePreKey(Base):
    """One-time pre-keys for Perfect Forward Secrecy"""
    __tablename__ = "one_time_prekeys"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    key_id = Column(Integer, nullable=False)  # Client-assigned key ID
    public_key = Column(Text, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    used_at = Column(DateTime, nullable=True)
    
    user = relationship("User", back_populates="one_time_prekeys")
    
    __table_args__ = (
        Index('ix_otp_user_unused', 'user_id', 'is_used'),
    )


class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Encrypted content (ciphertext only)
    encrypted_content = Column(Text, nullable=False)
    encrypted_key = Column(Text, nullable=True)  # Encrypted AES key for hybrid encryption
    
    # Message metadata
    message_type = Column(Enum(MessageTypeEnum), default=MessageTypeEnum.TEXT)
    status = Column(Enum(MessageStatusEnum), default=MessageStatusEnum.SENT)
    
    # Ephemeral messaging
    expiry_type = Column(Enum(ExpiryTypeEnum), default=ExpiryTypeEnum.NONE)
    expires_at = Column(DateTime, nullable=True)
    
    # Reply threading
    reply_to_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    
    # For file messages
    file_id = Column(String(100), nullable=True)
    file_metadata = Column(JSON, nullable=True)
    
    # Theme synchronization (unencrypted UI metadata)
    sender_theme = Column(JSON, nullable=True)
    
    # Soft deletion for each user
    sender_deleted = Column(Boolean, default=False)
    recipient_deleted = Column(Boolean, default=False)

    
    sender = relationship("User", foreign_keys=[sender_id], back_populates="sent_messages")
    recipient = relationship("User", foreign_keys=[recipient_id], back_populates="received_messages")
    reply_to = relationship("Message", remote_side=[id])
    
    __table_args__ = (
        Index('ix_messages_conversation', 'sender_id', 'recipient_id', 'created_at'),
        Index('ix_messages_recipient_status', 'recipient_id', 'status'),
    )


class VaultItem(Base):
    """Secure Vault storage"""
    __tablename__ = "vault_items"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # All encrypted client-side
    encrypted_content = Column(Text, nullable=False)
    encrypted_key = Column(Text, nullable=False)
    iv = Column(String(50), nullable=False)
    
    item_type = Column(Enum(VaultItemTypeEnum), default=VaultItemTypeEnum.NOTE)
    encrypted_title = Column(Text, nullable=True)
    encrypted_tags = Column(Text, nullable=True)
    
    # Sync metadata
    version = Column(Integer, default=1)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="vault_items")
    
    __table_args__ = (
        Index('ix_vault_user_updated', 'user_id', 'updated_at'),
    )


class Contact(Base):
    """User contacts"""
    __tablename__ = "contacts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    contact_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    nickname = Column(String(100), nullable=True)  # Encrypted nickname
    created_at = Column(DateTime, default=datetime.utcnow)
    is_blocked = Column(Boolean, default=False)
    
    user = relationship("User", foreign_keys=[user_id], back_populates="contacts")
    contact_user = relationship("User", foreign_keys=[contact_user_id])
    
    __table_args__ = (
        Index('ix_contacts_user', 'user_id', 'contact_user_id', unique=True),
    )


class QRLoginSession(Base):
    """QR code login sessions"""
    __tablename__ = "qr_login_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Set when approved
    challenge = Column(String(100), nullable=False)
    status = Column(String(20), default="pending")  # pending, approved, expired
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    approved_device_id = Column(String(100), nullable=True)


class RefreshToken(Base):
    """Refresh tokens for token rotation"""
    __tablename__ = "refresh_tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    device_id = Column(String(100), nullable=False)
    token_hash = Column(String(255), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    is_revoked = Column(Boolean, default=False)
    
    __table_args__ = (
        Index('ix_refresh_token_user_device', 'user_id', 'device_id'),
    )


class VerificationBadge(Base):
    """User verification badges"""
    __tablename__ = "verification_badges"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    verification_type = Column(Enum(VerificationTypeEnum), nullable=False)
    badge_label = Column(String(100), nullable=True)  # Custom label for custom badges
    badge_color = Column(String(20), nullable=True)  # Hex color for badge
    verified_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)  # For temporary verifications
    verified_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # Admin who verified
    verification_data = Column(JSON, nullable=True)  # Store verification metadata
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", foreign_keys=[user_id])
    verifier = relationship("User", foreign_keys=[verified_by], passive_deletes=True)
    
    __table_args__ = (
        Index('ix_verification_badges_user_id', 'user_id'),
        Index('ix_verification_badges_type', 'verification_type'),
    )


class VerificationRequest(Base):
    """Verification requests from users"""
    __tablename__ = "verification_requests"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    verification_type = Column(Enum(VerificationTypeEnum), nullable=False)
    status = Column(Enum(VerificationStatusEnum), default=VerificationStatusEnum.PENDING)
    requested_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    supporting_documents = Column(JSON, nullable=True)  # URLs to uploaded documents
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", foreign_keys=[user_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by], passive_deletes=True)
    
    __table_args__ = (
        Index('ix_verification_requests_user_id', 'user_id'),
        Index('ix_verification_requests_status', 'status'),
    )


class VerificationHistory(Base):
    """Audit trail for verification actions"""
    __tablename__ = "verification_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    verification_type = Column(Enum(VerificationTypeEnum), nullable=False)
    action = Column(String(50), nullable=False)  # 'granted', 'revoked', 'expired'
    performed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason = Column(Text, nullable=True)
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", foreign_keys=[user_id])
    performer = relationship("User", foreign_keys=[performed_by], passive_deletes=True)
    
    __table_args__ = (
        Index('ix_verification_history_user_id', 'user_id'),
    )


class ProfileHistory(Base):
    """Audit trail for profile changes with rollback support"""
    __tablename__ = "profile_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    changed_fields = Column(JSON, nullable=False, default=list)
    snapshot = Column(JSON, nullable=False, default=dict)
    change_source = Column(String(50), nullable=False, default="user")
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index('ix_profile_history_user_id', 'user_id'),
    )


class ProfileReport(Base):
    """Reports against user profiles"""
    __tablename__ = "profile_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(String(64), unique=True, nullable=False)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reported_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reason = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    evidence_snapshot = Column(JSON, nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

    reporter = relationship("User", foreign_keys=[reporter_id])
    reported_user = relationship("User", foreign_keys=[reported_user_id])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

"""
Friend Request & Secure Contact Database Models
SQLAlchemy models for the friend system
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Enum, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
import enum

from app.db.database import Base


class FriendRequestStatusEnum(str, enum.Enum):
    """Status of a friend request"""
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class TrustLevelEnum(str, enum.Enum):
    """Level of trust for a contact"""
    UNVERIFIED = "unverified"
    VERIFIED = "verified"
    TRUSTED = "trusted"


class BlockReasonEnum(str, enum.Enum):
    """Reason for blocking a user"""
    SPAM = "spam"
    HARASSMENT = "harassment"
    UNWANTED = "unwanted"
    OTHER = "other"


class FriendRequest(Base):
    """
    Friend request table
    Stores pending, accepted, and rejected friend requests
    Encrypted at rest where applicable
    """
    __tablename__ = "friend_requests"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Sender information
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_public_key_fingerprint = Column(String(64), nullable=False)  # SHA-256 fingerprint
    
    # Receiver information
    receiver_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    receiver_public_key_fingerprint = Column(String(64), nullable=True)  # Set on accept
    
    # Request metadata
    encrypted_message = Column(Text, nullable=True)  # Optional intro message (encrypted)
    status = Column(Enum(FriendRequestStatusEnum), default=FriendRequestStatusEnum.PENDING, index=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)  # Requests expire after 7 days
    
    # Security: Nonce for replay protection
    request_nonce = Column(String(64), unique=True, nullable=False)
    
    # Relationships
    sender = relationship("User", foreign_keys=[sender_id])
    receiver = relationship("User", foreign_keys=[receiver_id])
    
    __table_args__ = (
        # Prevent duplicate requests
        Index('ix_friend_request_sender_receiver', 'sender_id', 'receiver_id'),
        # Quick lookup for pending requests
        Index('ix_friend_request_pending', 'receiver_id', 'status'),
        # Expiry cleanup index
        Index('ix_friend_request_expires', 'expires_at', 'status'),
    )
    
    @staticmethod
    def default_expiry():
        """Friend requests expire in 7 days"""
        return datetime.utcnow() + timedelta(days=7)


class TrustedContact(Base):
    """
    Trusted contacts table
    Only created after mutual friend request acceptance
    Contains verified key exchange information
    """
    __tablename__ = "trusted_contacts"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # The user who owns this contact entry
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # The trusted contact
    contact_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Key verification information
    contact_public_key_fingerprint = Column(String(64), nullable=False)
    contact_identity_key_fingerprint = Column(String(64), nullable=True)
    
    # Trust and verification status
    trust_level = Column(Enum(TrustLevelEnum), default=TrustLevelEnum.UNVERIFIED)
    is_verified = Column(Boolean, default=False)  # True if manually verified (QR/fingerprint)
    verification_date = Column(DateTime, nullable=True)
    
    # User-defined metadata (encrypted on client)
    encrypted_nickname = Column(Text, nullable=True)
    encrypted_notes = Column(Text, nullable=True)
    
    # Key exchange tracking
    last_key_exchange = Column(DateTime, default=datetime.utcnow)
    key_version = Column(Integer, default=1)  # Track key rotations
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    
    # Soft delete for contact removal
    is_removed = Column(Boolean, default=False)
    removed_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    contact_user = relationship("User", foreign_keys=[contact_user_id])
    
    __table_args__ = (
        # Each user can only have one contact entry per contact user
        UniqueConstraint('user_id', 'contact_user_id', name='uq_trusted_contact'),
        Index('ix_trusted_contact_user', 'user_id', 'is_removed'),
    )


class BlockedUser(Base):
    """
    Blocked users table
    Prevents any communication from blocked users
    """
    __tablename__ = "blocked_users"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # The user who blocked
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # The blocked user
    blocked_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Block information
    reason = Column(Enum(BlockReasonEnum), default=BlockReasonEnum.OTHER)
    encrypted_additional_info = Column(Text, nullable=True)  # Additional info (encrypted)
    
    # Timestamps
    blocked_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    blocked_user = relationship("User", foreign_keys=[blocked_user_id])
    
    __table_args__ = (
        # Each user can only block another user once
        UniqueConstraint('user_id', 'blocked_user_id', name='uq_blocked_user'),
        Index('ix_blocked_user', 'user_id'),
    )


class FriendRequestRateLimit(Base):
    """
    Rate limiting table for friend requests
    Prevents spam and abuse
    """
    __tablename__ = "friend_request_rate_limits"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    # Rate limit counters
    requests_sent_today = Column(Integer, default=0)
    searches_today = Column(Integer, default=0)
    
    # Reset timestamps
    last_request_at = Column(DateTime, nullable=True)
    last_search_at = Column(DateTime, nullable=True)
    counter_reset_at = Column(DateTime, default=datetime.utcnow)
    
    # Abuse tracking
    failed_requests_count = Column(Integer, default=0)  # Requests to non-existent users
    is_rate_limited = Column(Boolean, default=False)
    rate_limit_until = Column(DateTime, nullable=True)
    
    user = relationship("User", foreign_keys=[user_id])


class NotificationTypeEnum(str, enum.Enum):
    """Types of notifications"""
    FRIEND_REQUEST = "friend_request"
    FRIEND_REQUEST_ACCEPTED = "friend_request_accepted"
    FRIEND_REQUEST_REJECTED = "friend_request_rejected"
    CONTACT_REMOVED = "contact_removed"
    USER_BLOCKED = "user_blocked"
    USER_UNBLOCKED = "user_unblocked"
    KEY_CHANGED = "key_changed"
    CONTACT_VERIFIED = "contact_verified"
    SYSTEM = "system"


class Notification(Base):
    """
    Persistent notifications table
    Stores notifications for delivery tracking and offline users
    """
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Recipient
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Notification details
    notification_type = Column(Enum(NotificationTypeEnum), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=True)
    
    # Associated data (JSON for flexibility)
    payload = Column(Text, nullable=True)  # JSON payload with additional data
    
    # Related entities
    related_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    related_request_id = Column(Integer, nullable=True)
    
    # Status tracking
    is_read = Column(Boolean, default=False)
    is_delivered = Column(Boolean, default=False)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    expires_at = Column(DateTime, nullable=True)  # Auto-delete old notifications
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    related_user = relationship("User", foreign_keys=[related_user_id])
    
    __table_args__ = (
        Index('ix_notification_user_unread', 'user_id', 'is_read'),
        Index('ix_notification_created', 'created_at'),
    )


class RejectionLog(Base):
    """
    Rejection hash log for anti-spam
    Tracks rejection patterns without revealing who rejected whom
    """
    __tablename__ = "rejection_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Hashed pair of user IDs (prevents lookup while allowing pattern detection)
    rejection_hash = Column(String(64), unique=True, nullable=False, index=True)
    
    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Count for detecting harassment patterns
    rejection_count = Column(Integer, default=1)

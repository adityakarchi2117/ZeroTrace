"""
Multi-Device Sync Database Models

Tables for:
- DevicePairingSession: QR/token-based secure device linking
- DeviceWrappedDEK: Per-device wrapped DEK (each device has its own wrapping)
- DeviceAuthorization: Approved devices with fingerprints
- EncryptedSessionKey: Wrapped session keys for message history sync
- DeviceRevocationLog: Audit trail for revocations
- RecoveryKeyBackup: Password-derived recovery key for DEK backup
"""

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text,
    ForeignKey, Index, JSON, BigInteger, UniqueConstraint
)
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.database import Base


class DevicePairingSession(Base):
    """
    Short-lived pairing session for linking a new device.

    Flow:
      1. Existing device calls POST /device/pair/init → gets pairing_token
      2. Token is displayed as QR code on existing device
      3. New device scans QR, calls POST /device/pair/confirm with token +
         its own device_public_key
      4. Existing device approves, re-wraps DEK for new device's key
      5. Session is marked 'completed'
    """
    __tablename__ = "device_pairing_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Unique short-lived token (displayed as QR code)
    pairing_token = Column(String(128), unique=True, nullable=False, index=True)
    # Challenge for mutual authentication
    challenge = Column(String(128), nullable=False)

    # Status: pending → scanned → approved → completed | expired | rejected
    status = Column(String(20), nullable=False, default="pending")

    # New device info (populated when scanned)
    new_device_id = Column(String(128), nullable=True)
    new_device_name = Column(String(128), nullable=True)
    new_device_type = Column(String(20), nullable=True)  # web, mobile, desktop
    new_device_public_key = Column(Text, nullable=True)
    new_device_fingerprint = Column(String(64), nullable=True)

    # Initiating device info
    initiator_device_id = Column(String(128), nullable=True)
    initiator_ip = Column(String(45), nullable=True)

    # DEK re-wrapped for new device (set on approval)
    wrapped_dek_for_device = Column(Text, nullable=True)
    dek_wrap_nonce = Column(String(100), nullable=True)

    # Security metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    scanned_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index('ix_pairing_user_status', 'user_id', 'status'),
        Index('ix_pairing_token', 'pairing_token'),
    )


class DeviceWrappedDEK(Base):
    """
    Per-device wrapped DEK.

    Each authorized device gets its own copy of the DEK, wrapped with
    that device's public key. This way, revoking a device just means
    deleting its wrapped DEK row — the DEK itself can be rotated if
    the user wants extra security.

    Key difference from DataEncryptionKey:
      - DataEncryptionKey stores DEK wrapped with identity key (user-level)
      - DeviceWrappedDEK stores DEK wrapped per-device (device-level)
    """
    __tablename__ = "device_wrapped_deks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(String(128), nullable=False)

    # DEK wrapped with this specific device's public key
    wrapped_dek = Column(Text, nullable=False)
    wrap_nonce = Column(String(100), nullable=False)
    wrap_algorithm = Column(String(100), default="x25519-xsalsa20-poly1305")

    # Which DEK version this wrapping corresponds to
    dek_version = Column(Integer, nullable=False)

    # Whether this device wrapping is still valid
    is_active = Column(Boolean, default=True)
    revoked_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index('ix_dev_dek_user_device', 'user_id', 'device_id'),
        Index('ix_dev_dek_active', 'user_id', 'is_active'),
        UniqueConstraint('user_id', 'device_id', 'dek_version', name='uq_device_dek_version'),
    )


class DeviceAuthorization(Base):
    """
    Authorized device registry.

    Each confirmed device is recorded here with its fingerprint
    and metadata. Users can view, manage, and revoke devices.
    """
    __tablename__ = "device_authorizations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(String(128), nullable=False)

    # Device metadata
    device_name = Column(String(128), nullable=True)
    device_type = Column(String(20), default="web")  # web, mobile, desktop
    device_public_key = Column(Text, nullable=False)
    device_fingerprint = Column(String(64), nullable=False)

    # Security
    is_active = Column(Boolean, default=True)
    is_primary = Column(Boolean, default=False)  # The original / first device
    last_verified_at = Column(DateTime, default=datetime.utcnow)
    last_ip = Column(String(45), nullable=True)

    # Lifecycle
    authorized_at = Column(DateTime, default=datetime.utcnow)
    revoked_at = Column(DateTime, nullable=True)
    revoke_reason = Column(String(200), nullable=True)

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index('ix_dev_auth_user', 'user_id'),
        Index('ix_dev_auth_device', 'device_id'),
        UniqueConstraint('user_id', 'device_id', name='uq_user_device'),
    )


class EncryptedSessionKey(Base):
    """
    Wrapped session keys for message history sync.

    Each chat session has a session key that encrypts messages.
    The session key is wrapped with the DEK so any device that has
    the DEK can unwrap it and decrypt old messages.

    Structure:
      DEK → wraps → SessionKey → encrypts → Messages
    """
    __tablename__ = "encrypted_session_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Which conversation this session key belongs to
    conversation_id = Column(String(200), nullable=False)  # "{user1_id}:{user2_id}" sorted

    # Session key wrapped with DEK
    wrapped_session_key = Column(Text, nullable=False)
    session_key_nonce = Column(String(100), nullable=False)
    wrap_algorithm = Column(String(100), default="xsalsa20-poly1305")

    # Tracking
    dek_version = Column(Integer, nullable=False)
    key_version = Column(Integer, nullable=False, default=1)
    is_active = Column(Boolean, default=True)

    # Message range this key covers
    first_message_id = Column(Integer, nullable=True)
    last_message_id = Column(Integer, nullable=True)
    message_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    rotated_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index('ix_session_key_user_conv', 'user_id', 'conversation_id'),
        Index('ix_session_key_active', 'user_id', 'is_active'),
    )


class DeviceRevocationLog(Base):
    """
    Audit trail for device revocations.
    """
    __tablename__ = "device_revocation_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    revoked_device_id = Column(String(128), nullable=False)
    revoked_device_name = Column(String(128), nullable=True)
    revoked_by_device_id = Column(String(128), nullable=True)

    reason = Column(String(200), nullable=True)
    dek_rotated = Column(Boolean, default=False)
    old_dek_version = Column(Integer, nullable=True)
    new_dek_version = Column(Integer, nullable=True)

    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index('ix_dev_revoke_user', 'user_id'),
    )


class RecoveryKeyBackup(Base):
    """
    Password-derived recovery key backup for DEK.

    When all devices are lost, the user can recover their DEK
    using their password. The DEK is encrypted with a key derived
    from the user's password via Argon2/PBKDF2 (done client-side).

    The server stores ONLY the encrypted DEK + salt + parameters.
    It NEVER sees the raw password or derived key.

    Flow:
      1. Client derives recovery_key from password using PBKDF2/Argon2
      2. Client encrypts DEK with recovery_key
      3. Client uploads encrypted_dek + salt + kdf_params
      4. On recovery: client re-derives key → decrypts DEK → restores access
    """
    __tablename__ = "recovery_key_backups"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # DEK encrypted with password-derived key
    encrypted_dek = Column(Text, nullable=False)
    encryption_nonce = Column(String(100), nullable=False)
    encryption_algorithm = Column(String(100), default="xsalsa20-poly1305")

    # KDF parameters (so client can re-derive the same key)
    kdf_salt = Column(String(200), nullable=False)
    kdf_algorithm = Column(String(50), default="pbkdf2-sha256")  # or argon2id
    kdf_iterations = Column(Integer, default=600000)
    kdf_memory = Column(Integer, nullable=True)  # For Argon2 only (KB)
    kdf_parallelism = Column(Integer, nullable=True)  # For Argon2 only

    # Which DEK version this backup covers
    dek_version = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index('ix_recovery_user', 'user_id'),
        Index('ix_recovery_active', 'user_id', 'is_active'),
    )


class PublicKeyHistory(Base):
    """
    Historical record of a user's public keys.

    When a user uploads new keys (e.g., from a new device or key rotation),
    the PREVIOUS public key is saved here before being overwritten.
    This enables:
      - Decryption of old messages encrypted with a previous key
      - Audit trail of key changes
      - Key mismatch diagnostics

    Key lifecycle:
      1. User registers → first public_key stored on User model
      2. User logs in from new device → generates new keys
      3. upload_keys saves OLD key to this table → overwrites User.public_key
      4. Old messages can still reference the historical key for decryption
    """
    __tablename__ = "public_key_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # The previous public key that was replaced
    public_key = Column(Text, nullable=False)
    identity_key = Column(Text, nullable=True)
    signed_prekey = Column(Text, nullable=True)
    signed_prekey_signature = Column(Text, nullable=True)

    # When this key was the active key
    active_from = Column(DateTime, nullable=True)
    active_until = Column(DateTime, default=datetime.utcnow)

    # Why the key changed
    reason = Column(String(200), default="key_upload")  # key_upload, rotation, device_change

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index('ix_key_history_user', 'user_id'),
        Index('ix_key_history_user_active', 'user_id', 'active_until'),
    )

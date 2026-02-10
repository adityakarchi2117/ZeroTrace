"""
Secure Profile Database Models

Database tables for:
- Data Encryption Keys (DEK) with version tracking
- Encrypted profile blobs
- Encrypted profile pictures
- Encrypted message metadata
- Encrypted backups
- Key rotation audit log
"""

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text,
    ForeignKey, Index, JSON, BigInteger
)
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.database import Base


class DataEncryptionKey(Base):
    """
    Data Encryption Key (DEK) - Layer 2 of the key hierarchy.
    
    The DEK is generated client-side, encrypted (wrapped) with the 
    user's identity key, and stored on the server as ciphertext.
    The server NEVER sees the plaintext DEK.
    
    On key rotation, the DEK is re-wrapped with the new identity key
    but the DEK itself does NOT change — so all encrypted profile data
    remains accessible without re-encryption.
    """
    __tablename__ = "data_encryption_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # The DEK wrapped (encrypted) with the user's identity key
    wrapped_dek = Column(Text, nullable=False)
    # Nonce used for the wrapping
    nonce = Column(String(100), nullable=False)
    # Algorithm used for wrapping
    dek_algorithm = Column(String(100), default="x25519-xsalsa20-poly1305")
    # Monotonically increasing version for tracking rotation
    dek_version = Column(Integer, nullable=False, default=1)
    
    # Whether this is the currently active DEK
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    rotated_at = Column(DateTime, nullable=True)
    
    user = relationship("User", foreign_keys=[user_id])
    
    __table_args__ = (
        Index('ix_dek_user_active', 'user_id', 'is_active'),
        Index('ix_dek_user_version', 'user_id', 'dek_version'),
    )


class EncryptedProfile(Base):
    """
    Encrypted profile data blob.
    
    All profile fields (display_name, bio, location, etc.) are serialized
    to JSON, encrypted with the DEK client-side, and stored here as a
    single encrypted blob. The server NEVER sees plaintext profile data.
    
    Version tracking allows rollback and audit.
    """
    __tablename__ = "encrypted_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Encrypted profile data (JSON encrypted with DEK)
    encrypted_blob = Column(Text, nullable=False)
    # Nonce for this encryption
    blob_nonce = Column(String(100), nullable=False)
    # Which DEK version was used to encrypt this blob
    dek_version = Column(Integer, nullable=False)
    # SHA-256 hash of plaintext for integrity verification
    content_hash = Column(String(64), nullable=False)
    
    # Monotonically increasing version for this profile
    version = Column(Integer, nullable=False, default=1)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", foreign_keys=[user_id])
    
    __table_args__ = (
        Index('ix_enc_profile_user', 'user_id'),
        Index('ix_enc_profile_user_version', 'user_id', 'version'),
    )


class EncryptedProfilePicture(Base):
    """
    Encrypted profile picture storage.
    
    Profile pictures are encrypted client-side with the DEK and stored
    as encrypted blobs. Linked to a profile version.
    """
    __tablename__ = "encrypted_profile_pictures"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Encrypted file stored on disk, this is just the path reference
    encrypted_file_path = Column(String(512), nullable=False)
    # Nonce for file encryption
    file_nonce = Column(String(100), nullable=False)
    # Which DEK version was used
    dek_version = Column(Integer, nullable=False)
    # SHA-256 hash of original file
    content_hash = Column(String(64), nullable=False)
    # Original metadata
    mime_type = Column(String(50), default="image/jpeg")
    file_size = Column(BigInteger, default=0)
    
    # Profile version this picture belongs to
    version = Column(Integer, nullable=False, default=1)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", foreign_keys=[user_id])
    
    __table_args__ = (
        Index('ix_enc_pic_user', 'user_id'),
    )


class EncryptedMessageMetadata(Base):
    """
    Encrypted message metadata (chat settings, nicknames, pinned chats).
    
    This data is encrypted with the DEK (not session keys) so it
    persists across session key rotations. Stored per-type per-user.
    """
    __tablename__ = "encrypted_message_metadata"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Encrypted metadata blob
    encrypted_blob = Column(Text, nullable=False)
    blob_nonce = Column(String(100), nullable=False)
    dek_version = Column(Integer, nullable=False)
    
    # Type of metadata: chat_settings, contact_nicknames, pinned_chats, preferences
    metadata_type = Column(String(50), nullable=False, default="chat_settings")
    
    version = Column(Integer, nullable=False, default=1)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", foreign_keys=[user_id])
    
    __table_args__ = (
        Index('ix_enc_meta_user_type', 'user_id', 'metadata_type'),
    )


class EncryptedBackup(Base):
    """
    Encrypted backup bundles.
    
    Contains wrapped DEK + encrypted profile + encrypted metadata.
    User controls export/import. Server stores only ciphertext.
    """
    __tablename__ = "encrypted_backups"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    backup_id = Column(String(64), unique=True, nullable=False, index=True)
    
    # Encrypted backup data
    encrypted_backup = Column(Text, nullable=False)
    backup_nonce = Column(String(100), nullable=False)
    
    # DEK wrapped for backup
    wrapped_dek = Column(Text, nullable=False)
    dek_wrap_nonce = Column(String(100), nullable=False)
    
    # Hash of backup password for verification
    backup_key_hash = Column(String(128), nullable=False)
    
    # Version tracking
    profile_version = Column(Integer, nullable=False)
    metadata_versions = Column(JSON, nullable=True)
    
    # File size for listing
    file_size = Column(BigInteger, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", foreign_keys=[user_id])
    
    __table_args__ = (
        Index('ix_enc_backup_user', 'user_id'),
    )


class KeyRotationLog(Base):
    """
    Audit log for key rotation events.
    
    Tracks every key rotation with before/after fingerprints
    for security auditing and tamper detection.
    """
    __tablename__ = "key_rotation_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # What changed
    rotation_type = Column(String(50), nullable=False)  # identity, dek, session, full
    old_key_fingerprint = Column(String(64), nullable=True)
    new_key_fingerprint = Column(String(64), nullable=True)
    
    # DEK versioning
    old_dek_version = Column(Integer, nullable=True)
    new_dek_version = Column(Integer, nullable=True)
    
    # Device that initiated
    device_id = Column(String(100), nullable=True)
    ip_address = Column(String(45), nullable=True)
    
    # Result
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", foreign_keys=[user_id])
    
    __table_args__ = (
        Index('ix_key_rotation_user', 'user_id'),
        Index('ix_key_rotation_created', 'created_at'),
    )

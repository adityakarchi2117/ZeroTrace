"""
Secure Profile Models - Key Hierarchy & Encrypted Profile Persistence

Implements a 3-layer key system:
  1. Identity Key (Long-Term) - Created at signup, rarely changes
  2. Data Encryption Key (DEK) - For profile & settings, rotatable, wrapped with identity key
  3. Session Keys - For messages, rotated frequently (already exists)

All profile data is encrypted client-side with the DEK.
On key rotation, only the DEK wrapping changes — profile blobs are NOT re-encrypted.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ============ Key Hierarchy Models ============

class KeyType(str, Enum):
    IDENTITY = "identity"
    DATA_ENCRYPTION = "data_encryption"
    SESSION = "session"


class DEKCreate(BaseModel):
    """Client submits a wrapped DEK for server storage"""
    wrapped_dek: str = Field(..., description="DEK encrypted (wrapped) with identity key, base64")
    dek_algorithm: str = Field(default="x25519-xsalsa20-poly1305", description="Algorithm used for DEK wrapping")
    dek_version: int = Field(default=1, description="Version of this DEK for tracking rotation")
    nonce: str = Field(..., description="Nonce used for DEK wrapping, base64")


class DEKResponse(BaseModel):
    id: int
    user_id: int
    wrapped_dek: str
    dek_algorithm: str
    dek_version: int
    nonce: str
    is_active: bool
    created_at: datetime
    rotated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DEKRotateRequest(BaseModel):
    """Re-wrap existing DEK with new identity key"""
    new_wrapped_dek: str = Field(..., description="DEK re-wrapped with new identity key, base64")
    new_nonce: str = Field(..., description="New nonce for the re-wrapping, base64")
    old_dek_version: int = Field(..., description="Version of the DEK being re-wrapped")


class KeyRotationRequest(BaseModel):
    """Full key rotation: new identity + re-wrapped DEK"""
    new_identity_key: str = Field(..., description="New Ed25519 identity public key, base64")
    new_public_key: str = Field(..., description="New X25519 public key, base64")
    new_signed_prekey: str = Field(..., description="New signed pre-key, base64")
    new_signed_prekey_signature: str = Field(..., description="Signature of new signed pre-key, base64")
    new_one_time_prekeys: List[str] = Field(default=[], description="Fresh one-time pre-keys")
    # Re-wrapped DEK
    rewrapped_dek: str = Field(..., description="Existing DEK re-wrapped with new identity key, base64")
    rewrapped_dek_nonce: str = Field(..., description="Nonce for the re-wrapping, base64")
    dek_version: int = Field(..., description="Version of DEK being re-wrapped")


class KeyRotationResponse(BaseModel):
    success: bool
    message: str
    new_dek_version: int
    key_version: int
    rotated_at: datetime


# ============ Encrypted Profile Models ============

class EncryptedProfileCreate(BaseModel):
    """Client submits profile encrypted with DEK"""
    encrypted_blob: str = Field(..., description="Profile data encrypted with DEK, base64")
    blob_nonce: str = Field(..., description="Nonce for profile encryption, base64")
    dek_version: int = Field(..., description="Which DEK version encrypted this blob")
    content_hash: str = Field(..., description="SHA-256 hash of plaintext for integrity verification")


class EncryptedProfileResponse(BaseModel):
    id: int
    user_id: int
    encrypted_blob: str
    blob_nonce: str
    dek_version: int
    content_hash: str
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EncryptedProfilePictureCreate(BaseModel):
    """Client submits encrypted profile picture"""
    encrypted_file: str = Field(..., description="Encrypted file data, base64")
    file_nonce: str = Field(..., description="Nonce for file encryption, base64")
    dek_version: int = Field(..., description="Which DEK version encrypted this file")
    content_hash: str = Field(..., description="SHA-256 hash of original file for integrity")
    mime_type: str = Field(default="image/jpeg", description="Original MIME type")
    file_size: int = Field(..., description="Original file size in bytes")


class EncryptedProfilePictureResponse(BaseModel):
    id: int
    user_id: int
    file_nonce: str
    dek_version: int
    content_hash: str
    mime_type: str
    file_size: int
    version: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============ Message Metadata Models ============

class EncryptedMessageMetadataCreate(BaseModel):
    """Encrypted chat metadata (nicknames, pinned chats, etc.)"""
    encrypted_blob: str = Field(..., description="Metadata encrypted with DEK, base64")
    blob_nonce: str = Field(..., description="Nonce for metadata encryption, base64")
    dek_version: int = Field(..., description="Which DEK version encrypted this blob")
    metadata_type: str = Field(default="chat_settings", description="Type: chat_settings, contact_nicknames, pinned_chats, preferences")


class EncryptedMessageMetadataResponse(BaseModel):
    id: int
    user_id: int
    encrypted_blob: str
    blob_nonce: str
    dek_version: int
    metadata_type: str
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============ Backup & Recovery Models ============

class BackupCreateRequest(BaseModel):
    """Create encrypted backup"""
    encrypted_backup: str = Field(..., description="Full backup bundle encrypted with backup key, base64")
    backup_nonce: str = Field(..., description="Nonce for backup encryption, base64")
    wrapped_dek: str = Field(..., description="DEK wrapped for backup, base64")
    dek_wrap_nonce: str = Field(..., description="Nonce for DEK wrapping in backup, base64")
    backup_key_hash: str = Field(..., description="Hash of backup password for verification")
    profile_version: int
    metadata_versions: Dict[str, int] = Field(default_factory=dict)


class BackupResponse(BaseModel):
    backup_id: str
    created_at: datetime
    profile_version: int
    file_size: int

    model_config = ConfigDict(from_attributes=True)


class BackupRestoreRequest(BaseModel):
    backup_id: str
    backup_key_hash: str = Field(..., description="Hash of backup password for verification")


class BackupRestoreResponse(BaseModel):
    encrypted_backup: str
    backup_nonce: str
    wrapped_dek: str
    dek_wrap_nonce: str
    profile_version: int
    metadata_versions: Dict[str, int]
    created_at: datetime


# ============ Profile Version Models ============

class ProfileVersionInfo(BaseModel):
    version: int
    dek_version: int
    content_hash: str
    created_at: datetime
    updated_at: datetime


class ProfileVersionListResponse(BaseModel):
    versions: List[ProfileVersionInfo]
    current_version: int
    total_versions: int


# ============ Multi-Device Sync Models ============

class DeviceSyncRequest(BaseModel):
    """Request to sync encrypted data to new device"""
    device_id: str
    device_public_key: str = Field(..., description="New device's public key for secure transfer")


class DeviceSyncResponse(BaseModel):
    """Encrypted sync package for new device"""
    wrapped_dek_for_device: str = Field(..., description="DEK re-wrapped for new device's public key")
    dek_wrap_nonce: str
    encrypted_profile: Optional[EncryptedProfileResponse] = None
    encrypted_metadata: List[EncryptedMessageMetadataResponse] = []
    dek_version: int
    profile_version: int


# ============ Key Info Models ============

class KeyInfoResponse(BaseModel):
    """Current key hierarchy status"""
    identity_key_fingerprint: str
    dek_version: int
    dek_algorithm: str
    dek_created_at: datetime
    dek_last_rotated: Optional[datetime] = None
    profile_version: int
    total_key_rotations: int
    last_rotation_at: Optional[datetime] = None

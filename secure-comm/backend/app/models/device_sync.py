"""
Multi-Device Sync Pydantic Models

Request/response schemas for device pairing, per-device DEK wrapping,
session key management, device authorization, and revocation.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict
from datetime import datetime


# ==================== Device Pairing ====================

class PairInitRequest(BaseModel):
    """Existing device initiates pairing."""
    device_id: str = Field(..., description="Initiating device's ID")
    device_name: str = Field(default="Unknown", description="Friendly name")


class PairInitResponse(BaseModel):
    """Returned to existing device — contains QR payload."""
    pairing_token: str
    challenge: str
    expires_at: datetime
    qr_payload: str = Field(..., description="JSON string for QR code encoding")


class PairScanRequest(BaseModel):
    """New device scans the QR code and calls this."""
    pairing_token: str
    device_id: str
    device_name: str = "New Device"
    device_type: str = "web"
    device_public_key: str = Field(..., description="New device's X25519 public key, base64")


class PairScanResponse(BaseModel):
    """Returned to new device after scan."""
    status: str
    challenge: str
    device_fingerprint: str
    message: str


class PairApproveRequest(BaseModel):
    """Existing device approves the pairing."""
    pairing_token: str
    wrapped_dek_for_device: str = Field(..., description="DEK re-wrapped for new device's public key")
    dek_wrap_nonce: str


class PairApproveResponse(BaseModel):
    """Returned to existing device after approval."""
    status: str
    new_device_id: str
    new_device_fingerprint: str
    message: str


class PairCompleteRequest(BaseModel):
    """New device confirms it received the DEK."""
    pairing_token: str


class PairCompleteResponse(BaseModel):
    """Final pairing response with encrypted data for new device."""
    wrapped_dek: str
    dek_wrap_nonce: str
    dek_version: int
    message: str


class PairStatusResponse(BaseModel):
    """Check pairing session status."""
    status: str
    new_device_id: Optional[str] = None
    new_device_name: Optional[str] = None
    new_device_fingerprint: Optional[str] = None
    wrapped_dek_for_device: Optional[str] = None
    dek_wrap_nonce: Optional[str] = None


# ==================== Device Authorization ====================

class DeviceInfoResponse(BaseModel):
    """Device information."""
    id: int
    device_id: str
    device_name: Optional[str]
    device_type: str
    device_fingerprint: str
    is_primary: bool
    is_active: bool
    authorized_at: datetime
    last_verified_at: Optional[datetime]
    last_ip: Optional[str]
    revoked_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DeviceListResponse(BaseModel):
    """List of authorized devices."""
    devices: List[DeviceInfoResponse]
    total: int


class DeviceRevokeRequest(BaseModel):
    """Revoke a device."""
    device_id: str = Field(..., description="Device to revoke")
    reason: str = Field(default="user_initiated", description="Revocation reason")
    rotate_dek: bool = Field(default=True, description="Also rotate DEK on revoke")
    revoking_device_id: str = Field(default="", description="Which device is revoking")


class DeviceRevokeResponse(BaseModel):
    """Revocation result."""
    success: bool
    message: str
    dek_rotated: bool
    new_dek_version: Optional[int] = None


# ==================== Session Keys ====================

class SessionKeyStoreRequest(BaseModel):
    """Store a wrapped session key."""
    conversation_id: str
    wrapped_session_key: str
    session_key_nonce: str
    dek_version: int
    key_version: int = 1
    first_message_id: Optional[int] = None


class SessionKeyResponse(BaseModel):
    """Session key data."""
    id: int
    conversation_id: str
    wrapped_session_key: str
    session_key_nonce: str
    dek_version: int
    key_version: int
    is_active: bool
    first_message_id: Optional[int]
    last_message_id: Optional[int]
    message_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SessionKeyBatchRewrapRequest(BaseModel):
    """Batch re-wrap session keys with a new DEK."""
    old_dek_version: int
    new_dek_version: int
    rewrapped_keys: List[Dict] = Field(
        ...,
        description='List of {"id": N, "wrapped_session_key": "...", "session_key_nonce": "..."}'
    )


# ==================== Key Restore ====================

class KeyRestoreRequest(BaseModel):
    """On login, request wrapped DEK for this device."""
    device_id: str


class KeyRestoreResponse(BaseModel):
    """Wrapped DEK + sync data for a device."""
    wrapped_dek: str
    wrap_nonce: str
    dek_version: int
    device_authorized: bool
    session_key_count: int
    profile_version: int


# ==================== Device Wrapped DEK ====================

class DeviceWrappedDEKResponse(BaseModel):
    """Response for per-device wrapped DEK query."""
    id: int
    device_id: str
    wrapped_dek: str
    wrap_nonce: str
    dek_version: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StoreWrappedDEKRequest(BaseModel):
    """Request body for storing a per-device wrapped DEK (moved from query params for security)."""
    device_id: str = Field(..., description="Target device ID")
    wrapped_dek: str = Field(..., description="DEK wrapped for this device (base64)")
    wrap_nonce: str = Field(..., description="Nonce used for wrapping (base64)")
    dek_version: int = Field(..., description="DEK version being wrapped")


class RegisterDeviceRequest(BaseModel):
    """Request body for registering a device (moved from query params for security)."""
    device_id: str = Field(..., description="Unique device identifier")
    device_name: str = Field(default="Web Browser", description="Human-readable device name")
    device_type: str = Field(default="web", description="Device type (web, mobile, desktop)")
    device_public_key: str = Field(default="", description="Device's public key for DEK wrapping")


# ==================== Revocation Log ====================

class RevocationLogEntry(BaseModel):
    """Single revocation event."""
    id: int
    revoked_device_id: str
    revoked_device_name: Optional[str]
    revoked_by_device_id: Optional[str]
    reason: Optional[str]
    dek_rotated: bool
    old_dek_version: Optional[int]
    new_dek_version: Optional[int]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==================== Recovery Key Backup ====================

class RecoveryBackupRequest(BaseModel):
    """Create a password-derived recovery backup for the DEK."""
    encrypted_dek: str = Field(..., description="DEK encrypted with password-derived key (base64)")
    encryption_nonce: str = Field(..., description="Nonce used for encryption (base64)")
    encryption_algorithm: str = Field(default="xsalsa20-poly1305")
    kdf_salt: str = Field(..., description="Salt used for key derivation (base64)")
    kdf_algorithm: str = Field(default="pbkdf2-sha256", description="pbkdf2-sha256 or argon2id")
    kdf_iterations: int = Field(default=600000, description="PBKDF2 iterations")
    kdf_memory: Optional[int] = Field(default=None, description="Argon2 memory cost (KB)")
    kdf_parallelism: Optional[int] = Field(default=None, description="Argon2 parallelism")
    dek_version: int = Field(..., description="Which DEK version this backup covers")


class RecoveryBackupResponse(BaseModel):
    """Recovery backup stored confirmation."""
    id: int
    dek_version: int
    kdf_algorithm: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RecoveryRestoreResponse(BaseModel):
    """Data needed to restore DEK from recovery backup."""
    encrypted_dek: str
    encryption_nonce: str
    encryption_algorithm: str
    kdf_salt: str
    kdf_algorithm: str
    kdf_iterations: int
    kdf_memory: Optional[int] = None
    kdf_parallelism: Optional[int] = None
    dek_version: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

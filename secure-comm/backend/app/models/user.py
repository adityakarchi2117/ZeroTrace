from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from enum import Enum


class DeviceType(str, Enum):
    WEB = "web"
    MOBILE = "mobile"
    DESKTOP = "desktop"


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern="^[a-zA-Z0-9_]+$")
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    # Initial device registration
    device_id: str = Field(..., description="Unique device identifier")
    device_type: DeviceType = DeviceType.WEB


class UserResponse(UserBase):
    id: int
    public_key: Optional[str] = None
    identity_key: Optional[str] = None
    created_at: datetime
    is_verified: bool = False
    last_seen: Optional[datetime] = None
    settings: Optional[dict] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


class UserProfile(BaseModel):
    """Public profile visible to other users"""
    username: str
    public_key: Optional[str] = None
    identity_key: Optional[str] = None
    is_online: bool = False
    last_seen: Optional[datetime] = None
    settings: Optional[dict] = None


# ============ Device & Key Management ============

class DeviceRegistration(BaseModel):
    """Register a new device for multi-device support"""
    device_id: str
    device_type: DeviceType
    device_name: Optional[str] = None
    public_key: str = Field(..., description="Device's public key for E2E encryption")
    identity_key: str = Field(..., description="Long-term identity key")
    signed_prekey: str = Field(..., description="Signed pre-key for forward secrecy")
    signed_prekey_signature: str = Field(..., description="Signature of the signed pre-key")
    one_time_prekeys: List[str] = Field(default=[], description="One-time pre-keys for PFS")


class DeviceResponse(BaseModel):
    id: int
    device_id: str
    device_type: DeviceType
    device_name: Optional[str] = None
    created_at: datetime
    last_active: datetime
    is_current: bool = False
    
    model_config = ConfigDict(from_attributes=True)


class KeyBundle(BaseModel):
    """Key bundle for initiating encrypted session (Signal Protocol style)"""
    user_id: int
    username: str
    identity_key: str
    signed_prekey: str
    signed_prekey_signature: str
    one_time_prekey: Optional[str] = None  # Consumed after use


class KeyBundleRequest(BaseModel):
    username: str


class PublicKeyUpload(BaseModel):
    """Upload cryptographic keys"""
    public_key: str = Field(..., description="RSA/ECC public key for encryption")
    identity_key: str = Field(..., description="Long-term identity key")
    signed_prekey: str = Field(..., description="Signed pre-key")
    signed_prekey_signature: str = Field(..., description="Pre-key signature")
    one_time_prekeys: List[str] = Field(default=[], min_length=0, max_length=100)


class PreKeyRefill(BaseModel):
    """Refill one-time pre-keys when running low"""
    one_time_prekeys: List[str] = Field(..., min_length=1, max_length=100)


# ============ Authentication ============

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = Field(None, description="Token expiry in seconds")


class TokenRefresh(BaseModel):
    refresh_token: str


class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None
    device_id: Optional[str] = None
    exp: Optional[datetime] = None


# ============ QR Code Authentication ============

class QRLoginInitiate(BaseModel):
    """Generate QR code for device pairing"""
    session_id: str
    qr_data: str  # Encrypted session data
    expires_at: datetime


class QRLoginConfirm(BaseModel):
    """Confirm QR login from authenticated device"""
    session_id: str
    encrypted_approval: str  # Signed approval from authenticated device


# ============ User Search & Contacts ============

class UserSearchResult(BaseModel):
    username: str
    identity_key: Optional[str] = None
    is_contact: bool = False


class ContactAdd(BaseModel):
    username: str
    nickname: Optional[str] = None


class UserSettingsUpdate(BaseModel):
    """Update user settings/preferences"""
    settings: dict


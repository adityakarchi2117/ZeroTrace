"""
Friend Request & Secure Contact Models
Zero-knowledge friend system with mutual consent and key exchange
"""

from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum
import hashlib
import re


class FriendRequestStatus(str, Enum):
    """Status of a friend request"""
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class TrustLevel(str, Enum):
    """Level of trust for a contact"""
    UNVERIFIED = "unverified"  # Keys exchanged but not manually verified
    VERIFIED = "verified"      # Keys manually verified (QR/fingerprint)
    TRUSTED = "trusted"        # Long-term trusted contact


class BlockReason(str, Enum):
    """Reason for blocking a user"""
    SPAM = "spam"
    HARASSMENT = "harassment"
    UNWANTED = "unwanted"
    OTHER = "other"


# ============ Request/Response Models ============

class FriendRequestCreate(BaseModel):
    """Create a new friend request"""
    receiver_username: str = Field(..., min_length=3, max_length=50)
    sender_public_key_fingerprint: str = Field(..., description="SHA-256 fingerprint of sender's public key")
    message: Optional[str] = Field(None, max_length=200, description="Optional introduction message (encrypted)")
    
    @field_validator('receiver_username')
    @classmethod
    def validate_username(cls, v):
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username must contain only alphanumeric characters and underscores')
        return v


class FriendRequestResponse(BaseModel):
    """Response model for friend request"""
    id: int
    sender_id: int
    sender_username: str
    receiver_id: int
    receiver_username: str
    sender_public_key_fingerprint: str
    receiver_public_key_fingerprint: Optional[str] = None
    message: Optional[str] = None
    status: FriendRequestStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    expires_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class FriendRequestAccept(BaseModel):
    """Accept a friend request with key verification"""
    request_id: int
    receiver_public_key_fingerprint: str = Field(..., description="SHA-256 fingerprint of receiver's public key")
    verify_sender_fingerprint: str = Field(..., description="Confirm sender's fingerprint for MITM protection")


class FriendRequestReject(BaseModel):
    """Reject a friend request"""
    request_id: int
    reason: Optional[str] = Field(None, max_length=100)


class TrustedContactResponse(BaseModel):
    """Response model for trusted contact"""
    id: int
    user_id: int
    contact_user_id: int
    contact_username: str
    public_key: Optional[str] = None
    identity_key: Optional[str] = None
    public_key_fingerprint: str
    trust_level: TrustLevel
    nickname: Optional[str] = None
    is_verified: bool
    last_key_exchange: datetime
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ContactVerification(BaseModel):
    """Verify a contact's key fingerprint"""
    contact_user_id: int
    verified_fingerprint: str = Field(..., description="The fingerprint user verified (QR scan/manual)")


class BlockUserRequest(BaseModel):
    """Block a user"""
    user_id: int
    reason: BlockReason = BlockReason.OTHER
    additional_info: Optional[str] = Field(None, max_length=200)


class UnblockUserRequest(BaseModel):
    """Unblock a user"""
    user_id: int


class BlockedUserResponse(BaseModel):
    """Response model for blocked user"""
    id: int
    blocked_user_id: int
    blocked_username: str
    reason: BlockReason
    blocked_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class UserSearchRequest(BaseModel):
    """Search for users"""
    query: str = Field(..., min_length=2, max_length=50)
    search_type: str = Field("username", description="Search by: username, user_id, or fingerprint")


class UserSearchResult(BaseModel):
    """User search result (minimal info for privacy)"""
    user_id: int
    username: str
    public_key_fingerprint: Optional[str] = None
    has_pending_request: bool = False
    is_contact: bool = False
    is_blocked: bool = False


class QRCodeData(BaseModel):
    """Data encoded in QR code for contact sharing"""
    user_id: int
    username: str
    public_key_fingerprint: str
    identity_key_fingerprint: str
    timestamp: int  # Unix timestamp for expiry
    signature: str  # Signed by user's private key


class PendingRequestsResponse(BaseModel):
    """Response with pending requests"""
    incoming: List[FriendRequestResponse]
    outgoing: List[FriendRequestResponse]
    total_incoming: int
    total_outgoing: int


# ============ Notification Models ============

class NotificationType(str, Enum):
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


class NotificationResponse(BaseModel):
    """Response model for notification"""
    id: int
    notification_type: NotificationType
    title: str
    message: Optional[str] = None
    payload: Optional[dict] = None
    related_user_id: Optional[int] = None
    related_username: Optional[str] = None
    is_read: bool
    is_delivered: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class NotificationCountResponse(BaseModel):
    """Response model for notification counts"""
    total: int
    unread: int
    friend_requests: int
    security_alerts: int


class UnfriendRequest(BaseModel):
    """Unfriend a user"""
    user_id: int
    revoke_keys: bool = Field(True, description="Whether to revoke shared encryption keys")


class UnfriendResponse(BaseModel):
    """Response for unfriend action"""
    success: bool
    message: str
    keys_revoked: bool


# ============ Helper Functions ============

def compute_key_fingerprint(public_key: str) -> str:
    """
    Compute SHA-256 fingerprint of a public key
    Returns fingerprint in format: XX:XX:XX:XX...
    """
    # Remove any whitespace and headers
    clean_key = public_key.replace("-----BEGIN PUBLIC KEY-----", "")
    clean_key = clean_key.replace("-----END PUBLIC KEY-----", "")
    clean_key = clean_key.replace("\n", "").replace("\r", "").replace(" ", "")
    
    # Compute SHA-256 hash
    hash_bytes = hashlib.sha256(clean_key.encode()).digest()
    
    # Format as colon-separated hex pairs
    fingerprint = ":".join(f"{b:02X}" for b in hash_bytes[:16])  # First 128 bits
    return fingerprint


def verify_fingerprint_match(fingerprint1: str, fingerprint2: str) -> bool:
    """
    Compare two fingerprints (case-insensitive)
    """
    return fingerprint1.upper().replace(" ", "") == fingerprint2.upper().replace(" ", "")


class RequestNonce(BaseModel):
    """Nonce for preventing replay attacks"""
    nonce: str = Field(..., min_length=32, max_length=64)
    timestamp: int
    signature: str

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

class VerificationType(str, Enum):
    IDENTITY = "identity"
    EMAIL = "email"
    PHONE = "phone"
    ORGANIZATION = "organization"
    CUSTOM = "custom"

class VerificationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"

class VerificationBadgeResponse(BaseModel):
    id: int
    user_id: int
    verification_type: VerificationType
    badge_label: Optional[str] = None
    badge_color: Optional[str] = None
    verified_at: datetime
    expires_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class VerificationRequestCreate(BaseModel):
    verification_type: VerificationType
    supporting_documents: Optional[Dict[str, str]] = None
    notes: Optional[str] = Field(None, max_length=1000)

class VerificationRequestResponse(BaseModel):
    id: int
    user_id: int
    verification_type: VerificationType
    status: VerificationStatus
    requested_at: datetime
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class VerificationRequestReview(BaseModel):
    request_id: int
    approved: bool
    rejection_reason: Optional[str] = Field(None, max_length=500)
    badge_label: Optional[str] = Field(None, max_length=100)
    badge_color: Optional[str] = Field(None, max_length=20)
    expires_at: Optional[datetime] = None

class VerificationHistoryResponse(BaseModel):
    id: int
    user_id: int
    verification_type: VerificationType
    action: str
    reason: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UserVerificationSummary(BaseModel):
    user_id: int
    is_verified: bool
    verification_level: int
    badges: List[VerificationBadgeResponse]

    model_config = ConfigDict(from_attributes=True)

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any
from datetime import date, datetime
from enum import Enum


class VisibilityLevel(str, Enum):
    EVERYONE = "everyone"
    FRIENDS = "friends"
    NOBODY = "nobody"


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=100)
    bio: Optional[str] = Field(None, max_length=500)
    birthday: Optional[date] = None
    location_city: Optional[str] = Field(None, max_length=120)
    website: Optional[str] = Field(None, max_length=512)
    social_links: Optional[Dict[str, str]] = None
    status_message: Optional[str] = Field(None, max_length=160)
    pronouns: Optional[str] = Field(None, max_length=32)
    emoji_badge: Optional[str] = Field(None, max_length=16)
    theme: Optional[Dict[str, Any]] = None
    banner_url: Optional[str] = Field(None, max_length=512)
    avatar_url: Optional[str] = Field(None, max_length=512)
    avatar_blur: Optional[str] = Field(None, max_length=64)


class ProfileResponse(ProfileUpdate):
    user_id: int
    username: str
    created_at: datetime
    updated_at: datetime
    is_blocked: bool = False
    is_friend: bool = False

    model_config = ConfigDict(from_attributes=True)


class PrivacySettingsUpdate(BaseModel):
    profile_visibility: Optional[VisibilityLevel] = None
    avatar_visibility: Optional[VisibilityLevel] = None
    field_visibility: Optional[Dict[str, VisibilityLevel]] = None
    last_seen_visibility: Optional[VisibilityLevel] = None
    online_visibility: Optional[VisibilityLevel] = None
    typing_visibility: Optional[VisibilityLevel] = None
    read_receipts_visibility: Optional[VisibilityLevel] = None
    discovery_opt_in: Optional[bool] = None
    message_request_policy: Optional[VisibilityLevel] = None


class PrivacySettingsResponse(PrivacySettingsUpdate):
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReportReason(str, Enum):
    FAKE_PROFILE = "fake_profile"
    IMPERSONATION = "impersonation"
    HARASSMENT = "harassment"
    SPAM = "spam"
    INAPPROPRIATE = "inappropriate"
    OTHER = "other"


class ProfileReportCreate(BaseModel):
    reported_username: str
    reason: ReportReason
    description: Optional[str] = Field(None, max_length=1000)


class ProfileHistoryEntry(BaseModel):
    id: int
    changed_fields: list[str] = []
    snapshot: Dict[str, Any]
    change_source: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RollbackRequest(BaseModel):
    history_id: int

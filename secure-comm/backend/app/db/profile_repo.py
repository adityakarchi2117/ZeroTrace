from typing import Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.db.database import UserProfile, PrivacySettings, VisibilityLevel, User
from app.db.friend_models import BlockedUser, TrustedContact


class ProfileRepository:
    def __init__(self, db: Session):
        self.db = db

    # ---------- Helpers ----------
    def _ensure_profile(self, user_id: int) -> UserProfile:
        profile = self.db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            profile = UserProfile(user_id=user_id)
            self.db.add(profile)
            self.db.commit()
            self.db.refresh(profile)
        return profile

    def _ensure_privacy(self, user_id: int) -> PrivacySettings:
        settings = self.db.query(PrivacySettings).filter(PrivacySettings.user_id == user_id).first()
        if not settings:
            settings = PrivacySettings(user_id=user_id)
            self.db.add(settings)
            self.db.commit()
            self.db.refresh(settings)
        return settings

    # ---------- Profile ----------
    _UPDATABLE_PROFILE_FIELDS = {
        "display_name", "bio", "birthday", "location_city", "website",
        "social_links", "status_message", "pronouns", "emoji_badge",
        "theme", "banner_url", "avatar_url", "avatar_blur", "phone",
    }

    def update_profile(self, user_id: int, data: Dict) -> UserProfile:
        profile = self._ensure_profile(user_id)
        for key, value in data.items():
            if key in self._UPDATABLE_PROFILE_FIELDS:
                setattr(profile, key, value)
        self.db.commit()
        self.db.refresh(profile)
        return profile

    def get_profile(self, requester_id: Optional[int], target_id: int):
        profile = self.db.query(UserProfile).filter(UserProfile.user_id == target_id).first()
        privacy = self._ensure_privacy(target_id)
        is_friend = False
        is_blocked = False
        is_self = requester_id is not None and requester_id == target_id

        if requester_id and not is_self:
            is_blocked = self._is_blocked(target_id, requester_id) or self._is_blocked(requester_id, target_id)
            is_friend = self._is_friend(target_id, requester_id)

        if is_blocked:
            return (None, {}, is_friend, True, privacy)

        # Apply visibility (skip for own profile — always show all fields)
        visible_profile = {}
        if profile:
            _ALL_PROFILE_FIELDS = [
                "display_name",
                "bio",
                "birthday",
                "location_city",
                "website",
                "social_links",
                "status_message",
                "pronouns",
                "emoji_badge",
                "theme",
                "banner_url",
                "avatar_url",
                "avatar_blur",
            ]
            if is_self:
                for field in _ALL_PROFILE_FIELDS:
                    visible_profile[field] = getattr(profile, field)
            else:
                field_visibility = privacy.field_visibility or {}
                for field in _ALL_PROFILE_FIELDS:
                    allowed = self._is_field_visible(field, field_visibility, privacy, is_friend, requester_id is None)
                    if allowed:
                        visible_profile[field] = getattr(profile, field)

        return (profile, visible_profile, is_friend, is_blocked, privacy)

    # ---------- Privacy ----------
    _UPDATABLE_PRIVACY_FIELDS = {
        "profile_visibility", "avatar_visibility", "field_visibility",
        "last_seen_visibility", "online_visibility", "typing_visibility",
        "read_receipts_visibility", "discovery_opt_in", "message_request_policy",
    }

    def update_privacy(self, user_id: int, data: Dict) -> PrivacySettings:
        settings = self._ensure_privacy(user_id)
        for key, value in data.items():
            if key in self._UPDATABLE_PRIVACY_FIELDS:
                setattr(settings, key, value)
        self.db.commit()
        self.db.refresh(settings)
        return settings

    # ---------- Access helpers ----------
    def _is_friend(self, target_id: int, requester_id: int) -> bool:
        rel = self.db.query(TrustedContact).filter(
            TrustedContact.user_id == target_id,
            TrustedContact.contact_user_id == requester_id,
            TrustedContact.is_removed == False
        ).first()
        rel2 = self.db.query(TrustedContact).filter(
            TrustedContact.user_id == requester_id,
            TrustedContact.contact_user_id == target_id,
            TrustedContact.is_removed == False
        ).first()
        return rel is not None and rel2 is not None

    def _is_blocked(self, user_id: int, target_id: int) -> bool:
        block = self.db.query(BlockedUser).filter(
            or_(
                (BlockedUser.user_id == user_id) & (BlockedUser.blocked_user_id == target_id),
                (BlockedUser.user_id == target_id) & (BlockedUser.blocked_user_id == user_id),
            )
        ).first()
        return block is not None

    def _is_field_visible(self, field: str, field_visibility: Dict, privacy: PrivacySettings, is_friend: bool, is_anon: bool):
        # field_visibility overrides; else fall back to profile_visibility
        lvl = field_visibility.get(field, privacy.profile_visibility.value if hasattr(privacy.profile_visibility, 'value') else privacy.profile_visibility)
        if is_anon:
            return lvl == VisibilityLevel.EVERYONE or lvl == "everyone"
        if lvl == VisibilityLevel.EVERYONE or lvl == "everyone":
            return True
        if lvl == VisibilityLevel.FRIENDS or lvl == "friends":
            return is_friend
        return False

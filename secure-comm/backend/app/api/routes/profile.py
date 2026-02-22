from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from sqlalchemy.orm import Session
from typing import Optional, List
from app.db.database import SessionLocal, VisibilityLevel, User, ProfileHistory, ProfileReport, get_db
from app.db.profile_repo import ProfileRepository
from app.db.user_repo import UserRepository
from app.models.profile import (
    ProfileUpdate, ProfileResponse, PrivacySettingsUpdate, PrivacySettingsResponse,
    ProfileReportCreate, ProfileHistoryEntry, RollbackRequest,
)
from app.core.security import get_current_user_id
from datetime import datetime, timezone
import uuid
import os
import json
import logging
import hashlib

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------- Helpers ----------

_PROFILE_FIELDS = [
    "display_name", "bio", "birthday", "location_city", "website",
    "social_links", "status_message", "pronouns", "emoji_badge",
    "theme", "banner_url", "avatar_url", "avatar_blur",
]


def _profile_to_dict(profile) -> dict:
    """Safely extract profile fields without leaking SQLAlchemy internals."""
    result = {}
    for f in _PROFILE_FIELDS:
        val = getattr(profile, f, None)
        if val is not None:
            result[f] = val
    return result


def _save_history(db: Session, user_id: int, changed_fields: list, profile, source: str = "user"):
    """Record a snapshot of the profile for history/rollback."""
    snap = _profile_to_dict(profile)
    entry = ProfileHistory(
        user_id=user_id,
        changed_fields=changed_fields,
        snapshot=snap,
        change_source=source,
    )
    db.add(entry)
    db.commit()


# ---------- Profile CRUD ----------

@router.post("/profile/update", response_model=ProfileResponse)
async def update_profile(
    payload: ProfileUpdate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    repo = ProfileRepository(db)
    user_repo = UserRepository(db)
    user = user_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    data = payload.model_dump(exclude_none=True)
    changed = list(data.keys())
    profile = repo.update_profile(user_id, data)

    # Record change history
    if changed:
        _save_history(db, user_id, changed, profile, "user")

    safe = _profile_to_dict(profile)
    return ProfileResponse(
        user_id=user_id,
        username=user.username,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
        is_blocked=False,
        is_friend=False,
        **safe,
    )


@router.get("/profile/{target_id:int}", response_model=ProfileResponse)
async def get_profile(
    target_id: int,
    user_id: Optional[int] = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    repo = ProfileRepository(db)
    user_repo = UserRepository(db)

    user = user_repo.get_by_id(target_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = repo.get_profile(user_id, target_id)
    profile, visible, is_friend, is_blocked, privacy = result

    if is_blocked:
        raise HTTPException(status_code=403, detail="You are blocked from viewing this profile")

    if not profile:
        profile = repo.update_profile(target_id, {})
        visible = _profile_to_dict(profile)

    return ProfileResponse(
        user_id=target_id,
        username=user.username,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
        is_blocked=is_blocked,
        is_friend=is_friend,
        **visible,
    )


# ---------- Privacy ----------

@router.post("/privacy/update", response_model=PrivacySettingsResponse)
async def update_privacy(
    payload: PrivacySettingsUpdate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    repo = ProfileRepository(db)
    settings = repo.update_privacy(user_id, payload.model_dump(exclude_none=True))
    return settings


@router.get("/privacy/settings", response_model=PrivacySettingsResponse)
async def get_privacy(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    repo = ProfileRepository(db)
    settings = repo._ensure_privacy(user_id)
    return settings


# ---------- Photo ----------

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB

@router.post("/profile/photo/upload")
async def upload_photo(
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    # Validate content type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, GIF, and WebP images are allowed")

    # Sanitize filename - strip path components and use a hashed name
    original_name = os.path.basename(file.filename or "upload")
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        ext = ".jpg"
    safe_filename = f"{user_id}-{hashlib.sha256(uuid.uuid4().bytes).hexdigest()[:16]}{ext}"

    upload_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "uploads", "avatars"
    )  # BUGFIX: Use absolute path based on project root, not CWD-relative
    os.makedirs(upload_dir, exist_ok=True)
    path = os.path.join(upload_dir, safe_filename)

    # Verify path stays under upload_dir
    abs_path = os.path.abspath(path)
    if not abs_path.startswith(os.path.abspath(upload_dir)):
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Stream write with size limit
    total_size = 0
    with open(path, "wb") as f:
        while True:
            chunk = await file.read(8192)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > MAX_UPLOAD_SIZE:
                f.close()
                os.remove(path)
                raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE // (1024*1024)}MB")
            f.write(chunk)

    # Store URL-safe forward-slash path
    avatar_url = f"/uploads/avatars/{safe_filename}"
    repo = ProfileRepository(db)
    profile = repo.update_profile(user_id, {"avatar_url": avatar_url})
    _save_history(db, user_id, ["avatar_url"], profile, "photo_upload")
    return {"avatar_url": profile.avatar_url}


@router.delete("/profile/photo")
async def remove_photo(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    repo = ProfileRepository(db)
    profile = repo.update_profile(user_id, {"avatar_url": None, "avatar_blur": None})
    _save_history(db, user_id, ["avatar_url", "avatar_blur"], profile, "photo_remove")
    return {"message": "Photo removed"}


# ---------- History & Rollback ----------

@router.get("/profile/history")
async def get_history(
    limit: int = 20,
    offset: int = 0,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    entries = (
        db.query(ProfileHistory)
        .filter(ProfileHistory.user_id == user_id)
        .order_by(ProfileHistory.created_at.desc())
        .offset(offset)
        .limit(min(limit, 100))
        .all()
    )
    return [
        {
            "id": e.id,
            "changed_fields": e.changed_fields or [],
            "snapshot": e.snapshot or {},
            "change_source": e.change_source,
            "created_at": e.created_at.isoformat(),
        }
        for e in entries
    ]


@router.post("/profile/rollback")
async def rollback_profile(
    payload: RollbackRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    entry = (
        db.query(ProfileHistory)
        .filter(ProfileHistory.id == payload.history_id, ProfileHistory.user_id == user_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")

    repo = ProfileRepository(db)
    snap = entry.snapshot or {}
    profile = repo.update_profile(user_id, snap)
    _save_history(db, user_id, list(snap.keys()), profile, "rollback")
    return {"message": "Profile rolled back", "restored_fields": list(snap.keys())}


# ---------- Export ----------

@router.get("/profile/export")
async def export_profile(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    repo = ProfileRepository(db)
    profile = repo._ensure_profile(user_id)
    privacy = repo._ensure_privacy(user_id)
    return {
        "profile": _profile_to_dict(profile),
        "privacy": {
            "profile_visibility": privacy.profile_visibility.value if hasattr(privacy.profile_visibility, 'value') else privacy.profile_visibility,
            "avatar_visibility": privacy.avatar_visibility.value if hasattr(privacy.avatar_visibility, 'value') else privacy.avatar_visibility,
            "field_visibility": privacy.field_visibility,
            "last_seen_visibility": privacy.last_seen_visibility.value if hasattr(privacy.last_seen_visibility, 'value') else privacy.last_seen_visibility,
            "online_visibility": privacy.online_visibility.value if hasattr(privacy.online_visibility, 'value') else privacy.online_visibility,
        },
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------- Block / Unblock ----------

@router.post("/profile/block")
async def block_user(
    target_username: str,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    from app.db.friend_repo import FriendRepository
    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    repo = FriendRepository(db)
    success, _ = repo.block_user(user_id, target.id)
    if not success:
        raise HTTPException(status_code=400, detail="Already blocked")
    return {"message": "Blocked"}


@router.post("/profile/unblock")
async def unblock_user(
    target_username: str,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    from app.db.friend_repo import FriendRepository
    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    repo = FriendRepository(db)
    success, _ = repo.unblock_user(user_id, target.id)
    if not success:
        raise HTTPException(status_code=400, detail="Not blocked")
    return {"message": "Unblocked"}


# ---------- Report ----------

@router.post("/profile/report")
async def report_user(
    payload: ProfileReportCreate = Body(...),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.username == payload.reported_username).first()
    if not target:
        raise HTTPException(status_code=404, detail="Reported user not found")

    report_id_str = uuid.uuid4().hex

    # Capture evidence snapshot of the reported user's profile
    repo = ProfileRepository(db)
    profile = repo._ensure_profile(target.id)
    snapshot = _profile_to_dict(profile)

    report = ProfileReport(
        report_id=report_id_str,
        reporter_id=user_id,
        reported_user_id=target.id,
        reason=payload.reason.value,
        description=payload.description,
        evidence_snapshot=snapshot,
    )
    db.add(report)
    db.commit()

    logger.warning(f"Report created: reporter={user_id}, reported={target.id}, reason={payload.reason.value}")
    return {
        "id": report.id,
        "report_id": report_id_str,
        "status": "pending",
        "reason": payload.reason.value,
        "created_at": report.created_at.isoformat(),
    }

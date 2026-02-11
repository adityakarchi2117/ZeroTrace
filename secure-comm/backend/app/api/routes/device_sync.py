"""
Multi-Device Sync API Routes

Endpoints:
  POST /device/pair/init        — Start pairing session (existing device)
  POST /device/pair/scan        — New device scans QR code
  POST /device/pair/approve     — Existing device approves pairing
  POST /device/pair/complete    — New device confirms DEK receipt
  GET  /device/pair/status      — Poll pairing session status
  GET  /device/list             — List authorized devices
  POST /device/revoke           — Revoke a device
  GET  /device/revocation-history — Revocation audit log
  POST /keys/wrapped            — Store per-device wrapped DEK
  GET  /keys/wrapped            — Get wrapped DEK for current device
  POST /keys/restore            — Restore key on login
  POST /keys/session/store      — Store wrapped session key
  GET  /keys/session/{conv_id}  — Get session keys for a conversation
  GET  /keys/session            — Get all session keys
  POST /keys/session/rewrap     — Batch re-wrap session keys after DEK rotation
  POST /keys/backup             — Create encrypted backup
  POST /keys/restore-backup     — Restore from backup
  POST /keys/recovery/backup    — Store password-derived DEK recovery backup
  GET  /keys/recovery/backup    — Retrieve recovery backup for DEK restoration
  GET  /keys/recovery/status    — Check if recovery backup exists
  DELETE /keys/recovery/backup  — Deactivate all recovery backups

Rate-limited, device-fingerprinted, signature-validated.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import json
import logging

from app.db.database import get_db, User
from app.db.device_sync_repo import DeviceSyncRepository
from app.db.secure_profile_repo import SecureProfileRepository
from app.core.security import get_current_user_id
from app.models.device_sync import (
    PairInitRequest, PairInitResponse,
    PairScanRequest, PairScanResponse,
    PairApproveRequest, PairApproveResponse,
    PairCompleteRequest, PairCompleteResponse,
    PairStatusResponse,
    DeviceInfoResponse, DeviceListResponse,
    DeviceRevokeRequest, DeviceRevokeResponse,
    SessionKeyStoreRequest, SessionKeyResponse,
    SessionKeyBatchRewrapRequest,
    KeyRestoreRequest, KeyRestoreResponse,
    DeviceWrappedDEKResponse,
    RevocationLogEntry,
    RecoveryBackupRequest, RecoveryBackupResponse,
    RecoveryRestoreResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== Device Pairing ====================

@router.post("/pair/init", response_model=PairInitResponse)
async def pair_init(
    payload: PairInitRequest,
    request: Request,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Step 1: Existing device initiates a pairing session.
    Returns a pairing_token to encode as QR code.
    """
    repo = DeviceSyncRepository(db)

    # Rate limit: max 5 active pairing sessions per hour
    from datetime import timedelta
    from sqlalchemy import func
    from app.db.device_sync_models import DevicePairingSession
    recent_count = (
        db.query(func.count(DevicePairingSession.id))
        .filter(
            DevicePairingSession.user_id == user_id,
            DevicePairingSession.created_at > datetime.utcnow() - timedelta(hours=1),
        )
        .scalar()
    )
    if recent_count >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many pairing attempts. Try again later.",
        )

    ip = request.client.host if request.client else None
    session = repo.create_pairing_session(
        user_id=user_id,
        initiator_device_id=payload.device_id,
        initiator_ip=ip,
        ttl_minutes=5,
    )

    # Build QR payload (JSON string the new device will parse)
    qr_data = json.dumps({
        "type": "zerotrace_pair",
        "token": session.pairing_token,
        "challenge": session.challenge,
        "user_id": user_id,
        "expires": session.expires_at.isoformat(),
    })

    logger.info(f"📱 Pairing session created for user {user_id}")
    return PairInitResponse(
        pairing_token=session.pairing_token,
        challenge=session.challenge,
        expires_at=session.expires_at,
        qr_payload=qr_data,
    )


@router.post("/pair/scan", response_model=PairScanResponse)
async def pair_scan(
    payload: PairScanRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Step 2: New device scans the QR code and registers itself.
    The new device submits its public key so the existing device
    can re-wrap the DEK for it.
    """
    repo = DeviceSyncRepository(db)

    session = repo.scan_pairing_session(
        pairing_token=payload.pairing_token,
        new_device_id=payload.device_id,
        new_device_name=payload.device_name,
        new_device_type=payload.device_type,
        new_device_public_key=payload.device_public_key,
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired pairing token.",
        )

    # Verify the session belongs to the same user
    if session.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This pairing session does not belong to your account.",
        )

    logger.info(f"📲 Device scanned pairing QR: {payload.device_id}")
    return PairScanResponse(
        status="scanned",
        challenge=session.challenge,
        device_fingerprint=session.new_device_fingerprint or "",
        message="Waiting for approval from existing device.",
    )


@router.post("/pair/approve", response_model=PairApproveResponse)
async def pair_approve(
    payload: PairApproveRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Step 3: Existing device approves the pairing.
    The existing device re-wraps the DEK for the new device's
    public key and sends it here.
    """
    repo = DeviceSyncRepository(db)

    session = repo.approve_pairing(
        pairing_token=payload.pairing_token,
        user_id=user_id,
        wrapped_dek_for_device=payload.wrapped_dek_for_device,
        dek_wrap_nonce=payload.dek_wrap_nonce,
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot approve: session not found, not scanned, or wrong user.",
        )

    logger.info(f"✅ Pairing approved for device {session.new_device_id}")
    return PairApproveResponse(
        status="approved",
        new_device_id=session.new_device_id or "",
        new_device_fingerprint=session.new_device_fingerprint or "",
        message="Pairing approved. New device can now fetch DEK.",
    )


@router.post("/pair/complete", response_model=PairCompleteResponse)
async def pair_complete(
    payload: PairCompleteRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Step 4: New device completes pairing by fetching its wrapped DEK.
    Also registers the device as authorized.
    """
    repo = DeviceSyncRepository(db)
    sp_repo = SecureProfileRepository(db)

    session = repo.get_pairing_session(payload.pairing_token)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=400, detail="Invalid pairing token.")
    if session.status != "approved":
        raise HTTPException(status_code=400, detail=f"Session is '{session.status}', not 'approved'.")
    if not session.wrapped_dek_for_device:
        raise HTTPException(status_code=400, detail="No wrapped DEK available.")

    # Mark completed
    completed = repo.complete_pairing(payload.pairing_token, user_id)
    if not completed:
        raise HTTPException(status_code=500, detail="Failed to complete pairing.")

    # Register device as authorized
    repo.authorize_device(
        user_id=user_id,
        device_id=session.new_device_id or payload.pairing_token[:32],
        device_public_key=session.new_device_public_key or "",
        device_name=session.new_device_name,
        device_type=session.new_device_type or "web",
    )

    # Store per-device wrapped DEK
    active_dek = sp_repo.get_active_dek(user_id)
    dek_version = active_dek.dek_version if active_dek else 1

    repo.store_device_wrapped_dek(
        user_id=user_id,
        device_id=session.new_device_id or payload.pairing_token[:32],
        wrapped_dek=session.wrapped_dek_for_device,
        wrap_nonce=session.dek_wrap_nonce or "",
        dek_version=dek_version,
    )

    logger.info(f"🔗 Device pairing completed: {session.new_device_id}")
    return PairCompleteResponse(
        wrapped_dek=session.wrapped_dek_for_device,
        dek_wrap_nonce=session.dek_wrap_nonce or "",
        dek_version=dek_version,
        message="Device paired successfully. DEK transferred.",
    )


@router.get("/pair/status", response_model=PairStatusResponse)
async def pair_status(
    pairing_token: str,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Poll pairing session status (for real-time UI updates)."""
    repo = DeviceSyncRepository(db)
    session = repo.get_pairing_session(pairing_token)

    if not session or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Pairing session not found.")

    # Check expiry
    if session.status == "pending" and session.expires_at < datetime.utcnow():
        session.status = "expired"
        db.commit()

    return PairStatusResponse(
        status=session.status,
        new_device_id=session.new_device_id,
        new_device_name=session.new_device_name,
        new_device_fingerprint=session.new_device_fingerprint,
        wrapped_dek_for_device=session.wrapped_dek_for_device if session.status == "approved" else None,
        dek_wrap_nonce=session.dek_wrap_nonce if session.status == "approved" else None,
    )


# ==================== Device Management ====================

@router.get("/list", response_model=DeviceListResponse)
async def list_devices(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List all authorized devices for the current user."""
    repo = DeviceSyncRepository(db)
    devices = repo.get_authorized_devices(user_id)

    return DeviceListResponse(
        devices=[
            DeviceInfoResponse(
                id=d.id,
                device_id=d.device_id,
                device_name=d.device_name,
                device_type=d.device_type,
                device_fingerprint=d.device_fingerprint,
                is_primary=d.is_primary,
                is_active=d.is_active,
                authorized_at=d.authorized_at,
                last_verified_at=d.last_verified_at,
                last_ip=d.last_ip,
            )
            for d in devices
        ],
        total=len(devices),
    )


@router.post("/revoke", response_model=DeviceRevokeResponse)
async def revoke_device(
    payload: DeviceRevokeRequest,
    request: Request,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Revoke a device. Optionally rotate DEK for extra security.

    When rotate_dek=True:
    1. Device authorization is revoked
    2. Device's wrapped DEK is invalidated
    3. A new DEK version is flagged (client must re-wrap & upload)
    """
    repo = DeviceSyncRepository(db)

    # Cannot revoke yourself if you're the only device
    all_devices = repo.get_authorized_devices(user_id)
    active_count = len(all_devices)
    if active_count <= 1:
        target = repo.get_device(user_id, payload.device_id)
        if target and target.is_active:
            raise HTTPException(
                status_code=400,
                detail="Cannot revoke your only device."
            )

    result = repo.revoke_device(
        user_id=user_id,
        device_id=payload.device_id,
        reason=payload.reason,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Device not found or already revoked.")

    new_dek_version = None
    if payload.rotate_dek:
        sp_repo = SecureProfileRepository(db)
        active_dek = sp_repo.get_active_dek(user_id)
        if active_dek:
            new_dek_version = active_dek.dek_version + 1
            # Log that rotation is needed (client will generate new wrapped DEK)
            sp_repo.log_key_rotation(
                user_id=user_id,
                rotation_type="dek_rotation_pending",
                old_dek_version=active_dek.dek_version,
                new_dek_version=new_dek_version,
                device_id=payload.revoking_device_id or None,
                ip_address=request.client.host if request.client else None,
                success=True,
            )

    ip = request.client.host if request.client else None
    repo.log_revocation(
        user_id=user_id,
        revoked_device_id=payload.device_id,
        revoked_device_name=result.device_name,
        revoked_by_device_id=payload.revoking_device_id or None,
        reason=payload.reason,
        dek_rotated=payload.rotate_dek,
        old_dek_version=None,
        new_dek_version=new_dek_version,
        ip_address=ip,
    )

    logger.info(f"🔒 Device revoked: {payload.device_id} for user {user_id}")
    return DeviceRevokeResponse(
        success=True,
        message=f"Device {payload.device_id} has been revoked.",
        dek_rotated=payload.rotate_dek,
        new_dek_version=new_dek_version,
    )


@router.get("/revocation-history", response_model=List[RevocationLogEntry])
async def revocation_history(
    limit: int = 50,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get device revocation audit log."""
    repo = DeviceSyncRepository(db)
    return repo.get_revocation_history(user_id, limit)


# ==================== Per-Device Wrapped DEK ====================

@router.post("/wrapped", response_model=DeviceWrappedDEKResponse, status_code=201)
async def store_wrapped_dek(
    device_id: str,
    wrapped_dek: str,
    wrap_nonce: str,
    dek_version: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Store a DEK wrapped for a specific device."""
    repo = DeviceSyncRepository(db)

    if not repo.is_device_authorized(user_id, device_id):
        raise HTTPException(status_code=403, detail="Device not authorized.")

    entry = repo.store_device_wrapped_dek(
        user_id=user_id,
        device_id=device_id,
        wrapped_dek=wrapped_dek,
        wrap_nonce=wrap_nonce,
        dek_version=dek_version,
    )
    return entry


@router.get("/wrapped", response_model=DeviceWrappedDEKResponse)
async def get_wrapped_dek(
    device_id: str,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get the wrapped DEK for a specific device."""
    repo = DeviceSyncRepository(db)
    entry = repo.get_device_wrapped_dek(user_id, device_id)

    if not entry:
        raise HTTPException(status_code=404, detail="No wrapped DEK for this device.")

    # Update last_used_at
    entry.last_used_at = datetime.utcnow()
    db.commit()

    return entry


# ==================== Key Restore on Login ====================

@router.post("/restore", response_model=KeyRestoreResponse)
async def restore_keys(
    payload: KeyRestoreRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    On login, a device requests its wrapped DEK.

    If the device is authorized → return its per-device wrapped DEK.
    If not authorized → fall back to user-level wrapped DEK (from identity key).
    If unwrap fails on client → client should block sync and alert user.
    """
    repo = DeviceSyncRepository(db)
    sp_repo = SecureProfileRepository(db)

    # Check device authorization
    authorized = repo.is_device_authorized(user_id, payload.device_id)

    # Try per-device wrapped DEK first
    device_dek = repo.get_device_wrapped_dek(user_id, payload.device_id)

    if device_dek:
        # Update last used
        device_dek.last_used_at = datetime.utcnow()
        db.commit()

        # Count session keys
        all_sks = repo.get_all_session_keys(user_id)
        profile = sp_repo.get_latest_encrypted_profile(user_id)

        return KeyRestoreResponse(
            wrapped_dek=device_dek.wrapped_dek,
            wrap_nonce=device_dek.wrap_nonce,
            dek_version=device_dek.dek_version,
            device_authorized=True,
            session_key_count=len(all_sks),
            profile_version=profile.version if profile else 0,
        )

    # Fall back to user-level DEK (wrapped with identity key)
    user_dek = sp_repo.get_active_dek(user_id)
    if user_dek:
        return KeyRestoreResponse(
            wrapped_dek=user_dek.wrapped_dek,
            wrap_nonce=user_dek.nonce,
            dek_version=user_dek.dek_version,
            device_authorized=authorized,
            session_key_count=0,
            profile_version=0,
        )

    raise HTTPException(
        status_code=404,
        detail="No DEK found. Set up encryption first."
    )


# ==================== Session Key Management ====================

@router.post("/session/store", response_model=SessionKeyResponse, status_code=201)
async def store_session_key(
    payload: SessionKeyStoreRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Store a session key wrapped with the DEK.

    Session keys encrypt individual chat messages.
    Wrapping them with the DEK means any device with the DEK
    can unwrap and decrypt old message history.
    """
    repo = DeviceSyncRepository(db)

    sk = repo.store_session_key(
        user_id=user_id,
        conversation_id=payload.conversation_id,
        wrapped_session_key=payload.wrapped_session_key,
        session_key_nonce=payload.session_key_nonce,
        dek_version=payload.dek_version,
        key_version=payload.key_version,
        first_message_id=payload.first_message_id,
    )

    return sk


@router.get("/session/{conversation_id}", response_model=List[SessionKeyResponse])
async def get_session_keys(
    conversation_id: str,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get all session keys for a conversation (current + rotated for history)."""
    repo = DeviceSyncRepository(db)
    return repo.get_session_keys_for_conversation(user_id, conversation_id)


@router.get("/session", response_model=List[SessionKeyResponse])
async def get_all_session_keys(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get all session keys for all conversations."""
    repo = DeviceSyncRepository(db)
    return repo.get_all_session_keys(user_id)


@router.post("/session/rewrap")
async def rewrap_session_keys(
    payload: SessionKeyBatchRewrapRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Batch re-wrap session keys after DEK rotation.

    Client-side flow:
    1. Unwrap each session key with old DEK
    2. Re-wrap with new DEK
    3. Send re-wrapped keys here

    No message re-encryption needed — only session key wrapping changes.
    """
    repo = DeviceSyncRepository(db)

    count = repo.rewrap_session_keys_for_dek(
        user_id=user_id,
        old_dek_version=payload.old_dek_version,
        new_dek_version=payload.new_dek_version,
        rewrapped_keys=payload.rewrapped_keys,
    )

    return {
        "success": True,
        "rewrapped_count": count,
        "old_dek_version": payload.old_dek_version,
        "new_dek_version": payload.new_dek_version,
    }


# ==================== Register Device on First Login ====================

@router.post("/register", response_model=DeviceInfoResponse, status_code=201)
async def register_device(
    device_id: str,
    device_name: str = "Web Browser",
    device_type: str = "web",
    device_public_key: str = "",
    request: Request = None,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Register the current device on first login.
    This is for the PRIMARY device (no pairing needed).
    Subsequent devices must go through the pairing flow.
    """
    repo = DeviceSyncRepository(db)

    # Check if user already has authorized devices
    existing = repo.get_authorized_devices(user_id)
    is_primary = len(existing) == 0

    ip = request.client.host if request and request.client else None

    auth = repo.authorize_device(
        user_id=user_id,
        device_id=device_id,
        device_public_key=device_public_key or device_id,
        device_name=device_name,
        device_type=device_type,
        is_primary=is_primary,
        ip_address=ip,
    )

    logger.info(f"📱 Device registered: {device_id} (primary={is_primary})")
    return auth


# ==================== Recovery Key Backup ====================

@router.post("/keys/recovery/backup", response_model=RecoveryBackupResponse, status_code=201)
async def create_recovery_backup(
    payload: RecoveryBackupRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Store a password-derived recovery backup for the DEK.

    The client derives a key from the user's password using PBKDF2 or Argon2,
    encrypts the DEK with that key, then uploads the ciphertext + KDF params.
    The server never sees the raw password or derived key.
    """
    repo = DeviceSyncRepository(db)

    backup = repo.store_recovery_backup(
        user_id=user_id,
        encrypted_dek=payload.encrypted_dek,
        encryption_nonce=payload.encryption_nonce,
        encryption_algorithm=payload.encryption_algorithm,
        kdf_salt=payload.kdf_salt,
        kdf_algorithm=payload.kdf_algorithm,
        kdf_iterations=payload.kdf_iterations,
        kdf_memory=payload.kdf_memory,
        kdf_parallelism=payload.kdf_parallelism,
        dek_version=payload.dek_version,
    )

    logger.info(f"🔑 Recovery backup created for user {user_id}, DEK v{payload.dek_version}")
    return backup


@router.get("/keys/recovery/backup", response_model=RecoveryRestoreResponse)
async def get_recovery_backup(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Retrieve the encrypted DEK + KDF params for password-based recovery.

    The client uses the returned KDF params to re-derive the same key
    from the user's password, then decrypts the DEK locally.
    """
    repo = DeviceSyncRepository(db)
    backup = repo.get_active_recovery_backup(user_id)

    if not backup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active recovery backup found. Create one first.",
        )

    # Mark as used for audit trail
    repo.mark_recovery_used(user_id)

    logger.info(f"🔑 Recovery backup retrieved for user {user_id}")
    return backup


@router.get("/keys/recovery/status")
async def check_recovery_status(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Check whether the user has an active recovery backup."""
    repo = DeviceSyncRepository(db)
    has_backup = repo.has_recovery_backup(user_id)
    return {"has_recovery_backup": has_backup}


@router.delete("/keys/recovery/backup")
async def delete_recovery_backup(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Deactivate all recovery backups.
    Should be called when the user changes their password.
    """
    repo = DeviceSyncRepository(db)
    count = repo.deactivate_recovery_backups(user_id)
    logger.info(f"🔑 Deactivated {count} recovery backups for user {user_id}")
    return {"deactivated_count": count}

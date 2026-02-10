"""
Secure Profile API Routes

Endpoints for:
  - DEK management (store, retrieve, rotate)
  - Encrypted profile CRUD (store, retrieve, version history)
  - Encrypted profile picture upload/download
  - Encrypted message metadata CRUD
  - Key rotation (full identity + DEK re-wrap)
  - Encrypted backup & restore
  - Multi-device sync
  - Key hierarchy info

All endpoints work with encrypted blobs only — the server NEVER sees plaintext.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import os
import hashlib
import uuid
import logging

from app.db.database import SessionLocal, User, OneTimePreKey, get_db
from app.db.secure_profile_repo import SecureProfileRepository
from app.core.security import get_current_user_id
from app.core.crypto import CryptoUtils
from app.models.secure_profile import (
    DEKCreate, DEKResponse, DEKRotateRequest,
    KeyRotationRequest, KeyRotationResponse,
    EncryptedProfileCreate, EncryptedProfileResponse,
    EncryptedProfilePictureCreate, EncryptedProfilePictureResponse,
    EncryptedMessageMetadataCreate, EncryptedMessageMetadataResponse,
    BackupCreateRequest, BackupResponse, BackupRestoreRequest, BackupRestoreResponse,
    ProfileVersionInfo, ProfileVersionListResponse,
    DeviceSyncRequest, DeviceSyncResponse,
    KeyInfoResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== DEK Management ====================

@router.post("/dek/store", response_model=DEKResponse, status_code=status.HTTP_201_CREATED)
async def store_dek(
    payload: DEKCreate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Store a wrapped Data Encryption Key (DEK).
    
    The DEK is generated client-side, wrapped (encrypted) with the user's
    identity key, and sent here as ciphertext. The server never sees the
    plaintext DEK.
    """
    repo = SecureProfileRepository(db)
    
    # Check if user already has an active DEK
    existing = repo.get_active_dek(user_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Active DEK already exists. Use /dek/rotate to update."
        )
    
    dek = repo.store_dek(
        user_id=user_id,
        wrapped_dek=payload.wrapped_dek,
        nonce=payload.nonce,
        dek_algorithm=payload.dek_algorithm,
        dek_version=payload.dek_version,
    )
    
    # Log creation
    repo.log_key_rotation(
        user_id=user_id,
        rotation_type="dek_created",
        new_dek_version=dek.dek_version,
        success=True,
    )
    
    logger.info(f"🔑 DEK created for user {user_id}, version {dek.dek_version}")
    return dek


@router.get("/dek/active", response_model=DEKResponse)
async def get_active_dek(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get the currently active wrapped DEK for decryption."""
    repo = SecureProfileRepository(db)
    dek = repo.get_active_dek(user_id)
    
    if not dek:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active DEK found. Generate and store one first."
        )
    
    return dek


@router.get("/dek/version/{version}", response_model=DEKResponse)
async def get_dek_version(
    version: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get a specific DEK version (for decrypting data encrypted with an older DEK)."""
    repo = SecureProfileRepository(db)
    dek = repo.get_dek_by_version(user_id, version)
    
    if not dek:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"DEK version {version} not found."
        )
    
    return dek


@router.get("/dek/all", response_model=List[DEKResponse])
async def get_all_deks(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get all DEK versions for this user."""
    repo = SecureProfileRepository(db)
    return repo.get_all_deks(user_id)


# ==================== Key Rotation ====================

@router.post("/keys/rotate", response_model=KeyRotationResponse)
async def rotate_keys(
    payload: KeyRotationRequest,
    request: Request,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Full key rotation: new identity key + re-wrapped DEK.
    
    Flow:
    1. Client generates new identity key pair
    2. Client unwraps DEK with old identity key
    3. Client re-wraps DEK with new identity key
    4. Client sends new public keys + re-wrapped DEK here
    5. Server updates keys and stores new wrapped DEK
    6. All encrypted data remains accessible (DEK itself unchanged)
    
    Result: NO re-encryption of profile data needed.
    """
    repo = SecureProfileRepository(db)
    
    # Get user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get current DEK
    current_dek = repo.get_active_dek(user_id)
    if not current_dek:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active DEK to rotate. Store a DEK first."
        )
    
    if current_dek.dek_version != payload.dek_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"DEK version mismatch: server has v{current_dek.dek_version}, client sent v{payload.dek_version}"
        )
    
    old_fingerprint = CryptoUtils.hash_public_key(user.identity_key) if user.identity_key else None
    new_fingerprint = CryptoUtils.hash_public_key(payload.new_identity_key)
    
    try:
        # 1. Update user's cryptographic keys
        user.identity_key = payload.new_identity_key
        user.public_key = payload.new_public_key
        user.signed_prekey = payload.new_signed_prekey
        user.signed_prekey_signature = payload.new_signed_prekey_signature
        user.signed_prekey_timestamp = datetime.utcnow()
        
        # 2. Store new one-time pre-keys if provided
        if payload.new_one_time_prekeys:
            # Delete old unused pre-keys
            db.query(OneTimePreKey).filter(
                OneTimePreKey.user_id == user_id,
                OneTimePreKey.is_used == False,
            ).delete()
            
            for idx, otpk in enumerate(payload.new_one_time_prekeys):
                prekey = OneTimePreKey(
                    user_id=user_id,
                    key_id=idx,
                    public_key=otpk,
                )
                db.add(prekey)
        
        # 3. Rotate DEK wrapping (DEK itself unchanged, just re-wrapped)
        new_dek = repo.rotate_dek(
            user_id=user_id,
            new_wrapped_dek=payload.rewrapped_dek,
            new_nonce=payload.rewrapped_dek_nonce,
            old_dek_version=payload.dek_version,
        )
        
        db.commit()
        
        # 4. Log rotation
        client_ip = request.client.host if request.client else None
        repo.log_key_rotation(
            user_id=user_id,
            rotation_type="full",
            old_key_fingerprint=old_fingerprint,
            new_key_fingerprint=new_fingerprint,
            old_dek_version=payload.dek_version,
            new_dek_version=new_dek.dek_version,
            ip_address=client_ip,
            success=True,
        )
        
        total_rotations = repo.count_rotations(user_id)
        
        logger.info(f"🔄 Key rotation complete for user {user_id}: DEK v{payload.dek_version} → v{new_dek.dek_version}")
        
        return KeyRotationResponse(
            success=True,
            message="Key rotation successful. All encrypted data remains accessible.",
            new_dek_version=new_dek.dek_version,
            key_version=total_rotations,
            rotated_at=datetime.utcnow(),
        )
    
    except Exception as e:
        db.rollback()
        
        # Log failure
        repo.log_key_rotation(
            user_id=user_id,
            rotation_type="full",
            old_key_fingerprint=old_fingerprint,
            new_key_fingerprint=new_fingerprint,
            old_dek_version=payload.dek_version,
            success=False,
            error_message=str(e),
        )
        
        logger.error(f"❌ Key rotation failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Key rotation failed: {str(e)}"
        )


# ==================== Encrypted Profile ====================

@router.post("/profile/secure/update", response_model=EncryptedProfileResponse, status_code=status.HTTP_201_CREATED)
async def update_secure_profile(
    payload: EncryptedProfileCreate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Store an encrypted profile blob.
    
    The client encrypts all profile data (display_name, bio, etc.) with the DEK
    and sends the ciphertext here. Version is auto-incremented.
    """
    repo = SecureProfileRepository(db)
    
    # Verify DEK version exists
    dek = repo.get_dek_by_version(user_id, payload.dek_version)
    if not dek:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"DEK version {payload.dek_version} not found."
        )
    
    profile = repo.store_encrypted_profile(
        user_id=user_id,
        encrypted_blob=payload.encrypted_blob,
        blob_nonce=payload.blob_nonce,
        dek_version=payload.dek_version,
        content_hash=payload.content_hash,
    )
    
    logger.info(f"📝 Secure profile updated for user {user_id}, version {profile.version}")
    return profile


@router.get("/profile/secure", response_model=EncryptedProfileResponse)
async def get_secure_profile(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get the latest encrypted profile blob.
    
    Returns the encrypted profile + the DEK version used to encrypt it.
    Client fetches the corresponding DEK, unwraps it, and decrypts the profile.
    """
    repo = SecureProfileRepository(db)
    profile = repo.get_latest_encrypted_profile(user_id)
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No encrypted profile found."
        )
    
    return profile


@router.get("/profile/secure/version/{version}", response_model=EncryptedProfileResponse)
async def get_secure_profile_version(
    version: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get a specific profile version (for rollback/audit)."""
    repo = SecureProfileRepository(db)
    profile = repo.get_encrypted_profile_version(user_id, version)
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile version {version} not found."
        )
    
    return profile


@router.get("/profile/versions", response_model=ProfileVersionListResponse)
async def get_profile_versions(
    limit: int = 20,
    offset: int = 0,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get paginated list of profile versions for audit/rollback."""
    repo = SecureProfileRepository(db)
    versions, total = repo.get_profile_versions(user_id, limit, offset)
    
    current = repo.get_latest_encrypted_profile(user_id)
    current_version = current.version if current else 0
    
    return ProfileVersionListResponse(
        versions=[
            ProfileVersionInfo(
                version=v.version,
                dek_version=v.dek_version,
                content_hash=v.content_hash,
                created_at=v.created_at,
                updated_at=v.updated_at,
            )
            for v in versions
        ],
        current_version=current_version,
        total_versions=total,
    )


@router.post("/profile/restore", response_model=EncryptedProfileResponse)
async def restore_profile_version(
    version: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Restore a previous profile version.
    
    Creates a new version with the same encrypted data as the target version.
    """
    repo = SecureProfileRepository(db)
    old_profile = repo.get_encrypted_profile_version(user_id, version)
    
    if not old_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile version {version} not found."
        )
    
    # Create a new version with the same data
    restored = repo.store_encrypted_profile(
        user_id=user_id,
        encrypted_blob=old_profile.encrypted_blob,
        blob_nonce=old_profile.blob_nonce,
        dek_version=old_profile.dek_version,
        content_hash=old_profile.content_hash,
    )
    
    logger.info(f"🔙 Profile restored from v{version} to v{restored.version} for user {user_id}")
    return restored


# ==================== Encrypted Profile Picture ====================

@router.post("/profile/secure/photo", response_model=EncryptedProfilePictureResponse, status_code=status.HTTP_201_CREATED)
async def upload_encrypted_photo(
    payload: EncryptedProfilePictureCreate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Store an encrypted profile picture.
    
    The client encrypts the image with the DEK and sends the ciphertext.
    Stored as an encrypted file on disk, referenced in the database.
    """
    repo = SecureProfileRepository(db)
    
    # Store encrypted file to disk
    upload_dir = os.path.join("uploads", "encrypted_avatars")
    os.makedirs(upload_dir, exist_ok=True)
    
    file_name = f"{user_id}-{hashlib.sha256(uuid.uuid4().bytes).hexdigest()[:16]}.enc"
    file_path = os.path.join(upload_dir, file_name)
    
    # Verify path safety
    abs_path = os.path.abspath(file_path)
    if not abs_path.startswith(os.path.abspath(upload_dir)):
        raise HTTPException(status_code=400, detail="Invalid path")
    
    # Write encrypted data to file
    import base64
    try:
        encrypted_bytes = base64.b64decode(payload.encrypted_file)
        with open(file_path, "wb") as f:
            f.write(encrypted_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid encrypted file data: {e}")
    
    pic = repo.store_encrypted_picture(
        user_id=user_id,
        encrypted_file_path=f"/uploads/encrypted_avatars/{file_name}",
        file_nonce=payload.file_nonce,
        dek_version=payload.dek_version,
        content_hash=payload.content_hash,
        mime_type=payload.mime_type,
        file_size=payload.file_size,
    )
    
    logger.info(f"📸 Encrypted profile picture stored for user {user_id}, version {pic.version}")
    return EncryptedProfilePictureResponse(
        id=pic.id,
        user_id=user_id,
        file_nonce=pic.file_nonce,
        dek_version=pic.dek_version,
        content_hash=pic.content_hash,
        mime_type=pic.mime_type,
        file_size=pic.file_size,
        version=pic.version,
        created_at=pic.created_at,
    )


@router.get("/profile/secure/photo", response_model=EncryptedProfilePictureResponse)
async def get_encrypted_photo(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get latest encrypted profile picture metadata."""
    repo = SecureProfileRepository(db)
    pic = repo.get_latest_encrypted_picture(user_id)
    
    if not pic:
        raise HTTPException(status_code=404, detail="No encrypted profile picture found.")
    
    return EncryptedProfilePictureResponse(
        id=pic.id,
        user_id=user_id,
        file_nonce=pic.file_nonce,
        dek_version=pic.dek_version,
        content_hash=pic.content_hash,
        mime_type=pic.mime_type,
        file_size=pic.file_size,
        version=pic.version,
        created_at=pic.created_at,
    )


@router.get("/profile/secure/photo/download")
async def download_encrypted_photo(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Download the encrypted profile picture file."""
    from fastapi.responses import FileResponse
    
    repo = SecureProfileRepository(db)
    pic = repo.get_latest_encrypted_picture(user_id)
    
    if not pic:
        raise HTTPException(status_code=404, detail="No encrypted profile picture found.")
    
    # Resolve file path
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(base_dir, pic.encrypted_file_path.lstrip("/"))
    
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Encrypted file not found on disk.")
    
    return FileResponse(
        file_path,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="avatar.enc"',
            "X-Content-Type-Options": "nosniff",
        },
    )


# ==================== Encrypted Message Metadata ====================

@router.post("/metadata/secure/update", response_model=EncryptedMessageMetadataResponse, status_code=status.HTTP_201_CREATED)
async def update_secure_metadata(
    payload: EncryptedMessageMetadataCreate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Store encrypted message metadata (chat names, nicknames, pinned chats, preferences)."""
    repo = SecureProfileRepository(db)
    
    meta = repo.store_encrypted_metadata(
        user_id=user_id,
        encrypted_blob=payload.encrypted_blob,
        blob_nonce=payload.blob_nonce,
        dek_version=payload.dek_version,
        metadata_type=payload.metadata_type,
    )
    
    return meta


@router.get("/metadata/secure/{metadata_type}", response_model=EncryptedMessageMetadataResponse)
async def get_secure_metadata(
    metadata_type: str,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get latest encrypted metadata of a given type."""
    repo = SecureProfileRepository(db)
    meta = repo.get_latest_metadata(user_id, metadata_type)
    
    if not meta:
        raise HTTPException(status_code=404, detail=f"No metadata of type '{metadata_type}' found.")
    
    return meta


@router.get("/metadata/secure", response_model=List[EncryptedMessageMetadataResponse])
async def get_all_secure_metadata(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get all types of encrypted metadata (latest version of each)."""
    repo = SecureProfileRepository(db)
    return repo.get_all_metadata(user_id)


# ==================== Backup & Recovery ====================

@router.post("/backup/create", response_model=BackupResponse, status_code=status.HTTP_201_CREATED)
async def create_backup(
    payload: BackupCreateRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Create an encrypted backup.
    
    Contains wrapped DEK + encrypted profile + encrypted metadata.
    User controls export/import. Server stores only ciphertext.
    """
    repo = SecureProfileRepository(db)
    
    backup = repo.store_backup(
        user_id=user_id,
        encrypted_backup=payload.encrypted_backup,
        backup_nonce=payload.backup_nonce,
        wrapped_dek=payload.wrapped_dek,
        dek_wrap_nonce=payload.dek_wrap_nonce,
        backup_key_hash=payload.backup_key_hash,
        profile_version=payload.profile_version,
        metadata_versions=payload.metadata_versions,
    )
    
    logger.info(f"💾 Backup created for user {user_id}: {backup.backup_id}")
    return BackupResponse(
        backup_id=backup.backup_id,
        created_at=backup.created_at,
        profile_version=backup.profile_version,
        file_size=backup.file_size,
    )


@router.get("/backup/list", response_model=List[BackupResponse])
async def list_backups(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List all encrypted backups."""
    repo = SecureProfileRepository(db)
    backups = repo.list_backups(user_id)
    return [
        BackupResponse(
            backup_id=b.backup_id,
            created_at=b.created_at,
            profile_version=b.profile_version,
            file_size=b.file_size,
        )
        for b in backups
    ]


@router.post("/backup/restore", response_model=BackupRestoreResponse)
async def restore_backup(
    payload: BackupRestoreRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Restore from an encrypted backup.
    
    Verifies backup password hash, returns encrypted backup data
    for client-side decryption.
    """
    repo = SecureProfileRepository(db)
    backup = repo.get_backup(user_id, payload.backup_id)
    
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found.")
    
    # Verify backup key hash
    if backup.backup_key_hash != payload.backup_key_hash:
        raise HTTPException(status_code=403, detail="Invalid backup password.")
    
    return BackupRestoreResponse(
        encrypted_backup=backup.encrypted_backup,
        backup_nonce=backup.backup_nonce,
        wrapped_dek=backup.wrapped_dek,
        dek_wrap_nonce=backup.dek_wrap_nonce,
        profile_version=backup.profile_version,
        metadata_versions=backup.metadata_versions or {},
        created_at=backup.created_at,
    )


@router.delete("/backup/{backup_id}")
async def delete_backup(
    backup_id: str,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Delete a backup."""
    repo = SecureProfileRepository(db)
    deleted = repo.delete_backup(user_id, backup_id)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Backup not found.")
    
    return {"message": "Backup deleted."}


# ==================== Key Info ====================

@router.get("/keys/info", response_model=KeyInfoResponse)
async def get_key_info(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get current key hierarchy status.
    
    Shows identity key fingerprint, DEK version, profile version,
    and rotation history summary.
    """
    repo = SecureProfileRepository(db)
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    
    dek = repo.get_active_dek(user_id)
    profile = repo.get_latest_encrypted_profile(user_id)
    total_rotations = repo.count_rotations(user_id)
    last_rotation = repo.get_last_rotation(user_id)
    
    identity_fp = CryptoUtils.hash_public_key(user.identity_key) if user.identity_key else "not_set"
    
    return KeyInfoResponse(
        identity_key_fingerprint=identity_fp,
        dek_version=dek.dek_version if dek else 0,
        dek_algorithm=dek.dek_algorithm if dek else "none",
        dek_created_at=dek.created_at if dek else datetime.utcnow(),
        dek_last_rotated=dek.rotated_at if dek else None,
        profile_version=profile.version if profile else 0,
        total_key_rotations=total_rotations,
        last_rotation_at=last_rotation.created_at if last_rotation else None,
    )


# ==================== Key Rotation History ====================

@router.get("/keys/rotation-history")
async def get_rotation_history(
    limit: int = 50,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get key rotation audit log."""
    repo = SecureProfileRepository(db)
    history = repo.get_rotation_history(user_id, limit)
    
    return [
        {
            "id": h.id,
            "rotation_type": h.rotation_type,
            "old_key_fingerprint": h.old_key_fingerprint,
            "new_key_fingerprint": h.new_key_fingerprint,
            "old_dek_version": h.old_dek_version,
            "new_dek_version": h.new_dek_version,
            "success": h.success,
            "error_message": h.error_message,
            "created_at": h.created_at.isoformat(),
        }
        for h in history
    ]


# ==================== Multi-Device Sync ====================

@router.post("/sync/device", response_model=DeviceSyncResponse)
async def sync_to_device(
    payload: DeviceSyncRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Sync encrypted data to a new device.
    
    Returns wrapped DEK + encrypted profile + encrypted metadata
    for the new device to restore from. The client on the existing
    device must re-wrap the DEK for the new device's public key
    before calling this endpoint.
    
    Note: The actual DEK re-wrapping for the new device happens client-side.
    This endpoint returns the current encrypted data that the new device
    needs, along with the server-stored wrapped DEK.
    """
    repo = SecureProfileRepository(db)
    
    dek = repo.get_active_dek(user_id)
    if not dek:
        raise HTTPException(status_code=404, detail="No DEK found for sync.")
    
    profile = repo.get_latest_encrypted_profile(user_id)
    metadata = repo.get_all_metadata(user_id)
    
    profile_resp = None
    if profile:
        profile_resp = EncryptedProfileResponse(
            id=profile.id,
            user_id=user_id,
            encrypted_blob=profile.encrypted_blob,
            blob_nonce=profile.blob_nonce,
            dek_version=profile.dek_version,
            content_hash=profile.content_hash,
            version=profile.version,
            created_at=profile.created_at,
            updated_at=profile.updated_at,
        )
    
    metadata_resp = [
        EncryptedMessageMetadataResponse(
            id=m.id,
            user_id=user_id,
            encrypted_blob=m.encrypted_blob,
            blob_nonce=m.blob_nonce,
            dek_version=m.dek_version,
            metadata_type=m.metadata_type,
            version=m.version,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        for m in metadata
    ]
    
    return DeviceSyncResponse(
        wrapped_dek_for_device=dek.wrapped_dek,
        dek_wrap_nonce=dek.nonce,
        encrypted_profile=profile_resp,
        encrypted_metadata=metadata_resp,
        dek_version=dek.dek_version,
        profile_version=profile.version if profile else 0,
    )

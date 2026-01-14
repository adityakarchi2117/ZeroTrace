"""
CipherLink Key Management API Routes
Handles public key storage, key bundles, and pre-key management
for Signal Protocol-style end-to-end encryption
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db, User, OneTimePreKey
from app.services.key_service import KeyService
from app.api.routes.auth import oauth2_scheme
from app.core.security import decode_access_token
from app.core.crypto import KeyValidation, key_operation_limiter
from app.models.user import (
    PublicKeyUpload,
    PreKeyRefill,
    KeyBundle,
    KeyBundleRequest,
)
from pydantic import BaseModel

router = APIRouter()


class PublicKeyResponse(BaseModel):
    user_id: int
    username: str
    public_key: str
    identity_key: str = None


class KeyBundleResponse(BaseModel):
    user_id: int
    username: str
    identity_key: str
    signed_prekey: str
    signed_prekey_signature: str
    one_time_prekey: str = None


class PreKeyCountResponse(BaseModel):
    count: int
    low_threshold: int = 10
    needs_refill: bool


def get_current_user_id(token: str = Depends(oauth2_scheme)) -> int:
    """Extract user ID from token"""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    return payload.get("user_id")


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_keys(
    key_data: PublicKeyUpload,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Upload user's cryptographic keys.
    
    Includes:
    - Public key (for legacy RSA encryption)
    - Identity key (Ed25519 for signing)
    - Signed pre-key (X25519 for key agreement)
    - One-time pre-keys (X25519 for PFS)
    """
    # Rate limiting
    if not key_operation_limiter.check_rate_limit(f"key_upload:{user_id}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many key upload attempts"
        )
    
    # Validate key bundle
    is_valid, error = KeyValidation.validate_key_bundle(
        key_data.identity_key,
        key_data.signed_prekey,
        key_data.signed_prekey_signature,
        key_data.one_time_prekeys
    )
    
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid key bundle: {error}"
        )
    
    # Update user's keys
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.public_key = key_data.public_key
    user.identity_key = key_data.identity_key
    user.signed_prekey = key_data.signed_prekey
    user.signed_prekey_signature = key_data.signed_prekey_signature
    
    # Store one-time pre-keys
    for idx, otpk in enumerate(key_data.one_time_prekeys):
        prekey = OneTimePreKey(
            user_id=user_id,
            key_id=idx,
            public_key=otpk
        )
        db.add(prekey)
    
    db.commit()
    
    return {"message": "Keys uploaded successfully", "prekey_count": len(key_data.one_time_prekeys)}


@router.post("/prekeys/refill", status_code=status.HTTP_201_CREATED)
async def refill_prekeys(
    prekey_data: PreKeyRefill,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Refill one-time pre-keys when running low.
    Called when client detects low pre-key count.
    """
    # Validate pre-keys
    for otpk in prekey_data.one_time_prekeys:
        if not KeyValidation.validate_x25519_public_key(otpk):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid pre-key format"
            )
    
    # Get max existing key_id
    max_key_id = db.query(OneTimePreKey.key_id)\
        .filter(OneTimePreKey.user_id == user_id)\
        .order_by(OneTimePreKey.key_id.desc())\
        .first()
    
    start_id = (max_key_id[0] + 1) if max_key_id else 0
    
    # Add new pre-keys
    for idx, otpk in enumerate(prekey_data.one_time_prekeys):
        prekey = OneTimePreKey(
            user_id=user_id,
            key_id=start_id + idx,
            public_key=otpk
        )
        db.add(prekey)
    
    db.commit()
    
    return {"message": "Pre-keys added", "count": len(prekey_data.one_time_prekeys)}


@router.get("/prekeys/count", response_model=PreKeyCountResponse)
async def get_prekey_count(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get count of available one-time pre-keys"""
    count = db.query(OneTimePreKey)\
        .filter(
            OneTimePreKey.user_id == user_id,
            OneTimePreKey.is_used == False
        ).count()
    
    return PreKeyCountResponse(
        count=count,
        low_threshold=10,
        needs_refill=(count < 10)
    )


@router.get("/bundle/{username}", response_model=KeyBundleResponse)
async def get_key_bundle(
    username: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Get key bundle for initiating encrypted session with a user.
    
    Returns:
    - Identity key (for verification)
    - Signed pre-key (for X3DH)
    - One-time pre-key (consumed on use, for PFS)
    
    This implements the X3DH (Extended Triple Diffie-Hellman) key exchange.
    """
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    requester_id = payload.get("user_id")
    
    # Get target user
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{username}' not found"
        )
    
    if not user.identity_key or not user.signed_prekey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{username}' has not uploaded keys"
        )
    
    # Get and consume one-time pre-key
    one_time_prekey = db.query(OneTimePreKey)\
        .filter(
            OneTimePreKey.user_id == user.id,
            OneTimePreKey.is_used == False
        )\
        .first()
    
    otpk_value = None
    if one_time_prekey:
        otpk_value = one_time_prekey.public_key
        one_time_prekey.is_used = True
        from datetime import datetime
        one_time_prekey.used_at = datetime.utcnow()
        db.commit()
    
    return KeyBundleResponse(
        user_id=user.id,
        username=user.username,
        identity_key=user.identity_key,
        signed_prekey=user.signed_prekey,
        signed_prekey_signature=user.signed_prekey_signature,
        one_time_prekey=otpk_value
    )


@router.get("/{username}", response_model=PublicKeyResponse)
async def get_user_public_key(
    username: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Get public key for a specific user (legacy endpoint)"""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    key_service = KeyService(db)
    result = key_service.get_public_key(username)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Public key not found for user: {username}"
        )
    
    return result

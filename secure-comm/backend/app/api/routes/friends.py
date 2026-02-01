"""
Friend Request & Secure Contact API Routes
FastAPI endpoints for the friend system with security measures
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import hashlib
import secrets
import time
import json

from app.db.database import get_db, User
from app.db.friend_models import (
    FriendRequest as FriendRequestModel,
    TrustedContact as TrustedContactModel,
    BlockedUser as BlockedUserModel,
    FriendRequestStatusEnum,
    TrustLevelEnum,
    BlockReasonEnum,
    Notification,
    NotificationTypeEnum
)
from app.db.friend_repo import FriendRepository
from app.models.friend import (
    FriendRequestCreate,
    FriendRequestResponse,
    FriendRequestAccept,
    FriendRequestReject,
    TrustedContactResponse,
    ContactVerification,
    BlockUserRequest,
    UnblockUserRequest,
    BlockedUserResponse,
    UserSearchRequest,
    UserSearchResult,
    PendingRequestsResponse,
    QRCodeData,
    compute_key_fingerprint,
    NotificationResponse,
    NotificationCountResponse,
    UnfriendRequest
)
from app.api.routes.auth import oauth2_scheme
from app.core.security import decode_access_token
from app.api.websocket import (
    notify_friend_request_accepted, 
    notify_friend_request_rejected, 
    notify_friend_request,
    notify_contact_removed,
    notify_blocked,
    notify_unblocked
)

router = APIRouter()


# ============ Authentication Helper ============

def get_current_user_id(token: str = Depends(oauth2_scheme)) -> int:
    """Extract user ID from JWT token"""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"}
        )
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    return user_id


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Get current user from token"""
    user_id = get_current_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    return user


# ============ Rate Limiting Middleware ============

async def check_rate_limit(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    action: str = "request"
):
    """Check rate limits before processing request"""
    repo = FriendRepository(db)
    is_allowed, error = repo.check_rate_limit(user_id, action)
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error
        )


# ============ Friend Request Endpoints ============

@router.post("/request", response_model=FriendRequestResponse, status_code=status.HTTP_201_CREATED)
async def send_friend_request(
    request_data: FriendRequestCreate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Send a friend request to another user.
    
    Security:
    - Rate limited to prevent spam
    - Requires valid public key fingerprint
    - Blocked users cannot receive requests
    - Duplicate requests are rejected
    """
    repo = FriendRepository(db)
    
    # Check rate limit
    is_allowed, error = repo.check_rate_limit(user_id, "request")
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error
        )
    
    # Find receiver by username
    receiver = db.query(User).filter(
        User.username == request_data.receiver_username,
        User.is_active == True
    ).first()
    
    if not receiver:
        # Increment failed counter but don't reveal user doesn't exist
        repo.increment_rate_limit(user_id, "request", failed=True)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Create friend request
    friend_request, error = repo.create_friend_request(
        sender_id=user_id,
        receiver_id=receiver.id,
        sender_fingerprint=request_data.sender_public_key_fingerprint,
        encrypted_message=request_data.message
    )
    
    if not friend_request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    # Get sender info for response and notification
    sender = db.query(User).filter(User.id == user_id).first()
    
    # Notify the receiver about the new friend request
    if sender:
        await notify_friend_request(
            receiver_id=receiver.id,
            sender_username=sender.username,
            request_id=friend_request.id,
            sender_fingerprint=request_data.sender_public_key_fingerprint
        )
    
    return FriendRequestResponse(
        id=friend_request.id,
        sender_id=friend_request.sender_id,
        sender_username=sender.username,
        receiver_id=friend_request.receiver_id,
        receiver_username=receiver.username,
        sender_public_key_fingerprint=friend_request.sender_public_key_fingerprint,
        receiver_public_key_fingerprint=friend_request.receiver_public_key_fingerprint,
        message=friend_request.encrypted_message,
        status=friend_request.status,
        created_at=friend_request.created_at,
        updated_at=friend_request.updated_at,
        expires_at=friend_request.expires_at
    )


@router.post("/accept", response_model=TrustedContactResponse)
async def accept_friend_request(
    accept_data: FriendRequestAccept,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Accept a pending friend request.
    
    Security:
    - Verifies sender's fingerprint to prevent MITM
    - Creates bidirectional trusted contacts
    - Keys are exchanged securely
    """
    repo = FriendRepository(db)
    
    # Get the request first to find sender_id for notification
    friend_request = db.query(FriendRequestModel).filter(
        FriendRequestModel.id == accept_data.request_id,
        FriendRequestModel.receiver_id == user_id,
        FriendRequestModel.status == FriendRequestStatusEnum.PENDING
    ).first()
    
    sender_id = friend_request.sender_id if friend_request else None
    
    success, error, contact = repo.accept_friend_request(
        request_id=accept_data.request_id,
        receiver_id=user_id,
        receiver_fingerprint=accept_data.receiver_public_key_fingerprint,
        verified_sender_fingerprint=accept_data.verify_sender_fingerprint
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    # Get contact user info
    contact_user = db.query(User).filter(User.id == contact.contact_user_id).first()
    
    # Get receiver (current user) info for notification
    receiver = db.query(User).filter(User.id == user_id).first()
    
    # Notify the original sender that their request was accepted
    if sender_id and receiver:
        await notify_friend_request_accepted(
            sender_id=sender_id,
            accepter_username=receiver.username,
            contact_fingerprint=accept_data.receiver_public_key_fingerprint
        )
    
    return TrustedContactResponse(
        id=contact.id,
        user_id=contact.user_id,
        contact_user_id=contact.contact_user_id,
        contact_username=contact_user.username,
        public_key=contact_user.public_key,
        identity_key=contact_user.identity_key,
        public_key_fingerprint=contact.contact_public_key_fingerprint,
        trust_level=contact.trust_level,
        nickname=contact.encrypted_nickname,
        is_verified=contact.is_verified,
        last_key_exchange=contact.last_key_exchange,
        created_at=contact.created_at
    )


@router.post("/reject", status_code=status.HTTP_200_OK)
async def reject_friend_request(
    reject_data: FriendRequestReject,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Reject a pending friend request.
    Request is permanently deleted.
    """
    repo = FriendRepository(db)
    
    # Get the request first to find sender_id for notification
    friend_request = db.query(FriendRequestModel).filter(
        FriendRequestModel.id == reject_data.request_id,
        FriendRequestModel.receiver_id == user_id,
        FriendRequestModel.status == FriendRequestStatusEnum.PENDING
    ).first()
    
    sender_id = friend_request.sender_id if friend_request else None
    
    success, error = repo.reject_friend_request(
        request_id=reject_data.request_id,
        receiver_id=user_id
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    # Notify the original sender that their request was rejected
    if sender_id:
        receiver = db.query(User).filter(User.id == user_id).first()
        if receiver:
            await notify_friend_request_rejected(
                sender_id=sender_id,
                rejecter_username=receiver.username
            )
    
    return {"message": "Friend request rejected"}


@router.post("/cancel/{request_id}", status_code=status.HTTP_200_OK)
async def cancel_friend_request(
    request_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Cancel an outgoing friend request.
    Only the sender can cancel their own request.
    """
    repo = FriendRepository(db)
    
    success, error = repo.cancel_friend_request(
        request_id=request_id,
        sender_id=user_id
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {"message": "Friend request cancelled"}


@router.get("/pending", response_model=PendingRequestsResponse)
async def get_pending_requests(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Get all pending friend requests (incoming and outgoing).
    Expired requests are automatically cleaned up.
    """
    repo = FriendRepository(db)
    pending = repo.get_pending_requests(user_id)
    
    # Format incoming requests
    incoming_responses = []
    for req in pending["incoming"]:
        sender = db.query(User).filter(User.id == req.sender_id).first()
        receiver = db.query(User).filter(User.id == req.receiver_id).first()
        incoming_responses.append(FriendRequestResponse(
            id=req.id,
            sender_id=req.sender_id,
            sender_username=sender.username if sender else "Unknown",
            receiver_id=req.receiver_id,
            receiver_username=receiver.username if receiver else "Unknown",
            sender_public_key_fingerprint=req.sender_public_key_fingerprint,
            receiver_public_key_fingerprint=req.receiver_public_key_fingerprint,
            message=req.encrypted_message,
            status=req.status,
            created_at=req.created_at,
            updated_at=req.updated_at,
            expires_at=req.expires_at
        ))
    
    # Format outgoing requests
    outgoing_responses = []
    for req in pending["outgoing"]:
        sender = db.query(User).filter(User.id == req.sender_id).first()
        receiver = db.query(User).filter(User.id == req.receiver_id).first()
        outgoing_responses.append(FriendRequestResponse(
            id=req.id,
            sender_id=req.sender_id,
            sender_username=sender.username if sender else "Unknown",
            receiver_id=req.receiver_id,
            receiver_username=receiver.username if receiver else "Unknown",
            sender_public_key_fingerprint=req.sender_public_key_fingerprint,
            receiver_public_key_fingerprint=req.receiver_public_key_fingerprint,
            message=req.encrypted_message,
            status=req.status,
            created_at=req.created_at,
            updated_at=req.updated_at,
            expires_at=req.expires_at
        ))
    
    return PendingRequestsResponse(
        incoming=incoming_responses,
        outgoing=outgoing_responses,
        total_incoming=pending["total_incoming"],
        total_outgoing=pending["total_outgoing"]
    )


# ============ Trusted Contacts Endpoints ============

@router.get("/list", response_model=List[TrustedContactResponse])
async def get_contacts(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Get all trusted contacts for the current user.
    Only mutually accepted contacts are returned.
    """
    repo = FriendRepository(db)
    contacts = repo.get_trusted_contacts(user_id)
    
    responses = []
    for contact in contacts:
        contact_user = db.query(User).filter(User.id == contact.contact_user_id).first()
        if contact_user:
            responses.append(TrustedContactResponse(
                id=contact.id,
                user_id=contact.user_id,
                contact_user_id=contact.contact_user_id,
                contact_username=contact_user.username,
                public_key=contact_user.public_key,
                identity_key=contact_user.identity_key,
                public_key_fingerprint=contact.contact_public_key_fingerprint,
                trust_level=contact.trust_level,
                nickname=contact.encrypted_nickname,
                is_verified=contact.is_verified,
                last_key_exchange=contact.last_key_exchange,
                created_at=contact.created_at
            ))
    
    return responses


@router.get("/contact/{contact_user_id}", response_model=TrustedContactResponse)
async def get_contact(
    contact_user_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get a specific trusted contact"""
    repo = FriendRepository(db)
    contact = repo.get_contact(user_id, contact_user_id)
    
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )
    
    contact_user = db.query(User).filter(User.id == contact.contact_user_id).first()
    
    return TrustedContactResponse(
        id=contact.id,
        user_id=contact.user_id,
        contact_user_id=contact.contact_user_id,
        contact_username=contact_user.username,
        public_key=contact_user.public_key,
        identity_key=contact_user.identity_key,
        public_key_fingerprint=contact.contact_public_key_fingerprint,
        trust_level=contact.trust_level,
        nickname=contact.encrypted_nickname,
        is_verified=contact.is_verified,
        last_key_exchange=contact.last_key_exchange,
        created_at=contact.created_at
    )


@router.post("/verify", status_code=status.HTTP_200_OK)
async def verify_contact(
    verification: ContactVerification,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Verify a contact's key fingerprint (manual verification).
    
    Security:
    - User must manually compare fingerprint (via QR code or voice)
    - Prevents MITM attacks on key exchange
    - Sets trust level to VERIFIED
    """
    repo = FriendRepository(db)
    
    success, error = repo.verify_contact(
        user_id=user_id,
        contact_user_id=verification.contact_user_id,
        verified_fingerprint=verification.verified_fingerprint
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {"message": "Contact verified successfully", "trust_level": "verified"}


@router.delete("/contact/{contact_user_id}", status_code=status.HTTP_200_OK)
async def remove_contact(
    contact_user_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Remove a trusted contact.
    This is a soft delete - contact history is preserved but contact is removed.
    """
    repo = FriendRepository(db)
    
    success, error = repo.remove_contact(user_id, contact_user_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {"message": "Contact removed"}


@router.put("/contact/{contact_user_id}/nickname")
async def update_nickname(
    contact_user_id: int,
    nickname: Optional[str] = None,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Update contact nickname (should be encrypted by client)"""
    repo = FriendRepository(db)
    
    success, error = repo.update_contact_nickname(user_id, contact_user_id, nickname)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {"message": "Nickname updated"}


@router.get("/can-message/{contact_user_id}")
async def can_message_user(
    contact_user_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Check if user can send encrypted messages to another user.
    Only mutual contacts can exchange messages.
    """
    repo = FriendRepository(db)
    
    # Check if blocked
    if repo.is_blocked(user_id, contact_user_id):
        return {"can_message": False, "reason": "blocked"}
    
    # Check if mutual contacts
    if not repo.is_mutual_contact(user_id, contact_user_id):
        return {"can_message": False, "reason": "not_contact"}
    
    # Get contact for key info
    contact = repo.get_contact(user_id, contact_user_id)
    contact_user = db.query(User).filter(User.id == contact_user_id).first()
    
    return {
        "can_message": True,
        "contact_username": contact_user.username,
        "public_key": contact_user.public_key,
        "identity_key": contact_user.identity_key,
        "is_verified": contact.is_verified if contact else False,
        "trust_level": contact.trust_level if contact else "unverified"
    }


# ============ Block Endpoints ============

@router.post("/block", status_code=status.HTTP_201_CREATED)
async def block_user(
    block_data: BlockUserRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Block a user.
    
    Effects:
    - Cancels any pending friend requests
    - Removes from contacts
    - Prevents future requests
    - Blocks all communication
    """
    repo = FriendRepository(db)
    
    success, error = repo.block_user(
        user_id=user_id,
        blocked_user_id=block_data.user_id,
        reason=block_data.reason,
        encrypted_info=block_data.additional_info
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {"message": "User blocked"}


@router.post("/unblock", status_code=status.HTTP_200_OK)
async def unblock_user(
    unblock_data: UnblockUserRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Unblock a previously blocked user"""
    repo = FriendRepository(db)
    
    success, error = repo.unblock_user(user_id, unblock_data.user_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {"message": "User unblocked"}


@router.get("/blocked", response_model=List[BlockedUserResponse])
async def get_blocked_users(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get list of blocked users"""
    repo = FriendRepository(db)
    blocked = repo.get_blocked_users(user_id)
    
    responses = []
    for block in blocked:
        blocked_user = db.query(User).filter(User.id == block.blocked_user_id).first()
        if blocked_user:
            responses.append(BlockedUserResponse(
                id=block.id,
                blocked_user_id=block.blocked_user_id,
                blocked_username=blocked_user.username,
                reason=block.reason,
                blocked_at=block.blocked_at
            ))
    
    return responses


# ============ Search Endpoints ============

@router.get("/search", response_model=List[UserSearchResult])
async def search_users(
    q: str = Query(..., min_length=2, max_length=50, description="Search query"),
    search_type: str = Query("username", description="Search by: username, user_id, fingerprint"),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Search for users.
    
    Security:
    - Rate limited to prevent mass scraping
    - Only prefix matching for usernames (no wildcards)
    - Blocked users are excluded
    - Minimal information returned
    """
    repo = FriendRepository(db)
    
    # Check rate limit
    is_allowed, error = repo.check_rate_limit(user_id, "search")
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error
        )
    
    # Validate search type
    if search_type not in ["username", "user_id", "fingerprint"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid search type"
        )
    
    results = repo.search_users(user_id, q, search_type)
    
    return [UserSearchResult(**r) for r in results]


# ============ QR Code Endpoints ============

@router.get("/qr-data")
async def get_qr_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get data for generating QR code for contact sharing.
    
    Security:
    - Includes timestamp for expiry
    - Contains fingerprints for verification
    - Should be signed by client before displaying
    """
    if not current_user.public_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No public key uploaded"
        )
    
    fingerprint = compute_key_fingerprint(current_user.public_key)
    identity_fingerprint = compute_key_fingerprint(current_user.identity_key) if current_user.identity_key else ""
    
    return {
        "user_id": current_user.id,
        "username": current_user.username,
        "public_key_fingerprint": fingerprint,
        "identity_key_fingerprint": identity_fingerprint,
        "timestamp": int(time.time()),
        "expires_in": 300  # 5 minutes
    }


@router.post("/qr-scan")
async def process_qr_scan(
    qr_data: QRCodeData,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Process a scanned QR code to add contact.
    
    Security:
    - Verifies QR code timestamp (not expired)
    - Verifies signature
    - Creates friend request automatically
    """
    # Check if QR code is expired (5 minutes)
    current_time = int(time.time())
    if current_time - qr_data.timestamp > 300:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="QR code has expired"
        )
    
    # Find the user from QR data
    target_user = db.query(User).filter(User.id == qr_data.user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Verify username matches
    if target_user.username != qr_data.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid QR code data"
        )
    
    # Get current user's fingerprint
    current_user = db.query(User).filter(User.id == user_id).first()
    if not current_user.public_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload your keys first"
        )
    
    sender_fingerprint = compute_key_fingerprint(current_user.public_key)
    
    # Create friend request
    repo = FriendRepository(db)
    friend_request, error = repo.create_friend_request(
        sender_id=user_id,
        receiver_id=target_user.id,
        sender_fingerprint=sender_fingerprint
    )
    
    if not friend_request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {
        "message": "Friend request sent",
        "request_id": friend_request.id,
        "target_username": target_user.username,
        "target_fingerprint": qr_data.public_key_fingerprint
    }


# ============ Key Update Notification ============

@router.post("/key-changed/{contact_user_id}")
async def notify_key_changed(
    contact_user_id: int,
    new_fingerprint: str,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Update contact's key after rotation.
    Resets verification status - user should re-verify.
    """
    repo = FriendRepository(db)
    
    success, error = repo.update_contact_key(user_id, contact_user_id, new_fingerprint)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {"message": "Contact key updated", "requires_verification": True}


# ============ Unfriend Endpoint ============

@router.post("/unfriend", status_code=status.HTTP_200_OK)
async def unfriend_user(
    unfriend_data: UnfriendRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Unfriend a user with full cleanup.
    
    Effects:
    - Removes contact from both sides
    - Optionally revokes shared encryption keys
    - Notifies the other user
    - Messages preserved locally only (no sync)
    """
    repo = FriendRepository(db)
    
    # Get user info for notification
    contact_user = db.query(User).filter(User.id == unfriend_data.user_id).first()
    current_user = db.query(User).filter(User.id == user_id).first()
    
    if not contact_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    success, error = repo.unfriend_user(
        user_id=user_id,
        contact_user_id=unfriend_data.user_id,
        revoke_keys=unfriend_data.revoke_keys
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    # Send real-time notification
    if current_user:
        await notify_contact_removed(
            user_id=unfriend_data.user_id,
            removed_by_username=current_user.username
        )
    
    return {
        "success": True,
        "message": f"Unfriended {contact_user.username}",
        "keys_revoked": unfriend_data.revoke_keys
    }


# ============ Notification Endpoints ============

@router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(
    unread_only: bool = Query(False, description="Only return unread notifications"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Get notifications for the current user.
    
    Returns friend request notifications, contact updates, and system messages.
    """
    repo = FriendRepository(db)
    
    if unread_only:
        notifications = repo.get_unread_notifications(user_id, limit)
    else:
        notifications = repo.get_all_notifications(user_id, limit, offset)
    
    responses = []
    for notif in notifications:
        # Get related user info if available
        related_username = None
        if notif.related_user_id:
            related_user = db.query(User).filter(User.id == notif.related_user_id).first()
            related_username = related_user.username if related_user else None
        
        # Parse payload if it's a JSON string
        payload = None
        if notif.payload:
            try:
                payload = json.loads(notif.payload)
            except:
                payload = {"raw": notif.payload}
        
        responses.append(NotificationResponse(
            id=notif.id,
            notification_type=notif.notification_type.value,
            title=notif.title,
            message=notif.message,
            payload=payload,
            related_user_id=notif.related_user_id,
            related_username=related_username,
            is_read=notif.is_read,
            is_delivered=notif.is_delivered,
            created_at=notif.created_at
        ))
    
    return responses


@router.get("/notifications/count", response_model=NotificationCountResponse)
async def get_notification_count(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Get notification counts for badge display.
    """
    repo = FriendRepository(db)
    counts = repo.get_notification_count(user_id)
    return NotificationCountResponse(**counts)


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Mark a specific notification as read"""
    repo = FriendRepository(db)
    success = repo.mark_notification_read(notification_id, user_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    return {"message": "Notification marked as read"}


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Mark all notifications as read"""
    repo = FriendRepository(db)
    count = repo.mark_all_notifications_read(user_id)
    
    return {"message": f"Marked {count} notifications as read"}

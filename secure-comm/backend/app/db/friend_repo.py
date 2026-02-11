"""
Friend Request & Secure Contact Repository
Database operations for the friend system with security measures
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from datetime import datetime, timedelta
from typing import Optional, List, Tuple
import secrets
import hashlib
import json

from app.db.friend_models import (
    FriendRequest, 
    TrustedContact, 
    BlockedUser, 
    FriendRequestRateLimit,
    FriendRequestStatusEnum,
    TrustLevelEnum,
    BlockReasonEnum,
    Notification,
    NotificationTypeEnum,
    RejectionLog
)
from app.db.database import User


class FriendRepository:
    """
    Repository for friend-related database operations
    Implements security measures including rate limiting and validation
    """
    
    # Rate limit constants
    MAX_REQUESTS_PER_DAY = 50
    MAX_SEARCHES_PER_DAY = 100
    MAX_FAILED_REQUESTS = 10
    RATE_LIMIT_DURATION_HOURS = 24
    
    def __init__(self, db: Session):
        self.db = db
    
    # ============ Rate Limiting ============
    
    def _get_or_create_rate_limit(self, user_id: int) -> FriendRequestRateLimit:
        """Get or create rate limit record for user"""
        rate_limit = self.db.query(FriendRequestRateLimit).filter(
            FriendRequestRateLimit.user_id == user_id
        ).first()
        
        if not rate_limit:
            rate_limit = FriendRequestRateLimit(user_id=user_id)
            self.db.add(rate_limit)
            self.db.commit()
            self.db.refresh(rate_limit)
        
        return rate_limit
    
    def _reset_daily_counters_if_needed(self, rate_limit: FriendRequestRateLimit) -> None:
        """Reset daily counters if a new day has started"""
        now = datetime.utcnow()
        if rate_limit.counter_reset_at:
            # Reset if last reset was more than 24 hours ago
            if now - rate_limit.counter_reset_at > timedelta(hours=24):
                rate_limit.requests_sent_today = 0
                rate_limit.searches_today = 0
                rate_limit.counter_reset_at = now
                self.db.commit()
    
    def check_rate_limit(self, user_id: int, action: str = "request") -> Tuple[bool, str]:
        """
        Check if user is rate limited
        Returns (is_allowed, error_message)
        """
        rate_limit = self._get_or_create_rate_limit(user_id)
        self._reset_daily_counters_if_needed(rate_limit)
        
        now = datetime.utcnow()
        
        # Check if user is currently rate limited
        if rate_limit.is_rate_limited and rate_limit.rate_limit_until:
            if now < rate_limit.rate_limit_until:
                remaining = (rate_limit.rate_limit_until - now).total_seconds() / 3600
                return False, f"Rate limited. Try again in {remaining:.1f} hours."
            else:
                # Reset rate limit
                rate_limit.is_rate_limited = False
                rate_limit.rate_limit_until = None
                rate_limit.failed_requests_count = 0
                self.db.commit()
        
        if action == "request":
            if rate_limit.requests_sent_today >= self.MAX_REQUESTS_PER_DAY:
                return False, "Daily friend request limit reached"
        elif action == "search":
            if rate_limit.searches_today >= self.MAX_SEARCHES_PER_DAY:
                return False, "Daily search limit reached"
        
        return True, ""
    
    def increment_rate_limit(self, user_id: int, action: str = "request", failed: bool = False) -> None:
        """Increment rate limit counter after an action"""
        rate_limit = self._get_or_create_rate_limit(user_id)
        
        now = datetime.utcnow()
        
        if action == "request":
            rate_limit.requests_sent_today += 1
            rate_limit.last_request_at = now
        elif action == "search":
            rate_limit.searches_today += 1
            rate_limit.last_search_at = now
        
        if failed:
            rate_limit.failed_requests_count += 1
            # Apply rate limit if too many failed requests
            if rate_limit.failed_requests_count >= self.MAX_FAILED_REQUESTS:
                rate_limit.is_rate_limited = True
                rate_limit.rate_limit_until = now + timedelta(hours=self.RATE_LIMIT_DURATION_HOURS)
        
        self.db.commit()
    
    # ============ Friend Requests ============
    
    def generate_request_nonce(self) -> str:
        """Generate a unique nonce for a friend request"""
        return secrets.token_hex(32)
    
    def create_friend_request(
        self,
        sender_id: int,
        receiver_id: int,
        sender_fingerprint: str,
        encrypted_message: Optional[str] = None
    ) -> Tuple[Optional[FriendRequest], str]:
        """
        Create a new friend request
        Returns (request, error_message)
        """
        # Validate: Can't send request to yourself
        if sender_id == receiver_id:
            return None, "Cannot send friend request to yourself"
        
        # Check if receiver exists and is active
        receiver = self.db.query(User).filter(
            User.id == receiver_id,
            User.is_active == True
        ).first()
        
        if not receiver:
            self.increment_rate_limit(sender_id, "request", failed=True)
            return None, "User not found"
        
        # Check if blocked by receiver
        is_blocked = self.db.query(BlockedUser).filter(
            BlockedUser.user_id == receiver_id,
            BlockedUser.blocked_user_id == sender_id
        ).first()
        
        if is_blocked:
            # Don't reveal block status - just say request failed
            return None, "Unable to send friend request"
        
        # Check if sender blocked receiver
        sender_blocked = self.db.query(BlockedUser).filter(
            BlockedUser.user_id == sender_id,
            BlockedUser.blocked_user_id == receiver_id
        ).first()
        
        if sender_blocked:
            return None, "You have blocked this user"
        
        # Check for existing pending request
        existing_request = self.db.query(FriendRequest).filter(
            FriendRequest.sender_id == sender_id,
            FriendRequest.receiver_id == receiver_id,
            FriendRequest.status == FriendRequestStatusEnum.PENDING
        ).first()
        
        if existing_request:
            return None, "Friend request already pending"
        
        # Check for reverse pending request (they already sent you a request)
        reverse_request = self.db.query(FriendRequest).filter(
            FriendRequest.sender_id == receiver_id,
            FriendRequest.receiver_id == sender_id,
            FriendRequest.status == FriendRequestStatusEnum.PENDING
        ).first()
        
        if reverse_request:
            return None, "This user has already sent you a friend request"
        
        # Check if already contacts
        existing_contact = self.db.query(TrustedContact).filter(
            TrustedContact.user_id == sender_id,
            TrustedContact.contact_user_id == receiver_id,
            TrustedContact.is_removed == False
        ).first()
        
        if existing_contact:
            return None, "Already a contact"
        
        # Create the request
        request = FriendRequest(
            sender_id=sender_id,
            receiver_id=receiver_id,
            sender_public_key_fingerprint=sender_fingerprint,
            encrypted_message=encrypted_message,
            request_nonce=self.generate_request_nonce(),
            expires_at=FriendRequest.default_expiry()
        )
        
        self.db.add(request)
        self.increment_rate_limit(sender_id, "request")
        self.db.commit()
        self.db.refresh(request)
        
        return request, ""
    
    def get_pending_requests(self, user_id: int) -> dict:
        """Get all pending friend requests for a user"""
        now = datetime.utcnow()
        
        # Clean up expired requests first
        self.db.query(FriendRequest).filter(
            FriendRequest.expires_at < now,
            FriendRequest.status == FriendRequestStatusEnum.PENDING
        ).update({"status": FriendRequestStatusEnum.EXPIRED})
        self.db.commit()
        
        # Get incoming requests
        incoming = self.db.query(FriendRequest).filter(
            FriendRequest.receiver_id == user_id,
            FriendRequest.status == FriendRequestStatusEnum.PENDING,
            FriendRequest.expires_at > now
        ).all()
        
        # Get outgoing requests
        outgoing = self.db.query(FriendRequest).filter(
            FriendRequest.sender_id == user_id,
            FriendRequest.status == FriendRequestStatusEnum.PENDING,
            FriendRequest.expires_at > now
        ).all()
        
        return {
            "incoming": incoming,
            "outgoing": outgoing,
            "total_incoming": len(incoming),
            "total_outgoing": len(outgoing)
        }
    
    def get_request_by_id(self, request_id: int, user_id: int) -> Optional[FriendRequest]:
        """Get a friend request by ID (only if user is sender or receiver)"""
        return self.db.query(FriendRequest).filter(
            FriendRequest.id == request_id,
            or_(
                FriendRequest.sender_id == user_id,
                FriendRequest.receiver_id == user_id
            )
        ).first()
    
    
    def _upsert_trusted_contact(
        self,
        user_id: int,
        contact_user_id: int,
        contact_public_key_fingerprint: str,
        contact_identity_key_fingerprint: Optional[str]
    ) -> TrustedContact:
        """Create or restore a trusted contact"""
        contact = self.db.query(TrustedContact).filter(
            TrustedContact.user_id == user_id,
            TrustedContact.contact_user_id == contact_user_id
        ).first()
        
        if contact:
            # Restore if it was removed
            if contact.is_removed:
                contact.is_removed = False
                contact.removed_at = None
            
            # Update key info
            contact.contact_public_key_fingerprint = contact_public_key_fingerprint
            contact.contact_identity_key_fingerprint = contact_identity_key_fingerprint
            contact.trust_level = TrustLevelEnum.UNVERIFIED
            contact.is_verified = False
            contact.verification_date = None
            contact.last_key_exchange = datetime.utcnow()
            # Increment key version to signal change
            contact.key_version += 1
        else:
            contact = TrustedContact(
                user_id=user_id,
                contact_user_id=contact_user_id,
                contact_public_key_fingerprint=contact_public_key_fingerprint,
                contact_identity_key_fingerprint=contact_identity_key_fingerprint,
                trust_level=TrustLevelEnum.UNVERIFIED
            )
            self.db.add(contact)
            
        return contact

    def accept_friend_request(
        self,
        request_id: int,
        receiver_id: int,
        receiver_fingerprint: str,
        verified_sender_fingerprint: str
    ) -> Tuple[bool, str, Optional[TrustedContact]]:
        """
        Accept a friend request and create trusted contacts
        Returns (success, error_message, contact)
        """
        request = self.db.query(FriendRequest).filter(
            FriendRequest.id == request_id,
            FriendRequest.receiver_id == receiver_id,
            FriendRequest.status == FriendRequestStatusEnum.PENDING
        ).first()
        
        if not request:
            return False, "Friend request not found or already processed", None
        
        # Verify the fingerprint matches (MITM protection)
        if request.sender_public_key_fingerprint.upper() != verified_sender_fingerprint.upper():
            return False, "Fingerprint verification failed - possible MITM attack", None
        
        # Check if request has expired
        if request.expires_at < datetime.utcnow():
            request.status = FriendRequestStatusEnum.EXPIRED
            self.db.commit()
            return False, "Friend request has expired", None
        
        # Get sender's current keys for contact creation
        sender = self.db.query(User).filter(User.id == request.sender_id).first()
        receiver = self.db.query(User).filter(User.id == receiver_id).first()
        
        if not sender or not receiver:
            return False, "User not found", None
        
        # Update request status
        request.status = FriendRequestStatusEnum.ACCEPTED
        request.receiver_public_key_fingerprint = receiver_fingerprint
        request.updated_at = datetime.utcnow()
        
        # Create trusted contact for both users (bidirectional) using upsert
        sender_contact = self._upsert_trusted_contact(
            user_id=request.sender_id,
            contact_user_id=request.receiver_id,
            contact_public_key_fingerprint=receiver_fingerprint,
            contact_identity_key_fingerprint=self._compute_identity_fingerprint(receiver.identity_key)
        )
        
        receiver_contact = self._upsert_trusted_contact(
            user_id=request.receiver_id,
            contact_user_id=request.sender_id,
            contact_public_key_fingerprint=request.sender_public_key_fingerprint,
            contact_identity_key_fingerprint=self._compute_identity_fingerprint(sender.identity_key)
        )
        
        self.db.commit()
        self.db.refresh(receiver_contact)
        
        return True, "", receiver_contact
    
    def reject_friend_request(self, request_id: int, receiver_id: int) -> Tuple[bool, str]:
        """
        Reject a friend request
        Returns (success, error_message)
        """
        request = self.db.query(FriendRequest).filter(
            FriendRequest.id == request_id,
            FriendRequest.receiver_id == receiver_id,
            FriendRequest.status == FriendRequestStatusEnum.PENDING
        ).first()
        
        if not request:
            return False, "Friend request not found or already processed"
        
        request.status = FriendRequestStatusEnum.REJECTED
        request.updated_at = datetime.utcnow()
        self.db.commit()
        
        return True, ""
    
    def cancel_friend_request(self, request_id: int, sender_id: int) -> Tuple[bool, str]:
        """
        Cancel an outgoing friend request
        Returns (success, error_message)
        """
        request = self.db.query(FriendRequest).filter(
            FriendRequest.id == request_id,
            FriendRequest.sender_id == sender_id,
            FriendRequest.status == FriendRequestStatusEnum.PENDING
        ).first()
        
        if not request:
            return False, "Friend request not found or already processed"
        
        request.status = FriendRequestStatusEnum.CANCELLED
        request.updated_at = datetime.utcnow()
        self.db.commit()
        
        return True, ""
    
    # ============ Trusted Contacts ============
    
    def get_trusted_contacts(self, user_id: int) -> List[TrustedContact]:
        """Get all trusted contacts for a user"""
        return self.db.query(TrustedContact).filter(
            TrustedContact.user_id == user_id,
            TrustedContact.is_removed == False
        ).all()
    
    def get_contact(self, user_id: int, contact_user_id: int) -> Optional[TrustedContact]:
        """Get a specific contact"""
        return self.db.query(TrustedContact).filter(
            TrustedContact.user_id == user_id,
            TrustedContact.contact_user_id == contact_user_id,
            TrustedContact.is_removed == False
        ).first()
    
    def is_mutual_contact(self, user_id: int, other_user_id: int) -> bool:
        """Check if two users are mutual contacts (both have each other as contacts)"""
        contact1 = self.get_contact(user_id, other_user_id)
        contact2 = self.get_contact(other_user_id, user_id)
        return contact1 is not None and contact2 is not None
    
    def verify_contact(
        self,
        user_id: int,
        contact_user_id: int,
        verified_fingerprint: str
    ) -> Tuple[bool, str]:
        """
        Mark a contact as verified (manual key verification)
        Returns (success, error_message)
        """
        contact = self.get_contact(user_id, contact_user_id)
        
        if not contact:
            return False, "Contact not found"
        
        # Verify fingerprint matches
        if contact.contact_public_key_fingerprint.upper() != verified_fingerprint.upper():
            return False, "Fingerprint mismatch - keys may have changed"
        
        contact.is_verified = True
        contact.verification_date = datetime.utcnow()
        contact.trust_level = TrustLevelEnum.VERIFIED
        self.db.commit()
        
        return True, ""
    
    def update_contact_trust_level(
        self,
        user_id: int,
        contact_user_id: int,
        trust_level: TrustLevelEnum
    ) -> Tuple[bool, str]:
        """Update trust level for a contact"""
        contact = self.get_contact(user_id, contact_user_id)
        
        if not contact:
            return False, "Contact not found"
        
        contact.trust_level = trust_level
        self.db.commit()
        
        return True, ""
    
    def update_contact_nickname(
        self,
        user_id: int,
        contact_user_id: int,
        encrypted_nickname: Optional[str]
    ) -> Tuple[bool, str]:
        """Update nickname for a contact (encrypted)"""
        contact = self.get_contact(user_id, contact_user_id)
        
        if not contact:
            return False, "Contact not found"
        
        contact.encrypted_nickname = encrypted_nickname
        self.db.commit()
        
        return True, ""
    
    def remove_contact(self, user_id: int, contact_user_id: int) -> Tuple[bool, str]:
        """
        Remove a contact (soft delete, preserves history)
        Returns (success, error_message)
        """
        contact = self.get_contact(user_id, contact_user_id)
        
        if not contact:
            return False, "Contact not found"
        
        contact.is_removed = True
        contact.removed_at = datetime.utcnow()
        self.db.commit()
        
        return True, ""
    
    def update_contact_key(
        self,
        user_id: int,
        contact_user_id: int,
        new_fingerprint: str
    ) -> Tuple[bool, str]:
        """
        Update contact's key fingerprint after key rotation
        Resets verification status
        """
        contact = self.get_contact(user_id, contact_user_id)
        
        if not contact:
            return False, "Contact not found"
        
        # Key change resets verification
        contact.contact_public_key_fingerprint = new_fingerprint
        contact.is_verified = False
        contact.trust_level = TrustLevelEnum.UNVERIFIED
        contact.verification_date = None
        contact.last_key_exchange = datetime.utcnow()
        contact.key_version += 1
        self.db.commit()
        
        return True, ""
    
    # ============ Blocked Users ============
    
    def block_user(
        self,
        user_id: int,
        blocked_user_id: int,
        reason: BlockReasonEnum = BlockReasonEnum.OTHER,
        encrypted_info: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Block a user
        Returns (success, error_message)
        """
        if user_id == blocked_user_id:
            return False, "Cannot block yourself"
        
        # Check if already blocked
        existing = self.db.query(BlockedUser).filter(
            BlockedUser.user_id == user_id,
            BlockedUser.blocked_user_id == blocked_user_id
        ).first()
        
        if existing:
            return False, "User already blocked"
        
        # Create block entry
        block = BlockedUser(
            user_id=user_id,
            blocked_user_id=blocked_user_id,
            reason=reason,
            encrypted_additional_info=encrypted_info
        )
        
        self.db.add(block)
        
        # Cancel any pending requests between these users
        self.db.query(FriendRequest).filter(
            or_(
                and_(
                    FriendRequest.sender_id == user_id,
                    FriendRequest.receiver_id == blocked_user_id
                ),
                and_(
                    FriendRequest.sender_id == blocked_user_id,
                    FriendRequest.receiver_id == user_id
                )
            ),
            FriendRequest.status == FriendRequestStatusEnum.PENDING
        ).update({"status": FriendRequestStatusEnum.CANCELLED})
        
        # Remove from contacts (soft delete)
        contact = self.get_contact(user_id, blocked_user_id)
        if contact:
            contact.is_removed = True
            contact.removed_at = datetime.utcnow()
        
        self.db.commit()
        
        return True, ""
    
    def unblock_user(self, user_id: int, blocked_user_id: int) -> Tuple[bool, str]:
        """
        Unblock a user and restore contact if it existed
        Returns (success, error_message)
        """
        block = self.db.query(BlockedUser).filter(
            BlockedUser.user_id == user_id,
            BlockedUser.blocked_user_id == blocked_user_id
        ).first()
        
        if not block:
            return False, "User is not blocked"
        
        # Get blocked user's username for notification
        blocked_user = self.db.query(User).filter(User.id == blocked_user_id).first()
        
        # Delete the block
        self.db.delete(block)
        
        # Check if there's a removed contact relationship and restore it
        contact_restored = False
        contact = self.db.query(TrustedContact).filter(
            TrustedContact.user_id == user_id,
            TrustedContact.contact_user_id == blocked_user_id,
            TrustedContact.is_removed == True
        ).first()
        
        if contact:
            # Restore the contact relationship
            contact.is_removed = False
            contact.removed_at = None
            contact_restored = True
            # Keep the original trust level, key fingerprint, and verification status
            # This preserves chat history and key verification
        
        # Check for reverse contact (they had you as contact)
        reverse_contact = self.db.query(TrustedContact).filter(
            TrustedContact.user_id == blocked_user_id,
            TrustedContact.contact_user_id == user_id,
            TrustedContact.is_removed == True
        ).first()
        
        if reverse_contact:
            # Restore the reverse contact as well
            reverse_contact.is_removed = False
            reverse_contact.removed_at = None
        
        self.db.commit()
        
        # Create notification for both users if contact was restored
        if contact_restored and blocked_user:
            # Notify the user who unblocked
            self.create_notification(
                user_id=user_id,
                notification_type=NotificationTypeEnum.USER_UNBLOCKED,
                title=f"Contact Restored",
                message=f"You unblocked {blocked_user.username}. Your previous chat history and verified keys have been restored.",
                payload={"blocked_user_id": blocked_user_id, "contact_restored": True},
                related_user_id=blocked_user_id
            )
            
            # Notify the user who was unblocked
            user = self.db.query(User).filter(User.id == user_id).first()
            if user:
                self.create_notification(
                    user_id=blocked_user_id,
                    notification_type=NotificationTypeEnum.USER_UNBLOCKED,
                    title=f"Contact Restored",
                    message=f"{user.username} unblocked you. You can now message each other again.",
                    payload={"unblocked_by_user_id": user_id, "contact_restored": True},
                    related_user_id=user_id
                )
        
        return True, ""
    
    def get_blocked_users(self, user_id: int) -> List[BlockedUser]:
        """Get all users blocked by user"""
        return self.db.query(BlockedUser).filter(
            BlockedUser.user_id == user_id
        ).all()
    
    def is_blocked(self, user_id: int, target_user_id: int) -> bool:
        """Check if user has blocked target or vice versa"""
        block = self.db.query(BlockedUser).filter(
            or_(
                and_(
                    BlockedUser.user_id == user_id,
                    BlockedUser.blocked_user_id == target_user_id
                ),
                and_(
                    BlockedUser.user_id == target_user_id,
                    BlockedUser.blocked_user_id == user_id
                )
            )
        ).first()
        
        return block is not None
    
    # ============ User Search ============
    
    def search_users(
        self,
        user_id: int,
        query: str,
        search_type: str = "username",
        limit: int = 10
    ) -> List[dict]:
        """
        Search for users (rate limited)
        Returns list of minimal user info
        """
        # Increment search counter
        self.increment_rate_limit(user_id, "search")
        
        # Get blocked user IDs to exclude
        blocked_ids = [b.blocked_user_id for b in self.get_blocked_users(user_id)]
        blocked_by_ids = [b.user_id for b in self.db.query(BlockedUser).filter(
            BlockedUser.blocked_user_id == user_id
        ).all()]
        exclude_ids = set(blocked_ids + blocked_by_ids + [user_id])
        
        # Build query based on search type
        if search_type == "user_id":
            try:
                target_id = int(query)
                users = self.db.query(User).filter(
                    User.id == target_id,
                    User.is_active == True,
                    ~User.id.in_(exclude_ids)
                ).limit(1).all()
            except ValueError:
                return []
        elif search_type == "fingerprint":
            # Search by public key fingerprint (exact match)
            users = self.db.query(User).filter(
                User.is_active == True,
                ~User.id.in_(exclude_ids)
            ).all()
            # Filter by fingerprint (computed from public key)
            users = [u for u in users if u.public_key and 
                    self._compute_fingerprint(u.public_key).upper().startswith(query.upper())][:limit]
        else:  # username search (default)
            # Only allow prefix matching to prevent scraping
            users = self.db.query(User).filter(
                User.username.ilike(f"{query}%"),
                User.is_active == True,
                ~User.id.in_(exclude_ids)
            ).limit(limit).all()
        
        # Get contact and request status for each result
        results = []
        for user in users:
            contact = self.get_contact(user_id, user.id)
            pending_request = self.db.query(FriendRequest).filter(
                or_(
                    and_(
                        FriendRequest.sender_id == user_id,
                        FriendRequest.receiver_id == user.id
                    ),
                    and_(
                        FriendRequest.sender_id == user.id,
                        FriendRequest.receiver_id == user_id
                    )
                ),
                FriendRequest.status == FriendRequestStatusEnum.PENDING
            ).first()
            
            results.append({
                "user_id": user.id,
                "username": user.username,
                "public_key_fingerprint": self._compute_fingerprint(user.public_key) if user.public_key else None,
                "has_pending_request": pending_request is not None,
                "is_contact": contact is not None,
                "is_blocked": False  # Already excluded blocked users
            })
        
        return results
    
    # ============ Notification Methods ============
    
    def create_notification(
        self,
        user_id: int,
        notification_type: NotificationTypeEnum,
        title: str,
        message: Optional[str] = None,
        payload: Optional[dict] = None,
        related_user_id: Optional[int] = None,
        related_request_id: Optional[int] = None,
        expires_hours: int = 168  # Default 7 days
    ) -> Notification:
        """Create a new notification for a user"""
        notification = Notification(
            user_id=user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            payload=json.dumps(payload) if payload else None,
            related_user_id=related_user_id,
            related_request_id=related_request_id,
            expires_at=datetime.utcnow() + timedelta(hours=expires_hours)
        )
        self.db.add(notification)
        self.db.commit()
        self.db.refresh(notification)
        return notification
    
    def get_unread_notifications(self, user_id: int, limit: int = 50) -> List[Notification]:
        """Get unread notifications for a user"""
        return self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False,
            or_(
                Notification.expires_at == None,
                Notification.expires_at > datetime.utcnow()
            )
        ).order_by(Notification.created_at.desc()).limit(limit).all()
    
    def get_all_notifications(self, user_id: int, limit: int = 100, offset: int = 0) -> List[Notification]:
        """Get all notifications for a user"""
        return self.db.query(Notification).filter(
            Notification.user_id == user_id,
            or_(
                Notification.expires_at == None,
                Notification.expires_at > datetime.utcnow()
            )
        ).order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()
    
    def mark_notification_read(self, notification_id: int, user_id: int) -> bool:
        """Mark a notification as read"""
        notification = self.db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.user_id == user_id
        ).first()
        
        if notification:
            notification.is_read = True
            notification.read_at = datetime.utcnow()
            self.db.commit()
            return True
        return False
    
    def mark_all_notifications_read(self, user_id: int) -> int:
        """Mark all notifications as read for a user"""
        count = self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False
        ).update({
            "is_read": True,
            "read_at": datetime.utcnow()
        })
        self.db.commit()
        return count
    
    def mark_notification_delivered(self, notification_id: int) -> bool:
        """Mark a notification as delivered via WebSocket"""
        notification = self.db.query(Notification).filter(
            Notification.id == notification_id
        ).first()
        
        if notification:
            notification.is_delivered = True
            notification.delivered_at = datetime.utcnow()
            self.db.commit()
            return True
        return False
    
    def get_undelivered_notifications(self, user_id: int) -> List[Notification]:
        """Get notifications that haven't been delivered via WebSocket and not already read"""
        return self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_delivered == False,
            Notification.is_read == False,
            or_(
                Notification.expires_at == None,
                Notification.expires_at > datetime.utcnow()
            )
        ).order_by(Notification.created_at.asc()).all()
    
    def get_notification_count(self, user_id: int) -> dict:
        """Get notification counts for a user"""
        # Total notifications
        total = self.db.query(Notification).filter(
            Notification.user_id == user_id,
            or_(
                Notification.expires_at == None,
                Notification.expires_at > datetime.utcnow()
            )
        ).count()
        
        # Unread notifications
        unread = self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False,
            or_(
                Notification.expires_at == None,
                Notification.expires_at > datetime.utcnow()
            )
        ).count()
        
        # Friend request notifications
        friend_request_count = self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False,
            Notification.notification_type == NotificationTypeEnum.FRIEND_REQUEST
        ).count()
        
        # Security alerts (key changed, blocked, etc.)
        security_alert_types = [
            NotificationTypeEnum.KEY_CHANGED,
            NotificationTypeEnum.USER_BLOCKED,
            NotificationTypeEnum.CONTACT_REMOVED
        ]
        security_alert_count = self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False,
            Notification.notification_type.in_(security_alert_types)
        ).count()
        
        return {
            "total": total,
            "unread": unread,
            "friend_requests": friend_request_count,
            "security_alerts": security_alert_count
        }
    
    def cleanup_expired_notifications(self) -> int:
        """Remove expired notifications"""
        count = self.db.query(Notification).filter(
            Notification.expires_at < datetime.utcnow()
        ).delete()
        self.db.commit()
        return count
    
    # ============ Rejection Tracking ============
    
    def log_rejection(self, sender_id: int, receiver_id: int) -> None:
        """Log a rejection for anti-spam tracking (hashed for privacy)"""
        # Create deterministic hash of the pair
        pair_str = f"{min(sender_id, receiver_id)}:{max(sender_id, receiver_id)}"
        rejection_hash = hashlib.sha256(pair_str.encode()).hexdigest()
        
        existing = self.db.query(RejectionLog).filter(
            RejectionLog.rejection_hash == rejection_hash
        ).first()
        
        if existing:
            existing.rejection_count += 1
            existing.created_at = datetime.utcnow()
        else:
            log = RejectionLog(rejection_hash=rejection_hash)
            self.db.add(log)
        
        self.db.commit()
    
    def check_rejection_pattern(self, sender_id: int, receiver_id: int) -> int:
        """Check how many times this pair has had rejections"""
        pair_str = f"{min(sender_id, receiver_id)}:{max(sender_id, receiver_id)}"
        rejection_hash = hashlib.sha256(pair_str.encode()).hexdigest()
        
        existing = self.db.query(RejectionLog).filter(
            RejectionLog.rejection_hash == rejection_hash
        ).first()
        
        return existing.rejection_count if existing else 0
    
    # ============ Unfriend with Cleanup ============
    
    def unfriend_user(
        self,
        user_id: int,
        contact_user_id: int,
        revoke_keys: bool = True
    ) -> Tuple[bool, str]:
        """
        Unfriend a user with full cleanup
        - Removes contact from both sides
        - Optionally revokes encryption keys
        - Creates notification
        Returns (success, error_message)
        """
        # Get both contact records
        user_contact = self.get_contact(user_id, contact_user_id)
        other_contact = self.get_contact(contact_user_id, user_id)
        
        if not user_contact and not other_contact:
            return False, "Not a contact"
        
        # Get usernames for notifications
        user = self.db.query(User).filter(User.id == user_id).first()
        other_user = self.db.query(User).filter(User.id == contact_user_id).first()
        
        now = datetime.utcnow()
        
        # Soft delete both contact records
        if user_contact:
            user_contact.is_removed = True
            user_contact.removed_at = now
            # Reset key info for key revocation
            if revoke_keys:
                user_contact.key_version += 1
                user_contact.is_verified = False
                user_contact.trust_level = TrustLevelEnum.UNVERIFIED
        
        if other_contact:
            other_contact.is_removed = True
            other_contact.removed_at = now
            if revoke_keys:
                other_contact.key_version += 1
                other_contact.is_verified = False
                other_contact.trust_level = TrustLevelEnum.UNVERIFIED
        
        # Create notification for the other user
        if other_user and user:
            self.create_notification(
                user_id=contact_user_id,
                notification_type=NotificationTypeEnum.CONTACT_REMOVED,
                title="Contact Removed",
                message=f"{user.username} has removed you from their contacts",
                payload={
                    "removed_by_user_id": user_id,
                    "removed_by_username": user.username
                },
                related_user_id=user_id
            )
        
        # Cascade cleanup: mark stale notifications from/about the removed contact as read
        # This prevents old friend_request, friend_request_accepted, etc. from re-appearing
        self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.related_user_id == contact_user_id,
            Notification.is_read == False
        ).update({
            "is_read": True,
            "read_at": now
        })
        self.db.query(Notification).filter(
            Notification.user_id == contact_user_id,
            Notification.related_user_id == user_id,
            Notification.is_read == False,
            Notification.notification_type != NotificationTypeEnum.CONTACT_REMOVED
        ).update({
            "is_read": True,
            "read_at": now
        })
        
        self.db.commit()
        return True, ""
    
    # ============ Helper Methods ============
    
    def _compute_fingerprint(self, public_key: Optional[str]) -> Optional[str]:
        """Compute SHA-256 fingerprint of a public key"""
        if not public_key:
            return None
        
        # Clean the key
        clean_key = public_key.replace("-----BEGIN PUBLIC KEY-----", "")
        clean_key = clean_key.replace("-----END PUBLIC KEY-----", "")
        clean_key = clean_key.replace("\n", "").replace("\r", "").replace(" ", "")
        
        # Compute hash
        hash_bytes = hashlib.sha256(clean_key.encode()).digest()
        
        # Format as colon-separated hex (first 16 bytes = 128 bits)
        return ":".join(f"{b:02X}" for b in hash_bytes[:16])
    
    def _compute_identity_fingerprint(self, identity_key: Optional[str]) -> Optional[str]:
        """Compute fingerprint for identity key"""
        return self._compute_fingerprint(identity_key)

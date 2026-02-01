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

from app.db.friend_models import (
    FriendRequest, 
    TrustedContact, 
    BlockedUser, 
    FriendRequestRateLimit,
    FriendRequestStatusEnum,
    TrustLevelEnum,
    BlockReasonEnum
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
        
        # Create trusted contact for both users (bidirectional)
        sender_contact = TrustedContact(
            user_id=request.sender_id,
            contact_user_id=request.receiver_id,
            contact_public_key_fingerprint=receiver_fingerprint,
            contact_identity_key_fingerprint=self._compute_identity_fingerprint(receiver.identity_key),
            trust_level=TrustLevelEnum.UNVERIFIED
        )
        
        receiver_contact = TrustedContact(
            user_id=request.receiver_id,
            contact_user_id=request.sender_id,
            contact_public_key_fingerprint=request.sender_public_key_fingerprint,
            contact_identity_key_fingerprint=self._compute_identity_fingerprint(sender.identity_key),
            trust_level=TrustLevelEnum.UNVERIFIED
        )
        
        self.db.add(sender_contact)
        self.db.add(receiver_contact)
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
        Unblock a user
        Returns (success, error_message)
        """
        block = self.db.query(BlockedUser).filter(
            BlockedUser.user_id == user_id,
            BlockedUser.blocked_user_id == blocked_user_id
        ).first()
        
        if not block:
            return False, "User is not blocked"
        
        self.db.delete(block)
        self.db.commit()
        
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

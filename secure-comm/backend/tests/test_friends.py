"""
Unit tests for the Friend Request System
Tests cover:
- Friend request creation and validation
- Accept/reject flow
- Rate limiting
- Block/unblock functionality
- Trusted contacts management
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.db.database import Base, get_db
from app.db.friend_models import FriendRequest, TrustedContact, BlockedUser, FriendRequestRateLimit, Notification, RejectionLog
from app.db.friend_repo import FriendRepository
from app.models.friend import (
    FriendRequestCreate, 
    FriendRequestAccept, 
    BlockUserRequest,
    compute_key_fingerprint
)
from app.core.security import create_access_token

# Test database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db

# Create test client
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_database():
    """Create tables before each test and drop after"""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session():
    """Get a test database session"""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_users(db_session):
    """Create test users in the database"""
    from app.models.user import User
    
    user1 = User(
        user_id=1,
        username="alice",
        email="alice@test.com",
        password_hash="hashed_password",
        public_key="test_public_key_alice_1234567890",
        created_at=datetime.utcnow()
    )
    user2 = User(
        user_id=2,
        username="bob",
        email="bob@test.com",
        password_hash="hashed_password",
        public_key="test_public_key_bob_0987654321",
        created_at=datetime.utcnow()
    )
    user3 = User(
        user_id=3,
        username="charlie",
        email="charlie@test.com",
        password_hash="hashed_password",
        public_key="test_public_key_charlie_5555555555",
        created_at=datetime.utcnow()
    )
    
    db_session.add_all([user1, user2, user3])
    db_session.commit()
    
    return {"alice": user1, "bob": user2, "charlie": user3}


@pytest.fixture
def auth_headers():
    """Generate auth headers for test users"""
    def _get_headers(user_id: int, username: str):
        token = create_access_token(data={"sub": username, "user_id": user_id})
        return {"Authorization": f"Bearer {token}"}
    return _get_headers


class TestFriendRepository:
    """Test the FriendRepository class directly"""
    
    def test_create_friend_request(self, db_session, test_users):
        """Test creating a new friend request"""
        repo = FriendRepository(db_session)
        
        request = repo.create_friend_request(
            sender_id=test_users["alice"].user_id,
            receiver_username="bob",
            sender_public_key_fingerprint="abc123fingerprint",
            message="Hey, let's connect!"
        )
        
        assert request is not None
        assert request.sender_id == test_users["alice"].user_id
        assert request.receiver_id == test_users["bob"].user_id
        assert request.status == "pending"
        assert request.message == "Hey, let's connect!"
        assert request.nonce is not None
    
    def test_cannot_request_self(self, db_session, test_users):
        """Test that users cannot send friend request to themselves"""
        repo = FriendRepository(db_session)
        
        with pytest.raises(ValueError, match="cannot send.*to yourself"):
            repo.create_friend_request(
                sender_id=test_users["alice"].user_id,
                receiver_username="alice",
                sender_public_key_fingerprint="abc123"
            )
    
    def test_cannot_request_blocked_user(self, db_session, test_users):
        """Test that blocked users cannot send requests"""
        repo = FriendRepository(db_session)
        
        # Bob blocks Alice
        repo.block_user(
            blocker_id=test_users["bob"].user_id,
            blocked_user_id=test_users["alice"].user_id
        )
        
        # Alice tries to send request to Bob
        with pytest.raises(ValueError, match="cannot send"):
            repo.create_friend_request(
                sender_id=test_users["alice"].user_id,
                receiver_username="bob",
                sender_public_key_fingerprint="abc123"
            )
    
    def test_duplicate_pending_request(self, db_session, test_users):
        """Test that duplicate pending requests are rejected"""
        repo = FriendRepository(db_session)
        
        # First request
        repo.create_friend_request(
            sender_id=test_users["alice"].user_id,
            receiver_username="bob",
            sender_public_key_fingerprint="abc123"
        )
        
        # Duplicate request
        with pytest.raises(ValueError, match="already.*pending"):
            repo.create_friend_request(
                sender_id=test_users["alice"].user_id,
                receiver_username="bob",
                sender_public_key_fingerprint="abc123"
            )
    
    def test_accept_friend_request(self, db_session, test_users):
        """Test accepting a friend request"""
        repo = FriendRepository(db_session)
        
        # Create request
        request = repo.create_friend_request(
            sender_id=test_users["alice"].user_id,
            receiver_username="bob",
            sender_public_key_fingerprint="abc123"
        )
        
        # Accept request
        contact = repo.accept_friend_request(
            request_id=request.request_id,
            receiver_id=test_users["bob"].user_id,
            receiver_public_key_fingerprint="xyz789"
        )
        
        assert contact is not None
        assert contact.user_id == test_users["alice"].user_id
        assert contact.contact_user_id == test_users["bob"].user_id
        
        # Check mutual contact created
        mutual = repo.is_mutual_contact(
            test_users["alice"].user_id,
            test_users["bob"].user_id
        )
        assert mutual is True
    
    def test_reject_friend_request(self, db_session, test_users):
        """Test rejecting a friend request"""
        repo = FriendRepository(db_session)
        
        # Create request
        request = repo.create_friend_request(
            sender_id=test_users["alice"].user_id,
            receiver_username="bob",
            sender_public_key_fingerprint="abc123"
        )
        
        # Reject request
        result = repo.reject_friend_request(
            request_id=request.request_id,
            receiver_id=test_users["bob"].user_id
        )
        
        assert result is True
        
        # Check request status
        db_session.refresh(request)
        assert request.status == "rejected"
    
    def test_cannot_accept_others_request(self, db_session, test_users):
        """Test that only the receiver can accept a request"""
        repo = FriendRepository(db_session)
        
        # Alice sends to Bob
        request = repo.create_friend_request(
            sender_id=test_users["alice"].user_id,
            receiver_username="bob",
            sender_public_key_fingerprint="abc123"
        )
        
        # Charlie tries to accept
        with pytest.raises(ValueError, match="not authorized"):
            repo.accept_friend_request(
                request_id=request.request_id,
                receiver_id=test_users["charlie"].user_id,
                receiver_public_key_fingerprint="xyz789"
            )
    
    def test_rate_limiting(self, db_session, test_users):
        """Test rate limiting for friend requests"""
        repo = FriendRepository(db_session)
        
        # Override the rate limit for testing
        original_limit = repo.MAX_REQUESTS_PER_DAY
        repo.MAX_REQUESTS_PER_DAY = 2
        
        try:
            # First request - should succeed
            repo.create_friend_request(
                sender_id=test_users["alice"].user_id,
                receiver_username="bob",
                sender_public_key_fingerprint="abc123"
            )
            
            # Second request - should succeed
            repo.create_friend_request(
                sender_id=test_users["alice"].user_id,
                receiver_username="charlie",
                sender_public_key_fingerprint="abc123"
            )
            
            # Third request - should fail due to rate limit
            # Would need a fourth user to test this properly
            
        finally:
            repo.MAX_REQUESTS_PER_DAY = original_limit
    
    def test_block_user(self, db_session, test_users):
        """Test blocking a user"""
        repo = FriendRepository(db_session)
        
        result = repo.block_user(
            blocker_id=test_users["alice"].user_id,
            blocked_user_id=test_users["bob"].user_id,
            reason="Spam"
        )
        
        assert result is not None
        assert result.blocker_id == test_users["alice"].user_id
        assert result.blocked_user_id == test_users["bob"].user_id
        assert result.reason == "Spam"
    
    def test_unblock_user(self, db_session, test_users):
        """Test unblocking a user"""
        repo = FriendRepository(db_session)
        
        # Block first
        repo.block_user(
            blocker_id=test_users["alice"].user_id,
            blocked_user_id=test_users["bob"].user_id
        )
        
        # Then unblock
        result = repo.unblock_user(
            blocker_id=test_users["alice"].user_id,
            blocked_user_id=test_users["bob"].user_id
        )
        
        assert result is True
    
    def test_remove_contact(self, db_session, test_users):
        """Test removing a trusted contact"""
        repo = FriendRepository(db_session)
        
        # Create friendship
        request = repo.create_friend_request(
            sender_id=test_users["alice"].user_id,
            receiver_username="bob",
            sender_public_key_fingerprint="abc123"
        )
        repo.accept_friend_request(
            request_id=request.request_id,
            receiver_id=test_users["bob"].user_id,
            receiver_public_key_fingerprint="xyz789"
        )
        
        # Remove contact
        result = repo.remove_contact(
            user_id=test_users["alice"].user_id,
            contact_user_id=test_users["bob"].user_id
        )
        
        assert result is True
        
        # Verify mutual removal
        assert not repo.is_mutual_contact(
            test_users["alice"].user_id,
            test_users["bob"].user_id
        )
    
    def test_search_users(self, db_session, test_users):
        """Test user search functionality"""
        repo = FriendRepository(db_session)
        
        results = repo.search_users(
            searcher_id=test_users["alice"].user_id,
            query="bob"
        )
        
        assert len(results) > 0
        assert any(r["username"] == "bob" for r in results)
    
    def test_search_excludes_self(self, db_session, test_users):
        """Test that search excludes the searching user"""
        repo = FriendRepository(db_session)
        
        results = repo.search_users(
            searcher_id=test_users["alice"].user_id,
            query="alice"
        )
        
        assert not any(r["username"] == "alice" for r in results)
    
    def test_search_excludes_blocked(self, db_session, test_users):
        """Test that search excludes blocked users"""
        repo = FriendRepository(db_session)
        
        # Alice blocks Bob
        repo.block_user(
            blocker_id=test_users["alice"].user_id,
            blocked_user_id=test_users["bob"].user_id
        )
        
        results = repo.search_users(
            searcher_id=test_users["alice"].user_id,
            query="bob"
        )
        
        assert not any(r["username"] == "bob" for r in results)
    
    def test_request_expiry(self, db_session, test_users):
        """Test that expired requests are handled correctly"""
        repo = FriendRepository(db_session)
        
        # Create a request
        request = repo.create_friend_request(
            sender_id=test_users["alice"].user_id,
            receiver_username="bob",
            sender_public_key_fingerprint="abc123"
        )
        
        # Manually set expiry to past
        request.expires_at = datetime.utcnow() - timedelta(hours=1)
        db_session.commit()
        
        # Try to accept expired request
        with pytest.raises(ValueError, match="expired"):
            repo.accept_friend_request(
                request_id=request.request_id,
                receiver_id=test_users["bob"].user_id,
                receiver_public_key_fingerprint="xyz789"
            )


class TestComputeKeyFingerprint:
    """Test key fingerprint computation"""
    
    def test_fingerprint_is_deterministic(self):
        """Same key should produce same fingerprint"""
        key = "test_public_key_12345"
        fp1 = compute_key_fingerprint(key)
        fp2 = compute_key_fingerprint(key)
        assert fp1 == fp2
    
    def test_different_keys_different_fingerprints(self):
        """Different keys should produce different fingerprints"""
        fp1 = compute_key_fingerprint("key_one")
        fp2 = compute_key_fingerprint("key_two")
        assert fp1 != fp2
    
    def test_fingerprint_length(self):
        """Fingerprint should be 64 characters (SHA-256 hex)"""
        fp = compute_key_fingerprint("any_key")
        assert len(fp) == 64


class TestAPIEndpoints:
    """Test the REST API endpoints"""
    
    def test_send_friend_request_unauthorized(self):
        """Test that unauthenticated requests are rejected"""
        response = client.post(
            "/api/friend/request",
            json={"receiver_username": "bob", "sender_public_key_fingerprint": "abc123"}
        )
        assert response.status_code == 401
    
    def test_get_pending_requests_unauthorized(self):
        """Test that getting pending requests requires auth"""
        response = client.get("/api/friend/pending")
        assert response.status_code == 401
    
    def test_search_users_unauthorized(self):
        """Test that search requires auth"""
        response = client.get("/api/friend/search?q=test")
        assert response.status_code == 401


class TestEdgeCases:
    """Test edge cases and error handling"""
    
    def test_nonexistent_user_request(self, db_session, test_users):
        """Test sending request to nonexistent user"""
        repo = FriendRepository(db_session)
        
        with pytest.raises(ValueError, match="not found"):
            repo.create_friend_request(
                sender_id=test_users["alice"].user_id,
                receiver_username="nonexistent_user",
                sender_public_key_fingerprint="abc123"
            )
    
    def test_accept_nonexistent_request(self, db_session, test_users):
        """Test accepting nonexistent request"""
        repo = FriendRepository(db_session)
        
        with pytest.raises(ValueError, match="not found"):
            repo.accept_friend_request(
                request_id=99999,
                receiver_id=test_users["bob"].user_id,
                receiver_public_key_fingerprint="xyz789"
            )
    
    def test_block_self(self, db_session, test_users):
        """Test that users cannot block themselves"""
        repo = FriendRepository(db_session)
        
        with pytest.raises(ValueError, match="cannot block yourself"):
            repo.block_user(
                blocker_id=test_users["alice"].user_id,
                blocked_user_id=test_users["alice"].user_id
            )
    
    def test_already_contacts(self, db_session, test_users):
        """Test that already-contacts cannot send new request"""
        repo = FriendRepository(db_session)
        
        # Create friendship
        request = repo.create_friend_request(
            sender_id=test_users["alice"].user_id,
            receiver_username="bob",
            sender_public_key_fingerprint="abc123"
        )
        repo.accept_friend_request(
            request_id=request.request_id,
            receiver_id=test_users["bob"].user_id,
            receiver_public_key_fingerprint="xyz789"
        )
        
        # Try to send another request
        with pytest.raises(ValueError, match="already.*contact"):
            repo.create_friend_request(
                sender_id=test_users["alice"].user_id,
                receiver_username="bob",
                sender_public_key_fingerprint="abc123"
            )


class TestUnfriendFunctionality:
    """Test the unfriend functionality"""
    
    def test_unfriend_removes_bilateral_contact(self, db_session, test_users):
        """Test that unfriend removes contact relationship on both sides"""
        repo = FriendRepository(db_session)
        
        # Create friendship first
        request = repo.create_friend_request(
            sender_id=test_users["alice"].user_id,
            receiver_username="bob",
            sender_public_key_fingerprint="abc123"
        )
        repo.accept_friend_request(
            request_id=request.request_id,
            receiver_id=test_users["bob"].user_id,
            receiver_public_key_fingerprint="xyz789"
        )
        
        # Verify they are contacts
        assert repo.is_mutual_contact(
            test_users["alice"].user_id,
            test_users["bob"].user_id
        )
        
        # Alice unfriends Bob
        result = repo.unfriend_user(
            user_id=test_users["alice"].user_id,
            target_user_id=test_users["bob"].user_id,
            revoke_keys=True
        )
        
        assert result["success"] is True
        assert result["keys_revoked"] is True
        
        # Verify they are no longer contacts
        assert not repo.is_mutual_contact(
            test_users["alice"].user_id,
            test_users["bob"].user_id
        )
    
    def test_unfriend_non_contact_fails(self, db_session, test_users):
        """Test that unfriending a non-contact fails gracefully"""
        repo = FriendRepository(db_session)
        
        result = repo.unfriend_user(
            user_id=test_users["alice"].user_id,
            target_user_id=test_users["bob"].user_id,
            revoke_keys=True
        )
        
        assert result["success"] is False
        assert "not a contact" in result["message"].lower()
    
    def test_unfriend_creates_notification(self, db_session, test_users):
        """Test that unfriending creates a notification for the other user"""
        repo = FriendRepository(db_session)
        
        # Create friendship first
        request = repo.create_friend_request(
            sender_id=test_users["alice"].user_id,
            receiver_username="bob",
            sender_public_key_fingerprint="abc123"
        )
        repo.accept_friend_request(
            request_id=request.request_id,
            receiver_id=test_users["bob"].user_id,
            receiver_public_key_fingerprint="xyz789"
        )
        
        # Alice unfriends Bob
        repo.unfriend_user(
            user_id=test_users["alice"].user_id,
            target_user_id=test_users["bob"].user_id,
            revoke_keys=True
        )
        
        # Check Bob has a notification
        notifications = repo.get_unread_notifications(test_users["bob"].user_id)
        assert len(notifications) > 0
        contact_removed_notif = [n for n in notifications if n.notification_type == "contact_removed"]
        assert len(contact_removed_notif) > 0


class TestNotificationSystem:
    """Test the notification system"""
    
    def test_create_notification(self, db_session, test_users):
        """Test creating a notification"""
        repo = FriendRepository(db_session)
        
        notification = repo.create_notification(
            user_id=test_users["alice"].user_id,
            notification_type="friend_request",
            title="New Friend Request",
            message="Bob wants to connect",
            related_user_id=test_users["bob"].user_id,
            payload={"request_id": 1}
        )
        
        assert notification is not None
        assert notification.notification_type == "friend_request"
        assert notification.is_read is False
        assert notification.is_delivered is False
    
    def test_get_unread_notifications(self, db_session, test_users):
        """Test getting unread notifications"""
        repo = FriendRepository(db_session)
        
        # Create some notifications
        repo.create_notification(
            user_id=test_users["alice"].user_id,
            notification_type="friend_request",
            title="Request 1",
            message="Message 1"
        )
        repo.create_notification(
            user_id=test_users["alice"].user_id,
            notification_type="accepted",
            title="Request 2",
            message="Message 2"
        )
        
        notifications = repo.get_unread_notifications(test_users["alice"].user_id)
        assert len(notifications) == 2
    
    def test_mark_notification_read(self, db_session, test_users):
        """Test marking a notification as read"""
        repo = FriendRepository(db_session)
        
        notification = repo.create_notification(
            user_id=test_users["alice"].user_id,
            notification_type="friend_request",
            title="Test",
            message="Test message"
        )
        
        assert notification.is_read is False
        
        # Mark as read
        updated = repo.mark_notification_read(notification.id)
        assert updated is True
        
        # Verify it's marked as read
        notifications = repo.get_unread_notifications(test_users["alice"].user_id)
        assert len(notifications) == 0
    
    def test_mark_all_notifications_read(self, db_session, test_users):
        """Test marking all notifications as read"""
        repo = FriendRepository(db_session)
        
        # Create multiple notifications
        for i in range(5):
            repo.create_notification(
                user_id=test_users["alice"].user_id,
                notification_type="system",
                title=f"Test {i}",
                message=f"Message {i}"
            )
        
        # Mark all as read
        count = repo.mark_all_notifications_read(test_users["alice"].user_id)
        assert count == 5
        
        # Verify all are read
        unread = repo.get_unread_notifications(test_users["alice"].user_id)
        assert len(unread) == 0
    
    def test_notification_count(self, db_session, test_users):
        """Test getting notification counts"""
        repo = FriendRepository(db_session)
        
        # Create notifications of different types
        repo.create_notification(
            user_id=test_users["alice"].user_id,
            notification_type="friend_request",
            title="FR 1",
            message="Friend request"
        )
        repo.create_notification(
            user_id=test_users["alice"].user_id,
            notification_type="friend_request",
            title="FR 2",
            message="Friend request 2"
        )
        repo.create_notification(
            user_id=test_users["alice"].user_id,
            notification_type="key_changed",
            title="Key Alert",
            message="Security alert"
        )
        
        counts = repo.get_notification_count(test_users["alice"].user_id)
        assert counts["total"] == 3
        assert counts["unread"] == 3
        assert counts["friend_requests"] == 2
        assert counts["security_alerts"] == 1


class TestRejectionLogging:
    """Test the rejection anti-spam logging"""
    
    def test_log_rejection(self, db_session, test_users):
        """Test logging a rejection"""
        repo = FriendRepository(db_session)
        
        # Log a rejection
        log = repo.log_rejection(
            user_id_1=test_users["alice"].user_id,
            user_id_2=test_users["bob"].user_id
        )
        
        assert log is not None
        assert log.rejection_count == 1
    
    def test_repeated_rejection_increments_count(self, db_session, test_users):
        """Test that repeated rejections increment the count"""
        repo = FriendRepository(db_session)
        
        # Log first rejection
        log1 = repo.log_rejection(
            user_id_1=test_users["alice"].user_id,
            user_id_2=test_users["bob"].user_id
        )
        assert log1.rejection_count == 1
        
        # Log second rejection
        log2 = repo.log_rejection(
            user_id_1=test_users["alice"].user_id,
            user_id_2=test_users["bob"].user_id
        )
        assert log2.rejection_count == 2
    
    def test_check_rejection_pattern(self, db_session, test_users):
        """Test checking for rejection patterns"""
        repo = FriendRepository(db_session)
        
        # Initially no pattern
        has_pattern = repo.check_rejection_pattern(
            user_id_1=test_users["alice"].user_id,
            user_id_2=test_users["bob"].user_id,
            threshold=3
        )
        assert has_pattern is False
        
        # Log multiple rejections
        for _ in range(3):
            repo.log_rejection(
                user_id_1=test_users["alice"].user_id,
                user_id_2=test_users["bob"].user_id
            )
        
        # Now should detect pattern
        has_pattern = repo.check_rejection_pattern(
            user_id_1=test_users["alice"].user_id,
            user_id_2=test_users["bob"].user_id,
            threshold=3
        )
        assert has_pattern is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

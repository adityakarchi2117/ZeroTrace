"""
CipherLink Key Service
Handles cryptographic key operations for E2E encryption
"""

from sqlalchemy.orm import Session
from app.db.user_repo import UserRepository
from app.db.database import User, OneTimePreKey
from typing import Optional, Dict


class KeyService:
    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)
    
    def store_public_key(self, user_id: int, public_key: str):
        """Store or update user's public key (legacy RSA)."""
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        
        self.user_repo.update_public_key(user_id, public_key)
        return True
    
    def get_public_key(self, username: str) -> Optional[Dict]:
        """Get public key for a specific user."""
        user = self.user_repo.get_by_username(username)
        if not user or not user.public_key:
            return None
        
        return {
            "user_id": user.id,
            "username": user.username,
            "public_key": user.public_key,
            "identity_key": user.identity_key
        }
    
    def store_identity_keys(
        self,
        user_id: int,
        identity_key: str,
        signed_prekey: str,
        signed_prekey_signature: str
    ):
        """Store user's identity keys for Signal Protocol."""
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("User not found")
        
        user.identity_key = identity_key
        user.signed_prekey = signed_prekey
        user.signed_prekey_signature = signed_prekey_signature
        
        from datetime import datetime, timezone
        user.signed_prekey_timestamp = datetime.now(timezone.utc)
        
        self.db.commit()
        return True
    
    def get_key_bundle(self, username: str) -> Optional[Dict]:
        """Get complete key bundle for X3DH key exchange."""
        user = self.user_repo.get_by_username(username)
        if not user:
            return None
        
        if not user.identity_key or not user.signed_prekey:
            return None
        
        # Get one available one-time prekey
        one_time_prekey = self.db.query(OneTimePreKey).filter(
            OneTimePreKey.user_id == user.id,
            OneTimePreKey.is_used == False
        ).first()
        
        bundle = {
            "user_id": user.id,
            "username": user.username,
            "identity_key": user.identity_key,
            "signed_prekey": user.signed_prekey,
            "signed_prekey_signature": user.signed_prekey_signature,
            "one_time_prekey": None
        }
        
        if one_time_prekey:
            bundle["one_time_prekey"] = one_time_prekey.public_key
            bundle["one_time_prekey_id"] = one_time_prekey.key_id
        
        return bundle
    
    def consume_one_time_prekey(self, user_id: int, key_id: int) -> Optional[str]:
        """Mark a one-time prekey as used and return it."""
        prekey = self.db.query(OneTimePreKey).filter(
            OneTimePreKey.user_id == user_id,
            OneTimePreKey.key_id == key_id,
            OneTimePreKey.is_used == False
        ).first()
        
        if not prekey:
            return None
        
        prekey.is_used = True
        from datetime import datetime, timezone
        prekey.used_at = datetime.now(timezone.utc)
        
        self.db.commit()
        return prekey.public_key
    
    def get_prekey_count(self, user_id: int) -> int:
        """Get count of available one-time prekeys."""
        return self.db.query(OneTimePreKey).filter(
            OneTimePreKey.user_id == user_id,
            OneTimePreKey.is_used == False
        ).count()
    
    def add_one_time_prekeys(self, user_id: int, prekeys: list):
        """Add new one-time prekeys for a user."""
        # Get max existing key_id
        max_key = self.db.query(OneTimePreKey.key_id).filter(
            OneTimePreKey.user_id == user_id
        ).order_by(OneTimePreKey.key_id.desc()).first()
        
        start_id = (max_key[0] + 1) if max_key else 0
        
        for idx, pk in enumerate(prekeys):
            prekey = OneTimePreKey(
                user_id=user_id,
                key_id=start_id + idx,
                public_key=pk
            )
            self.db.add(prekey)
        
        self.db.commit()
        return len(prekeys)
    
    def rotate_signed_prekey(
        self,
        user_id: int,
        new_signed_prekey: str,
        new_signature: str
    ):
        """Rotate the signed prekey (recommended weekly)."""
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("User not found")
        
        user.signed_prekey = new_signed_prekey
        user.signed_prekey_signature = new_signature
        
        from datetime import datetime, timezone
        user.signed_prekey_timestamp = datetime.now(timezone.utc)
        
        self.db.commit()
        return True
    
    def delete_public_key(self, user_id: int):
        """Delete user's public key."""
        self.user_repo.update_public_key(user_id, None)
        return True

"""
ZeroTrace Cryptographic Utilities
Zero-knowledge server-side crypto operations

Note: All actual encryption/decryption happens client-side.
Server only handles key storage and verification.
"""

import os
import base64
import hashlib
import hmac
import secrets
from typing import Tuple, Optional
from datetime import datetime, timedelta

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import x25519, ed25519
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.backends import default_backend
from cryptography.exceptions import InvalidSignature


class CryptoUtils:
    """Server-side cryptographic utilities for ZeroTrace"""
    
    # Key derivation info strings
    KDF_INFO_SESSION = b"ZeroTrace Session Key v1"
    KDF_INFO_CHAIN = b"ZeroTrace Chain Key v1"
    
    @staticmethod
    def generate_random_bytes(length: int = 32) -> bytes:
        """Generate cryptographically secure random bytes"""
        return secrets.token_bytes(length)
    
    @staticmethod
    def generate_session_id() -> str:
        """Generate unique session ID"""
        return secrets.token_urlsafe(32)
    
    @staticmethod
    def hash_data(data: bytes) -> str:
        """SHA-256 hash of data, returned as hex string"""
        return hashlib.sha256(data).hexdigest()
    
    @staticmethod
    def hash_public_key(public_key: str) -> str:
        """Generate fingerprint of a public key for verification"""
        key_bytes = base64.b64decode(public_key)
        return hashlib.sha256(key_bytes).hexdigest()[:16].upper()
    
    @staticmethod
    def verify_signature(
        public_key_base64: str,
        signature_base64: str,
        message: bytes
    ) -> bool:
        """
        Verify Ed25519 signature
        Used for verifying signed pre-keys
        """
        try:
            public_key_bytes = base64.b64decode(public_key_base64)
            signature_bytes = base64.b64decode(signature_base64)
            
            public_key = ed25519.Ed25519PublicKey.from_public_bytes(public_key_bytes)
            public_key.verify(signature_bytes, message)
            return True
        except (InvalidSignature, Exception):
            return False
    
    @staticmethod
    def constant_time_compare(a: bytes, b: bytes) -> bool:
        """Constant-time comparison to prevent timing attacks"""
        return hmac.compare_digest(a, b)
    
    @staticmethod
    def derive_key_fingerprint(identity_key: str, device_id: str) -> str:
        """
        Derive a unique fingerprint for identity verification
        Used for safety number verification between users
        """
        combined = f"{identity_key}:{device_id}".encode()
        full_hash = hashlib.sha256(combined).hexdigest()
        
        # Format as groups for easy comparison (like Signal)
        fingerprint = " ".join([
            full_hash[i:i+5] for i in range(0, 30, 5)
        ])
        return fingerprint.upper()


class QRCodeGenerator:
    """Generate QR codes for device pairing"""
    
    @staticmethod
    def generate_pairing_data(
        session_id: str,
        user_id: int,
        identity_key: str,
        expires_minutes: int = 5
    ) -> dict:
        """
        Generate data for QR code pairing
        
        Returns dict with:
        - session_id: Unique session identifier
        - user_id: User requesting pairing
        - identity_fingerprint: For verification
        - expires_at: Expiration timestamp
        - challenge: Random challenge for signing
        """
        challenge = CryptoUtils.generate_random_bytes(16)
        expires_at = datetime.utcnow() + timedelta(minutes=expires_minutes)
        
        return {
            "session_id": session_id,
            "user_id": user_id,
            "identity_fingerprint": CryptoUtils.hash_public_key(identity_key)[:8],
            "expires_at": expires_at.isoformat(),
            "challenge": base64.b64encode(challenge).decode()
        }
    
    @staticmethod
    def verify_pairing_response(
        expected_session_id: str,
        response_session_id: str,
        challenge: str,
        signature: str,
        public_key: str
    ) -> bool:
        """Verify QR code pairing response from mobile device"""
        if expected_session_id != response_session_id:
            return False
        
        challenge_bytes = base64.b64decode(challenge)
        return CryptoUtils.verify_signature(public_key, signature, challenge_bytes)


class KeyValidation:
    """Validate cryptographic keys"""
    
    # Expected key lengths in bytes when base64 decoded
    X25519_PUBLIC_KEY_LENGTH = 32
    ED25519_PUBLIC_KEY_LENGTH = 32
    ED25519_SIGNATURE_LENGTH = 64
    
    @staticmethod
    def validate_x25519_public_key(key_base64: str) -> bool:
        """Validate X25519 public key format"""
        try:
            key_bytes = base64.b64decode(key_base64)
            if len(key_bytes) != KeyValidation.X25519_PUBLIC_KEY_LENGTH:
                return False
            # Try to load as X25519 public key
            x25519.X25519PublicKey.from_public_bytes(key_bytes)
            return True
        except Exception:
            return False
    
    @staticmethod
    def validate_ed25519_public_key(key_base64: str) -> bool:
        """Validate Ed25519 public key format"""
        try:
            key_bytes = base64.b64decode(key_base64)
            if len(key_bytes) != KeyValidation.ED25519_PUBLIC_KEY_LENGTH:
                return False
            ed25519.Ed25519PublicKey.from_public_bytes(key_bytes)
            return True
        except Exception:
            return False
    
    @staticmethod
    def validate_signed_prekey(
        signed_prekey_base64: str,
        signature_base64: str,
        identity_key_base64: str
    ) -> bool:
        """
        Validate signed pre-key signature
        Pre-key should be signed by the identity key
        """
        prekey_bytes = base64.b64decode(signed_prekey_base64)
        return CryptoUtils.verify_signature(
            identity_key_base64,
            signature_base64,
            prekey_bytes
        )
    
    @staticmethod
    def validate_key_bundle(
        identity_key: str,
        signed_prekey: str,
        signed_prekey_signature: str,
        one_time_prekeys: list
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate complete key bundle
        Returns (is_valid, error_message)
        """
        # Validate identity key (Ed25519)
        if not KeyValidation.validate_ed25519_public_key(identity_key):
            return False, "Invalid identity key format"
        
        # Validate signed pre-key (X25519)
        if not KeyValidation.validate_x25519_public_key(signed_prekey):
            return False, "Invalid signed pre-key format"
        
        # Validate pre-key signature
        if not KeyValidation.validate_signed_prekey(
            signed_prekey, signed_prekey_signature, identity_key
        ):
            return False, "Invalid signed pre-key signature"
        
        # Validate one-time pre-keys (X25519)
        for i, otpk in enumerate(one_time_prekeys):
            if not KeyValidation.validate_x25519_public_key(otpk):
                return False, f"Invalid one-time pre-key at index {i}"
        
        return True, None


class RateLimiter:
    """Simple in-memory rate limiter for key operations"""
    
    def __init__(self):
        self._attempts: dict = {}
    
    def check_rate_limit(
        self,
        identifier: str,
        max_attempts: int = 5,
        window_seconds: int = 60
    ) -> bool:
        """
        Check if identifier is within rate limit
        Returns True if allowed, False if rate limited
        """
        now = datetime.utcnow()
        
        if identifier not in self._attempts:
            self._attempts[identifier] = []
        
        # Clean old attempts
        cutoff = now - timedelta(seconds=window_seconds)
        self._attempts[identifier] = [
            t for t in self._attempts[identifier] if t > cutoff
        ]
        
        # Check limit
        if len(self._attempts[identifier]) >= max_attempts:
            return False
        
        # Record attempt
        self._attempts[identifier].append(now)
        return True
    
    def reset(self, identifier: str):
        """Reset rate limit for identifier"""
        if identifier in self._attempts:
            del self._attempts[identifier]


# Global rate limiter instance
key_operation_limiter = RateLimiter()

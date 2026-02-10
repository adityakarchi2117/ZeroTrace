"""
Device Sync Repository

CRUD operations for multi-device pairing, per-device DEK wrapping,
session key storage, device authorization, and revocation.
"""

import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List

from sqlalchemy.orm import Session
from sqlalchemy import desc, and_

from app.db.device_sync_models import (
    DevicePairingSession,
    DeviceWrappedDEK,
    DeviceAuthorization,
    EncryptedSessionKey,
    DeviceRevocationLog,
)


class DeviceSyncRepository:
    """Repository for all multi-device sync operations."""

    def __init__(self, db: Session):
        self.db = db

    # ==================== Device Pairing ====================

    def create_pairing_session(
        self,
        user_id: int,
        initiator_device_id: str,
        initiator_ip: str = None,
        ttl_minutes: int = 5,
    ) -> DevicePairingSession:
        """
        Create a new pairing session.
        Returns a session with a unique token for QR display.
        """
        # Expire any old pending sessions for this user
        self.db.query(DevicePairingSession).filter(
            DevicePairingSession.user_id == user_id,
            DevicePairingSession.status == "pending",
        ).update({"status": "expired"})

        token = secrets.token_urlsafe(48)
        challenge = secrets.token_urlsafe(32)

        session = DevicePairingSession(
            user_id=user_id,
            pairing_token=token,
            challenge=challenge,
            status="pending",
            initiator_device_id=initiator_device_id,
            initiator_ip=initiator_ip,
            expires_at=datetime.utcnow() + timedelta(minutes=ttl_minutes),
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def get_pairing_session(self, pairing_token: str) -> Optional[DevicePairingSession]:
        """Get a pairing session by token."""
        return (
            self.db.query(DevicePairingSession)
            .filter(DevicePairingSession.pairing_token == pairing_token)
            .first()
        )

    def scan_pairing_session(
        self,
        pairing_token: str,
        new_device_id: str,
        new_device_name: str,
        new_device_type: str,
        new_device_public_key: str,
    ) -> Optional[DevicePairingSession]:
        """
        Mark a pairing session as scanned by the new device.
        Stores the new device's public key for DEK re-wrapping.
        """
        session = self.get_pairing_session(pairing_token)
        if not session:
            return None
        if session.status != "pending":
            return None
        if session.expires_at < datetime.utcnow():
            session.status = "expired"
            self.db.commit()
            return None

        # Compute device fingerprint
        fingerprint = hashlib.sha256(
            new_device_public_key.encode("utf-8")
        ).hexdigest()[:16]

        session.status = "scanned"
        session.new_device_id = new_device_id
        session.new_device_name = new_device_name
        session.new_device_type = new_device_type
        session.new_device_public_key = new_device_public_key
        session.new_device_fingerprint = fingerprint
        session.scanned_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(session)
        return session

    def approve_pairing(
        self,
        pairing_token: str,
        user_id: int,
        wrapped_dek_for_device: str,
        dek_wrap_nonce: str,
    ) -> Optional[DevicePairingSession]:
        """
        Approve a scanned pairing session.
        The existing device re-wraps the DEK for the new device's public key
        and sends it here.
        """
        session = self.get_pairing_session(pairing_token)
        if not session or session.user_id != user_id:
            return None
        if session.status != "scanned":
            return None

        session.status = "approved"
        session.wrapped_dek_for_device = wrapped_dek_for_device
        session.dek_wrap_nonce = dek_wrap_nonce
        session.approved_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(session)
        return session

    def complete_pairing(
        self,
        pairing_token: str,
        user_id: int,
    ) -> Optional[DevicePairingSession]:
        """Mark pairing as completed (new device has received DEK)."""
        session = self.get_pairing_session(pairing_token)
        if not session or session.user_id != user_id:
            return None
        if session.status != "approved":
            return None

        session.status = "completed"
        session.completed_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(session)
        return session

    def reject_pairing(self, pairing_token: str, user_id: int) -> bool:
        """Reject a pairing request."""
        session = self.get_pairing_session(pairing_token)
        if not session or session.user_id != user_id:
            return False

        session.status = "rejected"
        self.db.commit()
        return True

    def get_pending_pairing(self, user_id: int) -> Optional[DevicePairingSession]:
        """Get any pending/scanned (not yet approved) pairing for a user."""
        return (
            self.db.query(DevicePairingSession)
            .filter(
                DevicePairingSession.user_id == user_id,
                DevicePairingSession.status.in_(["pending", "scanned"]),
                DevicePairingSession.expires_at > datetime.utcnow(),
            )
            .order_by(desc(DevicePairingSession.created_at))
            .first()
        )

    # ==================== Per-Device Wrapped DEK ====================

    def store_device_wrapped_dek(
        self,
        user_id: int,
        device_id: str,
        wrapped_dek: str,
        wrap_nonce: str,
        dek_version: int,
    ) -> DeviceWrappedDEK:
        """Store a DEK wrapped for a specific device."""
        # Deactivate any prior entry for this device + version
        self.db.query(DeviceWrappedDEK).filter(
            DeviceWrappedDEK.user_id == user_id,
            DeviceWrappedDEK.device_id == device_id,
            DeviceWrappedDEK.is_active == True,
        ).update({"is_active": False})

        entry = DeviceWrappedDEK(
            user_id=user_id,
            device_id=device_id,
            wrapped_dek=wrapped_dek,
            wrap_nonce=wrap_nonce,
            dek_version=dek_version,
            is_active=True,
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def get_device_wrapped_dek(
        self, user_id: int, device_id: str
    ) -> Optional[DeviceWrappedDEK]:
        """Get the active wrapped DEK for a specific device."""
        return (
            self.db.query(DeviceWrappedDEK)
            .filter(
                DeviceWrappedDEK.user_id == user_id,
                DeviceWrappedDEK.device_id == device_id,
                DeviceWrappedDEK.is_active == True,
            )
            .first()
        )

    def revoke_device_dek(self, user_id: int, device_id: str) -> int:
        """Revoke all wrapped DEKs for a device. Returns count revoked."""
        count = (
            self.db.query(DeviceWrappedDEK)
            .filter(
                DeviceWrappedDEK.user_id == user_id,
                DeviceWrappedDEK.device_id == device_id,
                DeviceWrappedDEK.is_active == True,
            )
            .update({"is_active": False, "revoked_at": datetime.utcnow()})
        )
        self.db.commit()
        return count

    def get_all_device_deks(self, user_id: int) -> List[DeviceWrappedDEK]:
        """Get all active device-wrapped DEKs."""
        return (
            self.db.query(DeviceWrappedDEK)
            .filter(
                DeviceWrappedDEK.user_id == user_id,
                DeviceWrappedDEK.is_active == True,
            )
            .all()
        )

    # ==================== Device Authorization ====================

    def authorize_device(
        self,
        user_id: int,
        device_id: str,
        device_public_key: str,
        device_name: str = None,
        device_type: str = "web",
        is_primary: bool = False,
        ip_address: str = None,
    ) -> DeviceAuthorization:
        """Register an authorized device."""
        fingerprint = hashlib.sha256(
            device_public_key.encode("utf-8")
        ).hexdigest()[:16]

        # Upsert
        existing = (
            self.db.query(DeviceAuthorization)
            .filter(
                DeviceAuthorization.user_id == user_id,
                DeviceAuthorization.device_id == device_id,
            )
            .first()
        )

        if existing:
            existing.device_public_key = device_public_key
            existing.device_fingerprint = fingerprint
            existing.device_name = device_name or existing.device_name
            existing.device_type = device_type
            existing.is_active = True
            existing.revoked_at = None
            existing.revoke_reason = None
            existing.last_verified_at = datetime.utcnow()
            existing.last_ip = ip_address
            self.db.commit()
            self.db.refresh(existing)
            return existing

        auth = DeviceAuthorization(
            user_id=user_id,
            device_id=device_id,
            device_public_key=device_public_key,
            device_fingerprint=fingerprint,
            device_name=device_name,
            device_type=device_type,
            is_primary=is_primary,
            last_ip=ip_address,
        )
        self.db.add(auth)
        self.db.commit()
        self.db.refresh(auth)
        return auth

    def get_authorized_devices(self, user_id: int) -> List[DeviceAuthorization]:
        """List all active authorized devices for a user."""
        return (
            self.db.query(DeviceAuthorization)
            .filter(
                DeviceAuthorization.user_id == user_id,
                DeviceAuthorization.is_active == True,
            )
            .order_by(desc(DeviceAuthorization.authorized_at))
            .all()
        )

    def revoke_device(
        self,
        user_id: int,
        device_id: str,
        reason: str = None,
    ) -> Optional[DeviceAuthorization]:
        """Revoke a device authorization."""
        auth = (
            self.db.query(DeviceAuthorization)
            .filter(
                DeviceAuthorization.user_id == user_id,
                DeviceAuthorization.device_id == device_id,
                DeviceAuthorization.is_active == True,
            )
            .first()
        )
        if not auth:
            return None

        auth.is_active = False
        auth.revoked_at = datetime.utcnow()
        auth.revoke_reason = reason

        # Also revoke the device's wrapped DEK
        self.revoke_device_dek(user_id, device_id)

        self.db.commit()
        self.db.refresh(auth)
        return auth

    def is_device_authorized(self, user_id: int, device_id: str) -> bool:
        """Check if a device is authorized."""
        return (
            self.db.query(DeviceAuthorization)
            .filter(
                DeviceAuthorization.user_id == user_id,
                DeviceAuthorization.device_id == device_id,
                DeviceAuthorization.is_active == True,
            )
            .count()
            > 0
        )

    def get_device(self, user_id: int, device_id: str) -> Optional[DeviceAuthorization]:
        """Get a specific device authorization."""
        return (
            self.db.query(DeviceAuthorization)
            .filter(
                DeviceAuthorization.user_id == user_id,
                DeviceAuthorization.device_id == device_id,
            )
            .first()
        )

    # ==================== Session Key Operations ====================

    def store_session_key(
        self,
        user_id: int,
        conversation_id: str,
        wrapped_session_key: str,
        session_key_nonce: str,
        dek_version: int,
        key_version: int = 1,
        first_message_id: int = None,
    ) -> EncryptedSessionKey:
        """Store a session key wrapped with the DEK."""
        # Deactivate old active keys for this conversation
        self.db.query(EncryptedSessionKey).filter(
            EncryptedSessionKey.user_id == user_id,
            EncryptedSessionKey.conversation_id == conversation_id,
            EncryptedSessionKey.is_active == True,
        ).update({"is_active": False, "rotated_at": datetime.utcnow()})

        sk = EncryptedSessionKey(
            user_id=user_id,
            conversation_id=conversation_id,
            wrapped_session_key=wrapped_session_key,
            session_key_nonce=session_key_nonce,
            dek_version=dek_version,
            key_version=key_version,
            is_active=True,
            first_message_id=first_message_id,
        )
        self.db.add(sk)
        self.db.commit()
        self.db.refresh(sk)
        return sk

    def get_active_session_key(
        self, user_id: int, conversation_id: str
    ) -> Optional[EncryptedSessionKey]:
        """Get the active session key for a conversation."""
        return (
            self.db.query(EncryptedSessionKey)
            .filter(
                EncryptedSessionKey.user_id == user_id,
                EncryptedSessionKey.conversation_id == conversation_id,
                EncryptedSessionKey.is_active == True,
            )
            .first()
        )

    def get_session_keys_for_conversation(
        self, user_id: int, conversation_id: str
    ) -> List[EncryptedSessionKey]:
        """Get all session keys for a conversation (including rotated ones for history)."""
        return (
            self.db.query(EncryptedSessionKey)
            .filter(
                EncryptedSessionKey.user_id == user_id,
                EncryptedSessionKey.conversation_id == conversation_id,
            )
            .order_by(desc(EncryptedSessionKey.key_version))
            .all()
        )

    def get_all_session_keys(self, user_id: int) -> List[EncryptedSessionKey]:
        """Get all session keys for a user (all conversations)."""
        return (
            self.db.query(EncryptedSessionKey)
            .filter(EncryptedSessionKey.user_id == user_id)
            .order_by(desc(EncryptedSessionKey.created_at))
            .all()
        )

    def update_session_key_range(
        self,
        session_key_id: int,
        last_message_id: int,
        message_count: int,
    ) -> None:
        """Update the message range of a session key."""
        self.db.query(EncryptedSessionKey).filter(
            EncryptedSessionKey.id == session_key_id
        ).update({
            "last_message_id": last_message_id,
            "message_count": message_count,
        })
        self.db.commit()

    def rewrap_session_keys_for_dek(
        self,
        user_id: int,
        old_dek_version: int,
        new_dek_version: int,
        rewrapped_keys: List[dict],
    ) -> int:
        """
        Batch update session keys re-wrapped with a new DEK.

        Each entry in rewrapped_keys:
          {"id": <sk_id>, "wrapped_session_key": "...", "session_key_nonce": "..."}
        """
        count = 0
        for rk in rewrapped_keys:
            updated = (
                self.db.query(EncryptedSessionKey)
                .filter(
                    EncryptedSessionKey.id == rk["id"],
                    EncryptedSessionKey.user_id == user_id,
                    EncryptedSessionKey.dek_version == old_dek_version,
                )
                .update({
                    "wrapped_session_key": rk["wrapped_session_key"],
                    "session_key_nonce": rk["session_key_nonce"],
                    "dek_version": new_dek_version,
                })
            )
            count += updated
        self.db.commit()
        return count

    # ==================== Revocation Log ====================

    def log_revocation(
        self,
        user_id: int,
        revoked_device_id: str,
        revoked_device_name: str = None,
        revoked_by_device_id: str = None,
        reason: str = None,
        dek_rotated: bool = False,
        old_dek_version: int = None,
        new_dek_version: int = None,
        ip_address: str = None,
    ) -> DeviceRevocationLog:
        """Log a device revocation event."""
        log = DeviceRevocationLog(
            user_id=user_id,
            revoked_device_id=revoked_device_id,
            revoked_device_name=revoked_device_name,
            revoked_by_device_id=revoked_by_device_id,
            reason=reason,
            dek_rotated=dek_rotated,
            old_dek_version=old_dek_version,
            new_dek_version=new_dek_version,
            ip_address=ip_address,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    def get_revocation_history(
        self, user_id: int, limit: int = 50
    ) -> List[DeviceRevocationLog]:
        """Get device revocation history."""
        return (
            self.db.query(DeviceRevocationLog)
            .filter(DeviceRevocationLog.user_id == user_id)
            .order_by(desc(DeviceRevocationLog.created_at))
            .limit(limit)
            .all()
        )

"""
Secure Profile Repository

Database operations for the encrypted profile persistence system.
Handles DEKs, encrypted profiles, encrypted pictures, metadata, backups, and key rotation logs.
"""

import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional, List, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.secure_profile_models import (
    DataEncryptionKey,
    EncryptedProfile,
    EncryptedProfilePicture,
    EncryptedMessageMetadata,
    EncryptedBackup,
    KeyRotationLog,
)


class SecureProfileRepository:
    """Repository for all secure profile CRUD operations."""

    def __init__(self, db: Session):
        self.db = db

    # ==================== DEK Operations ====================

    def store_dek(
        self,
        user_id: int,
        wrapped_dek: str,
        nonce: str,
        dek_algorithm: str = "x25519-xsalsa20-poly1305",
        dek_version: int = 1,
    ) -> DataEncryptionKey:
        """Store a new wrapped DEK. Deactivates any previous active DEK."""
        # Deactivate all current DEKs for user
        self.db.query(DataEncryptionKey).filter(
            DataEncryptionKey.user_id == user_id,
            DataEncryptionKey.is_active == True,
        ).update({"is_active": False})

        dek = DataEncryptionKey(
            user_id=user_id,
            wrapped_dek=wrapped_dek,
            nonce=nonce,
            dek_algorithm=dek_algorithm,
            dek_version=dek_version,
            is_active=True,
        )
        self.db.add(dek)
        self.db.commit()
        self.db.refresh(dek)
        return dek

    def get_active_dek(self, user_id: int) -> Optional[DataEncryptionKey]:
        """Get the currently active DEK for a user."""
        return (
            self.db.query(DataEncryptionKey)
            .filter(
                DataEncryptionKey.user_id == user_id,
                DataEncryptionKey.is_active == True,
            )
            .first()
        )

    def get_dek_by_version(self, user_id: int, version: int) -> Optional[DataEncryptionKey]:
        """Get a specific DEK version (for decrypting old data)."""
        return (
            self.db.query(DataEncryptionKey)
            .filter(
                DataEncryptionKey.user_id == user_id,
                DataEncryptionKey.dek_version == version,
            )
            .first()
        )

    def get_all_deks(self, user_id: int) -> List[DataEncryptionKey]:
        """Get all DEK versions for a user."""
        return (
            self.db.query(DataEncryptionKey)
            .filter(DataEncryptionKey.user_id == user_id)
            .order_by(desc(DataEncryptionKey.dek_version))
            .all()
        )

    def rotate_dek(
        self,
        user_id: int,
        new_wrapped_dek: str,
        new_nonce: str,
        old_dek_version: int,
    ) -> DataEncryptionKey:
        """
        Re-wrap the DEK with a new identity key.
        
        The DEK itself doesn't change — only its wrapping.
        This means all encrypted data remains accessible.
        """
        current = self.get_active_dek(user_id)
        if current and current.dek_version != old_dek_version:
            raise ValueError(
                f"DEK version mismatch: expected {current.dek_version}, got {old_dek_version}"
            )

        new_version = (current.dek_version if current else 0) + 1

        # Deactivate current
        if current:
            current.is_active = False
            current.rotated_at = datetime.now(timezone.utc)

        # Store new wrapped DEK
        new_dek = DataEncryptionKey(
            user_id=user_id,
            wrapped_dek=new_wrapped_dek,
            nonce=new_nonce,
            dek_algorithm=current.dek_algorithm if current else "x25519-xsalsa20-poly1305",
            dek_version=new_version,
            is_active=True,
        )
        self.db.add(new_dek)
        self.db.commit()
        self.db.refresh(new_dek)
        return new_dek

    # ==================== Encrypted Profile Operations ====================

    def store_encrypted_profile(
        self,
        user_id: int,
        encrypted_blob: str,
        blob_nonce: str,
        dek_version: int,
        content_hash: str,
    ) -> EncryptedProfile:
        """Store or update encrypted profile blob. Increments version."""
        existing = (
            self.db.query(EncryptedProfile)
            .filter(EncryptedProfile.user_id == user_id)
            .order_by(desc(EncryptedProfile.version))
            .first()
        )

        new_version = (existing.version + 1) if existing else 1

        profile = EncryptedProfile(
            user_id=user_id,
            encrypted_blob=encrypted_blob,
            blob_nonce=blob_nonce,
            dek_version=dek_version,
            content_hash=content_hash,
            version=new_version,
        )
        self.db.add(profile)
        self.db.commit()
        self.db.refresh(profile)
        return profile

    def get_latest_encrypted_profile(self, user_id: int) -> Optional[EncryptedProfile]:
        """Get the latest encrypted profile for a user."""
        return (
            self.db.query(EncryptedProfile)
            .filter(EncryptedProfile.user_id == user_id)
            .order_by(desc(EncryptedProfile.version))
            .first()
        )

    def get_encrypted_profile_version(
        self, user_id: int, version: int
    ) -> Optional[EncryptedProfile]:
        """Get a specific profile version."""
        return (
            self.db.query(EncryptedProfile)
            .filter(
                EncryptedProfile.user_id == user_id,
                EncryptedProfile.version == version,
            )
            .first()
        )

    def get_profile_versions(
        self, user_id: int, limit: int = 20, offset: int = 0
    ) -> Tuple[List[EncryptedProfile], int]:
        """Get paginated list of profile versions."""
        query = self.db.query(EncryptedProfile).filter(
            EncryptedProfile.user_id == user_id
        )
        total = query.count()
        versions = (
            query.order_by(desc(EncryptedProfile.version))
            .offset(offset)
            .limit(limit)
            .all()
        )
        return versions, total

    # ==================== Encrypted Profile Picture Operations ====================

    def store_encrypted_picture(
        self,
        user_id: int,
        encrypted_file_path: str,
        file_nonce: str,
        dek_version: int,
        content_hash: str,
        mime_type: str = "image/jpeg",
        file_size: int = 0,
    ) -> EncryptedProfilePicture:
        """Store encrypted profile picture reference."""
        existing = (
            self.db.query(EncryptedProfilePicture)
            .filter(EncryptedProfilePicture.user_id == user_id)
            .order_by(desc(EncryptedProfilePicture.version))
            .first()
        )
        new_version = (existing.version + 1) if existing else 1

        pic = EncryptedProfilePicture(
            user_id=user_id,
            encrypted_file_path=encrypted_file_path,
            file_nonce=file_nonce,
            dek_version=dek_version,
            content_hash=content_hash,
            mime_type=mime_type,
            file_size=file_size,
            version=new_version,
        )
        self.db.add(pic)
        self.db.commit()
        self.db.refresh(pic)
        return pic

    def get_latest_encrypted_picture(
        self, user_id: int
    ) -> Optional[EncryptedProfilePicture]:
        """Get the latest encrypted profile picture."""
        return (
            self.db.query(EncryptedProfilePicture)
            .filter(EncryptedProfilePicture.user_id == user_id)
            .order_by(desc(EncryptedProfilePicture.version))
            .first()
        )

    # ==================== Encrypted Metadata Operations ====================

    def store_encrypted_metadata(
        self,
        user_id: int,
        encrypted_blob: str,
        blob_nonce: str,
        dek_version: int,
        metadata_type: str = "chat_settings",
    ) -> EncryptedMessageMetadata:
        """Store or update encrypted message metadata."""
        existing = (
            self.db.query(EncryptedMessageMetadata)
            .filter(
                EncryptedMessageMetadata.user_id == user_id,
                EncryptedMessageMetadata.metadata_type == metadata_type,
            )
            .order_by(desc(EncryptedMessageMetadata.version))
            .first()
        )
        new_version = (existing.version + 1) if existing else 1

        meta = EncryptedMessageMetadata(
            user_id=user_id,
            encrypted_blob=encrypted_blob,
            blob_nonce=blob_nonce,
            dek_version=dek_version,
            metadata_type=metadata_type,
            version=new_version,
        )
        self.db.add(meta)
        self.db.commit()
        self.db.refresh(meta)
        return meta

    def get_latest_metadata(
        self, user_id: int, metadata_type: str
    ) -> Optional[EncryptedMessageMetadata]:
        """Get latest metadata of a given type."""
        return (
            self.db.query(EncryptedMessageMetadata)
            .filter(
                EncryptedMessageMetadata.user_id == user_id,
                EncryptedMessageMetadata.metadata_type == metadata_type,
            )
            .order_by(desc(EncryptedMessageMetadata.version))
            .first()
        )

    def get_all_metadata(self, user_id: int) -> List[EncryptedMessageMetadata]:
        """Get all metadata types (latest version of each)."""
        # Get distinct metadata types
        types = (
            self.db.query(EncryptedMessageMetadata.metadata_type)
            .filter(EncryptedMessageMetadata.user_id == user_id)
            .distinct()
            .all()
        )
        result = []
        for (mt,) in types:
            latest = self.get_latest_metadata(user_id, mt)
            if latest:
                result.append(latest)
        return result

    # ==================== Backup Operations ====================

    def store_backup(
        self,
        user_id: int,
        encrypted_backup: str,
        backup_nonce: str,
        wrapped_dek: str,
        dek_wrap_nonce: str,
        backup_key_hash: str,
        profile_version: int,
        metadata_versions: dict = None,
    ) -> EncryptedBackup:
        """Store an encrypted backup."""
        backup_id = secrets.token_urlsafe(32)
        file_size = len(encrypted_backup.encode("utf-8"))

        backup = EncryptedBackup(
            user_id=user_id,
            backup_id=backup_id,
            encrypted_backup=encrypted_backup,
            backup_nonce=backup_nonce,
            wrapped_dek=wrapped_dek,
            dek_wrap_nonce=dek_wrap_nonce,
            backup_key_hash=backup_key_hash,
            profile_version=profile_version,
            metadata_versions=metadata_versions or {},
            file_size=file_size,
        )
        self.db.add(backup)
        self.db.commit()
        self.db.refresh(backup)
        return backup

    def get_backup(
        self, user_id: int, backup_id: str
    ) -> Optional[EncryptedBackup]:
        """Get a specific backup by ID."""
        return (
            self.db.query(EncryptedBackup)
            .filter(
                EncryptedBackup.user_id == user_id,
                EncryptedBackup.backup_id == backup_id,
            )
            .first()
        )

    def list_backups(self, user_id: int) -> List[EncryptedBackup]:
        """List all backups for a user."""
        return (
            self.db.query(EncryptedBackup)
            .filter(EncryptedBackup.user_id == user_id)
            .order_by(desc(EncryptedBackup.created_at))
            .all()
        )

    def delete_backup(self, user_id: int, backup_id: str) -> bool:
        """Delete a backup."""
        count = (
            self.db.query(EncryptedBackup)
            .filter(
                EncryptedBackup.user_id == user_id,
                EncryptedBackup.backup_id == backup_id,
            )
            .delete()
        )
        self.db.commit()
        return count > 0

    # ==================== Key Rotation Log Operations ====================

    def log_key_rotation(
        self,
        user_id: int,
        rotation_type: str,
        old_key_fingerprint: str = None,
        new_key_fingerprint: str = None,
        old_dek_version: int = None,
        new_dek_version: int = None,
        device_id: str = None,
        ip_address: str = None,
        success: bool = True,
        error_message: str = None,
    ) -> KeyRotationLog:
        """Log a key rotation event for auditing."""
        log = KeyRotationLog(
            user_id=user_id,
            rotation_type=rotation_type,
            old_key_fingerprint=old_key_fingerprint,
            new_key_fingerprint=new_key_fingerprint,
            old_dek_version=old_dek_version,
            new_dek_version=new_dek_version,
            device_id=device_id,
            ip_address=ip_address,
            success=success,
            error_message=error_message,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    def get_rotation_history(
        self, user_id: int, limit: int = 50
    ) -> List[KeyRotationLog]:
        """Get key rotation history for a user."""
        return (
            self.db.query(KeyRotationLog)
            .filter(KeyRotationLog.user_id == user_id)
            .order_by(desc(KeyRotationLog.created_at))
            .limit(limit)
            .all()
        )

    def count_rotations(self, user_id: int) -> int:
        """Count total key rotations for a user."""
        return (
            self.db.query(KeyRotationLog)
            .filter(
                KeyRotationLog.user_id == user_id,
                KeyRotationLog.success == True,
            )
            .count()
        )

    def get_last_rotation(self, user_id: int) -> Optional[KeyRotationLog]:
        """Get the most recent key rotation event."""
        return (
            self.db.query(KeyRotationLog)
            .filter(
                KeyRotationLog.user_id == user_id,
                KeyRotationLog.success == True,
            )
            .order_by(desc(KeyRotationLog.created_at))
            .first()
        )

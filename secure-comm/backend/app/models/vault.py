"""
Secure Vault Models
Encrypted personal storage for notes, passwords, and documents
All content encrypted client-side - server stores only ciphertext
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from enum import Enum


class VaultItemType(str, Enum):
    NOTE = "note"
    PASSWORD = "password"
    DOCUMENT = "document"
    CREDENTIAL = "credential"
    CRYPTO_KEY = "crypto_key"
    CUSTOM = "custom"


class VaultItemBase(BaseModel):
    """Base vault item - all fields encrypted client-side"""
    encrypted_content: str = Field(..., description="Encrypted vault item content")
    encrypted_key: str = Field(..., description="Encrypted AES key for this item")
    iv: str = Field(..., description="Initialization vector")
    item_type: VaultItemType = VaultItemType.NOTE
    # Encrypted metadata searchable by client
    encrypted_title: Optional[str] = None
    encrypted_tags: Optional[str] = None  # Encrypted JSON array of tags


class VaultItemCreate(VaultItemBase):
    pass


class VaultItemUpdate(BaseModel):
    encrypted_content: Optional[str] = None
    encrypted_key: Optional[str] = None
    iv: Optional[str] = None
    encrypted_title: Optional[str] = None
    encrypted_tags: Optional[str] = None


class VaultItemResponse(VaultItemBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    version: int = 1  # For sync conflict resolution
    is_deleted: bool = False  # Soft delete for sync
    
    model_config = ConfigDict(from_attributes=True)


class VaultItemList(BaseModel):
    """List of vault items with sync info"""
    items: List[VaultItemResponse]
    sync_token: str  # For incremental sync
    has_more: bool = False


class VaultSyncRequest(BaseModel):
    """Request for syncing vault items"""
    last_sync_token: Optional[str] = None
    device_id: str


class VaultSyncResponse(BaseModel):
    """Response containing changed items since last sync"""
    updated_items: List[VaultItemResponse]
    deleted_item_ids: List[int]
    new_sync_token: str
    server_time: datetime


# ============ Password Generator Settings ============

class PasswordGeneratorSettings(BaseModel):
    """Encrypted password generator settings"""
    length: int = Field(default=16, ge=8, le=128)
    include_uppercase: bool = True
    include_lowercase: bool = True
    include_numbers: bool = True
    include_symbols: bool = True
    exclude_ambiguous: bool = True  # Exclude 0, O, l, 1 etc.
    custom_symbols: Optional[str] = None


# ============ Vault Sharing ============

class VaultShareRequest(BaseModel):
    """Share a vault item with another user"""
    item_id: int
    recipient_username: str
    # Item re-encrypted with recipient's public key
    encrypted_content_for_recipient: str
    encrypted_key_for_recipient: str
    permissions: str = "read"  # read, write
    expires_at: Optional[datetime] = None


class SharedVaultItemResponse(BaseModel):
    id: int
    original_item_id: int
    owner_username: str
    encrypted_content: str
    encrypted_key: str
    iv: str
    item_type: VaultItemType
    permissions: str
    shared_at: datetime
    expires_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


# ============ Vault Backup ============

class VaultBackupRequest(BaseModel):
    """Request encrypted backup of all vault items"""
    backup_password_hash: str  # Hash of additional backup password


class VaultBackupResponse(BaseModel):
    """Encrypted backup bundle"""
    backup_id: str
    encrypted_backup: str  # All items encrypted with backup key
    created_at: datetime
    item_count: int


class VaultRestoreRequest(BaseModel):
    """Restore vault from backup"""
    backup_id: str
    backup_password_hash: str

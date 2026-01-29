from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from enum import Enum


class MessageType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    FILE = "file"
    VOICE = "voice"
    KEY_EXCHANGE = "key_exchange"
    SYSTEM = "system"


class ExpiryType(str, Enum):
    NONE = "none"
    AFTER_READ = "after_read"
    TIMED_10S = "10s"
    TIMED_1M = "1m"
    TIMED_1H = "1h"
    TIMED_24H = "24h"


class MessageStatus(str, Enum):
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    EXPIRED = "expired"
    DELETED = "deleted"


class MessageBase(BaseModel):
    encrypted_content: str = Field(..., description="Base64 encoded ciphertext")
    message_type: MessageType = MessageType.TEXT


class MessageCreate(MessageBase):
    recipient_username: str
    expiry_type: ExpiryType = ExpiryType.NONE
    # For hybrid encryption - encrypted session key
    encrypted_key: Optional[str] = Field(None, description="Encrypted AES key for hybrid encryption")
    # For file/media messages
    file_metadata: Optional[dict] = Field(None, description="Encrypted file metadata")
    # Reply reference
    reply_to_id: Optional[int] = None
    # Sender's theme for theme synchronization (unencrypted UI metadata)
    sender_theme: Optional[dict] = Field(None, description="Sender's theme preferences for theme sync")


class MessageResponse(BaseModel):
    id: int
    sender_id: int
    sender_username: str
    recipient_id: int
    recipient_username: str
    encrypted_content: str
    encrypted_key: Optional[str] = None
    message_type: MessageType
    status: MessageStatus
    expiry_type: ExpiryType
    expires_at: Optional[datetime] = None
    file_metadata: Optional[dict] = None
    reply_to_id: Optional[int] = None
    sender_theme: Optional[dict] = None
    created_at: datetime
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


class MessageUpdate(BaseModel):
    status: Optional[MessageStatus] = None


class MessageDeliveryReceipt(BaseModel):
    """Delivery confirmation"""
    message_id: int
    status: MessageStatus
    timestamp: datetime


class MessageBatch(BaseModel):
    """Batch of messages for sync"""
    messages: List[MessageResponse]
    has_more: bool = False
    next_cursor: Optional[str] = None


# ============ File/Media Messages ============

class FileUploadRequest(BaseModel):
    """Request to upload encrypted file"""
    filename: str
    file_size: int
    content_type: str
    encrypted_metadata: str  # Encrypted JSON with actual filename, type etc.


class FileUploadResponse(BaseModel):
    file_id: str
    upload_url: str
    expires_at: datetime


class EncryptedFile(BaseModel):
    file_id: str
    encrypted_content: str  # For small files, base64 encoded
    encrypted_key: str
    iv: str  # Initialization vector
    content_hash: str  # SHA-256 of plaintext for integrity


# ============ Conversation ============

class ConversationPreview(BaseModel):
    """Preview for conversation list"""
    username: str
    last_message_preview: Optional[str] = None  # "[Encrypted]" placeholder
    last_message_time: Optional[datetime] = None
    unread_count: int = 0
    is_online: bool = False


class ConversationList(BaseModel):
    conversations: List[ConversationPreview]


class CallLogResponse(BaseModel):
    id: int
    caller_id: int
    caller_username: str
    receiver_id: int
    receiver_username: str
    call_type: str
    status: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_seconds: int = 0
    
    model_config = ConfigDict(from_attributes=True)

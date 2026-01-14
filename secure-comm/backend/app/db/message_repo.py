"""
CipherLink Message Repository
Database operations for encrypted messages
"""

from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from datetime import datetime
from typing import List, Optional

from app.db.database import Message, User, MessageStatusEnum


class MessageRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def create(
        self, 
        sender_id: int, 
        recipient_id: int, 
        encrypted_content: str,
        encrypted_key: str = None,
        message_type: str = "text",
        expiry_type: str = "none",
        expires_at: datetime = None,
        reply_to_id: int = None
    ) -> Message:
        """Create a new encrypted message."""
        message = Message(
            sender_id=sender_id,
            recipient_id=recipient_id,
            encrypted_content=encrypted_content,
            encrypted_key=encrypted_key,
            message_type=message_type,
            expiry_type=expiry_type,
            expires_at=expires_at,
            reply_to_id=reply_to_id,
            status=MessageStatusEnum.SENT
        )
        self.db.add(message)
        self.db.commit()
        self.db.refresh(message)
        
        return message
    
    def get_by_id(self, message_id: int) -> Optional[Message]:
        """Get message by ID."""
        return self.db.query(Message).filter(Message.id == message_id).first()
    
    def get_conversation(
        self, 
        user1_id: int, 
        user2_id: int,
        limit: int = 50,
        before_id: int = None
    ) -> List[Message]:
        """Get messages between two users."""
        query = self.db.query(Message).filter(
            or_(
                and_(Message.sender_id == user1_id, Message.recipient_id == user2_id),
                and_(Message.sender_id == user2_id, Message.recipient_id == user1_id)
            ),
            Message.status != MessageStatusEnum.DELETED,
            Message.status != MessageStatusEnum.EXPIRED
        )
        
        if before_id:
            query = query.filter(Message.id < before_id)
        
        messages = query.order_by(Message.created_at.desc()).limit(limit).all()
        
        # Reverse to chronological order
        return list(reversed(messages))
    
    def get_unread_by_recipient(self, recipient_id: int) -> List[Message]:
        """Get all unread messages for a recipient."""
        messages = self.db.query(Message).filter(
            Message.recipient_id == recipient_id,
            Message.status == MessageStatusEnum.SENT
        ).order_by(Message.created_at).all()
        
        return messages
    
    def update_status(self, message_id: int, status: MessageStatusEnum) -> Optional[Message]:
        """Update message status."""
        message = self.get_by_id(message_id)
        if message:
            message.status = status
            
            if status == MessageStatusEnum.DELIVERED:
                message.delivered_at = datetime.utcnow()
            elif status == MessageStatusEnum.READ:
                message.read_at = datetime.utcnow()
                
                # Handle "after_read" expiry
                if message.expiry_type == "after_read":
                    message.status = MessageStatusEnum.EXPIRED
            
            self.db.commit()
            self.db.refresh(message)
        return message
    
    def mark_as_read(self, message_id: int) -> Optional[Message]:
        """Mark a message as read."""
        return self.update_status(message_id, MessageStatusEnum.READ)
    
    def delete(self, message_id: int, soft: bool = True) -> bool:
        """Delete a message (soft delete by default)."""
        message = self.get_by_id(message_id)
        if message:
            if soft:
                message.status = MessageStatusEnum.DELETED
                self.db.commit()
            else:
                self.db.delete(message)
                self.db.commit()
            return True
        return False
    
    def cleanup_expired(self) -> int:
        """Delete expired messages. Returns count of deleted messages."""
        now = datetime.utcnow()
        
        expired = self.db.query(Message).filter(
            Message.expires_at != None,
            Message.expires_at < now,
            Message.status != MessageStatusEnum.EXPIRED
        ).all()
        
        count = 0
        for msg in expired:
            msg.status = MessageStatusEnum.EXPIRED
            count += 1
        
        if count > 0:
            self.db.commit()
        
        return count
    
    def get_conversation_list(self, user_id: int) -> List[dict]:
        """Get list of conversations with last message preview."""
        from sqlalchemy import func
        
        # Subquery to get latest message ID for each conversation
        subq = self.db.query(
            func.max(Message.id).label('max_id'),
            func.case(
                (Message.sender_id == user_id, Message.recipient_id),
                else_=Message.sender_id
            ).label('other_user_id')
        ).filter(
            or_(Message.sender_id == user_id, Message.recipient_id == user_id),
            Message.status != MessageStatusEnum.DELETED
        ).group_by('other_user_id').subquery()
        
        # Get messages with user info
        conversations = []
        results = self.db.query(Message, User).join(
            subq, Message.id == subq.c.max_id
        ).join(
            User, User.id == subq.c.other_user_id
        ).all()
        
        for msg, user in results:
            # Count unread
            unread = self.db.query(Message).filter(
                Message.sender_id == user.id,
                Message.recipient_id == user_id,
                Message.status == MessageStatusEnum.SENT
            ).count()
            
            conversations.append({
                "username": user.username,
                "last_message_time": msg.created_at,
                "unread_count": unread,
                "last_message_preview": "[Encrypted]"
            })
        
        return sorted(conversations, key=lambda x: x["last_message_time"], reverse=True)

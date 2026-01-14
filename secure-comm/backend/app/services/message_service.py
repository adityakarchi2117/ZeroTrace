from sqlalchemy.orm import Session
from app.db.message_repo import MessageRepository
from app.db.user_repo import UserRepository

class MessageService:
    def __init__(self, db: Session):
        self.db = db
        self.message_repo = MessageRepository(db)
        self.user_repo = UserRepository(db)
    
    def send_message(self, sender_id: int, recipient_username: str, encrypted_content: str):
        """Send an encrypted message to a recipient."""
        recipient = self.user_repo.get_by_username(recipient_username)
        if not recipient:
            raise ValueError(f"Recipient '{recipient_username}' not found")
        
        message = self.message_repo.create(
            sender_id=sender_id,
            recipient_id=recipient.id,
            encrypted_content=encrypted_content
        )
        
        return message
    
    def get_conversation(self, user_id: int, other_username: str):
        """Get all messages in a conversation between two users."""
        other_user = self.user_repo.get_by_username(other_username)
        if not other_user:
            raise ValueError(f"User '{other_username}' not found")
        
        messages = self.message_repo.get_conversation(user_id, other_user.id)
        return messages
    
    def get_unread_messages(self, user_id: int):
        """Get all unread messages for a user."""
        messages = self.message_repo.get_unread_by_recipient(user_id)
        return messages
    
    def mark_as_read(self, message_id: int, user_id: int):
        """Mark a message as read."""
        message = self.message_repo.get_by_id(message_id)
        if not message:
            raise ValueError("Message not found")
        
        if message.recipient_id != user_id:
            raise ValueError("Unauthorized to mark this message as read")
        
        self.message_repo.mark_as_read(message_id)
        return True

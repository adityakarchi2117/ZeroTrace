from sqlalchemy.orm import Session
from sqlalchemy import or_, func, case
from app.db.message_repo import MessageRepository
from app.db.user_repo import UserRepository
from app.db.database import User, CallLog, CallTypeEnum, CallStatusEnum, Message

class MessageService:
    def __init__(self, db: Session):
        self.db = db
        self.message_repo = MessageRepository(db)
        self.user_repo = UserRepository(db)
    
    def get_call_history(self, user_id: int):
        """Get call history for a user."""
        # Query CallLog where caller_id == user_id OR receiver_id == user_id
        # Order by start_time desc
        from sqlalchemy import or_
        
        calls = self.db.query(CallLog).filter(
            or_(
                (CallLog.caller_id == user_id) & (CallLog.caller_deleted == False),
                (CallLog.receiver_id == user_id) & (CallLog.receiver_deleted == False)
            )
        ).order_by(CallLog.start_time.desc()).limit(50).all()
        
        # Add usernames
        for call in calls:
            caller = self.db.query(User).filter(User.id == call.caller_id).first()
            receiver = self.db.query(User).filter(User.id == call.receiver_id).first()
            call.caller_username = caller.username if caller else "Unknown"
            call.receiver_username = receiver.username if receiver else "Unknown"
            
        return calls

    def _add_usernames_to_message(self, message):
        """Add sender_username and recipient_username to a message object."""
        sender = self.db.query(User).filter(User.id == message.sender_id).first()
        recipient = self.db.query(User).filter(User.id == message.recipient_id).first()
        
        # Attach usernames as attributes
        message.sender_username = sender.username if sender else "Unknown"
        message.recipient_username = recipient.username if recipient else "Unknown"
        return message
    
    def send_message(
        self, 
        sender_id: int, 
        recipient_username: str, 
        encrypted_content: str,
        encrypted_key: str = None,
        expiry_type: str = "none",
        message_type: str = "text",
        file_metadata: dict = None,
        sender_theme: dict = None
    ):
        """Send an encrypted message to a recipient."""
        recipient = self.user_repo.get_by_username(recipient_username)
        if not recipient:
            raise ValueError(f"Recipient '{recipient_username}' not found")
        
        message = self.message_repo.create(
            sender_id=sender_id,
            recipient_id=recipient.id,
            encrypted_content=encrypted_content,
            encrypted_key=encrypted_key,
            message_type=message_type,
            expiry_type=expiry_type,
            file_metadata=file_metadata,
            sender_theme=sender_theme
        )
        
        return self._add_usernames_to_message(message)
    
    def get_conversation(self, user_id: int, other_username: str):
        """Get all messages in a conversation between two users."""
        other_user = self.user_repo.get_by_username(other_username)
        if not other_user:
            raise ValueError(f"User '{other_username}' not found")
        
        messages = self.message_repo.get_conversation(user_id, other_user.id)
        
        # Add usernames to each message
        for msg in messages:
            self._add_usernames_to_message(msg)
        
        return messages
    
    def get_unread_messages(self, user_id: int):
        """Get all unread messages for a user."""
        messages = self.message_repo.get_unread_by_recipient(user_id)
        
        # Add usernames to each message
        for msg in messages:
            self._add_usernames_to_message(msg)
        
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
    
    def get_message_history(self, user_id: int, peer_username: str, limit: int = 50, offset: int = 0):
        """Get paginated message history with a peer."""
        peer = self.user_repo.get_by_username(peer_username)
        if not peer:
            raise ValueError(f"User '{peer_username}' not found")
        
        messages = self.message_repo.get_conversation_paginated(user_id, peer.id, limit, offset)
        
        # Add usernames to each message
        for msg in messages:
            self._add_usernames_to_message(msg)
        
        return messages
    
    def get_all_conversations_with_messages(self, user_id: int):
        """Get all conversations with recent messages for startup sync."""
        # Get all unique conversation partners (peer_id is "the other user" in each message)
        peer_id_expr = case(
            (Message.sender_id == user_id, Message.recipient_id),
            else_=Message.sender_id,
        ).label("peer_id")

        conversations = (
            self.db.query(peer_id_expr)
            .filter(or_(Message.sender_id == user_id, Message.recipient_id == user_id))
            .distinct()
            .all()
        )

        result = {}
        for conv in conversations:
            peer_id = conv.peer_id
            peer = self.db.query(User).filter(User.id == peer_id).first()
            if peer:
                # Get last 20 messages for this conversation (paginated handles filtering)
                messages = self.message_repo.get_conversation_paginated(user_id, peer_id, 20, 0)
                for msg in messages:
                    self._add_usernames_to_message(msg)
                
                result[peer.username] = messages
        
        return result

    def delete_call_history(self, user_id: int, peer_username: str) -> bool:
        """Delete call history with a peer (soft delete)."""
        peer = self.user_repo.get_by_username(peer_username)
        if not peer:
            return False
            
        # Find calls involving both users
        calls = self.db.query(CallLog).filter(
            or_(
                (CallLog.caller_id == user_id) & (CallLog.receiver_id == peer.id),
                (CallLog.caller_id == peer.id) & (CallLog.receiver_id == user_id)
            )
        ).all()
        
        for call in calls:
            if call.caller_id == user_id:
                call.caller_deleted = True
            elif call.receiver_id == user_id:
                call.receiver_deleted = True
                
        self.db.commit()
        return True
    
    def delete_message(self, message_id: int, user_id: int) -> bool:
        """Delete a specific message. Only the sender can delete."""
        message = self.message_repo.get_by_id(message_id)
        if not message:
            return False
        
        # Only sender can delete the message
        if message.sender_id != user_id:
            return False
        
        self.db.delete(message)
        self.db.commit()
        return True
    
    def delete_conversation(self, user_id: int, peer_username: str, delete_for_everyone: bool = False) -> bool:
        """Delete all messages in a conversation with a peer.

        - delete_for_everyone=False: hide messages only for the requesting user.
        - delete_for_everyone=True: remove messages for both participants.
        """
        peer = self.user_repo.get_by_username(peer_username)
        if not peer:
            return False
        
        # Fetch all messages between both users.
        messages = self.db.query(Message).filter(
            or_(
                (Message.sender_id == user_id) & (Message.recipient_id == peer.id),
                (Message.sender_id == peer.id) & (Message.recipient_id == user_id)
            )
        ).all()

        if delete_for_everyone:
            for message in messages:
                self.db.delete(message)
        else:
            for message in messages:
                if message.sender_id == user_id:
                    message.sender_deleted = True
                if message.recipient_id == user_id:
                    message.recipient_deleted = True
        
        self.db.commit()
        return True



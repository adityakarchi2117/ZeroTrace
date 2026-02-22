from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db, User
from app.services.message_service import MessageService
from app.api.routes.auth import oauth2_scheme
from app.core.security import decode_access_token
from app.models.message import MessageCreate, MessageResponse, CallLogResponse
from app.api.websocket import manager
from app.db.friend_repo import FriendRepository

router = APIRouter()

@router.post("/send", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    message: MessageCreate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Send an encrypted message."""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    sender_id = payload.get("user_id")
    
    # Check if users are trusted contacts (friend request accepted)
    recipient = db.query(User).filter(User.username == message.recipient_username).first()
    if not recipient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipient not found")
    
    friend_repo = FriendRepository(db)
    if not friend_repo.is_mutual_contact(sender_id, recipient.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be friends with this user to send messages. Send a friend request first."
        )
    
    message_service = MessageService(db)
    
    new_message = message_service.send_message(
        sender_id=sender_id,
        recipient_username=message.recipient_username,
        encrypted_content=message.encrypted_content,
        encrypted_key=message.encrypted_key,
        expiry_type=message.expiry_type,
        message_type=message.message_type,
        file_metadata=message.file_metadata,
        sender_theme=message.sender_theme
    )
    
    # Attempt real-time delivery over WebSocket
    try:
        # Build payload consistent with WebSocket message format
        ws_payload = {
            "type": "message",
            "message_id": new_message.id,
            "sender_id": new_message.sender_id,
            "sender_username": getattr(new_message, "sender_username", None) or payload.get("sub"),
            "recipient_id": new_message.recipient_id,
            "recipient_username": getattr(new_message, "recipient_username", None) or message.recipient_username,
            "content": new_message.encrypted_content,
            "encrypted_content": new_message.encrypted_content,
            "encrypted_key": new_message.encrypted_key,
            "message_type": new_message.message_type,
            "expiry_type": new_message.expiry_type,
            "sender_theme": message.sender_theme,  # Include sender's theme for theme sync
            "timestamp": new_message.created_at.isoformat() if getattr(new_message, "created_at", None) else None,
        }

        # Deliver to recipient if online
        await manager.send_personal_message(ws_payload, new_message.recipient_id)

    except Exception as e:
        # Log but don't fail the HTTP request
        print(f"Error delivering real-time message over WebSocket: {e}")

    return new_message

@router.get("/conversation/{username}", response_model=List[MessageResponse])
def get_conversation(
    username: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Get conversation with a specific user."""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user_id = payload.get("user_id")
    message_service = MessageService(db)
    
    try:
        messages = message_service.get_conversation(user_id, username)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return messages

@router.get("/history/{peer_username}", response_model=List[MessageResponse])
def get_message_history(
    peer_username: str,
    limit: int = 50,
    offset: int = 0,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Get complete message history with a peer (paginated)."""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    # AUDIT FIX: Bound limit to prevent DoS via huge page sizes
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    
    user_id = payload.get("user_id")
    message_service = MessageService(db)
    
    try:
        messages = message_service.get_message_history(user_id, peer_username, limit, offset)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return messages

@router.get("/all-conversations", response_model=dict)
def get_all_conversations_with_messages(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Get all conversations with recent messages for startup sync."""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user_id = payload.get("user_id")
    message_service = MessageService(db)
    
    # Get raw ORM messages grouped by peer username
    try:
        conversations = message_service.get_all_conversations_with_messages(user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    # Serialize to Pydantic models so FastAPI can return JSON safely
    serialized = {
        username: [MessageResponse.from_orm(msg) for msg in msgs]
        for username, msgs in conversations.items()
    }
    return serialized

@router.get("/unread", response_model=List[MessageResponse])
def get_unread_messages(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Get all unread messages for the current user."""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user_id = payload.get("user_id")
    message_service = MessageService(db)
    
    messages = message_service.get_unread_messages(user_id)
    return messages


@router.get("/calls/history", response_model=List[CallLogResponse])
def get_call_history(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Get call history."""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user_id = payload.get("user_id")
    message_service = MessageService(db)
    
    return message_service.get_call_history(user_id)


@router.delete("/{message_id:int}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(
    message_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Delete a specific message."""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user_id = payload.get("user_id")
    message_service = MessageService(db)
    
    success = message_service.delete_message(message_id, user_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found or access denied")
    
    return None


@router.delete("/conversation/{username}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    username: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Delete all messages in a conversation with a specific user."""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user_id = payload.get("user_id")
    message_service = MessageService(db)
    
    message_service.delete_conversation(user_id, username, delete_for_everyone=True)
    message_service.delete_call_history(user_id, username)
    return None


@router.delete("/calls/history/{username}")
def delete_call_history(
    username: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Delete call history with a specific user."""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        
    user_id = payload.get("user_id")
    message_service = MessageService(db)
    message_service.delete_call_history(user_id, username)
    return {"status": "success"}


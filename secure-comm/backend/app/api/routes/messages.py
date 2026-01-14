from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.services.message_service import MessageService
from app.api.routes.auth import oauth2_scheme
from app.core.security import decode_access_token
from app.models.message import MessageCreate, MessageResponse

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
    message_service = MessageService(db)
    
    new_message = message_service.send_message(
        sender_id=sender_id,
        recipient_username=message.recipient_username,
        encrypted_content=message.encrypted_content
    )
    
    return new_message

@router.get("/conversation/{username}", response_model=List[MessageResponse])
async def get_conversation(
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
    
    messages = message_service.get_conversation(user_id, username)
    return messages

@router.get("/unread", response_model=List[MessageResponse])
async def get_unread_messages(
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

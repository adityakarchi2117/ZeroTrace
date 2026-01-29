"""
CipherLink Contacts API Routes
Manage contacts and user discovery
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from app.db.database import get_db, User, Contact
from app.api.routes.auth import oauth2_scheme
from app.core.security import decode_access_token

router = APIRouter()


class ContactResponse(BaseModel):
    id: int
    user_id: int
    contact_id: int
    contact_username: str
    contact_email: str
    public_key: Optional[str] = None
    identity_key: Optional[str] = None
    nickname: Optional[str] = None
    is_blocked: bool = False
    is_verified: bool = False
    added_at: str
    
    class Config:
        from_attributes = True


class ContactCreate(BaseModel):
    username: str
    nickname: Optional[str] = None


class UserSearchResult(BaseModel):
    id: int
    username: str
    public_key: Optional[str] = None
    identity_key: Optional[str] = None
    is_online: bool = False


def get_current_user_id(token: str = Depends(oauth2_scheme)) -> int:
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    return payload.get("user_id")


@router.get("/", response_model=List[ContactResponse])
async def get_contacts(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get all contacts for the current user"""
    contacts = db.query(Contact).filter(
        Contact.user_id == user_id,
        Contact.is_blocked == False
    ).all()
    
    result = []
    for contact in contacts:
        contact_user = db.query(User).filter(User.id == contact.contact_user_id).first()
        if contact_user:
            result.append({
                "id": contact.id,
                "user_id": contact.user_id,
                "contact_id": contact.contact_user_id,
                "contact_username": contact_user.username,
                "contact_email": contact_user.email,
                "public_key": contact_user.public_key,
                "identity_key": contact_user.identity_key,
                "nickname": contact.nickname,
                "is_blocked": contact.is_blocked,
                "is_verified": False,
                "added_at": contact.created_at.isoformat() if contact.created_at else ""
            })
    
    return result


@router.post("/", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def add_contact(
    contact_data: ContactCreate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Add a new contact"""
    # Find the user to add as contact
    contact_user = db.query(User).filter(User.username == contact_data.username).first()
    if not contact_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if contact_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add yourself as a contact"
        )
    
    # Check if already a contact
    existing = db.query(Contact).filter(
        Contact.user_id == user_id,
        Contact.contact_user_id == contact_user.id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contact already exists"
        )
    
    # Create contact
    new_contact = Contact(
        user_id=user_id,
        contact_user_id=contact_user.id,
        nickname=contact_data.nickname
    )
    db.add(new_contact)
    db.commit()
    db.refresh(new_contact)
    
    return {
        "id": new_contact.id,
        "user_id": new_contact.user_id,
        "contact_id": new_contact.contact_user_id,
        "contact_username": contact_user.username,
        "contact_email": contact_user.email,
        "public_key": contact_user.public_key,
        "identity_key": contact_user.identity_key,
        "nickname": new_contact.nickname,
        "is_blocked": new_contact.is_blocked,
        "is_verified": False,
        "added_at": new_contact.created_at.isoformat() if new_contact.created_at else ""
    }


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_contact(
    contact_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Remove a contact"""
    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.user_id == user_id
    ).first()
    
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )
    
    db.delete(contact)
    db.commit()


@router.post("/{contact_id}/block", status_code=status.HTTP_200_OK)
async def block_contact(
    contact_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Block a contact"""
    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.user_id == user_id
    ).first()
    
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )
    
    contact.is_blocked = True
    db.commit()
    
    return {"message": "Contact blocked"}


@router.get("/search", response_model=List[UserSearchResult])
async def search_users(
    q: str = Query(..., min_length=2, description="Search query"),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Search for users by username"""
    users = db.query(User).filter(
        User.username.ilike(f"%{q}%"),
        User.id != user_id,
        User.is_active == True
    ).limit(20).all()
    
    return [
        {
            "id": user.id,
            "username": user.username,
            "public_key": user.public_key,
            "identity_key": user.identity_key,
            "is_online": False  # Will be updated via WebSocket
        }
        for user in users
    ]


@router.get("/conversations")
async def get_conversations(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get conversation previews with unread counts"""
    from app.db.database import Message, MessageStatusEnum
    from sqlalchemy import or_, and_, func, desc
    
    # Get all unique conversation partners
    subquery = db.query(
        func.coalesce(
            Message.sender_id if Message.sender_id != user_id else Message.recipient_id
        ).label('partner_id'),
        func.max(Message.created_at).label('last_message_time')
    ).filter(
        or_(
            Message.sender_id == user_id,
            Message.recipient_id == user_id
        )
    ).group_by(
        'partner_id'
    ).subquery()
    
    # Get users who have exchanged messages with current user
    partners_sent = db.query(Message.recipient_id.label('partner_id')).filter(
        Message.sender_id == user_id
    ).distinct()
    
    partners_received = db.query(Message.sender_id.label('partner_id')).filter(
        Message.recipient_id == user_id
    ).distinct()
    
    all_partner_ids = set()
    for p in partners_sent.all():
        all_partner_ids.add(p.partner_id)
    for p in partners_received.all():
        all_partner_ids.add(p.partner_id)
    
    conversations = []
    for partner_id in all_partner_ids:
        partner = db.query(User).filter(User.id == partner_id).first()
        if not partner:
            continue
        
        # Get last message
        last_message = db.query(Message).filter(
            or_(
                and_(Message.sender_id == user_id, Message.recipient_id == partner_id),
                and_(Message.sender_id == partner_id, Message.recipient_id == user_id)
            )
        ).order_by(desc(Message.created_at)).first()
        
        # Count unread
        unread_count = db.query(Message).filter(
            Message.sender_id == partner_id,
            Message.recipient_id == user_id,
            Message.status == MessageStatusEnum.SENT
        ).count()
        
        conversations.append({
            "user_id": partner.id,
            "username": partner.username,
            "public_key": partner.public_key,
            "identity_key": partner.identity_key,
            "last_message_time": last_message.created_at.isoformat() if last_message else None,
            "last_message_preview": "[Encrypted Message]" if last_message else None,
            "unread_count": unread_count,
            "is_online": False
        })
    
    # Sort by last message time
    conversations.sort(key=lambda x: x['last_message_time'] or '', reverse=True)
    
    return conversations

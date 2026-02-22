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
    
    # Batch load all contact users in one query (fix N+1)
    contact_user_ids = [c.contact_user_id for c in contacts]
    if not contact_user_ids:
        return []
    contact_users = db.query(User).filter(User.id.in_(contact_user_ids)).all()
    user_map = {u.id: u for u in contact_users}
    
    result = []
    for contact in contacts:
        contact_user = user_map.get(contact.contact_user_id)
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
    # Escape LIKE wildcard characters to prevent injection
    safe_q = q.replace("%", "\\%").replace("_", "\\_")
    users = db.query(User).filter(
        User.username.ilike(f"%{safe_q}%", escape="\\"),
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
    from app.db.database import Message, MessageStatusEnum, UserProfile
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
    
    # Filter out removed contacts so they don't appear in sidebar
    from app.db.friend_models import TrustedContact
    removed_contact_ids = set()
    removed_contacts = db.query(TrustedContact.contact_user_id).filter(
        TrustedContact.user_id == user_id,
        TrustedContact.is_removed == True
    ).all()
    for rc in removed_contacts:
        removed_contact_ids.add(rc.contact_user_id)
    
    all_partner_ids -= removed_contact_ids
    
    if not all_partner_ids:
        return []
    
    partner_id_list = list(all_partner_ids)
    
    # Batch load all partners and profiles in 2 queries (fix N+1)
    partners = db.query(User).filter(User.id.in_(partner_id_list)).all()
    partner_map = {p.id: p for p in partners}
    
    profiles = db.query(UserProfile).filter(UserProfile.user_id.in_(partner_id_list)).all()
    profile_map = {p.user_id: p for p in profiles}
    
    # Batch get last message per partner using a window function approach
    from sqlalchemy import case
    partner_col = case(
        (Message.sender_id == user_id, Message.recipient_id),
        else_=Message.sender_id
    ).label('partner_id')
    
    last_msg_subq = db.query(
        partner_col,
        func.max(Message.created_at).label('last_msg_time')
    ).filter(
        or_(
            Message.sender_id == user_id,
            Message.recipient_id == user_id
        )
    ).group_by('partner_id').all()
    last_msg_time_map = {row.partner_id: row.last_msg_time for row in last_msg_subq}
    
    # Batch count unread per partner
    unread_rows = db.query(
        Message.sender_id,
        func.count(Message.id)
    ).filter(
        Message.sender_id.in_(partner_id_list),
        Message.recipient_id == user_id,
        Message.status == MessageStatusEnum.SENT
    ).group_by(Message.sender_id).all()
    unread_map = {row[0]: row[1] for row in unread_rows}
    
    conversations = []
    for pid in partner_id_list:
        partner = partner_map.get(pid)
        if not partner:
            continue
        
        profile = profile_map.get(pid)
        display_name = profile.display_name if profile and profile.display_name else None
        avatar_url = profile.avatar_url if profile and profile.avatar_url else None
        
        last_msg_time = last_msg_time_map.get(pid)
        
        conversations.append({
            "user_id": partner.id,
            "username": partner.username,
            "display_name": display_name,
            "avatar_url": avatar_url,
            "public_key": partner.public_key,
            "identity_key": partner.identity_key,
            "last_message_time": last_msg_time.isoformat() if last_msg_time else None,
            "last_message_preview": "[Encrypted Message]" if last_msg_time else None,
            "unread_count": unread_map.get(pid, 0),
            "is_online": False
        })
    
    # Sort by last message time
    conversations.sort(key=lambda x: x['last_message_time'] or '', reverse=True)
    
    return conversations

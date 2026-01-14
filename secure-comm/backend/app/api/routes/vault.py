"""
CipherLink Secure Vault API Routes
Encrypted personal storage for notes, passwords, and documents
All content encrypted client-side - server stores only ciphertext
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import hashlib
import secrets
import base64

from app.db.database import get_db, VaultItem
from app.api.routes.auth import oauth2_scheme
from app.core.security import decode_access_token
from app.models.vault import (
    VaultItemCreate,
    VaultItemUpdate,
    VaultItemResponse,
    VaultItemList,
    VaultSyncRequest,
    VaultSyncResponse,
    VaultShareRequest,
)

router = APIRouter()


def get_current_user_id(token: str = Depends(oauth2_scheme)) -> int:
    """Extract user ID from token"""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    return payload.get("user_id")


@router.post("/items", response_model=VaultItemResponse, status_code=status.HTTP_201_CREATED)
async def create_vault_item(
    item: VaultItemCreate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Create a new encrypted vault item.
    All content is encrypted client-side before sending.
    """
    vault_item = VaultItem(
        user_id=user_id,
        encrypted_content=item.encrypted_content,
        encrypted_key=item.encrypted_key,
        iv=item.iv,
        item_type=item.item_type,
        encrypted_title=item.encrypted_title,
        encrypted_tags=item.encrypted_tags,
    )
    
    db.add(vault_item)
    db.commit()
    db.refresh(vault_item)
    
    return vault_item


@router.get("/items", response_model=VaultItemList)
async def list_vault_items(
    item_type: Optional[str] = None,
    limit: int = Query(default=50, le=100),
    offset: int = 0,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    List all vault items for the authenticated user.
    Returns encrypted content - client must decrypt.
    """
    query = db.query(VaultItem).filter(
        VaultItem.user_id == user_id,
        VaultItem.is_deleted == False
    )
    
    if item_type:
        query = query.filter(VaultItem.item_type == item_type)
    
    total = query.count()
    items = query.order_by(VaultItem.updated_at.desc())\
                 .offset(offset)\
                 .limit(limit)\
                 .all()
    
    # Generate sync token
    sync_token = generate_sync_token(user_id, datetime.utcnow())
    
    return VaultItemList(
        items=items,
        sync_token=sync_token,
        has_more=(offset + limit < total)
    )


@router.get("/items/{item_id}", response_model=VaultItemResponse)
async def get_vault_item(
    item_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get a specific vault item"""
    item = db.query(VaultItem).filter(
        VaultItem.id == item_id,
        VaultItem.user_id == user_id,
        VaultItem.is_deleted == False
    ).first()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault item not found"
        )
    
    return item


@router.put("/items/{item_id}", response_model=VaultItemResponse)
async def update_vault_item(
    item_id: int,
    update: VaultItemUpdate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Update an existing vault item.
    Increments version for conflict detection.
    """
    item = db.query(VaultItem).filter(
        VaultItem.id == item_id,
        VaultItem.user_id == user_id,
        VaultItem.is_deleted == False
    ).first()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault item not found"
        )
    
    # Update fields
    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    
    # Increment version
    item.version += 1
    item.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(item)
    
    return item


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vault_item(
    item_id: int,
    permanent: bool = False,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Delete a vault item.
    Soft delete by default for sync purposes.
    """
    item = db.query(VaultItem).filter(
        VaultItem.id == item_id,
        VaultItem.user_id == user_id
    ).first()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault item not found"
        )
    
    if permanent:
        db.delete(item)
    else:
        item.is_deleted = True
        item.updated_at = datetime.utcnow()
        item.version += 1
    
    db.commit()
    return None


@router.post("/sync", response_model=VaultSyncResponse)
async def sync_vault(
    sync_request: VaultSyncRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Sync vault items with client.
    Returns items changed since last sync token.
    """
    last_sync_time = None
    
    if sync_request.last_sync_token:
        last_sync_time = decode_sync_token(sync_request.last_sync_token)
    
    # Get updated items
    query = db.query(VaultItem).filter(VaultItem.user_id == user_id)
    
    if last_sync_time:
        query = query.filter(VaultItem.updated_at > last_sync_time)
    
    items = query.all()
    
    # Separate updated and deleted
    updated_items = [i for i in items if not i.is_deleted]
    deleted_ids = [i.id for i in items if i.is_deleted]
    
    # Generate new sync token
    new_sync_token = generate_sync_token(user_id, datetime.utcnow())
    
    return VaultSyncResponse(
        updated_items=updated_items,
        deleted_item_ids=deleted_ids,
        new_sync_token=new_sync_token,
        server_time=datetime.utcnow()
    )


# ============ Utility Functions ============

def generate_sync_token(user_id: int, timestamp: datetime) -> str:
    """Generate sync token encoding user and timestamp"""
    data = f"{user_id}:{timestamp.isoformat()}"
    # Simple encoding - in production use proper signing
    return base64.urlsafe_b64encode(data.encode()).decode()


def decode_sync_token(token: str) -> Optional[datetime]:
    """Decode sync token to get timestamp"""
    try:
        data = base64.urlsafe_b64decode(token.encode()).decode()
        _, timestamp_str = data.split(":", 1)
        return datetime.fromisoformat(timestamp_str)
    except Exception:
        return None

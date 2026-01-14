"""
CipherLink WebSocket Handler
Real-time encrypted messaging with delivery receipts and presence
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException
from typing import Dict, Set, Optional
from datetime import datetime
from app.core.security import decode_access_token
from app.db.database import SessionLocal, Message, User
from app.models.message import MessageStatus
import json
import asyncio

router = APIRouter()


class ConnectionManager:
    """
    Manages WebSocket connections with presence tracking
    """
    
    def __init__(self):
        # user_id -> WebSocket connection
        self.active_connections: Dict[int, WebSocket] = {}
        # user_id -> set of user_ids subscribed to their presence
        self.presence_subscribers: Dict[int, Set[int]] = {}
        # user_id -> last activity timestamp
        self.last_activity: Dict[int, datetime] = {}
        # user_id -> username mapping
        self.user_info: Dict[int, dict] = {}
    
    async def connect(self, user_id: int, username: str, websocket: WebSocket):
        """Accept connection and notify presence subscribers"""
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.last_activity[user_id] = datetime.utcnow()
        self.user_info[user_id] = {"username": username}
        
        # Update last_seen in database
        await self._update_last_seen(user_id)
        
        # Notify presence subscribers that user is online
        await self._broadcast_presence(user_id, is_online=True)
    
    def disconnect(self, user_id: int):
        """Handle disconnection and notify subscribers"""
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        if user_id in self.last_activity:
            del self.last_activity[user_id]
        
        # Schedule offline presence broadcast
        asyncio.create_task(self._broadcast_presence(user_id, is_online=False))
    
    def is_online(self, user_id: int) -> bool:
        """Check if user is currently online"""
        return user_id in self.active_connections
    
    def get_online_users(self, user_ids: list) -> list:
        """Get list of online users from given user IDs"""
        return [uid for uid in user_ids if uid in self.active_connections]
    
    async def send_personal_message(self, message: dict, user_id: int) -> bool:
        """Send message to specific user, return True if delivered"""
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
                return True
            except Exception as e:
                print(f"Error sending to user {user_id}: {e}")
                self.disconnect(user_id)
        return False
    
    async def send_to_multiple(self, message: dict, user_ids: list) -> Dict[int, bool]:
        """Send message to multiple users, return delivery status"""
        results = {}
        for user_id in user_ids:
            results[user_id] = await self.send_personal_message(message, user_id)
        return results
    
    async def broadcast(self, message: dict, exclude: Optional[int] = None):
        """Broadcast message to all connected users"""
        for user_id, connection in self.active_connections.items():
            if user_id != exclude:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass
    
    def subscribe_to_presence(self, subscriber_id: int, target_user_id: int):
        """Subscribe to presence updates for a user"""
        if target_user_id not in self.presence_subscribers:
            self.presence_subscribers[target_user_id] = set()
        self.presence_subscribers[target_user_id].add(subscriber_id)
    
    def unsubscribe_from_presence(self, subscriber_id: int, target_user_id: int):
        """Unsubscribe from presence updates"""
        if target_user_id in self.presence_subscribers:
            self.presence_subscribers[target_user_id].discard(subscriber_id)
    
    async def _broadcast_presence(self, user_id: int, is_online: bool):
        """Notify all subscribers about user's presence change"""
        if user_id not in self.presence_subscribers:
            return
        
        presence_update = {
            "type": "presence",
            "user_id": user_id,
            "username": self.user_info.get(user_id, {}).get("username"),
            "is_online": is_online,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        for subscriber_id in self.presence_subscribers[user_id]:
            await self.send_personal_message(presence_update, subscriber_id)
    
    async def _update_last_seen(self, user_id: int):
        """Update user's last_seen in database"""
        try:
            db = SessionLocal()
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                user.last_seen = datetime.utcnow()
                db.commit()
            db.close()
        except Exception as e:
            print(f"Error updating last_seen: {e}")


manager = ConnectionManager()


@router.websocket("/chat")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...)
):
    """
    Main WebSocket endpoint for real-time messaging
    
    Message Types:
    - message: Send encrypted message
    - typing: Typing indicator
    - read_receipt: Mark message as read
    - delivery_receipt: Confirm message delivery
    - presence_subscribe: Subscribe to user's presence
    - ping: Keep-alive ping
    """
    # Authenticate user
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=1008, reason="Invalid token")
        return
    
    user_id = payload.get("user_id")
    username = payload.get("sub")
    
    await manager.connect(user_id, username, websocket)
    
    try:
        # Send connection confirmation with online contacts
        await websocket.send_json({
            "type": "connected",
            "message": "Connected to CipherLink",
            "user_id": user_id,
            "username": username,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        while True:
            data = await websocket.receive_text()
            await handle_websocket_message(user_id, username, data)
    
    except WebSocketDisconnect:
        manager.disconnect(user_id)
    except Exception as e:
        print(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(user_id)


async def handle_websocket_message(user_id: int, username: str, raw_data: str):
    """Handle incoming WebSocket messages"""
    try:
        data = json.loads(raw_data)
        msg_type = data.get("type")
        
        if msg_type == "message":
            await handle_encrypted_message(user_id, username, data)
        
        elif msg_type == "typing":
            await handle_typing_indicator(user_id, username, data)
        
        elif msg_type == "read_receipt":
            await handle_read_receipt(user_id, data)
        
        elif msg_type == "delivery_receipt":
            await handle_delivery_receipt(user_id, data)
        
        elif msg_type == "presence_subscribe":
            await handle_presence_subscribe(user_id, data)
        
        elif msg_type == "ping":
            # Respond to keep-alive ping
            await manager.send_personal_message(
                {"type": "pong", "timestamp": datetime.utcnow().isoformat()},
                user_id
            )
        
        elif msg_type == "get_online_status":
            await handle_online_status_request(user_id, data)
        
        else:
            await manager.send_personal_message(
                {"type": "error", "message": f"Unknown message type: {msg_type}"},
                user_id
            )
    
    except json.JSONDecodeError:
        await manager.send_personal_message(
            {"type": "error", "message": "Invalid JSON"},
            user_id
        )
    except Exception as e:
        print(f"Error handling message: {e}")
        await manager.send_personal_message(
            {"type": "error", "message": "Server error processing message"},
            user_id
        )


async def handle_encrypted_message(sender_id: int, sender_username: str, data: dict):
    """
    Handle encrypted message routing
    Server only sees ciphertext - never decrypts
    """
    recipient_id = data.get("recipient_id")
    encrypted_content = data.get("content")
    encrypted_key = data.get("encrypted_key")  # For hybrid encryption
    message_id = data.get("message_id")  # Client-assigned ID for tracking
    expiry_type = data.get("expiry_type", "none")
    timestamp = datetime.utcnow()
    
    # Store message in database (ciphertext only)
    db_message_id = await store_message(
        sender_id, recipient_id, encrypted_content, 
        encrypted_key, expiry_type
    )
    
    # Prepare message payload
    message_payload = {
        "type": "message",
        "message_id": db_message_id,
        "client_message_id": message_id,
        "sender_id": sender_id,
        "sender_username": sender_username,
        "content": encrypted_content,
        "encrypted_key": encrypted_key,
        "expiry_type": expiry_type,
        "timestamp": timestamp.isoformat()
    }
    
    # Try to deliver to recipient
    delivered = await manager.send_personal_message(message_payload, recipient_id)
    
    # Send delivery confirmation to sender
    await manager.send_personal_message({
        "type": "message_sent",
        "message_id": db_message_id,
        "client_message_id": message_id,
        "status": "delivered" if delivered else "sent",
        "timestamp": timestamp.isoformat()
    }, sender_id)
    
    # Update message status if delivered
    if delivered:
        await update_message_status(db_message_id, MessageStatus.DELIVERED)


async def handle_typing_indicator(sender_id: int, sender_username: str, data: dict):
    """Send typing indicator to recipient"""
    recipient_id = data.get("recipient_id")
    is_typing = data.get("is_typing", True)
    
    await manager.send_personal_message({
        "type": "typing",
        "sender_id": sender_id,
        "sender_username": sender_username,
        "is_typing": is_typing,
        "timestamp": datetime.utcnow().isoformat()
    }, recipient_id)


async def handle_read_receipt(user_id: int, data: dict):
    """Handle read receipt - notify sender that message was read"""
    message_id = data.get("message_id")
    sender_id = data.get("sender_id")
    
    # Update message status in database
    await update_message_status(message_id, MessageStatus.READ)
    
    # Notify sender
    await manager.send_personal_message({
        "type": "read_receipt",
        "message_id": message_id,
        "reader_id": user_id,
        "timestamp": datetime.utcnow().isoformat()
    }, sender_id)


async def handle_delivery_receipt(user_id: int, data: dict):
    """Confirm message was received by client"""
    message_id = data.get("message_id")
    sender_id = data.get("sender_id")
    
    await update_message_status(message_id, MessageStatus.DELIVERED)
    
    await manager.send_personal_message({
        "type": "delivery_receipt",
        "message_id": message_id,
        "delivered_to": user_id,
        "timestamp": datetime.utcnow().isoformat()
    }, sender_id)


async def handle_presence_subscribe(user_id: int, data: dict):
    """Subscribe to presence updates for specific users"""
    target_user_ids = data.get("user_ids", [])
    
    for target_id in target_user_ids:
        manager.subscribe_to_presence(user_id, target_id)
        
        # Send current presence status
        await manager.send_personal_message({
            "type": "presence",
            "user_id": target_id,
            "is_online": manager.is_online(target_id),
            "timestamp": datetime.utcnow().isoformat()
        }, user_id)


async def handle_online_status_request(user_id: int, data: dict):
    """Return online status for requested users"""
    user_ids = data.get("user_ids", [])
    
    statuses = []
    for uid in user_ids:
        statuses.append({
            "user_id": uid,
            "is_online": manager.is_online(uid)
        })
    
    await manager.send_personal_message({
        "type": "online_status",
        "statuses": statuses,
        "timestamp": datetime.utcnow().isoformat()
    }, user_id)


# ============ Database Operations ============

async def store_message(
    sender_id: int, 
    recipient_id: int, 
    encrypted_content: str,
    encrypted_key: str = None,
    expiry_type: str = "none"
) -> int:
    """Store encrypted message in database"""
    try:
        db = SessionLocal()
        
        # Calculate expiry time if needed
        expires_at = None
        if expiry_type != "none":
            from datetime import timedelta
            expiry_deltas = {
                "10s": timedelta(seconds=10),
                "1m": timedelta(minutes=1),
                "1h": timedelta(hours=1),
                "24h": timedelta(hours=24),
            }
            if expiry_type in expiry_deltas:
                expires_at = datetime.utcnow() + expiry_deltas[expiry_type]
        
        message = Message(
            sender_id=sender_id,
            recipient_id=recipient_id,
            encrypted_content=encrypted_content,
            encrypted_key=encrypted_key,
            expiry_type=expiry_type,
            expires_at=expires_at
        )
        db.add(message)
        db.commit()
        db.refresh(message)
        message_id = message.id
        db.close()
        return message_id
    except Exception as e:
        print(f"Error storing message: {e}")
        return -1


async def update_message_status(message_id: int, status: MessageStatus):
    """Update message status in database"""
    try:
        db = SessionLocal()
        message = db.query(Message).filter(Message.id == message_id).first()
        if message:
            message.status = status
            if status == MessageStatus.DELIVERED:
                message.delivered_at = datetime.utcnow()
            elif status == MessageStatus.READ:
                message.read_at = datetime.utcnow()
            db.commit()
        db.close()
    except Exception as e:
        print(f"Error updating message status: {e}")

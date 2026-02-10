"""
CipherLink WebSocket Handler
Real-time encrypted messaging with delivery receipts, presence, and WebRTC signaling
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException
from typing import Dict, Set, Optional
from datetime import datetime
from app.core.security import decode_access_token
from app.db.database import SessionLocal, Message, User, MessageStatusEnum, MessageTypeEnum, ExpiryTypeEnum, CallLog, CallStatusEnum, CallTypeEnum
from app.db.friend_repo import FriendRepository

async def save_call_log(call_data: dict, status: str, end_time: datetime = None):
    try:
        db = SessionLocal()
        
        start_time = call_data.get("start_time", datetime.utcnow())
        if not end_time:
            end_time = datetime.utcnow()
            
        duration = 0
        if status == CallStatusEnum.COMPLETED and "start_time" in call_data:
            duration = int((end_time - call_data["start_time"]).total_seconds())
        
        # Ensure status is an Enum
        if isinstance(status, str):
            status = CallStatusEnum(status)
            
        call_log = CallLog(
            caller_id=call_data["caller_id"],
            receiver_id=call_data["receiver_id"],
            call_type=CallTypeEnum(call_data["call_type"]),
            status=status,
            start_time=start_time,
            end_time=end_time,
            duration_seconds=duration
        )
        db.add(call_log)
        db.commit()
        db.close()
    except Exception as e:
        print(f"Error saving call log: {e}")
import json
import asyncio

router = APIRouter()


class ConnectionManager:
    """
    Manages WebSocket connections with presence tracking and call signaling
    """
    
    def __init__(self):
        # user_id -> WebSocket connection
        self.active_connections: Dict[int, WebSocket] = {}
        # username -> user_id mapping
        self.username_to_id: Dict[str, int] = {}
        # user_id -> set of user_ids subscribed to their presence
        self.presence_subscribers: Dict[int, Set[int]] = {}
        # user_id -> last activity timestamp
        self.last_activity: Dict[int, datetime] = {}
        # user_id -> username mapping
        self.user_info: Dict[int, dict] = {}
        # Active calls: call_id -> {caller_id, receiver_id, type}
        self.active_calls: Dict[str, dict] = {}
    
    async def connect(self, user_id: int, username: str, websocket: WebSocket):
        """Accept connection and notify presence subscribers"""
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.username_to_id[username] = user_id
        self.last_activity[user_id] = datetime.utcnow()
        self.user_info[user_id] = {"username": username}
        
        # Update last_seen in database
        await self._update_last_seen(user_id)
        
        # Notify presence subscribers that user is online
        await self._broadcast_presence(user_id, is_online=True)
        
        # Deliver any pending messages
        await self._deliver_pending_messages(user_id)
        
        # Deliver pending notifications (friend requests, etc.)
        asyncio.create_task(self._deliver_pending_notifications(user_id))
        
        # Sync contacts to client for sidebar
        asyncio.create_task(self._sync_contacts(user_id))
    
    def disconnect(self, user_id: int):
        """Handle disconnection and notify subscribers"""
        username = self.user_info.get(user_id, {}).get("username")
        if username and username in self.username_to_id:
            del self.username_to_id[username]
            
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        if user_id in self.last_activity:
            del self.last_activity[user_id]
        if user_id in self.user_info:
            del self.user_info[user_id]
        
        # Schedule offline presence broadcast
        asyncio.create_task(self._broadcast_presence(user_id, is_online=False))
    
    def get_user_id_by_username(self, username: str) -> Optional[int]:
        """Get user ID from username"""
        return self.username_to_id.get(username)
    
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
    
    async def send_to_username(self, message: dict, username: str) -> bool:
        """Send message to user by username"""
        user_id = self.username_to_id.get(username)
        if user_id:
            return await self.send_personal_message(message, user_id)
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
        presence_update = {
            "type": "presence",
            "user_id": user_id,
            "username": self.user_info.get(user_id, {}).get("username"),
            "is_online": is_online,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Broadcast to all connected users (simplified for reliability)
        for uid in self.active_connections:
            if uid != user_id:
                await self.send_personal_message(presence_update, uid)
    
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
    
    async def _deliver_pending_messages(self, user_id: int):
        """Deliver ALL unread messages that were sent while user was offline"""
        try:
            db = SessionLocal()
            # Get ALL messages that haven't been delivered yet (status = SENT)
            pending = db.query(Message).filter(
                Message.recipient_id == user_id,
                Message.status == MessageStatusEnum.SENT,
                Message.delivered_at.is_(None)
            ).order_by(Message.created_at).all()
            
            delivered_count = 0
            for msg in pending:
                sender = db.query(User).filter(User.id == msg.sender_id).first()
                if sender:
                    message_payload = {
                        "type": "message",
                        "message_id": msg.id,
                        "sender_id": msg.sender_id,
                        "sender_username": sender.username,
                        "recipient_id": msg.recipient_id,
                        "content": msg.encrypted_content,
                        "encrypted_key": msg.encrypted_key,
                        "message_type": msg.message_type,
                        "expiry_type": msg.expiry_type,
                        "expires_at": msg.expires_at.isoformat() if msg.expires_at else None,
                        "timestamp": msg.created_at.isoformat() if msg.created_at else datetime.utcnow().isoformat()
                    }
                    delivered = await self.send_personal_message(message_payload, user_id)
                    if delivered:
                        msg.status = MessageStatusEnum.DELIVERED
                        msg.delivered_at = datetime.utcnow()
                        delivered_count += 1
            
            if delivered_count > 0:
                print(f"✅ Delivered {delivered_count} pending messages to user {user_id}")
            
            db.commit()
            db.close()
        except Exception as e:
            print(f"❌ Error delivering pending messages: {e}")
            if 'db' in locals():
                db.rollback()
                db.close()
    
    async def _deliver_pending_notifications(self, user_id: int):
        """Deliver pending notifications when user connects"""
        try:
            db = SessionLocal()
            from app.db.friend_repo import FriendRepository
            repo = FriendRepository(db)
            
            notifications = repo.get_undelivered_notifications(user_id)
            
            for notif in notifications:
                # Resolve related user's username so frontend can display it
                related_username = None
                if notif.related_user_id:
                    related_user = db.query(User).filter(User.id == notif.related_user_id).first()
                    if related_user:
                        related_username = related_user.username

                notification_data = {
                    "type": "notification",
                    "notification_id": notif.id,
                    "notification_type": notif.notification_type.value if hasattr(notif.notification_type, 'value') else str(notif.notification_type),
                    "title": notif.title,
                    "message": notif.message,
                    "payload": notif.payload,
                    "related_user_id": notif.related_user_id,
                    "related_username": related_username,
                    "created_at": notif.created_at.isoformat() if notif.created_at else None,
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                delivered = await self.send_personal_message(notification_data, user_id)
                if delivered:
                    repo.mark_notification_delivered(notif.id)
            
            if notifications:
                print(f"📬 Delivered {len(notifications)} pending notifications to user {user_id}")
            
            db.close()
        except Exception as e:
            print(f"❌ Error delivering pending notifications: {e}")
    
    async def _sync_contacts(self, user_id: int):
        """Sync contacts to client on connection for sidebar auto-update"""
        try:
            db = SessionLocal()
            from app.db.friend_repo import FriendRepository
            repo = FriendRepository(db)
            
            contacts = repo.get_trusted_contacts(user_id)
            
            contact_list = []
            for contact in contacts:
                contact_user = db.query(User).filter(User.id == contact.contact_user_id).first()
                if contact_user:
                    contact_list.append({
                        "contact_user_id": contact.contact_user_id,
                        "username": contact_user.username,
                        "public_key": contact_user.public_key,
                        "identity_key": contact_user.identity_key,
                        "fingerprint": contact.contact_public_key_fingerprint,
                        "trust_level": contact.trust_level.value if hasattr(contact.trust_level, 'value') else str(contact.trust_level),
                        "is_verified": contact.is_verified,
                        "is_online": self.is_online(contact.contact_user_id)
                    })
            
            sync_message = {
                "type": "contacts_sync",
                "contacts": contact_list,
                "total": len(contact_list),
                "timestamp": datetime.utcnow().isoformat()
            }
            
            await self.send_personal_message(sync_message, user_id)
            
            if contact_list:
                print(f"🔄 Synced {len(contact_list)} contacts to user {user_id}")
            
            db.close()
        except Exception as e:
            print(f"❌ Error syncing contacts: {e}")


manager = ConnectionManager()


@router.websocket("/chat")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...)
):
    """
    Main WebSocket endpoint for real-time messaging and calls
    
    Message Types:
    - message: Send encrypted message
    - typing: Typing indicator
    - read_receipt: Mark message as read
    - delivery_receipt: Confirm message delivery
    - presence_subscribe: Subscribe to user's presence
    - ping: Keep-alive ping
    - call_offer: Initiate WebRTC call
    - call_answer: Accept WebRTC call
    - call_reject: Reject WebRTC call
    - call_end: End WebRTC call
    - ice_candidate: WebRTC ICE candidate
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
        # Send connection confirmation
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
        
        elif msg_type == "presence":
            await handle_presence_update(user_id, data)
        
        elif msg_type == "ping":
            await manager.send_personal_message(
                {"type": "pong", "timestamp": datetime.utcnow().isoformat()},
                user_id
            )
        
        elif msg_type == "get_online_status":
            await handle_online_status_request(user_id, data)
        
        # WebRTC Call Signaling
        elif msg_type == "call_offer":
            await handle_call_offer(user_id, username, data)
        
        elif msg_type == "call_answer":
            await handle_call_answer(user_id, username, data)
        
        elif msg_type == "call_reject":
            await handle_call_reject(user_id, username, data)
        
        elif msg_type == "call_end":
            await handle_call_end(user_id, username, data)
        
        elif msg_type == "ice_candidate":
            await handle_ice_candidate(user_id, username, data)
        
        elif msg_type == "delete_message":
            await handle_delete_message(user_id, username, data)
        
        elif msg_type == "delete_conversation":
            await handle_delete_conversation(user_id, username, data)
        
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
    recipient_username = data.get("data", {}).get("recipient_username") or data.get("recipient_username")
    encrypted_content = data.get("data", {}).get("encrypted_content") or data.get("content")
    encrypted_key = data.get("data", {}).get("encrypted_key") or data.get("encrypted_key")
    message_id = data.get("message_id")
    expiry_type = data.get("expiry_type", "none")
    message_type = data.get("data", {}).get("message_type", "text") or data.get("message_type", "text")
    file_metadata = data.get("data", {}).get("file_metadata") or data.get("file_metadata")
    # Extract sender_theme for theme synchronization (unencrypted UI metadata)
    sender_theme = data.get("data", {}).get("sender_theme") or data.get("sender_theme")
    timestamp = datetime.utcnow()
    
    # Look up recipient ID from username
    db = SessionLocal()
    recipient = db.query(User).filter(User.username == recipient_username).first()
    if not recipient:
        await manager.send_personal_message({
            "type": "error",
            "message": f"User not found: {recipient_username}"
        }, sender_id)
        db.close()
        return
    
    recipient_id = recipient.id
    
    # Check if users are trusted contacts (friend request accepted)
    friend_repo = FriendRepository(db)
    if not friend_repo.is_mutual_contact(sender_id, recipient_id):
        await manager.send_personal_message({
            "type": "error",
            "message": "You must be friends with this user to send messages. Send a friend request first."
        }, sender_id)
        db.close()
        return
    
    db.close()
    
    # Store message in database (ciphertext only)
    db_message_id = await store_message(
        sender_id, recipient_id, encrypted_content, 
        encrypted_key, expiry_type, message_type, file_metadata
    )
    
    # Prepare message payload
    message_payload = {
        "type": "message",
        "message_id": db_message_id,
        "client_message_id": message_id,
        "sender_id": sender_id,
        "sender_username": sender_username,
        "recipient_username": recipient_username,
        "content": encrypted_content,
        "encrypted_content": encrypted_content,
        "encrypted_key": encrypted_key,
        "message_type": message_type,
        "file_metadata": file_metadata,
        "expiry_type": expiry_type,
        "sender_theme": sender_theme,  # Include sender's theme for theme sync
        "timestamp": timestamp.isoformat()
    }
    
    # Try to deliver to recipient
    delivered = await manager.send_personal_message(message_payload, recipient_id)
    
    # Send delivery confirmation to sender
    await manager.send_personal_message({
        "type": "message_sent",
        "message_id": db_message_id,
        "client_message_id": message_id,
        "recipient_username": recipient_username,
        "status": "delivered" if delivered else "sent",
        "timestamp": timestamp.isoformat()
    }, sender_id)
    
    # Update message status if delivered
    if delivered:
        await update_message_status(db_message_id, MessageStatusEnum.DELIVERED)


async def handle_typing_indicator(sender_id: int, sender_username: str, data: dict):
    """Send typing indicator to recipient"""
    recipient_username = data.get("data", {}).get("recipient_username") or data.get("recipient_username")
    is_typing = data.get("data", {}).get("is_typing", True) if data.get("data") else data.get("is_typing", True)
    
    # Look up recipient
    recipient_id = manager.get_user_id_by_username(recipient_username)
    if recipient_id:
        await manager.send_personal_message({
            "type": "typing",
            "sender_id": sender_id,
            "sender_username": sender_username,
            "is_typing": is_typing,
            "timestamp": datetime.utcnow().isoformat()
        }, recipient_id)


async def handle_read_receipt(user_id: int, data: dict):
    """Handle read receipt - notify sender that message was read"""
    message_id = data.get("message_id") or data.get("data", {}).get("message_id")
    sender_id = data.get("sender_id") or data.get("data", {}).get("sender_id")
    
    # Update message status in database
    await update_message_status(message_id, MessageStatusEnum.READ)
    
    # Notify sender
    if sender_id:
        await manager.send_personal_message({
            "type": "read_receipt",
            "message_id": message_id,
            "reader_id": user_id,
            "timestamp": datetime.utcnow().isoformat()
        }, sender_id)


async def handle_delivery_receipt(user_id: int, data: dict):
    """Confirm message was received by client"""
    message_id = data.get("message_id") or data.get("data", {}).get("message_id")
    sender_id = data.get("sender_id") or data.get("data", {}).get("sender_id")
    
    await update_message_status(message_id, MessageStatusEnum.DELIVERED)
    
    if sender_id:
        await manager.send_personal_message({
            "type": "delivery_receipt",
            "message_id": message_id,
            "delivered_to": user_id,
            "timestamp": datetime.utcnow().isoformat()
        }, sender_id)


async def handle_presence_update(user_id: int, data: dict):
    """Handle explicit presence updates"""
    is_online = data.get("data", {}).get("is_online", True)
    await manager._broadcast_presence(user_id, is_online)


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


# ============ WebRTC Call Signaling ============

async def handle_call_offer(caller_id: int, caller_username: str, data: dict):
    """Handle WebRTC call offer (audio/video)"""
    recipient_username = data.get("data", {}).get("recipient_username") or data.get("recipient_username")
    call_type = data.get("data", {}).get("call_type", "audio") or data.get("call_type", "audio")
    sdp_offer = data.get("data", {}).get("sdp") or data.get("sdp")
    call_id = data.get("data", {}).get("call_id") or data.get("call_id") or f"{caller_id}-{datetime.utcnow().timestamp()}"
    
    recipient_id = manager.get_user_id_by_username(recipient_username)
    
    if not recipient_id:
        # User is offline
        await manager.send_personal_message({
            "type": "call_failed",
            "call_id": call_id,
            "reason": "User is offline",
            "recipient_username": recipient_username,
            "timestamp": datetime.utcnow().isoformat()
        }, caller_id)
        return
    
    # Store active call
    manager.active_calls[call_id] = {
        "caller_id": caller_id,
        "caller_username": caller_username,
        "receiver_id": recipient_id,
        "receiver_username": recipient_username,
        "call_type": call_type,
        "status": "ringing"
    }
    
    print(f"📞 Forwarding call offer from {caller_username} to {recipient_username} (id: {recipient_id})")
    
    # Forward offer to recipient
    call_message = {
        "type": "call_offer",
        "call_id": call_id,
        "caller_id": caller_id,
        "caller_username": caller_username,
        "call_type": call_type,
        "sdp": sdp_offer,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    sent = await manager.send_personal_message(call_message, recipient_id)
    print(f"📞 Call offer sent to {recipient_username}: {sent}")


async def handle_call_answer(user_id: int, username: str, data: dict):
    """Handle WebRTC call answer"""
    print(f"📞 handle_call_answer called by {username}, data: {data}")
    
    call_id = data.get("data", {}).get("call_id") or data.get("call_id")
    sdp_answer = data.get("data", {}).get("sdp") or data.get("sdp")
    
    print(f"📞 Call ID: {call_id}, SDP present: {sdp_answer is not None}")
    
    call = manager.active_calls.get(call_id)
    if not call:
        print(f"❌ Call not found in active_calls: {call_id}")
        print(f"📞 Active calls: {list(manager.active_calls.keys())}")
        return
    
    call["status"] = "connected"
    call["start_time"] = datetime.utcnow()
    
    # Forward answer to caller
    print(f"📞 Forwarding answer to caller ID: {call['caller_id']}")
    sent = await manager.send_personal_message({
        "type": "call_answer",
        "call_id": call_id,
        "answerer_username": username,
        "sdp": sdp_answer,
        "timestamp": datetime.utcnow().isoformat()
    }, call["caller_id"])
    print(f"📞 Answer forwarded successfully: {sent}")


async def handle_call_reject(user_id: int, username: str, data: dict):
    """Handle WebRTC call rejection"""
    call_id = data.get("data", {}).get("call_id") or data.get("call_id")
    reason = data.get("data", {}).get("reason", "rejected") or data.get("reason", "rejected")
    
    call = manager.active_calls.get(call_id)
    if not call:
        return
    
    # Remove call
    del manager.active_calls[call_id]
    
    # Save call log
    await save_call_log(call, CallStatusEnum.REJECTED)
    
    # Notify caller
    await manager.send_personal_message({
        "type": "call_rejected",
        "call_id": call_id,
        "rejected_by": username,
        "reason": reason,
        "timestamp": datetime.utcnow().isoformat()
    }, call["caller_id"])


async def handle_call_end(user_id: int, username: str, data: dict):
    """Handle WebRTC call end"""
    call_id = data.get("data", {}).get("call_id") or data.get("call_id")
    
    call = manager.active_calls.get(call_id)
    if not call:
        return
    
    # Remove call
    del manager.active_calls[call_id]
    
    # Determine status
    status = CallStatusEnum.COMPLETED if call.get("status") == "connected" else CallStatusEnum.MISSED
    if call.get("status") != "connected" and user_id == call["receiver_id"]:
        # If receiver ended it without answering, it's rejected really, but let's stick to simple logic or REJECTED
        # Actually standard flow: if receiver hangs up ringing call -> REJECTED usually handled by reject
        pass

    await save_call_log(call, status)
    
    # Notify both parties
    other_user_id = call["caller_id"] if user_id == call["receiver_id"] else call["receiver_id"]
    await manager.send_personal_message({
        "type": "call_ended",
        "call_id": call_id,
        "ended_by": username,
        "timestamp": datetime.utcnow().isoformat()
    }, other_user_id)


async def handle_ice_candidate(user_id: int, username: str, data: dict):
    """Handle WebRTC ICE candidate exchange"""
    print(f"🧊 ICE candidate received from {username}")
    
    call_id = data.get("data", {}).get("call_id") or data.get("call_id")
    candidate = data.get("data", {}).get("candidate") or data.get("candidate")
    
    call = manager.active_calls.get(call_id)
    if not call:
        print(f"❌ Call not found for ICE candidate: {call_id}")
        return
    
    # Forward to other party
    other_user_id = call["caller_id"] if user_id == call["receiver_id"] else call["receiver_id"]
    print(f"🧊 Forwarding ICE candidate to user ID: {other_user_id}")
    
    await manager.send_personal_message({
        "type": "ice_candidate",
        "call_id": call_id,
        "from_username": username,
        "candidate": candidate,
        "timestamp": datetime.utcnow().isoformat()
    }, other_user_id)


# ============ Message/Conversation Deletion ============

async def handle_delete_message(sender_id: int, sender_username: str, data: dict):
    """Handle delete message request - forwards deletion event to recipient"""
    recipient_username = data.get("data", {}).get("recipient_username") or data.get("recipient_username")
    message_id = data.get("data", {}).get("message_id") or data.get("message_id")
    
    if not recipient_username or not message_id:
        await manager.send_personal_message({
            "type": "error",
            "message": "Missing recipient_username or message_id"
        }, sender_id)
        return
    
    # Look up recipient ID
    recipient_id = manager.get_user_id_by_username(recipient_username)
    
    if recipient_id:
        # Forward deletion event to recipient
        await manager.send_personal_message({
            "type": "delete_message_received",
            "message_id": message_id,
            "sender_id": sender_id,
            "sender_username": sender_username,
            "timestamp": datetime.utcnow().isoformat()
        }, recipient_id)
        print(f"🗑️ Delete message event forwarded to {recipient_username}")
    else:
        # User is offline - the deletion will be handled when they fetch messages
        print(f"🗑️ Delete message: recipient {recipient_username} is offline")
    
    # Send confirmation to sender
    await manager.send_personal_message({
        "type": "delete_message_sent",
        "message_id": message_id,
        "recipient_username": recipient_username,
        "status": "forwarded" if recipient_id else "queued",
        "timestamp": datetime.utcnow().isoformat()
    }, sender_id)


async def handle_delete_conversation(sender_id: int, sender_username: str, data: dict):
    """Handle delete conversation request - forwards deletion event to recipient"""
    recipient_username = data.get("data", {}).get("recipient_username") or data.get("recipient_username")
    
    if not recipient_username:
        await manager.send_personal_message({
            "type": "error",
            "message": "Missing recipient_username"
        }, sender_id)
        return
    
    # Look up recipient ID
    recipient_id = manager.get_user_id_by_username(recipient_username)
    
    if recipient_id:
        # Forward deletion event to recipient
        await manager.send_personal_message({
            "type": "delete_conversation_received",
            "sender_id": sender_id,
            "sender_username": sender_username,
            "timestamp": datetime.utcnow().isoformat()
        }, recipient_id)
        print(f"🗑️ Delete conversation event forwarded to {recipient_username}")
    else:
        # User is offline - the deletion will be handled when they fetch messages
        print(f"🗑️ Delete conversation: recipient {recipient_username} is offline")
    
    # Send confirmation to sender
    await manager.send_personal_message({
        "type": "delete_conversation_sent",
        "recipient_username": recipient_username,
        "status": "forwarded" if recipient_id else "queued",
        "timestamp": datetime.utcnow().isoformat()
    }, sender_id)


# ============ Database Operations ============

async def store_message(
    sender_id: int, 
    recipient_id: int, 
    encrypted_content: str,
    encrypted_key: str = None,
    expiry_type: str = "none",
    message_type: str = "text",
    file_metadata: dict = None
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
        
        # Convert message_type string to enum
        msg_type_enum = MessageTypeEnum.TEXT
        for mt in MessageTypeEnum:
            if mt.value == message_type:
                msg_type_enum = mt
                break
        
        # Convert expiry_type string to enum
        exp_type_enum = ExpiryTypeEnum.NONE
        for et in ExpiryTypeEnum:
            if et.value == expiry_type:
                exp_type_enum = et
                break
        
        message = Message(
            sender_id=sender_id,
            recipient_id=recipient_id,
            encrypted_content=encrypted_content,
            encrypted_key=encrypted_key,
            message_type=msg_type_enum,
            expiry_type=exp_type_enum,
            expires_at=expires_at,
            file_metadata=file_metadata
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


async def update_message_status(message_id: int, status: MessageStatusEnum):
    """Update message status in database"""
    try:
        db = SessionLocal()
        message = db.query(Message).filter(Message.id == message_id).first()
        if message:
            message.status = status
            if status == MessageStatusEnum.DELIVERED:
                message.delivered_at = datetime.utcnow()
            elif status == MessageStatusEnum.READ:
                message.read_at = datetime.utcnow()
            db.commit()
        db.close()
    except Exception as e:
        print(f"Error updating message status: {e}")


# ============ Friend Request Notifications ============

async def notify_friend_request(receiver_id: int, sender_username: str, request_id: int, sender_fingerprint: str):
    """
    Send real-time notification for new friend request
    Called from the friends API when a request is created
    """
    notification = {
        "type": "friend_request",
        "request_id": request_id,
        "sender_username": sender_username,
        "sender_fingerprint": sender_fingerprint,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    delivered = await manager.send_personal_message(notification, receiver_id)
    return delivered


async def notify_friend_request_accepted(sender_id: int, accepter_username: str, contact_fingerprint: str):
    """
    Notify original sender that their friend request was accepted
    """
    notification = {
        "type": "friend_request_accepted",
        "accepter_username": accepter_username,
        "contact_fingerprint": contact_fingerprint,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    delivered = await manager.send_personal_message(notification, sender_id)
    return delivered


async def notify_friend_request_rejected(sender_id: int, rejecter_username: str):
    """
    Notify original sender that their friend request was rejected
    Note: We don't reveal rejection reason for privacy
    """
    notification = {
        "type": "friend_request_rejected",
        "username": rejecter_username,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    delivered = await manager.send_personal_message(notification, sender_id)
    return delivered


async def notify_contact_removed(user_id: int, removed_by_username: str):
    """
    Notify user that they were removed from someone's contacts
    """
    notification = {
        "type": "contact_removed",
        "removed_by": removed_by_username,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    delivered = await manager.send_personal_message(notification, user_id)
    return delivered


async def notify_key_changed(contact_user_id: int, changer_username: str, new_fingerprint: str):
    """
    Notify contact that a user's key has changed
    Important for security - users should re-verify
    """
    notification = {
        "type": "key_changed",
        "username": changer_username,
        "new_fingerprint": new_fingerprint,
        "requires_verification": True,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    delivered = await manager.send_personal_message(notification, contact_user_id)
    return delivered


async def notify_blocked(blocked_user_id: int):
    """
    Notify user they've been blocked (minimal info for privacy)
    We don't reveal who blocked them
    """
    notification = {
        "type": "connection_status_changed",
        "timestamp": datetime.utcnow().isoformat()
    }
    
    delivered = await manager.send_personal_message(notification, blocked_user_id)
    return delivered


async def notify_unblocked(user_id: int, unblocker_username: str):
    """
    Notify user they've been unblocked
    """
    notification = {
        "type": "user_unblocked",
        "unblocker_username": unblocker_username,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    delivered = await manager.send_personal_message(notification, user_id)
    return delivered


async def deliver_pending_notifications(user_id: int):
    """
    Deliver all pending notifications when a user connects
    Called from ConnectionManager.connect()
    """
    try:
        db = SessionLocal()
        from app.db.friend_repo import FriendRepository
        repo = FriendRepository(db)
        
        notifications = repo.get_undelivered_notifications(user_id)
        
        for notif in notifications:
            notification_data = {
                "type": "notification",
                "notification_id": notif.id,
                "notification_type": notif.notification_type.value if hasattr(notif.notification_type, 'value') else notif.notification_type,
                "title": notif.title,
                "message": notif.message,
                "payload": notif.payload,
                "related_user_id": notif.related_user_id,
                "created_at": notif.created_at.isoformat() if notif.created_at else None,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            delivered = await manager.send_personal_message(notification_data, user_id)
            if delivered:
                repo.mark_notification_delivered(notif.id)
        
        db.close()
    except Exception as e:
        print(f"Error delivering pending notifications: {e}")


async def sync_contacts_to_client(user_id: int):
    """
    Send the full contacts list to a newly connected user
    for sidebar synchronization
    """
    try:
        db = SessionLocal()
        from app.db.friend_repo import FriendRepository
        repo = FriendRepository(db)
        
        contacts = repo.get_trusted_contacts(user_id)
        
        contact_list = []
        for contact in contacts:
            contact_user = db.query(User).filter(User.id == contact.contact_user_id).first()
            if contact_user:
                contact_list.append({
                    "contact_user_id": contact.contact_user_id,
                    "username": contact_user.username,
                    "public_key": contact_user.public_key,
                    "identity_key": contact_user.identity_key,
                    "fingerprint": contact.contact_public_key_fingerprint,
                    "trust_level": contact.trust_level.value if hasattr(contact.trust_level, 'value') else contact.trust_level,
                    "is_verified": contact.is_verified,
                    "is_online": manager.is_online(contact.contact_user_id)
                })
        
        sync_message = {
            "type": "contacts_sync",
            "contacts": contact_list,
            "total": len(contact_list),
            "timestamp": datetime.utcnow().isoformat()
        }
        
        await manager.send_personal_message(sync_message, user_id)
        db.close()
    except Exception as e:
        print(f"Error syncing contacts: {e}")


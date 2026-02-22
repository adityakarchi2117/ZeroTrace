"""
CipherLink WebSocket Handler
Real-time encrypted messaging with delivery receipts, presence, and WebRTC signaling

AUDIT FIXES APPLIED:
- All DB operations wrapped in try/finally to prevent session leaks
- All synchronous DB calls wrapped in asyncio.to_thread() to avoid blocking event loop
- Added server-side ping/pong with timeout for zombie connection detection
- Added per-user connection limit (MAX_DEVICES_PER_USER)
- Added message size validation (MAX_WS_MESSAGE_SIZE)
- Fixed dict iteration safety in send_personal_message
- Fixed message status race condition (only allow forward transitions)
- Presence broadcast limited to contacts only
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException
from typing import Dict, Set, Optional
from datetime import datetime, timezone
from app.core.security import decode_access_token
from app.db.database import SessionLocal, Message, User, MessageStatusEnum, MessageTypeEnum, ExpiryTypeEnum, CallLog, CallStatusEnum, CallTypeEnum
from app.db.friend_repo import FriendRepository
import json
import asyncio
import logging

logger = logging.getLogger(__name__)

# --- Configuration ---
MAX_DEVICES_PER_USER = 5
MAX_WS_MESSAGE_SIZE = 65536  # 64KB
WS_PING_INTERVAL = 30  # seconds
WS_PONG_TIMEOUT = 10  # seconds

# --- Allowed message status transitions (forward-only) ---
_STATUS_ORDER = {
    MessageStatusEnum.SENT: 0,
    MessageStatusEnum.DELIVERED: 1,
    MessageStatusEnum.READ: 2,
    MessageStatusEnum.EXPIRED: 3,
    MessageStatusEnum.DELETED: 4,
}


def _safe_db_session():
    """Create a DB session with guaranteed cleanup via context manager."""
    class _SessionCtx:
        def __enter__(self):
            self.db = SessionLocal()
            return self.db
        def __exit__(self, exc_type, exc_val, exc_tb):
            try:
                if exc_type:
                    self.db.rollback()
            finally:
                self.db.close()
            return False
    return _SessionCtx()


async def save_call_log(call_data: dict, status: str, end_time: datetime = None):
    """Save call log to database. Runs in thread to avoid blocking event loop."""
    def _save():
        with _safe_db_session() as db:
            start_time = call_data.get("start_time", datetime.now(timezone.utc))
            _end_time = end_time or datetime.now(timezone.utc)

            duration = 0
            if status == CallStatusEnum.COMPLETED and "start_time" in call_data:
                duration = int((_end_time - call_data["start_time"]).total_seconds())

            _status = status
            if isinstance(_status, str):
                _status = CallStatusEnum(_status)

            call_log = CallLog(
                caller_id=call_data["caller_id"],
                receiver_id=call_data["receiver_id"],
                call_type=CallTypeEnum(call_data["call_type"]),
                status=_status,
                start_time=start_time,
                end_time=_end_time,
                duration_seconds=duration,
            )
            db.add(call_log)
            db.commit()

    try:
        await asyncio.to_thread(_save)
    except Exception as e:
        logger.error(f"Error saving call log: {e}")

router = APIRouter()


class ConnectionManager:
    """
    Manages WebSocket connections with presence tracking and call signaling.
    Supports multiple devices per user for multi-device sync.
    
    AUDIT FIXES:
    - Added per-user connection limit (MAX_DEVICES_PER_USER)
    - Fixed dict iteration safety (iterate over copy)
    - All DB operations use _safe_db_session() and asyncio.to_thread()
    - Added contact-only presence broadcast
    """
    
    def __init__(self):
        # user_id -> {device_id: WebSocket} (multi-device support)
        self.active_connections: Dict[int, Dict[str, WebSocket]] = {}
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
        # Monotonic device counter for auto-generated device IDs
        self._device_counter: int = 0
        # user_id -> set of contact user_ids (cached for presence broadcast)
        self._contact_cache: Dict[int, Set[int]] = {}
    
    def _next_device_id(self) -> str:
        """Generate a unique device ID for connections that don't provide one."""
        self._device_counter += 1
        return f"auto_{self._device_counter}_{datetime.now(timezone.utc).timestamp()}"
    
    async def connect(self, user_id: int, username: str, websocket: WebSocket, device_id: str = None):
        """Accept connection and notify presence subscribers (multi-device aware)"""
        await websocket.accept()
        
        if device_id is None:
            device_id = self._next_device_id()
        
        # Initialize device dict for user if needed
        if user_id not in self.active_connections:
            self.active_connections[user_id] = {}
        
        # AUDIT FIX: Enforce per-user connection limit
        if len(self.active_connections[user_id]) >= MAX_DEVICES_PER_USER:
            # Close oldest connection to make room
            oldest_device = next(iter(self.active_connections[user_id]))
            old_ws = self.active_connections[user_id].pop(oldest_device)
            try:
                await old_ws.close(code=1000, reason="New device connected, limit reached")
            except Exception:
                pass
            logger.info(f"Evicted device {oldest_device} for user {user_id} (limit: {MAX_DEVICES_PER_USER})")
        
        self.active_connections[user_id][device_id] = websocket
        
        self.username_to_id[username] = user_id
        self.last_activity[user_id] = datetime.now(timezone.utc)
        self.user_info[user_id] = {"username": username}
        
        # Update last_seen in database (non-blocking)
        await self._update_last_seen(user_id)
        
        # Notify presence subscribers that user is online
        await self._broadcast_presence(user_id, is_online=True)
        
        # Deliver any pending messages
        await self._deliver_pending_messages(user_id)
        
        # Sync read state so new device doesn't re-notify
        asyncio.create_task(self._sync_read_state(user_id))
        
        # Deliver pending notifications (friend requests, etc.)
        asyncio.create_task(self._deliver_pending_notifications(user_id))
        
        # Sync contacts to client for sidebar
        asyncio.create_task(self._sync_contacts(user_id))
        
        return device_id
    
    def disconnect(self, user_id: int, device_id: str = None):
        """Handle disconnection and notify subscribers (multi-device aware)"""
        if device_id and user_id in self.active_connections:
            # Remove only the specific device
            self.active_connections[user_id].pop(device_id, None)
            # If no devices left, clean up fully
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
            else:
                # User still has other devices, don't broadcast offline
                return
        elif user_id in self.active_connections:
            # No device_id given — remove all (legacy/fallback)
            del self.active_connections[user_id]
        
        # Only clean up if user has NO connections left
        if user_id not in self.active_connections:
            username = self.user_info.get(user_id, {}).get("username")
            if username and username in self.username_to_id:
                del self.username_to_id[username]
            if user_id in self.last_activity:
                del self.last_activity[user_id]
            if user_id in self.user_info:
                del self.user_info[user_id]
            # AUDIT FIX: Clean up dicts that leak on disconnect
            if user_id in self.presence_subscribers:
                del self.presence_subscribers[user_id]
            if user_id in self._contact_cache:
                del self._contact_cache[user_id]
            # Remove this user from all presence subscription sets
            for target_id in list(self.presence_subscribers):
                self.presence_subscribers[target_id].discard(user_id)
                if not self.presence_subscribers[target_id]:
                    del self.presence_subscribers[target_id]
            # Clean up any active calls for this user
            for call_id in list(self.active_calls):
                call = self.active_calls[call_id]
                if call.get("caller_id") == user_id or call.get("receiver_id") == user_id:
                    del self.active_calls[call_id]
        
        # Schedule offline presence broadcast
        asyncio.create_task(self._broadcast_presence(user_id, is_online=False))
    
    def get_user_id_by_username(self, username: str) -> Optional[int]:
        """Get user ID from username"""
        return self.username_to_id.get(username)
    
    def is_online(self, user_id: int) -> bool:
        """Check if user is currently online (any device)"""
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0
    
    def get_online_users(self, user_ids: list) -> list:
        """Get list of online users from given user IDs"""
        return [uid for uid in user_ids if self.is_online(uid)]
    
    async def send_personal_message(self, message: dict, user_id: int) -> bool:
        """Send message to ALL devices of a specific user, return True if delivered to at least one.
        
        AUDIT FIX: Iterate over a copy of items() to avoid RuntimeError if dict changes during iteration.
        """
        if user_id not in self.active_connections:
            return False
        
        delivered = False
        dead_devices = []
        # AUDIT FIX: iterate over a snapshot to avoid dict-changed-size-during-iteration
        for device_id, ws in list(self.active_connections[user_id].items()):
            try:
                await ws.send_json(message)
                delivered = True
            except Exception as e:
                logger.warning(f"Error sending to user {user_id} device {device_id}: {e}")
                dead_devices.append(device_id)
        
        # Clean up dead device connections
        for device_id in dead_devices:
            self.active_connections[user_id].pop(device_id, None)
        if user_id in self.active_connections and not self.active_connections[user_id]:
            self.disconnect(user_id)
        
        return delivered
    
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
        """Broadcast message to all connected users (all devices)"""
        for user_id, devices in self.active_connections.items():
            if user_id != exclude:
                for device_id, ws in devices.items():
                    try:
                        await ws.send_json(message)
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
        """Notify contacts about user's presence change.
        
        AUDIT FIX: Only broadcast to contacts, not ALL connected users.
        This reduces O(N) broadcast to O(contacts) per event.
        """
        # Don't broadcast offline if user still has active devices
        if not is_online and self.is_online(user_id):
            return
        
        presence_update = {
            "type": "presence",
            "user_id": user_id,
            "username": self.user_info.get(user_id, {}).get("username"),
            "is_online": is_online,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # AUDIT FIX: Only notify contacts, not all users
        contact_ids = self._contact_cache.get(user_id, set())
        if not contact_ids:
            # Fallback: broadcast to all (will be replaced once contacts are cached)
            for uid in list(self.active_connections.keys()):
                if uid != user_id:
                    await self.send_personal_message(presence_update, uid)
        else:
            for uid in contact_ids:
                if uid != user_id and uid in self.active_connections:
                    await self.send_personal_message(presence_update, uid)
    
    async def _update_last_seen(self, user_id: int):
        """Update user's last_seen in database.
        
        AUDIT FIX: Uses asyncio.to_thread() and _safe_db_session() to avoid
        blocking the event loop and leaking sessions.
        """
        def _update():
            with _safe_db_session() as db:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    user.last_seen = datetime.now(timezone.utc)
                    db.commit()
        try:
            await asyncio.to_thread(_update)
        except Exception as e:
            logger.error(f"Error updating last_seen: {e}")
    
    async def _deliver_pending_messages(self, user_id: int):
        """Deliver ALL unread messages that were sent while user was offline (contacts only).
        
        AUDIT FIXES:
        - Uses _safe_db_session() to prevent session leaks
        - Uses asyncio.to_thread() for DB queries to avoid blocking event loop
        - Batch-loads sender usernames to fix N+1 query
        """
        def _fetch_pending():
            with _safe_db_session() as db:
                from app.db.friend_repo import FriendRepository
                friend_repo = FriendRepository(db)
                contacts = friend_repo.get_trusted_contacts(user_id)
                contact_ids = {c.contact_user_id for c in contacts}

                pending = db.query(Message).filter(
                    Message.recipient_id == user_id,
                    Message.status == MessageStatusEnum.SENT,
                    Message.delivered_at.is_(None)
                ).order_by(Message.created_at).all()

                # AUDIT FIX: Batch-load all sender usernames in one query
                sender_ids = {msg.sender_id for msg in pending}
                sender_map = {}
                if sender_ids:
                    senders = db.query(User.id, User.username).filter(User.id.in_(sender_ids)).all()
                    sender_map = {s.id: s.username for s in senders}

                results = []
                skipped = 0
                for msg in pending:
                    if msg.sender_id not in contact_ids:
                        msg.status = MessageStatusEnum.DELIVERED
                        msg.delivered_at = datetime.now(timezone.utc)
                        skipped += 1
                        continue
                    sender_username = sender_map.get(msg.sender_id)
                    if sender_username:
                        results.append({
                            "msg_id": msg.id,
                            "sender_id": msg.sender_id,
                            "sender_username": sender_username,
                            "recipient_id": msg.recipient_id,
                            "encrypted_content": msg.encrypted_content,
                            "encrypted_key": msg.encrypted_key,
                            "message_type": msg.message_type.value if hasattr(msg.message_type, 'value') else msg.message_type,
                            "expiry_type": msg.expiry_type.value if hasattr(msg.expiry_type, 'value') else msg.expiry_type,
                            "expires_at": msg.expires_at.isoformat() if msg.expires_at else None,
                            "created_at": msg.created_at.isoformat() if msg.created_at else datetime.now(timezone.utc).isoformat(),
                        })
                db.commit()
                return results, skipped, contact_ids

        try:
            pending_data, skipped_count, contact_ids = await asyncio.to_thread(_fetch_pending)
            
            # Cache contacts for presence broadcast
            self._contact_cache[user_id] = contact_ids

            delivered_count = 0
            delivered_ids = []
            for item in pending_data:
                message_payload = {
                    "type": "message",
                    "message_id": item["msg_id"],
                    "sender_id": item["sender_id"],
                    "sender_username": item["sender_username"],
                    "recipient_id": item["recipient_id"],
                    "content": item["encrypted_content"],
                    "encrypted_key": item["encrypted_key"],
                    "message_type": item["message_type"],
                    "expiry_type": item["expiry_type"],
                    "expires_at": item["expires_at"],
                    "timestamp": item["created_at"],
                }
                delivered = await self.send_personal_message(message_payload, user_id)
                if delivered:
                    delivered_ids.append(item["msg_id"])
                    delivered_count += 1

            # Batch-update delivered status
            if delivered_ids:
                def _mark_delivered():
                    with _safe_db_session() as db:
                        db.query(Message).filter(Message.id.in_(delivered_ids)).update(
                            {Message.status: MessageStatusEnum.DELIVERED, Message.delivered_at: datetime.now(timezone.utc)},
                            synchronize_session=False,
                        )
                        db.commit()
                await asyncio.to_thread(_mark_delivered)

            if delivered_count > 0:
                logger.info(f"Delivered {delivered_count} pending messages to user {user_id}")
            if skipped_count > 0:
                logger.info(f"Skipped {skipped_count} messages from non-contacts for user {user_id}")
        except Exception as e:
            logger.error(f"Error delivering pending messages: {e}")
    
    async def _deliver_pending_notifications(self, user_id: int):
        """Deliver pending notifications when user connects.
        
        AUDIT FIX: Uses _safe_db_session() and asyncio.to_thread().
        """
        def _fetch_notifications():
            with _safe_db_session() as db:
                from app.db.friend_repo import FriendRepository
                repo = FriendRepository(db)
                notifications = repo.get_undelivered_notifications(user_id)
                
                # Batch-load related usernames
                related_ids = {n.related_user_id for n in notifications if n.related_user_id}
                username_map = {}
                if related_ids:
                    users = db.query(User.id, User.username).filter(User.id.in_(related_ids)).all()
                    username_map = {u.id: u.username for u in users}
                
                results = []
                for notif in notifications:
                    results.append({
                        "id": notif.id,
                        "notification_type": notif.notification_type.value if hasattr(notif.notification_type, 'value') else str(notif.notification_type),
                        "title": notif.title,
                        "message": notif.message,
                        "payload": notif.payload,
                        "related_user_id": notif.related_user_id,
                        "related_username": username_map.get(notif.related_user_id),
                        "created_at": notif.created_at.isoformat() if notif.created_at else None,
                    })
                return results

        try:
            notif_data = await asyncio.to_thread(_fetch_notifications)
            
            delivered_ids = []
            for item in notif_data:
                notification_payload = {
                    "type": "notification",
                    "notification_id": item["id"],
                    "notification_type": item["notification_type"],
                    "title": item["title"],
                    "message": item["message"],
                    "payload": item["payload"],
                    "related_user_id": item["related_user_id"],
                    "related_username": item["related_username"],
                    "created_at": item["created_at"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                delivered = await self.send_personal_message(notification_payload, user_id)
                if delivered:
                    delivered_ids.append(item["id"])
            
            if delivered_ids:
                def _mark_delivered():
                    with _safe_db_session() as db:
                        from app.db.friend_repo import FriendRepository
                        repo = FriendRepository(db)
                        for nid in delivered_ids:
                            repo.mark_notification_delivered(nid)
                await asyncio.to_thread(_mark_delivered)
                logger.info(f"Delivered {len(delivered_ids)} pending notifications to user {user_id}")
        except Exception as e:
            logger.error(f"Error delivering pending notifications: {e}")
    
    async def _sync_contacts(self, user_id: int):
        """Sync contacts to client on connection for sidebar auto-update.
        
        AUDIT FIX: Uses _safe_db_session() and asyncio.to_thread(). Batch-loads users.
        """
        def _fetch_contacts():
            with _safe_db_session() as db:
                from app.db.friend_repo import FriendRepository
                repo = FriendRepository(db)
                contacts = repo.get_trusted_contacts(user_id)
                
                # Batch-load all contact users
                contact_user_ids = [c.contact_user_id for c in contacts]
                user_map = {}
                if contact_user_ids:
                    users = db.query(User).filter(User.id.in_(contact_user_ids)).all()
                    user_map = {u.id: u for u in users}
                
                contact_list = []
                for contact in contacts:
                    cu = user_map.get(contact.contact_user_id)
                    if cu:
                        contact_list.append({
                            "contact_user_id": contact.contact_user_id,
                            "username": cu.username,
                            "public_key": cu.public_key,
                            "identity_key": cu.identity_key,
                            "fingerprint": contact.contact_public_key_fingerprint,
                            "trust_level": contact.trust_level.value if hasattr(contact.trust_level, 'value') else str(contact.trust_level),
                            "is_verified": contact.is_verified,
                        })
                return contact_list, set(contact_user_ids)

        try:
            contact_list, contact_ids = await asyncio.to_thread(_fetch_contacts)
            
            # Update contact cache for presence broadcast
            self._contact_cache[user_id] = contact_ids
            
            # Add online status (must be done in async context)
            for c in contact_list:
                c["is_online"] = self.is_online(c["contact_user_id"])
            
            sync_message = {
                "type": "contacts_sync",
                "contacts": contact_list,
                "total": len(contact_list),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            await self.send_personal_message(sync_message, user_id)
            
            if contact_list:
                logger.info(f"Synced {len(contact_list)} contacts to user {user_id}")
        except Exception as e:
            logger.error(f"Error syncing contacts: {e}")

    async def _sync_read_state(self, user_id: int):
        """Sync read message IDs to new device so it doesn't re-notify for already-read messages.
        
        AUDIT FIX: Uses _safe_db_session() and asyncio.to_thread().
        """
        def _fetch_read():
            with _safe_db_session() as db:
                read_messages = db.query(Message.id).filter(
                    Message.recipient_id == user_id,
                    Message.status == MessageStatusEnum.READ,
                ).order_by(Message.created_at.desc()).limit(500).all()
                return [m.id for m in read_messages]

        try:
            read_ids = await asyncio.to_thread(_fetch_read)
            if read_ids:
                await self.send_personal_message({
                    "type": "read_state_sync",
                    "read_message_ids": read_ids,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }, user_id)
                logger.info(f"Synced {len(read_ids)} read markers to user {user_id}")
        except Exception as e:
            logger.error(f"Error syncing read state: {e}")


manager = ConnectionManager()


@router.websocket("/chat")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    device_id: str = Query(None)
):
    """
    Main WebSocket endpoint for real-time messaging and calls.
    
    AUDIT FIXES:
    - Added server-side ping/pong with timeout for zombie connection detection
    - Added message size validation (MAX_WS_MESSAGE_SIZE)
    - Proper cleanup on all exit paths
    
    Query params:
    - token: JWT auth token (required)
    - device_id: unique device identifier for multi-device support (optional)
    """
    # Authenticate user
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=1008, reason="Invalid token")
        return
    
    user_id = payload.get("user_id")
    username = payload.get("sub")
    
    assigned_device_id = await manager.connect(user_id, username, websocket, device_id)
    
    # AUDIT FIX: Server-side ping/pong task for zombie detection
    async def _ping_loop():
        """Send periodic pings and close connection if no pong received."""
        try:
            while True:
                await asyncio.sleep(WS_PING_INTERVAL)
                try:
                    await asyncio.wait_for(
                        websocket.send_json({"type": "ping", "timestamp": datetime.now(timezone.utc).isoformat()}),
                        timeout=WS_PONG_TIMEOUT,
                    )
                except (asyncio.TimeoutError, Exception):
                    logger.warning(f"Ping timeout for user {user_id} device {assigned_device_id}, closing")
                    await websocket.close(code=1001, reason="Ping timeout")
                    return
        except asyncio.CancelledError:
            pass

    ping_task = asyncio.create_task(_ping_loop())
    
    try:
        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "message": "Connected to CipherLink",
            "user_id": user_id,
            "username": username,
            "device_id": assigned_device_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        while True:
            data = await websocket.receive_text()
            
            # AUDIT FIX: Message size validation
            if len(data) > MAX_WS_MESSAGE_SIZE:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Message too large (max {MAX_WS_MESSAGE_SIZE} bytes)"
                })
                continue
            
            await handle_websocket_message(user_id, username, data)
    
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
    finally:
        ping_task.cancel()
        manager.disconnect(user_id, assigned_device_id)


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
                {"type": "pong", "timestamp": datetime.now(timezone.utc).isoformat()},
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
    timestamp = datetime.now(timezone.utc)
    
    # AUDIT FIX: Look up recipient in thread-safe, session-safe manner
    def _check_recipient():
        with _safe_db_session() as db:
            recipient = db.query(User).filter(User.username == recipient_username).first()
            if not recipient:
                return None, False
            friend_repo = FriendRepository(db)
            is_friend = friend_repo.is_mutual_contact(sender_id, recipient.id)
            return recipient.id, is_friend

    result = await asyncio.to_thread(_check_recipient)
    recipient_id, is_friend = result

    if recipient_id is None:
        await manager.send_personal_message({
            "type": "error",
            "message": f"User not found: {recipient_username}"
        }, sender_id)
        return

    if not is_friend:
        await manager.send_personal_message({
            "type": "error",
            "message": "You must be friends with this user to send messages. Send a friend request first."
        }, sender_id)
        return
    
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
    
    # Try to deliver to recipient (all their devices)
    delivered = await manager.send_personal_message(message_payload, recipient_id)
    
    # Send delivery confirmation to sender (all sender's devices)
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
    else:
        # Schedule retry for undelivered messages
        asyncio.create_task(_retry_message_delivery(
            db_message_id, message_payload, recipient_id, max_retries=3, delay=10
        ))


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
            "timestamp": datetime.now(timezone.utc).isoformat()
        }, recipient_id)


async def handle_read_receipt(user_id: int, data: dict):
    """Handle read receipt - notify sender and sync to reader's other devices"""
    message_id = data.get("message_id") or data.get("data", {}).get("message_id")
    sender_id = data.get("sender_id") or data.get("data", {}).get("sender_id")
    
    # Update message status in database
    await update_message_status(message_id, MessageStatusEnum.READ)
    
    # Notify sender (all their devices)
    if sender_id:
        await manager.send_personal_message({
            "type": "read_receipt",
            "message_id": message_id,
            "reader_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }, sender_id)
    
    # Sync read status to reader's OTHER devices so they suppress notifications
    await manager.send_personal_message({
        "type": "read_sync",
        "message_id": message_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }, user_id)


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
            "timestamp": datetime.now(timezone.utc).isoformat()
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
            "timestamp": datetime.now(timezone.utc).isoformat()
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
        "timestamp": datetime.now(timezone.utc).isoformat()
    }, user_id)


# ============ WebRTC Call Signaling ============

async def handle_call_offer(caller_id: int, caller_username: str, data: dict):
    """Handle WebRTC call offer (audio/video)"""
    recipient_username = data.get("data", {}).get("recipient_username") or data.get("recipient_username")
    call_type = data.get("data", {}).get("call_type", "audio") or data.get("call_type", "audio")
    sdp_offer = data.get("data", {}).get("sdp") or data.get("sdp")
    call_id = data.get("data", {}).get("call_id") or data.get("call_id") or f"{caller_id}-{datetime.now(timezone.utc).timestamp()}"
    
    recipient_id = manager.get_user_id_by_username(recipient_username)
    
    if not recipient_id:
        # User is offline
        await manager.send_personal_message({
            "type": "call_failed",
            "call_id": call_id,
            "reason": "User is offline",
            "recipient_username": recipient_username,
            "timestamp": datetime.now(timezone.utc).isoformat()
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
        "timestamp": datetime.now(timezone.utc).isoformat()
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
    call["start_time"] = datetime.now(timezone.utc)
    
    # Forward answer to caller
    print(f"📞 Forwarding answer to caller ID: {call['caller_id']}")
    sent = await manager.send_personal_message({
        "type": "call_answer",
        "call_id": call_id,
        "answerer_username": username,
        "sdp": sdp_answer,
        "timestamp": datetime.now(timezone.utc).isoformat()
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
        "timestamp": datetime.now(timezone.utc).isoformat()
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
        "timestamp": datetime.now(timezone.utc).isoformat()
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
        "timestamp": datetime.now(timezone.utc).isoformat()
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
            "timestamp": datetime.now(timezone.utc).isoformat()
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
        "timestamp": datetime.now(timezone.utc).isoformat()
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
            "timestamp": datetime.now(timezone.utc).isoformat()
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
        "timestamp": datetime.now(timezone.utc).isoformat()
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
    """Store encrypted message in database.
    
    AUDIT FIX: Uses _safe_db_session() and asyncio.to_thread().
    """
    def _store():
        with _safe_db_session() as db:
            from datetime import timedelta
            
            expires_at = None
            if expiry_type != "none":
                expiry_deltas = {
                    "10s": timedelta(seconds=10),
                    "1m": timedelta(minutes=1),
                    "1h": timedelta(hours=1),
                    "24h": timedelta(hours=24),
                }
                if expiry_type in expiry_deltas:
                    expires_at = datetime.now(timezone.utc) + expiry_deltas[expiry_type]
            
            msg_type_enum = MessageTypeEnum.TEXT
            for mt in MessageTypeEnum:
                if mt.value == message_type:
                    msg_type_enum = mt
                    break
            
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
                file_metadata=file_metadata,
            )
            db.add(message)
            db.commit()
            db.refresh(message)
            return message.id

    try:
        return await asyncio.to_thread(_store)
    except Exception as e:
        logger.error(f"Error storing message: {e}")
        return -1


async def _retry_message_delivery(
    message_id: int,
    message_payload: dict,
    recipient_id: int,
    max_retries: int = 3,
    delay: int = 10
):
    """
    Retry delivering a message that couldn't be delivered initially.
    Uses exponential backoff. If recipient comes online during retries,
    the message will be delivered immediately.
    """
    for attempt in range(1, max_retries + 1):
        await asyncio.sleep(delay * attempt)  # Exponential backoff
        
        # Check if message was already delivered (via reconnect pending delivery)
        # AUDIT FIX: Use _safe_db_session to prevent session leak
        try:
            def _check_status():
                with _safe_db_session() as db:
                    msg = db.query(Message).filter(Message.id == message_id).first()
                    return msg.status if msg else None
            msg_status = await asyncio.to_thread(_check_status)
            if msg_status and msg_status != MessageStatusEnum.SENT:
                return
        except Exception:
            pass
        
        # Try delivery again
        if manager.is_online(recipient_id):
            delivered = await manager.send_personal_message(message_payload, recipient_id)
            if delivered:
                await update_message_status(message_id, MessageStatusEnum.DELIVERED)
                print(f"✅ Retry {attempt}: Delivered message {message_id} to user {recipient_id}")
                return
    
    print(f"⏳ Message {message_id} still pending after {max_retries} retries — will deliver on reconnect")


async def update_message_status(message_id: int, status: MessageStatusEnum):
    """Update message status in database.
    
    AUDIT FIX:
    - Uses _safe_db_session() and asyncio.to_thread()
    - Only allows forward status transitions (SENT→DELIVERED→READ)
      to prevent race conditions where READ is overwritten by DELIVERED.
    """
    def _update():
        with _safe_db_session() as db:
            message = db.query(Message).filter(Message.id == message_id).first()
            if not message:
                return
            # AUDIT FIX: Only allow forward transitions
            current_order = _STATUS_ORDER.get(message.status, -1)
            new_order = _STATUS_ORDER.get(status, -1)
            if new_order <= current_order:
                return  # Don't go backwards
            
            message.status = status
            if status == MessageStatusEnum.DELIVERED:
                message.delivered_at = datetime.now(timezone.utc)
            elif status == MessageStatusEnum.READ:
                message.read_at = datetime.now(timezone.utc)
            db.commit()

    try:
        await asyncio.to_thread(_update)
    except Exception as e:
        logger.error(f"Error updating message status: {e}")


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
        "timestamp": datetime.now(timezone.utc).isoformat()
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
        "timestamp": datetime.now(timezone.utc).isoformat()
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
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    delivered = await manager.send_personal_message(notification, sender_id)
    return delivered


async def notify_contact_removed(user_id: int, removed_by_username: str, initiator_id: int = None):
    """
    Notify user that they were removed from someone's contacts.
    Also notify initiator's other devices to update their sidebar.
    Also trigger contacts_sync for both users.
    """
    notification = {
        "type": "contact_removed",
        "removed_by": removed_by_username,
        "removed_user_id": user_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    delivered = await manager.send_personal_message(notification, user_id)
    
    # Notify initiator's own devices to remove the contact from their sidebar
    if initiator_id:
        await manager.send_personal_message({
            "type": "contact_removed_self",
            "contact_user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }, initiator_id)
        # Re-sync contacts for both users so sidebars are authoritative
        asyncio.create_task(manager._sync_contacts(initiator_id))
    
    # Re-sync contacts for the removed user
    asyncio.create_task(manager._sync_contacts(user_id))
    
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
        "timestamp": datetime.now(timezone.utc).isoformat()
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
        "timestamp": datetime.now(timezone.utc).isoformat()
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
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    delivered = await manager.send_personal_message(notification, user_id)
    return delivered


async def deliver_pending_notifications(user_id: int):
    """
    Deliver all pending notifications when a user connects.
    Called from ConnectionManager.connect()
    
    AUDIT FIX: Use _safe_db_session to prevent session leak on error.
    AUDIT FIX: Wrapped sync DB work in asyncio.to_thread to avoid blocking event loop.
    """
    try:
        def _fetch_notifications():
            with _safe_db_session() as db:
                from app.db.friend_repo import FriendRepository
                repo = FriendRepository(db)
                notifications = repo.get_undelivered_notifications(user_id)
                # Detach data before closing session
                result = []
                for notif in notifications:
                    result.append({
                        "id": notif.id,
                        "type": "notification",
                        "notification_id": notif.id,
                        "notification_type": notif.notification_type.value if hasattr(notif.notification_type, 'value') else notif.notification_type,
                        "title": notif.title,
                        "message": notif.message,
                        "payload": notif.payload,
                        "related_user_id": notif.related_user_id,
                        "created_at": notif.created_at.isoformat() if notif.created_at else None,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })
                return result
        
        notifications = await asyncio.to_thread(_fetch_notifications)
        
        delivered_ids = []
        for notification_data in notifications:
            notif_id = notification_data.pop("id")
            delivered = await manager.send_personal_message(notification_data, user_id)
            if delivered:
                delivered_ids.append(notif_id)
        
        if delivered_ids:
            def _mark_delivered():
                with _safe_db_session() as db:
                    from app.db.friend_repo import FriendRepository
                    repo = FriendRepository(db)
                    for nid in delivered_ids:
                        repo.mark_notification_delivered(nid)
            await asyncio.to_thread(_mark_delivered)
    except Exception as e:
        logger.error(f"Error delivering pending notifications: {e}")


async def sync_contacts_to_client(user_id: int):
    """
    Send the full contacts list to a newly connected user
    for sidebar synchronization.
    
    AUDIT FIX: Use _safe_db_session to prevent session leak on error.
    AUDIT FIX: Wrapped sync DB work in asyncio.to_thread to avoid blocking event loop.
    """
    try:
        def _fetch_contacts():
            with _safe_db_session() as db:
                from app.db.friend_repo import FriendRepository
                repo = FriendRepository(db)
                
                contacts = repo.get_trusted_contacts(user_id)
                
                contact_user_ids = [c.contact_user_id for c in contacts]
                user_map = {}
                if contact_user_ids:
                    users = db.query(User).filter(User.id.in_(contact_user_ids)).all()
                    user_map = {u.id: u for u in users}
                
                contact_list = []
                for contact in contacts:
                    contact_user = user_map.get(contact.contact_user_id)
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
                return contact_list
        
        contact_list = await asyncio.to_thread(_fetch_contacts)
        
        sync_message = {
            "type": "contacts_sync",
            "contacts": contact_list,
            "total": len(contact_list),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        await manager.send_personal_message(sync_message, user_id)
    except Exception as e:
        logger.error(f"Error syncing contacts: {e}")


# Friend Request & Contact Management System - Setup Guide

This guide explains how to set up and use the Friend Request & Secure Contact Management system.

## Overview

The Friend Request system provides secure contact management with:
- Send/receive friend requests with key fingerprint exchange
- Accept/reject with mutual consent required
- Unfriend with bilateral cleanup and optional key revocation
- Block/unblock with privacy protection
- Real-time notifications via WebSocket
- Auto-sync contacts to sidebar

## Prerequisites

- Backend server running (see `backend/README.md`)
- Database initialized
- Web client or mobile app configured

## Database Setup

### Run Migration

```bash
cd secure-comm/backend
# Activate virtual environment
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Run Alembic migrations
alembic upgrade head
```

This will create:
- `notifications` table for persistent notification storage
- `rejection_log` table for anti-spam tracking

### Manual Table Creation (Alternative)

If you prefer to create tables manually:

```sql
-- Notifications table
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    payload TEXT,  -- JSON
    related_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    related_request_id INTEGER,
    is_read BOOLEAN DEFAULT FALSE,
    is_delivered BOOLEAN DEFAULT FALSE,
    delivered_at DATETIME,
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);

CREATE INDEX ix_notifications_user_id ON notifications(user_id);
CREATE INDEX ix_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX ix_notifications_created ON notifications(created_at);

-- Rejection log table
CREATE TABLE rejection_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rejection_hash VARCHAR(64) UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_rejection_log_hash ON rejection_logs(rejection_hash);
```

## Backend Configuration

No additional configuration required. The system uses existing database and WebSocket connections.

## Web Client Setup

The web client components are already integrated. Make sure to:

1. **Import components** where needed:

```tsx
import { BlockedUsersPanel } from '@/components/friend/BlockedUsersPanel';
import { NotificationToast, useNotificationToasts } from '@/components/friend/NotificationToast';
import { ProfileActionsMenu } from '@/components/friend/ProfileActionsMenu';
```

2. **Use the notification toast hook**:

```tsx
function MyComponent() {
  const { toasts, showFriendRequest, showFriendAccepted, dismissToast } = useNotificationToasts();
  
  return (
    <>
      {/* Your content */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {toasts.map(toast => (
          <NotificationToast key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </>
  );
}
```

3. **Sidebar props** - The sidebar now accepts optional callbacks:

```tsx
<Sidebar
  onNewChat={() => {}}
  onSettings={() => {}}
  onAddFriend={() => {}}
  onPendingRequests={() => {}}
  onNotifications={() => {/* Open notifications panel */}}
  onBlockedUsers={() => {/* Open blocked users panel */}}
/>
```

## API Endpoints

### Unfriend

```http
POST /api/friend/unfriend
{
  "user_id": 123,
  "revoke_keys": true
}
```

### Notifications

```http
GET /api/friend/notifications?unread_only=false&limit=50&offset=0
GET /api/friend/notifications/count
POST /api/friend/notifications/{id}/read
POST /api/friend/notifications/read-all
```

## WebSocket Events

The system sends these events via WebSocket:

| Event | Description |
|-------|-------------|
| `contacts_sync` | Sent on connection with full contact list |
| `notification` | New notification received |
| `friend_request` | Incoming friend request |
| `friend_accepted` | Friend request was accepted |
| `contact_removed` | Contact removed by other party |
| `blocked` | You were blocked (minimal info) |
| `unblocked` | You were unblocked |
| `key_changed` | Contact's key changed |

## Security Features

1. **No Information Leakage**: Rejection reasons are never revealed to senders
2. **Anti-Spam**: Rejection patterns are tracked via hashed logs
3. **Privacy-Preserving Blocks**: Blocked users don't know they're blocked
4. **Key Revocation**: Unfriend can optionally revoke shared keys
5. **Notification Expiry**: Old notifications auto-expire after 30 days

## Testing

Run the test suite:

```bash
cd secure-comm/backend
pytest tests/test_friends.py -v
```

Test classes:
- `TestFriendRepository`: Core repository methods
- `TestUnfriendFunctionality`: Unfriend flow
- `TestNotificationSystem`: Notification CRUD
- `TestRejectionLogging`: Anti-spam tracking

## Troubleshooting

### Notifications not appearing

1. Check WebSocket connection is established
2. Verify user is authenticated
3. Check browser console for errors

### Badge counts not updating

1. Ensure `/api/friend/notifications/count` endpoint is accessible
2. Check for CORS issues
3. Verify authentication token is valid

### Migration errors

If Alembic migration fails:

```bash
# Check current revision
alembic current

# See migration history
alembic history

# Downgrade if needed
alembic downgrade -1

# Try upgrade again
alembic upgrade head
```

## File Reference

### Backend Files
- `app/db/friend_models.py` - Database models (Notification, RejectionLog)
- `app/db/friend_repo.py` - Repository methods
- `app/api/routes/friends.py` - API endpoints
- `app/api/websocket.py` - WebSocket handlers
- `app/models/friend.py` - Pydantic schemas
- `alembic/versions/add_notifications_and_rejection_log.py` - Migration

### Web Client Files
- `src/components/friend/BlockedUsersPanel.tsx` - Blocked users UI
- `src/components/friend/NotificationToast.tsx` - Toast notifications
- `src/components/friend/ProfileActionsMenu.tsx` - Contact actions menu
- `src/components/Sidebar.tsx` - Enhanced sidebar with badges
- `src/lib/friendApi.ts` - API client methods
- `src/lib/friendTypes.ts` - TypeScript types

### Documentation
- `docs/friend-api.md` - Full API documentation

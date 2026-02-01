# Friend Request System - API Documentation

## Overview

The Friend Request System provides secure contact management with end-to-end encryption key exchange. Only mutually accepted users can start encrypted conversations.

## Security Features

- **No Public Directory**: Users cannot be discovered without explicit search
- **Rate Limiting**: 50 friend requests/day, 100 searches/day per user
- **Request Expiry**: Friend requests expire after 48 hours
- **Nonce-Based Replay Protection**: Each request includes a unique nonce
- **Key Fingerprint Verification**: SHA-256 fingerprints for MITM protection
- **Mutual Consent**: Both users must agree before key exchange

## Base URL

```
/api/friend
```

## Authentication

All endpoints require JWT authentication via Bearer token:

```
Authorization: Bearer <access_token>
```

---

## Endpoints

### Send Friend Request

Create a new friend request with optional message.

```http
POST /api/friend/request
```

**Request Body:**
```json
{
  "receiver_username": "string (required)",
  "sender_public_key_fingerprint": "string (required, SHA-256 hex)",
  "message": "string (optional, max 200 chars)"
}
```

**Response (201 Created):**
```json
{
  "request_id": 1,
  "sender_id": 123,
  "sender_username": "alice",
  "receiver_id": 456,
  "receiver_username": "bob",
  "status": "pending",
  "sender_public_key_fingerprint": "abc123...",
  "message": "Hi, let's connect!",
  "nonce": "unique-nonce-value",
  "created_at": "2024-01-15T10:30:00Z",
  "expires_at": "2024-01-17T10:30:00Z"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid input, user not found, already contacts
- `429 Too Many Requests`: Rate limit exceeded

---

### Accept Friend Request

Accept an incoming friend request and establish trusted contact.

```http
POST /api/friend/accept/{request_id}
```

**Path Parameters:**
- `request_id`: Integer ID of the friend request

**Request Body:**
```json
{
  "receiver_public_key_fingerprint": "string (required, SHA-256 hex)"
}
```

**Response (200 OK):**
```json
{
  "contact_id": 1,
  "user_id": 123,
  "contact_user_id": 456,
  "contact_username": "alice",
  "contact_public_key": "public-key-data",
  "contact_public_key_fingerprint": "abc123...",
  "trust_level": "standard",
  "is_verified": false,
  "established_at": "2024-01-15T11:00:00Z"
}
```

**Error Responses:**
- `400 Bad Request`: Request expired, already processed
- `403 Forbidden`: Not authorized to accept this request
- `404 Not Found`: Request not found

---

### Reject Friend Request

Reject an incoming friend request.

```http
POST /api/friend/reject/{request_id}
```

**Path Parameters:**
- `request_id`: Integer ID of the friend request

**Response (200 OK):**
```json
{
  "message": "Friend request rejected"
}
```

---

### Cancel Friend Request

Cancel an outgoing friend request you sent.

```http
DELETE /api/friend/request/{request_id}
```

**Path Parameters:**
- `request_id`: Integer ID of the friend request

**Response (200 OK):**
```json
{
  "message": "Friend request cancelled"
}
```

---

### Get Pending Requests

Retrieve pending friend requests (incoming or outgoing).

```http
GET /api/friend/pending?direction={incoming|outgoing}
```

**Query Parameters:**
- `direction`: Either `incoming` (default) or `outgoing`

**Response (200 OK):**
```json
[
  {
    "request_id": 1,
    "sender_id": 123,
    "sender_username": "alice",
    "receiver_id": 456,
    "receiver_username": "bob",
    "status": "pending",
    "sender_public_key_fingerprint": "abc123...",
    "message": "Hi!",
    "created_at": "2024-01-15T10:30:00Z",
    "expires_at": "2024-01-17T10:30:00Z"
  }
]
```

---

### Get Trusted Contacts

Retrieve all trusted contacts for the authenticated user.

```http
GET /api/friend/list
```

**Response (200 OK):**
```json
[
  {
    "contact_id": 1,
    "user_id": 123,
    "contact_user_id": 456,
    "contact_username": "bob",
    "contact_public_key": "public-key-data",
    "contact_public_key_fingerprint": "xyz789...",
    "trust_level": "high",
    "is_verified": true,
    "established_at": "2024-01-15T11:00:00Z"
  }
]
```

---

### Search Users

Search for users by username.

```http
GET /api/friend/search?q={query}
```

**Query Parameters:**
- `q`: Search query (min 2 characters)

**Response (200 OK):**
```json
[
  {
    "user_id": 456,
    "username": "bob",
    "public_key_fingerprint": "xyz789...",
    "is_contact": false,
    "has_pending_request": false
  }
]
```

**Notes:**
- Excludes the searching user
- Excludes blocked users
- Rate limited to 100 searches/day

---

### Block User

Block a user from contacting you.

```http
POST /api/friend/block
```

**Request Body:**
```json
{
  "user_id": 456,
  "reason": "string (optional)"
}
```

**Response (200 OK):**
```json
{
  "message": "User blocked successfully"
}
```

**Side Effects:**
- Removes any existing contact relationship
- Cancels any pending friend requests

---

### Unblock User

Remove a user from your block list.

```http
DELETE /api/friend/block/{user_id}
```

**Path Parameters:**
- `user_id`: ID of the blocked user

**Response (200 OK):**
```json
{
  "message": "User unblocked successfully"
}
```

---

### Get Blocked Users

Retrieve list of blocked users.

```http
GET /api/friend/blocked
```

**Response (200 OK):**
```json
[
  {
    "blocked_user_id": 456,
    "blocked_username": "spammer",
    "blocked_at": "2024-01-10T08:00:00Z",
    "reason": "Spam messages"
  }
]
```

---

### Remove Contact

Remove a user from your trusted contacts.

```http
DELETE /api/friend/contact/{contact_user_id}
```

**Path Parameters:**
- `contact_user_id`: User ID of the contact to remove

**Response (200 OK):**
```json
{
  "message": "Contact removed successfully"
}
```

**Notes:**
- Removes contact mutually (both users lose the connection)
- Does not block the user

---

### Verify Contact

Mark a contact as verified after out-of-band key verification.

```http
POST /api/friend/verify
```

**Request Body:**
```json
{
  "contact_user_id": 456,
  "verification_method": "manual_fingerprint",
  "verified_fingerprint": "xyz789..."
}
```

**Response (200 OK):**
```json
{
  "message": "Contact verified successfully"
}
```

**Verification Methods:**
- `manual_fingerprint`: User compared fingerprints out-of-band
- `qr_code`: User scanned contact's QR code
- `video_call`: Verified during video call

---

### Process QR Code Scan

Add a contact via QR code scan.

```http
POST /api/friend/qr-scan
```

**Request Body:**
```json
{
  "user_id": 456,
  "username": "bob",
  "public_key_fingerprint": "xyz789...",
  "timestamp": "2024-01-15T10:30:00Z",
  "nonce": "unique-qr-nonce"
}
```

**Response (200 OK):**
```json
{
  "message": "Contact added via QR code",
  "contact": {
    "contact_id": 1,
    "contact_username": "bob",
    "contact_public_key_fingerprint": "xyz789...",
    "is_verified": true
  }
}
```

**Notes:**
- QR codes expire after 5 minutes
- Automatically marks contact as verified

---

## WebSocket Events

Friend-related real-time notifications are sent via WebSocket:

### friend_request_received
```json
{
  "type": "friend_request_received",
  "data": {
    "request_id": 1,
    "sender_username": "alice",
    "sender_public_key_fingerprint": "abc123...",
    "message": "Hi!"
  }
}
```

### friend_request_accepted
```json
{
  "type": "friend_request_accepted",
  "data": {
    "request_id": 1,
    "accepter_username": "bob",
    "accepter_public_key_fingerprint": "xyz789..."
  }
}
```

### friend_request_rejected
```json
{
  "type": "friend_request_rejected",
  "data": {
    "request_id": 1
  }
}
```

### contact_removed
```json
{
  "type": "contact_removed",
  "data": {
    "removed_by_user_id": 123,
    "removed_by_username": "alice"
  }
}
```

### key_changed
```json
{
  "type": "key_changed",
  "data": {
    "user_id": 123,
    "username": "alice",
    "new_fingerprint": "newxyz789..."
  }
}
```

---

## Rate Limits

| Action | Limit | Window |
|--------|-------|--------|
| Friend Requests | 50 | 24 hours |
| User Searches | 100 | 24 hours |

When rate limited, the API returns:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 3600
```

---

## Key Fingerprint Format

Key fingerprints are SHA-256 hashes of public keys, displayed as:
- **Full**: `a1b2c3d4 e5f6g7h8 i9j0k1l2 m3n4o5p6 q7r8s9t0 u1v2w3x4 y5z6a7b8 c9d0e1f2`
- **Short**: `a1b2c3d4...c9d0e1f2`

### Computing Fingerprint (Python)
```python
import hashlib

def compute_key_fingerprint(public_key: str) -> str:
    return hashlib.sha256(public_key.encode()).hexdigest()
```

### Computing Fingerprint (TypeScript)
```typescript
import CryptoJS from 'crypto-js';

function computeKeyFingerprint(publicKey: string): string {
  return CryptoJS.SHA256(publicKey).toString();
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_REQUEST` | Request validation failed |
| `USER_NOT_FOUND` | Target user does not exist |
| `ALREADY_CONTACTS` | Users are already contacts |
| `PENDING_REQUEST_EXISTS` | A pending request already exists |
| `REQUEST_EXPIRED` | Friend request has expired |
| `USER_BLOCKED` | User has been blocked |
| `RATE_LIMITED` | Rate limit exceeded |
| `UNAUTHORIZED` | Not authorized for this action |

---

## Setup Instructions

### Backend Setup

1. Install dependencies:
```bash
cd secure-comm/backend
pip install -r requirements.txt
```

2. Initialize database:
```bash
python init_db.py
```

3. Run the server:
```bash
python run.py
```

### Running Tests

```bash
cd secure-comm/backend
pytest tests/test_friends.py -v
```

### Environment Variables

```env
DATABASE_URL=sqlite:///./zerotrace.db
SECRET_KEY=your-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

---

## Security Recommendations

1. **Always verify fingerprints** through a trusted out-of-band channel
2. **Never share fingerprints** over unencrypted channels
3. **Report mismatched fingerprints** immediately - may indicate MITM attack
4. **Regularly rotate keys** and notify contacts of key changes
5. **Use QR codes** when possible for in-person verification

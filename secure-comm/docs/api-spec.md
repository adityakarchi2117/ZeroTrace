# API Specification

## Authentication

### POST `/api/auth/register`
Create a new user.
- **Body**: `{ "username": "...", "password": "...", "email": "..." }`

### POST `/api/auth/login`
Get access token.
- **Body**: form-data `{ username, password }`
- **Response**: `{ "access_token": "...", "token_type": "bearer" }`

## Keys

### POST `/api/keys/upload`
Upload user's public key.
- **Header**: `Authorization: Bearer <token>`
- **Body**: `{ "public_key": "<base64_string>" }`

### GET `/api/keys/{username}`
Get a user's public key.
- **Response**: `{ "username": "...", "public_key": "..." }`

## Messages

### POST `/api/messages/send`
Send an encrypted message (stored for history).
- **Body**: `{ "recipient_username": "...", "encrypted_content": "..." }`

### GET `/api/messages/conversation/{username}`
Get message history.

# ZeroTrace Backend API

🔐 **Private by design. Secure by default.**

End-to-end encrypted communication platform backend built with FastAPI.

## Features

- 🔑 **Signal Protocol-style Key Exchange (X3DH)** - Secure key establishment
- 💬 **Hybrid Encryption** - X25519 ECDH + AES-256-GCM
- ⏳ **Ephemeral Messages** - Auto-expiring messages
- 🔒 **Secure Vault** - Encrypted personal storage
- 📱 **Real-time WebSocket** - Instant message delivery
- 🔄 **Perfect Forward Secrecy** - One-time pre-keys
- 🛡️ **Zero-Knowledge Server** - No plaintext storage

## Tech Stack

- **Framework**: FastAPI 0.104+
- **Database**: SQLAlchemy with SQLite (dev) / PostgreSQL (prod)
- **Crypto**: cryptography, PyNaCl
- **Auth**: JWT with python-jose
- **WebSocket**: FastAPI WebSocket support
- **Password Hashing**: bcrypt via passlib

## Quick Start

### Prerequisites

- Python 3.12+
- pip

### Installation

1. **Clone and navigate to backend**
   ```bash
   cd secure-comm/backend
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\\Scripts\\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Run the server**
   ```bash
   python run.py
   ```

The API will be available at `http://localhost:8000`

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Project Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.py          # Authentication endpoints
│   │   │   ├── keys.py          # Key management
│   │   │   ├── messages.py      # Message endpoints
│   │   │   └── vault.py         # Secure vault
│   │   └── websocket.py         # Real-time WebSocket
│   ├── core/
│   │   ├── config.py            # Configuration
│   │   ├── crypto.py            # Cryptographic utilities
│   │   └── security.py          # Auth & password handling
│   ├── db/
│   │   ├── database.py          # SQLAlchemy models
│   │   ├── user_repo.py         # User repository
│   │   └── message_repo.py      # Message repository
│   ├── models/
│   │   ├── user.py              # User Pydantic models
│   │   ├── message.py           # Message Pydantic models
│   │   └── vault.py             # Vault Pydantic models
│   ├── services/
│   │   ├── key_service.py       # Key management logic
│   │   └── message_service.py   # Message logic
│   └── main.py                  # FastAPI application
├── tests/
│   └── __init__.py
├── .env.example
├── .gitignore
├── requirements.txt
├── run.py                       # Development server
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user

### Key Management
- `POST /api/keys/upload` - Upload cryptographic keys
- `POST /api/keys/prekeys/refill` - Refill one-time pre-keys
- `GET /api/keys/prekeys/count` - Get pre-key count
- `GET /api/keys/bundle/{username}` - Get key bundle for encryption
- `GET /api/keys/{username}` - Get public key

### Messages
- `POST /api/messages/send` - Send encrypted message
- `GET /api/messages/conversation/{username}` - Get conversation
- `GET /api/messages/unread` - Get unread messages

### Secure Vault
- `POST /api/vault/items` - Create vault item
- `GET /api/vault/items` - List vault items
- `GET /api/vault/items/{id}` - Get specific item
- `PUT /api/vault/items/{id}` - Update item
- `DELETE /api/vault/items/{id}` - Delete item
- `POST /api/vault/sync` - Sync vault

### WebSocket
- `WS /ws/chat?token={jwt}` - Real-time messaging

## Security Architecture

### Zero-Knowledge Design
- Server never sees plaintext messages
- All encryption/decryption happens client-side
- Server only stores ciphertext and public keys

### Key Management
- **Identity Key**: Long-term Ed25519 signing key
- **Signed Pre-Key**: X25519 key signed by identity key
- **One-Time Pre-Keys**: Consumable X25519 keys for PFS

### Message Encryption
1. Client fetches recipient's key bundle
2. X3DH key exchange establishes shared secret
3. Message encrypted with AES-256-GCM
4. Server routes encrypted message
5. Recipient decrypts with their private keys

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `SECRET_KEY` - JWT signing key (generate with `openssl rand -hex 32`)
- `DATABASE_URL` - Database connection string
- `ALLOWED_ORIGINS` - CORS allowed origins

## Database

### Development (SQLite)
Automatically created on first run: `cipherlink.db`

### Production (PostgreSQL)
```bash
# Update .env
DATABASE_URL=postgresql://user:password@localhost:5432/cipherlink

# Run migrations (if using Alembic)
alembic upgrade head
```

## Testing

```bash
pytest
```

## Production Deployment

### Using Gunicorn

```bash
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

### Using Docker

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["gunicorn", "app.main:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

## Contributing

1. Follow PEP 8 style guide
2. Add type hints to all functions
3. Write docstrings for public APIs
4. Add tests for new features

## License

See main project LICENSE file.

## Security Notice

⚠️ **Important**: This is a demonstration project. For production use:
- Use strong SECRET_KEY
- Enable HTTPS/TLS
- Use production-grade database
- Implement rate limiting
- Add input sanitization
- Regular security audits
- Keep dependencies updated

## Support

For issues and questions, please open an issue on GitHub.

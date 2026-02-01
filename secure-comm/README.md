# 🔐 CipherLink - Private by Design. Secure by Default.

**End-to-end encrypted communication platform with zero-knowledge server architecture.**

CipherLink is a privacy-first messaging platform that implements Signal Protocol-inspired encryption, ensuring that only you and your intended recipients can read your messages. The server never sees your plaintext data.

## ✨ Features

### 🛡️ Security & Privacy
- **End-to-end encryption** using X25519 + Ed25519 cryptography
- **Zero-knowledge server** - plaintext never touches the server
- **Perfect Forward Secrecy** with rotating one-time prekeys
- **Signal Protocol** inspired key exchange (X3DH)
- **Authenticated encryption** prevents message tampering

### 💬 Messaging
- **Real-time messaging** via WebSockets
- **Ephemeral messages** with auto-expiry (10s, 1m, 1h, 24h, after-read)
- **Delivery & read receipts** with privacy controls
- **Typing indicators** 
- **File sharing** (encrypted)
- **Message threading** and replies

### 🔒 Secure Vault
- **Encrypted personal storage** for sensitive data
- **Multiple item types** (notes, passwords, documents, credentials)
- **Version control** and conflict resolution
- **Incremental sync** across devices

### 🌐 Multi-Platform
- **Web App** (Next.js + React)
- **Mobile App** (React Native for iOS/Android)
- **Desktop Client** (Streamlit for quick prototyping)

### 👥 User Management
- **Cryptographic identity** (no traditional passwords for encryption)
- **Contact management** with blocking/verification
- **Multi-device support** with QR code pairing
- **User search** and discovery

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │  Mobile Client  │    │ Desktop Client  │
│   (Next.js)     │    │ (React Native)  │    │  (Streamlit)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │     FastAPI Backend       │
                    │   (Zero-Knowledge)        │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │    PostgreSQL/SQLite      │
                    │   (Encrypted Data Only)   │
                    └───────────────────────────┘
```

### Security Model
- **Client-side encryption**: All encryption/decryption happens on user devices
- **Server blindness**: Server only stores and routes encrypted data
- **Key isolation**: Private keys never leave user devices
- **Forward secrecy**: Compromise of long-term keys doesn't expose past messages

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 16+
- npm or yarn
- Git

### Automated Setup
```bash
# Clone the repository
git clone https://github.com/your-org/zerotrace.git
cd zerotrace

# Run automated setup
python3 setup.py

# Start the platform
./run-backend.sh    # Terminal 1: API server
./run-web.sh        # Terminal 2: Web client
./run-mobile.sh     # Terminal 3: Mobile app (optional)
```

### Manual Setup

#### Backend (FastAPI)
```bash
cd secure-comm/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
# Edit .env with your configuration

# Initialize database
python -c "from app.db.database import engine, Base; Base.metadata.create_all(bind=engine)"

# Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Web Client (Next.js)
```bash
cd secure-comm/web-client

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
# Edit .env.local with your configuration

# Start development server
npm run dev
```

#### Mobile App (React Native)
```bash
cd secure-comm/mobile-app

# Install dependencies
npm install

# iOS (macOS only)
cd ios && pod install && cd ..
npm run ios

# Android
npm run android
```

### Docker Setup
```bash
# Start all services
docker-compose up

# Or build and start
docker-compose up --build
```

## 📱 Usage

### 1. Registration
- Create account with username/email/password
- Client automatically generates cryptographic keys
- Public keys uploaded to server, private keys stay local

### 2. Adding Contacts
- Search users by username
- Add contacts to start conversations
- Verify identity through key fingerprints

### 3. Messaging
- Select contact to start conversation
- Messages encrypted automatically before sending
- Real-time delivery with WebSocket connection
- Set message expiry for ephemeral messaging

### 4. Secure Vault
- Store sensitive data encrypted locally
- Sync across devices with end-to-end encryption
- Organize with tags and categories

## 🔧 Configuration

### Backend (.env)
```bash
# Database
DATABASE_URL=sqlite:///./secure_comm.db
# DATABASE_URL=postgresql://user:pass@localhost/zerotrace

# Security
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Environment
ENVIRONMENT=development
ALLOWED_ORIGINS=["http://localhost:3000"]
ALLOWED_HOSTS=["localhost", "127.0.0.1"]
```

### Web Client (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
NEXT_PUBLIC_ENVIRONMENT=development
```

## 🛠️ Development

### Project Structure
```
secure-comm/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/            # API routes
│   │   ├── core/           # Core utilities
│   │   ├── db/             # Database models
│   │   ├── models/         # Pydantic models
│   │   ├── services/       # Business logic
│   │   └── utils/          # Utilities
│   ├── tests/              # Backend tests
│   └── requirements.txt
├── web-client/             # Next.js web app
│   ├── src/
│   │   ├── app/            # Next.js app router
│   │   ├── components/     # React components
│   │   └── lib/            # Client libraries
│   └── package.json
├── mobile-app/             # React Native app
│   ├── src/
│   │   ├── screens/        # App screens
│   │   ├── components/     # React Native components
│   │   ├── navigation/     # Navigation setup
│   │   ├── services/       # API services
│   │   └── utils/          # Utilities
│   └── package.json
├── streamlit-client/       # Streamlit demo client
└── docs/                   # Documentation
```

### API Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

#### Key Management
- `POST /api/keys/upload` - Upload public keys
- `GET /api/keys/bundle/{username}` - Get key bundle for encryption
- `GET /api/keys/{username}` - Get user's public key
- `POST /api/keys/prekeys/refill` - Refill one-time prekeys

#### Messages
- `POST /api/messages/send` - Send encrypted message
- `GET /api/messages/conversation/{username}` - Get conversation history
- `GET /api/messages/unread` - Get unread messages

#### Contacts
- `GET /api/contacts` - List contacts
- `POST /api/contacts` - Add contact
- `GET /api/contacts/search` - Search users

#### Secure Vault
- `GET /api/vault/items` - List vault items
- `POST /api/vault/items` - Create vault item
- `PUT /api/vault/items/{id}` - Update vault item

#### WebSocket
- `WS /ws/chat` - Real-time messaging

### Testing
```bash
# Backend tests
cd secure-comm/backend
python -m pytest tests/

# Web client tests
cd secure-comm/web-client
npm test

# Mobile app tests
cd secure-comm/mobile-app
npm test
```

## 🔒 Security

### Cryptographic Primitives
- **X25519**: Elliptic Curve Diffie-Hellman key exchange
- **Ed25519**: Digital signatures
- **AES-256-GCM**: Symmetric encryption (via NaCl secretbox)
- **SHA-256**: Cryptographic hashing
- **PBKDF2**: Key derivation from passwords

### Key Management
- **Identity Key**: Long-term Ed25519 signing key
- **Signed Pre-Key**: X25519 key signed by identity key (rotated weekly)
- **One-Time Pre-Keys**: Consumable X25519 keys for Perfect Forward Secrecy
- **Ephemeral Keys**: Per-message keys for forward secrecy

### Threat Model
**Protected Against:**
- Server compromise (zero-knowledge design)
- Network eavesdropping (end-to-end encryption)
- Message tampering (authenticated encryption)
- Replay attacks (nonces and timestamps)
- Forward compromise (Perfect Forward Secrecy)

**Not Protected Against:**
- Endpoint compromise (malware on user device)
- Social engineering attacks
- Physical device access
- Quantum computers (post-quantum crypto planned)

## 🚢 Deployment

### Production Checklist
- [ ] Use PostgreSQL instead of SQLite
- [ ] Set strong SECRET_KEY
- [ ] Enable HTTPS/TLS
- [ ] Configure CORS properly
- [ ] Set up monitoring and logging
- [ ] Configure backups
- [ ] Set up CI/CD pipeline
- [ ] Security audit
- [ ] Load testing

### Docker Production
```bash
# Production docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes
```bash
# Deploy to Kubernetes
kubectl apply -f k8s/
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Development Guidelines
- Follow existing code style
- Add tests for new features
- Update documentation
- Ensure security best practices
- Test on multiple platforms

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Signal Protocol** for cryptographic inspiration
- **NaCl/libsodium** for cryptographic primitives
- **FastAPI** for the excellent Python web framework
- **Next.js** for the React framework
- **React Native** for cross-platform mobile development

## 📞 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/your-org/zerotrace/issues)
- **Security**: security@zerotrace.app
- **General**: hello@zerotrace.app

---

**ZeroTrace** - Because privacy is not optional. 🔐
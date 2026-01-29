# 🚀 CipherLink Quick Start Guide

Get CipherLink running in 5 minutes!

## 🎯 One-Command Setup

```bash
# Run the automated setup
python setup.py
```

This will:
- ✅ Check requirements (Python, Node.js, npm)
- ✅ Set up Python backend with virtual environment
- ✅ Install all dependencies
- ✅ Configure environment variables
- ✅ Initialize database
- ✅ Set up Next.js web client
- ✅ Create run scripts
- ✅ Generate Docker configuration

## 🏃‍♂️ Start the Platform

### Option 1: Run Scripts (Recommended)

**Windows:**
```cmd
run-backend.bat    # Start API server
run-web.bat        # Start web client (new terminal)
```

**Linux/macOS:**
```bash
./run-backend.sh   # Start API server
./run-web.sh       # Start web client (new terminal)
```

### Option 2: Manual Commands

**Backend:**
```bash
cd secure-comm/backend
source venv/bin/activate  # Windows: venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Web Client:**
```bash
cd secure-comm/web-client
npm run dev
```

### Option 3: Docker
```bash
docker-compose up
```

## 🌐 Access the Platform

- **Web App**: http://localhost:3000
- **API Server**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## 🔐 First Steps

1. **Register Account**
   - Go to http://localhost:3000
   - Click "Sign Up"
   - Enter username, email, password
   - Keys are generated automatically

2. **Add Contacts**
   - Search for other users
   - Add them to start conversations

3. **Start Messaging**
   - Click on a contact
   - Send encrypted messages
   - Messages are encrypted automatically

## 🛠️ Development URLs

| Service | URL | Description |
|---------|-----|-------------|
| Web App | http://localhost:3000 | Next.js frontend |
| API | http://localhost:8000 | FastAPI backend |
| API Docs | http://localhost:8000/docs | Interactive API documentation |
| WebSocket | ws://localhost:8000/ws | Real-time messaging |

## 🔧 Configuration Files

- **Backend**: `secure-comm/backend/.env`
- **Web Client**: `secure-comm/web-client/.env.local`
- **Docker**: `docker-compose.yml`

## 📱 Mobile App (Optional)

```bash
cd secure-comm/mobile-app
npm install

# iOS (macOS only)
npm run ios

# Android
npm run android
```

## 🐛 Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Kill process on port 8000
lsof -ti:8000 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :8000   # Windows
```

**Database issues:**
```bash
# Reset database
cd secure-comm/backend
rm secure_comm.db
python -c "from app.db.database import engine, Base; Base.metadata.create_all(bind=engine)"
```

**Node modules issues:**
```bash
cd secure-comm/web-client
rm -rf node_modules package-lock.json
npm install
```

### Getting Help

- Check the logs in terminal
- Visit http://localhost:8000/docs for API documentation
- Open browser developer tools for frontend issues
- Check `secure-comm/backend/.env` and `secure-comm/web-client/.env.local`

## 🎉 Success!

If you see:
- ✅ Backend: "Application startup complete" at http://localhost:8000
- ✅ Web Client: CipherLink login page at http://localhost:3000
- ✅ No error messages in terminals

You're ready to use CipherLink! 🔐

## 🔒 Security Features Enabled

- ✅ End-to-end encryption (X25519 + Ed25519)
- ✅ Zero-knowledge server
- ✅ Perfect Forward Secrecy
- ✅ Real-time messaging
- ✅ Ephemeral messages
- ✅ Secure key storage

---

**Next**: Read the full [README.md](README.md) for detailed documentation.
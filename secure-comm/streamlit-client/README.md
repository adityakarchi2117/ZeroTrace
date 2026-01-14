# CipherLink Streamlit Client

🔐 **Private by design. Secure by default.**

End-to-end encrypted communication platform built with Streamlit.

## Features

- 🔑 **End-to-End Encryption** - Messages encrypted on client side
- 💬 **Real-time Chat** - Secure messaging interface
- 🛡️ **Zero-Knowledge Server** - Server never sees plaintext
- 🔐 **NaCl Cryptography** - Military-grade encryption
- 📱 **Clean UI** - Simple and intuitive interface

## Quick Start

### Prerequisites

- Python 3.12+
- Backend server running on http://localhost:8000

### Installation

1. **Install dependencies**
   ```bash
   cd streamlit-client
   pip install -r requirements.txt
   ```

2. **Run the app**
   ```bash
   streamlit run app.py
   ```

The app will open in your browser at `http://localhost:8501`

## Usage

### Registration
1. Click on the "Register" tab
2. Enter username, email, and password
3. Click "Register"

### Login
1. Enter your username and password
2. Click "Login"

### Chatting
1. After login, enter a username in the sidebar
2. Click "Start Chat"
3. Type your message and click "Send"
4. Messages are automatically encrypted!

## Security

- **Client-side encryption**: All encryption happens in your browser
- **NaCl library**: Uses the proven NaCl cryptographic library
- **Ed25519**: For digital signatures
- **X25519**: For key exchange
- **No plaintext storage**: Server only stores encrypted messages

## Architecture

```
Streamlit Client (Python)
    ↓
FastAPI Backend (Python)
    ↓
SQLite/PostgreSQL Database
```

## Environment

Make sure the backend is running:
```bash
cd ../backend
python run.py
```

Backend should be accessible at: http://localhost:8000

## Troubleshooting

**Cannot connect to backend**
- Make sure backend is running on port 8000
- Check that API_BASE_URL in app.py is correct

**Encryption errors**
- Make sure both users have uploaded their public keys
- Check that PyNaCl is installed correctly

**Login fails**
- Verify backend is running
- Check username and password are correct

## Development

To run in development mode with auto-reload:
```bash
streamlit run app.py --server.runOnSave true
```

## License

See main project LICENSE file.

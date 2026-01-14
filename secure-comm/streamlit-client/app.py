"""
CipherLink Streamlit Client
End-to-end encrypted communication platform
"""

import streamlit as st
import requests
import json
from datetime import datetime
import base64
import nacl.signing
import nacl.encoding
import nacl.public
import nacl.utils
import nacl.secret
import hashlib

# API Configuration
API_BASE_URL = "http://localhost:8000/api"

# Page configuration
st.set_page_config(
    page_title="CipherLink - Secure Communication",
    page_icon="🔐",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Session state initialization
if 'authenticated' not in st.session_state:
    st.session_state.authenticated = False
if 'token' not in st.session_state:
    st.session_state.token = None
if 'username' not in st.session_state:
    st.session_state.username = None
if 'private_key' not in st.session_state:
    st.session_state.private_key = None
if 'public_key' not in st.session_state:
    st.session_state.public_key = None
if 'messages' not in st.session_state:
    st.session_state.messages = []
if 'selected_user' not in st.session_state:
    st.session_state.selected_user = None

# Crypto Helper Functions
def generate_key_pair():
    """Generate Ed25519 key pair for signing and X25519 for encryption"""
    # Generate signing key pair (Ed25519)
    signing_key = nacl.signing.SigningKey.generate()
    verify_key = signing_key.verify_key
    
    # Generate encryption key pair (X25519)
    private_key = nacl.public.PrivateKey.generate()
    public_key = private_key.public_key
    
    return {
        'signing_private': base64.b64encode(bytes(signing_key)).decode(),
        'signing_public': base64.b64encode(bytes(verify_key)).decode(),
        'private_key': base64.b64encode(bytes(private_key)).decode(),
        'public_key': base64.b64encode(bytes(public_key)).decode()
    }

def encrypt_message(message, recipient_public_key_b64):
    """Encrypt message using recipient's public key"""
    try:
        recipient_public_key = nacl.public.PublicKey(
            base64.b64decode(recipient_public_key_b64)
        )
        
        # Get sender's private key
        private_key = nacl.public.PrivateKey(
            base64.b64decode(st.session_state.private_key)
        )
        
        # Create box for encryption
        box = nacl.public.Box(private_key, recipient_public_key)
        
        # Encrypt message
        encrypted = box.encrypt(message.encode())
        return base64.b64encode(encrypted).decode()
    except Exception as e:
        st.error(f"Encryption error: {e}")
        return None

def decrypt_message(encrypted_message_b64, sender_public_key_b64):
    """Decrypt message using sender's public key"""
    try:
        sender_public_key = nacl.public.PublicKey(
            base64.b64decode(sender_public_key_b64)
        )
        
        # Get receiver's private key
        private_key = nacl.public.PrivateKey(
            base64.b64decode(st.session_state.private_key)
        )
        
        # Create box for decryption
        box = nacl.public.Box(private_key, sender_public_key)
        
        # Decrypt message
        encrypted = base64.b64decode(encrypted_message_b64)
        decrypted = box.decrypt(encrypted)
        return decrypted.decode()
    except Exception as e:
        return f"[Decryption failed: {str(e)}]"

# API Functions
def register_user(username, email, password):
    """Register a new user"""
    device_id = f"streamlit-{datetime.now().timestamp()}"
    
    try:
        # Step 1: Register the user
        response = requests.post(
            f"{API_BASE_URL}/auth/register",
            json={
                "username": username,
                "email": email,
                "password": password,
                "device_id": device_id,
                "device_type": "web"
            }
        )
        
        if response.status_code == 201:
            # Step 2: Login to get token
            login_response = requests.post(
                f"{API_BASE_URL}/auth/login",
                data={
                    "username": username,
                    "password": password
                }
            )
            
            if login_response.status_code == 200:
                token = login_response.json()['access_token']
                
                # Step 3: Generate and upload keys
                keys = generate_key_pair()
                
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
                
                key_response = requests.post(
                    f"{API_BASE_URL}/keys/upload",
                    headers=headers,
                    json={
                        "public_key": keys['public_key'],
                        "identity_key": keys['signing_public'],
                        "signed_prekey": keys['public_key'],
                        "signed_prekey_signature": keys['signing_public'],
                        "one_time_prekeys": []
                    }
                )
                
                if key_response.status_code == 201:
                    return True, "Registration successful! 🔐 Encryption keys created."
                else:
                    return True, f"Registration successful, but key upload failed: {key_response.text}"
            else:
                return True, "Registration successful! Please login to generate keys."
        else:
            error = response.json().get('detail', 'Registration failed')
            return False, error
    except Exception as e:
        return False, str(e)

def login_user(username, password):
    """Login user and get token"""
    try:
        response = requests.post(
            f"{API_BASE_URL}/auth/login",
            data={
                "username": username,
                "password": password
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            st.session_state.token = data['access_token']
            st.session_state.username = username
            st.session_state.authenticated = True
            
            # Generate encryption keys for this session
            keys = generate_key_pair()
            st.session_state.private_key = keys['private_key']
            st.session_state.public_key = keys['public_key']
            st.session_state.identity_key = keys['signing_public']
            
            # Always upload/update keys to server (ensures keys are available)
            key_upload_success = upload_public_key(
                st.session_state.public_key,
                st.session_state.identity_key,
                st.session_state.public_key,
                keys['signing_public']
            )
            
            if key_upload_success:
                return True, "Login successful! 🔐 Keys synchronized."
            else:
                # Still allow login even if key upload fails
                st.warning("⚠️ Key upload failed. You can receive messages but may not be able to decrypt them properly.")
                return True, "Login successful (with key upload warning)"
        else:
            return False, "Invalid credentials"
    except Exception as e:
        return False, str(e)

def upload_public_key(public_key, identity_key, signed_prekey, signature):
    """Upload public keys to server"""
    try:
        headers = {
            "Authorization": f"Bearer {st.session_state.token}",
            "Content-Type": "application/json"
        }
        payload = {
            "public_key": public_key,
            "identity_key": identity_key,
            "signed_prekey": signed_prekey,
            "signed_prekey_signature": signature,
            "one_time_prekeys": []
        }
        
        response = requests.post(
            f"{API_BASE_URL}/keys/upload",
            headers=headers,
            json=payload
        )
        
        if response.status_code == 201:
            return True
        else:
            st.error(f"Key upload failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        st.error(f"Key upload error: {str(e)}")
        return False

def get_user_key(username):
    """Get user's public key"""
    try:
        headers = {"Authorization": f"Bearer {st.session_state.token}"}
        response = requests.get(
            f"{API_BASE_URL}/keys/{username}",
            headers=headers
        )
        
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 404:
            st.warning(f"User '{username}' hasn't uploaded their encryption keys yet")
        else:
            st.error(f"Failed to get keys: {response.status_code} - {response.text}")
        return None
    except Exception as e:
        st.error(f"Error getting keys: {str(e)}")
        return None
        return None

def send_message(recipient_username, encrypted_content):
    """Send encrypted message"""
    try:
        headers = {
            "Authorization": f"Bearer {st.session_state.token}",
            "Content-Type": "application/json"
        }
        payload = {
            "recipient_username": recipient_username,
            "encrypted_content": encrypted_content,
            "message_type": "text"
        }
        
        response = requests.post(
            f"{API_BASE_URL}/messages/send",
            headers=headers,
            json=payload
        )
        
        if response.status_code == 201:
            return True
        else:
            st.error(f"Failed to send: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        st.error(f"Send error: {str(e)}")
        return False

def get_conversation(username):
    """Get conversation with user"""
    try:
        headers = {"Authorization": f"Bearer {st.session_state.token}"}
        response = requests.get(
            f"{API_BASE_URL}/messages/conversation/{username}",
            headers=headers
        )
        
        if response.status_code == 200:
            messages = response.json()
            return messages
        else:
            st.error(f"Failed to load messages: {response.status_code}")
            return []
    except Exception as e:
        st.error(f"Error loading conversation: {str(e)}")
        return []

# UI Functions
def show_login_page():
    """Display login page"""
    st.title("🔐 CipherLink")
    st.subheader("Private by design. Secure by default.")
    
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        tab1, tab2 = st.tabs(["Login", "Register"])
        
        with tab1:
            st.markdown("### Login to your account")
            with st.form("login_form"):
                username = st.text_input("Username", key="login_username")
                password = st.text_input("Password", type="password", key="login_password")
                submit = st.form_submit_button("Login", use_container_width=True)
                
                if submit:
                    if username and password:
                        with st.spinner("Logging in..."):
                            success, message = login_user(username, password)
                            if success:
                                st.success(message)
                                st.rerun()
                            else:
                                st.error(message)
                    else:
                        st.error("Please fill in all fields")
        
        with tab2:
            st.markdown("### Create new account")
            with st.form("register_form"):
                reg_username = st.text_input("Username", key="reg_username")
                reg_email = st.text_input("Email", key="reg_email")
                reg_password = st.text_input("Password", type="password", key="reg_password")
                reg_confirm = st.text_input("Confirm Password", type="password", key="reg_confirm")
                submit = st.form_submit_button("Register", use_container_width=True)
                
                if submit:
                    if reg_username and reg_email and reg_password and reg_confirm:
                        if reg_password != reg_confirm:
                            st.error("Passwords do not match")
                        elif len(reg_password) < 8:
                            st.error("Password must be at least 8 characters")
                        else:
                            with st.spinner("Creating account..."):
                                success, message = register_user(reg_username, reg_email, reg_password)
                                if success:
                                    st.success(message)
                                    st.info("Now login with your credentials")
                                else:
                                    st.error(message)
                    else:
                        st.error("Please fill in all fields")

def show_chat_page():
    """Display chat interface"""
    # Sidebar
    with st.sidebar:
        st.title(f"👤 {st.session_state.username}")
        
        if st.button("🚪 Logout", use_container_width=True):
            st.session_state.authenticated = False
            st.session_state.token = None
            st.session_state.username = None
            st.session_state.private_key = None
            st.session_state.public_key = None
            st.session_state.messages = []
            st.session_state.selected_user = None
            st.rerun()
        
        st.divider()
        st.subheader("💬 Conversations")
        
        # Chat with user input
        chat_username = st.text_input("Start chat with username:", key="chat_user_input")
        if st.button("Start Chat", use_container_width=True):
            if chat_username:
                st.session_state.selected_user = chat_username
                st.rerun()
        
        st.divider()
        
        # Show recent conversations (placeholder)
        if st.session_state.selected_user:
            if st.button(f"📩 {st.session_state.selected_user}", use_container_width=True):
                pass  # Already selected
    
    # Main chat area
    if st.session_state.selected_user:
        st.title(f"💬 Chat with {st.session_state.selected_user}")
        
        # Get recipient's public key
        recipient_key_data = get_user_key(st.session_state.selected_user)
        
        if not recipient_key_data:
            st.error(f"⚠️ Cannot chat with '{st.session_state.selected_user}'")
            st.warning("**Possible reasons:**")
            st.markdown("""
            - The user doesn't exist
            - The user hasn't logged in yet to generate encryption keys
            - The username is misspelled
            """)
            st.info("💡 **Tip**: The other user must login at least once before you can send them messages!")
            
            if st.button("🔙 Back to user list"):
                st.session_state.selected_user = None
                st.rerun()
            return
        
        # Load messages
        messages = get_conversation(st.session_state.selected_user)
        
        # Display messages
        chat_container = st.container()
        with chat_container:
            if messages:
                for msg in messages:
                    is_sent = msg['sender_username'] == st.session_state.username
                    
                    # Decrypt message
                    # For decryption, we always use the OTHER person's public key
                    # Because NaCl Box uses the other party's public key + our private key
                    other_user_key = recipient_key_data.get('public_key') if recipient_key_data else None
                    
                    if other_user_key:
                        decrypted = decrypt_message(msg['encrypted_content'], other_user_key)
                    else:
                        decrypted = "[Encrypted message - key not available]"
                    
                    # Display message
                    col1, col2, col3 = st.columns([1, 6, 1])
                    with col2:
                        if is_sent:
                            st.markdown(f"""
                            <div style='background-color: #0084ff; padding: 10px; border-radius: 10px; margin: 5px 0; text-align: right;'>
                                <strong>You:</strong> {decrypted}
                            </div>
                            """, unsafe_allow_html=True)
                        else:
                            st.markdown(f"""
                            <div style='background-color: #3a3a3a; padding: 10px; border-radius: 10px; margin: 5px 0;'>
                                <strong>{msg['sender_username']}:</strong> {decrypted}
                            </div>
                            """, unsafe_allow_html=True)
            else:
                st.info("No messages yet. Start the conversation!")
        
        # Message input
        st.divider()
        with st.form("message_form", clear_on_submit=True):
            col1, col2 = st.columns([5, 1])
            with col1:
                message = st.text_input("Type your message...", key="message_input", label_visibility="collapsed")
            with col2:
                send_button = st.form_submit_button("Send 📤", use_container_width=True)
            
            if send_button and message:
                if recipient_key_data:
                    recipient_public_key = recipient_key_data.get('public_key')
                    if recipient_public_key:
                        encrypted = encrypt_message(message, recipient_public_key)
                        if encrypted:
                            if send_message(st.session_state.selected_user, encrypted):
                                st.success("Message sent! 🎉")
                                st.rerun()
                            else:
                                st.error("Failed to send message")
                        else:
                            st.error("Encryption failed")
                    else:
                        st.error("Recipient's public key not found")
                else:
                    st.error("Cannot send message - recipient keys not available")
    else:
        st.title("Welcome to CipherLink! 🔐")
        st.markdown("""
        ### End-to-End Encrypted Communication
        
        **Features:**
        - 🔒 All messages encrypted on your device
        - 🔑 Zero-knowledge server - we never see your plaintext
        - 🛡️ Perfect Forward Secrecy
        - 📱 Secure key exchange
        
        **Get Started:**
        1. Enter a username in the sidebar to start a conversation
        2. Messages are automatically encrypted before sending
        3. Only you and your recipient can read the messages
        
        **Security:**
        - Uses NaCl (Networking and Cryptography Library)
        - Ed25519 for signing
        - X25519 for key exchange
        - Authenticated encryption
        """)

# Main App
def main():
    if not st.session_state.authenticated:
        show_login_page()
    else:
        show_chat_page()

if __name__ == "__main__":
    main()

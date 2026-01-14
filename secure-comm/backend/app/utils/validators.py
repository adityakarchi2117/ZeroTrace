import re
from typing import Optional

def validate_username(username: str) -> bool:
    """
    Validate username format.
    Rules: 3-20 characters, alphanumeric and underscore only.
    """
    pattern = r'^[a-zA-Z0-9_]{3,20}$'
    return bool(re.match(pattern, username))

def validate_password_strength(password: str) -> tuple[bool, Optional[str]]:
    """
    Validate password strength.
    Rules: At least 8 characters, contains uppercase, lowercase, digit, and special character.
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    
    if not re.search(r'\d', password):
        return False, "Password must contain at least one digit"
    
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "Password must contain at least one special character"
    
    return True, None

def validate_public_key(public_key: str) -> bool:
    """
    Validate public key format.
    Basic validation - check if it's not empty and has reasonable length.
    """
    if not public_key or len(public_key) < 50:
        return False
    
    # Add more specific validation based on your key format (RSA, ECC, etc.)
    return True

def sanitize_message_content(content: str, max_length: int = 10000) -> str:
    """
    Sanitize message content.
    Remove potential harmful content and enforce length limits.
    """
    if len(content) > max_length:
        content = content[:max_length]
    
    # Remove null bytes and other control characters
    content = content.replace('\x00', '')
    
    return content.strip()

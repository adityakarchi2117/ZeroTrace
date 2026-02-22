from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from app.db.database import get_db, RefreshToken
from app.db.user_repo import UserRepository
from app.core.security import verify_password, create_access_token, get_password_hash, oauth2_scheme
from app.models.user import UserCreate, UserResponse, Token, UserSettingsUpdate
from datetime import timedelta, datetime, timezone
from app.core.config import settings
from app.core.crypto import RateLimiter
from pydantic import BaseModel
import asyncio
import re
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# AUDIT FIX: Rate limiters for auth endpoints to prevent brute-force attacks
_login_limiter = RateLimiter()
_register_limiter = RateLimiter()

# Request/Response models for account management
class UsernameChangeRequest(BaseModel):
    new_username: str
    password: str  # Require password confirmation for security

class UsernameChangeResponse(BaseModel):
    success: bool
    message: str
    new_username: str
    next_change_available: str

class AccountActionRequest(BaseModel):
    password: str  # Require password confirmation

class AccountStatusResponse(BaseModel):
    success: bool
    message: str

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user: UserCreate, request: Request, db: Session = Depends(get_db)):
    """Register a new user."""
    # AUDIT FIX: Rate limit registration by IP to prevent spam
    client_ip = request.client.host if request.client else "unknown"
    if not _register_limiter.check_rate_limit(f"register:{client_ip}", max_attempts=5, window_seconds=300):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts. Try again later."
        )
    
    user_repo = UserRepository(db)
    
    # Check if user already exists
    if user_repo.get_by_username(user.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    if user_repo.get_by_email(user.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # AUDIT FIX: Run blocking bcrypt in thread pool to avoid blocking event loop
    hashed_password = await asyncio.to_thread(get_password_hash, user.password)
    new_user = user_repo.create(user.username, user.email, hashed_password)
    
    return new_user

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), request: Request = None, db: Session = Depends(get_db)):
    """Login and get access token."""
    # AUDIT FIX: Rate limit login by IP+username to prevent brute-force
    client_ip = request.client.host if request and request.client else "unknown"
    rate_key = f"login:{client_ip}:{form_data.username}"
    if not _login_limiter.check_rate_limit(rate_key, max_attempts=10, window_seconds=300):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again in a few minutes."
        )
    
    try:
        user_repo = UserRepository(db)
        user = user_repo.get_by_username(form_data.username)
        
        # AUDIT FIX: Run blocking bcrypt in thread pool
        if not user or not await asyncio.to_thread(verify_password, form_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if account is disabled
        if getattr(user, 'is_disabled', False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled. Please re-enable it first."
            )
        
        # Check if account is deleted
        if getattr(user, 'deleted_at', None):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account has been deleted."
            )
        
        # AUDIT FIX: Reset rate limiter on successful login
        _login_limiter.reset(rate_key)
        
        access_token = create_access_token(
            data={"sub": user.username, "user_id": user.id},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        return {
            "access_token": access_token, 
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}", exc_info=True)
        # AUDIT FIX: Never leak internal error details to client
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed due to a server error. Please try again."
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Get current authenticated user."""
    from app.core.security import decode_access_token
    
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    username = payload.get("sub")
    user_repo = UserRepository(db)
    user = user_repo.get_by_username(username)
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Check if account is disabled
    if getattr(user, 'is_disabled', False):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Attach profile data if available
    if user.profile:
        response = UserResponse.model_validate(user)
        response = response.model_copy(update={
            "display_name": user.profile.display_name,
            "avatar_url": user.profile.avatar_url,
        })
        return response

    return user


@router.patch("/me/settings", response_model=UserResponse)
async def update_settings(
    settings_update: UserSettingsUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Update user settings."""
    from app.core.security import decode_access_token
    
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        
    username = payload.get("sub")
    user_repo = UserRepository(db)
    user = user_repo.get_by_username(username)
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Update settings
    # Merge with existing settings if any
    current_settings = user.settings or {}
    updated_settings = {**current_settings, **settings_update.settings}
    
    user.settings = updated_settings
    db.commit()
    db.refresh(user)
    
    return user


# ============ Account Management Endpoints ============

@router.post("/me/change-username", response_model=UsernameChangeResponse)
async def change_username(
    request: UsernameChangeRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Change username (once every 14 days)."""
    from app.core.security import decode_access_token
    
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user_repo = UserRepository(db)
    user = user_repo.get_by_username(payload.get("sub"))
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify password (AUDIT FIX: use to_thread to avoid blocking event loop with bcrypt)
    if not await asyncio.to_thread(verify_password, request.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect password")
    
    # Validate new username format
    new_username = request.new_username.strip().lower()
    if not re.match(r'^[a-z0-9_]{3,30}$', new_username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must be 3-30 characters, lowercase letters, numbers, and underscores only"
        )
    
    # Check if username is taken
    existing = user_repo.get_by_username(new_username)
    if existing and existing.id != user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username is already taken")
    
    # Check 14-day cooldown
    last_change = getattr(user, 'last_username_change', None)
    if last_change:
        days_since_change = (datetime.now(timezone.utc) - last_change).days
        if days_since_change < 14:
            days_remaining = 14 - days_since_change
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"You can change your username in {days_remaining} days"
            )
    
    # Save previous username
    previous_usernames = list(getattr(user, 'previous_usernames', None) or [])
    previous_usernames.append({
        "username": user.username,
        "changed_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Update username
    old_username = user.username
    user.username = new_username
    user.last_username_change = datetime.now(timezone.utc)
    user.previous_usernames = previous_usernames.copy()
    flag_modified(user, 'previous_usernames')
    
    db.commit()
    db.refresh(user)
    
    next_change = datetime.now(timezone.utc) + timedelta(days=14)
    
    return UsernameChangeResponse(
        success=True,
        message=f"Username changed from '{old_username}' to '{new_username}'",
        new_username=new_username,
        next_change_available=next_change.isoformat()
    )


@router.post("/me/disable", response_model=AccountStatusResponse)
async def disable_account(
    request: AccountActionRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Disable account (can be re-enabled later)."""
    from app.core.security import decode_access_token
    
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user_repo = UserRepository(db)
    user = user_repo.get_by_username(payload.get("sub"))
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify password (AUDIT FIX: use to_thread to avoid blocking event loop with bcrypt)
    if not await asyncio.to_thread(verify_password, request.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect password")
    
    # Disable account
    user.is_disabled = True
    user.disabled_at = datetime.now(timezone.utc)
    
    # Revoke all refresh tokens to invalidate sessions immediately
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.is_revoked == False
    ).update({"is_revoked": True})
    
    # Bump token_version if available to invalidate JWTs
    if hasattr(user, 'token_version'):
        user.token_version = (user.token_version or 0) + 1
    
    db.commit()
    
    return AccountStatusResponse(
        success=True,
        message="Account has been disabled. You can re-enable it by logging in with your credentials."
    )


@router.post("/me/enable", response_model=AccountStatusResponse)
async def enable_account(
    request: AccountActionRequest,
    db: Session = Depends(get_db)
):
    """Re-enable a disabled account (requires username and password in body)."""
    from app.db.database import User
    
    # Find user by checking all users (since they're disabled, they can't use token)
    # We need username in the request for this
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Use the /auth/reactivate endpoint with username and password"
    )


@router.post("/reactivate", response_model=Token)
async def reactivate_account(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Re-enable a disabled account and login."""
    user_repo = UserRepository(db)
    user = user_repo.get_by_username(form_data.username)
    
    # AUDIT FIX: use to_thread to avoid blocking event loop with bcrypt
    if not user or not await asyncio.to_thread(verify_password, form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if account is deleted (cannot reactivate)
    if getattr(user, 'deleted_at', None):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Account has been permanently deleted and cannot be recovered"
        )
    
    # Re-enable account
    user.is_disabled = False
    user.disabled_at = None
    db.commit()
    
    # Generate new token
    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.delete("/me", response_model=AccountStatusResponse)
async def delete_account(
    request: AccountActionRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Permanently delete account (soft delete with 30-day recovery period)."""
    from app.core.security import decode_access_token
    
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user_repo = UserRepository(db)
    user = user_repo.get_by_username(payload.get("sub"))
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify password (AUDIT FIX: use to_thread to avoid blocking event loop with bcrypt)
    if not await asyncio.to_thread(verify_password, request.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect password")
    
    # Mark account for deletion (soft delete)
    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False
    user.is_disabled = True
    
    # Revoke all refresh tokens to invalidate sessions immediately
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.is_revoked == False
    ).update({"is_revoked": True})
    
    # Bump token_version if available to invalidate JWTs
    if hasattr(user, 'token_version'):
        user.token_version = (user.token_version or 0) + 1
    
    db.commit()
    
    return AccountStatusResponse(
        success=True,
        message="Account has been marked for deletion. It will be permanently removed in 30 days. Contact support if you want to recover it."
    )


@router.get("/me/account-status")
async def get_account_status(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Get account status including username change availability."""
    from app.core.security import decode_access_token
    
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user_repo = UserRepository(db)
    user = user_repo.get_by_username(payload.get("sub"))
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate username change availability
    last_change = getattr(user, 'last_username_change', None)
    can_change_username = True
    days_until_change = 0
    
    if last_change:
        days_since_change = (datetime.now(timezone.utc) - last_change).days
        if days_since_change < 14:
            can_change_username = False
            days_until_change = 14 - days_since_change
    
    return {
        "username": user.username,
        "email": user.email,
        "is_disabled": getattr(user, 'is_disabled', False),
        "deleted_at": getattr(user, 'deleted_at', None),
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "can_change_username": can_change_username,
        "days_until_username_change": days_until_change,
        "last_username_change": last_change.isoformat() if last_change else None,
        "previous_usernames": getattr(user, 'previous_usernames', []) or []
    }


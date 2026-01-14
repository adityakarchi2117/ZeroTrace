from sqlalchemy.orm import Session
from app.db.database import User
from typing import Optional

class UserRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def create(self, username: str, email: str, hashed_password: str) -> User:
        """Create a new user."""
        user = User(
            username=username,
            email=email,
            hashed_password=hashed_password
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
    
    def get_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID."""
        return self.db.query(User).filter(User.id == user_id).first()
    
    def get_by_username(self, username: str) -> Optional[User]:
        """Get user by username."""
        return self.db.query(User).filter(User.username == username).first()
    
    def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        return self.db.query(User).filter(User.email == email).first()
    
    def update_public_key(self, user_id: int, public_key: Optional[str]):
        """Update user's public key."""
        user = self.get_by_id(user_id)
        if user:
            user.public_key = public_key
            self.db.commit()
            self.db.refresh(user)
        return user
    
    def delete(self, user_id: int) -> bool:
        """Delete a user."""
        user = self.get_by_id(user_id)
        if user:
            self.db.delete(user)
            self.db.commit()
            return True
        return False

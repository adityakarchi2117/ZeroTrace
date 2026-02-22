from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.database import SessionLocal, VerificationTypeEnum, VerificationStatusEnum, User
from app.db.verification_repo import VerificationRepository
from app.db.user_repo import UserRepository
from app.models.verification import (
    VerificationBadgeResponse,
    VerificationRequestCreate,
    VerificationRequestResponse,
    VerificationRequestReview,
    VerificationHistoryResponse,
    UserVerificationSummary,
)
from app.core.security import get_current_user_id

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/verification/summary/{user_id}", response_model=UserVerificationSummary)
async def get_verification_summary(
    user_id: int,
    _current_user: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    
    repo = VerificationRepository(db)
    summary = repo.get_verification_summary(user_id)
    
    if not summary:
        raise HTTPException(status_code=404, detail="User not found")
    
    return summary

@router.get("/verification/badges", response_model=List[VerificationBadgeResponse])
async def get_my_badges(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    
    repo = VerificationRepository(db)
    badges = repo.get_user_badges(user_id, active_only=True)
    return badges

@router.get("/verification/badges/{target_user_id}", response_model=List[VerificationBadgeResponse])
async def get_user_badges(
    target_user_id: int,
    _current_user: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    
    repo = VerificationRepository(db)
    badges = repo.get_user_badges(target_user_id, active_only=True)
    return badges

@router.post("/verification/request", response_model=VerificationRequestResponse)
async def create_verification_request(
    payload: VerificationRequestCreate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    
    repo = VerificationRepository(db)
    
    try:
        verification_type = VerificationTypeEnum(payload.verification_type.value)
        
        request = repo.create_verification_request(
            user_id=user_id,
            verification_type=verification_type,
            supporting_documents=payload.supporting_documents,
            notes=payload.notes,
        )
        return request
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/verification/requests", response_model=List[VerificationRequestResponse])
async def get_my_requests(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    
    repo = VerificationRepository(db)
    requests = repo.get_user_verification_requests(user_id)
    return requests

@router.get("/verification/requests/pending", response_model=List[VerificationRequestResponse])
async def get_pending_requests(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    # Enforce role-based authorization
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not getattr(user, 'role', None) in ('admin', 'reviewer'):
        raise HTTPException(status_code=403, detail="Only admins or reviewers can view pending requests")
    
    repo = VerificationRepository(db)
    requests = repo.get_pending_verification_requests()
    return requests

@router.post("/verification/review", response_model=VerificationRequestResponse)
async def review_verification_request(
    payload: VerificationRequestReview,
    reviewer_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    # Enforce role-based authorization
    reviewer = db.query(User).filter(User.id == reviewer_id).first()
    if not reviewer or not getattr(reviewer, 'role', None) in ('admin', 'reviewer'):
        raise HTTPException(status_code=403, detail="Only admins or reviewers can review verification requests")

    repo = VerificationRepository(db)
    
    # Load the target request and prevent self-review
    target_request = repo.get_verification_request(payload.request_id)
    if not target_request:
        raise HTTPException(status_code=404, detail="Verification request not found")
    if target_request.user_id == reviewer_id:
        raise HTTPException(status_code=403, detail="Cannot review your own verification request")
    
    try:
        request = repo.review_verification_request(
            request_id=payload.request_id,
            reviewer_id=reviewer_id,
            approved=payload.approved,
            rejection_reason=payload.rejection_reason,
            badge_label=payload.badge_label,
            badge_color=payload.badge_color,
            expires_at=payload.expires_at,
        )
        return request
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/verification/history", response_model=List[VerificationHistoryResponse])
async def get_my_verification_history(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    
    repo = VerificationRepository(db)
    history = repo.get_verification_history(user_id)
    return history

@router.delete("/verification/badge/{verification_type}")
async def revoke_my_badge(
    verification_type: str,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    
    repo = VerificationRepository(db)
    
    try:
        verification_type_enum = VerificationTypeEnum(verification_type)
        success = repo.revoke_verification_badge(
            user_id=user_id,
            verification_type=verification_type_enum,
            revoked_by=user_id,
            reason="User requested revocation",
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Badge not found")
        
        return {"message": "Badge revoked successfully"}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid verification type")

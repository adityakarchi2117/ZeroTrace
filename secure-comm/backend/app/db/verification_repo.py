from typing import Optional, List, Dict
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.db.database import (
    VerificationBadge,
    VerificationRequest,
    VerificationHistory,
    User,
    VerificationTypeEnum,
    VerificationStatusEnum,
)

class VerificationRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_user_badges(self, user_id: int, active_only: bool = True) -> List[VerificationBadge]:
        
        query = self.db.query(VerificationBadge).filter(VerificationBadge.user_id == user_id)
        
        if active_only:
            query = query.filter(VerificationBadge.is_active == True)
        
        return query.all()

    def has_verification_badge(self, user_id: int, verification_type: VerificationTypeEnum) -> bool:
        
        badge = (
            self.db.query(VerificationBadge)
            .filter(
                VerificationBadge.user_id == user_id,
                VerificationBadge.verification_type == verification_type,
                VerificationBadge.is_active == True,
            )
            .first()
        )
        return badge is not None

    def grant_verification_badge(
        self,
        user_id: int,
        verification_type: VerificationTypeEnum,
        verified_by: Optional[int] = None,
        badge_label: Optional[str] = None,
        badge_color: Optional[str] = None,
        expires_at: Optional[datetime] = None,
        verification_data: Optional[Dict] = None,
        commit: bool = True,
    ) -> VerificationBadge:
        
        # Check for existing active badge of the same type
        existing = (
            self.db.query(VerificationBadge)
            .filter(
                VerificationBadge.user_id == user_id,
                VerificationBadge.verification_type == verification_type,
                VerificationBadge.is_active == True,
            )
            .first()
        )
        if existing:
            # Deactivate old badge before creating new one
            existing.is_active = False
        
        badge = VerificationBadge(
            user_id=user_id,
            verification_type=verification_type,
            verified_by=verified_by,
            badge_label=badge_label,
            badge_color=badge_color,
            expires_at=expires_at,
            verification_data=verification_data,
            verified_at=datetime.now(timezone.utc),
            is_active=True,
        )
        self.db.add(badge)

        user = self.db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_verified = True
            
            level_map = {
                VerificationTypeEnum.EMAIL: 1,
                VerificationTypeEnum.IDENTITY: 2,
                VerificationTypeEnum.ORGANIZATION: 3,
            }
            new_level = level_map.get(verification_type, 0)
            if new_level > user.verification_level:
                user.verification_level = new_level

        self._log_verification_action(
            user_id=user_id,
            verification_type=verification_type,
            action="granted",
            performed_by=verified_by,
            meta={"badge_label": badge_label, "badge_color": badge_color},
        )

        if commit:
            self.db.commit()
            self.db.refresh(badge)
        else:
            self.db.flush()
        return badge

    def revoke_verification_badge(
        self,
        user_id: int,
        verification_type: VerificationTypeEnum,
        revoked_by: Optional[int] = None,
        reason: Optional[str] = None,
    ) -> bool:
        
        badge = (
            self.db.query(VerificationBadge)
            .filter(
                VerificationBadge.user_id == user_id,
                VerificationBadge.verification_type == verification_type,
                VerificationBadge.is_active == True,
            )
            .first()
        )

        if not badge:
            return False

        badge.is_active = False

        self._log_verification_action(
            user_id=user_id,
            verification_type=verification_type,
            action="revoked",
            performed_by=revoked_by,
            reason=reason,
        )

        active_badges = self.get_user_badges(user_id, active_only=True)
        if len(active_badges) == 0:
            user = self.db.query(User).filter(User.id == user_id).first()
            if user:
                user.is_verified = False
                user.verification_level = 0

        self.db.commit()
        return True

    def create_verification_request(
        self,
        user_id: int,
        verification_type: VerificationTypeEnum,
        supporting_documents: Optional[Dict] = None,
        notes: Optional[str] = None,
    ) -> VerificationRequest:

        existing = (
            self.db.query(VerificationRequest)
            .filter(
                VerificationRequest.user_id == user_id,
                VerificationRequest.verification_type == verification_type,
                VerificationRequest.status == VerificationStatusEnum.PENDING,
            )
            .first()
        )

        if existing:
            raise ValueError("A pending verification request already exists")

        request = VerificationRequest(
            user_id=user_id,
            verification_type=verification_type,
            supporting_documents=supporting_documents,
            notes=notes,
            status=VerificationStatusEnum.PENDING,
        )
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        return request

    def get_verification_request(self, request_id: int) -> Optional[VerificationRequest]:
        
        return self.db.query(VerificationRequest).filter(VerificationRequest.id == request_id).first()

    def get_user_verification_requests(self, user_id: int) -> List[VerificationRequest]:
        
        return (
            self.db.query(VerificationRequest)
            .filter(VerificationRequest.user_id == user_id)
            .order_by(VerificationRequest.created_at.desc())
            .all()
        )

    def get_pending_verification_requests(self) -> List[VerificationRequest]:
        
        return (
            self.db.query(VerificationRequest)
            .filter(VerificationRequest.status == VerificationStatusEnum.PENDING)
            .order_by(VerificationRequest.created_at.asc())
            .all()
        )

    def review_verification_request(
        self,
        request_id: int,
        reviewer_id: int,
        approved: bool,
        rejection_reason: Optional[str] = None,
        badge_label: Optional[str] = None,
        badge_color: Optional[str] = None,
        expires_at: Optional[datetime] = None,
    ) -> VerificationRequest:
        
        request = self.get_verification_request(request_id)
        if not request:
            raise ValueError("Verification request not found")

        if request.status != VerificationStatusEnum.PENDING:
            raise ValueError("Request has already been reviewed")

        request.status = VerificationStatusEnum.APPROVED if approved else VerificationStatusEnum.REJECTED
        request.reviewed_at = datetime.now(timezone.utc)
        request.reviewed_by = reviewer_id
        request.rejection_reason = rejection_reason

        if approved:
            
            self.grant_verification_badge(
                user_id=request.user_id,
                verification_type=request.verification_type,
                verified_by=reviewer_id,
                badge_label=badge_label,
                badge_color=badge_color,
                expires_at=expires_at,
                commit=False,
            )

        self.db.commit()
        self.db.refresh(request)
        return request

    def _log_verification_action(
        self,
        user_id: int,
        verification_type: VerificationTypeEnum,
        action: str,
        performed_by: Optional[int] = None,
        reason: Optional[str] = None,
        meta: Optional[Dict] = None,
    ):
        
        history = VerificationHistory(
            user_id=user_id,
            verification_type=verification_type,
            action=action,
            performed_by=performed_by,
            reason=reason,
            meta=meta,
        )
        self.db.add(history)

    def get_verification_history(self, user_id: int) -> List[VerificationHistory]:
        
        return (
            self.db.query(VerificationHistory)
            .filter(VerificationHistory.user_id == user_id)
            .order_by(VerificationHistory.created_at.desc())
            .all()
        )

    def get_verification_summary(self, user_id: int) -> Dict:
        
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return None

        badges = self.get_user_badges(user_id, active_only=True)

        return {
            "user_id": user_id,
            "is_verified": user.is_verified,
            "verification_level": user.verification_level,
            "badges": badges,
        }

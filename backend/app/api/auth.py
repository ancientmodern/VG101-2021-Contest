from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.legacy import STUDENTS
from app.core.security import hash_legacy_password, utc_now
from app.core.settings import settings
from app.models import PasswordToken, User
from app.schemas.dto import AuthStatus, ForgetPasswordRequest, LoginRequest
from app.services.auth import (
    create_session,
    get_current_user_optional,
    require_admin,
    revoke_session,
    set_session_cookie,
    clear_session_cookie,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=AuthStatus)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    student_id = payload.studentId.strip()
    password = payload.password.strip()

    user = db.scalar(select(User).where(User.student_id == student_id))

    if not user:
        if student_id not in STUDENTS:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User doesn't exist")

        student = STUDENTS[student_id]
        user = User(
            student_id=student_id,
            password=hash_legacy_password(password),
            real_name=str(student.get("name", student_id)),
            disp_name=str(student.get("name", student_id)),
            admin=bool(student.get("TA", False)),
            student=True,
            win=0,
            lose=0,
            draw=0,
            score=2000,
            compiler="c++17",
            tank_skin="",
            bullet_skin="",
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except IntegrityError:
            # handle concurrent first-login races on unique student_id
            db.rollback()
            user = db.scalar(select(User).where(User.student_id == student_id))
            if not user:
                raise
    else:
        if user.password != hash_legacy_password(password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login failure")

    token = create_session(db, user)
    set_session_cookie(response, token)

    return AuthStatus(status="OK", studentId=user.student_id, realName=user.real_name)


@router.get("/check", response_model=AuthStatus)
def check(user: Optional[User] = Depends(get_current_user_optional)):
    if not user:
        return AuthStatus(status="FAIL")
    return AuthStatus(status="OK", studentId=user.student_id, realName=user.real_name)


@router.post("/logout", response_model=AuthStatus)
def logout(
    response: Response,
    db: Session = Depends(get_db),
    session_id: Optional[str] = Cookie(default=None, alias=settings.session_cookie_name),
):
    # deleting cookie is enough for client-side logout in this implementation.
    revoke_session(db, session_id)
    clear_session_cookie(response)
    return AuthStatus(status="OK")


@router.post("/forget-password")
def forget_password(payload: ForgetPasswordRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.student_id == payload.studentId))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User doesn't exist")

    now = utc_now()
    expired_before = now - timedelta(seconds=settings.password_token_ttl_seconds)
    db.execute(delete(PasswordToken).where(PasswordToken.created_at < expired_before))
    db.execute(delete(PasswordToken).where(PasswordToken.student_id == payload.studentId))

    token = uuid.uuid4().hex
    rec = PasswordToken(id=token, student_id=payload.studentId, password=hash_legacy_password(payload.password))
    db.add(rec)
    db.commit()

    return {"status": "OK", "token": token}


@router.post("/admin/setpwd/{student_id}/{token}")
def admin_set_password(
    student_id: str,
    token: str,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rec = db.get(PasswordToken, token)
    if not rec or rec.student_id != student_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="incorrect")

    age = utc_now() - rec.created_at.replace(tzinfo=None)
    if age.total_seconds() > settings.password_token_ttl_seconds:
        db.delete(rec)
        db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Token expired")

    user = db.scalar(select(User).where(User.student_id == student_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No user")

    user.password = rec.password
    db.add(user)
    db.delete(rec)
    db.commit()
    return {"status": "success"}

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import utc_after, utc_now
from app.core.settings import settings
from app.models import Session as DbSession
from app.models import User


SESSION_COOKIE_NAME = settings.session_cookie_name


def create_session(db: Session, user: User) -> str:
    token = uuid.uuid4().hex
    db.add(DbSession(id=token, user_id=user.id, expires_at=utc_after(settings.session_ttl_seconds)))
    db.commit()
    return token


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")


def _get_session(db: Session, token: Optional[str]) -> Optional[DbSession]:
    if not token:
        return None
    rec = db.get(DbSession, token)
    if not rec:
        return None
    if rec.expires_at < utc_now():
        db.delete(rec)
        db.commit()
        return None
    return rec


def get_current_user_optional(
    db: Session = Depends(get_db),
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> Optional[User]:
    rec = _get_session(db, session_id)
    if not rec:
        return None

    # rolling session expiration
    rec.expires_at = utc_after(settings.session_ttl_seconds)
    db.add(rec)
    db.commit()

    return db.get(User, rec.user_id)


def require_current_user(user: Optional[User] = Depends(get_current_user_optional)) -> User:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return user


def require_admin(user: User = Depends(require_current_user)) -> User:
    if not user.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return user


def revoke_session(db: Session, token: Optional[str]) -> None:
    if not token:
        return
    rec = db.get(DbSession, token)
    if rec:
        db.delete(rec)
        db.commit()


def cleanup_expired_sessions(db: Session) -> None:
    db.execute(delete(DbSession).where(DbSession.expires_at < utc_now()))
    db.commit()

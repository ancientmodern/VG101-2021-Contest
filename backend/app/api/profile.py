from __future__ import annotations

from html import escape

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_legacy_password
from app.models import User
from app.schemas.dto import CompilerSettingsRequest, ProfileUpdateRequest
from app.services.auth import require_current_user
from app.services.compiler import normalize_compiler

router = APIRouter(prefix="/api/profile", tags=["profile"])


def _serialize_user(user: User) -> dict[str, object]:
    return {
        "studentId": user.student_id,
        "realName": user.real_name,
        "dispName": user.disp_name,
        "tankSkin": user.tank_skin,
        "bulletSkin": user.bullet_skin,
        "compiler": user.compiler,
        "win": user.win,
        "lose": user.lose,
        "draw": user.draw,
        "score": user.score,
        "admin": user.admin,
    }


@router.get("")
def get_profile(user: User = Depends(require_current_user)):
    return _serialize_user(user)


@router.put("")
def update_profile(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_current_user),
):
    stripped_name = payload.name.strip()
    if not stripped_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name is required")
    if len(stripped_name) > 255:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name too long")

    safe_name = escape(stripped_name)

    wrong_password = False
    if payload.password:
        if not payload.newpassword:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="newpassword required")
        if hash_legacy_password(payload.password) == user.password:
            user.disp_name = safe_name
            user.tank_skin = payload.tskin
            user.bullet_skin = payload.bskin
            user.password = hash_legacy_password(payload.newpassword)
        else:
            wrong_password = True
    else:
        user.disp_name = safe_name
        user.tank_skin = payload.tskin
        user.bullet_skin = payload.bskin

    if not wrong_password:
        db.add(user)
        db.commit()
        db.refresh(user)

    return {
        "wrongPassword": wrong_password,
        "profile": _serialize_user(user),
    }


@router.get("/settings")
def get_settings(user: User = Depends(require_current_user)):
    return {"compiler": user.compiler}


@router.put("/settings")
def update_settings(
    payload: CompilerSettingsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_current_user),
):
    user.compiler = normalize_compiler(payload.compiler)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"compiler": user.compiler}

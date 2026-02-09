from __future__ import annotations

import json
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from app.core.database import get_db
from app.core.legacy import LEGACY
from app.models import Match, User
from app.schemas.dto import MatchDetailResponse, MatchListResponse, MatchReplayResponse
from app.services.auth import get_current_user_optional

router = APIRouter(prefix="/api/matches", tags=["matches"])


def _match_player(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "dispName": user.disp_name,
        "score": user.score,
        "tankSkin": user.tank_skin,
        "bulletSkin": user.bullet_skin,
    }


def _load_match_with_players(db: Session, match_id: int):
    p1_user = aliased(User)
    p2_user = aliased(User)
    return db.execute(
        select(Match, p1_user, p2_user)
        .join(p1_user, Match.p1_user_id == p1_user.id)
        .join(p2_user, Match.p2_user_id == p2_user.id)
        .where(Match.id == match_id)
    ).first()


@router.get("", response_model=MatchListResponse)
def list_matches(
    page: int = Query(default=1, ge=1),
    filter: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    page_size = LEGACY.display_pager

    filter_value = filter.strip() if filter is not None else None
    condition = None
    if filter_value is not None:
        if filter_value != "1":
            user = db.scalar(select(User).where(User.disp_name == filter_value))
            if user:
                condition = or_(Match.p1_user_id == user.id, Match.p2_user_id == user.id)
            else:
                condition = Match.id == -1
        elif current_user:
            condition = or_(Match.p1_user_id == current_user.id, Match.p2_user_id == current_user.id)

    p1_user = aliased(User)
    p2_user = aliased(User)

    query = (
        select(Match, p1_user, p2_user)
        .join(p1_user, Match.p1_user_id == p1_user.id)
        .join(p2_user, Match.p2_user_id == p2_user.id)
    )
    count_query = (
        select(func.count(Match.id))
        .select_from(Match)
        .join(p1_user, Match.p1_user_id == p1_user.id)
        .join(p2_user, Match.p2_user_id == p2_user.id)
    )
    if condition is not None:
        query = query.where(condition)
        count_query = count_query.where(condition)

    total = int(db.scalar(count_query) or 0)
    rows = db.execute(
        query.order_by(Match.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()

    items = []
    for m, p1, p2 in rows:
        scores = None
        if m.status == 1 and m.p1_score_before is not None and m.p1_score_after is not None:
            scores = {
                "p1": [f"{m.p1_score_before:.2f}", f"{m.p1_score_after:.2f}"],
                "p2": [f"{m.p2_score_before:.2f}", f"{m.p2_score_after:.2f}"],
            }

        items.append(
            {
                "id": m.id,
                "status": m.status,
                "winner": m.winner,
                "createdAt": m.created_at,
                "p1": _match_player(p1),
                "p2": _match_player(p2),
                "scores": scores,
            }
        )

    return {
        "total": total,
        "page": page,
        "pageSize": page_size,
        "pages": ceil(total / page_size) if page_size else 1,
        "items": items,
    }


@router.get("/{match_id}", response_model=MatchDetailResponse)
def get_match(match_id: int, db: Session = Depends(get_db)):
    row = _load_match_with_players(db, match_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    m, p1, p2 = row

    errors = json.loads(m.error_json or "[]")
    error_text = errors[0]["msg"] if errors else "Normal Exit"

    return {
        "id": m.id,
        "winner": m.winner,
        "p1": p1.disp_name,
        "p2": p2.disp_name,
        "error": error_text,
    }


@router.get("/{match_id}/record", response_model=MatchReplayResponse)
def get_match_record(match_id: int, db: Session = Depends(get_db)):
    row = _load_match_with_players(db, match_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    m, p1, p2 = row

    return {
        "record": json.loads(m.record_json or "[]"),
        "A": {"stdout": m.a_stdout or "No Record", "stderr": m.a_stderr or "No Record"},
        "B": {"stdout": m.b_stdout or "No Record", "stderr": m.b_stderr or "No Record"},
        "p1": p1.disp_name,
        "p2": p2.disp_name,
        "ts1": p1.tank_skin,
        "ts2": p2.tank_skin,
        "bs1": p1.bullet_skin,
        "bs2": p2.bullet_skin,
    }

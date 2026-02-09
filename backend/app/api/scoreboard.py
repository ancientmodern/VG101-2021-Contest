from __future__ import annotations

from typing import Union

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import User
from app.schemas.dto import ScoreboardEntry

router = APIRouter(prefix="/api", tags=["scoreboard"])


@router.get("/scoreboard", response_model=list[ScoreboardEntry])
def get_scoreboard(db: Session = Depends(get_db)):
    users = db.scalars(select(User).order_by(User.score.desc())).all()

    result: list[ScoreboardEntry] = []
    for u in users:
        score: Union[float, str]
        if u.win + u.lose + u.draw == 0:
            score = "unrated"
        else:
            score = float(int(u.score))

        result.append(
            ScoreboardEntry(
                id=u.id,
                dispName=u.disp_name,
                score=score,
                win=u.win,
                lose=u.lose,
                draw=u.draw,
            )
        )

    return result

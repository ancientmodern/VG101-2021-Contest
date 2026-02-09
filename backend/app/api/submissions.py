from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.settings import ROOT_DIR
from app.models import JudgeCase, JudgeRun, Submission, User
from app.schemas.dto import SubmitRequest, SubmissionDetail, SubmissionSummary
from app.services.auth import require_current_user
from app.services.submission import create_and_compile_submission, ensure_template_files

router = APIRouter(prefix="/api/submissions", tags=["submissions"])


@router.get("", response_model=list[SubmissionSummary])
def list_submissions(db: Session = Depends(get_db), user: User = Depends(require_current_user)):
    rows = db.scalars(
        select(Submission)
        .where(Submission.user_id == user.id)
        .order_by(Submission.created_at.desc(), Submission.id.desc())
    ).all()

    return [
        SubmissionSummary(
            id=r.id,
            status=r.status,
            compiler=r.compiler,
            createdAt=r.created_at,
        )
        for r in rows
    ]


@router.post("")
def submit(payload: SubmitRequest, db: Session = Depends(get_db), user: User = Depends(require_current_user)):
    ensure_template_files(ROOT_DIR)
    compiler = payload.compiler or user.compiler or "c++17"
    try:
        submission = create_and_compile_submission(
            db,
            user=user,
            code=payload.code,
            compiler=compiler,
            request_judge=bool(payload.judge),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {
        "id": submission.id,
        "status": submission.status,
    }


@router.get("/{submission_id}", response_model=SubmissionDetail)
def get_submission(submission_id: int, db: Session = Depends(get_db), user: User = Depends(require_current_user)):
    submission = db.scalar(select(Submission).where(Submission.id == submission_id, Submission.user_id == user.id))
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    return SubmissionDetail(
        id=submission.id,
        status=submission.status,
        compiler=submission.compiler,
        createdAt=submission.created_at,
        stack=submission.stack,
        stdout=submission.stdout,
        stderr=submission.stderr,
    )


@router.get("/task1/latest")
def get_latest_task1(db: Session = Depends(get_db), user: User = Depends(require_current_user)):
    run = db.scalar(
        select(JudgeRun)
        .where(JudgeRun.user_id == user.id)
        .order_by(JudgeRun.id.desc())
    )
    if not run:
        return {"nosubmission": True}

    cases = db.scalars(
        select(JudgeCase)
        .where(JudgeCase.judge_run_id == run.id)
        .order_by(JudgeCase.case_index.asc())
    ).all()

    score = 0
    display_status = run.status
    case_list = []

    for c in cases:
        if c.status == 4:
            score += 10
        if display_status < c.status:
            display_status = c.status
        case_list.append(
            {
                "index": c.case_index,
                "status": c.status,
            }
        )

    return {
        "nosubmission": False,
        "submission": {
            "id": run.id,
            "status": display_status,
            "compiler": run.compiler,
            "stderr": run.stderr,
            "cases": case_list,
        },
        "score": int(score / 90 * 100) if cases else 0,
    }


@router.get("/task1/latest/cases/{case_index}")
def get_latest_task1_case(
    case_index: Annotated[int, Path(ge=0, le=8)],
    db: Session = Depends(get_db),
    user: User = Depends(require_current_user),
):
    run = db.scalar(
        select(JudgeRun)
        .where(JudgeRun.user_id == user.id)
        .order_by(JudgeRun.id.desc())
    )
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No judge submission")

    case = db.scalar(
        select(JudgeCase).where(JudgeCase.judge_run_id == run.id, JudgeCase.case_index == case_index)
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No testcase")

    return {
        "index": case.case_index,
        "status": case.status,
        "stdout": case.stdout,
        "stderr": case.stderr,
    }

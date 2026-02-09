from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password: Mapped[str] = mapped_column(String(256))
    real_name: Mapped[str] = mapped_column(String(255))
    disp_name: Mapped[str] = mapped_column(String(255), index=True)
    admin: Mapped[bool] = mapped_column(Boolean, default=False)
    student: Mapped[bool] = mapped_column(Boolean, default=True)

    win: Mapped[int] = mapped_column(Integer, default=0)
    lose: Mapped[int] = mapped_column(Integer, default=0)
    draw: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[float] = mapped_column(Float, default=2000.0)

    compiler: Mapped[str] = mapped_column(String(32), default="c++17")
    tank_skin: Mapped[str] = mapped_column(String(1024), default="")
    bullet_skin: Mapped[str] = mapped_column(String(1024), default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    status: Mapped[int] = mapped_column(Integer, default=-1)
    stack: Mapped[str] = mapped_column(Text, default="")
    stdout: Mapped[str] = mapped_column(Text, default="")
    stderr: Mapped[str] = mapped_column(Text, default="")
    bin_path: Mapped[str] = mapped_column(Text, default="")

    compiler: Mapped[str] = mapped_column(String(32), default="c++17")
    source_path: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class JudgeRun(Base):
    __tablename__ = "judge_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    source_path: Mapped[str] = mapped_column(Text)
    compiler: Mapped[str] = mapped_column(String(32), default="c++17")
    status: Mapped[int] = mapped_column(Integer, default=0)
    stderr: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    cases: Mapped[list[JudgeCase]] = relationship("JudgeCase", back_populates="judge_run", cascade="all, delete-orphan")


class JudgeCase(Base):
    __tablename__ = "judge_cases"
    __table_args__ = (UniqueConstraint("judge_run_id", "case_index", name="uq_judge_case_index"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    judge_run_id: Mapped[int] = mapped_column(ForeignKey("judge_runs.id", ondelete="CASCADE"), index=True)
    case_index: Mapped[int] = mapped_column(Integer)

    status: Mapped[int] = mapped_column(Integer, default=1)
    stdout: Mapped[str] = mapped_column(Text, default="")
    stderr: Mapped[str] = mapped_column(Text, default="")
    exit_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    judge_run: Mapped[JudgeRun] = relationship("JudgeRun", back_populates="cases")


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status: Mapped[int] = mapped_column(Integer, default=0, index=True)

    p1_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    p2_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    winner: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_json: Mapped[str] = mapped_column(Text, default="[]")
    record_json: Mapped[str] = mapped_column(Text, default="[]")

    p1_score_before: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    p1_score_after: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    p2_score_before: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    p2_score_after: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    a_stdout: Mapped[str] = mapped_column(Text, default="")
    a_stderr: Mapped[str] = mapped_column(Text, default="")
    b_stdout: Mapped[str] = mapped_column(Text, default="")
    b_stderr: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class PasswordToken(Base):
    __tablename__ = "password_tokens"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(64), index=True)
    password: Mapped[str] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

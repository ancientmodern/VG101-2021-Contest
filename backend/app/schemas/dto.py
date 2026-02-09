from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator


class AuthStatus(BaseModel):
    status: str
    studentId: Optional[str] = None
    realName: Optional[str] = None


class LoginRequest(BaseModel):
    studentId: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")


class ForgetPasswordRequest(BaseModel):
    studentId: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")


class ProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    tskin: str = Field(default="", max_length=1024)
    bskin: str = Field(default="", max_length=1024)
    password: Optional[str] = Field(default=None, min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")
    newpassword: Optional[str] = Field(default=None, min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")

    @model_validator(mode="after")
    def validate_password_pair(self) -> "ProfileUpdateRequest":
        if (self.password is None) != (self.newpassword is None):
            raise ValueError("password and newpassword must be provided together")
        return self


class CompilerSettingsRequest(BaseModel):
    compiler: Literal["c++98", "c++11", "c++14", "c++17"]


class SubmitRequest(BaseModel):
    code: str = Field(min_length=1, max_length=2 * 1024 * 1024)
    compiler: Literal["c++98", "c++11", "c++14", "c++17"]
    judge: bool = False


class ScoreboardEntry(BaseModel):
    id: int
    dispName: str
    score: Union[float, str]
    win: int
    lose: int
    draw: int


class SubmissionSummary(BaseModel):
    id: int
    status: int
    compiler: str
    createdAt: datetime


class SubmissionDetail(BaseModel):
    id: int
    status: int
    compiler: str
    createdAt: datetime
    stack: str
    stdout: str
    stderr: str


class JudgeCaseDetail(BaseModel):
    index: int
    status: int
    stdout: str
    stderr: str


class JudgeRunDetail(BaseModel):
    id: int
    status: int
    compiler: str
    score: int
    stderr: str
    cases: list[JudgeCaseDetail]


class MatchPlayer(BaseModel):
    id: int
    dispName: str
    score: float
    tankSkin: str = ""
    bulletSkin: str = ""


class MatchListItem(BaseModel):
    id: int
    status: int
    winner: Optional[int]
    createdAt: datetime
    p1: MatchPlayer
    p2: MatchPlayer
    scores: Optional[dict[str, list[str]]] = None


class MatchListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    pages: int
    items: list[MatchListItem]


class MatchReplayResponse(BaseModel):
    record: list[dict[str, Any]]
    A: dict[str, str]
    B: dict[str, str]
    p1: str
    p2: str
    ts1: str
    ts2: str
    bs1: str
    bs2: str


class MatchDetailResponse(BaseModel):
    id: int
    winner: Optional[int]
    p1: str
    p2: str
    error: str

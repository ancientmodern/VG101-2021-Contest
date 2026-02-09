from __future__ import annotations

from fastapi import APIRouter

from app.core.legacy import LEGACY

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/meta")
def get_meta():
    return {
        "compilers": list(LEGACY.compilers.keys()) or ["c++98", "c++11", "c++14", "c++17"],
        "submissionStatus": {
            "pending": -1,
            "effective": 0,
            "inactive": 1,
            "ce": 2,
        },
        "judgeStatus": {
            0: "Waiting",
            1: "Fetched",
            2: "Compiling",
            3: "Judging",
            4: "Accepted",
            5: "Wrong Answer",
            6: "Time Exceeded",
            7: "Memory Exceeded",
            8: "Runtime Error",
            9: "Compile Error",
            10: "System Error",
        },
    }

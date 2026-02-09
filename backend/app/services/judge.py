from __future__ import annotations

import os
import select as io_select
import signal
import subprocess
import time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.settings import settings
from app.models import JudgeCase, JudgeRun
from app.services.compiler import compile_cpp
from app.services.process_limits import preexec_resource_limiter, sandbox_env


JUDGE_STATUS = {
    "Waiting": 0,
    "Fetched": 1,
    "Compiling": 2,
    "Judging": 3,
    "Accepted": 4,
    "WA": 5,
    "TLE": 6,
    "MLE": 7,
    "RE": 8,
    "CE": 9,
    "SE": 10,
}


def _kill_process_group(pid: int) -> None:
    try:
        pgid = os.getpgid(pid)
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except OSError:
        pass


def _run_case(executable: Path, case_index: int) -> dict[str, object]:
    preexec = preexec_resource_limiter(settings.run_memory_limit_mb, 2) if settings.enable_process_limits else os.setsid
    proc = subprocess.Popen(
        [str(executable), f"-{case_index}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=False,
        cwd=str(executable.parent),
        env=sandbox_env(),
        preexec_fn=preexec,
    )

    def _finish(payload: dict[str, object]) -> dict[str, object]:
        for stream in (proc.stdout, proc.stderr):
            try:
                if stream is not None and not stream.closed:
                    stream.close()
            except Exception:
                pass
        return payload

    stdout_bytes = bytearray()
    stderr_bytes = bytearray()
    total_output_bytes = 0
    output_overflow = False

    streams = []
    if proc.stdout is not None:
        streams.append(proc.stdout)
    if proc.stderr is not None:
        streams.append(proc.stderr)

    deadline = time.monotonic() + settings.run_timeout_seconds
    while streams:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            _kill_process_group(proc.pid)
            try:
                proc.communicate(timeout=0.2)
            except Exception:
                pass
            return _finish({
                "status": JUDGE_STATUS["TLE"],
                "stdout": "",
                "stderr": "Time Limit Exceeded",
                "exit_code": None,
            })

        try:
            ready, _, _ = io_select.select(streams, [], [], min(0.05, remaining))
        except OSError:
            ready = []

        if not ready:
            if proc.poll() is not None:
                break
            continue

        for stream in list(ready):
            try:
                chunk = os.read(stream.fileno(), 4096)
            except OSError:
                chunk = b""

            if not chunk:
                if stream in streams:
                    streams.remove(stream)
                continue

            total_output_bytes += len(chunk)
            if total_output_bytes > settings.max_runtime_output_bytes:
                output_overflow = True
                _kill_process_group(proc.pid)
                break

            if stream is proc.stdout:
                stdout_bytes.extend(chunk)
            else:
                stderr_bytes.extend(chunk)

        if output_overflow:
            break

    if output_overflow:
        try:
            proc.communicate(timeout=0.2)
        except Exception:
            pass
        return _finish({
            "status": JUDGE_STATUS["RE"],
            "stdout": stdout_bytes.decode("utf-8", errors="replace"),
            "stderr": "Output Limit Exceeded",
            "exit_code": None,
        })

    try:
        proc.wait(timeout=0.2)
    except subprocess.TimeoutExpired:
        _kill_process_group(proc.pid)
        try:
            proc.wait(timeout=0.2)
        except Exception:
            pass
        return _finish({
            "status": JUDGE_STATUS["TLE"],
            "stdout": "",
            "stderr": "Time Limit Exceeded",
            "exit_code": None,
        })

    stdout = stdout_bytes.decode("utf-8", errors="replace")
    stderr = stderr_bytes.decode("utf-8", errors="replace")

    if proc.returncode != 0:
        return _finish({
            "status": JUDGE_STATUS["RE"],
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": proc.returncode,
        })

    if stdout != "":
        return _finish({
            "status": JUDGE_STATUS["WA"],
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": proc.returncode,
        })

    return _finish({
        "status": JUDGE_STATUS["Accepted"],
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": proc.returncode,
    })


def process_judge_run(db: Session, run: JudgeRun) -> None:
    source_path = Path(run.source_path)
    judge_exec = source_path / "judge.out"

    run.status = JUDGE_STATUS["Compiling"]
    db.add(run)
    db.commit()

    result = compile_cpp([source_path / "driver1.cpp", source_path / "lab7.cpp"], judge_exec, run.compiler)

    if result["status"] != 0:
        run.status = JUDGE_STATUS["CE"]
        run.stderr = str(result.get("stderr", ""))
        db.add(run)
        db.commit()
        return

    run.status = JUDGE_STATUS["Fetched"]
    db.add(run)
    db.commit()

    existing = db.scalars(select(JudgeCase).where(JudgeCase.judge_run_id == run.id)).all()
    for c in existing:
        db.delete(c)
    db.commit()

    cases = []
    for idx in range(9):
        case = JudgeCase(judge_run_id=run.id, case_index=idx, status=JUDGE_STATUS["Fetched"], stdout="", stderr="")
        db.add(case)
        cases.append(case)
    run.status = JUDGE_STATUS["Judging"]
    db.add(run)
    db.commit()

    overall = JUDGE_STATUS["Judging"]

    for idx in range(9):
        case = db.scalar(select(JudgeCase).where(JudgeCase.judge_run_id == run.id, JudgeCase.case_index == idx))
        if not case:
            continue

        case_result = _run_case(judge_exec, idx + 1)
        case.status = int(case_result["status"])
        case.stdout = str(case_result["stdout"])
        case.stderr = str(case_result["stderr"])
        case.exit_code = case_result["exit_code"] if isinstance(case_result["exit_code"], int) else None

        if overall < case.status:
            overall = case.status

        db.add(case)
        run.status = overall
        db.add(run)
        db.commit()

    if overall == JUDGE_STATUS["Judging"]:
        run.status = JUDGE_STATUS["Accepted"]
    else:
        run.status = overall
    db.add(run)
    db.commit()

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Iterable

from app.core.settings import settings


VALID_COMPILERS = {"c++98", "c++11", "c++14", "c++17"}


def normalize_compiler(compiler: str) -> str:
    return compiler if compiler in VALID_COMPILERS else "c++17"


def _truncate_output(text: str | None, limit_bytes: int) -> str:
    if not text:
        return ""

    raw = text.encode("utf-8", errors="replace")
    if len(raw) <= limit_bytes:
        return text

    suffix = b"\n... [truncated]\n"
    keep = max(0, limit_bytes - len(suffix))
    return (raw[:keep] + suffix).decode("utf-8", errors="replace")


def compile_cpp(sources: Iterable[Path], output: Path, compiler: str) -> dict[str, object]:
    compiler = normalize_compiler(compiler)
    output.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "g++",
        *[str(s) for s in sources],
        "-o",
        str(output),
        f"-std={compiler}",
        "-lm",
        "-Werror",
        "-Wall",
        "-O3",
    ]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=settings.compile_timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        stdout = _truncate_output(exc.stdout, settings.max_compile_log_bytes)
        stderr = _truncate_output(exc.stderr, settings.max_compile_log_bytes)
        return {
            "status": 2,
            "stack": "Compile Timeout",
            "stdout": stdout,
            "stderr": stderr or "Compile timed out",
            "bin": str(output),
        }
    except FileNotFoundError:
        return {
            "status": 2,
            "stack": "Compiler Not Found",
            "stdout": "",
            "stderr": "g++ not found in PATH",
            "bin": str(output),
        }

    stdout = _truncate_output(proc.stdout, settings.max_compile_log_bytes)
    stderr = _truncate_output(proc.stderr, settings.max_compile_log_bytes)

    if proc.returncode != 0:
        return {
            "status": 2,
            "stack": f"Compile Error ({proc.returncode})",
            "stdout": stdout,
            "stderr": stderr,
            "bin": str(output),
        }

    if not output.exists():
        return {
            "status": 2,
            "stack": "Compile Error",
            "stdout": stdout,
            "stderr": "Compiler succeeded but no executable was produced",
            "bin": str(output),
        }

    return {
        "status": 0,
        "stack": "",
        "stdout": stdout,
        "stderr": stderr,
        "bin": str(output),
    }

from __future__ import annotations

import hashlib
import shutil
import time
import uuid
from datetime import timedelta
from pathlib import Path

from sqlalchemy import desc, select, update
from sqlalchemy.orm import Session

from app.core.security import utc_now
from app.core.settings import EXECUTABLE_DIR, SUBMISSION_DIR, TEMPLATE_DIR, settings
from app.models import JudgeRun, Submission, User
from app.services.compiler import compile_cpp, normalize_compiler

TEMPLATE_SOURCES = {
    "main.cpp": Path("core/test/main.cpp"),
    "driver1.cpp": Path("core/test/driver1.cpp"),
    "lab6.h": Path("core/test/lab6.h"),
}


def ensure_template_files(repo_root: Path) -> None:
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)

    for target_name, source_rel in TEMPLATE_SOURCES.items():
        src = repo_root / source_rel
        dst = TEMPLATE_DIR / target_name
        if src.exists() and not dst.exists():
            shutil.copyfile(src, dst)

    lab6 = TEMPLATE_DIR / "lab6.h"
    lab7 = TEMPLATE_DIR / "lab7.h"
    if lab6.exists() and not lab7.exists():
        shutil.copyfile(lab6, lab7)


def _new_source_dir(user_id: int) -> Path:
    SUBMISSION_DIR.mkdir(parents=True, exist_ok=True)
    raw = f"{int(time.time() * 1000)}-{user_id}-{uuid.uuid4().hex}"
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    path = SUBMISSION_DIR / digest
    path.mkdir(parents=True, exist_ok=False)
    return path


def _copy_template_to_source(source_dir: Path) -> None:
    for file in TEMPLATE_DIR.glob("*"):
        if file.is_file():
            shutil.copyfile(file, source_dir / file.name)


def create_and_compile_submission(
    db: Session,
    *,
    user: User,
    code: str,
    compiler: str,
    request_judge: bool,
) -> Submission:
    compiler = normalize_compiler(compiler)

    if len(code.encode("utf-8")) > settings.max_source_size_bytes:
        raise ValueError(f"Source code exceeds limit ({settings.max_source_size_bytes} bytes)")
    if settings.min_submission_interval_seconds > 0:
        last_submission = db.scalar(
            select(Submission)
            .where(Submission.user_id == user.id)
            .order_by(desc(Submission.created_at), desc(Submission.id))
            .limit(1)
        )
        if last_submission and last_submission.created_at.replace(tzinfo=None) > (
            utc_now() - timedelta(seconds=settings.min_submission_interval_seconds)
        ):
            raise ValueError(
                f"Please wait at least {settings.min_submission_interval_seconds} seconds between submissions"
            )

    source_dir = _new_source_dir(user.id)
    _copy_template_to_source(source_dir)
    (source_dir / "lab7.cpp").write_text(code, encoding="utf-8")

    submission = Submission(
        user_id=user.id,
        status=-1,
        stack="",
        stdout="",
        stderr="",
        bin_path="",
        compiler=compiler,
        source_path=str(source_dir),
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    executable_path = EXECUTABLE_DIR / f"{int(time.time() * 1000)}-{user.id}-{submission.id}"

    compile_result = compile_cpp([source_dir / "lab7.cpp", source_dir / "main.cpp"], executable_path, compiler)
    submission.stack = str(compile_result.get("stack", ""))
    submission.stdout = str(compile_result.get("stdout", ""))
    submission.stderr = str(compile_result.get("stderr", ""))

    if compile_result["status"] == 0:
        try:
            bin_size = executable_path.stat().st_size
        except OSError:
            bin_size = -1

        if bin_size <= 0:
            submission.status = 2
            submission.stack = "Compile Error"
            submission.stderr = "Compilation finished without a valid executable"
            submission.bin_path = ""
        elif bin_size > settings.max_executable_size_bytes:
            submission.status = 2
            submission.stack = "Executable Too Large"
            submission.stderr = f"Executable exceeds limit ({settings.max_executable_size_bytes} bytes)"
            submission.bin_path = ""
            try:
                executable_path.unlink()
            except OSError:
                pass
        else:
            submission.status = 0
            submission.bin_path = str(executable_path)
    else:
        submission.status = 2
        submission.bin_path = ""

    if submission.status == 0:
        db.execute(
            update(Submission)
            .where(Submission.user_id == user.id, Submission.status == 0, Submission.id != submission.id)
            .values(status=1)
        )

    db.add(submission)

    if request_judge:
        db.add(
            JudgeRun(
                user_id=user.id,
                source_path=str(source_dir),
                compiler=compiler,
                status=0,
                stderr="",
            )
        )

    db.commit()
    db.refresh(submission)
    return submission

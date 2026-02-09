from __future__ import annotations

import hashlib
import os
import sys
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

_TMP = tempfile.TemporaryDirectory(prefix="tankwar-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TMP.name) / 'tankwar-test.db'}"
os.environ["ENABLE_WORKERS"] = "0"
os.environ["APP_ENV"] = "test"
os.environ["PASSWORD_TOKEN_TTL_SECONDS"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import SessionLocal  # noqa: E402
from app.core.legacy import STUDENTS  # noqa: E402
from app.core.security import utc_now  # noqa: E402
from app.models import Submission, User  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PasswordToken  # noqa: E402
from app.services.judge import JUDGE_STATUS, _run_case  # noqa: E402
from app.services.match_runner import MatchRunner  # noqa: E402
from app.services.process_limits import sandbox_env  # noqa: E402
from app.services.submission import create_and_compile_submission  # noqa: E402
from app.core.settings import settings  # noqa: E402


def _client_hash(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def _pick_students() -> tuple[str, str, str, str, str, str, str]:
    all_ids = list(STUDENTS.keys())
    if len(all_ids) < 7:
        raise RuntimeError("students.json must contain at least 7 students for smoke tests")
    return all_ids[0], all_ids[1], all_ids[2], all_ids[3], all_ids[4], all_ids[5], all_ids[6]


class PublishSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client_ctx = TestClient(app)
        cls.client = cls.client_ctx.__enter__()
        (
            cls.admin_id,
            cls.student_login_id,
            cls.student_profile_id,
            cls.student_reset_id,
            cls.student_interval_id,
            cls.student_pair_validation_id,
            cls.student_case_index_id,
        ) = _pick_students()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client_ctx.__exit__(None, None, None)
        _TMP.cleanup()

    def test_login_check_logout(self) -> None:
        res = self.client.post(
            "/api/auth/login",
            json={"studentId": self.student_login_id, "password": _client_hash("student-pass")},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get("status"), "OK")

        res = self.client.get("/api/auth/check")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get("studentId"), self.student_login_id)

        res = self.client.post("/api/auth/logout")
        self.assertEqual(res.status_code, 200)

        res = self.client.get("/api/auth/check")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get("status"), "FAIL")

    def test_profile_password_update_keeps_other_fields(self) -> None:
        old_password = _client_hash("student-pass")
        new_password = _client_hash("student-pass-new")

        res = self.client.post(
            "/api/auth/login",
            json={"studentId": self.student_profile_id, "password": old_password},
        )
        self.assertEqual(res.status_code, 200)

        res = self.client.put(
            "/api/profile",
            json={
                "name": "Student Name",
                "tskin": "https://example.com/tank-a.png",
                "bskin": "https://example.com/bullet-a.png",
            },
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json().get("wrongPassword"))

        res = self.client.put(
            "/api/profile",
            json={
                "name": "<strong>Student Name 2</strong>",
                "tskin": "https://example.com/tank-b.png",
                "bskin": "https://example.com/bullet-b.png",
                "password": old_password,
                "newpassword": new_password,
            },
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertFalse(body.get("wrongPassword"))
        self.assertEqual(body["profile"]["tankSkin"], "https://example.com/tank-b.png")
        self.assertEqual(body["profile"]["bulletSkin"], "https://example.com/bullet-b.png")
        self.assertEqual(body["profile"]["dispName"], "&lt;strong&gt;Student Name 2&lt;/strong&gt;")

        self.client.post("/api/auth/logout")
        res = self.client.post(
            "/api/auth/login",
            json={"studentId": self.student_profile_id, "password": new_password},
        )
        self.assertEqual(res.status_code, 200)

    def test_password_reset_token_expires(self) -> None:
        student_password = _client_hash("student-reset-pass")
        admin_password = _client_hash("admin-pass")

        # Ensure target student exists.
        res = self.client.post(
            "/api/auth/login",
            json={"studentId": self.student_reset_id, "password": student_password},
        )
        self.assertEqual(res.status_code, 200)
        self.client.post("/api/auth/logout")

        # Ensure admin exists and owns current session.
        res = self.client.post(
            "/api/auth/login",
            json={"studentId": self.admin_id, "password": admin_password},
        )
        self.assertEqual(res.status_code, 200)

        res = self.client.post(
            "/api/auth/forget-password",
            json={"studentId": self.student_reset_id, "password": _client_hash("reset-pass")},
        )
        self.assertEqual(res.status_code, 200)
        token = res.json()["token"]

        with SessionLocal() as db:
            rec = db.scalar(select(PasswordToken).where(PasswordToken.id == token))
            self.assertIsNotNone(rec)
            rec.created_at = utc_now() - timedelta(seconds=10)
            db.add(rec)
            db.commit()

        res = self.client.post(f"/api/auth/admin/setpwd/{self.student_reset_id}/{token}")
        self.assertEqual(res.status_code, 410)

    def test_judge_timeout_maps_to_tle(self) -> None:
        script = Path(_TMP.name) / "sleepy.sh"
        script.write_text("#!/bin/sh\nsleep 2\n", encoding="utf-8")
        script.chmod(0o755)

        result = _run_case(script, 1)
        self.assertEqual(result["status"], JUDGE_STATUS["TLE"])

    def test_judge_output_limit_maps_to_runtime_error(self) -> None:
        spam = Path(_TMP.name) / "judge-spam.sh"
        spam.write_text("#!/bin/sh\nwhile true; do echo spam; done\n", encoding="utf-8")
        spam.chmod(0o755)

        original_limit = settings.max_runtime_output_bytes
        settings.max_runtime_output_bytes = 256
        try:
            result = _run_case(spam, 1)
        finally:
            settings.max_runtime_output_bytes = original_limit

        self.assertEqual(result["status"], JUDGE_STATUS["RE"])
        self.assertIn("Output Limit Exceeded", str(result["stderr"]))

    def test_submission_interval_limit(self) -> None:
        student_id = self.student_interval_id
        student_password = _client_hash("submission-interval-pass")
        res = self.client.post(
            "/api/auth/login",
            json={"studentId": student_id, "password": student_password},
        )
        self.assertEqual(res.status_code, 200)

        with SessionLocal() as db:
            user = db.scalar(select(User).where(User.student_id == student_id))
            self.assertIsNotNone(user)
            db.add(
                Submission(
                    user_id=user.id,
                    status=-1,
                    stack="",
                    stdout="",
                    stderr="",
                    bin_path="",
                    compiler="c++17",
                    source_path="",
                    created_at=utc_now(),
                )
            )
            db.commit()

            with self.assertRaisesRegex(ValueError, "Please wait at least"):
                create_and_compile_submission(
                    db,
                    user=user,
                    code="int main(){return 0;}",
                    compiler="c++17",
                    request_judge=False,
                )

    def test_profile_password_pair_validation(self) -> None:
        student_id = self.student_pair_validation_id
        student_password = _client_hash("pair-validation-pass")
        res = self.client.post(
            "/api/auth/login",
            json={"studentId": student_id, "password": student_password},
        )
        self.assertEqual(res.status_code, 200)

        # password/newpassword must be provided together
        res = self.client.put(
            "/api/profile",
            json={
                "name": "Name",
                "tskin": "",
                "bskin": "",
                "password": _client_hash("only-one"),
            },
        )
        self.assertEqual(res.status_code, 422)

    def test_task1_case_index_validation(self) -> None:
        student_id = self.student_case_index_id
        student_password = _client_hash("case-index-pass")
        res = self.client.post(
            "/api/auth/login",
            json={"studentId": student_id, "password": student_password},
        )
        self.assertEqual(res.status_code, 200)

        res = self.client.get("/api/submissions/task1/latest/cases/9")
        self.assertEqual(res.status_code, 422)

    def test_sandbox_env_does_not_expose_service_secrets(self) -> None:
        os.environ["SECRET_KEY"] = "should-not-be-visible"
        env = sandbox_env()
        self.assertNotIn("SECRET_KEY", env)
        self.assertIn("PATH", env)

    def test_match_runner_output_limit(self) -> None:
        spam = Path(_TMP.name) / "spam.sh"
        spam.write_text("#!/bin/sh\nwhile true; do echo 0; done\n", encoding="utf-8")
        spam.chmod(0o755)

        original_limit = settings.max_runtime_output_bytes
        settings.max_runtime_output_bytes = 512
        try:
            result = MatchRunner().run(spam, spam)
        finally:
            settings.max_runtime_output_bytes = original_limit

        self.assertIn(result.winner, {0, 1})
        self.assertTrue(any(err.get("msg") == "Output Limit Exceeded" for err in result.error))


if __name__ == "__main__":
    unittest.main()

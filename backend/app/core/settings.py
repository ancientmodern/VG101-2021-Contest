from __future__ import annotations

import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT_DIR / "backend"
RUNTIME_DIR = BACKEND_DIR / "runtime"
SUBMISSION_DIR = RUNTIME_DIR / "submissions"
EXECUTABLE_DIR = RUNTIME_DIR / "executables"
TEMPLATE_DIR = RUNTIME_DIR / "template"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    app_name: str = os.getenv("APP_NAME", "TankWar OJ")
    app_env: str = os.getenv("APP_ENV", "dev")
    secret_key: str = os.getenv("SECRET_KEY", "replace-me-in-prod")
    frontend_origin: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

    db_url: str = os.getenv("DATABASE_URL", f"sqlite:///{(RUNTIME_DIR / 'tankwar.db').as_posix()}")

    session_cookie_name: str = "session_id"
    session_ttl_seconds: int = int(os.getenv("SESSION_TTL_SECONDS", str(24 * 3600)))
    session_cookie_secure: bool = _env_bool("SESSION_COOKIE_SECURE", app_env == "prod")

    worker_poll_interval_seconds: float = float(os.getenv("WORKER_POLL_INTERVAL_SECONDS", "2.0"))
    max_match_workers: int = int(os.getenv("MAX_MATCH_WORKERS", "2"))
    enable_workers: bool = _env_bool("ENABLE_WORKERS", True)

    compile_timeout_seconds: int = int(os.getenv("COMPILE_TIMEOUT_SECONDS", "20"))
    run_timeout_seconds: float = float(os.getenv("RUN_TIMEOUT_SECONDS", "1.0"))
    run_memory_limit_mb: int = int(os.getenv("RUN_MEMORY_LIMIT_MB", "256"))
    enable_process_limits: bool = _env_bool("ENABLE_PROCESS_LIMITS", app_env == "prod")
    max_runtime_output_bytes: int = int(os.getenv("MAX_RUNTIME_OUTPUT_BYTES", str(64 * 1024)))
    max_compile_log_bytes: int = int(os.getenv("MAX_COMPILE_LOG_BYTES", str(256 * 1024)))
    max_source_size_bytes: int = int(os.getenv("MAX_SOURCE_SIZE_BYTES", str(1024 * 1024)))
    max_executable_size_bytes: int = int(os.getenv("MAX_EXECUTABLE_SIZE_BYTES", str(1024 * 1024)))
    min_submission_interval_seconds: int = int(os.getenv("MIN_SUBMISSION_INTERVAL_SECONDS", "60"))

    password_token_ttl_seconds: int = int(os.getenv("PASSWORD_TOKEN_TTL_SECONDS", str(24 * 3600)))

    legacy_config_path: Path = ROOT_DIR / "config" / "config.json"
    legacy_students_path: Path = ROOT_DIR / "config" / "students.json"

    def validate(self) -> None:
        if self.app_env != "prod":
            return

        insecure = {"", "replace-me", "replace-me-in-prod", "changeme", "default"}
        if self.secret_key.strip() in insecure:
            raise RuntimeError("SECRET_KEY must be set to a strong value when APP_ENV=prod")


settings = Settings()

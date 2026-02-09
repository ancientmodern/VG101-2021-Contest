from __future__ import annotations

import base64
import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from itsdangerous import BadSignature, URLSafeSerializer

from app.core.settings import settings


def _load_legacy_salt() -> str:
    path = settings.legacy_config_path
    if not path.exists():
        return "123"
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("security", {}).get("salt", "123")


LEGACY_SALT = _load_legacy_salt()
_session_serializer = URLSafeSerializer(settings.secret_key, salt="tankwar-session")


def hash_legacy_password(client_hashed_password: str) -> str:
    digest = hashlib.sha256((client_hashed_password + LEGACY_SALT).encode("utf-8")).digest()
    return base64.b64encode(digest).decode("utf-8")


def new_session_token(payload: dict[str, Any]) -> str:
    return _session_serializer.dumps(payload)


def parse_session_token(token: str) -> Optional[dict[str, Any]]:
    try:
        return _session_serializer.loads(token)
    except BadSignature:
        return None


def utc_now() -> datetime:
    return datetime.utcnow()


def utc_after(seconds: int) -> datetime:
    return utc_now() + timedelta(seconds=seconds)

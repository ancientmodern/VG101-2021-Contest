from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import auth, matches, meta, profile, scoreboard, submissions
from app.core.database import Base, engine
from app.core.settings import ROOT_DIR, settings
from app.services.submission import ensure_template_files
from app.services.worker import workers


app = FastAPI(title=settings.app_name)

allowed_origins = {settings.frontend_origin}
if settings.app_env != "prod":
    allowed_origins.update({"http://127.0.0.1:5173", "http://localhost:5173"})

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(scoreboard.router)
app.include_router(submissions.router)
app.include_router(matches.router)
app.include_router(profile.router)
app.include_router(meta.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def startup() -> None:
    settings.validate()
    Base.metadata.create_all(bind=engine)
    ensure_template_files(ROOT_DIR)
    if settings.enable_workers:
        workers.start()


@app.on_event("shutdown")
def shutdown() -> None:
    if settings.enable_workers:
        workers.stop()


rules_dir = ROOT_DIR / "public" / "rules"
if rules_dir.exists():
    app.mount("/rules-static", StaticFiles(directory=str(rules_dir)), name="rules-static")

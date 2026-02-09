# TankWar OJ (Refactored)

This repository has been fully refactored from the legacy Node.js + EJS monolith into a separated modern stack:

- Frontend: React + TypeScript + Vite (`/frontend`)
- Backend: FastAPI + SQLAlchemy (`/backend`)
- Background workers: integrated backend worker loops for Task1 judge and continuous matchmaking

The original course manual/rules are preserved in:

- `docs/legacy-lab-manual.md`
- `public/rules/`

## Feature Parity

The refactor keeps all existing core functionality:

- Student login with whitelist-based auto-registration
- Password reset token flow and TA admin reset endpoint
- Scoreboard with rated/unrated behavior and legacy color tiers
- Code submissions with compile statuses: `Pending/Effective/Inactive/Compile Error`
- Task1 judge (9 testcases) with per-case status + stderr/stdout views
- Continuous random matchmaking among effective submissions
- Match replay with animation + STDIO view
- Profile updates (display name, tank skin, bullet skin, password)
- Compiler default settings page

## Quick Start

### 1) Install backend dependencies

```bash
python3 -m pip install -r backend/requirements.txt
```

Python 3.9+ is supported.

### 2) Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 3) Run both services

```bash
./scripts/dev.sh
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

## Useful Commands

Run backend only:

```bash
./scripts/backend.sh
```

Build frontend:

```bash
cd frontend && npm run build
```

## Data and Runtime Paths

- SQLite database: `backend/runtime/tankwar.db`
- Submission workspace: `backend/runtime/submissions/`
- Compiled executables: `backend/runtime/executables/`
- C++ templates used for compile/judge: `backend/runtime/template/`

## Legacy Mongo Migration

If you want to migrate existing legacy MongoDB data:

```bash
python3 -m pip install pymongo
python3 backend/scripts/migrate_from_mongo.py
```

The script reads legacy Mongo config from `config/config.json`.

## API Surface (new)

- Auth: `/api/auth/*`
- Scoreboard: `/api/scoreboard`
- Profile: `/api/profile*`
- Submissions: `/api/submissions*`
- Matches: `/api/matches*`
- Meta: `/api/meta`
- Health: `/api/health`

## Notes on OJ Safety

This version adds process resource limits for user programs and keeps execution in isolated subprocess groups. For production-grade isolation, run judge/match workers in dedicated sandbox containers with stricter host-level controls.

For production deployment:

- Set a strong `SECRET_KEY`
- Set `APP_ENV=prod`
- Set `SESSION_COOKIE_SECURE=1` behind HTTPS
- Prefer `ENABLE_PROCESS_LIMITS=1` (defaults to enabled when `APP_ENV=prod`)
- Tune OJ limits: `MIN_SUBMISSION_INTERVAL_SECONDS`, `MAX_SOURCE_SIZE_BYTES`, `MAX_EXECUTABLE_SIZE_BYTES`, `MAX_RUNTIME_OUTPUT_BYTES`, `MAX_COMPILE_LOG_BYTES`

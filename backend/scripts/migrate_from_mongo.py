#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))

try:
    from pymongo import MongoClient
except Exception as exc:  # pragma: no cover
    print('pymongo is required for migration: pip install pymongo')
    raise

from app.core.database import Base, SessionLocal, engine
from app.models import JudgeCase, JudgeRun, Match, PasswordToken, Submission, User


def objectid_time(oid: Any):
    try:
        return oid.generation_time.replace(tzinfo=None)
    except Exception:
        return None


def load_legacy_config():
    cfg_path = ROOT / 'config' / 'config.json'
    with cfg_path.open('r', encoding='utf-8') as f:
        cfg = json.load(f)
    mongo_url = f"mongodb://{cfg['db']['user']}:{cfg['db']['password']}@{cfg['db']['ip']}:{cfg['db']['port']}/{cfg['db']['db']}"
    return cfg['db']['db'], mongo_url


def main() -> None:
    db_name, mongo_url = load_legacy_config()

    Base.metadata.create_all(bind=engine)

    mongo = MongoClient(mongo_url)
    old = mongo[db_name]

    user_map: dict[str, int] = {}

    with SessionLocal() as db:
        print('Migrating users...')
        for doc in old['user'].find({}):
            user = User(
                student_id=str(doc.get('studentId', '')),
                password=str(doc.get('password', '')),
                real_name=str(doc.get('realName', '')),
                disp_name=str(doc.get('dispName', '')),
                admin=bool(doc.get('admin', False)),
                student=bool(doc.get('student', True)),
                win=int(doc.get('win', 0)),
                lose=int(doc.get('lose', 0)),
                draw=int(doc.get('draw', 0)),
                score=float(doc.get('score', 2000)),
                compiler=str(doc.get('compiler', 'c++17')),
                tank_skin=str(doc.get('tankSkin', '')),
                bullet_skin=str(doc.get('bulletSkin', '')),
                created_at=objectid_time(doc.get('_id')),
            )
            db.add(user)
            db.flush()
            user_map[str(doc.get('_id'))] = user.id

        db.commit()

        print('Migrating submissions...')
        for doc in old['submission'].find({}):
            uid = user_map.get(str(doc.get('user')))
            if not uid:
                continue
            row = Submission(
                user_id=uid,
                status=int(doc.get('status', -1)),
                stack=str(doc.get('stack', '')),
                stdout=str(doc.get('stdout', '')),
                stderr=str(doc.get('stderr', '')),
                bin_path=str(doc.get('bin', '')),
                compiler=str(doc.get('compiler', 'c++17')),
                source_path=str(doc.get('source', '')),
                created_at=objectid_time(doc.get('_id')),
            )
            db.add(row)

        db.commit()

        print('Migrating judge runs...')
        for doc in old['judge'].find({}):
            uid = user_map.get(str(doc.get('user')))
            if not uid:
                continue

            run = JudgeRun(
                user_id=uid,
                source_path=str(doc.get('source', '')),
                compiler=str(doc.get('compiler', 'c++17')),
                status=int(doc.get('status', 0)),
                stderr=str(doc.get('stderr', '')),
                created_at=objectid_time(doc.get('_id')),
            )
            db.add(run)
            db.flush()

            for idx, case in enumerate(doc.get('testcases', []) or []):
                db.add(
                    JudgeCase(
                        judge_run_id=run.id,
                        case_index=idx,
                        status=int(case.get('status', 0)),
                        stdout=str(case.get('stdout', '')),
                        stderr=str(case.get('stderr', '')),
                        exit_code=case.get('code') if isinstance(case.get('code'), int) else None,
                    )
                )

        db.commit()

        print('Migrating matches...')
        for doc in old['match'].find({}):
            p1 = user_map.get(str(doc.get('p1')))
            p2 = user_map.get(str(doc.get('p2')))
            if not p1 or not p2:
                continue

            scores = doc.get('scores', {})
            p1_scores = scores.get('p1', [None, None])
            p2_scores = scores.get('p2', [None, None])

            row = Match(
                status=int(doc.get('status', 0)),
                p1_user_id=p1,
                p2_user_id=p2,
                winner=int(doc.get('winner')) if doc.get('winner') is not None else None,
                error_json=json.dumps(doc.get('error', []), ensure_ascii=False),
                record_json=json.dumps(doc.get('record', []), ensure_ascii=False),
                p1_score_before=float(p1_scores[0]) if p1_scores and p1_scores[0] not in (None, '') else None,
                p1_score_after=float(p1_scores[1]) if p1_scores and len(p1_scores) > 1 and p1_scores[1] not in (None, '') else None,
                p2_score_before=float(p2_scores[0]) if p2_scores and p2_scores[0] not in (None, '') else None,
                p2_score_after=float(p2_scores[1]) if p2_scores and len(p2_scores) > 1 and p2_scores[1] not in (None, '') else None,
                a_stdout=str((doc.get('A') or {}).get('stdout', '')),
                a_stderr=str((doc.get('A') or {}).get('stderr', '')),
                b_stdout=str((doc.get('B') or {}).get('stdout', '')),
                b_stderr=str((doc.get('B') or {}).get('stderr', '')),
                created_at=objectid_time(doc.get('_id')),
            )
            db.add(row)

        db.commit()

        print('Migrating password tokens...')
        for doc in old['password_token'].find({}):
            row = PasswordToken(
                id=str(doc.get('_id')),
                student_id=str(doc.get('studentId', '')),
                password=str(doc.get('password', '')),
                created_at=objectid_time(doc.get('_id')),
            )
            db.add(row)

        db.commit()

    print('Migration completed.')


if __name__ == '__main__':
    main()

from __future__ import annotations

import json
import logging
import random
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import desc, func, select

from app.core.database import SessionLocal
from app.core.legacy import LEGACY
from app.core.settings import settings
from app.models import JudgeRun, Match, Submission, User
from app.services.judge import process_judge_run
from app.services.match_runner import MatchRunner
from app.services.ranking import apply_result

logger = logging.getLogger(__name__)


class WorkerManager:
    def __init__(self) -> None:
        self._stop_event = threading.Event()
        self._threads: list[threading.Thread] = []
        self._match_lock = threading.Lock()

    def start(self) -> None:
        if self._threads:
            return
        self._stop_event.clear()

        judge_thread = threading.Thread(target=self._judge_loop, daemon=True, name="judge-loop")
        match_thread = threading.Thread(target=self._match_loop, daemon=True, name="match-loop")
        judge_thread.start()
        match_thread.start()

        self._threads = [judge_thread, match_thread]

    def stop(self) -> None:
        self._stop_event.set()
        for t in self._threads:
            t.join(timeout=1)
        self._threads = []

    def _judge_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                with SessionLocal() as db:
                    run = db.scalar(select(JudgeRun).where(JudgeRun.status == 0).order_by(JudgeRun.id.asc()))
                    if run:
                        process_judge_run(db, run)
            except Exception as exc:
                # keep worker alive on unexpected user-code failures
                logger.exception("[judge-loop] unexpected error: %s", exc)

            self._stop_event.wait(settings.worker_poll_interval_seconds)

    def _match_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                with self._match_lock:
                    with SessionLocal() as db:
                        effective = db.scalars(
                            select(Submission)
                            .where(Submission.status == 0)
                            .order_by(desc(Submission.created_at), desc(Submission.id))
                        ).all()

                        latest_by_user: dict[int, Submission] = {}
                        for sub in effective:
                            if sub.user_id not in latest_by_user:
                                latest_by_user[sub.user_id] = sub

                        active = list(latest_by_user.values())
                        if len(active) >= 2:
                            s1, s2 = random.sample(active, 2)

                            match = Match(
                                status=0,
                                p1_user_id=s1.user_id,
                                p2_user_id=s2.user_id,
                            )
                            db.add(match)
                            db.commit()
                            db.refresh(match)

                            bin_a = Path(s1.bin_path)
                            bin_b = Path(s2.bin_path)
                            if (not bin_a.exists()) or (not bin_b.exists()):
                                db.delete(match)
                                db.commit()
                                self._stop_event.wait(settings.worker_poll_interval_seconds)
                                continue

                            runner = MatchRunner(map_size=LEGACY.default_map_size)
                            result = runner.run(bin_a=bin_a, bin_b=bin_b)

                            user1 = db.scalar(select(User).where(User.id == s1.user_id))
                            user2 = db.scalar(select(User).where(User.id == s2.user_id))

                            if not user1 or not user2:
                                db.delete(match)
                                db.commit()
                                self._stop_event.wait(settings.worker_poll_interval_seconds)
                                continue

                            p1_before = float(user1.score)
                            p2_before = float(user2.score)

                            apply_result(user1, user2, result.winner)

                            match.status = 1
                            match.winner = result.winner
                            match.error_json = json.dumps(result.error, ensure_ascii=False)
                            match.record_json = json.dumps(result.record, ensure_ascii=False)
                            match.p1_score_before = p1_before
                            match.p1_score_after = float(user1.score)
                            match.p2_score_before = p2_before
                            match.p2_score_after = float(user2.score)
                            match.a_stdout = result.a["stdout"]
                            match.a_stderr = result.a["stderr"]
                            match.b_stdout = result.b["stdout"]
                            match.b_stderr = result.b["stderr"]
                            match.updated_at = datetime.now(timezone.utc)

                            db.add(user1)
                            db.add(user2)
                            db.add(match)

                            # trim old records
                            count = db.scalar(select(func.count(Match.id))) or 0
                            if count > LEGACY.max_game_record:
                                old = db.scalar(select(Match).order_by(Match.id.asc()))
                                if old:
                                    db.delete(old)

                            db.commit()
            except Exception as exc:
                logger.exception("[match-loop] unexpected error: %s", exc)

            self._stop_event.wait(settings.worker_poll_interval_seconds)


workers = WorkerManager()

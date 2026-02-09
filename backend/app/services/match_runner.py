from __future__ import annotations

import os
import queue
import signal
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.core.settings import settings
from app.services.game_engine import Game
from app.services.process_limits import preexec_resource_limiter, sandbox_env


def _runtime_error_message(code: Optional[int]) -> str:
    if code is None:
        return "Runtime Error"
    if code == 0:
        return "Accidentally Exit"
    if code < 0:
        try:
            sig = signal.Signals(-code).name
        except Exception:
            sig = str(-code)
        return f"Runtime Error ({sig})"
    return f"Runtime Error ({code})"


class PlayerProcess:
    def __init__(self, executable: Path):
        self.executable = executable
        preexec = preexec_resource_limiter(settings.run_memory_limit_mb, 120) if settings.enable_process_limits else os.setsid
        self.proc = subprocess.Popen(
            [str(executable), "-r"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            cwd=str(executable.parent),
            env=sandbox_env(),
            preexec_fn=preexec,
        )
        self._stdout_queue: queue.Queue[str] = queue.Queue()
        self.stdout_log = ""
        self.stderr_log = ""
        self._output_size = 0
        self.output_overflow = False
        self._stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
        self._stdout_thread.start()
        self._stderr_thread.start()

    def _append_output(self, text: str) -> bool:
        self._output_size += len(text.encode("utf-8", errors="ignore"))
        if self._output_size > settings.max_runtime_output_bytes:
            self.output_overflow = True
            self.kill()
            return False
        return True

    def _read_stdout(self) -> None:
        assert self.proc.stdout is not None
        while True:
            data = self.proc.stdout.readline()
            if data == "":
                break
            if not self._append_output(data):
                break
            self._stdout_queue.put(data)

    def _read_stderr(self) -> None:
        assert self.proc.stderr is not None
        while True:
            data = self.proc.stderr.readline()
            if data == "":
                break
            if not self._append_output(data):
                break
            self.stderr_log += data

    def send(self, text: str) -> None:
        if self.proc.stdin is None:
            return
        try:
            self.proc.stdin.write(text)
            self.proc.stdin.flush()
        except BrokenPipeError:
            return

    def try_pop_move_line(self) -> Optional[str]:
        try:
            return self._stdout_queue.get_nowait()
        except queue.Empty:
            return None

    def poll(self) -> Optional[int]:
        return self.proc.poll()

    def kill(self) -> None:
        if self.proc.poll() is None:
            try:
                pgid = os.getpgid(self.proc.pid)
                os.killpg(pgid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except OSError:
                try:
                    self.proc.kill()
                except OSError:
                    pass

        try:
            self.proc.wait(timeout=0.2)
        except subprocess.TimeoutExpired:
            try:
                self.proc.kill()
                self.proc.wait(timeout=0.2)
            except Exception:
                pass

        for stream in (self.proc.stdin, self.proc.stdout, self.proc.stderr):
            try:
                if stream is not None and not stream.closed:
                    stream.close()
            except Exception:
                pass


@dataclass
class MatchResult:
    winner: int
    error: list[dict[str, object]]
    record: list[dict[str, object]]
    a: dict[str, str]
    b: dict[str, str]


class MatchRunner:
    def __init__(self, map_size: int = 20):
        self.game = Game(map_size)
        self.record: list[dict[str, object]] = [self.game.to_record()]

    def run(self, bin_a: Path, bin_b: Path) -> MatchResult:
        errors: list[dict[str, object]] = []
        player_a = PlayerProcess(bin_a)
        player_b = PlayerProcess(bin_b)

        init_a = (
            f"{self.game.tanks[0].position.x} {self.game.tanks[0].position.y} "
            f"{self.game.tanks[1].position.x} {self.game.tanks[1].position.y} "
            f"{self.game.tanks[0].direction} {self.game.tanks[1].direction}\n"
        )
        init_b = (
            f"{self.game.tanks[1].position.x} {self.game.tanks[1].position.y} "
            f"{self.game.tanks[0].position.x} {self.game.tanks[0].position.y} "
            f"{self.game.tanks[1].direction} {self.game.tanks[0].direction}\n"
        )

        player_a.send(init_a)
        player_b.send(init_b)

        move_a = -1
        move_b = -1

        while True:
            deadline = time.monotonic() + settings.run_timeout_seconds

            while time.monotonic() < deadline and (move_a == -1 or move_b == -1):
                if player_a.output_overflow:
                    errors.append({"player": 0, "msg": "Output Limit Exceeded"})
                    player_a.kill()
                    player_b.kill()
                    return MatchResult(1, errors, self.record, {"stdout": player_a.stdout_log, "stderr": player_a.stderr_log}, {"stdout": player_b.stdout_log, "stderr": player_b.stderr_log})

                if player_b.output_overflow:
                    errors.append({"player": 1, "msg": "Output Limit Exceeded"})
                    player_a.kill()
                    player_b.kill()
                    return MatchResult(0, errors, self.record, {"stdout": player_a.stdout_log, "stderr": player_a.stderr_log}, {"stdout": player_b.stdout_log, "stderr": player_b.stderr_log})

                if move_a == -1:
                    line = player_a.try_pop_move_line()
                    if line is not None:
                        char = line[:1]
                        if char not in {"0", "1", "2"}:
                            errors.append({"player": 0, "msg": f"Invalid Input ({char})"})
                            player_a.kill()
                            player_b.kill()
                            return MatchResult(1, errors, self.record, {"stdout": player_a.stdout_log, "stderr": player_a.stderr_log}, {"stdout": player_b.stdout_log, "stderr": player_b.stderr_log})
                        move_a = int(char)
                        player_a.stdout_log += f"{char}\n"

                if move_b == -1:
                    line = player_b.try_pop_move_line()
                    if line is not None:
                        char = line[:1]
                        if char not in {"0", "1", "2"}:
                            errors.append({"player": 1, "msg": f"Invalid Input ({char})"})
                            player_a.kill()
                            player_b.kill()
                            return MatchResult(0, errors, self.record, {"stdout": player_a.stdout_log, "stderr": player_a.stderr_log}, {"stdout": player_b.stdout_log, "stderr": player_b.stderr_log})
                        move_b = int(char)
                        player_b.stdout_log += f"{char}\n"

                if move_a == -1:
                    code_a = player_a.poll()
                    if code_a is not None:
                        msg = "Player 0 Accidentally Exit" if code_a == 0 else _runtime_error_message(code_a)
                        errors.append({"player": 0, "msg": msg})
                        player_a.kill()
                        player_b.kill()
                        return MatchResult(1, errors, self.record, {"stdout": player_a.stdout_log, "stderr": player_a.stderr_log}, {"stdout": player_b.stdout_log, "stderr": player_b.stderr_log})

                if move_b == -1:
                    code_b = player_b.poll()
                    if code_b is not None:
                        msg = "Player 1 Accidentally Exit" if code_b == 0 else _runtime_error_message(code_b)
                        errors.append({"player": 1, "msg": msg})
                        player_a.kill()
                        player_b.kill()
                        return MatchResult(0, errors, self.record, {"stdout": player_a.stdout_log, "stderr": player_a.stderr_log}, {"stdout": player_b.stdout_log, "stderr": player_b.stderr_log})

                time.sleep(0.005)

            if move_a == -1 or move_b == -1:
                if move_a == -1 and move_b != -1:
                    errors.append({"player": 0, "msg": "Time Limit Exceeded"})
                    winner = 1
                elif move_a != -1 and move_b == -1:
                    errors.append({"player": 1, "msg": "Time Limit Exceeded"})
                    winner = 0
                else:
                    errors.append({"player": 0, "msg": "Time Limit Exceeded"})
                    errors.append({"player": 1, "msg": "Time Limit Exceeded"})
                    winner = -1

                player_a.kill()
                player_b.kill()
                return MatchResult(
                    winner,
                    errors,
                    self.record,
                    {"stdout": player_a.stdout_log, "stderr": player_a.stderr_log},
                    {"stdout": player_b.stdout_log, "stderr": player_b.stderr_log},
                )

            self.game.move(Game.tank_a, move_a)
            self.game.move(Game.tank_b, move_b)
            losers = self.game.turn()
            self.record.append(self.game.to_record())

            if len(losers) == 1:
                player_a.send(f"{move_b}\n")
                player_b.send(f"{move_a}\n")
                player_a.kill()
                player_b.kill()
                winner = 1 if losers[0] == 0 else 0
                return MatchResult(
                    winner,
                    errors,
                    self.record,
                    {"stdout": player_a.stdout_log, "stderr": player_a.stderr_log},
                    {"stdout": player_b.stdout_log, "stderr": player_b.stderr_log},
                )

            if len(losers) == 2:
                player_a.send(f"{move_b}\n")
                player_b.send(f"{move_a}\n")
                player_a.kill()
                player_b.kill()
                return MatchResult(
                    -1,
                    errors,
                    self.record,
                    {"stdout": player_a.stdout_log, "stderr": player_a.stderr_log},
                    {"stdout": player_b.stdout_log, "stderr": player_b.stderr_log},
                )

            player_a.send(f"{move_b}\n")
            player_b.send(f"{move_a}\n")

            move_a = -1
            move_b = -1

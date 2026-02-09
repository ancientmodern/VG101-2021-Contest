from __future__ import annotations

import os
import resource


def preexec_resource_limiter(memory_limit_mb: int, cpu_time_seconds: int):
    def _apply() -> None:
        # Keep child process in its own process group for reliable cleanup.
        os.setsid()

        mem_bytes = memory_limit_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_time_seconds, cpu_time_seconds + 1))
        resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
        resource.setrlimit(resource.RLIMIT_NPROC, (32, 32))

    return _apply


def sandbox_env() -> dict[str, str]:
    path = os.environ.get("PATH", "")
    return {
        "PATH": path,
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
    }

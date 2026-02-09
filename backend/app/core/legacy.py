from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from app.core.settings import settings


@dataclass
class RankingConfig:
    base: float = 100.0
    multiplier: float = 1.5
    divider: float = 1000.0


@dataclass
class LegacyConfig:
    compilers: dict[str, str]
    ranking: RankingConfig
    max_game_record: int
    display_pager: int
    default_map_size: int


DEFAULT_COMPILERS = {
    "c++98": "g++ {sources} -o {output} -std=c++98 -lm -Werror -Wall -O3",
    "c++11": "g++ {sources} -o {output} -std=c++11 -lm -Werror -Wall -O3",
    "c++14": "g++ {sources} -o {output} -std=c++14 -lm -Werror -Wall -O3",
    "c++17": "g++ {sources} -o {output} -std=c++17 -lm -Werror -Wall -O3",
}


def load_legacy_config() -> LegacyConfig:
    path = settings.legacy_config_path
    if not path.exists():
        return LegacyConfig(DEFAULT_COMPILERS, RankingConfig(), 10000, 50, 20)

    with path.open("r", encoding="utf-8") as f:
        raw = json.load(f)

    compiler = raw.get("compiler", {})
    normalized = {}
    for key, cmd in compiler.items():
        cmd = cmd.replace("%source", "{sources}").replace("%exec", "{output}").replace("%flags", "")
        normalized[key] = cmd

    ranking_raw = raw.get("ranking", {})
    ranking = RankingConfig(
        base=float(ranking_raw.get("base", 100)),
        multiplier=float(ranking_raw.get("multiplier", 1.5)),
        divider=float(ranking_raw.get("divider", 1000)),
    )

    display = raw.get("display", {})
    game = raw.get("game", {})

    return LegacyConfig(
        compilers=normalized or DEFAULT_COMPILERS,
        ranking=ranking,
        max_game_record=int(raw.get("maxGameRecord", 10000)),
        display_pager=int(display.get("pager", 50)),
        default_map_size=int(game.get("defaultMapSize", 20)),
    )


LEGACY = load_legacy_config()


def load_students() -> dict[str, dict[str, object]]:
    path = settings.legacy_students_path
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


STUDENTS = load_students()

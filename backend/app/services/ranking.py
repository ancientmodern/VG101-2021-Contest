from __future__ import annotations

import math

from app.models import User


def _ensure_score(score: float) -> float:
    if math.isnan(score) or math.isinf(score):
        return 0.0
    return score


def apply_result(user1: User, user2: User, winner: int) -> tuple[float, float]:
    # winner: -1 draw, 0 user1 win, 1 user2 win
    if winner == -1:
        k1 = max(35.0, 67.0 - user1.score / 125.0)
        k2 = max(35.0, 67.0 - user2.score / 125.0)

        if user1.score < user2.score:
            if user1.score < 1500:
                k1 *= 1.25
            if user2.score < 1500:
                k2 *= 0.8
        else:
            if user1.score < 1500:
                k1 *= 0.8
            if user2.score < 1500:
                k2 *= 1.25

        p1 = 1.0 / (1.0 + math.pow(10.0, (user2.score - user1.score) / 400.0))
        p2 = 1.0 / (1.0 + math.pow(10.0, (user1.score - user2.score) / 400.0))

        new1 = max(0.0, user1.score + k1 * (0.5 - p1))
        new2 = max(0.0, user2.score + k2 * (0.5 - p2))

        if any(math.isnan(x) or math.isinf(x) for x in (new1, new2)):
            new1, new2 = user1.score, user2.score
        else:
            user1.draw += 1
            user2.draw += 1

        user1.score = new1
        user2.score = new2
        return new1, new2

    user_win = user1 if winner == 0 else user2
    user_lose = user2 if winner == 0 else user1

    win_k = max(35.0, 67.0 - user_win.score / 125.0)
    lose_k = max(35.0, 67.0 - user_lose.score / 125.0)

    if user_win.score < 1750:
        win_k *= 1.25
    if user_lose.score < 1750:
        lose_k *= 0.8

    win_p = 1.0 / (1.0 + math.pow(10.0, (user_lose.score - user_win.score) / 400.0))
    lose_p = 1.0 / (1.0 + math.pow(10.0, (user_win.score - user_lose.score) / 400.0))

    new_win = user_win.score + win_k * (1.0 - win_p)
    new_lose = max(0.0, user_lose.score + lose_k * (0.0 - lose_p))

    if any(math.isnan(x) or math.isinf(x) for x in (new_win, new_lose)):
        new_win, new_lose = user_win.score, user_lose.score
    else:
        user_win.win += 1
        user_lose.lose += 1

    user_win.score = new_win
    user_lose.score = new_lose

    if winner == 0:
        return new_win, new_lose
    return new_lose, new_win

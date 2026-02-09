from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Vec2:
    x: int
    y: int

    def add(self, other: "Vec2") -> "Vec2":
        return Vec2(self.x + other.x, self.y + other.y)

    def equal(self, other: "Vec2") -> bool:
        return self.x == other.x and self.y == other.y


TANK_DIRECTION = {
    0: Vec2(-1, 0),
    1: Vec2(0, -1),
    2: Vec2(1, 0),
    3: Vec2(0, 1),
}

BULLET_DIRECTION = TANK_DIRECTION


@dataclass
class Tank:
    position: Vec2
    direction: int
    life: int = 5
    cd: int = 0


@dataclass
class Bullet:
    position: Vec2
    direction: int
    owner: int
    busted: bool = False


class Game:
    direction_straight = 0
    direction_left = 1
    direction_right = 2

    tank_a = 0
    tank_b = 1

    def __init__(self, map_size: int = 20):
        self.tanks = [Tank(Vec2(0, 0), 2), Tank(Vec2(map_size - 1, map_size - 1), 0)]
        self.bullets: list[Bullet] = []
        self.map_size = map_size
        self.shrink = -1
        self.round = 0

    def move(self, tank_index: int, direction: int) -> None:
        tank = self.tanks[tank_index]

        if direction == self.direction_left:
            tank.direction -= 1
            if tank.direction == -1:
                tank.direction = 3
        elif direction == self.direction_right:
            tank.direction = (tank.direction + 1) % 4

        tank.position = tank.position.add(TANK_DIRECTION[tank.direction])

        if tank.cd == 0:
            bullet_pos = tank.position.add(TANK_DIRECTION[tank.direction])
            self.bullets.append(Bullet(bullet_pos, tank.direction, tank_index))
            tank.cd = 2
        else:
            tank.cd -= 1

    def turn(self) -> list[int]:
        self.round += 1
        self.shrink = self.round // 16
        losers: list[int] = []

        if self.tanks[0].position.equal(self.tanks[1].position):
            if self.tanks[0].life < self.tanks[1].life:
                return [0]
            if self.tanks[1].life < self.tanks[0].life:
                return [1]
            return [0, 1]

        for bullet in self.bullets:
            for tank in self.tanks:
                if tank.position.equal(bullet.position):
                    tank.life -= 2
                    bullet.busted = True

            bullet.position = bullet.position.add(BULLET_DIRECTION[bullet.direction])
            for tank in self.tanks:
                if tank.position.equal(bullet.position):
                    tank.life -= 2
                    bullet.busted = True

            bullet.position = bullet.position.add(BULLET_DIRECTION[bullet.direction])
            for tank in self.tanks:
                if tank.position.equal(bullet.position):
                    tank.life -= 2
                    bullet.busted = True

        valid_bullets = []
        for bullet in self.bullets:
            out = (
                bullet.position.x < self.shrink - 5
                or bullet.position.y < self.shrink - 5
                or bullet.position.x >= self.map_size - self.shrink + 5
                or bullet.position.y >= self.map_size - self.shrink + 5
            )
            if (not out) and (not bullet.busted):
                valid_bullets.append(bullet)
        self.bullets = valid_bullets

        for idx, tank in enumerate(self.tanks):
            out = (
                tank.position.x < self.shrink
                or tank.position.y < self.shrink
                or tank.position.x >= self.map_size - self.shrink
                or tank.position.y >= self.map_size - self.shrink
            )
            if out:
                tank.life -= 1

            if tank.life <= 0:
                losers.append(idx)

        return losers

    def to_record(self) -> dict[str, object]:
        return {
            "tanks": [
                {
                    "position": [tank.position.x, tank.position.y],
                    "direction": tank.direction,
                    "life": tank.life,
                }
                for tank in self.tanks
            ],
            "bullets": [
                {
                    "position": [bullet.position.x, bullet.position.y],
                    "direction": bullet.direction,
                    "owner": bullet.owner,
                }
                for bullet in self.bullets
            ],
            "shrink": self.shrink,
        }

let Vector = require('./vector')

class Tank {
    constructor(position, direction) {
        this.position = position;
        this.life = 5;
        this.direction = direction;
        this.cd = 0;
    }
}

Tank.direction = {
    0: new Vector(-1, 0),
    1: new Vector(0, -1),
    2: new Vector(1, 0),
    3: new Vector(0, 1)
}

class Bullet {
    constructor(position, direction, owner) {
        this.position = position;
        this.direction = direction;
        this.owner = owner;
        this.busted = false;
    }
}

Bullet.direction = {
    0: new Vector(-1, 0),
    1: new Vector(0, -1),
    2: new Vector(1, 0),
    3: new Vector(0, 1)
}

class Game {
    constructor(mapSize) {
        this.tanks = [
            new Tank(new Vector(0, 0), 2),
            new Tank(new Vector(mapSize - 1, mapSize - 1), 0)
        ]

        this.bullets = [];

        this.mapSize = mapSize;
        this.shrink = -1;
        this.round = 0;
    }

    move(tank, direction) {
        switch (direction) {
            case Game.direction.straight:
                break;
            case Game.direction.left:
                this.tanks[tank].direction -= 1;
                if (this.tanks[tank].direction === -1) this.tanks[tank].direction = 3;
                break;
            case Game.direction.right:
                this.tanks[tank].direction += 1;
                this.tanks[tank].direction %= 4;
                break;
        }
        this.tanks[tank].position = this.tanks[tank].position.add(Tank.direction[this.tanks[tank].direction]);
        if (this.tanks[tank].cd === 0) {
            this.bullets.push(new Bullet(this.tanks[tank].position.add(Tank.direction[this.tanks[tank].direction]), this.tanks[tank].direction, tank));
            this.tanks[tank].cd = 2;
        } else this.tanks[tank].cd--;
    }

    turn() {

        this.round++;
        this.shrink = Math.floor(this.round / 16);

        let loser = [];

        if (this.tanks[0].position.x === this.tanks[1].position.x && this.tanks[0].position.y === this.tanks[1].position.y) {
            // TODO: Change to correct loser
            // if (this.tanks[0].life < this.tanks[1].life) return [1];
            // else if (this.tanks[1].life < this.tanks[0].life) return [0];
            if (this.tanks[0].life < this.tanks[1].life) return [0];
            else if (this.tanks[1].life < this.tanks[0].life) return [1];
            else return [0, 1];
        }

        this.bullets.forEach((item) => {
            this.tanks.forEach((tank) => {
                if (tank.position.equal(item.position)) {
                    tank.life -= 2;
                    item.busted = true;
                }
            });

            item.position = item.position.add(Bullet.direction[item.direction]);

            this.tanks.forEach((tank) => {
                if (tank.position.equal(item.position)) {
                    tank.life -= 2;
                    item.busted = true;
                }
            });

            item.position = item.position.add(Bullet.direction[item.direction]);

            this.tanks.forEach((tank) => {
                if (tank.position.equal(item.position)) {
                    tank.life -= 2;
                    item.busted = true;
                }
            });
        });

        this.bullets = this.bullets.filter((bullet) => !(bullet.position.x < this.shrink - 5 || bullet.position.y < this.shrink - 5 ||
            bullet.position.x >= this.mapSize - this.shrink + 5 || bullet.position.y >= this.mapSize - this.shrink + 5) && !bullet.busted);

        this.tanks.forEach((tank, index) => {
            if (tank.position.x < this.shrink || tank.position.y < this.shrink ||
                tank.position.x >= this.mapSize - this.shrink || tank.position.y >= this.mapSize - this.shrink) {
                tank.life--;
            }

            if (tank.life <= 0) loser.push(index);
        });

        return loser;
    }

    toString() {
        return {
            tanks: this.tanks.reduce((list, item) => {
                list.push({
                    position: [item.position.x, item.position.y],
                    direction: item.direction,
                    life: item.life
                });
                return list;
            }, []),
            bullets: this.bullets.reduce((list, item) => {
                list.push({
                    position: [item.position.x, item.position.y],
                    direction: item.direction,
                    owner: item.owner
                });
                return list;
            }, []),
            shrink: this.shrink
        }
    }

    draw() {
        let map = [];

        for (let i = -5; i < this.mapSize + 5; i++) {
            let row = [];
            for (let j = -5; j < this.mapSize + 5; j++) {
                if (i < this.shrink || j < this.shrink ||
                    i >= this.mapSize - this.shrink || j >= this.mapSize - this.shrink)
                    row.push("-");
                else
                    row.push(' ');
            }
            map.push(row);
        }

        this.tanks.forEach((tank) => map[tank.position.y + 5][tank.position.x + 5] = 'T');
        this.bullets.forEach((bullet) => map[bullet.position.y + 5][bullet.position.x + 5] = '*');

        return map.reduce((str, elt) => str + "\n" + elt.join("|"), "");
    }
}

Game.direction = {
    straight: 0,
    left: 1,
    right: 2
}

Game.tank = {
    A: 0,
    B: 1
}

module.exports = Game;

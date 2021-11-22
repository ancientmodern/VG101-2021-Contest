/*
 * Execute two programs and hold a match
 */

let {spawn, execSync} = require("child_process");
let Game = require("./game.js");

const config = require("../config/config.json");

function processPIDLine(pid) {
    try {
        let lines = execSync("ps -ef | grep " + pid.toString()).toString()
        lines = lines.split("\n").filter((line) => line.indexOf("game") === 0);
        let trial = 50;
        while (lines.length < 1 && trial-- > 0) {
            lines = execSync("ps -ef | grep " + pid.toString()).toString()
            lines = lines.split("\n").filter((line) => line.indexOf("game") === 0);
        }
        if (trial === -1) return false;
        return parseInt(/.+?(\d+).+/.exec(lines[0])[1]);
    } catch (e) {
        console.error("Cannot Analyze " + pid);
        return false;
    }
}

function Match() {
    this.record = [];
    this.exit = false;
    this.game = new Game(config.game.defaultMapSize);
}

Match.prototype.setExecutable = function (A, B) {
    this.binA = A;
    this.binB = B;
    // this.procA = spawn("sudo", ["-u", "game", this.binA, "-r"]);
    // this.procB = spawn("sudo", ["-u", "game", this.binB, "-r"]);
    this.procA = spawn(this.binA, ["-r"]);
    this.procB = spawn(this.binB, ["-r"]);

    this.procA.pid = processPIDLine(this.procA.pid);
    this.procB.pid = processPIDLine(this.procB.pid);

    this.procA.stdin.on("error", (msg) => {
        console.log("A:" + msg);
    });
    this.procB.stdin.on("error", (msg) => {
        console.log("B:" + msg);
    });

    this.exit = false;
    this.errors = [];
    this.A = {stdout: "", stderr: ""};
    this.B = {stdout: "", stderr: ""};

    this.onerrA = (code, signal) => {
        if (this.exit) return;
        this.exit = true;
        spawn("kill", ["-9", this.procA.pid]);
        spawn("kill", ["-9", this.procB.pid]);
        if (code !== 0)
            if (!code) this.errors.push({player: 0, msg: "Runtime Error (" + signal + ")"});
            else this.errors.push({player: 0, msg: "Runtime Error (" + code + ")"});
        else
            this.errors.push({player: 0, msg: "Accidentally Exit"});
        this.result = {winner: 1, error: errors};
    };

    this.onerrB = (code, signal) => {
        if (this.exit) return;
        this.exit = true;
        spawn("kill", ["-9", this.procA.pid]);
        spawn("kill", ["-9", this.procB.pid]);
        if (code !== 0)
            if (!code) this.errors.push({player: 1, msg: "Runtime Error (" + signal + ")"});
            else this.errors.push({player: 1, msg: "Runtime Error (" + code + ")"});
        else
            this.errors.push({player: 1, msg: "Accidentally Exit"});
        this.result = {winner: 0, error: errors};
    };

    this.procA.on("exit", (code, signal) => this.onerrA(code, signal));
    this.procB.on("exit", (code, signal) => this.onerrB(code, signal));
    this.procA.stderr.on("data", (msg) => this.A.stderr += msg);
    this.procB.stderr.on("data", (msg) => this.B.stderr += msg);

    this.procA.stdin.write(this.game.tanks[Game.tank.A].position.x.toString() +
        " " + this.game.tanks[Game.tank.A].position.y.toString() +
        " " + this.game.tanks[Game.tank.B].position.x.toString() +
        " " + this.game.tanks[Game.tank.B].position.y.toString() +
        " " + this.game.tanks[Game.tank.A].direction.toString() +
        " " + this.game.tanks[Game.tank.B].direction.toString() + "\n");

    this.procB.stdin.write(this.game.tanks[Game.tank.B].position.x.toString() +
        " " + this.game.tanks[Game.tank.B].position.y.toString() +
        " " + this.game.tanks[Game.tank.A].position.x.toString() +
        " " + this.game.tanks[Game.tank.A].position.y.toString() +
        " " + this.game.tanks[Game.tank.B].direction.toString() +
        " " + this.game.tanks[Game.tank.A].direction.toString() + "\n");

    this.record.push(this.game.toString());

};

Match.prototype.execute = function () {
    return new Promise((res, rej) => {
        if (this.exit) {
            res(this.result);
        }
        let errors = this.errors;

        this.onerrA = (code, signal) => {
            if (this.exit) return;
            this.exit = true;
            spawn("kill", ["-9", this.procA.pid]);
            spawn("kill", ["-9", this.procB.pid]);
            clearTimeout(this.tle);
            if (code !== 0)
                if (!code) errors.push({player: 0, msg: "Runtime Error (" + signal + ")"});
                else errors.push({player: 0, msg: "Runtime Error (" + code + ")"});
            else
                errors.push({player: 0, msg: "Accidentally Exit"});
            res({winner: 1, error: errors});
        };
        this.onerrB = (code, signal) => {
            if (this.exit) return;
            this.exit = true;
            spawn("kill", ["-9", this.procA.pid]);
            spawn("kill", ["-9", this.procB.pid]);
            clearTimeout(this.tle);
            if (code !== 0)
                if (!code) errors.push({player: 1, msg: "Runtime Error (" + signal + ")"});
                else errors.push({player: 1, msg: "Runtime Error (" + code + ")"});
            else
                errors.push({player: 1, msg: "Accidentally Exit"});
            res({winner: 0, error: errors});
        };

        let moveA = -1, moveB = -1;
        let sendMsg, tleHandler;

        let checkMove = (tank) => {
            return (msg) => {
                msg = msg.toString()[0];

                if (!/^[0-2]/.exec(msg)) {
                    clearTimeout(this.tle);
                    this.exit = true;
                    spawn("kill", ["-9", this.procA.pid]);
                    spawn("kill", ["-9", this.procB.pid]);
                    errors.push({player: tank ? 1 : 0, msg: "Invalid Input (" + msg + ")"});
                    res({winner: !tank ? 1 : 0, error: errors});
                }

                if (tank === Game.tank.A) {
                    moveA = parseInt(msg);
                    this.A.stdout += msg + "\n";
                } else {
                    moveB = parseInt(msg);
                    this.B.stdout += msg + "\n";
                }

                if (moveA !== -1 && moveB !== -1) { // 两边都走了, 重置一下
                    clearTimeout(this.tle);

                    this.game.move(Game.tank.A, moveA);
                    this.game.move(Game.tank.B, moveB);
                    let loser = this.game.turn();
                    this.record.push(this.game.toString());

                    if (config.env === "dev" && config.debug.watchGame) {
                        console.log(this.game.draw());
                        console.log(this.game.toString());
                    }

                    if (loser.length === 1) {
                        this.exit = true;
                        this.procA.stdin.write(moveB.toString() + "\n");
                        this.procB.stdin.write(moveA.toString() + "\n");
                        spawn("kill", ["-9", this.procA.pid]);
                        spawn("kill", ["-9", this.procB.pid]);
                        res({winner: !loser[0] ? 1 : 0, error: errors});
                    } else if (loser.length === 2) {
                        this.exit = true;
                        this.procA.stdin.write(moveB.toString() + "\n");
                        this.procB.stdin.write(moveA.toString() + "\n");
                        spawn("kill", ["-9", this.procA.pid]);
                        spawn("kill", ["-9", this.procB.pid]);
                        res({winner: -1, error: errors});
                    } else {
                        sendMsg();
                    }
                }
            }
        }

        sendMsg = () => {
            this.procA.stdin.write(moveB.toString() + "\n");
            this.procB.stdin.write(moveA.toString() + "\n");
            this.tle = setTimeout(tleHandler, 2000);
            moveA = -1;
            moveB = -1;
            this.procA.stdout.once("data", checkMove(Game.tank.A));
            this.procB.stdout.once("data", checkMove(Game.tank.B));
        }

        tleHandler = () => {
            if (moveA === -1 && moveB !== -1) {
                this.exit = true;
                spawn("kill", ["-9", this.procA.pid]);
                spawn("kill", ["-9", this.procB.pid]);
                clearTimeout(this.tle);
                errors.push({player: 0, msg: "Time Limit Exceeded"});
                res({winner: 1, error: errors});
            }
            if (moveA !== -1 && moveB === -1) {
                this.exit = true;
                spawn("kill", ["-9", this.procA.pid]);
                spawn("kill", ["-9", this.procB.pid]);
                clearTimeout(this.tle);
                errors.push({player: 1, msg: "Time Limit Exceeded"});
                res({winner: 0, error: errors});
            }
            if (moveA === -1 && moveB === -1) {
                this.exit = true;
                spawn("kill", ["-9", this.procA.pid]);
                spawn("kill", ["-9", this.procB.pid]);
                clearTimeout(this.tle);
                errors.push({player: 0, msg: "Time Limit Exceeded"});
                errors.push({player: 1, msg: "Time Limit Exceeded"});
                res({winner: -1, error: errors});
            }
        }

        this.tle = setTimeout(tleHandler, 2000);
        this.procA.stdout.once("data", checkMove(Game.tank.A));
        this.procB.stdout.once("data", checkMove(Game.tank.B));
    });
};

module.exports = Match;

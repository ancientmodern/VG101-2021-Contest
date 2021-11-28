let Match = require("./execute");

const config = require("../config/config.json");

const MongoClient = require("mongodb").MongoClient;
const mongoPath = "mongodb://" + config.db.user + ":" + config.db.password + "@" + config.db.ip + ":" + config.db.port + "/" + config.db.db;

async function worker() {
    let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
    let db = client.db("tank");

    let rec = await db.collection("submission").aggregate([{$match: {status: 0}}, {$sample: {size: 2}}]).toArray();

    if (rec.length < 2) {
        await client.close();
        process.send("stop");
        process.exit(-1);
    }

    let count = await db.collection("match").find({}).count();
    if (count > config.maxGameRecord) {
        let deleteId = await db.collection("match").find({}).limit(1).toArray();
        await db.collection("match").deleteOne({_id: deleteId[0]._id});
    }

    let id = (await db.collection("match").insertOne({status: 0, p1: rec[0].user, p2: rec[1].user})).insertedId;

    let match = new Match();
    match.setExecutable(((rec[0].bin[0] === "/" || rec[0].bin[0] === ".") ? "" : config.executable.root) + rec[0].bin, ((rec[1].bin[0] === "/" || rec[1].bin[0] === ".") ? "" : config.executable.root) + rec[1].bin);
    try {
        let result = await match.execute();

        let user1 = (await db.collection("user").find({_id: rec[0].user}).toArray())[0];
        let user2 = (await db.collection("user").find({_id: rec[1].user}).toArray())[0];

        if (result.winner === -1) { // 平局
            // user1.newScore = Math.max(user1.score + Math.floor(config.ranking.base * (Math.pow(config.ranking.multiplier, Math.max(Math.min((user2.score - user1.score) / config.ranking.divider, 50), -50)) - 1)), 0)
            // user2.newScore = Math.max(user2.score + Math.floor(config.ranking.base * (Math.pow(config.ranking.multiplier, Math.max(Math.min((user1.score - user2.score) / config.ranking.divider, 50), -50)) - 1)), 0)

            // ELO
            let K1 = Math.max(22, 70 - user1.score / 80);
            let K2 = Math.max(22, 70 - user2.score / 80);
            if (user1.score < 1920 && user2.score < 1920) {
                if (user1.score < user2.score) {
                    K1 *= 1.25;
                } else {
                    K2 *= 1.25;
                }
            }
            let P1 = 1 / (1 + Math.pow(10, (user2.score - user1.score) / 400));
            let P2 = 1 / (1 + Math.pow(10, (user1.score - user2.score) / 400));
            user1.newScore = Math.max(0, user1.score + K1 * (0.5 - P1));
            user2.newScore = Math.max(0, user2.score + K2 * (0.5 - P2));

            if (isNaN(user1.newScore) || isNaN(user2.newScore) || !isFinite(user1.newScore) || !isFinite(user2.newScore)) {
                let fs = require("fs");
                fs.appendFileSync("/root/bug.txt", JSON.stringify([user1, user2]) + "\n");
                user1.newScore = user1.score;
                user2.newScore = user2.score;
            } else {
                await db.collection("user").updateOne({_id: user1._id}, {
                    $set: {
                        draw: user1.draw + 1,
                        score: user1.newScore
                    }
                });

                await db.collection("user").updateOne({_id: user2._id}, {
                    $set: {
                        draw: user2.draw + 1,
                        score: user2.newScore
                    }
                });
            }
        } else {
            let userWin = (result.winner === 0) ? user1 : user2;
            let userLose = (result.winner === 0) ? user2 : user1;

            // userWin.newScore = userWin.score + Math.floor(config.ranking.base * Math.pow(config.ranking.multiplier, Math.min((userLose.score - userWin.score) / config.ranking.divider, 50)));
            // userLose.newScore = Math.max(userLose.score - Math.floor(config.ranking.base * Math.pow(config.ranking.multiplier, Math.min((userLose.score - userWin.score) / config.ranking.divider, 50))), 0);

            // ELO
            let winK = Math.max(22, 70 - userWin.score / 80);
            let loseK = Math.max(22, 70 - userLose.score / 80);
            if (userWin.score < 1920 && userLose.score < 1920) {
                winK *= 1.25;
            }
            let winP = 1 / (1 + Math.pow(10, (userLose.score - userWin.score) / 400));
            let loseP = 1 / (1 + Math.pow(10, (userWin.score - userLose.score) / 400));
            userWin.newScore = userWin.score + winK * (1 - winP);
            userLose.newScore = Math.max(0, userLose.score + loseK * (0 - loseP));

            if (isNaN(userWin.newScore) || isNaN(userLose.newScore) || !isFinite(userWin.newScore) || !isFinite(userLose.newScore)) {
                let fs = require("fs");
                fs.appendFileSync("/root/bug.txt", JSON.stringify([userWin, userLose]) + winP.toString() + loseP.toString() + "\n");
                userWin.newScore = userWin.score;
                userLose.newScore = userLose.score;
            } else {
                await db.collection("user").updateOne({_id: userWin._id}, {
                    $set: {
                        win: userWin.win + 1,
                        score: userWin.newScore
                    }
                });
                await db.collection("user").updateOne({_id: userLose._id}, {
                    $set: {
                        lose: userLose.lose + 1,
                        score: userLose.newScore
                    }
                });
            }
        }

        await db.collection("match").updateOne({_id: id}, {
            $set: {
                status: 1,
                winner: result.winner,
                error: result.error,
                record: match.record,
                scores: {
                    p1: [user1.score.toFixed(2), user1.newScore.toFixed(2)],
                    p2: [user2.score.toFixed(2), user2.newScore.toFixed(2)],
                },
                A: match.A,
                B: match.B
            }
        });

        await client.close();
        process.send("stop");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.send("stop");
        process.exit(1);
    }
}

worker().then();

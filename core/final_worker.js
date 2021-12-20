let Match = require("./execute");

const config = require("../config/config.json");

const MongoClient = require("mongodb").MongoClient;
const mongoPath = "mongodb://" + config.db.user + ":" + config.db.password + "@" + config.db.ip + ":" + config.db.port + "/" + config.db.db;

async function final_worker(players) {
    let p1 = players[0], p2 = players[1];
    let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
    let db = client.db("tank");

    // let rec = await db.collection("submission").aggregate([{$match: {status: 0}}, {$sample: {size: 2}}]).toArray();
    //
    // if (rec.length < 2) {
    //     await client.close();
    //     process.send("stop");
    //     process.exit(-1);
    // }

    let count = await db.collection("match").find({}).count();
    if (count > config.maxGameRecord) {
        let deleteId = await db.collection("match").find({}).limit(1).toArray();
        await db.collection("match").deleteOne({_id: deleteId[0]._id});
    }

    let id = (await db.collection("match").insertOne({status: 0, p1: p1._id, p2: p2._id})).insertedId;

    let match = new Match();
    match.setExecutable(((p1.bin[0] === "/" || p1.bin[0] === ".") ? "" : config.executable.root) + p1.bin, ((p2.bin[0] === "/" || p2.bin[0] === ".") ? "" : config.executable.root) + p2.bin);
    try {
        let result = await match.execute();

        // let user1 = (await db.collection("user").find({_id: p1.user}).toArray())[0];
        // let user2 = (await db.collection("user").find({_id: p2.user}).toArray())[0];

        if (result.winner === -1) { // 平局
            p1.newScore = p1.score + 1;
            p2.newScore = p2.score + 1;

            if (isNaN(p1.newScore) || isNaN(p2.newScore) || !isFinite(p1.newScore) || !isFinite(p2.newScore)) {
                let fs = require("fs");
                fs.appendFileSync("/root/bug.txt", JSON.stringify([p1, p2]) + "\n");
                p1.newScore = p1.score;
                p2.newScore = p2.score;
            } else {
                await db.collection("user").updateOne({_id: p1._id}, {
                    $set: {
                        draw: p1.draw + 1,
                        score: p1.newScore
                    }
                });

                await db.collection("user").updateOne({_id: p2._id}, {
                    $set: {
                        draw: p2.draw + 1,
                        score: p2.newScore
                    }
                });
            }
        } else {
            let userWin = (result.winner === 0) ? p1 : p2;
            let userLose = (result.winner === 0) ? p2 : p1;

            userWin.newScore = userWin.score + 3;
            userLose.newScore = userLose.score;

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
                    p1: [p1.score.toFixed(2), p1.newScore.toFixed(2)],
                    p2: [p2.score.toFixed(2), p2.newScore.toFixed(2)],
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

process.on("message", function (message) {
    final_worker(message).then();
});


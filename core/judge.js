const config = require("../config/config.json");

const MongoClient = require("mongodb").MongoClient;
const mongoPath = "mongodb://" + config.db.user + ":" + config.db.password + "@" + config.db.ip + ":" + config.db.port + "/" + config.db.db;

const Compiler = require("./compiler/compiler");

const {spawn} = require("child_process");

const status = {
    Waiting: 0,
    Fetched: 1,
    Compiling: 2,
    Judging: 3,
    Accepted: 4,
    WA: 5,
    TLE: 6,
    MLE: 7,
    RE: 8,
    CE: 9,
    SE: 10
};


async function worker() {
    console.log("[judge]Judge Started");
    let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
    let db = client.db(config.db.db);
    let col = db.collection("judge");
    let record = (await col.find({status: 0}).sort(["_id", -1]).limit(1).toArray())[0];

    if (record) {
        await col.updateOne({_id: record._id}, {$set: {status: 2}});
        let success = await new Promise((res, rej) => {
            (new Compiler(record.compiler)).addSource(record.source + "/driver1.cpp")
                .addSource(record.source + "/lab6.cpp")
                .compile(record.source + "/judge.out", async (msg) => {
                    if (msg.status === 0) {
                        await col.updateOne({_id: record._id}, {$set: {status: 1}});
                        res(true);
                    } else {
                        await col.updateOne({_id: record._id}, {$set: {status: 8, stderr: msg.stderr}});
                        res(false);
                    }
                });
        });
        if (success) {
            let testcases = [
                {status: 1},
                {status: 1},
                {status: 1},
                {status: 1},
                {status: 1},
                {status: 1},
                {status: 1},
                {status: 1},
                {status: 1}
            ];
            let status = 3;

            await col.updateOne({_id: record._id}, {
                $set:
                    {
                        status,
                        testcases
                    }
            });

            for (let i = 0; i < testcases.length; i++) {
                let stdout = "", stderr = "";
                let obj = spawn(record.source + "/judge.out", ["-" + (i + 1).toString()]);
                obj.stdout.on("data", (chunk) => {
                    stdout += chunk;
                });
                obj.stderr.on("data", (chunk) => {
                    stderr += chunk;
                });
                testcases[i] = await new Promise((res, rej) => {
                    let tle = setTimeout(() => {
                        spawn("kill", ["-9", obj.pid.toString()]);
                        res({status: 5, stdout, stderr});
                        if (status < 5) status = 5;
                    }, 1000);

                    obj.on("exit", (code) => {
                        clearTimeout(tle);
                        if (code !== 0) {
                            res({status: 8, code, stdout, stderr});
                            if (status < 8) status = 8;
                        } else if (stdout !== "") {
                            res({status: 5, stdout, stderr});
                            if (status < 5) status = 5;
                        } else res({status: 4, stdout, stderr});
                    })
                });
                await col.updateOne({_id: record._id}, {
                    $set:
                        {
                            status,
                            testcases
                        }
                });
            }

            if (status === 3) await col.updateOne({_id: record._id}, {
                $set:
                    {
                        status: 4
                    }
            });

        }
    }

    await client.close();
}

worker().then(() => {
    process.send("stop");
    process.exit(1);
})


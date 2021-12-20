let {fork} = require("child_process");

let config = require("../config/config.json");
let Final_Worker = require("./final_worker");

let activeProcess = 0;

let stop = false;

const MongoClient = require("mongodb").MongoClient;
const mongoPath = "mongodb://" + config.db.user + ":" + config.db.password + "@" + config.db.ip + ":" + config.db.port + "/" + config.db.db;

process.on("message", (msg) => {
    if (msg === "stop") stop = true;
});

async function create() {
    let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
    let db = client.db("tank");
    let records = await db.collection("user").find({"bin": {$ne: ""}}).toArray();

    let fw = new Final_Worker();
    for (const rec of records) {
        let others = await db.collection("user").find({_id: {$ne: rec._id}, "bin": {$ne: ""}}).toArray();
        for (const other of others) {
            fw.final_worker([rec, other]).then();
        }
        // await Promise.all(others.map(async (other) => {
        //     // while (activeProcess >= 6) {
        //     // }
        //     // activeProcess++;
        //     // let sub = fork("./core/final_worker.js");
        //     // sub.send([rec, other]);
        //     // sub.on("message", (msg) => {
        //     //     if (msg === "stop") {
        //     //         activeProcess--;
        //     //     }
        //     // });
        //
        // }));
    }

    // "score": {$ne: 2000}
    // console.log(rec);
    // for (const record of rec) {
    //     let sub = await db.collection("submission").find({"user": record._id, "status": 0}).toArray()[0];
    //     await db.collection("user").updateOne({_id: record._id}, {
    //         $set: {
    //             bin: sub.bin
    //         }
    //     });
    // }
    await client.close();
}

create().then();
// for (let i = 0; i < config.worker.maxProcessCnt; i++) create();

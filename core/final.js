let {fork} = require("child_process");

let config = require("../config/config.json");

let activeProcess = 0;

let stop = false;

const MongoClient = require("mongodb").MongoClient;
const mongoPath = "mongodb://" + config.db.user + ":" + config.db.password + "@" + config.db.ip + ":" + config.db.port + "/" + config.db.db;

process.on("message", (msg) => {
    if (msg === "stop") stop = true;
});

async function create() {
    let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
    let db = client.db("user");
    let rec = db.collection("user").find({"score": 2000}).toArray();
    console.log(rec[0]);
    console.log(rec[1]);
    // if (!stop && activeProcess < config.worker.maxProcessCnt) {
    //     activeProcess++;
    //     let sub = fork("./core/final_worker.js");
    //     sub.on("message", (msg) => {
    //         if (msg === "stop") {
    //             activeProcess--;
    //             create();
    //         }
    //     });
    // }
}

create().then();
// for (let i = 0; i < config.worker.maxProcessCnt; i++) create();

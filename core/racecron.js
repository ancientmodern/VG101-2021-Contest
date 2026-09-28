let {fork} = require("child_process");

let config = require("../config/config.json");

let activeProcess = 0;

let stop = false;


process.on("message", (msg) => {
    if (msg === "stop") stop = true;
});

// A worker plays one match and exits 0. It exits non-zero when there is nothing to
// play (fewer than two active submissions) or on an error; restarting it right away
// would spin up node processes in a tight loop, so wait before trying again.
const RETRY_MS = 10000;

function create() {
    if (!stop && activeProcess < config.worker.maxProcessCnt) {
        activeProcess++;
        let sub = fork("./core/worker.js");
        sub.on("exit", (code) => {
            activeProcess--;
            if (code === 0) create();
            else setTimeout(create, RETRY_MS);
        });
    }
}

for (let i = 0; i < config.worker.maxProcessCnt; i++) create();

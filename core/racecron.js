let {fork} = require("child_process");

let config = require("../config/config.json");

let activeProcess = 0;

let stop = false;


process.on("message", (msg) => {
    if (msg === "stop") stop = true;
});

function create() {
    if (!stop && activeProcess < config.worker.maxProcessCnt) {
        activeProcess++;
        let sub = fork("./core/worker.js");
        sub.on("message", (msg) => {
            if (msg === "stop") {
                activeProcess--;
                create();
            }
        });
    }
}

for (let i = 0; i < config.worker.maxProcessCnt; i++) create();

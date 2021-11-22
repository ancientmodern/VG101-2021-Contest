/*
 * A simple sub-process pipe
 */

let { spawn } = require("child_process");

function Pipe(command) {
    this.shellObj = spawn(command);
    this.stdout = "";
    this.stderr = "";
    this.exitCode = NaN;
    this.shellObj.stdout.on("data", (data) => {
       this.stdout += data;
    });
    this.shellObj.stderr.on("data", (data) => {
        this.stderr += data;
    });
    this.shellObj.on("close", (code) => {
        this.exitCode = code;
    })
}

Pipe.prototype.send = (message) => {
    if(!isNaN(this.exitCode)) return false;
    this.shellObj.stdin.write(message);
    return true;
};

Pipe.prototype.recv = () => {
    if(!isNaN(this.exitCode)) return false;
    while(this.stdout === "");
    let stdoutMsg = this.stdout;
    this.stdout = "";
    return stdoutMsg;
};

exports.Pipe = Pipe;
/*
 * A auto-compile tool for student's homework
 */

let exec = require("child_process").exec;

const fs = require("fs");

const config = require("../../config/config.json");

function Compiler(language = "c++17") {
    this.language = language;
    this.sourceList = [];
    this.compileFlags = "";
}

Compiler.prototype.addSource = function (route) {
    this.sourceList.push(route);
    return this;
};

Compiler.prototype.compile = function (execName, callback) {
    let baseCommand = config.compiler[this.language];
    baseCommand = baseCommand.replace(/%source/, this.sourceList.join(" "));
    baseCommand = baseCommand.replace(/%exec/, execName);
    baseCommand = baseCommand.replace(/%flags/, this.compileFlags);
    exec(baseCommand, async (error, stdout, stderr) => {
        if (error) {
            await callback({"status": 2, "stack": error.stack, "stdout": stdout, "stderr": stderr, "bin": execName});
        } else if (stderr !== "") {
            await callback({"status": 2, "stack": "Compile Error", "stdout": stdout, "stderr": stderr, "bin": execName});
        } else {
            await callback({"status": 0, "stack": "", "stdout": stdout, "stderr": stderr, "bin": execName});
        }
    })
};

module.exports = Compiler;

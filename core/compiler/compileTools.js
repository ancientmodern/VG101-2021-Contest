/*
 * Output status code:
 * -1 - Pending
 * 0 - Effective
 * 1 - Inactive
 * 2 - Compile Error
 */

const Compiler = require("./compiler");

const config = require("../../config/config.json");

const MongoClient = require("mongodb").MongoClient;
const mongoPath = "mongodb://" + config.db.user + ":" + config.db.password + "@" + config.db.ip + ":" + config.db.port + "/" + config.db.db;
const {ObjectID} = require("mongodb");

module.exports = function (userID, sourcedir, compiler) {
    return (async () => {
        let binName = (new Date()).valueOf().toString() + userID.toString();
        let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
        let db = client.db(config.db.db);
        let col = db.collection("submission");
        let id = (await col.insertOne({status: -1, stack: "", stdout: "", stderr: "", bin: "", compiler, user: ObjectID(userID), time: Date.now(), source: sourcedir})).insertedId;

        (new Compiler(compiler)).addSource(sourcedir + "/lab6.cpp")
            .addSource(sourcedir + "/main.cpp")
            .compile(config.executable.root + binName, async (msg) => {
                if (msg.status === 0) await col.updateMany({status: 0, user: ObjectID(userID)}, {$set: {status: 1}});
                await col.updateOne({_id: id}, {$set: msg});
                await client.close();
            });
    })();
};

const config = require("../config/config.json");
const MongoClient = require("mongodb").MongoClient;
const mongoPath = "mongodb://" + config.db.user + ":" + config.db.password + "@" + config.db.ip + ":" + config.db.port + "/" + config.db.db;

module.exports = {
    async get(req, res) {
        let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
        let db = client.db(config.db.db);
        let col = db.collection("user");
        let rec = await (await col.find({}).sort(["score", -1])).toArray();

        rec.forEach((item) => {
            item.score = Math.floor(item.score);
            delete item.password;
            delete item.studentId;
            delete item.realName;
            delete item.admin;
            delete item.student;
        });

        res.end(JSON.stringify(rec));
    }
}

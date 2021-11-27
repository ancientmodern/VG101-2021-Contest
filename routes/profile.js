const config = require("../config/config.json");
const MongoClient = require("mongodb").MongoClient;
const mongoPath = "mongodb://" + config.db.user + ":" + config.db.password + "@" + config.db.ip + ":" + config.db.port + "/" + config.db.db;
const {ObjectID} = require("mongodb");

const crypto = require("crypto");

function sha256(s) {
    return crypto.createHash("sha256").update(s + config.security.salt).digest("base64");
}

module.exports = {
    async profile(req, res) {
        if (!req.session.uid) { // 未授权
            res.redirect('/oauth');
        } else {
            let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
            let db = client.db(config.db.db);
            let rec = await db.collection("user").find({_id: ObjectID(req.session.uid)}).toArray();

            let data = rec[0];
            data.post = false;

            await client.close();
            res.render("profile/profile", data);
        }
    },
    async update(req, res) {
        if (!req.session.uid) { // 未授权
            res.redirect('/oauth');
        } else {
            // console.log("update profile");
            let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
            let db = client.db(config.db.db);

            req.body.name = req.body.name.replaceAll('<', '&lt').replaceAll('>', '&gt');
            // console.log(req.body.name);

            let wrongPassword = false
            if (req.body.password) {
                let rec = await db.collection("user").find({_id: ObjectID(req.session.uid)}).toArray();
                if (sha256(req.body.password) === rec[0].password) {
                    await db.collection("user").updateOne({_id: ObjectID(req.session.uid)}, {
                        $set: {
                            dispName: req.body.name,
                            password: sha256(req.body.newpassword)
                        }
                    });
                } else {
                    wrongPassword = true;
                }
            } else {
                await db.collection("user").updateOne({_id: ObjectID(req.session.uid)}, {$set: {dispName: req.body.name}});
            }

            let rec = await db.collection("user").find({_id: ObjectID(req.session.uid)}).toArray();

            let data = rec[0];
            data.post = true;
            data.wrongPassword = wrongPassword;

            await client.close();
            res.render("profile/profile", data);

        }
    },
    async settings(req, res) {
        if (!req.session.uid) { // 未授权
            res.redirect('/oauth');
        } else {
            let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
            let db = client.db(config.db.db);
            let rec = await db.collection("user").find({_id: ObjectID(req.session.uid)}).toArray();

            let data = rec[0];
            data.post = false;

            await client.close();
            res.render("profile/settings", data);
        }
    },
    async updateSettings(req, res) {
        if (!req.session.uid) { // 未授权
            res.redirect('/oauth');
        } else {
            let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
            let db = client.db(config.db.db);
            await db.collection("user").updateOne({_id: ObjectID(req.session.uid)}, {$set: {compiler: req.body.compiler}});

            let rec = await db.collection("user").find({_id: ObjectID(req.session.uid)}).toArray();

            let data = rec[0];
            data.post = true;

            await client.close();
            res.render("profile/settings", data);
        }
    }
}

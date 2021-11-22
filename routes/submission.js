const config = require("../config/config.json");
const MongoClient = require("mongodb").MongoClient;
const mongoPath = "mongodb://" + config.db.user + ":" + config.db.password + "@" + config.db.ip + ":" + config.db.port + "/" + config.db.db;
const {ObjectID} = require("mongodb");

const fs = require("fs");
const child_process = require("child_process");

const compile = require("../core/compiler/compileTools");

const crypto = require("crypto");

module.exports = {
    async get(req, res) {
        if (!req.session.uid) { // 未授权
            res.redirect('/oauth');
        } else {
            let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
            let db = client.db(config.db.db);
            let col = db.collection("submission");

            let submissions = await (await col.find({user: ObjectID(req.session.uid)}).sort(["time", -1])).toArray();

            submissions.forEach((item) => {
                delete item.source;
                delete item.bin;
                delete item.stdin;
                delete item.stdout;
                delete item.stderr;
                delete item.user;
            });

            res.render("submission/mysubmissions", {submissions, realName: req.session.realName});

            await client.close();
        }
    },
    async O1get(req, res) {
        if (!req.session.uid) { // 未授权
            res.redirect('/oauth');
        } else {
            let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
            let db = client.db(config.db.db);
            let col = db.collection("judge");

            let submissions = await (await col.find({user: ObjectID(req.session.uid)}).sort(["_id", -1])).limit(1).toArray();

            if (submissions.length === 0) res.render("submission/O1", {
                nosubmission: true,
                realName: req.session.realName
            });
            else {
                let score = 0;
                if (submissions[0].testcases)
                    submissions[0].testcases.forEach((item) => {
                        delete item.stdin;
                        delete item.stdout;
                        delete item.stderr;

                        if (item.status === 4) score += 10;

                        if (submissions[0].status < item.status) submissions[0].status = item.status;
                    });

                res.render("submission/O1", {
                    nosubmission: false,
                    submission: submissions[0],
                    realName: req.session.realName,
                    score: Math.floor(score / 90 * 100)
                });
            }

            await client.close();
        }
    },
    async O1check(req, res) {
        if (!req.session.uid) { // 未授权
            res.redirect('/oauth');
        } else {
            let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
            let db = client.db(config.db.db);
            let col = db.collection("judge");

            let submissions = await (await col.find({user: ObjectID(req.session.uid)}).sort(["_id", -1])).limit(1).toArray();
            let index = parseInt(req.params.id);

            if (submissions.length === 0 || !submissions[0].testcases || index >= submissions[0].testcases.length) res.redirect("/submission/O1")
            else {
                let testcase = submissions[0].testcases[index];

                res.render("submission/O1check", {testcase, realName: req.session.realName});
            }

            await client.close();
        }
    },
    async submit(req, res) {
        if (!req.session.uid || Date.now() > 1658592000000) { // ddl: 2022-07-24 00:00:00
            res.redirect('/oauth');
        } else {
            // TODO: 增加截止时间, 增加默认编译器设置
            res.render("submission/submit", {
                realName: req.session.realName,
                post: false,
                late: false,
                compiler: "c++17"
            });
        }
    },
    async post(req, res) {
        if (!req.session.uid) { // 未授权
            res.redirect('/oauth');
        } else {

            let sha1 = crypto.createHash("sha1");
            let data = req.body.code;
            let sourcedir = config.submission.root + sha1.update((new Date()).valueOf().toString() + req.session.uid.toString()).digest("hex");

            fs.mkdirSync(sourcedir);
            fs.writeFileSync(sourcedir + "/lab7.cpp", data);
            child_process.execSync("cp " + config.submission.root + "template/* " + sourcedir);

            compile(req.session.uid, sourcedir, req.body.compiler).then();

            if (req.body.judge) {
                let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
                let db = client.db(config.db.db);
                let col = db.collection("judge");
                await col.insertOne({
                    source: sourcedir,
                    status: 0,
                    compiler: req.body.compiler,
                    user: ObjectID(req.session.uid)
                });
                await client.close();

                child_process.fork("./core/judge.js");
            }

            res.redirect("/submission");
        }
    },
    async check(req, res) {
        if (!req.session.uid) { // 未授权
            res.redirect('/oauth');
        } else {
            let id = req.params.id;

            try {
                id = ObjectID(id)
            } catch (e) {
                res.redirect("/submission")
            }

            let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
            let db = client.db(config.db.db);
            let col = db.collection("submission");
            let rec = await (await col.find({_id: id, user: ObjectID(req.session.uid)})).toArray();

            if (rec.length === 0) {
                res.redirect("/submission")
            }

            res.render("submission/check", {submission: rec[0], realName: req.session.realName})
        }
    }
}

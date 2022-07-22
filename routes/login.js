const config = require("../config/config.json");
const studentList = require("../config/students.json");
const MongoClient = require("mongodb").MongoClient;
const mongoPath = "mongodb://" + config.db.user + ":" + config.db.password + "@" + config.db.ip + ":" + config.db.port + "/" + config.db.db;
const {ObjectId} = require("mongodb");

const crypto = require("crypto");

function sha256(s) {
    return crypto.createHash("sha256").update(s + config.security.salt).digest("base64");
}

module.exports = {
    get(req, res) {
        res.render('auth/login', {fail: false, nouser: false, CSRF: ""});
    },
    async post(req, res) {
        let studentId = req.body.studentId;
        let password = req.body.password;

        let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
        let db = client.db(config.db.db);
        let col = db.collection("user");
        let student = await (await col.find({studentId: studentId})).toArray();

        if (student.length === 0) { // 新用户
            if (studentId in studentList) { // 创建用户
                let userData = {};
                userData.studentId = studentId;
                userData.password = sha256(password);
                userData.realName = studentList[studentId].name;
                userData.dispName = studentList[studentId].name;
                userData.admin = studentList[studentId].TA;
                userData.win = 0;
                userData.lose = 0;
                userData.draw = 0;
                userData.score = 2000;
                userData.compiler = "c++17";
                userData.student = true;
                userData.tankSkin = "";
                userData.bulletSkin = "";

                let uid = await col.insertOne(userData);

                req.session.uid = uid.insertedId;
                req.session.studentId = studentId;
                req.realName = studentList[studentId].name;

                res.redirect('/');
            } else { // 失败
                res.render('auth/login', {fail: false, nouser: true, CSRF: ""});
            }
        } else {
            if (sha256(password) !== student[0].password) { // 密码错误
                res.render('auth/login', {fail: true, nouser: false, CSRF: ""});
            } else { // 登陆成功
                req.session.uid = student[0]._id;
                req.session.studentId = studentId;
                req.session.realName = student[0].realName;

                res.redirect('/');
            }
        }

        await client.close();
    },
    async check(req, res) {
        if (req.session.uid) res.end(JSON.stringify({
            status: "OK",
            studentId: req.session.studentId,
            realName: req.session.realName
        }));
        else res.end(JSON.stringify({status: "FAIL"}));
    },
    logout(req, res) {
        delete req.session.uid;
        delete req.session.studentId;
        delete req.session.realName;

        res.redirect("/");
    },
    forgetPasswordGet(req, res) {
        res.render("auth/forgetPassword", {status: {}, CSRF: ""});
    },
    async forgetPasswordPost(req, res) {
        let studentId = req.body.studentId;
        let password = req.body.password;

        let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
        let db = client.db(config.db.db);
        let col = db.collection("user");
        let student = await (await col.find({studentId: studentId})).toArray();

        if (student.length === 0) res.render("auth/forgetPassword", {status: {nouser: true}, CSRF: ""});
        else {
            let tokenCol = db.collection("password_token");
            let token = (await tokenCol.insertOne({studentId, password: sha256(password)})).insertedId;
            res.render("auth/forgetPassword", {status: {success: true}, token, CSRF: ""});
        }

        await client.close();
    },
    async forceChangePassword(req, res) {
        if (!req.session.uid) res.status(404);

        let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
        let db = client.db(config.db.db);
        let col = db.collection("user");
        let TA = await col.find({studentId: req.session.studentId}).toArray();
        console.log(TA);

        if (TA[0].admin) {
            let tokenCol = db.collection("password_token");
            console.log({studentId: req.params.studentId, _id: ObjectId(req.params.token)});
            let rec = await tokenCol.find({studentId: req.params.studentId, _id: ObjectId(req.params.token)}).toArray();
            if (rec.length) {
                await col.updateOne({studentId: req.params.studentId}, {$set: {password: rec[0].password}});
                res.end("success");
            } else res.end("incorrect");

        } else {
            res.status(404);
        }

        await client.close();
    }
};

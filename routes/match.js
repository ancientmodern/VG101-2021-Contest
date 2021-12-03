const config = require("../config/config.json");
const MongoClient = require("mongodb").MongoClient;
const mongoPath = "mongodb://" + config.db.user + ":" + config.db.password + "@" + config.db.ip + ":" + config.db.port + "/" + config.db.db;
const {ObjectID} = require("mongodb");

function generatePager(pageCnt, curPage, baseLink) {
    let ret = "";
    if (curPage !== 1 && pageCnt > 1) { // First and Prev
        ret += "<li>\n" +
            "    <a class=\"pager__item first link\" href=\"/" + baseLink + "?page=1\">« First</a>\n" +
            "  </li>" +
            "<li>\n" +
            "    <a class=\"pager__item previous link\" href=\"/" + baseLink + "?page=" + (curPage - 1).toString() + "\">‹ Previous</a>\n" +
            "  </li>";
    }
    if (pageCnt <= 5) {
        for (let i = 1; i <= pageCnt; i++) {
            ret += "<li>\n" +
                "    <a class=\"pager__item " + ((curPage === i) ? "current" : "page link") + "\" href=\"/" + baseLink + "?page=" + i.toString() + "\">" + i.toString() + "</a>\n" +
                "  </li>";
        }
    } else {
        if (curPage < 5) {
            for (let i = 1; i <= 5; i++) {
                ret += "<li>\n" +
                    "    <a class=\"pager__item " + ((curPage === i) ? "current" : "page link") + "\" href=\"/" + baseLink + "?page=" + i.toString() + "\">" + i.toString() + "</a>\n" +
                    "  </li>";
            }
            ret += "<li>\n" +
                "    <span class=\"pager__item ellipsis\">...</span>\n" +
                "  </li>";
        } else if (pageCnt - curPage < 4) {
            ret += "<li>\n" +
                "    <span class=\"pager__item ellipsis\">...</span>\n" +
                "  </li>";
            for (let i = pageCnt - 5; i <= pageCnt; i++) {
                ret += "<li>\n" +
                    "    <a class=\"pager__item " + ((curPage === i) ? "current" : "page link") + "\" href=\"/" + baseLink + "?page=" + i.toString() + "\">" + i.toString() + "</a>\n" +
                    "  </li>";
            }
        } else {
            ret += "<li>\n" +
                "    <span class=\"pager__item ellipsis\">...</span>\n" +
                "  </li>";
            for (let i = curPage - 2; i <= curPage + 2; i++) {
                ret += "<li>\n" +
                    "    <a class=\"pager__item " + ((curPage === i) ? "current" : "page link") + "\" href=\"/" + baseLink + "?page=" + i.toString() + "\">" + i.toString() + "</a>\n" +
                    "  </li>";
            }
            ret += "<li>\n" +
                "    <span class=\"pager__item ellipsis\">...</span>\n" +
                "  </li>";
        }
    }
    if (curPage !== pageCnt && pageCnt > 1) { // First and Prev
        ret += "<li>\n" +
            "    <a class=\"pager__item next link\" href=\"/" + baseLink + "?page=" + (curPage + 1).toString() + "\">Next ›</a>\n" +
            "  </li>" +
            "<li>\n" +
            "    <a class=\"pager__item last link\" href=\"/" + baseLink + "?page=" + pageCnt.toString() + "\">Last »</a>\n" +
            "  </li>"
    }

    return ret;
}

module.exports = {
    async list(req, res) {
        let page = 1;
        if (req.query.hasOwnProperty("page")) page = parseInt(req.query.page);

        let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
        let db = client.db(config.db.db);

        let filterCondition = {};
        if (req.query.hasOwnProperty("filter")) {
            if (parseInt(req.query.filter) !== 1) {
                let user = (await db.collection("user").find({dispName: req.query.filter}).toArray())[0]._id;
                filterCondition = {$or: [{p1: user}, {p2: user}]};
            } else if (req.session.uid) {
                filterCondition = {$or: [{p1: ObjectID(req.session.uid)}, {p2: ObjectID(req.session.uid)}]};
            }
        }

        let count = await db.collection("match").find(filterCondition).count();
        let record = await db.collection("match").find(filterCondition).sort([["_id", -1]]).skip(config.display.pager * (page - 1)).limit(config.display.pager).toArray();

        for (let i = 0; i < record.length; i++) {
            record[i].p1 = (await db.collection("user").find({_id: record[i].p1}).toArray())[0];
            record[i].p2 = (await db.collection("user").find({_id: record[i].p2}).toArray())[0];

            delete record[i].p1.password;
            delete record[i].p1.studentId;
            delete record[i].p1.realName;
            delete record[i].p1.admin;
            delete record[i].p1.student;
            delete record[i].p2.password;
            delete record[i].p2.studentId;
            delete record[i].p2.realName;
            delete record[i].p2.admin;
            delete record[i].p2.student;

            delete record[i].record;
            delete record[i].error;
            delete record[i].A;
            delete record[i].B;
        }

        await client.close();

        res.end(JSON.stringify({
            pager: generatePager(Math.ceil(count / config.display.pager), page, "match"),
            data: record
        }))
    },
    async disp(req, res) {
        let id = req.params.id;

        try {
            id = ObjectID(id);
        } catch (e) {
            res.redirect("/match")
            return;
        }

        let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
        let db = client.db(config.db.db);

        let rec = (await db.collection("match").find({_id: id}).toArray())[0];

        let p1 = (await db.collection("user").find({_id: rec.p1}).toArray())[0];
        let p2 = (await db.collection("user").find({_id: rec.p2}).toArray())[0];

        await client.close();

        res.render("match/disp", {
            winner: rec.winner,
            p1: p1.dispName,
            p2: p2.dispName,
            error: rec.error.length !== 0 ? rec.error[0].msg : "Normal Exit"
        })
    },
    async get(req, res) {
        let id = req.params.id;

        try {
            id = ObjectID(id);
        } catch (e) {
            res.status(404);
            return;
        }

        let client = await MongoClient.connect(mongoPath, {useUnifiedTopology: true});
        let db = client.db(config.db.db);

        let rec = (await db.collection("match").find({_id: id}).toArray())[0];
        let p1 = (await db.collection("user").find({_id: rec.p1}).toArray())[0];
        let p2 = (await db.collection("user").find({_id: rec.p2}).toArray())[0];

        await client.close();

        res.end(JSON.stringify({
            record: rec.record,
            A: rec.A || {stdout: "No Record", stderr: "No Record"},
            B: rec.B || {stdout: "No Record", stderr: "No Record"},
            p1: p1.dispName,
            p2: p2.dispName
        }));
    }
}

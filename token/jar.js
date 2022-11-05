const mongoClient = require("mongodb").MongoClient;
const config = require("../config/config.json")
const mongoPath = "mongodb://" + config.db.user + ":" + config.db.password + "@" + config.db.ip + ":" + config.db.port + "/" + config.db.db;
const {ObjectID} = require("mongodb");

const crypto = require("crypto");

/**
 * Hash a string in sha-256 format
 * @param {string} context
 * @returns {String}
 */
let sha256 = (context) => {
    return crypto.createHash("sha256").update(context).digest("hex");
};

module.exports = {
    id: 0,
    async generate(ip, uid, authority = 0, long = false) {
        let val = {
            machine: config.machine,
            part: sha256(JSON.stringify(module.id)),
            id: this.id++,
            time: Date.now(),
            expires: Date.now() + (long ? (7 * 24 * 3600 * 1000) : (100 * 1000)),
            authority,
            long,
            uid
        };

        let token =  sha256(JSON.stringify(val));

        let db = await mongoClient.connect(mongoPath, {useUnifiedTopology: true});
        let col = db.db(config["db"]["db"]["business"]).collection("token");
        await col.insertOne({
            token: token,
            time: val.time,
            expires: val.expires,
            ip: ip,
            authority,
            long,
            uid
        });

        await db.close();

        return {token, expires: val.expires};
    },
    async verify(ip, token, authority = 0) {
        let db = await mongoClient.connect(mongoPath, {useUnifiedTopology: true});
        let col = db.db(config["db"]["db"]["business"]).collection("token");
        let cntNeedupdate = await col.find({token: token, ip: ip, expires: {$gt: Date.now(), $lt: Date.now() + 20000}, authority: {$gte: authority}}).count();
        let val = await col.find({token: token, ip: ip, expires: {$gt: Date.now()}, authority: {$gte: authority}}).toArray();
        await db.close();

        let result = {
            valid: val.length > 0
        };
        if(result.valid) {
            result.token = val[0].token;
            result.expires = val[0].expires;
            result.uid = val[0].uid;
            result.authority = val[0].authority;
            result.needUpdate = cntNeedupdate > 0;
        }

        return result;
    },
    async update(ip, token) {
        let db = await mongoClient.connect(mongoPath, {useUnifiedTopology: true});
        let col = db.db(config["db"]["db"]["business"]).collection("token");
        let counter = await col.find({token: token, ip: ip, expires: {$gt: Date.now(), $lt: Date.now() + 20000}}).toArray();
        if(counter.length > 0) {
            await col.deleteOne({token: token, ip: ip});
            await db.close();
            let tokenResult = await this.generate(ip, counter[0].uid, counter[0].authority, counter[0].long);
            return {n: 1, nModified: 1, ok: 1, token: tokenResult.token, expires: tokenResult.expires, needUpdate: false};
        } else {
            await db.close();

            let tokenResult = await this.verify(ip, token);
            return tokenResult.valid ? {n: 1, nModified: 0, ok: 1, expires: tokenResult.expires} : {n: 1, nModified: 0, ok: 0};
        }
    },
    async expire(ip, token) {
        let db = await mongoClient.connect(mongoPath, {useUnifiedTopology: true});
        let col = db.db(config["db"]["db"]["business"]).collection("token");
        let result = await col.deleteOne({token: token, ip: ip});
        return result.result;
    }
};

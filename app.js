let createError = require('http-errors');
let express = require('express');
let path = require('path');
let cookieParser = require('cookie-parser');
let logger = require('morgan');

let session = require('express-session');
let MongoStore = require("connect-mongo")(session);

let ejs = require('ejs');

let app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.engine('html', ejs.renderFile);

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: false}));


app.use(session({
    secret: 'this is a string key',   // 可以随便写。 一个 String 类型的字符串，作为服务器端生成 session 的签名
    name: 'session_id',/*保存在本地cookie的一个名字 默认connect.sid  可以不设置*/
    resave: false,   /*强制保存 session 即使它并没有变化,。默认为 true。建议设置成 false。*/
    saveUninitialized: true,   //强制将未初始化的 session 存储。  默认值是true  建议设置成true
    cookie: {
        maxAge: 1000 * 30 * 60    /*过期时间*/
    },   /* secure:true  https这样的情况才可以访问cookie */
    rolling: true, //在每次请求时强行设置 cookie，这将重置 cookie 过期时间（默认：false）
    store: new MongoStore({
        url: 'mongodb://127.0.0.1:27017/session',  //数据库的地址  shop是数据库名
        touchAfter: 24 * 3600   // 通过这样做，设置touchAfter:24 * 3600，您在24小时内只更新一次会话，不管有多少请求(除了在会话数据上更改某些内容的除外)
    })
}));


app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, './views'))

const login = require('./routes/login')
app.get('/oauth', login.get);
app.post('/oauth', login.post);
app.get('/oauth/check', login.check);
app.get('/logout', login.logout);
app.get('/forgetPassword', login.forgetPasswordGet);
app.post('/forgetPassword', login.forgetPasswordPost);
app.get('/admin/setpwd/:studentId/:token', login.forceChangePassword);

const scoreboard = require('./routes/scoreboard');
app.get('/scoreboard', scoreboard.get);

const submission = require("./routes/submission");
app.get("/submission", submission.get);
app.get("/submission/submit", submission.submit);
app.post("/submission/submit", submission.post);
app.get("/submission/check/:id", submission.check);
app.get("/submission/O1", submission.O1get);
app.get("/submission/O1/:id", submission.O1check);

const match = require("./routes/match");
app.get("/match/list", match.list);
app.get("/match/:id", match.disp);
app.get("/match/get/:id", match.get);

const profile = require("./routes/profile");
app.get("/profile", profile.profile);
app.post("/profile", profile.update);
app.get("/profile/settings", profile.settings);
app.post("/profile/settings", profile.updateSettings);

app.listen(443, () => {
    console.log(`Example app listening at https://localhost:443`)
})

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    res.render('404');
});

module.exports = app;

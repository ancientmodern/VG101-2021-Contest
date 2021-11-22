define("checkLogin", ["jquery", "promise"], function($, Promise) {
    return function () {
        return new Promise(function (res, rej) {
            $.get("/oauth/check", function(result) {
                result = JSON.parse(result);
                if (result.status === "OK") res(result.realName);
                else res(false);
            })
        })
    }
})

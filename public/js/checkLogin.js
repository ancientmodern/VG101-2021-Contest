define("checkLogin", ["jquery", "promise"], function($, Promise) {
    return function () {
        return new Promise(function (res, rej) {
            $.get("/oauth/check", function(result) {
                result = JSON.parse(result);
                // realName is missing from the session right after a first sign-in.
                if (result.status === "OK") res(result.realName || result.studentId);
                else res(false);
            })
        })
    }
})

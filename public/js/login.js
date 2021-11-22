require(["jquery", "/js/security/hash"], function($, hash) {
    $("form").on("submit", function () {
        var pwd = $("[name=password]");
        pwd.val(hash.SHA256(pwd.val()));
    })
})

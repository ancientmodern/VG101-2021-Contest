define(["/js/jsUtils/promise"], function(Promise) {
    function async(fn) {
        return new Promise(function(resolve, reject) {
            try {
                setTimeout(
                    function() {resolve(fn())},
                    0);
            } catch(err) {
                reject(err)
            }
        })
    }

    function await(p) {
        var resolve = false, ret = undefined;
        p.then(function() {
            resolve = true;
            ret = arguments[0];
        }).catch(function(err) {throw err});

        while(!resolve);
        return ret;
    }

    return async;
});
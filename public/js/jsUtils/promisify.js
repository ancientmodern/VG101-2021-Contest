define("promisify", ["/js/jsUtils/promise"], function(Promise) {
    return function promisify(fn) {
        return function() {
            var pre_arguments = arguments;
            return new Promise(function(resolve, reject) {
                var args = [];
                for(var cnt = 0; cnt < pre_arguments.length; cnt++) args[cnt] = pre_arguments[cnt];
                args.push(function(res) { resolve(res); });
                console.log(args);
                try {
                    fn.apply(null, args);
                } catch(err) {
                    reject(err);
                }
            })
        }
    }
});
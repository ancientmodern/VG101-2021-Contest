if(!window.define) {
    (function () {
        function _event() {
            this._events = {};
        }

        _event.prototype.on = function (e, fn) {
            if (!this._events[e])
                this._events[e] = [];
            this._events[e].push(fn);
        };

        _event.prototype.emit = function (e, arg) {
            if (this._events[e]) {
                this._events[e].forEach(function (fn) {
                    fn(arg);
                })
            }
        };

        var cache = {};
        var aliases = {};

        function loadModule(module) {
            // Load one module
            var s = document.createElement('script');
            s.id = module;
            s.src = module + '.js';
            s.charset = 'utf-8';
            document.getElementsByTagName('head')[0].appendChild(s);
        }

        function define(deps, fn) {
            var id = document.currentScript.id || 'require_main';
            var alias;
            if(arguments.length === 3) {
                alias = arguments[0];
                deps = arguments[1];
                fn = arguments[2];
                aliases[alias] = id;
            }

            if(typeof deps === "string") deps = [deps];

            var depCnt = deps.length, params = [];

            function depCheck() {
                depCnt--;
                if (depCnt === 0) {
                    cache[id].exports = fn.apply(null, params);
                    cache[id].emit("ready", cache[id].exports);
                }
            }

            if (!cache[id]) {
                cache[id] = new _event();
            }

            if (deps.length === 0) {
                cache[id].exports = fn();
                cache[id].emit("ready", cache[id].exports);
            }

            deps.forEach(function (module, cnt) {
                if(aliases[module]) {
                    module = aliases[module];
                }
                if (!cache[module]) {
                    cache[module] = new _event();
                    cache[module].on("ready", function (exports) {
                        params[cnt] = exports;
                        depCheck();
                    });
                    loadModule(module);
                } else {
                    if (cache[module].exports) {
                        params[cnt] = cache[module].exports;
                        depCheck();
                    } else {
                        cache[module].on("ready", function (exports) {
                            params[cnt] = exports;
                            depCheck();
                        })
                    }
                }
            })
        }

        function require(deps, fn) {
            if(typeof deps === "string") deps = [deps];
            if(!fn) fn = function() {};

            var depCnt = deps.length, params = [];

            function depCheck() {
                depCnt--;
                if (depCnt === 0) {
                    fn.apply(null, params);
                }
            }

            if (deps.length === 0) {
                fn();
            }

            deps.forEach(function (module, cnt) {
                if(aliases[module]) {
                    module = aliases[module];
                }
                if (!cache[module]) {
                    cache[module] = new _event();
                    cache[module].on("ready", function (exports) {
                        params[cnt] = exports;
                        depCheck();
                    });
                    loadModule(module);
                } else {
                    if (cache[module].exports) {
                        params[cnt] = cache[module].exports;
                        depCheck();
                    } else {
                        cache[module].on("ready", function (exports) {
                            params[cnt] = exports;
                            depCheck();
                        })
                    }
                }
            })
        }

        function configure(conf) {
            for(var name in conf) {
                if(conf.hasOwnProperty(name)) {
                    aliases[name] = conf[name];
                }
            }
        }

        // To enable jQuery
        define.amd = true;

        window.define = define;
        window.require = require;
        window.configure = configure;
    })();
}

configure({
    "jquery": "/js/jQuery",
    "event": "/js/jsUtils/event",
    "promise": "/js/jsUtils/promise",
    "promisify": "/js/jsUtils/promisify",
    "jqExt": "/js/jsUtils/jqExt",
    "algorithm": "/js/jsUtils/algorithm",
    "lazyLoad": "/js/jsUtils/lazyLoad"
});
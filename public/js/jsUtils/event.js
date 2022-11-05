(function() {
    function _EventEmitter() {
        this._events = {};
    }

    _EventEmitter.prototype.on = function(e, fn) {
        if(!this._events[e]) this._events[e] = [];
        this._events[e].push(fn);
        return this;
    };

    _EventEmitter.prototype.before = function(e, fn) {
        if(!this._events[e]) this._events[e] = [];
        this._events[e] = [fn].concat(this._events[e]);
        return this;
    };

    _EventEmitter.prototype.off = function(e, fn) {
        if(!this._events[e]) throw {err: "Event type doesn't exist"};
        if(fn) {
            this._events[e] = this._events[e].filter(function(item) {return item !== fn;})
        }
        else
            this._events[e] = [];
    };

    _EventEmitter.prototype.emit = function(e) {
        if(!this._events[e]) return;
        var args = [];
        if(arguments.length !== 0) {
            for(var cnt = 1; cnt < arguments.length; cnt++) {
                args.push(arguments[cnt]);
            }
        }

        var that = this;

        this._events[e].forEach(function(fn) {
            fn.apply(that, args);
        })
    };

    if(window.define) {
        define("event", [], function() {
            return _EventEmitter;
        })
    }

    window.EventEmitter = _EventEmitter;
})();
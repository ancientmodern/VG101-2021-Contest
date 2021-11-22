(function(generatePromise){
    if(!Promise)
        var Promise = generatePromise();
    if(window.define) define("promise", [], function() {return Promise});
    window.Promise = Promise;
})(function() {
    'use strict';

    function toArray(list, start) {
        start = start || 0;
        var i = list.length - start;
        var ret = new Array(i);
        while (i--) {
            ret[i] = list[i + start];
        }
        return ret
    }

    function noop(a, b, c) {
    }

    var hasConsole = typeof console === 'object'

    function log() {
        if (hasConsole) {
            Function.apply.call(console.log, console, arguments)
        }
    }

    function warn() {
        if (hasConsole) {
            var method = console.warn || console.log
            // http://qiang106.iteye.com/blog/1721425
            Function.apply.call(method, console, arguments)
        }
    }

    function error(str, e) {
        throw (e || Error)(str)
    }


    function isObject(input) {
        // IE8 will treat undefined and null as object if it wasn't for
        // input != null
        return input != null && Object.prototype.toString.call(input) === '[object Object]';
    }

    function isFunction(input) {
        return input instanceof Function || Object.prototype.toString.call(input) === '[object Function]';
    }

    //事件订阅区域
    function Emiter() {
        this._events = Object.create(null);
    }

    Emiter.prototype.on = function (event, fn) {
        var vm = this;
        if (Array.isArray(event)) {
            for (var i = 0, l = event.length; i < l; i++) {
                vm.on(event[i], fn);
            }
        } else {
            (vm._events[event] || (vm._events[event] = [])).push(fn);
        }
        return vm
    }
    Emiter.prototype.once = function (event, fn) {
        var vm = this;

        function on() {
            vm.off(event, on);
            fn.apply(vm, arguments);
        }

        on.fn = fn;
        vm.on(event, on);
        return vm
    }
    Emiter.prototype.off = function (event, fn) {
        var vm = this;
        // all
        if (!arguments.length) {
            vm._events = Object.create(null);
            return vm
        }
        // array of events
        if (Array.isArray(event)) {
            for (var i$1 = 0, l = event.length; i$1 < l; i$1++) {
                vm.off(event[i$1], fn);
            }
            return vm
        }
        // specific event
        var cbs = vm._events[event];
        if (!cbs) {
            return vm
        }
        if (!fn) {
            vm._events[event] = null;
            return vm
        }
        // specific handler
        var cb;
        var i = cbs.length;
        while (i--) {
            cb = cbs[i];
            if (cb === fn || cb.fn === fn) {
                cbs.splice(i, 1);
                break
            }
        }
        return vm
    }
    Emiter.prototype.emit = function (event) {
        var vm = this;
        var cbs = vm._events[event];
        if (cbs) {
            cbs = cbs.length > 1 ? toArray(cbs) : cbs;
            var args = toArray(arguments, 1);
            for (var i = 0, l = cbs.length; i < l; i++) {
                cbs[i].apply(vm, args);
            }
        } else {
            error('[mrChart error]:Chart:Emiter.emit event is not found');
        }
        return vm
    }

    var pN = 'MyPromise';

    function isPromise(n) {
        return n.isPromise || false
    }

    function promiseResolve() {
        var promise = this;
        return function () {
            try {
                promise.state = 'resolve';
                promise.callbacks[0].apply(null, arguments);
                promise.data = arguments;
                if (promise.emitName !== '') promise.Emit.emit(promise.emitName, [arguments, promise.state])
            } catch (e) {
                promise.state = 'catch';
                promise.callbacks[2].apply(null, e);
                promise.data = e;
                if (promise.emitName !== '') promise.Emit.emit(promise.emitName, [e, promise.state])
            }
            return promise;
        }
    }

    function promiseReject() {
        var promise = this;
        return function () {
            try {
                promise.state = 'reject';
                promise.callbacks[1].apply(null, arguments);
                promise.data = arguments;
                if (promise.emitName !== '') promise.Emit.emit(promise.emitName, [arguments, promise.state])
            } catch (e) {
                promise.state = 'catch';
                promise.callbacks[2].apply(null, e);
                promise.data = e;
                if (promise.emitName !== '') promise.Emit.emit(promise.emitName, [e, promise.state])
            }
            return promise;
        }
    }

    function promiseResolveAll() {
        var promise = this;
        return function () {
            promise.state = 'resolve';
            promise.callbacks[0]([arguments, 'resolve']);
            return promise;
        }
    }

    function promiseRejectAll() {
        var promise = this;
        return function () {
            promise.state = 'catch';
            promise.callbacks[1].apply(null, arguments);
            return promise;
        }
    }

    function promiseResolveRace() {
        var promise = this;
        return function () {
            promise.state = 'resolve';
            promise.callbacks[0].apply(null, arguments);
            return promise;
        }
    }

    function promiseRejectRace() {
        var promise = this;
        return function () {
            promise.state = 'reject';
            promise.callbacks[1].apply(null, arguments);
            return promise;
        }
    }

    function promiseAll(dependent) {
        // 初始promise状态
        this.state = 'pending';
        this.isPromise = true;
        this.dependent = dependent;
        // resolve catch==reject
        this.callbacks = [noop, noop];
        this.resolve = promiseResolveAll.call(this),
            this.reject = promiseRejectAll.call(this);
        this.Emit = new Emiter();
        this.emitName = 'ResolveState';
        for (var i = 0; i < dependent.length; i++) {
            dependent[i].bindEmit(this.Emit, 'ResolveState');
        }
        var promise = this;
        var reason = [new Array(dependent.length), new Array(1)];
        this.Emit.on(this.emitName, function () {
            var n = 0, m = 0;
            for (var i = 0; i < promise.dependent.length; i++) {
                var state = promise.dependent[i].state
                if (state === 'resolve') {
                    n++;
                    reason[0][i] = promise.dependent[i].data;
                } else if (state !== 'pending') {
                    reason[0] = new Array(promise.dependent.length)
                    reason[1][0] = promise.dependent[i].data;
                }
                if (state !== 'pending') m++
            }
            if (n === promise.dependent.length) {
                promise.resolve(reason[0])
                reason = [new Array(dependent.length), new Array(1)];
            } else if (m === promise.dependent.length) {
                promise.reject(reason[1])
                reason = [new Array(dependent.length), new Array(1)];
            }
        });
        return this;
    }

    promiseAll.prototype = {
        constructor: promiseAll,
        then: function () {
            var args = arguments;
            if (isFunction(args[0])) this.callbacks[0] = args[0]
            return this;
        },
        catch: function () {
            var args = arguments;
            if (isFunction(args[0])) this.callbacks[1] = args[0]
            return this;
        }
    }

    function MyPromise(fn) {
        // 初始promise状态
        this.state = 'pending';
        this.isPromise = true;
        // resolve reject catch
        this.callbacks = [noop, noop, noop];
        this.reject =
            this.resolve = noop;
        this.Emit = {
            emit: noop
        };
        this.data = '';
        this.emitName = '';
        this.resolve = promiseResolve.call(this),
            this.reject = promiseReject.call(this);
        if(typeof fn !== "function") {
            var $fn = fn;
            fn = function(resolve) {
                resolve($fn);
            }
        }
        fn(this.resolve, this.reject);
        return this;
    }

    function PromiseRace(dependent) {
        // 初始promise状态
        this.state = 'pending';
        this.isPromise = true;
        this.dependent = dependent;
        // resolve reject catch
        this.callbacks = [noop, noop, noop];
        this.resolve = promiseResolveRace.call(this),
            this.reject = promiseRejectRace.call(this);
        this.Emit = new Emiter();
        this.emitName = 'ResolveStateRace';
        for (var i = 0; i < dependent.length; i++) {
            dependent[i].bindEmit(this.Emit, 'ResolveStateRace');
        }
        var promise = this;
        var reason = [new Array(1), new Array(1)];
        this.Emit.on(this.emitName, function (data) {
            if (promise.state !== 'pending') return;
            if (data[1] === 'resolve') {
                promise.resolve(data[0])
            }
            if (data[1] === 'reject') {
                promise.reject(data[0])
            }
            if (data[1] === 'catch') {
                promise.state = 'catch';
                promise.callbacks[2](data[0])
            }
        });
        return this;
    }

    PromiseRace.prototype = {
        constructor: PromiseRace,
        then: function () {
            var args = arguments;
            if (isFunction(args[0])) this.callbacks[0] = args[0]
            if (isFunction(args[1])) this.callbacks[1] = args[1]
            return this;
        },
        catch: function () {
            var args = arguments;
            if (isFunction(args[0])) this.callbacks[2] = args[0]
            return this;
        }
    };

    MyPromise.prototype = {
        constructor: MyPromise,
        then: function () {
            var args = arguments;
            if (isFunction(args[0])) this.callbacks[0] = args[0]
            if (isFunction(args[1])) this.callbacks[1] = args[1]
            return this;
        },

        catch: function () {
            var args = arguments;
            if (isFunction(args[0])) this.callbacks[2] = args[0]
            return this;
        },

        bindEmit: function (emit, name) {
            this.Emit = emit;
            this.emitName = name;
            return this;
        }
    };

    return MyPromise;
});
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Deferred = (function () {
    function Deferred() {
        var _this = this;
        this.promise = new Promise(function (resolve, reject) {
            _this.resolve = resolve;
            _this.reject = reject;
        });
    }
    Deferred.prototype.resolve = function (data) {
        this._isResolved = true;
        this._resolve(data);
    };
    Deferred.prototype.reject = function (data) {
        this._isRejected = true;
        this._reject(data);
    };
    Object.defineProperty(Deferred.prototype, "isRejected", {
        get: function () {
            return this._isRejected;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Deferred.prototype, "isResolved", {
        get: function () {
            return this._isResolved;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Deferred.prototype, "isDone", {
        get: function () {
            return this._isResolved || this._isRejected;
        },
        enumerable: true,
        configurable: true
    });
    return Deferred;
})();
var DeferredAsyncIterable = (function (_super) {
    __extends(DeferredAsyncIterable, _super);
    function DeferredAsyncIterable() {
        _super.call(this);
        this.started = false;
    }
    DeferredAsyncIterable.prototype.resolve = function () {
        if (this.mode == "forEach") {
            _super.prototype.resolve.call(this, null);
        }
        else if (this.mode == "map") {
            _super.prototype.resolve.call(this, this.buffer);
        }
    };
    DeferredAsyncIterable.prototype.progress = function (data) {
        if (this.mode == "forEach") {
            this.callback(data);
        }
        else if (this.mode == "map") {
            this.buffer.push(this.callback(data));
        }
    };
    DeferredAsyncIterable.prototype.forEach = function (callback) {
        if (this.started) {
            throw TypeError("iterable may not be reused");
        }
        this.started = true;
        this.callback = callback;
        this.mode = "forEach";
        return this.promise;
    };
    DeferredAsyncIterable.prototype.map = function (callback) {
        if (this.started) {
            throw TypeError("iterable may not be reused");
        }
        this.started = true;
        this.callback = callback;
        this.mode = "map";
        this.buffer = [];
        return this.promise;
    };
    return DeferredAsyncIterable;
})(Deferred);
var PromiseIndexedDB = (function () {
    function PromiseIndexedDB() {
    }
    PromiseIndexedDB.open = function (name, version, upgradeNeededCallback) {
        return new Promise(function (resolve, reject) {
            var request = version == null ? indexedDB.open(name) : indexedDB.open(name, version);
            request.onerror = function () { return reject(request.error); };
            request.onsuccess = function () { return resolve(request.result); };
            if (upgradeNeededCallback != null) {
                request.onupgradeneeded = function () { return upgradeNeededCallback(request.result); };
            }
        });
    };
    return PromiseIndexedDB;
})();
function promiseIDBRequest(req) {
    return new Promise(function (resolve, reject) {
        req.onsuccess = function (e) { return resolve(e.target.result); };
        req.onerror = function (e) { return reject(e.target.error); };
    });
}
function promiseIDBTransaction(tx) {
    return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { return resolve(); };
        tx.onerror = function (e) { return reject(e.target.error); };
        tx.onabort = function (e) { return reject(e.target.error); };
    });
}
/* This needs IDBDatabase to be wrapped so this makes sense.

class PromiseIDBTransaction {
    private raw: IDBTransaction;
    private completed: Promise;

    constructor(tx: IDBTransaction) {
        this.raw = tx;
        this.completed = promiseIDBTransaction(tx);
    }
}
*/
var PromiseIDBIndex = (function () {
    function PromiseIDBIndex(index) {
        this.raw = index;
    }
    PromiseIDBIndex.prototype._apply = function (method, args) {
        return promiseIDBRequest(method.apply(this.raw, args));
    };
    PromiseIDBIndex.prototype.count = function (key) {
        return this._apply(this.raw.count, arguments);
    };
    PromiseIDBIndex.prototype.getKey = function (key) {
        return this._apply(this.raw.getKey, arguments);
    };
    PromiseIDBIndex.prototype.openKeyCursor = function (range, direction) {
        return this._apply(this.raw.openKeyCursor, arguments);
    };
    PromiseIDBIndex.prototype.get = function (key) {
        return this._apply(this.raw.get, arguments);
    };
    PromiseIDBIndex.prototype.openCursor = function (range, direction) {
        var req = this.raw.openCursor.apply(this.raw, arguments);
        var iter = new DeferredAsyncIterable();
        req.onsuccess = function () {
            var cursor = req.result;
            if (cursor) {
                iter.progress(cursor.value);
                cursor.continue();
            }
            else {
                iter.resolve();
            }
        };
        req.onerror = function () {
            iter.reject(req.error);
        };
        return iter;
    };
    return PromiseIDBIndex;
})();
var PromiseIDBObjectStore = (function () {
    function PromiseIDBObjectStore(objectStore) {
        this.raw = objectStore;
    }
    PromiseIDBObjectStore.prototype._apply = function (method, args) {
        return promiseIDBRequest(method.apply(this.raw, args));
    };
    PromiseIDBObjectStore.prototype.count = function (key) {
        return this._apply(this.raw.count, arguments);
    };
    PromiseIDBObjectStore.prototype.add = function (value, key) {
        return this._apply(this.raw.add, arguments);
    };
    PromiseIDBObjectStore.prototype.clear = function () {
        return this._apply(this.raw.clear, arguments);
    };
    PromiseIDBObjectStore.prototype.createIndex = function (name, keyPath, optionalParameters) {
        return new PromiseIDBIndex(this.raw.createIndex.apply(this.raw, arguments));
    };
    PromiseIDBObjectStore.prototype.put = function (value, key) {
        return this._apply(this.raw.put, arguments);
    };
    PromiseIDBObjectStore.prototype.openCursor = function (range, direction) {
        return this._apply(this.raw.openCursor, arguments);
    };
    PromiseIDBObjectStore.prototype.deleteIndex = function (indexName) {
        return this.raw.deleteIndex.apply(this.raw, arguments);
    };
    PromiseIDBObjectStore.prototype.index = function (name) {
        return new PromiseIDBIndex(this.raw.index.apply(this.raw, arguments));
    };
    PromiseIDBObjectStore.prototype.get = function (key) {
        return this._apply(this.raw.get, arguments);
    };
    PromiseIDBObjectStore.prototype.delete = function (key) {
        return this._apply(this.raw.delete, arguments);
    };
    return PromiseIDBObjectStore;
})();
/// <reference path='promise-idb.ts'/>
function applyMixins(derivedCtor, baseCtors) {
    baseCtors.forEach(function (baseCtor) {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(function (name) {
            derivedCtor.prototype[name] = baseCtor.prototype[name];
        });
    });
}
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["VERBOSE"] = 0] = "VERBOSE";
    LogLevel[LogLevel["DEBUG"] = 1] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["WARN"] = 3] = "WARN";
    LogLevel[LogLevel["ERROR"] = 4] = "ERROR";
})(LogLevel || (LogLevel = {}));
;
var Log = (function () {
    function Log() {
    }
    Log.setLevel = function (level) {
        this.logLevel = level;
    };
    Log.ts = function () {
        var dt = new Date();
        return dt.toISOString();
    };
    Log.format = function (level, tag) {
        return "[" + this.ts() + "] " + level + "/" + tag + ": ";
    };
    Log.v = function (tag) {
        var objs = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            objs[_i - 1] = arguments[_i];
        }
        if (this.logLevel <= 0 /* VERBOSE */) {
            console.log.apply(console, [this.format("V", tag)].concat(objs));
        }
    };
    Log.d = function (tag) {
        var objs = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            objs[_i - 1] = arguments[_i];
        }
        if (this.logLevel <= 1 /* DEBUG */) {
            console.log.apply(console, [this.format("D", tag)].concat(objs));
        }
    };
    Log.i = function (tag) {
        var objs = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            objs[_i - 1] = arguments[_i];
        }
        if (this.logLevel <= 2 /* INFO */) {
            console.log.apply(console, [this.format("I", tag)].concat(objs));
        }
    };
    Log.w = function (tag) {
        var objs = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            objs[_i - 1] = arguments[_i];
        }
        if (this.logLevel <= 3 /* WARN */) {
            console.log.apply(console, [this.format("W", tag)].concat(objs));
        }
    };
    Log.e = function (tag) {
        var objs = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            objs[_i - 1] = arguments[_i];
        }
        if (this.logLevel <= 4 /* ERROR */) {
            console.log.apply(console, [this.format("E", tag)].concat(objs));
        }
    };
    Log.logLevel = 1 /* DEBUG */;
    return Log;
})();
var Preferences = (function () {
    function Preferences() {
    }
    Preferences.setPreference = function (key, value) {
        try {
            localStorage[key] = JSON.stringify(value);
        }
        catch (e) {
            window.console ? (console.error ? console.error(e.message) : console.log("Error:", e.message)) : null;
        }
    };
    Preferences.getPreference = function (key) {
        try {
            return JSON.parse(localStorage[key]);
        }
        catch (e) {
            window.console ? (console.error ? console.error(e) : console.log(e)) : null;
        }
    };
    Preferences.setAuthenticator = function (mode, key, secret) {
        this.setPreference("auth", {
            mode: mode,
            key: key,
            secret: secret
        });
    };
    Preferences.getAuthenticator = function () {
        return this.getPreference("auth");
    };
    return Preferences;
})();
var WebSocketWrapper = (function () {
    function WebSocketWrapper(recvTimeout, waitTimeout) {
        this.recvTimeout = recvTimeout;
        this.waitTimeout = waitTimeout;
    }
    WebSocketWrapper.prototype.connect = function (url) {
        var deferred = new Deferred();
        var ws = this.ws = new WebSocket(url);
        ws.onopen = function (e) {
            Log.d(this.TAG, "onopen", this.ws.readyState, e.target.readyState);
            switch (e.target.readyState) {
                case WebSocket.CONNECTING:
                    this.onConnecting.call(this, e);
                    return;
                case WebSocket.OPEN:
                    this.onOpen.call(this, e);
                    if (!deferred.isDone) {
                        deferred.resolve();
                    }
                    return;
            }
        }.bind(this);
        ws.onclose = function (e) {
            Log.d(this.TAG, "onclose", e.target.readyState);
            switch (e.target.readyState) {
                case WebSocket.CLOSING:
                    this.onClosing.call(this, e);
                    break;
                case WebSocket.CLOSED:
                    this.onClosed.call(this, e);
                    break;
            }
        }.bind(this);
        ws.onerror = function (e) {
            this.onError.call(this, e);
            if (!deferred.isDone) {
                deferred.reject();
            }
        }.bind(this);
        ws.onmessage = function (e) {
            this.resetTimers();
            this.onMessage.call(this, e);
        }.bind(this);
        return deferred.promise;
    };
    WebSocketWrapper.prototype.resetTimers = function () {
        clearTimeout(this.recvTimer);
        clearTimeout(this.waitTimer);
        this.recvTimer = setTimeout(function () {
            this.triggerHeartbeat();
        }.bind(this), this.recvTimeout);
    };
    WebSocketWrapper.prototype.triggerHeartbeat = function () {
        this.waitTimer = setTimeout(function () {
            // Connection timed out!
            this.disconnect();
        }.bind(this), this.waitTimeout);
        this.ping();
    };
    WebSocketWrapper.prototype.ping = function () {
        this.ws.send('');
    };
    WebSocketWrapper.prototype.disconnect = function () {
        this.ws.close();
        delete this['ws'];
    };
    WebSocketWrapper.prototype.send = function (data) {
        return this.ws.send(data);
    };
    WebSocketWrapper.prototype.onConnecting = function (e) {
    };
    WebSocketWrapper.prototype.onOpen = function (e) {
    };
    WebSocketWrapper.prototype.onClosing = function (e) {
    };
    WebSocketWrapper.prototype.onClosed = function (e) {
    };
    WebSocketWrapper.prototype.onMessage = function (e) {
    };
    WebSocketWrapper.prototype.onError = function (e) {
    };
    return WebSocketWrapper;
})();
var RobustService = (function (_super) {
    __extends(RobustService, _super);
    function RobustService() {
        _super.call(this, 45000, 15000);
        this.TAG = "RobustService";
        this.isConnected = false;
        this.isAuthenticated = false;
        this.channels = {};
    }
    RobustService.prototype.initDB = function () {
        return PromiseIndexedDB.open("robust", 1, function (db) {
            if (!db.objectStoreNames.contains("messages")) {
                Log.i(this.TAG, "creating object store 'messages'.");
                var objStore = db.createObjectStore("messages", { keyPath: "id" });
                objStore.createIndex("ts", "ts");
            }
        }.bind(this)).then(function (result) {
            this.db = result;
        }.bind(this), function (error) {
            Log.e(this.TAG, error);
        }.bind(this));
    };
    RobustService.prototype.getMessagesObjectStore = function () {
        var transaction = this.db.transaction(["messages"], 'readonly');
        return new PromiseIDBObjectStore(transaction.objectStore("messages"));
    };
    RobustService.prototype.connect = function (url) {
        var connect = _super.prototype.connect.bind(this);
        if (this.db == null) {
            return this.initDB().then(function () {
                connect(url);
            });
        }
        else {
            return connect(url);
        }
    };
    RobustService.prototype.requestMessages = function (target) {
        var objStore = this.getMessagesObjectStore();
        return objStore.index("ts").openCursor(null, "next");
    };
    RobustService.prototype.onConnecting = function (e) {
        Log.i(this.TAG, "Connection connecting!");
        this.fireEvent("robust-opening");
    };
    RobustService.prototype.onOpen = function (e) {
        Log.i(this.TAG, "Connection opened!");
        this.isConnected = true;
        Log.d(this.TAG, "readyState:", this.ws.readyState);
        this.fireEvent('robust-open');
    };
    RobustService.prototype.onClosing = function (e) {
        Log.i(this.TAG, "Connection closing!");
        this.fireEvent("robust-closing");
    };
    RobustService.prototype.onClosed = function (e) {
        Log.i(this.TAG, "Connection closed!");
        this.isConnected = false;
        this.fireEvent('robust-close');
    };
    RobustService.prototype.onMessage = function (e) {
        var command;
        try {
            command = Object.freeze(JSON.parse(e.data));
        }
        catch (e) {
            Log.e(this.TAG, "The message was garbage :(");
            Log.d(this.TAG, "<-", e.data);
            return;
        }
        Log.d(this.TAG, "<-", command);
        switch (command.type) {
            case "auth":
                this.onAuthCommand(command);
                break;
            case "message":
                this.onMessageCommand(command);
                break;
            case "backlog":
                this.onBacklogCommand(command);
                break;
        }
        this.fireEvent('robust-raw-message', command);
    };
    RobustService.prototype.onError = function (e) {
        console.error(this.TAG, "there was an error! " + e);
    };
    RobustService.prototype.sendMessage = function (obj) {
        Log.d(this.TAG, "->", obj);
        this.ws.send(JSON.stringify(obj) + '\n');
    };
    RobustService.prototype.ping = function () {
        this.sendMessage({ type: "ping" });
    };
    RobustService.prototype.authenticate = function () {
        if (this.isAuthenticated) {
            Log.w(this.TAG, "already authenticated; ignoring request.");
            return;
        }
        var auth = Preferences.getAuthenticator();
        Log.d(this.TAG, auth);
        if (auth != null) {
            this.sendMessage({
                type: "auth",
                mode: auth.mode,
                challenge: {
                    key: auth.key,
                    secret: auth.secret
                }
            });
        }
        else {
            // TODO allow the user to choose a mode.
            this.sendMessage({
                type: "auth",
                mode: "twitter"
            });
        }
    };
    RobustService.prototype.fireEvent = function (type, data) {
        var evt = document.createEvent('CustomEvent');
        evt.initCustomEvent(type, true, true, data);
        this.dispatchEvent(evt);
    };
    RobustService.prototype.insertMessages = function (messages) {
        var transaction = this.db.transaction(["messages"], "readwrite");
        var objStore = transaction.objectStore("messages");
        messages.forEach(function (message) {
            objStore.put(message);
        });
        return promiseIDBTransaction(transaction);
    };
    RobustService.prototype.onBacklogCommand = function (command) {
        Log.d(this.TAG, "onBacklogCommand");
        if (command.target.indexOf("#") == 0) {
            this.insertMessages(command.messages).then(function () {
                this.fireEvent("robust-backlog", command);
            }.bind(this), function (e) {
                console.error("Failed to insert backlogs:", e);
            });
        }
    };
    RobustService.prototype.onAuthCommand = function (command) {
        Log.d(this.TAG, "onAuthCommand");
        Log.v(this.TAG, JSON.stringify(command));
        if (command.success) {
            Preferences.setAuthenticator(command.mode, command.data.key, command.data.secret);
            if (this.window != null) {
                this.window.close();
                this.window = null;
            }
            this.user = command.user;
            for (var i = 0, ii = command.user.channels.length; i < ii; ++i) {
                var channel = command.user.channels[i];
                this.sendMessage({ type: "backlog", target: channel });
            }
            this.isAuthenticated = true;
        }
        else if (command.challenge && command.challenge.url) {
            this.window = window.open(command.challenge.url);
        }
    };
    RobustService.prototype.onMessageCommand = function (command) {
        Log.d(this.TAG, "onMessageCommand");
        if (command.target.indexOf("#") == 0) {
            this.insertMessages([command]).then(function () {
                this.fireEvent("robust-message", command);
            }.bind(this));
        }
    };
    RobustService.prototype.createdCallback = function () {
        RobustService.call(this);
        this.url = this.getAttribute('url');
        Log.d(this.TAG, "element created");
    };
    RobustService.prototype.attachedCallback = function () {
        if (this.url) {
            this.connect(this.url);
        }
        Log.d(this.TAG, "element attached");
    };
    RobustService.prototype.detachedCallback = function () {
        this.disconnect();
        Log.d(this.TAG, "element detached");
    };
    RobustService.prototype.attributeChangedCallback = function (attr, oldVal, newVal) {
        Log.d(this.TAG, "attr changed: " + attr);
        if (attr == "url") {
            this.url = newVal;
        }
    };
    return RobustService;
})(WebSocketWrapper);
function RobustElement() {
}
RobustElement.prototype = Object.create(HTMLElement.prototype);
applyMixins(RobustElement, [WebSocketWrapper, RobustService]);
document.registerElement("robust-service", { prototype: RobustElement.prototype });

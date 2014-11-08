/// <reference path='promise-idb.ts'/>

function applyMixins(derivedCtor: any, baseCtors: any[]) {
    baseCtors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            derivedCtor.prototype[name] = baseCtor.prototype[name];
        })
    });
}

enum LogLevel { VERBOSE, DEBUG, INFO, WARN, ERROR };

class Log {
    private static logLevel: LogLevel = LogLevel.DEBUG;

    static setLevel(level: LogLevel) {
        this.logLevel = level;
    }

    private static ts(): string {
        var dt = new Date();
        return dt.toISOString();
    }

    private static format(level: string, tag: string): string {
        return "[" + this.ts() + "] " + level + "/" + tag + ": ";
    }

    static v(tag: string, ...objs: any[]) {
        if (this.logLevel <= LogLevel.VERBOSE) {
            console.log.apply(console, [this.format("V", tag)].concat(objs));
        }
    }

    static d(tag: string, ...objs: any[]) {
        if (this.logLevel <= LogLevel.DEBUG) {
            console.log.apply(console, [this.format("D", tag)].concat(objs));
        }
    }

    static i(tag: string, ...objs: any[]) {
        if (this.logLevel <= LogLevel.INFO) {
            console.log.apply(console, [this.format("I", tag)].concat(objs));
        }
    }

    static w(tag: string, ...objs: any[]) {
        if (this.logLevel <= LogLevel.WARN) {
            console.log.apply(console, [this.format("W", tag)].concat(objs));
        }
    }

    static e(tag: string, ...objs: any[]) {
        if (this.logLevel <= LogLevel.ERROR) {
            console.log.apply(console, [this.format("E", tag)].concat(objs));
        }
    }
}

class Preferences {
    private static setPreference(key: string, value: any) {
        try {
            localStorage[key] = JSON.stringify(value);
        } catch (e) {
            window.console ?
                (console.error ? console.error(e.message) : console.log("Error:", e.message))
                : null;
        }
    }

    private static getPreference(key: string) {
        try {
            return JSON.parse(localStorage[key]);
        } catch (e) {
            window.console ?
                (console.error ? console.error(e) : console.log(e))
                : null;
        }
    }

    static setAuthenticator(mode: string, key: string, secret: string) {
        this.setPreference("auth", {
            mode: mode,
            key: key,
            secret: secret
        });
    }

    static getAuthenticator() {
        return this.getPreference("auth");
    }
}

interface RobustUser {
    id: string;
    handle: string;
    name: string;
    ts: number;
    channels: string[];
}

interface AuthCommand {
    type: string;
    mode: string;
    challenge?: {
        secret?: string;
        key?: string;
        url?: string;
    };
    data?: {
        key?: string;
        secret?: string;
    };
    success?: boolean;
    user?: RobustUser;
}

interface BacklogCommand {
    type: string;
    messages: MessageCommand[];
    target: string;
    fromDate: number;
    toDate: number;
    count: number;
}

interface MessageCommand {
    type: string;
    id: string;
    body: string;
    ts: number;
    target: string;
    from: RobustUser;
}

declare function setImmediate(handler: any, ...args: any[]): number;
declare function clearImmediate(handle: number): void;

interface Channel {
    name: string;
    messages: MessageCommand[];
}

class WebSocketWrapper {
    private recvTimeout: number;
    private waitTimeout: number;

    private recvTimer: number;
    private waitTimer: number;

    url : string;
    ws : WebSocket;

    constructor(recvTimeout: number, waitTimeout: number) {
        this.recvTimeout = recvTimeout;
        this.waitTimeout = waitTimeout;
    }

    connect(url: string): Promise {
        var deferred = new Deferred();
        var ws = this.ws = new WebSocket(url);

        ws.onopen = function(e) {
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

        ws.onclose = function(e) {
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

        ws.onerror = function(e) {
            this.onError.call(this, e);
            if (!deferred.isDone) {
                deferred.reject();
            }
        }.bind(this);

        ws.onmessage = function(e) {
            this.resetTimers();
            this.onMessage.call(this, e);
        }.bind(this);

        return deferred.promise;
    }

    private resetTimers() {
        clearTimeout(this.recvTimer);
        clearTimeout(this.waitTimer);

        this.recvTimer = setTimeout(function() {
            this.triggerHeartbeat();
        }.bind(this), this.recvTimeout);
    }

    private triggerHeartbeat() {
        this.waitTimer = setTimeout(function() {
            // Connection timed out!
            this.disconnect();
        }.bind(this), this.waitTimeout);

        this.ping();
    }

    ping() {
        this.ws.send('');
    }

    disconnect() {
        this.ws.close();
        delete this['ws'];
    }

    send(data: any): any {
        return this.ws.send(data);
    }

    onConnecting(e: Event) {}
    onOpen(e: Event) {}
    onClosing(e: CloseEvent) {}
    onClosed(e: CloseEvent) {}
    onMessage(e: MessageEvent) {}
    onError(e: Event) {}
}

class RobustService extends WebSocketWrapper implements CustomElement, EventTarget {
    private TAG = "RobustService";

    private window: Window;

    private isConnected: boolean = false;
    private isAuthenticated: boolean = false;

    private user: RobustUser;
    private channels = {};
    private db: IDBDatabase;

    constructor() {
        super(45000, 15000);
    }

    private initDB(): Promise {
        return PromiseIndexedDB.open("robust", 1, function(db) {
            if (!db.objectStoreNames.contains("messages")) {
                Log.i(this.TAG, "creating object store 'messages'.");
                var objStore = db.createObjectStore("messages", { keyPath: "id" });
                objStore.createIndex("ts", "ts");
            }
        }.bind(this)).then(function(result) {
            this.db = result;
        }.bind(this), function(error) {
            Log.e(this.TAG, error);
        }.bind(this));
    }

    private getMessagesObjectStore(): PromiseIDBObjectStore {
        var transaction = this.db.transaction(["messages"], 'readonly');
        return new PromiseIDBObjectStore(transaction.objectStore("messages"));
    }

    connect(url: string): Promise {
        var connect = super.connect.bind(this);

        if (this.db == null) {
            return this.initDB().then(function() {
                connect(url)
            });
        } else {
            return connect(url);
        }
    }

    requestMessages(target: string): AsyncIterable {
        var objStore = this.getMessagesObjectStore();
        return objStore.index("ts").openCursor(null, "next");
    }

    onConnecting(e: Event) {
        Log.i(this.TAG, "Connection connecting!");

        this.fireEvent("robust-opening");
    }

    onOpen(e: Event) {
        Log.i(this.TAG, "Connection opened!");
        this.isConnected = true;
        Log.d(this.TAG, "readyState:", this.ws.readyState);

        this.fireEvent('robust-open');
    }

    onClosing(e: CloseEvent) {
        Log.i(this.TAG, "Connection closing!");

        this.fireEvent("robust-closing");
    }

    onClosed(e: CloseEvent) {
        Log.i(this.TAG, "Connection closed!");
        this.isConnected = false;

        this.fireEvent('robust-close');
    }

    onMessage(e: MessageEvent) {
        var command;

        try {
            command = Object.freeze(JSON.parse(e.data));
        } catch (e) {
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
    }

    onError(e: ErrorEvent) {
        console.error(this.TAG, "there was an error! " + e);
    }

    sendMessage(obj: any) {
        Log.d(this.TAG, "->", obj);
        this.ws.send(JSON.stringify(obj) + '\n');
    }

    ping() {
        this.sendMessage({type: "ping"});
    }

    authenticate() {
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
        } else {
            // TODO allow the user to choose a mode.
            this.sendMessage({
                type: "auth",
                mode: "twitter"
            })
        }
    }

    private fireEvent(type: string, data?: any) {
        var evt: CustomEvent = <CustomEvent>document.createEvent('CustomEvent');
        evt.initCustomEvent(type, true, true, data);
        this.dispatchEvent(evt);
    }

    private insertMessages(messages: MessageCommand[]): Promise {
        var transaction = this.db.transaction(["messages"], "readwrite");

        var objStore = transaction.objectStore("messages");
        messages.forEach(function(message) {
            objStore.put(message);
        });

        return promiseIDBTransaction(transaction);
    }

    onBacklogCommand(command: BacklogCommand) {
        Log.d(this.TAG, "onBacklogCommand");

        if (command.target.indexOf("#") == 0) {
            this.insertMessages(command.messages).then(function() {
                this.fireEvent("robust-backlog", command);
            }.bind(this), function(e) {
                console.error("Failed to insert backlogs:", e);
            });
        }
    }

    onAuthCommand(command: AuthCommand) {
        Log.d(this.TAG, "onAuthCommand");
        Log.v(this.TAG, JSON.stringify(command));

        if (command.success) {
            Preferences.setAuthenticator(
                command.mode,
                command.data.key,
                command.data.secret
            );

            if (this.window != null) {
                this.window.close();
                this.window = null;
            }

            this.user = command.user;

            for (var i = 0, ii = command.user.channels.length; i < ii; ++i) {
                var channel = command.user.channels[i];

                this.sendMessage({type: "backlog", target: channel});
            }

            this.isAuthenticated = true;
        } else if (command.challenge && command.challenge.url) {
            this.window = window.open(command.challenge.url);
        }
    }

    onMessageCommand(command: MessageCommand) {
        Log.d(this.TAG, "onMessageCommand");

        if (command.target.indexOf("#") == 0) {
            this.insertMessages([command]).then(function() {
                this.fireEvent("robust-message", command);
            }.bind(this));
        }
    }

    createdCallback() {
        RobustService.call(this);
        this.url = this.getAttribute('url');

        Log.d(this.TAG, "element created");
    }

    attachedCallback() {
        if (this.url) {
            this.connect(this.url);
        }

        Log.d(this.TAG, "element attached");
    }

    detachedCallback() {
        this.disconnect();

        Log.d(this.TAG, "element detached");
    }

    attributeChangedCallback(attr: string, oldVal: any, newVal: any) {
        Log.d(this.TAG, "attr changed: " + attr);

        if (attr == "url") {
            this.url = newVal;
        }
    }

    removeEventListener: (type:string, listener:EventListener, useCapture:boolean) => void;
    addEventListener: (type:string, listener:EventListener, useCapture:boolean) => void;
    dispatchEvent: (evt:Event) => boolean;
    getAttribute: (attr:string) => string;
}

interface CustomElement {
    createdCallback();
    attachedCallback();
    detachedCallback();
    attributeChangedCallback(attr: string, oldVal: any, newVal: any);
}

interface HTMLElement {
    call(x: any): void;
}

function RobustElement() {}
RobustElement.prototype = Object.create(HTMLElement.prototype);
applyMixins(RobustElement, [WebSocketWrapper, RobustService]);

interface Document {
    registerElement(el: string, foo: any);
}

(<Document>document).registerElement("robust-service", { prototype: RobustElement.prototype });
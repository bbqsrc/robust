interface IterableResult {
    value: any;
    done: boolean;
}

interface Iterable {
    next(): IterableResult;
}

interface AsyncIterable {
    forEach(callback: Function): Promise;
    map(callback: Function): Promise;
}

declare class Promise {
    constructor(...args: any[]);

    static all(iterable: Iterable): Promise;
    static race(iterable: Iterable): Promise;
    static reject(r?: any): Promise;
    static resolve(r?: any): Promise;

    catch(onRejected: Function): Promise;
    then(onFulfilled: Function, onRejected?: Function): Promise;
}

class Deferred {
    private _resolve: Function;
    private _reject: Function;
    private _isResolved: boolean;
    private _isRejected: boolean;

    promise: Promise;

    constructor() {
        var _this = this;
        this.promise = new Promise(function(resolve, reject) {
            _this.resolve = resolve;
            _this.reject = reject;
        });
    }

    resolve(data?: any) {
        this._isResolved = true;
        this._resolve(data);
    }

    reject(data?: any) {
        this._isRejected = true;
        this._reject(data);
    }

    get isRejected() {
        return this._isRejected;
    }

    get isResolved() {
        return this._isResolved;
    }

    get isDone() {
        return this._isResolved || this._isRejected;
    }
}

class DeferredAsyncIterable extends Deferred implements AsyncIterable {
    private callback: Function;
    private mode: string;
    private buffer: any;
    private started = false;

    constructor() {
        super();
    }

    resolve() {
        if (this.mode == "forEach") {
            super.resolve(null);
        } else if (this.mode == "map") {
            super.resolve(this.buffer);
        }
    }

    progress(data: any) {
        if (this.mode == "forEach") {
            this.callback(data);
        } else if (this.mode == "map") {
            this.buffer.push(this.callback(data));
        }
    }

    forEach(callback: Function): Promise {
        if (this.started) {
            throw TypeError("iterable may not be reused");
        }
        this.started = true;

        this.callback = callback;
        this.mode = "forEach";
        return this.promise;
    }

    map(callback: Function): Promise {
        if (this.started) {
            throw TypeError("iterable may not be reused");
        }
        this.started = true;

        this.callback = callback;
        this.mode = "map";
        this.buffer = [];
        return this.promise;
    }
}

class PromiseIndexedDB {
    static open(name: string, version?: number, upgradeNeededCallback?: Function): Promise {
        return new Promise(function(resolve, reject) {
            var request: any = version == null ?
                indexedDB.open(name) :
                indexedDB.open(name, version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            if (upgradeNeededCallback != null) {
                request.onupgradeneeded = () => upgradeNeededCallback(request.result);
            }
        });
    }
}

function promiseIDBRequest(req: IDBRequest): Promise {
    return new Promise(function(resolve, reject) {
        req.onsuccess = (e: any) => resolve(e.target.result);
        req.onerror = (e: any) => reject(e.target.error)
    })
}

function promiseIDBTransaction(tx: IDBTransaction): Promise {
    return new Promise(function(resolve, reject) {
        tx.oncomplete = () => resolve();
        tx.onerror = (e: any) => reject(e.target.error);
        tx.onabort = (e: any) => reject(e.target.error);
    })
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

class PromiseIDBIndex {
    private raw: IDBIndex;

    constructor(index: IDBIndex) {
        this.raw = index;
    }

    private _apply(method: Function, args: IArguments): Promise {
        return promiseIDBRequest(method.apply(this.raw, args))
    }

    count(key:any): Promise {
        return this._apply(this.raw.count, arguments);
    }

    getKey(key:any): Promise {
        return this._apply(this.raw.getKey, arguments);
    }

    openKeyCursor(range?:IDBKeyRange, direction?:string): Promise {
        return this._apply(this.raw.openKeyCursor, arguments);
    }

    get(key:any): Promise {
        return this._apply(this.raw.get, arguments);
    }

    openCursor(range?:IDBKeyRange, direction?:string): DeferredAsyncIterable {
        var req = this.raw.openCursor.apply(this.raw, arguments);

        var iter = new DeferredAsyncIterable();

        req.onsuccess = function() {
            var cursor = req.result;

            if (cursor) {
                iter.progress(cursor.value);
                cursor.continue();
            } else {
                iter.resolve();
            }
        }

        req.onerror = function() {
            iter.reject(req.error);
        }

        return iter;
    }
}

class PromiseIDBObjectStore {
    private raw: IDBObjectStore;

    constructor(objectStore: IDBObjectStore) {
        this.raw = objectStore;
    }

    private _apply(method: Function, args: IArguments): Promise {
        return promiseIDBRequest(method.apply(this.raw, args))
    }

    count(key:any):Promise {
        return this._apply(this.raw.count, arguments);
    }

    add(value:any, key?:any):Promise {
        return this._apply(this.raw.add, arguments);
    }

    clear():Promise {
        return this._apply(this.raw.clear, arguments);
    }

    createIndex(name:string, keyPath:string, optionalParameters?:any): PromiseIDBIndex {
        return new PromiseIDBIndex(
            this.raw.createIndex.apply(this.raw, arguments));
    }

    put(value:any, key?:any):Promise {
        return this._apply(this.raw.put, arguments);
    }

    openCursor(range?:any, direction?:string):Promise {
        return this._apply(this.raw.openCursor, arguments);
    }

    deleteIndex(indexName:string):void {
        return this.raw.deleteIndex.apply(this.raw, arguments);
    }

    index(name:string): PromiseIDBIndex {
        return new PromiseIDBIndex(
            this.raw.index.apply(this.raw, arguments));
    }

    get(key:any):Promise {
        return this._apply(this.raw.get, arguments);
    }

    delete(key:any):Promise {
        return this._apply(this.raw.delete, arguments);
    }
}
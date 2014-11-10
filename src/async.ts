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
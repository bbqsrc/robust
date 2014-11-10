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
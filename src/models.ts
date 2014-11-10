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

interface JoinCommand {
    type: string;
    target: string;
}

interface PartCommand {
    type: string;
    target: string;
}

interface Channel {
    name: string;
    messages: MessageCommand[];
}

// Necessary models to make TypeScript understand the new unsafe world of
// CustomElements.

interface CustomElement {
    createdCallback();
    attachedCallback();
    detachedCallback();
    attributeChangedCallback(attr: string, oldVal: any, newVal: any);
}

interface HTMLElement {
    call(x: any): void;
    content: any;
}

interface Document {
    registerElement(el: string, foo: any);
}

declare function setImmediate(handler: any, ...args: any[]): number;
declare function clearImmediate(handle: number): void;


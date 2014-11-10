class View implements CustomElement {
    boundElement: EventTarget;
    boundFunctions: {};
    events: Object;
    shadowRoot: any; // Shadow DOM
    $: any;

    constructor() {
        this.shadowRoot = this.createShadowRoot();
        this.$ = Object.create(null);

        var tmpl = this.template();
        if (tmpl && tmpl.content) {
            this.shadowRoot.appendChild(tmpl.content);

            var nodes = this.shadowRoot.querySelectorAll("[id]");
            for (var i = 0, ii = nodes.length; i < ii; ++i) {
                this.$[nodes[i].id] = nodes[i];
            }
        }
    }

    bindViewTo(element: EventTarget) {
        this.boundElement = element;
        this.boundFunctions = Object.create(null);

        Object.keys(this.events).forEach(function(key) {
            Log.d("View", "binding event: " + key);
            var unbound = this[this.events[key]];
            if (unbound == null) {
                return;
            }

            var bound = unbound.bind(this);

            this.boundElement.addEventListener(key, bound, false);
            this.boundFunctions[key] = bound;
        }, this);
    }

    unbindView() {
        if (!this.boundElement) {
            return;
        }

        Object.keys(this.events).forEach(function(key) {
            this.boundElement.removeEventListener(
                key, this.boundFunctions[key], false);
        }, this);

        this.boundElement = undefined;
        this.boundFunctions = undefined;
    }

    template(): HTMLElement {
        return document.getElementById(this.nodeName.toLowerCase());
    }

    createdCallback() {

    }

    attachedCallback() {
    }

    detachedCallback() {
    }

    attributeChangedCallback(attr:string, oldVal:any, newVal:any) {
    }
    createShadowRoot: () => void;
    nodeName: string;
}


class ChannelSidebarView extends View {
    private TAG = "ChannelSidebarView";

    static ELEMENT_CLASS = "RobustChannelSidebarView";
    static ELEMENT_TAG = "robust-channel-sidebar";

    private serviceId: string;
    private channels = [];

    events = {
        'robust-auth': 'onAuth',
        'robust-join': 'onJoin',
        'robust-part': 'onPart'
    };

    constructor() {
        super();
    }

    onAuth(e) {
        var command: AuthCommand = e.detail;

        if (command.user != null) {
            this.channels = command.user.channels;
        }

        this.render();
    }

    onJoin(e) {
        var command: JoinCommand = e.detail;

        this.channels.push(command.target);

        this.render();
    }

    onPart(e) {
        var command: PartCommand = e.detail;

        var i = this.channels.indexOf(command.target);

        if (i != -1) {
            this.channels.splice(i, 1);
        }

        this.render();
    }

    render() {
        while (this.$.channels.lastChild) {
            this.$.channels.removeChild(this.$.channels.lastChild);
        }

        this.channels.forEach(channel => {
            var node = document.createElement('li');
            node.innerText = channel;
            this.$.channels.appendChild(node);
        })
    }

    private attemptBinding() {
        if (this.serviceId) {
            var node = document.getElementById(this.serviceId);
            if (node != null) {
                this.bindViewTo(node);
            }
        }
    }

    createdCallback() {
        ChannelSidebarView.call(this);
    }

    attachedCallback() {
        this.serviceId = this.getAttribute("service");

        this.attemptBinding();
    }

    detachedCallback() {
        this.unbindView();
    }

    attributeChangedCallback(attr:string, oldVal:any, newVal:any) {
        if (attr == "service") {
            this.unbindView();

            this.serviceId = newVal;
            this.attemptBinding();
        }
    }

    removeEventListener: (type:string, listener:EventListener, useCapture:boolean) => void;
    addEventListener: (type:string, listener:EventListener, useCapture:boolean) => void;
    dispatchEvent: (evt:Event) => boolean;
    getAttribute: (attr:string) => string;
    appendChild: (node:Node) => void;
}
generateElementWrapper(ChannelSidebarView);
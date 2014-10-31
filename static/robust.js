function Robust(url) {
    this.url = url;
}

Robust.prototype = {
    connect: function(callback) {
        var self = this;

        this.ws = new WebSocket(this.url);
        this.ws.onopen = function() {
            callback.call(self);
        };
        this.ws.onmessage = function(msg) {
            self.onReceiveMessage.call(self, msg.data);
        };
    },

    sendMessage: function(msg) {
        console.log("-> " + JSON.stringify(msg));
        this.ws.send(JSON.stringify(msg) + "\n");
    },

    authenticate: function(mode, key, secret) {
        this.sendMessage({
            type: "auth",
            mode: mode, 
            challenge: {
                key: key,
                secret: secret
            }
        });
    },

    onReceiveMessage: function(data) {
        var command;
        
        try {
            command = JSON.parse(data);
        } catch (e) {
            console.log("Received garbage: " + data);
            return;
        }

        console.log("<- " + data);

        switch (command.type) {
            case "auth":
                this.handleAuth(command);
                break;
            case "message":
                this.handleMessage(command);
                break;
            case "backlog":
                this.handleBacklog(command);
                break;
            case "join":
                this.handleJoin(command);
                break;
            default:
                this.handleUnknown(command);
        }
    },

    handleAuth: function(command) {
        console.log(this);

        if (command.success) {
            try {
                localStorage.setItem("auth", JSON.stringify({
                    mode: command.mode,
                    key: command.data.key,
                    secret: command.data.secret
                }));
            } catch (e) {}

            if (this.loginWindowId) {
                this.loginWindowId.close();
                this.loginWindowId = undefined;
            }

            this.isAuthenticated = true;
            this.appendMessage('[***] Authenticated!');
        } else {
            this.appendMessage('[***] Challenged!');
            this.loginWindowId = window.open(command.challenge.url);
        }
    },

    handleMessage: function(command) {
         this.appendMessage('[@' + command.from.handle +
            '] ' + command.body + '\n');
    },

    handleBacklog: function(command) {
        for (var i = 0, ii = command.messages.length; i < ii; ++i) {
            this.handleMessage(command.messages[i]);
        }
    },

    handleJoin: function(command) {
        this.appendMessage('[***] Joined ' + command.target);
    },

    handleUnknown: function(command) {

    },

    appendMessage: function(msg) {
        document.getElementById('output').innerHTML += msg.trim() + '\n';
    }
}

var client = new Robust("ws://robust.brendan.so/ws");

client.connect(function() {
    var auth;
    
    try {
        if (localStorage['auth'] != null) {
            auth = JSON.parse(localStorage['auth']);
        }
    } catch (e) {}

    if (auth != null) {
        client.authenticate(auth.mode, auth.key, auth.secret);
    } else {
        client.authenticate('twitter');
    }
});


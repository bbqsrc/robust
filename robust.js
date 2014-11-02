Robust = {
    maxTS: 0,

    setPref: function(key, value) {
        try {
            localStorage[key] = JSON.stringify(value);
        } catch(e) {
        }
    },

    getPref: function(key) {
        try {
            return JSON.parse(localStorage[key]);
        } catch(e) {
            return null;
        }
    },

    sendMessage: function(msg) {
        console.log("-> " + JSON.stringify(msg));
        this.send(JSON.stringify(msg) + "\n");
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

        this.fire('robust-command', command);
    },

    handleCommand: function(command) {

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
            this.setPref("auth", {
                mode: command.mode,
                key: command.data.key,
                secret: command.data.secret
            });

            if (this.loginWindowId) {
                this.loginWindowId.close();
                this.loginWindowId = undefined;
            }

            this.isAuthenticated = true;
            this.appendMessage('[***] Authenticated!');

            var self = this;

            //command.user.channels
            this.sendMessage({type: "backlog", fromDate: self.maxTS, target: "#test"});
        } else {
            this.appendMessage('[***] Challenged!');
            this.loginWindowId = window.open(command.challenge.url);
        }
    },

    handleMessage: function(command) {
        if (command.ts > this.maxTS) this.maxTS = command.ts;

        this.appendMessage('[' + (new Date(command.ts)).toISOString() + 
                            '] [@' + command.from.handle +
                            '] ' + command.body);
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
    
    }
}

/*
var client = new Robust("ws://robust.brendan.so/ws");

client.connect(function() {
    var auth = client.getPref('auth');
    
    if (auth != null) {
        client.authenticate(auth.mode, auth.key, auth.secret);
    } else {
        client.authenticate('twitter');
    }
});
*/

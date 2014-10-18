from tornado.concurrent import Future
from requests_oauthlib import OAuth1
from bson.objectid import ObjectId

import requests
import uuid

from dates import utcnow_millis
from exceptions import MessageError, NotAuthenticatedError
from entities import User


class TwitterAuth:
    def __init__(self, session):
        self.session = session
        self.logger = self.session.logger

    @property
    def key(self):
        return self.session.get('twitter_key')

    @property
    def secret(self):
        return self.session.get('twitter_secret')

    def generate_challenge(self):
        """Returns authentication challenge message, with OAuth URL."""
        nonce = uuid.uuid4().hex

        future = Future()
        future.add_done_callback(lambda future: self.session.transport.write_json(
            self.authenticate(future.result())))
        self.session.properties.futures[nonce] = future

        return {
            "url": "http://robust.brendan.so/auth/twitter?robust_token=%s" % nonce
        }

    def test_auth_data(self, data):
        """Returns a boolean for whether key/secret verify successfully."""
        if data is None:
            return None

        key = data.get('key', None)
        secret = data.get('secret', None)

        return self._oauth_challenge(key, secret)

    def get_user(self, user_obj):
        try:
            return User.from_twitter(self.session.db.users, user_obj['id_str'])
        except ValueError:
            return User.create_from_twitter(self.session.db.users, user_obj)

    def authenticate(self, data=None):
        """Returns message either with success or challenge."""
        if data is None:
            data = {}

        o = {"type": "auth", "mode": "twitter"}

        if self.session.is_authenticated():
            raise MessageError("Session already authenticated.")

        access_token = data.get('challenge', None)

        if access_token is None:
            access_token = data.get('access_token', None)

        data = self.test_auth_data(access_token)

        if data is not None:
            user = self.get_user(data)
            self.session.set('user', user)
            self.logger.info("authenticated with handle '%s'." % user['handle'])
            o['user'] = user
            o['success'] = True
            o['data'] = {"key": access_token['key'],
                         "secret": access_token['secret']}
        else:
            o['success'] = False
            o['challenge'] = self.generate_challenge()
        return o

    def _oauth_challenge(self, key, secret):
        # TODO drop requests dependency, use tornado async http
        oauth = OAuth1(self.key,
                       client_secret=self.secret,
                       resource_owner_key=key,
                       resource_owner_secret=secret)

        r = requests.get(url="https://api.twitter.com/1.1/account/verify_credentials.json",
                         auth=oauth)

        self.logger.debug('oauth: %s' % r.status_code)
        return r.json() if r.status_code == 200 else None


class MessageHandler:
    def __init__(self, session):
        self.session = session

    def send(self, obj):
        target = obj.get("target", None)
        body = obj.get('body', None)

        if not self.session.is_authenticated():
            raise NotAuthenticatedError("You must be authenticated to send a message.")

        if not self.session.can_send(target):
            raise MessageError("You do not have permission to send messages to target '%s'." % target)

        if target is None:
            raise MessageError("No message target provided.")

        if body is None:
            raise MessageError("No message body provided.")

        original_body = body
        new_body = self.parse(body)

        user = self.session.get('user')

        o = {
            "_id": ObjectId(),
            "from": {
                "id": user['_id'].hex,
                "handle": user['handle'],
                "name": user['name']
            },
            "ts": utcnow_millis(),
            "target": target,
            "body": new_body,
            "type": "message"
        }

        self.session.msgdb.insert(o)

        # For great JSON.
        o["original_body"] = original_body
        o['id'] = str(o['_id'])
        del o['_id']

        self.session.transport.broadcast(o)

        return o

    def parse(self, body):
        return body


class SocketMessageHandler:
    def __init__(self, session):
        self.session = session
        self.message_handler = MessageHandler(self.session)
        self.twitter_auth = TwitterAuth(self.session)

    def parse(self, obj):
        # TODO add message validation here
        type_ = obj.get('type', "_")
        if type_.startswith("_"):
            raise MessageError("No valid type specified.")

        method = getattr(self, type_, None)
        if method is None:
            raise MessageError("No method found for type '%s'." % type_)
        return method(obj)

    def ping(self, obj):
        return {"type": "pong"}

    def pong(self, obj):
        return None

    def message(self, obj):
        return self.message_handler.send(obj)

    def emote(self, obj):
        return NotImplemented

    def join(self, obj):
        # TODO accept a list instead of a string; multi join!
        user = self.session.get('user')

        user['channels'].append(obj['target'])
        user.save()

        o = obj.copy()
        o['success'] = True
        return o

    def part(self, obj):
        # TODO part a channel
        pass

    def backlog(self, obj):
        from_date = obj.get('from_date', None)
        to_date = obj.get('to_date', None)
        count = obj.get('count', None)
        # TODO from should be user id based on session.
        #from_ = obj.get('from', None)
        from_ = None
        target = obj.get('target', None)

        if target is None:
            raise MessageError("A valid target is required.")

        obj['messages'] = self.session.msgdb.backlog(target, count,
                                                     from_date, to_date, from_)

        return obj

    def option(self, obj):
        name = obj.get('name', None)

        if name is None:
            raise MessageError("No name provided.")

        return {
            "name": name,
            "type": "option",
            "value": self.session.properties.options.get(name)
        }


    def auth(self, obj):
        mode = obj.get('mode', None)

        if mode is None:
            raise MessageError("No mode provided.")

        method = getattr(self, 'auth_%s' % mode, None)

        if method is None:
            raise MessageError("No handler found for mode '%s'." % mode)

        o = method(obj)
        if o is not None:
            o['user'] = self.session.user
        return o


    def auth_twitter(self, obj):
        return self.twitter_auth.authenticate(obj)

    def auth_plain(self, obj):
        username = obj.get('username', None)
        # TODO plain auth


def create_error(subtype, err):
    return {
        "type": "error",
        "subtype": subtype,
        "message": str(err)
    }


def create_welcome(motd):
    return {
        "type": "welcome",
        "motd": motd
    }

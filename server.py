from tornado.platform.asyncio import AsyncIOMainLoop
from tornado.web import RequestHandler, Application, url
from tornado.options import define, options
from io import BytesIO

import pymongo
import tornado.auth
import tornado.gen
import tornado.options
import tornado.websocket
import toml

import asyncio
import json
import uuid
import logging
import time
import ssl

from exceptions import MessageError, NotAuthenticatedError
import messages
import db

ARROW_LEFT = "<-"
ARROW_RIGHT = "->"

define('http', default='127.0.0.1:8888', help='HTTP host:port')
define('tcp', default='127.0.0.1:8889', help='TCP host:port')
define('mongo', default='127.0.0.1:27017', help='MongoDB host:port')
define('config', help='Configuration file. (toml format)')
define('certfile', help="Certificate file.")
define('keyfile', help="Key file.")

def create_ssl_context(certfile, keyfile):
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLSv1_2)
    ctx.load_cert_chain(certfile, keyfile)
    return ctx

class Session:
    def __init__(self, properties, transport, logger, msgdb):
        self._properties = properties
        self._transport = transport
        self._logger = logger
        self._msgdb = msgdb

        host, port = options.mongo.split(':')
        self._db = pymongo.MongoClient(host, int(port)).robust
        self._dict = {}

    @property
    def db(self):
        return self._db

    @property
    def msgdb(self):
        return self._msgdb

    @property
    def properties(self):
        return self._properties

    @property
    def transport(self):
        return self._transport

    @property
    def logger(self):
        return self._logger

    def is_authenticated(self):
        return self.get('user') is not None

    @property
    def user(self):
        return self.get('user')

    def can_send(self, target):
        return True

    def set(self, thing, value):
        self._dict[thing] = value
        return value

    def get(self, thing):
        data = self._dict.get(thing, None)
        if data is None:
            return self.properties.get(thing)
        return data


class ServerOptions:
    def __init__(self, **kwargs):
        defaults = {
            "auth": ["twitter", "plain"]
        }

        for k in defaults.keys():
            setattr(self, k, kwargs.get(k, defaults[k]))

    def get(self, thing):
        try:
            return getattr(self, thing)
        except KeyError as e:
            raise ValueError("No option '%s' found." % thing)


class Properties:
    def __init__(self, **kwargs):
        self._futures = {}
        self._auth_tokens = {}

        opts = kwargs.get('options', None)
        if opts:
            self._options = ServerOptions(**opts)
            del kwargs['options']
        else:
            self._options = ServerOptions()

        for k, v in kwargs.items():
            setattr(self, k, v)

    @property
    def futures(self):
        return self._futures

    @property
    def auth_tokens(self):
        return self._auth_tokens

    @property
    def options(self):
        return self._options

    def get(self, thing):
        return getattr(self, thing, None)


class RobustWebSocket(tornado.websocket.WebSocketHandler):
    def open(self):
        pass

    def on_message(self, data):
        pass

    def on_close(self):
        pass


class TwitterLoginHandler(RequestHandler,
                          tornado.auth.TwitterMixin):
    @tornado.gen.coroutine
    def get(self):
        oauth_token = self.get_argument("oauth_token", None)

        if oauth_token is not None:
            robust_token = properties.auth_tokens.get(oauth_token, None)

            if robust_token is None:
                properties.futures[robust_token].set_result(None)

                self.write("No valid session found.")
                return

            try:
                user = yield self.get_authenticated_user()
                properties.futures[robust_token].set_result(user)

                self.finish()
                return
            except tornado.auth.AuthError as e:
                self.write('%r' % e)

        if self.get_argument("robust_token", None):
            token = self.get_argument('robust_token')

            if properties.futures.get(token, None) is None:
                self.write("NO TOKEN? NO ENTRY.")
                return

            self._token = token

        else:
            self.write("NO TOKEN? NO ENTRY.")
            return

        yield self.authenticate_redirect()

    def _on_request_token(self, authorize_url, callback_uri, callback,
                          response):

        if not response.error:
            # Get req token
            req_token = tornado.auth._oauth_parse_response(response.body)

            # Store for sanity checks
            properties.auth_tokens[req_token['key']] = self._token

        super()._on_request_token(authorize_url, callback_uri, callback,
                                  response)


class JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, uuid.UUID):
            return o.hex
        if hasattr(o, '_to_json'):
            return o._to_json()
        return super().default(o)


sessions = {}


class TCPServer(asyncio.Protocol):
    FRAME_SIZE = 1024

    def _heartbeat_failed(self, transport):
        self.logger.warn(
                self._format_log("No response in %s seconds, closing." % self.read_wait))
        transport.close()

    def heartbeat(self, transport):
        self.write_json({"type": "ping"})

        self._heartbeat_handle = transport._loop\
                .call_later(self.read_wait, lambda: self._heartbeat_failed(transport))

    def update_heartbeat_future(self, transport):
        if self._heartbeat_handle is not None:
            self._heartbeat_handle.cancel()

        self.logger.debug(self._format_log(
            "Heartbeat set for %s seconds." % self.idle_wait))

        self._heartbeat_handle = transport._loop\
                .call_later(self.idle_wait, lambda: self.heartbeat(transport))

    def _format_log(self, words):
        peername = "%s:%s" % self.transport.get_extra_info('peername')
        return "%s (%s)" % (words, peername)

    def log_request(self, type_, ms):
        self.logger.info("%s %.2fms" % (
            self._format_log(type_.upper()), ms))

    def connection_made(self, transport):
        transport.set_write_buffer_limits(self.FRAME_SIZE, self.FRAME_SIZE // 8)

        self._heartbeat_handle = None
        self._buf = BytesIO()

        self.idle_wait = 180
        self.read_wait = 30

        self.id = uuid.uuid4().hex
        self.transport = transport

        logger = logging.getLogger('socket')
        logger.info(self._format_log("Connection made!"))
        logger.debug(self._format_log("Using cipher: %s" %\
                "_".join(transport.get_extra_info('cipher'))))
        self.logger = logger

        sessions[self.id] = Session(properties, self, logger, db.MessagesDB())
        self.session = sessions[self.id]

        self.message_handler = messages.SocketMessageHandler(self.session)

        self.write_json(messages.create_welcome("Welcome to Robust alpha.\n\n" +
                                                "This will be excellent."))
        self.update_heartbeat_future(self.transport)

    def connection_lost(self, exc):
        if self._heartbeat_handle is not None:
            self._heartbeat_handle.cancel()
        self.logger.info(self._format_log("Connection lost!"))
        del sessions[self.id]

    def data_received(self, data):
        i = data.find(b'\n')
        while i > -1:
            self._buf.write(data[:i])
            self.parse_line(self._buf.getvalue())
            self._buf = BytesIO()
            data = data[i+1:]
            i = data.find(b'\n')
        self._buf.write(data)

    def parse_line(self, data):
        self.start_timer()
        self.update_heartbeat_future(self.transport)

        self.logger.debug(self._format_log("%s %r" % (ARROW_LEFT, data)))
        try:
            # TODO see if yield can be used here
            self.on_json(json.loads(data.decode('utf-8')))
        except ValueError as e:
            self.write_json(messages.create_error("parser", e))

    def start_timer(self):
        self._timer = time.time() * 1000

    def stop_timer(self):
        t = self._timer
        self._timer = None
        return time.time() * 1000 - t

    def write_json(self, data):
        out = json.dumps(data, cls=JSONEncoder, separators=(',', ':'))
        self.logger.debug(self._format_log("%s %s" % (ARROW_RIGHT, out)))
        self.transport.write(out.encode('utf-8') + b'\n')

    def on_json(self, json_dict):
        try:
            msg = self.message_handler.parse(json_dict)
            if msg is not None:
                self.write_json(msg)
            self.log_request(json_dict['type'], self.stop_timer())
        except MessageError as e:
            self.write_json(messages.create_error('message', e))
        except NotAuthenticatedError as e:
            self.write_json(messages.create_error('authentication', e))
        except Exception as e:
            self.write_json(messages.create_error('internal',
                "An internal server error has occurred."))
            raise e

    def broadcast(self, message):
        for id_, session in sessions.items():
            if id_ == self.id:
                continue
            self.logger.debug("Broadcasting msg to %s" % id_)
            session.transport.write_json(message)

def make_app():
    return Application([
            url(r'/auth/twitter', TwitterLoginHandler)
        ],
        twitter_consumer_key=properties.twitter_key,
        twitter_consumer_secret=properties.twitter_secret)


def main():
    global properties

    tornado.options.parse_command_line()

    if options.config is None:
        print("Config must be supplied.")
        return

    with open(options.config) as f:
        config = toml.load(f)

    for k in ['http', 'tcp', 'certfile', 'keyfile']:
        if config.get(k, None):
            setattr(options, k, config[k])

    AsyncIOMainLoop().install()

    loop = asyncio.get_event_loop()

    http_host, http_port = options.http.split(':')
    tcp_host, tcp_port = options.tcp.split(':')
    properties = Properties(**config.get('properties', {}))

    logger = logging.getLogger()

    # Bloody asyncio
    logging.getLogger('asyncio').setLevel(logging.WARNING)

    app = make_app()
    app.listen(int(http_port), http_host, xheaders=True)
    logger.info("HTTP server listening on %s." % options.http)

    coro = loop.create_server(TCPServer, tcp_host, int(tcp_port),
            ssl=create_ssl_context(options.certfile, options.keyfile))
    tcp_server = loop.run_until_complete(coro)
    logger.info("TCP server listening on %s." % options.tcp)

    try:
        loop.run_forever()
    except KeyboardInterrupt:
        pass
    finally:
        tcp_server.close()
        loop.close()

if __name__ == "__main__":
    main()

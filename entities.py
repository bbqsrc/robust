import uuid
import itertools
import json

class User:
    @classmethod
    def public(self):
        return ['id', 'name', 'handle', 'timezone', 'bio',
                'display_picture', 'display_picture_large',
                'location', 'is_server_admin',
                'twitter_uid']

    # TODO: add 'email' as required
    @classmethod
    def required(cls):
        return ['name', 'handle']

    @classmethod
    def defaults(cls):
        return {
            "location": "",
            "bio": "",
            "timezone": 0,
            "display_picture": None,
            "display_picture_large": None,
            "twitter_uid": None,
            "facebook_uid": None,
            "github_uid": None,
            "is_server_admin": False,
            "channels": []
        }

    def _to_json(self):
        return self.record

    def __getitem__(self, key):
        if key in self.defaults() or key in self.required() or key == "_id":
            return self._data[key]
        raise KeyError

    def __setitem__(self, key, value):
        if key in self.defaults() or key in self.required():
            self._data[key] = value
            # SAVE HERE
            return value
        raise KeyError

    def get(self, key, fallback=None):
        try:
            return self[key]
        except KeyError:
            return fallback


    def __init__(self, collection, record, authorised=True):
        self._data = record
        self._collection = collection
        self._authorised = authorised

    def save(self):
        self._collection.save(self._data)

    @property
    def record(self):
        if not self._authorised:
            o = {}
            for p in self.public():
                if p == 'id':
                    o[p] = self._data['_id'].hex
                else:
                    o[p] = self._data[p]
            return o
        else:
            o = self._data.copy()
            o['id'] = o['_id'].hex
            del o['_id']
            return o

    @classmethod
    def create(cls, collection, obj):
        for k in cls.required():
            if obj.get(k, None) is None:
                raise ValueError(k)

        o = cls.defaults()

        for k in itertools.chain(cls.defaults(), cls.required()):
            if k in obj:
                o[k] = obj[k]

        o["_id"] = uuid.uuid4()

        collection.insert(o)

        return cls(collection, o)

    @classmethod
    def from_plain(cls, collection, handle):
        record = collection.find_one({"handle": handle})

        if record is None:
            raise ValueError

        return cls(collection, record)

    @classmethod
    def from_twitter(cls, collection, user_id):
        record = collection.find_one({"twitter_uid": user_id})

        if record is None:
            raise ValueError

        return cls(collection, record)

    @classmethod
    def create_from_twitter(cls, collection, user_obj):
        user_id = user_obj['id_str']
        timezone = user_obj['utc_offset'] or 0

        handle = user_obj['screen_name']
        name = user_obj['name']
        bio = user_obj['description']
        location = user_obj['location']

        img = None
        img_large = None

        if not user_obj['default_profile_image']:
            img = user_obj['profile_image_url_https']
        if img is not None:
            img_large = img.replace("_normal", "")

        return cls.create(collection, {
            "name": name,
            "handle": handle,
            "bio": bio,
            "location": location,
            "timezone": timezone // 60,
            "twitter_uid": user_id,
            "display_picture": img,
            "display_picture_large": img_large
        })

    @classmethod
    def from_id(cls, collection, user_id):
        record = collection.find_one({"_id": uuid.UUID(user_id)})

        if record is None:
            raise ValueError

        return cls(collection, record, False)

    def assign_twitter_uid(self):
        raise NotImplementedError


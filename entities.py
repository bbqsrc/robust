import uuid

class User:
    @classmethod
    def required(cls):
        return ['name', 'handle', 'timezone']

    @classmethod
    def defaults(cls):
        return {
            "location": "",
            "bio": "",
            "display_picture": None,
            "twitter_uid": None,
            "facebook_uid": None,
            "github_uid": None,
            "is_server_admin": False
        }

    def __getitem__(self, key):
        if key in self.required() or key in self.defaults():
            return self._data[key]
        raise KeyError

    def __setitem__(self, key, value):
        if key in self.required() or key in self.defaults():
            self._data[key] = value
            # SAVE HERE
            return value
        raise KeyError

    def __init__(self, record):
        self._data = record

    @classmethod
    def create(cls, collection, obj):
        for k in cls.required():
            if obj.get(k, None) is None:
                raise ValueError(k)

        o = cls.defaults()

        for k in cls.defaults().keys():
            if k in obj:
                o[k] = obj[k]

        o["_id"] = uuid.uuid4()

        collection.insert(o)

        return o

    @classmethod
    def from_twitter(cls, collection, user_id):
        record = collection.find_one({"twitter_uid": user_id})

        if record is None:
            raise ValueError

        return cls(record)

    @classmethod
    def create_from_twitter(cls, collection, user_obj):
        user_id = user_obj['id_str']
        timezone = user_obj['utc_offset']

        handle = user_obj['screen_name']
        name = user_obj['name']
        bio = user_obj['description']
        location = user_obj['location']

        img = None
        if not user_obj['default_profile_image']:
            img = user_obj['profile_image_url_https']

        return cls.create(collection, {
            "name": name,
            "handle": handle,
            "bio": bio,
            "location": location,
            "timezone": timezone // 60,
            "twitter_uid": user_id
        })

    def assign_twitter_uid(self):
        raise NotImplementedError



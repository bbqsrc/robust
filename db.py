import pymongo

from collections import deque
from datetime import datetime, timedelta

from dates import utcnow_millis

class MessagesDB:
    def __init__(self, mongo_host='localhost', mongo_port=27017):
        self.client = pymongo.MongoClient(mongo_host, mongo_port)
        self.db = self.client.robust
        self.messages = self.db.messages

    def insert(self, message):
        message = message.copy() # Don't mangle original dict

        # TODO better validation
        if not message.get('ts', None):
            raise TypeError("Timestamp missing!")

        return self.messages.insert(message)

    def backlog(self, target, count=None, from_date=None, to_date=None, from_=None):
        if count is None:
            count = 100

        if from_date is None:
            from_date = 0

        if to_date is None:
            to_date = utcnow_millis()

        if not isinstance(from_date, int):
            raise TypeError("from_date must be int (of microseconds).")

        if not isinstance(to_date, int):
            raise TypeError("to_date must be int (of microseconds).")

        q = {
            "target": target,
            "ts": {"$lte": to_date, "$gte": from_date}
        }

        if target.startswith("@"):
            if from_ is None:
                raise ValueError("cannot query messages to @target without from_ param")
            q['from'] = from_

        # TODO indexing
        cursor = self.messages.find(q)\
                    .sort("ts", pymongo.DESCENDING).limit(count)

        o = deque()
        for record in cursor:
            record['id'] = str(record['_id'])
            del record['_id']
            o.appendleft(record)

        return list(o)

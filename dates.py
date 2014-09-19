from datetime import datetime

def utcnow_millis():
    '''Return now in milliseconds.'''
    return int(datetime.utcnow().timestamp() * 1000)

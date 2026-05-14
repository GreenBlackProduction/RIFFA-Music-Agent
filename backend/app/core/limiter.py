"""Rate limiter — SlowAPI поверх Redis."""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Подключаемся к тому же Redis что использует очередь задач.
# В Docker-сети это redis:6379, снаружи контейнера — localhost.
_redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_redis_url,
    default_limits=["200/minute"],
)

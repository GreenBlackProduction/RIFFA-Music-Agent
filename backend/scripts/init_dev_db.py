"""Создаёт таблицы по metadata в текущей БД (для dev/SQLite)."""

from __future__ import annotations

import asyncio

from app.db import models  # noqa: F401
from app.db.base import Base, get_engine


async def main() -> None:
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


if __name__ == "__main__":
    asyncio.run(main())

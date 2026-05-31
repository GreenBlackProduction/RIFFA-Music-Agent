"""Backfill: перезеркалить все completed generations, чьи треки/обложки/wav
ещё ссылаются на Suno CDN (tempfile.aiquickdraw.com, musicfile.removeai.ai,
cdn.suno.ai и т.п.). Suno удаляет файлы через 14 дней, поэтому без зеркала
они становятся 404.

Использование (из контейнера backend):
    python -m app.scripts.backfill_mirror              # сухой запуск
    python -m app.scripts.backfill_mirror --apply      # реально зеркалить
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.db.models import Generation, GenerationStatus
from app.services.mirror import mirror_generation_result

# Подстроки в URL, которые означают «всё ещё на стороне Suno».
_SUNO_HOSTS: tuple[str, ...] = (
    "tempfile.aiquickdraw.com",
    "musicfile.removeai.ai",
    "cdn.suno.ai",
    "sunoapi.org",
    "sunoapi.com",
    ".suno.ai",
)


def _result_is_dirty(result: dict | None) -> bool:
    """True если в result остались ссылки на Suno CDN."""
    if not result:
        return False
    blob = json.dumps(result, ensure_ascii=False)
    return any(host in blob for host in _SUNO_HOSTS)


async def main(apply: bool) -> int:
    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    fixed = 0
    skipped = 0
    failed = 0
    candidates: list[Generation] = []

    async with factory() as session:
        rows = (
            await session.execute(
                select(Generation)
                .where(Generation.status == GenerationStatus.completed)
                .order_by(Generation.created_at.asc())
            )
        ).scalars().all()
        for g in rows:
            if _result_is_dirty(g.result):
                candidates.append(g)
        print(f"Found {len(candidates)} generations still on Suno CDN out of {len(rows)} completed.")
        if not apply:
            for g in candidates[:50]:
                print(f"  • {g.id}  {g.type.value:<14}  {g.created_at.isoformat()}")
            if len(candidates) > 50:
                print(f"  …+ {len(candidates) - 50} more")
            print("\nDry run. Re-run with --apply to actually mirror.")
            return 0

        for g in candidates:
            try:
                new_result = await mirror_generation_result(
                    dict(g.result or {}), str(g.id), settings,
                )
            except Exception as exc:
                print(f"  ✗ {g.id}: {exc}")
                failed += 1
                continue
            if _result_is_dirty(new_result):
                # Suno уже могла удалить файлы (фетч вернул 404). Мы оставляем
                # старое result, но логируем — пользователь увидит «битый» трек.
                print(f"  ! {g.id}: still dirty after mirror (Suno files likely deleted)")
                skipped += 1
                continue
            # Перечитываем строку чтобы избежать stale-снапшота.
            async with factory() as up:
                live = (
                    await up.execute(select(Generation).where(Generation.id == g.id))
                ).scalar_one()
                live.result = new_result
                live.completed_at = live.completed_at or datetime.now(UTC)
                await up.commit()
            print(f"  ✓ {g.id}")
            fixed += 1

    print(
        f"\nDone. fixed={fixed}  skipped(unrecoverable)={skipped}  failed={failed}",
    )
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually mirror to MinIO")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.apply)))

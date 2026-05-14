"""Server monitoring and admin notifications via Telegram."""

from __future__ import annotations

import shutil
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.db.models import Generation, GenerationStatus


class MonitoringError(Exception):
    """Raised when monitoring or notification fails."""


async def get_disk_usage() -> dict[str, Any]:
    """Get disk usage statistics."""
    stat = shutil.disk_usage("/")
    total_gb = stat.total / (1024**3)
    used_gb = stat.used / (1024**3)
    free_gb = stat.free / (1024**3)
    percent_used = (stat.used / stat.total * 100) if stat.total > 0 else 0
    
    return {
        "total_gb": round(total_gb, 2),
        "used_gb": round(used_gb, 2),
        "free_gb": round(free_gb, 2),
        "percent_used": round(percent_used, 1),
    }


async def get_generation_errors(
    session_factory: async_sessionmaker[AsyncSession],
    hours: int = 24,
) -> dict[str, Any]:
    """Get generation error statistics from the last N hours."""
    cutoff = datetime.now(UTC) - timedelta(hours=hours)
    
    async with session_factory() as session:
        # Total failed generations
        failed = await session.scalar(
            select(func.count(Generation.id)).where(
                Generation.status == GenerationStatus.failed,
                Generation.updated_at >= cutoff,
            )
        )
        
        # Error messages (deduplicated)
        errors = await session.execute(
            select(Generation.error_message, func.count(Generation.id)).where(
                Generation.status == GenerationStatus.failed,
                Generation.updated_at >= cutoff,
                Generation.error_message.is_not(None),
            ).group_by(Generation.error_message)
        )
        
    return {
        "total_failed": failed or 0,
        "error_types": [
            {"message": row[0], "count": row[1]} 
            for row in errors.all()
        ],
    }


async def send_telegram_alert(
    admin_telegram_ids: str,
    bot_token: str,
    alert_type: str,
    message: str,
) -> None:
    """Send a Telegram message to all admin users.
    
    Args:
        admin_telegram_ids: Comma-separated list of Telegram user IDs
        bot_token: Telegram bot token
        alert_type: Type of alert (disk_usage, generation_error, etc.)
        message: Alert message text
    """
    if not admin_telegram_ids or not bot_token:
        logger.warning("Cannot send Telegram alert: missing admin IDs or bot token")
        return
    
    admin_ids = [int(uid.strip()) for uid in admin_telegram_ids.split(",") if uid.strip()]
    if not admin_ids:
        logger.warning("No admin Telegram IDs configured")
        return
    
    async with httpx.AsyncClient() as client:
        for user_id in admin_ids:
            try:
                url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                payload = {
                    "chat_id": user_id,
                    "text": f"🔔 *{alert_type}*\n\n{message}",
                    "parse_mode": "Markdown",
                }
                response = await client.post(url, json=payload, timeout=10)
                if response.status_code != 200:
                    logger.warning(
                        "Failed to send Telegram alert to {}: {}",
                        user_id,
                        response.text,
                    )
                else:
                    logger.info("Sent Telegram alert to admin {}: {}", user_id, alert_type)
            except Exception as e:
                logger.error("Error sending Telegram alert to {}: {}", user_id, e)


async def check_disk_usage(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    threshold_percent: int = 80,
) -> None:
    """Check disk usage and send alert if threshold is exceeded.
    
    Args:
        settings: Application settings
        session_factory: Database session factory
        threshold_percent: Threshold percentage for alert
    """
    disk = await get_disk_usage()
    
    if disk["percent_used"] >= threshold_percent:
        message = (
            f"💾 Disk usage is at *{disk['percent_used']}%*\n\n"
            f"Total: {disk['total_gb']} GB\n"
            f"Used: {disk['used_gb']} GB\n"
            f"Free: {disk['free_gb']} GB\n\n"
            f"⚠️ Please free up storage space or upgrade the server!"
        )
        await send_telegram_alert(
            settings.admin_telegram_ids,
            settings.telegram_bot_token,
            "Disk Usage Alert",
            message,
        )


async def check_generation_errors(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    error_threshold: int = 5,
    hours: int = 24,
) -> None:
    """Check for generation errors and send alert if threshold is exceeded.
    
    Args:
        settings: Application settings
        session_factory: Database session factory
        error_threshold: Number of errors to trigger alert
        hours: Check errors from last N hours
    """
    errors = await get_generation_errors(session_factory, hours=hours)
    
    if errors["total_failed"] >= error_threshold:
        error_list = "\n".join(
            [f"• {e['message']}: {e['count']} times" for e in errors["error_types"][:5]]
        )
        message = (
            f"❌ *{errors['total_failed']}* generation(s) failed in the last {hours}h\n\n"
            f"Recent errors:\n{error_list}\n\n"
            f"Please check the generation logs!"
        )
        await send_telegram_alert(
            settings.admin_telegram_ids,
            settings.telegram_bot_token,
            "Generation Error Alert",
            message,
        )


async def run_monitoring_check(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Run all monitoring checks."""
    logger.info("Running monitoring checks...")
    
    # Check disk usage (threshold: 80%)
    await check_disk_usage(settings, session_factory, threshold_percent=80)
    
    # Check generation errors (threshold: 5 errors in 24h)
    await check_generation_errors(settings, session_factory, error_threshold=5, hours=24)
    
    logger.info("Monitoring checks completed")

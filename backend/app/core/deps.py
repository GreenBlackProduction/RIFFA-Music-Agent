"""FastAPI dependencies: current user, settings."""

from collections.abc import AsyncIterator

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import TokenError, read_session_token
from app.db.base import get_session
from app.db.models import User

SESSION_COOKIE = "riffa_session"


async def db_session() -> AsyncIterator[AsyncSession]:
    """Async DB session as a FastAPI dependency."""
    async for session in get_session():
        yield session


async def current_user_optional(
    session: AsyncSession = Depends(db_session),
    riffa_session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> User | None:
    """Return the logged-in user or ``None`` when there is no valid cookie."""
    if not riffa_session:
        return None
    try:
        user_id = read_session_token(riffa_session)
    except TokenError:
        return None
    return (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()


async def current_user_loose(
    user: User | None = Depends(current_user_optional),
) -> User:
    """Require an authenticated user, but allow ``is_banned=True``.

    Used by endpoints that must remain reachable for banned users so the
    frontend can fetch the notice/ban-message and show the banner. Sensitive
    actions still use :func:`current_user` (below), which 403's banned users.
    """
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthenticated")
    return user


async def current_user(user: User = Depends(current_user_loose)) -> User:
    """Require an authenticated, non-banned user."""
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="banned")
    return user


async def admin_user(user: User = Depends(current_user)) -> User:
    """Require an admin user."""
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return user

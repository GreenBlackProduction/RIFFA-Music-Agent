"""User reviews — list + create endpoints for the profile-page block."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, db_session
from app.db.models import Review, User

router = APIRouter(prefix="/reviews", tags=["reviews"])

# Minimum gap between two reviews from the same user — stops a single account
# from flooding the public list.
_REVIEW_COOLDOWN = timedelta(seconds=60)


def _author_name(user: User) -> str:
    """Public author label — never leaks the email address."""
    return user.display_name or user.telegram_username or f"user{user.id}"


class ReviewOut(BaseModel):
    id: int
    rating: int
    text: str
    author: str
    created_at: datetime


class ReviewListResponse(BaseModel):
    items: list[ReviewOut]


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: str = Field(min_length=3, max_length=2000)


@router.get("", response_model=ReviewListResponse)
async def list_reviews(
    limit: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(db_session),
) -> ReviewListResponse:
    """Public list of the latest reviews — newest first.

    Author name is derived from the user's display_name / telegram_username
    so we never leak email addresses. Anonymous fall-back keeps the list
    populated even when a user hasn't set a display name.
    """
    rows = (
        await session.execute(
            select(Review, User)
            .join(User, User.id == Review.user_id)
            .order_by(desc(Review.created_at))
            .limit(limit)
        )
    ).all()

    items: list[ReviewOut] = []
    for review, user in rows:
        items.append(
            ReviewOut(
                id=review.id,
                rating=review.rating,
                text=review.text,
                author=_author_name(user),
                created_at=review.created_at,
            )
        )
    return ReviewListResponse(items=items)


@router.post("", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def create_review(
    body: ReviewCreate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(db_session),
) -> ReviewOut:
    """Authenticated user posts a review. Throttled to one review per minute
    per user so a single account can't flood the public list. Users may still
    post again later to update their opinion; we always show the latest first."""
    text = body.text.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Review text is empty"
        )

    last_at = (
        await session.execute(
            select(func.max(Review.created_at)).where(Review.user_id == user.id)
        )
    ).scalar_one_or_none()
    if last_at is not None and datetime.now(UTC) - last_at < _REVIEW_COOLDOWN:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком часто. Подождите минуту перед следующим отзывом.",
        )

    review = Review(user_id=user.id, rating=body.rating, text=text)
    session.add(review)
    await session.commit()
    await session.refresh(review)

    return ReviewOut(
        id=review.id,
        rating=review.rating,
        text=review.text,
        author=_author_name(user),
        created_at=review.created_at,
    )

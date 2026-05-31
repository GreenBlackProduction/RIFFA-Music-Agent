"""User reviews — list + create endpoints for the profile-page block."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, db_session
from app.db.models import Review, User

router = APIRouter(prefix="/reviews", tags=["reviews"])


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
        author = (
            user.display_name
            or user.telegram_username
            or (user.email.split("@", 1)[0] if user.email else "Аноним")
        )
        items.append(
            ReviewOut(
                id=review.id,
                rating=review.rating,
                text=review.text,
                author=author,
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
    """Authenticated user posts a review. No throttling beyond the DB
    unique key — users can leave multiple reviews if they want to update
    their opinion later; we always show the latest first."""
    text = body.text.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Review text is empty"
        )

    review = Review(user_id=user.id, rating=body.rating, text=text)
    session.add(review)
    await session.commit()
    await session.refresh(review)

    author = (
        user.display_name
        or user.telegram_username
        or (user.email.split("@", 1)[0] if user.email else "Аноним")
    )
    return ReviewOut(
        id=review.id,
        rating=review.rating,
        text=review.text,
        author=author,
        created_at=review.created_at,
    )

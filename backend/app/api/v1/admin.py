"""Admin-only endpoints: user management, promo codes, stats.

All routes here require :func:`admin_user` (i.e. ``user.is_admin == True``).
The frontend exposes a UI for these at ``/admin`` only when the current user
is admin; backend enforcement is still the source of truth.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import admin_user, db_session
from app.db.models import (
    Generation,
    GenerationStatus,
    Promocode,
    PromocodeUsage,
    Referral,
    User,
    WalletTransaction,
)
from app.services.wallet import credit_tokens, deduct_tokens

router = APIRouter(prefix="/admin", tags=["admin"])


# ───────────────────────────── stats ─────────────────────────────────────────


class AdminStats(BaseModel):
    total_users: int
    banned_users: int
    admins: int
    total_generations: int
    completed_generations: int
    active_promocodes: int


@router.get("/stats", response_model=AdminStats)
async def admin_stats(
    _: User = Depends(admin_user),
    session: AsyncSession = Depends(db_session),
) -> AdminStats:
    total_users = (await session.execute(select(func.count(User.id)))).scalar_one()
    banned_users = (
        await session.execute(select(func.count(User.id)).where(User.is_banned.is_(True)))
    ).scalar_one()
    admins = (
        await session.execute(select(func.count(User.id)).where(User.is_admin.is_(True)))
    ).scalar_one()
    total_generations = (await session.execute(select(func.count(Generation.id)))).scalar_one()
    completed_generations = (
        await session.execute(
            select(func.count(Generation.id)).where(
                Generation.status == GenerationStatus.completed
            )
        )
    ).scalar_one()
    active_promocodes = (
        await session.execute(
            select(func.count(Promocode.id)).where(Promocode.is_active.is_(True))
        )
    ).scalar_one()
    return AdminStats(
        total_users=int(total_users),
        banned_users=int(banned_users),
        admins=int(admins),
        total_generations=int(total_generations),
        completed_generations=int(completed_generations),
        active_promocodes=int(active_promocodes),
    )


# ───────────────────────────── users list ────────────────────────────────────


class AdminUserRow(BaseModel):
    id: int
    display_name: str
    email: str | None
    telegram_username: str | None
    telegram_user_id: int | None
    balance_tokens: int
    is_admin: bool
    is_banned: bool
    notice_kind: str | None
    created_at: datetime
    last_seen_at: datetime | None
    morning_messages_enabled: bool
    generations_count: int


class AdminUserList(BaseModel):
    total: int
    users: list[AdminUserRow]


@router.get("/users", response_model=AdminUserList)
async def list_users(
    _: User = Depends(admin_user),
    session: AsyncSession = Depends(db_session),
    q: str | None = Query(default=None, description="Поиск по имени / email / telegram"),
    status: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> AdminUserList:
    base = select(User)
    if q:
        like = f"%{q.lower()}%"
        base = base.where(
            or_(
                func.lower(User.display_name).like(like),
                func.lower(User.email).like(like),
                func.lower(User.telegram_username).like(like),
            )
        )
    if status == "banned":
        base = base.where(User.is_banned.is_(True))
    elif status == "admins":
        base = base.where(User.is_admin.is_(True))
    elif status == "morning_on":
        base = base.where(User.morning_messages_enabled.is_(True))
    elif status == "morning_off":
        base = base.where(User.morning_messages_enabled.is_(False))
    elif status == "email_only":
        base = base.where(User.email.isnot(None), User.telegram_user_id.is_(None))
    elif status == "telegram_only":
        base = base.where(User.telegram_user_id.isnot(None), User.email.is_(None))
    elif status == "active_30d":
        cutoff = datetime.now(UTC) - timedelta(days=30)
        base = base.where(User.last_seen_at >= cutoff)
    elif status == "inactive_30d":
        cutoff = datetime.now(UTC) - timedelta(days=30)
        base = base.where(
            or_(User.last_seen_at < cutoff, User.last_seen_at.is_(None))
        )

    total = (
        await session.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()

    rows = (
        await session.execute(
            base.order_by(User.id.desc()).offset(offset).limit(limit)
        )
    ).scalars().all()

    if not rows:
        return AdminUserList(total=int(total), users=[])

    user_ids = [u.id for u in rows]
    gen_counts = dict(
        (
            await session.execute(
                select(Generation.user_id, func.count(Generation.id))
                .where(Generation.user_id.in_(user_ids))
                .group_by(Generation.user_id)
            )
        ).all()
    )

    return AdminUserList(
        total=int(total),
        users=[
            AdminUserRow(
                id=u.id,
                display_name=u.display_name,
                email=u.email,
                telegram_username=u.telegram_username,
                telegram_user_id=u.telegram_user_id,
                balance_tokens=u.balance_tokens,
                is_admin=u.is_admin,
                is_banned=u.is_banned,
                notice_kind=u.notice_kind,
                created_at=u.created_at,
                last_seen_at=u.last_seen_at,
                morning_messages_enabled=u.morning_messages_enabled,
                generations_count=int(gen_counts.get(u.id, 0)),
            )
            for u in rows
        ],
    )


# ───────────────────────────── user detail ───────────────────────────────────


class GenTypeCount(BaseModel):
    type: str
    count: int


class PromoUsageRow(BaseModel):
    code: str
    tokens_granted: int
    redeemed_at: datetime


class AdminUserDetail(BaseModel):
    id: int
    display_name: str
    email: str | None
    telegram_username: str | None
    telegram_user_id: int | None
    avatar_url: str | None
    locale: str
    balance_tokens: int
    is_admin: bool
    is_banned: bool
    notice_message: str | None
    notice_kind: str | None
    referral_code: str | None
    registration_method: Literal["telegram", "email", "unknown"]
    created_at: datetime
    last_seen_at: datetime | None

    generations_total: int
    generations_by_type: list[GenTypeCount]
    generations_by_status: list[GenTypeCount]

    referred_by_user_id: int | None
    referred_by_code: str | None
    referred_by_name: str | None
    referrals_made: int

    promocodes_used: list[PromoUsageRow]


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(
    user_id: int,
    _: User = Depends(admin_user),
    session: AsyncSession = Depends(db_session),
) -> AdminUserDetail:
    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    if user.telegram_user_id is not None:
        registration_method: Literal["telegram", "email", "unknown"] = "telegram"
    elif user.email is not None:
        registration_method = "email"
    else:
        registration_method = "unknown"

    # generations breakdown ------------------------------------------------------
    type_rows = (
        await session.execute(
            select(Generation.type, func.count(Generation.id))
            .where(Generation.user_id == user_id)
            .group_by(Generation.type)
        )
    ).all()
    status_rows = (
        await session.execute(
            select(Generation.status, func.count(Generation.id))
            .where(Generation.user_id == user_id)
            .group_by(Generation.status)
        )
    ).all()
    generations_total = sum(int(c) for _, c in type_rows)

    # referrals -----------------------------------------------------------------
    referral = (
        await session.execute(
            select(Referral).where(Referral.referred_id == user_id)
        )
    ).scalar_one_or_none()
    referred_by_user_id = referral.referrer_id if referral else None
    referred_by_code: str | None = None
    referred_by_name: str | None = None
    if referred_by_user_id:
        referrer_row = (
            await session.execute(
                select(User.referral_code, User.telegram_username, User.display_name)
                .where(User.id == referred_by_user_id)
            )
        ).one_or_none()
        if referrer_row:
            referred_by_code = referrer_row.referral_code
            referred_by_name = referrer_row.telegram_username or referrer_row.display_name

    referrals_made = int(
        (
            await session.execute(
                select(func.count(Referral.id)).where(Referral.referrer_id == user_id)
            )
        ).scalar_one()
    )

    # promo usages --------------------------------------------------------------
    promo_rows = (
        await session.execute(
            select(Promocode.code, PromocodeUsage.tokens_granted, PromocodeUsage.created_at)
            .join(Promocode, Promocode.id == PromocodeUsage.promocode_id)
            .where(PromocodeUsage.user_id == user_id)
            .order_by(PromocodeUsage.created_at.desc())
        )
    ).all()

    return AdminUserDetail(
        id=user.id,
        display_name=user.display_name,
        email=user.email,
        telegram_username=user.telegram_username,
        telegram_user_id=user.telegram_user_id,
        avatar_url=user.avatar_url,
        locale=user.locale,
        balance_tokens=user.balance_tokens,
        is_admin=user.is_admin,
        is_banned=user.is_banned,
        notice_message=user.notice_message,
        notice_kind=user.notice_kind,
        referral_code=user.referral_code,
        registration_method=registration_method,
        created_at=user.created_at,
        last_seen_at=user.last_seen_at,
        generations_total=generations_total,
        generations_by_type=[GenTypeCount(type=str(t.value if hasattr(t, "value") else t), count=int(c)) for t, c in type_rows],
        generations_by_status=[GenTypeCount(type=str(s.value if hasattr(s, "value") else s), count=int(c)) for s, c in status_rows],
        referred_by_user_id=referred_by_user_id,
        referred_by_code=referred_by_code,
        referred_by_name=referred_by_name,
        referrals_made=referrals_made,
        promocodes_used=[
            PromoUsageRow(code=code, tokens_granted=int(t), redeemed_at=ts)
            for code, t, ts in promo_rows
        ],
    )


# ───────────────────────────── update balance ────────────────────────────────


class BalanceUpdate(BaseModel):
    mode: Literal["set", "add", "subtract"]
    amount: int = Field(ge=0)
    reason: str | None = None


class BalanceUpdateResponse(BaseModel):
    user_id: int
    balance_tokens: int


@router.post("/users/{user_id}/balance", response_model=BalanceUpdateResponse)
async def update_user_balance(
    user_id: int,
    body: BalanceUpdate,
    admin: User = Depends(admin_user),
    session: AsyncSession = Depends(db_session),
) -> BalanceUpdateResponse:
    user = (
        await session.execute(select(User).where(User.id == user_id).with_for_update())
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    reason = body.reason or f"admin:{admin.id}:{body.mode}"
    if body.mode == "set":
        delta = body.amount - user.balance_tokens
        user.balance_tokens = body.amount
        session.add(
            WalletTransaction(
                user_id=user.id,
                amount_tokens=delta,
                reason=reason,
                reference_id=f"admin:{admin.id}",
            )
        )
        await session.flush()
        new_balance = user.balance_tokens
    elif body.mode == "add":
        new_balance = await credit_tokens(
            session, user_id=user.id, amount=body.amount, reason=reason,
            reference_id=f"admin:{admin.id}",
        )
    elif body.mode == "subtract":
        # Negative balance is allowed by deduct_tokens? No — it raises.
        # Admin should be allowed to go negative. Just write directly.
        delta = -body.amount
        user.balance_tokens = max(0, user.balance_tokens - body.amount)
        session.add(
            WalletTransaction(
                user_id=user.id,
                amount_tokens=delta,
                reason=reason,
                reference_id=f"admin:{admin.id}",
            )
        )
        await session.flush()
        new_balance = user.balance_tokens
    else:  # pragma: no cover — Literal already constrains.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unknown mode")

    await session.commit()
    return BalanceUpdateResponse(user_id=user.id, balance_tokens=new_balance)


# unused fix-up — keep deduct_tokens used so ruff doesn't strip the import
_ = deduct_tokens


# ───────────────────────────── user generations log ─────────────────────────


class AdminGenRow(BaseModel):
    id: str
    type: str
    status: str
    title: str
    cost_tokens: int
    error_message: str | None
    created_at: datetime


@router.get("/users/{user_id}/generations", response_model=list[AdminGenRow])
async def list_user_generations(
    user_id: int,
    limit: int = Query(default=30, le=100),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(admin_user),
    session: AsyncSession = Depends(db_session),
) -> list[AdminGenRow]:
    rows = (
        await session.execute(
            select(Generation)
            .where(Generation.user_id == user_id)
            .order_by(Generation.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return [
        AdminGenRow(
            id=str(g.id),
            type=g.type.value,
            status=g.status.value,
            title=g.title or "",
            cost_tokens=g.cost_tokens,
            error_message=g.error_message,
            created_at=g.created_at,
        )
        for g in rows
    ]


# ───────────────────────────── notice / ban ──────────────────────────────────


class NoticeSet(BaseModel):
    kind: Literal["ban", "warning"]
    message: str = Field(min_length=1, max_length=2000)


class NoticeResponse(BaseModel):
    user_id: int
    is_banned: bool
    notice_kind: str | None
    notice_message: str | None


@router.post("/users/{user_id}/notice", response_model=NoticeResponse)
async def set_user_notice(
    user_id: int,
    body: NoticeSet,
    admin: User = Depends(admin_user),
    session: AsyncSession = Depends(db_session),
) -> NoticeResponse:
    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    if user.id == admin.id and body.kind == "ban":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="нельзя забанить себя")

    user.notice_kind = body.kind
    user.notice_message = body.message.strip()
    user.is_banned = body.kind == "ban"
    session.add(user)
    await session.commit()
    return NoticeResponse(
        user_id=user.id,
        is_banned=user.is_banned,
        notice_kind=user.notice_kind,
        notice_message=user.notice_message,
    )


@router.delete("/users/{user_id}/notice", response_model=NoticeResponse)
async def clear_user_notice(
    user_id: int,
    _: User = Depends(admin_user),
    session: AsyncSession = Depends(db_session),
) -> NoticeResponse:
    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    user.notice_kind = None
    user.notice_message = None
    user.is_banned = False
    session.add(user)
    await session.commit()
    return NoticeResponse(
        user_id=user.id,
        is_banned=user.is_banned,
        notice_kind=None,
        notice_message=None,
    )


# ───────────────────────────── promocodes ────────────────────────────────────


class PromocodeRow(BaseModel):
    id: int
    code: str
    tokens: int
    max_uses: int
    used_count: int
    is_active: bool
    expires_at: datetime | None
    created_at: datetime


class PromocodeCreate(BaseModel):
    code: str = Field(min_length=3, max_length=32)
    tokens: int = Field(ge=1, le=1_000_000)
    max_uses: int = Field(default=0, ge=0)
    expires_at: datetime | None = None


class PromocodeUpdate(BaseModel):
    is_active: bool | None = None
    tokens: int | None = Field(default=None, ge=1, le=1_000_000)
    max_uses: int | None = Field(default=None, ge=0)
    expires_at: datetime | None = None


@router.get("/promocodes", response_model=list[PromocodeRow])
async def list_promocodes(
    _: User = Depends(admin_user),
    session: AsyncSession = Depends(db_session),
) -> list[PromocodeRow]:
    rows = (
        await session.execute(select(Promocode).order_by(Promocode.created_at.desc()))
    ).scalars().all()
    return [
        PromocodeRow(
            id=p.id,
            code=p.code,
            tokens=p.tokens,
            max_uses=p.max_uses,
            used_count=p.used_count,
            is_active=p.is_active,
            expires_at=p.expires_at,
            created_at=p.created_at,
        )
        for p in rows
    ]


@router.post("/promocodes", response_model=PromocodeRow, status_code=status.HTTP_201_CREATED)
async def create_promocode(
    body: PromocodeCreate,
    _: User = Depends(admin_user),
    session: AsyncSession = Depends(db_session),
) -> PromocodeRow:
    normalized = body.code.strip().upper()
    existing = (
        await session.execute(select(Promocode).where(Promocode.code == normalized))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Промокод с таким кодом уже существует",
        )
    promo = Promocode(
        code=normalized,
        tokens=body.tokens,
        max_uses=body.max_uses,
        used_count=0,
        is_active=True,
        expires_at=body.expires_at,
    )
    session.add(promo)
    await session.commit()
    await session.refresh(promo)
    return PromocodeRow(
        id=promo.id,
        code=promo.code,
        tokens=promo.tokens,
        max_uses=promo.max_uses,
        used_count=promo.used_count,
        is_active=promo.is_active,
        expires_at=promo.expires_at,
        created_at=promo.created_at,
    )


@router.patch("/promocodes/{promo_id}", response_model=PromocodeRow)
async def update_promocode(
    promo_id: int,
    body: PromocodeUpdate,
    _: User = Depends(admin_user),
    session: AsyncSession = Depends(db_session),
) -> PromocodeRow:
    promo = (
        await session.execute(select(Promocode).where(Promocode.id == promo_id))
    ).scalar_one_or_none()
    if promo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="promocode not found")
    if body.is_active is not None:
        promo.is_active = body.is_active
    if body.tokens is not None:
        promo.tokens = body.tokens
    if body.max_uses is not None:
        promo.max_uses = body.max_uses
    if body.expires_at is not None:
        promo.expires_at = body.expires_at
    session.add(promo)
    await session.commit()
    await session.refresh(promo)
    return PromocodeRow(
        id=promo.id,
        code=promo.code,
        tokens=promo.tokens,
        max_uses=promo.max_uses,
        used_count=promo.used_count,
        is_active=promo.is_active,
        expires_at=promo.expires_at,
        created_at=promo.created_at,
    )


# silence "imported but unused" for UTC if route logic ever changes
_ = UTC

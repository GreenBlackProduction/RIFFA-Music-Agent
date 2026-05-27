"""Generation model — every Suno/OpenAI/NanoBanana run is tracked here."""

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class GenerationType(str, enum.Enum):
    song = "song"
    instrumental = "instrumental"
    occasion = "occasion"
    sound_effect = "sound_effect"
    cover_art = "cover_art"
    cover_song = "cover_song"
    lyrics = "lyrics"
    extend = "extend"
    wav_convert = "wav_convert"


class GenerationStatus(str, enum.Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class GenerationRating(str, enum.Enum):
    like = "like"
    dislike = "dislike"


class Generation(Base, TimestampMixin):
    """A single generation request submitted to the worker queue."""

    __tablename__ = "generations"

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    type: Mapped[GenerationType] = mapped_column(
        Enum(GenerationType, name="generation_type"), nullable=False
    )
    status: Mapped[GenerationStatus] = mapped_column(
        Enum(GenerationStatus, name="generation_status"),
        default=GenerationStatus.queued,
        nullable=False,
    )
    source: Mapped[str] = mapped_column(String(16), default="web", nullable=False)

    title: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    prompt: Mapped[str] = mapped_column(Text, default="", nullable=False)
    model: Mapped[str] = mapped_column(String(64), default="", nullable=False)

    genre: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mood: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tempo: Mapped[str | None] = mapped_column(String(32), nullable=True)
    vocal: Mapped[str | None] = mapped_column(String(32), nullable=True)

    cost_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    error_message: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Suno task reference (needed for extend / WAV convert on completed gens)
    suno_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Sharing
    share_id: Mapped[str | None] = mapped_column(
        String(16), unique=True, nullable=True, index=True
    )
    share_views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # User rating of their own generation (for prompt-engineering feedback)
    rating: Mapped[str | None] = mapped_column(
        Enum(GenerationRating, name="generation_rating"), nullable=True
    )

    # Public radio
    is_public: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="0"
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Legacy: index of the single published variant (0 = V1, 1 = V2).
    # Kept for backward-compat; new code reads published_track_indices.
    published_track_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # New: list of variant indices currently on Radio, e.g. [0], [0, 1].
    # NULL → fall back to published_track_index semantics.
    published_track_indices: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    # Soft-delete: set to now() when user moves to trash; hard-deleted after 7 days.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    play_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    dislike_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, server_default="0"
    )
    # Per-track stats for Radio: {"0": {"likes": N, "dislikes": N, "plays": N}, "1": {...}}.
    # Keys are stringified track indices (JSON limitation). The gen-level
    # like_count / dislike_count / play_count above remain as legacy mirrors —
    # the sum across all keys here.
    track_stats: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=False, server_default="{}"
    )

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_generations_user_created", "user_id", "created_at"),
        Index("ix_generations_status_created", "status", "created_at"),
        Index("ix_generations_user_type", "user_id", "type"),
        Index("ix_generations_public_published", "is_public", "published_at"),
    )


class RadioVote(Base):
    """Per-user vote (like/dislike) on a public Radio track."""

    __tablename__ = "radio_votes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    generation_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("generations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Which track variant (0 = V1, 1 = V2) of the generation this vote
    # applies to. A user can vote V1 and V2 independently.
    track_index: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, server_default="0"
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vote: Mapped[GenerationRating] = mapped_column(
        Enum(GenerationRating, name="generation_rating"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "generation_id", "user_id", "track_index",
            name="uq_radio_votes_generation_user_track",
        ),
    )

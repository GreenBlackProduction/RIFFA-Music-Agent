"""Self-learned genre presets — web-researched styles outside GENRE_STYLES.

When a user asks for a genre that neither the static preset library nor the
hybrid blender can resolve, the pipeline researches it once (Perplexity) and
persists the result here. From then on the phrase behaves like a normal
preset for every user — the style base grows itself.
"""

from typing import Any

from sqlalchemy import JSON, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class LearnedGenre(Base, TimestampMixin):
    __tablename__ = "learned_genres"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Normalized lookup key (lowercase, collapsed whitespace, no punctuation).
    phrase_key: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    # The phrase as the user wrote it — for admin/debug readability.
    display: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    # Comma-joined style fragments, same shape as GENRE_STYLES[key]["style"].
    style: Mapped[str] = mapped_column(Text, nullable=False)
    weight: Mapped[float] = mapped_column(Float, default=0.85, nullable=False)
    constraint_val: Mapped[float] = mapped_column(Float, default=0.35, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # Raw research payload (instruments, bpm_range, parent, tags…) for audits.
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

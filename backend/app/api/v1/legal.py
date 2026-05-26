"""Legal documents (offer / privacy / license / refund).

Served as plain UTF-8 text from /root/backend/app/legal/*.txt.
Frontend fetches per-slug to render in the acceptance modal and
on the public /legal/<slug> pages.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.config import Settings, get_settings

router = APIRouter(prefix="/legal", tags=["legal"])

_LEGAL_DIR: Path = Path(__file__).resolve().parents[2] / "legal"

# slug → (filename, human title)
_DOCS: dict[str, tuple[str, str]] = {
    "offer":     ("offer.txt",     "Публичная оферта"),
    "privacy":   ("privacy.txt",   "Политика конфиденциальности"),
    "license":   ("copyright.txt", "Лицензия на треки"),
    "refund":    ("refund.txt",    "Политика возврата"),
}


class LegalDocument(BaseModel):
    slug: str
    title: str
    version: str
    body: str


class LegalIndex(BaseModel):
    version: str
    documents: list[dict[str, str]]


@router.get("", response_model=LegalIndex)
def list_documents(settings: Settings = Depends(get_settings)) -> LegalIndex:
    """Return the list of available legal documents and the current bundle version."""
    return LegalIndex(
        version=settings.legal_terms_version,
        documents=[
            {"slug": slug, "title": title}
            for slug, (_filename, title) in _DOCS.items()
        ],
    )


@router.get("/{slug}", response_model=LegalDocument)
def get_document(slug: str, settings: Settings = Depends(get_settings)) -> LegalDocument:
    entry = _DOCS.get(slug)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="unknown_document")
    filename, title = entry
    path = _LEGAL_DIR / filename
    try:
        body = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="document_text_missing",
        ) from exc
    return LegalDocument(slug=slug, title=title, version=settings.legal_terms_version, body=body)

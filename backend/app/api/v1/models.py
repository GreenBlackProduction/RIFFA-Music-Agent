"""Model catalog — what generation engines are available to the user."""

from typing import Any

from fastapi import APIRouter

router = APIRouter(prefix="/models", tags=["models"])


MODEL_CATALOG: dict[str, list[dict[str, Any]]] = {
    "music": [
        {
            "id": "suno-v5",
            "name": "Suno V5",
            "description": "Быстрая музыкальная генерация",
            "cost_tokens": 2,
        },
        {
            "id": "suno-v5-5",
            "name": "Suno V5.5",
            "description": "Более качественная генерация музыки",
            "cost_tokens": 3,
        },
    ],
    "lyrics": [
        {
            "id": "gpt-4o",
            "name": "GPT-4o",
            "description": "Тексты песен и умные промпты",
            "cost_tokens": 0,
        },
        {
            "id": "gpt-4o-premium",
            "name": "GPT-4o Premium Prompt",
            "description": "Более детальная проработка структуры песни",
            "cost_tokens": 1,
        },
    ],
    "cover": [
        {
            "id": "nano-banana",
            "name": "Nano Banana Basic",
            "description": "Быстрая обложка 1:1",
            "cost_tokens": 1,
        },
        {
            "id": "nano-banana-pro",
            "name": "Nano Banana Pro",
            "description": "Более профессиональное качество изображения",
            "cost_tokens": 2,
        },
    ],
    "sound_effect": [
        {
            "id": "suno-sfx-v5",
            "name": "Suno Sound Effects",
            "description": "Звуковые эффекты и короткие аудио",
            "cost_tokens": 1,
        }
    ],
}


@router.get("")
def list_models() -> dict[str, list[dict[str, Any]]]:
    """Return the static model catalog."""
    return MODEL_CATALOG

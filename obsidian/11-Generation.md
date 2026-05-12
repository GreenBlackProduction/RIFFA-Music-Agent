---
type: documentation
category: feature
tags: [generation, suno, music, ai]
related: [[11-Generation]], [[12-Agent]], [[40-Quick-Start]]
---

# Генерация контента (Suno)

## Модули генерации

### 1. Песня (Song)

**Эндпоинт:** `POST /api/v1/generate/song`

**Параметры:**
```json
{
  "description": "Описание песни",
  "text_mode": "ai" | "custom" | "none",
  "lyrics": "Текст песни (если custom)",
  "genre": "Pop",
  "custom_genre": "Альтернативный жанр",
  "mood": "happy",
  "tempo": "medium",
  "vocal": "male",
  "track_name": "Название трека"
}
```

**Стоимость:** 2 токена

**Особенности:**
- Lyrics-first flow: [[11-Generation#Lyrics Flow|см. ниже]]
- 36 жанров, 12 настроений, 5 темпов
- GPT-4o промт-инжиниринг

### 2. Инструментал (Instrumental)

**Эндпоинт:** `POST /api/v1/generate/instrumental`

**Пресеты:**
- 😴 Для сна (Ambient, dreamy, very_slow)
- ☕ Для кафе (Jazz, calm, slow)
- 💻 Для работы (Lofi, calm, slow)
- 🚗 Для поездки (Synthwave, confident, medium)
- 🧘 Для медитации (Ambient, calm, very_slow)
- 🎬 Для контента (Cinematic, inspiring, medium)
- 💪 Тренировка (EDM, energetic, fast)
- 🎮 Для игр (Electronic, energetic, fast)
- 🎨 Творчество (Downtempo, dreamy, medium)

**Стоимость:** 2 токена

### 3. Звуковой эффект (SFX)

**Эндпоинт:** `POST /api/v1/generate/sound_effect`

**Параметры:**
```json
{
  "prompt": "Описание звука",
  "track_name": "Название (опционально)"
}
```

**Стоимость:** 1 токен

**Автоназвание:** `{prompt} (RIFFA)`

### 4. Кавер (Cover Song)

**Эндпоинт:** `POST /api/v1/generate/cover_song`

**Параметры:**
```json
{
  "source_audio_url": "https://...",
  "description": "Описание стиля",
  "track_name": "Название"
}
```

**Стоимость:** 2 токена

**Upload pipeline:** [[31-In-Progress#Upload Pipeline|В разработке]]

### 5. Обложка (Cover Art)

**Эндпоинт:** `POST /api/v1/generate/cover_art`

**Модели:**
- Nano Banana (1 токен, 1-10 сек)
- Nano Banana 2 (2 токена, 10-30 сек)
- Nano Banana Pro (3 токена, 30-60 сек)

**Статус:** [[31-In-Progress#Cover Art|В разработке]]

## Lyrics-first Flow {#Lyrics Flow}

### State Machine

```
idle → generating → review → approved
```

**Компонент:** `SongModule` в `StudioPage.tsx`

### Шаги

1. **idle** — пользователь вводит тему
2. **generating** — вызов `POST /api/v1/lyrics`
3. **review** — показ текста, кнопки "Одобрить" / "Переписать"
4. **approved** — разблокировка параметров (жанр, настроение, темп)

### API

```http
POST /api/v1/lyrics
Content-Type: application/json

{
  "topic": "Летняя любовь",
  "genre": "Pop",
  "mood": "happy",
  "tempo": "medium",
  "vocal": "female",
  "language": "ru"
}
```

**Ответ:**
```json
{
  "lyrics": "[Verse 1]\n...\n[Chorus]\n...",
  "enriched_prompt": "Upbeat pop song with..."
}
```

**Особенность:** Suno генерирует текст, GPT-4o только обогащает промпт.

## GPT-4o Промт-инжиниринг

### Функция

```python
LyricsClient.enrich_music_prompt(
    genre="Pop",
    mood="happy",
    tempo="medium",
    vocal="male",
    description="Summer love song"
)
```

### Профили

**36 жанров:**
Pop, Rock, Hip-Hop, Jazz, Electronic, Classical, Country, R&B, Reggae, Blues, Metal, Folk, Indie, Punk, Soul, Funk, Disco, House, Techno, Trance, Dubstep, Drum and Bass, Ambient, Downtempo, Trip-Hop, Synthwave, Vaporwave, Lo-fi, Chillwave, Trap, Grime, Afrobeat, Bossa Nova, Flamenco, Klezmer, Gamelan

**12 настроений:**
happy, sad, energetic, calm, romantic, melancholic, confident, dreamy, angry, mysterious, playful, nostalgic

**5 темпов:**
very_slow, slow, medium, fast, very_fast

### Адаптивная длина

- Минимум: 150 символов
- Максимум: 4500 символов
- Fallback: детерминистский `build_suno_style`

## Suno API

### Версия

**V5.5** — текущая версия API

### Лимиты

```python
# backend/app/services/suno.py
style[:1000]   # максимум 1000 символов
prompt[:5000]  # максимум 5000 символов
title[:80]     # максимум 80 символов
```

### Защита от имён артистов

**Проблема:** Suno отвергает запросы с именами артистов ("dua lipa")

**Решение (тройная защита):**
1. Правило в системном промпте [[12-Agent|агента]]
2. Правило в `_SYS_ENRICH_MUSIC` с примерами конвертации
3. `_strip_artist_names()` — regex-фильтр 60+ артистов

### Логирование

**Файл:** `backend/logs/generations.log`

**Формат:**
```json
{
  "timestamp": "2026-05-11T10:00:00Z",
  "generation_id": "uuid",
  "payload": {
    "prompt": "...",
    "style": "...",
    "title": "..."
  }
}
```

**Ротация:** 10MB, 7 дней

## WebSocket Progress

**URL:** `ws://localhost:8000/ws/progress/{generation_id}`

**События:**
```json
{"status": "queued"}
{"status": "processing", "progress": 50}
{"status": "completed", "result": {...}}
{"status": "failed", "error": "..."}
```

## Arq Worker

**Запуск:** через `start-all.ps1` (префикс `[WORK]`)

**Задачи:**
- `generate_song_task`
- `generate_instrumental_task`
- `generate_sfx_task`
- `generate_cover_task`
- `generate_cover_art_task`

**Конфигурация:** `backend/app/worker.py`

## Admin God Mode

**Особенность:** Токены не списываются для admin

**Реализация:**
```python
# backend/app/api/v1/generate.py
if not user.is_admin:
    await _check_balance(session, user, cost)
```

См. [[10-Authentication#Admin God Mode|Подробнее]]

## Тестирование

```bash
cd backend
pytest tests/test_suno.py -v
pytest tests/test_lyrics.py -v
```

## Troubleshooting

### Воркер не запускается

**Проблема:** `arq` не поддерживает `--env-file`

**Решение:** `config.py` автоматически находит `.env.dev`

### Style > 1000 символов

**Ошибка:** Suno API отвергает

**Решение:** Жёсткий клампинг в `suno.py`

### Имена артистов в промпте

**Ошибка:** Suno отвергает запросы

**Решение:** Тройная защита (см. выше)

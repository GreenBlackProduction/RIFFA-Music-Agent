# AGENT-INTEGRATION-PLAN.md — внедрение Perplexity-грунтинга (веб-поиск артиста)

> Составлен 2026-06-05. **Цель:** встроить веб-поиск артиста (Perplexity `sonar` через
> OpenRouter) как «шаг исследования» перед промт-инженером — чтобы агент не выдумывал
> и не хватал рандомный матч, а **находил, понимал и при сомнении переспрашивал**.
>
> Дополняет `AGENT-PLAN.md` (исходный разбор) и `AGENT-ANALYSIS.md` (findings).

## 0. Старт сессии (RIFFA-протокол)
1. Прочитать `GUIDE.md`, **этот файл**, `MEMORY.md` и память `project_riffa_*`.
2. `git status` + `git log -8` на `main`.
3. Хвосты (см. §6): непушенные коммиты (SSH-ключ ждёт добавления в GitHub), DB backup.

---

## 1. Что УЖЕ сделано этой сессией — НЕ переделывать

- ✅ **Fix #1 — проверка релевантности матча** (LIVE, закоммичено: `fix(agent): reject irrelevant Deezer reference matches`).
  Файл `backend/app/services/track_reference.py`: добавлен `_name_matches_result()` + проверка в `resolve_reference` — для plain-name (НЕ URL) матч отклоняется, если <½ слов запроса встречаются в `"artist title"`.
  Проверено: «денис грязь» → `None` (раньше → «Марина Кацуба — Балаган нищеты»!); Daft Punk / Burial / Boards of Canada / Radiohead-Creep / **Кино** → корректно (кириллица не ломается).

- ✅ **OpenRouter подключён.** `OPENROUTER_API_KEY` лежит в `/root/backend/.env` (gitignored, рядом с `LASTFM_API_KEY`).
  ⚠️ Был **задвоен префикс** (`sk-or-v1-sk-or-v1-…`, 82 симв) — исправлено до 73 симв. Если ключ перевставляли — проверь: **один** `sk-or-v1-`, длина 73, `curl -H "Authorization: Bearer $KEY" https://openrouter.ai/api/v1/auth/key` → **200**.

- ✅ **Perplexity `sonar` провалидирован** живым зондом. Результаты:
  - **«денис грязь»** → «Денис Астапов, фронтмен белорусской альт-хип-хоп группы **Грязь**»; genre=alternative hip-hop, era 2010s-2020s, BPM 70-110, mood dark/introspective/raw, похожие ЛСП/Oxxxymiron/PHARAOH; **3.9с, ~$0.006, confidence 0.96**. (Deezer тут давал мусор, gpt-4o — «не знаю».)
  - **Daft Punk** → Electronic/House/French house, 110-130 BPM, confidence 0.99.
  - Зонд сохранён: **`/root/agent_perplexity_probe.py`** (в `/tmp` может пропасть).
    Запуск: `KEY=$(grep '^OPENROUTER_API_KEY=' /root/backend/.env|cut -d= -f2-|tr -d '"\r'|xargs); docker cp /root/agent_perplexity_probe.py ops-backend-1:/tmp/probe.py; docker exec -e OPENROUTER_API_KEY="$KEY" -e PPLX_BASE_URL="https://openrouter.ai/api/v1" -e PPLX_MODEL="perplexity/sonar" ops-backend-1 python /tmp/probe.py "денис грязь" "Daft Punk"`

> Также этой сессией (не про грунтинг, но LIVE+коммичено): **Part B #7** (инструментал — жёсткое «no vocals» в `lyrics.py`) и **#12** (`cover_art` убраны из «последних треков»).

---

## 2. Цель — к какому результату прийти

Имя артиста текстом (вкл. **нишевых / кириллицу**) → грунтинг через Perplexity → **структурный бриф для Suno** (genre, era, BPM, mood, instruments, production, similar).
- `confidence ≥ 0.8` и не `ambiguous` → агент берёт бриф и идёт дальше.
- иначе → **СПРАШИВАЕТ** («Нашёл X — он? / дай ссылку»), а НЕ коммитит. ← это и есть «мышление».
- **Ссылка** (Spotify/YT/Deezer) → Deezer (точный BPM), как сейчас.
- Бриф доезжает до промт-инженера; имена вырезаются (`strip_artist_references`), **стиль сохраняется**.
- Стоимость/латентность под контролем (max_tokens + кэш + индикатор «ищу…»).

---

## 3. Пошаговый план (с чего стартовать)

### Шаг 1 — Конфиг (5 мин)
`backend/app/core/config.py`: добавить `openrouter_api_key: str = ""` рядом с `lastfm_api_key`.
Проверка: `docker exec ops-backend-1 python -c "from app.core.config import get_settings as g; print(bool(g().openrouter_api_key))"` → `True` (после `--force-recreate`, т.к. env).

### Шаг 2 — Новый сервис `backend/app/services/artist_research.py` (~60 строк)
```python
async def research_reference(query: str, *, settings) -> dict | None
```
- `AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=settings.openrouter_api_key)`,
  `model="perplexity/sonar"`, `temperature=0.2`, **`max_tokens=800`** (ОБЯЗАТЕЛЬНО, иначе 402).
- Промт (проверенный, из зонда) — просит ТОЛЬКО JSON:
  ```
  You are a music researcher. Search the web for the artist/track reference below and
  return ONLY raw JSON, no markdown, with these keys:
  {"matched": "<who you think it is and why>", "confidence": <0.0-1.0>,
   "ambiguous": <true if the name could be several different artists>,
   "genre": "", "subgenres": [], "era": "<e.g. 2010s>", "bpm_range": "",
   "mood": [], "key_instruments": [], "production_style": "",
   "similar_artists": [], "note": "<if you are NOT sure which artist, say so plainly>"}
  If you cannot reliably identify the artist, set confidence low and ambiguous true.
  Reference: <query>
  ```
- Парсить JSON лениво (срезать markdown-фенсы, `json.loads`, на ошибке → `None`).
- Маппинг в нашу схему: `genre`→`canonical_genre`; `era` как есть; из `bpm_range` взять середину → `bpm` и `bpm_to_tempo()` (обе утилиты в `track_reference.py`); `tags` = очищенные `subgenres`+`mood`.
- Вернуть `{artist, title:"", confidence, ambiguous, genre, era, tempo, bpm, tags, similar, production, note, source:"perplexity"}`.
- **Кэш** по нормализованному `query` (простой dict+TTL в модуле, или Redis). **Fail-safe:** любая ошибка → `None`.

### Шаг 3 — Проводка в `/classify` (`agent.py::agent_classify`, блок референса ~2166-2206)
- URL vs имя: `detect_reference_url(message)` → если URL, оставить Deezer `resolve_reference` (точный BPM). Иначе, если `parsed["reference_query"]` (имя) → `research_reference(...)`.
- `confidence ≥ 0.8` и не `ambiguous` → заполнить `slots.genre/tempo` + `era`/`suggested_bpm` + `reference` из брифа Perplexity.
- иначе → НЕ фиксировать; вернуть `reference_uncertain=True` + кандидат (`matched`/`note`).
- Perplexity вернул `None` → fallback на relevance-gated Deezer.
- Расширить `AgentClassifyResponse`: `reference_confidence: float = 0`, `reference_note: str = ""`, `reference_uncertain: bool = False`.

### Шаг 4 — Проводка в чат-грунтинг (`agent.py::_reference_facts`, работает в `/chat` и `/chat/stream`)
- Для имён — `research_reference` вместо/поверх `resolve_reference`; в ноту `REFERENCE DATA (...)` класть бриф Perplexity (genre/era/mood/instruments/similar).
- Низкая уверенность → нота `REFERENCE LOOKUP: не уверен (кандидат X) — переспроси пользователя, не выдумывай`.

### ✅ Шаг 5 — UX подтверждения (фронт `AgentChat.tsx::classifyAndRoute` ~560-622)
- При `reference_uncertain` → перед фиксацией показать чип-вопрос: «Нашёл: {note} — это он? [Да] [Дать ссылку] [Другой]». «Да» → применить бриф; иначе ждать ввод/ссылку.
- При уверенном — как сейчас (показать reference + теги).
- Опц.: индикатор «🔎 ищу информацию об артисте…» на время вызова (4-6с).

### Шаг 6 — Промт-инженер
- Убедиться, что `genre/mood/key_instruments/production` из брифа попадают в `music_params` + `research_notes` и используются в `lyrics.py::enrich_music_prompt` / `prompt_engineering.py`. `strip_artist_references` по-прежнему режет имена (Suno реджектит) — но СТИЛЬ сохраняем.

### Шаг 7 — Тесты (прогнать зондом + вживую)
Набор: денис грязь · Daft Punk · неоднозначное имя (тёзки) · опечатка · Spotify/YT-ссылка · немузыкальный ввод. Зафиксировать: грунтит? спрашивает при сомнении? не выдумывает? BPM/жанр вменяемые?

---

## 4. Definition of done
- [ ] Имя артиста (нишевый/кириллица) → бриф Perplexity, без конфабуляции.
- [ ] `confidence<0.8`/`ambiguous` → агент спрашивает, не коммитит.
- [ ] Ссылка → Deezer точный BPM (как сейчас).
- [ ] Бриф доезжает до Suno; имена вырезаны, стиль сохранён.
- [ ] `max_tokens` задан на всех вызовах; кэш работает; «ищу…» индикатор.
- [ ] Тест-набор зелёный, включая «денис грязь».

## 5. Граблии (держать в голове)
- ⚠️ **`max_tokens` ОБЯЗАТЕЛЕН** на вызовах Perplexity/OpenRouter (иначе 402 — резервирует 65536 токенов).
- ⚠️ OpenRouter ключ: один `sk-or-v1-`, 73 символа. Валидация — эндпоинт `/api/v1/auth/key` → 200.
- ⚠️ Perplexity отдаёт **BPM-диапазон**, не точное число → брать середину → `bpm_to_tempo`.
- ⚠️ Следить за **балансом OpenRouter** (402 при нехватке кредитов). $5 ≈ ~800 поисков.
- Deezer (relevance-gated) — оставить как дешёвый fallback, не выпиливать.
- `response_format=json_object` у Perplexity через OpenRouter может не поддерживаться — поэтому просим JSON в промте и парсим лениво (как в зонде).

## 6. Хвосты сессии (не забыть)
- **Непушенные коммиты на `main`** — проверь `git log --oneline origin/main..main`. SSH deploy-ключ (`riffa-server-deploy`, лежит в `~/.ssh/`) **ждёт добавления в GitHub** (Settings → SSH keys). После — `ssh -T git@github.com` + `git push origin main`.
- **Part B осталось:** #8 (label «Итоговый prompt» — по модулю: Suno·музыка / Suno·SFX / Nano-Banana·обложка), #9 (прогресс-бар по типу генерации), #10 (разрешение обложки 1024→2048/pro?), #11 (Enhance — сохранять композицию + зашить исходный image-промт). Детали в `AGENT-PLAN.md` §8-11.
- **DB backup** `gen_title_bak_20260605` — удалить, когда owner подтвердит, что треки ок.

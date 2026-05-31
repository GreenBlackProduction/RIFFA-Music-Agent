# Agent + Prompt Engineering — Upgrade Plan

Living doc. **Phase 1 + гибридный трек A–D + #2 + #1 = в проде.**

**Shipped 2026-05-31 (эта сессия):**
- Гибридный классификатор **A–D** (скрипт-визард, канонический жанр, детерм. финализация, GPT-fallback).
- **#2 Редактор брифа** — правка genre/mood/tempo/вокал/тема перед запуском.
- **#1 Референсы треков — через Deezer** (Spotify после ноя-2024 не даёт BPM новым app). «сделай как X» / ссылка Deezer·Spotify·YouTube → реальный BPM/жанр/эра в `build_suno_style`. `services/track_reference.py`.
- **Отложено пользователем:** Phase E (телеметрия), #6 (профиль вкуса), #9 (дашборд).
- **Следующее:** Phase 4 — **era-инструменты по жанрам** (genre×era specific).

См. также: [REDESIGN-PLAN.md](REDESIGN-PLAN.md), [GUIDE.md](GUIDE.md), `/root/.claude/projects/-root/memory/`.

---

## Phase 1 — Quick wins (DONE ✓)

Commit: `<branch main>` — поиск по «feat(agent): streaming + model routing + self-critique».

| # | Что сделано |
|---|---|
| #8 Prompt versioning | `AGENT_PROMPT_VERSION = "v3.1"` в [agent.py](backend/app/api/v1/agent.py). Поле `prompt_version` + `model` в `AgentChatResponse`. Frontend echoes back на launch через `agent_prompt_version` / `agent_model` в `GenerateRequest`. Каждая генерация в БД теперь знает версию промта и модель. |
| #7 Self-critique | Новая секция «SELF-CRITIQUE on done=true (REQUIRED)» в системном промте. Агент обязан в `intent.note` написать «Запущу X. Я предположил Y, Z — поправь если нужно». 3 worked examples в промте. |
| #5 Model routing | `_pick_model(messages)` маршрутизирует chitchat→gpt-4o-mini, brief-shaping→gpt-4o. `_COMMIT_MARKERS` (~80 терминов) ловит genre/module/imperative/lyrics. История ≥4 turns → 4o. Ожидаемая экономия ~60% на исследовательских ходах. |
| #4 Streaming | Новый endpoint `POST /api/v1/agent/chat/stream` (SSE). События: `reply` (delta) → `complete` (полный JSON). На фронте `streamAgentChat()` + AsyncGenerator в [client.ts](frontend/src/lib/api/client.ts). `AgentChat.tsx` streaming-first с fallback на `agentChat()` на любых SSE-ошибках. Nginx: `X-Accel-Buffering: no` в headers респонса. |

**Файлы:**
- `backend/app/api/v1/agent.py` — версия, _pick_model, _postprocess_agent_reply, _stream_agent_completion, /chat/stream endpoint
- `backend/app/api/v1/generate.py` — agent_prompt_version + agent_model в каждом Request body
- `frontend/src/lib/api/client.ts` — AgentChatResponse extended, streamAgentChat() generator
- `frontend/src/components/studio/AgentChat.tsx` — streaming-first sendMessage с fallback
- `frontend/src/pages/StudioPage.tsx` — прокидка promptVersion/model в launch

---

## Hybrid classifier track (Phase A–E) — снижение GPT-вызовов

Отдельный трек: «минимизировать обработку ответов через ChatGPT». Типичные
параметрические запросы идут по заскриптованным чипам без GPT; нетипичные
(vague / артист / ниша / кастомный текст / occasion / image / cover) — в полный
GPT-поток. Приоритет пользователя: **качественные промты в Suno** — рычаг
качества это канонический `genre` (точный ключ `GENRE_STYLES`).

| Фаза | Статус | Что |
|---|---|---|
| **A** Классификатор | ✅ **задеплоен** (restart `ops-backend-1`, 2026-05-31) | `services/genre_canonical.py` (RU/EN→каноника), `POST /agent/classify` (gpt-4o-mini, temp 0.1, json) → `module` + слоты + флаги (`needs_lyrics/artist_ref/obscure_genre/too_vague`). Safe-fallback `too_vague=true`. Файлы `agent.py`+`genre_canonical.py` лежат в writable-слое контейнера (поверх образа 29.05) → переживают restart/reboot, теряются только при `--force-recreate`/`build` (тогда фронт деградирует). |
| **B** Скрипт-визард | ✅ код + **задеплоен на прод** (2026-05-31), `/classify` = 401 (live) | `client.ts: classifyAgent()` + типы. `AgentChat.tsx`: первый ход → classify; genre-чипы с **каноническими** значениями (`GENRE_STYLES` keys); пропуск уже извлечённых слотов; роутинг scriptable={song,instrumental,sfx} vs GPT-fallback. **Скрипт-путь активен.** Graceful degrade сохраняется на случай потери writable-слоя. |
| **C** Детерм. финализация | ✅ код | `finalizeDeterministic()` — `intent`+`music_params` строятся на клиенте, **0 GPT**. Качество держит серверный `enrich_music_prompt`(GPT-4o)+`build_suno_style` на запуске. song→`text_mode=ai` (Suno пишет текст). `promptVersion="v3.1-scripted"`. |
| **D** GPT-fallback | ✅ переиспользует существующий поток | needs_lyrics/artist_ref/obscure_genre/too_vague/occasion/cover → `sendInternal` (streaming). Слоты классификатора прокидываются в `selected_*`. |
| **E** Телеметрия | ⏳ TODO | счётчик GPT-вызовов до/после; `model="scripted"` уже различает путь. |

**Deploy-статус (исправлено 2026-05-31):** `/classify` оживлён рестартом
`ops-backend-1` — код агента уже лежал в writable-слое контейнера. ВАЖНО: все
«uncommitted» backend-файлы на диске **байт-в-байт совпадают** с работающим
контейнером (admin/tracks/payments/generate/router/notifications/reviews/legal
давно в проде, `/api/v1/reviews`=200). «uncommitted в git» здесь = «не сделан
`git commit`», а НЕ «не задеплоено». → Будущая пересборка backend-образа
**низкорисковая** (диск == прод), сделает agent-файлы durable. Гигиена: стоит
`git commit` backend-работы, чтобы репо отражал реальность.

**Файлы:** `backend/app/services/genre_canonical.py` (new), `backend/app/api/v1/agent.py` (+`/classify`), `frontend/src/lib/api/client.ts` (+`classifyAgent`), `frontend/src/components/studio/AgentChat.tsx` (визард).

---

## Phase 2 — Mid effort (TODO, ~1 день)

### #2 Структурированный редактор брифа

**Цель:** после `done=true` показать форму с `music_params`, юзер правит до launch без повторного раунда GPT.

**Что делать:**
1. **Frontend — `AgentChat.tsx`**, секция «Бриф» сейчас рендерит `result.summary` как `<pre>` (~line 807). Заменить на:
   - Карточку с **редактируемыми полями**: `genre`, `subgenre`, `mood`, `tempo`, `era`, `suggested_bpm`, `key_instruments[]`, `techniques[]`, `vocal`, `constraints`.
   - Каждое — `<input>` для строки, `<input type="number">` для BPM, чипы для tempo/vocal с enumами, multi-tag input для arrays.
   - Кнопки `[ Развернуть редактор ]` / `[ Свернуть ]`, по умолчанию свернуто (summary как раньше).
2. **Состояние:** `result` уже хранит `musicParams`. Добавить локальный `editedParams` state в AgentChat — при изменении обновляется он, при launch уходит он, а не `result.musicParams`.
3. **Launch handler в StudioPage**: брать значения из `result.musicParams` так же, как сейчас. Если AgentChat экспортирует updated params, передавать их.
   - Идея: дополнить `AgentResult` полем `editedMusicParams` или сделать `onComplete(editedResult)` payload.
4. **Backend изменений нет** — все поля уже принимаются `agent_music_params: dict[str, object]`.

**Риски:**
- Validation: если юзер вписал «150» в BPM как строку, должно работать (backend хранит как str).
- key_instruments / techniques — это list[str]. Нужен tag-input компонент. Можно простой: `<textarea>` где каждая строка — элемент, при blur парсим в массив.

**Файлы (план):**
- `frontend/src/components/studio/AgentChat.tsx` — новая секция `<BriefEditor params={...} onChange={...} />` под `<pre className="agent-result__summary">`.
- Возможно отдельный компонент `frontend/src/components/studio/BriefEditor.tsx`.

**~3 часа.**

### #6 Per-user style profile

**Цель:** агент знает вкус юзера и не пере-спрашивает каждый раз.

**Что делать:**
1. **Backend `_build_user_stats`** в [agent.py](backend/app/api/v1/agent.py) уже даёт favorite_genres/moods. Расширить:
   - **Trash vs Like ratio per genre**: SELECT genre, COUNT FILTER (rating=like), COUNT FILTER (deleted_at IS NOT NULL). Дать агенту «liked: lo-fi(8), techno(3); avoided: country(0/2)».
   - **Personal terminology**: scan чатов юзера (последние 50 сообщений из его генераций?) на нестандартные термины — но это требует архива чатов агента, которых нет в БД. Опустить пока.
2. **Свободное поле «Творческий вкус»**:
   - **Migration 013**: `users.style_profile TEXT NULL` (≤2000 chars).
   - **API**: `PATCH /api/v1/users/style-profile` body `{text: str}`.
   - **Frontend**: в профиле новый раздел «Творческий вкус» с textarea и подсказкой «опиши свои предпочтения — агент будет учитывать».
   - **Agent**: `_build_user_stats` инжектит `User style profile: {text}` как system message.

**~2 часа.**

---

## Phase 3 — Big work (требуется участие пользователя)

### #1 Spotify / YouTube reference parsing

**Чего жду:** регистрация Spotify Developer App → `client_id` + `client_secret`.

**Что делать:**
1. **Backend service** `backend/app/services/spotify.py`:
   - `SpotifyClient` с client_credentials OAuth (короткоживущий token, кэш в Redis).
   - `lookup_track(url_or_query: str)` → `{name, artist, album, genres[], audio_features: {tempo, energy, danceability, key, mode}, release_year}`.
   - Парсинг URL: `https://open.spotify.com/track/<id>`, `https://open.spotify.com/artist/<id>`, поиск по тексту fallback.
2. **Agent endpoint integration**:
   - В `_postprocess_agent_reply` или в pre-process: regex детект Spotify URL в user message → вызов `lookup_track` → инжект metadata в system message следующего turn'а.
   - Формат: `Spotify reference: artist=X, genre=[A, B], suggested_bpm=110, era=2010s`.
3. **YouTube oEmbed**: проще — `https://www.youtube.com/oembed?url=...` отдаёт title + author. Жанр не даёт, но title даёт зацепку.
4. **Storage**: `generation.params["agent_spotify_refs"] = [...]` для аудита.

**~4 часа моих + регистрация app.**

### #3 Feedback loop

**Чего жду:** утверждение UI-точки. Варианты:
- (A) Всплывающий тост через 30 сек после старта проигрывания: «Понравилось?» 👍 👎.
- (B) Чипы прямо в карточке трека в библиотеке.
- (C) Модалка при первом удалении: «почему?» (текст).

**Что делать:**
1. **Migration 014**: `generations.user_rating SMALLINT NULL` (-1=dislike, 0=neutral, 1=like, 2=love). Уже есть `rating` enum, можно расширить или сделать новое поле.
2. **API**: `POST /api/v1/history/{gen_id}/feedback` body `{rating: -1|0|1|2, comment?: str}`.
3. **Frontend**: чип/тост по выбранному UI.
4. **Agent personalization** (после накопления данных): топ-rated briefs идут в few-shot examples в системный промт. Это уже Phase 4 на самом деле.

**~2 часа base + аналитика отдельно.**

### #9 Telemetry + dashboard

**Чего жду:** выбор стека.

**Опции:**
- **Опция A — Grafana+Loki+Promtail в Docker Compose**. Профессионально, легко расширять, +3 контейнера, ~500 МБ RAM.
- **Опция B — простой `agent_events` table в PG + admin-страница `/admin/agent-stats`**. Простые SQL queries, бесплатно, нет внешних зависимостей. Хватит для базовых метрик.

**Что делать (Option B):**
1. **Migration 015**: `agent_events (id, user_id, event_type, payload JSONB, created_at)`.
2. **Backend**: в `agent_chat` логировать `{turn_n, model, prompt_version, time_ms, route_taken, guards_fired[], done}`.
3. **Admin endpoint** `GET /api/v1/admin/agent-stats?from=...&to=...` агрегирует:
   - Среднее число turns до done=true
   - Распределение модулей
   - % conversations с reroute (e.g. SFX→instrumental)
   - Cost estimate (tokens × $/1k)
   - Среднее время response
4. **Admin UI** — простая страница с таблицами + sparkline графики (recharts уже подключен).

**~3 часа Option B / 1 день Option A.**

---

## Ещё на потом (Phase 4+)

- **Few-shot examples library** per genre — курируем «эталонные» pairs (brief, suno_payload) → подкладываем в системный промт.
- **A/B testing infra** на основе `prompt_version` — рулим split в config, считаем rating delta.
- **Streaming в `enrich_music_prompt`** — сейчас юзер ждёт 5-15 сек после launch на enriching step. Стрим для отображения «строю промт…» с дельтами.
- **Multi-model consensus** — параллельно gpt-4o + claude-sonnet → выбираем лучшее по rubric.
- **Genre-specific instrument lookups** — расширить `genre_data.py` с era-specific инструментами (1980s techno = TR-909, 2010s techno = analog modular).
- **Lyrics quality**: rhyme scheme detection, syllable count guidance, language-specific meter.

---

## Конфигурация / зависимости

- **gpt-4o** доступ остаётся через `apiyi_key` или `openai_api_key` в settings.
- **gpt-4o-mini** через тот же API key — работает.
- **Spotify**: client_credentials, `accounts.spotify.com/api/token` для refresh.
- **Redis**: уже есть, используем для OAuth token cache (TTL 50 min).

# RIFFA Web — План разработки

> Последнее обновление: 2026-05-05
> Статус сервера: **запущен на Devin VM** — frontend `:5173`, backend `:8000`, arq-воркер; постгрес/redis/minio в docker-compose
> Туннель для пощупать: `https://03b46b080054-tunnel-vs8ztja5.devinapps.com/` (basic-auth в URL)

---

## Архитектура

```
riffa-web/
├── frontend/          Vite + React + TypeScript
│   ├── src/pages/     StudioPage, RadioPage, ProfilePage, LibraryPage, ...
│   ├── src/components/  layout, player, studio, ui
│   ├── src/store/     Zustand (player, generationStore, radioSet)
│   └── src/lib/       api/client, library, sunoConstraints, i18n
├── backend/           FastAPI + SQLAlchemy + Alembic + Arq
│   ├── app/api/v1/    auth, generate, health, history, models, share,
│   │                  users, ws, radio, lyrics, agent, tracks
│   ├── app/services/  Suno, OpenAI/APIYI lyrics, NanoBanana, prompt_engineering
│   └── app/payments/  Robokassa, Telegram Stars, FreeKassa, Tinkoff
└── ops/               docker-compose.yml (postgres+redis+minio+backend+frontend)
```

---

## Выполнено

### Инфраструктура
- [x] Монорепо-скелет (frontend + backend + ops)
- [x] Docker Compose: postgres 16, redis 7, minio
- [x] Vite: lazy loading страниц + manualChunks (vendor, query)
- [x] FastAPI: health-endpoint, роутеры v1, SQLAlchemy async + Alembic миграции
- [x] Модели БД: users, wallets, generations, transactions, radio_votes
- [x] Alembic-миграции: `001_generation_share_rating`, `002_radio_columns`, `003_published_track_index`
- [x] `.env` настроен (Suno/APIYI/NanoBanana/ElevenLabs/Robokassa/MinIO/SECRET_KEY)
- [x] Live-инстанс на Devin VM: backend, arq-worker, vite — всё проксируется через vite на `/api`

### Аутентификация
- [x] Email magic-link: `POST /api/v1/auth/email/request` → файл в `backend/.dev_emails/`, кнопка-логин по ссылке
- [x] JWT cookie (`riffa_session`), middleware `current_user` / `current_user_optional`
- [x] Bonus 5 токенов новому пользователю
- [x] Telegram Login Widget / OAuth — UI готов, бэкенд резолвит `telegram_user_id` (используется как артист в названии трека)

### Дизайн-система / UI
- [x] Дизайн-токены перенесены из Telegram-прототипа (цвета, шрифты, радиусы, тени)
- [x] Единая система активных состояний кнопок: мягкий трёхцветный градиент + glow
- [x] Мгновенный отклик при нажатии (`transition: 0ms` на активном состоянии)
- [x] Кнопки «Свой вариант» (dashed border, особая подсветка) в генераторах
- [x] Аватар пользователя: `aspect-ratio: 1/1`, всегда круг
- [x] Фон сайта осветлён, белое световое пятно в AppShell
- [x] Единый `.file-item` в `global.css` — заменяет `.library-item`, `.generation-item`, `.playlist-row`
- [x] Единый `.filter-chip` / `.filter-chip--active` в `global.css`
- [x] Bolt-меню — портал `createPortal` + `position: fixed`, обходит любой `overflow:hidden`
- [x] Глобальный плеер: bolt-меню, скачивание, обложка трека (Suno cover art)
- [x] Профиль: убраны мёртвые тени у спокойных карточек, оставлен только hover-glow
- [x] Ценники модулей перенесены в правый-нижний угол плитки

### Страницы
- [x] **StudioPage** — лендинг с тайлами модулей + полный builder для всех 5 модулей
- [x] **RadioPage** — плейлист с настроениями, лайки/дизлайки, чарты по периодам
- [x] **ProfilePage** — баланс, покупка токенов, статистика, файлы (синхронизировано с Студией), отзывы, рефералы
- [x] **LibraryPage** — заглушка (заменена унифицированной `LibraryCard`)
- [x] **AgentPage** — живой GPT-4o чат
- [x] **LoginPage** — email magic-link + Telegram Login Widget
- [x] **SharePage** — публичная страница трека по share-ссылке

### Генерация (Suno)
- [x] `POST /api/v1/generate/song` → arq-таска → Suno V5.5 (`/api/v1/generate`)
- [x] `POST /api/v1/generate/instrumental` → instrumental=True
- [x] `POST /api/v1/generate/sound_effect` → Suno SFX (`/api/v1/generate/sounds`)
- [x] `POST /api/v1/generate/cover_song` → upload-cover (`/api/v1/generate/upload-cover`); UI валидирует формат и 8-минутный лимит
- [x] WebSocket `/ws/progress/{gen_id}` — стриминг статуса (queued → processing → done) с детальными steps
- [x] Arq-воркер: опрос Suno, загрузка metadata в БД, broadcast в WS
- [x] Стоимости в БД и UI выровнены: song=2, instrumental=2, cover=2, sound_effect=0.5, cover_art от 1
- [x] LibraryCard подключён к `GET /api/v1/history` (без MOCK_ITEMS)

### Lyrics-first flow (Песня)
- [x] State machine `idle → generating → review → approved` в SongModule
- [x] `POST /api/v1/lyrics` — Suno `/api/v1/lyrics` пишет текст, GPT-4o только промт-инжинер
- [x] Окно генерации переливается фирменными цветами (animated gradient + conic shimmer + radial pulse)
- [x] Блокировка остальных параметров пока `lyricsState !== "approved"`
- [x] Custom-режим (свой текст) и Instrumental-режим (auto-approve) обрабатываются той же машиной
- [x] 7+3 pytest-тестов

### GPT-промт-инжинер для музыки (паритет с Telegram-ботом)
- [x] **Жанры** (36 пресетов): `prompt_engineering.GENRE_PROFILES` — стиль + style_weight + weirdness_constraint
- [x] **Настроения** (12): mood-профили с уточняющими дескрипторами
- [x] **Темпы** (5): tempo-pool с BPM-намёками
- [x] **Контекст** (12 комбинаций) и **динамические элементы** (3 категории) с шаффлом 70-90% и джиттером
- [x] `LyricsClient.enrich_music_prompt(...)` — адаптивная длина prompt 150–4500 символов
- [x] System prompt уважает явные исключения («без вокала», «только ударные») → `instrumental, no synths, no vocals`
- [x] Fallback на детерминистский `build_suno_style` при сбое GPT
- [x] 6 unit-тестов (`tests/test_music_enricher.py`)

### Умный AgentChat (GPT-4o)
- [x] `POST /api/v1/agent/chat` — stateless эндпоинт; фронт реплеит `messages[]`
- [x] GPT-4o с `response_format: json_object` → `{reply, done, summary, prompt, intent}`
- [x] Старый мок-скрипт удалён; живой чат с typing-индикатором
- [x] Передаются выбранные жанр/настроение/темп/вокал → ассистент не задаёт лишние вопросы
- [x] Промт ограничен 5000 символов (Suno music limit)
- [x] 9 интеграционных тестов

### Agent → Generation routing
- [x] Agent определяет `intent` (модуль + параметры) и фронт сразу шлёт в нужный `generate*` эндпоинт
- [x] `*Request` схемы приняли `agent_prompt` (≤5000), worker использует как high-priority music prompt
- [x] Cover_song / cover_art разрешаются грейсфулли (открывается соответствующий модуль с подсказкой)

### Радио (per-track variant)
- [x] `is_public` + `published_at` + `published_track_index` (миграция 003) — публикуется конкретный V1/V2
- [x] `GET /api/v1/radio` — публичный список с фильтрами `mood/genre/vocal/period/sort` + пагинация
- [x] `GET /api/v1/radio/stats`, `GET /api/v1/radio/mood-counts`, `GET /api/v1/radio/me/collection`
- [x] `POST /api/v1/radio/{id}/vote` (`like`/`dislike`/`remove`) — голос с обновлением счётчиков
- [x] `POST /api/v1/radio/{id}/play` — счётчик прослушиваний (анонимно)
- [x] Денормализованные счётчики `like_count/dislike_count/play_count` + таблица `radio_votes`
- [x] Кнопка Radio в LibraryCard публикует **только нажатый вариант** (V1 или V2 независимо)
- [x] 12 интеграционных тестов

### Глобальная панель ActiveGenerations
- [x] `components/layout/ActiveGenerations.tsx` встроен в `Sidebar`
- [x] Подписан на `useGenerationStore` — карточки появляются мгновенно при клике «Сгенерировать»
- [x] framer-motion анимация: `AnimatePresence` + `layoutId={active-gen-${id}}`, spring stiffness 320 / damping 30
- [x] При `completed` показывает кнопки **V1 / V2** с play/pause, синхронизированными с `usePlayer.isPlaying`
- [x] Кнопка «🖼 Обложка» открывает фуллскрин-модалку
- [x] Multi-track: бейдж «· N» показывает количество дорожек

### Синхронизация «Мои генерации» ↔ «Мои файлы»
- [x] Один query (`useLibraryItems`) обслуживает оба места — Студия и Профиль
- [x] LibraryCard и ProfilePage используют `mapHistoryItem` → одинаковая структура `LibraryItem`
- [x] Файл удалён из одного места — пропадает в обоих
- [x] Авто-перезагрузка после `completed` события WS

### Suno cover art
- [x] `image_url` сохраняется в `tracks[].image_url` после генерации
- [x] LibraryCard / ProfilePage / GlobalPlayer / ActiveGenerations показывают обложку, fallback на иконку типа

### Track naming + ID3 metadata (новое)
- [x] Секция **«Название трека»** в Studio перед сабмитом (для song / instrumental / cover / sound_effect)
- [x] Два режима: **Авто** (GPT-4o → `Артист — Идея (RIFFAMusic)`) и **Своё название** (текст ≤80 chars + char-counter)
- [x] `POST /api/v1/tracks/auto-title` — резолвит артиста (telegram_username → display_name → email-local), генерирует title через `LyricsClient.generate_title`, fallback на slice(40) при ошибке
- [x] Имя помещается в `gen.title` ещё на создании; worker подставляет в Suno и оно прорастает в LibraryCard / ProfilePage / капсулу — единый источник правды
- [x] `GET /api/v1/tracks/:id/:idx/download` — стримит mp3 от Suno, на лету через mutagen вшивает ID3v2.3: `TIT2` (название), `TPE1` (артист), `TALB` ("RIFFAMusic"), `COMM`, `APIC` (Suno cover как embedded image)
- [x] FileActions использует прокси-URL вместо прямой Suno-ссылки → скачанный mp3 везде называется и тегируется одинаково
- [x] Filename для Content-Disposition санитайзится в безопасный (Unicode-safe, без слэшей)
- [x] 12 unit/integration-тестов (`tests/test_tracks.py`): авто-заголовок с/без GPT, формат имени, кламп до 80 chars, 404 на чужие генерации, реальный mp3-фикстур → ID3 теги читаются обратно

### Suno API (правила и ограничения)
- [x] Все лимиты вынесены в `frontend/src/lib/sunoConstraints.ts`:
  - title ≤ 80 chars
  - prompt (lyrics) ≤ 5000 chars
  - style ≤ 1000 chars
  - cover-аудио ≤ 8 минут, форматы `mp3/wav/m4a/ogg`
  - SFX prompt ≤ 200 chars
- [x] UI валидирует размер/формат файла на стадии загрузки
- [x] Backend проксирует через httpx с типизированными моделями (`SunoTrack`, `SunoResult`)
- [x] Humming поддерживается через upload-cover endpoint (загрузить голосовое — Suno использует как мелодический референс)

### Inline preview/play на готовых карточках
- [x] `ActiveGeneration.result` сохраняет полный WS payload (`tracks[]`, `image_url`, `lyrics`)
- [x] Кнопка «▶ Слушать» / «⏸ Пауза»: подключена к `usePlayer.play(...)` — сразу включает GlobalPlayer
- [x] Состояние play/pause синхронизировано с `usePlayer.isPlaying`

### Critical bugfixes
- [x] AgentChat: исправлено растягивающееся поле ввода (CSS grid: `auto 1fr auto`)
- [x] GlobalPlayer: добавлен `crossOrigin="anonymous"` на `<audio>` — Web Audio API больше не «таинтит» поток с Suno CDN
- [x] Radio публикация: один трек на один вариант (раньше публиковались оба варианта одной генерации)

### Performance
- [x] 12 mood-иконок переведены через ffmpeg `libwebp` в animated WebP (13 MB → 5.5 MB, ≈58% экономии)
- [x] Vite manualChunks: vendor (react+router), query (react-query) — стартовый bundle меньше
- [x] React-query на всех страницах с invalidation на WS-завершение

### Адаптивность
- [x] Брейкпоинты: 960px (мобильное меню), 640px (одна колонка), 480px (мелкие экраны)
- [x] Tile-тайлы: `min-width: 0` + text-overflow на мобильных
- [x] StudioPage iPad: иконка hero-card не переносится, тайлы не перекрывают карточку
- [x] LibraryCard «Мои генерации» ≤540px: контейнер переключён на `display:flex; flex-direction:column`
- [x] ProfilePage мобильный порядок: токены → файлы → статистика → вкусы → реферал → документы → отзывы
- [x] RadioPage mood-кнопки: `repeat(4, 1fr)` на мобильном
- [x] Блок «Мои генерации»: адаптируется по высоте экрана (`grid-template-rows: 240px 132px minmax(180px, 1fr)`)

### Профиль / тарифы (актуализировано)
- [x] 4 пакета без эмодзи:
  - Стартовый: 10 токенов / 5 генераций — 100 ₽
  - Базовый: 25 токенов / 12 генераций — 200 ₽ (Выгода 20%)
  - Продвинутый: 60 токенов / 30 генераций — 400 ₽ (Выгода 33%)
  - Премиум: 150 токенов / 75 генераций — 900 ₽ (Выгода 40%)
- [x] Бейдж «Выгода N%» на 3 верхних карточках, метод оплаты Telegram Stars — отдельная кнопка ниже

---

## В работе / Следующий спринт

### NanoBanana cover_art (модуль «Обложка»)
- [ ] `POST /api/v1/generate/cover_art` → arq-таска → NanoBanana (через APIYI proxy)
- [ ] 5 моделей в UI готово, осталось привязать backend
- [ ] DALL·E 3 / FLUX.1 как опциональные fallbacks

### Cover song upload pipeline
- [ ] `POST /api/v1/upload/cover-source` → presigned MinIO/S3
- [ ] UI: использовать presigned URL вместо текстового поля «URL аудио»
- [ ] После upload автоматически передавать в `generate/cover_song`

### Оплата
- [ ] Robokassa: форма оплаты, webhook подтверждения, зачисление токенов
- [ ] Telegram Stars: deeplink на бота, подтверждение через bot API
- [ ] ProfilePage «Купить пакет» → реальный платёжный flow

### Прочее
- [ ] Share-ссылка: `GET /api/v1/share/{share_id}` → реальные данные трека
- [ ] SEO: meta-теги, og:image для Share-страниц
- [ ] WAV-конвертация (заявлено на странице входа): эндпоинт `/api/v1/tracks/:id/:idx/wav` — ffmpeg транскод lossless
- [ ] Продление треков (Suno extend) — заявлено на странице входа

---

## Технический долг

- [ ] Убрать оставшиеся `MOCK_*` константы (если есть) после полной интеграции
- [ ] Добавить error boundary и toast-уведомления об ошибках
- [ ] Rate limiting на API-роутерах генерации
- [ ] Тесты: pytest для оплат, Playwright E2E для login → generate
- [ ] CI: GitHub Actions lint + test + docker build
- [ ] Объединить миграции 002+003 после первого продакшен-deploy (сейчас alembic stamp head на dev-БД)
- [ ] При первом запуске на чистой БД использовать `alembic upgrade head` вместо create_all (миграции протестированы)

---

## Сводка тестов и проверок (на момент 2026-05-05)

| Уровень | Команда | Результат |
|---|---|---|
| Backend | `pytest -q` | **62 passed** |
| Frontend | `npm run lint` | 0 warnings (max-warnings=0) |
| Frontend | `npx tsc --noEmit` | 0 errors |

Тесты по доменам: agent (9) · health · lyrics (7) · music_enricher (6) · radio (12) · security · suno_lyrics (3) · telegram_auth · tracks (12).

---

## Переменные окружения (минимум для prod)

| Переменная | Описание |
|---|---|
| `SECRET_KEY` | 32-байтный hex |
| `DATABASE_URL` | postgresql+asyncpg://riffa:riffa@postgres:5432/riffa |
| `REDIS_URL` | redis://redis:6379/0 |
| `TELEGRAM_BOT_TOKEN` | Для проверки Login Widget / Stars |
| `TELEGRAM_BOT_USERNAME`, `TELEGRAM_CHANNEL_USERNAME` | Для подписочного бонуса |
| `SUNO_API_KEY`, `SUNO_BASE_URL` | Suno API (sunoapi.org) |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | GPT-4o (через APIYI proxy) — агент, lyrics, auto-title, music enrichment |
| `APIYI_KEY` | Для модулей, явно использующих APIYI |
| `NANOBANANA_API_KEY`, `NANOBANANA_BASE_URL` | Для модуля «Обложка» (тоже через APIYI) |
| `ELEVENLABS_API_KEY` | Зарезервировано на будущее (TTS) |
| `ROBOKASSA_MERCHANT_LOGIN` + `PASSWORD_1` + `PASSWORD_2` | Платежи |
| `S3_ENDPOINT`, `S3_BUCKET_MEDIA`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | MinIO/S3 |

Полный шаблон: `backend/.env.example`

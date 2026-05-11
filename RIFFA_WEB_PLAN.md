# RIFFA Web — План разработки

> Последнее обновление: 2026-05-08
> Статус: **локальная разработка** — frontend `:5173`, backend `:8000`, arq-воркер; postgres/redis/minio в docker-compose
> Запуск: `.\start-all.ps1` (единое окно, все сервисы из venv)

---

## Архитектура

```
riffa-web/
├── frontend/          Vite + React + TypeScript
│   ├── src/pages/     StudioPage, RadioPage, ProfilePage, LibraryPage, LoginPage, ...
│   ├── src/components/  layout, player, studio, ui
│   ├── src/store/     Zustand (player, generationStore)
│   ├── src/lib/       api/client, library, sunoConstraints, i18n, auth
│   └── public/        icons/ (GIF/WebP модулей), radio/ (GIF настроений)
├── backend/           FastAPI + SQLAlchemy + Alembic + Arq
│   ├── app/api/v1/    auth, generate, health, history, models, share,
│   │                  users, ws, radio, lyrics, agent, tracks
│   ├── app/services/  suno, lyrics (APIYI/GPT-4o), prompt_engineering, wallet, users
│   ├── app/auth/      email (bcrypt), telegram (Login Widget)
│   └── logs/          generations.log — дамп каждого Suno-пейлоада
└── ops/               docker-compose.yml (postgres+redis+minio)
```

---

## Выполнено

### Инфраструктура
- [x] Монорепо-скелет (frontend + backend + ops)
- [x] Docker Compose: postgres 16, redis 7, minio
- [x] Vite: lazy loading всех страниц + manualChunks (vendor, query)
- [x] FastAPI: health-endpoint, роутеры v1, SQLAlchemy async + Alembic миграции
- [x] Модели БД: users, wallets, generations, transactions, radio_votes
- [x] Alembic-миграции: 001–004 (share/rating, radio, track-index, password_hash)
- [x] `.env.dev` настроен (Suno/APIYI/NanoBanana/ElevenLabs/Robokassa/MinIO/SECRET_KEY/ADMIN_TELEGRAM_IDS)
- [x] **`start-all.ps1`** — единый запуск всего стека в одном PowerShell-окне с цветными префиксами [BACK]/[WORK]/[FRONT], pre-flight проверками, авто-очисткой зомби-процессов, корректным Ctrl+C
- [x] Корень проблемы зависаний найден и устранён: конфликт двух uvicorn (системный Python vs venv)

### Аутентификация
- [x] **Email/password**: `POST /api/v1/auth/email/register` и `POST /api/v1/auth/email/login`
- [x] Хеширование паролей через прямой `bcrypt` (passlib 1.7.4 несовместима с bcrypt 4.x — исправлено)
- [x] Миграция 004: колонка `password_hash VARCHAR(128)` на таблице users
- [x] Email magic-link (legacy): `POST /api/v1/auth/email/request` сохранён для обратной совместимости
- [x] JWT cookie (`riffa_session`), middleware `current_user` / `current_user_optional`
- [x] **Admin god mode**: `ADMIN_TELEGRAM_IDS` в конфиге — при входе через Telegram автоматически `is_admin=True`; для admins токены не списываются (`generate.py` + `wallet.deduct_tokens`)
- [x] Telegram Login Widget / OAuth — UI + бэкенд
- [x] Bonus 5 токенов новому пользователю
- [x] `PATCH /api/v1/users/display-name` — смена никнейма
- [x] `POST /api/v1/users/change-password` — смена пароля (с проверкой текущего)

### Дизайн-система / UI
- [x] Дизайн-токены: цвета, шрифты, радиусы, тени
- [x] **Big Shoulders Display (900)** — шрифт для бренда; `--font-brand` в CSS-переменных
- [x] **"RIFFAStudio"** — брендовый текст с зелёным "Studio" везде: Sidebar, MobileTopbar, LoginPage
- [x] Единая система активных состояний кнопок: градиент + glow
- [x] Аватар пользователя: `aspect-ratio: 1/1`, всегда круг
- [x] Глобальный плеер: bolt-меню, скачивание, обложка трека
- [x] Профиль: hover-glow без постоянных теней

### Страницы
- [x] **StudioPage** — тайлы модулей с GIF-иконками + полный builder
- [x] **RadioPage** — плейлист с GIF-настроениями, лайки/дизлайки, чарты
- [x] **ProfilePage** — hero-блок с inline-редактированием никнейма + форма смены пароля; баланс, покупка токенов, статистика, файлы, отзывы, рефералы
- [x] **AgentPage** — живой GPT-4o чат
- [x] **LoginPage** — два таба (Войти / Регистрация) с email+password; Telegram Login Widget
- [x] **SharePage** — публичная страница трека
- [x] **Логотип → /studio** — клик на лого с любой страницы ведёт на главную (Sidebar уже был NavLink, MobileTopbar — исправлен)

### Иконки
- [x] **Иконки модулей** — MP4 из `/public/icons/`; `ModuleIcon.tsx` использует `<video autoPlay muted loop>`
  - `mix-blend-mode: screen` убирает чёрный фон MP4 на тёмном фоне карточек
  - song.mp4, instrumental.mp4, sfx.mp4, cover.mp4, cover-art.mp4
- [x] **Иконки настроений** на RadioPage — восстановлены оригинальные GIF из источника
  - mood-collection.gif добавлен (был сломанный WebP)
  - **Пауза GIF при скрытой вкладке** — Page Visibility API + `BLANK_GIF` swap, хук `usePageVisible()`
- [x] RadioPage изолирован через `React.lazy()` — GIF анимируются только на странице Радио

### Генерация (Suno)
- [x] `POST /api/v1/generate/song` → arq-таска → Suno V5.5
- [x] `POST /api/v1/generate/instrumental` → instrumental=True
- [x] `POST /api/v1/generate/sound_effect` → Suno SFX
- [x] `POST /api/v1/generate/cover_song` → upload-cover
- [x] WebSocket `/ws/progress/{gen_id}` — стриминг статуса
- [x] **Admin god mode**: `is_admin=True` → проверка баланса пропускается в generate.py, фактическое списание пропускается в wallet.deduct_tokens
- [x] **Название трека в итоговой сводке** — строка "Название трека: …" в блоке `prompt-preview` перед кнопкой генерации
- [x] **Логирование Suno-пейлоада**: `_dump_payload()` в воркере перед каждым вызовом Suno; файл `backend/logs/generations.log` (ротация 10MB, 7 дней)

### Lyrics-first flow (Песня)
- [x] State machine `idle → generating → review → approved` в SongModule
- [x] `POST /api/v1/lyrics` — Suno пишет текст, GPT-4o только промт-инжинер
- [x] Блокировка параметров пока `lyricsState !== "approved"`
- [x] Custom-режим и Instrumental-режим

### GPT промт-инжинер для музыки
- [x] 36 жанров, 12 настроений, 5 темпов с профилями
- [x] `LyricsClient.enrich_music_prompt(...)` — адаптивная длина 150–4500 символов
- [x] Fallback на детерминистский `build_suno_style`

### Умный AgentChat (GPT-4o)
- [x] `POST /api/v1/agent/chat` — stateless; фронт реплеит `messages[]`
- [x] **StrictMode-баг исправлен**: `bootedRef` + `cancelled` конфликтовали → агент молчал; убран `cancelled`
- [x] **Аватар агента** — `riffa-logo.png` вместо SVG-робота
- [x] **401 ошибка** → кнопка "Войти в аккаунт" прямо в чате
- [x] **Динамический статус ожидания**: фазы (открытие/анализ/написание текста), счётчик времени с 5с, пульсирующий текст статуса; авто-определение фазы написания текста по ключевым словам и маркерам `[Verse]`/`[Chorus]`
- [x] **Системный промпт полностью переработан**:
  - HARD FINALIZATION REQUIREMENTS (5 правил — без них `done=true` нельзя)
  - **LYRICS DRAFTING FLOW** (шаги A→E): проба темы → черновик в чате → итерация правок → одобрение → стиль/темп → финализация с `text_mode=custom`
  - ADAPTIVE INTERVIEW DEPTH: богатый бриф (0-1 уточнений), средний (1-2), расплывчатый (2-3 минимум)
  - Агент пишет черновик текста в чате для одобрения (не оставляет Suno без согласованных слов)
  - Ориентиры на знаменитые треки при вопросах о жанре
- [x] **Приветственное сообщение** — структурированное, подсказывает что писать (вокал/инструментал, тема, жанр/ориентир)
- [x] Intent-роутинг: определяет модуль + параметры → фронт шлёт в нужный `generate*` эндпоинт
- [x] `agent_prompt` передаётся воркеру как high-priority music prompt

### Радио
- [x] `is_public` + `published_track_index` — публикуется конкретный V1/V2
- [x] CRUD: list, stats, mood-counts, collection, vote, play
- [x] Денормализованные счётчики + таблица `radio_votes`

### Track naming + ID3
- [x] Секция «Название трека» перед сабмитом (Авто / Своё)
- [x] `POST /api/v1/tracks/auto-title` — GPT-4o генерирует `Артист — Идея (RIFFAMusic)`
- [x] `GET /api/v1/tracks/:id/:idx/download` — mp3 с ID3v2.3 тегами (TIT2/TPE1/TALB/APIC)
- [x] **SFX-названия**: авто-формат `{промт} (RIFFA)` вместо генерации артист-формата
- [x] **WAV-названия**: inherit `{title} WAV` от родительской генерации
- [x] **WAV/SFX в сайдбаре**: кнопка ▶ появляется после завершения (top-level `audio_url` в result)

### Профиль
- [x] **Inline-редактирование никнейма**: клик на имя → инпут с ✓/✕, Enter — сохранить, Escape — отмена
- [x] **Форма смены пароля** интегрирована в hero-блок: кнопка "🔑 Сменить пароль" разворачивает форму с анимацией; после успеха сворачивается; только для email-аккаунтов
- [x] Отдельная карточка "Аккаунт" убрана (перенесена в hero)
- [x] 4 пакета токенов, способы оплаты, статистика, файлы, отзывы, рефералы
- [x] **Реструктуризация сетки**: Токены (span 6) + Файлы (span 6) — первая строка; Статистика+Стили — единый `profile-card--insights` (span 12); далее Реферал + Документы
- [x] **Файлы в профиле** — 1 столбец (карточка теперь вдвое уже), прокрутка
- [x] **Корзина**: кнопка в шапке профиля, modal с soft-deleted файлами; «Очистить корзину» удаляет ВСЕ items (не только старше 7 дней)
- [x] **Аватар**: клик → file picker; загрузка `/api/v1/users/avatar`; брендированная инициальная заглушка
- [x] **Magnetic delete** — файл исчезает мгновенно из grid, `position:fixed` ghost играет анимацию взрыва

### AgentChat — UX и логика
- [x] **StrictMode-баг исправлен**: убран `cancelled` флаг, конфликтовавший с `bootedRef`
- [x] **Пользователь пишет первым** на StudioPage (`agentInitiates=false`); агент пишет первым (`agentInitiates=true`) на AgentPage и других страницах
- [x] **AgentPage** — полноценная страница с живым чатом, результатом и кнопками "Открыть Студию" / "Начать заново"
- [x] **Аватар** — `riffa-logo.png` вместо SVG-робота; зелёная рамка с glow
- [x] **Быстрые ответы-чипсы**: бэкенд возвращает `suggestions: list[str]` в JSON; фронт рендерит кликабельные пилюли под последним сообщением агента
- [x] **Динамический статус ожидания**: фазы (анализ / думаю / пишу текст), счётчик времени с 5 сек, маленький бейдж `✍ Генерирую текст` при lyrics-фазе
- [x] **401 ошибка** → кнопка "Войти в аккаунт" прямо в чате
- [x] **Пустой чат** — заглушка "Напиши первым — агент ответит"

### Системный промпт агента — полный рефакторинг
- [x] FIRST MESSAGE RULE — при первом сообщении всегда: приветствие + представление + возможности + вопрос
- [x] HARD FINALIZATION REQUIREMENTS (5 правил) — `done=true` без них нельзя
- [x] LYRICS DRAFTING FLOW (шаги A→E) — агент пишет черновик текста в чат, ждёт одобрения, только потом — стиль и темп; финализирует с `text_mode=custom`
- [x] ADAPTIVE INTERVIEW DEPTH — богатый бриф (0-1 уточнений) / средний / расплывчатый (2-3 минимум)
- [x] Чипсы `suggestions[]` — агент возвращает 2-4 коротких ответа на свои вопросы
- [x] **Запрет имён артистов в `prompt`** — правило 6 в принципах: конвертировать "как Dua Lipa" → стилевые дескрипторы

### Генерация — критические баги исправлены
- [x] **Воркер никогда не запускался**: `arq` не поддерживает `--env-file` — падал при каждом старте. Фикс: `config.py` автоматически находит `.env.dev` без флага
- [x] **`style > 1000 символов`**: Suno API отвергал запросы. Фикс: жёсткий клампинг `style[:1000]`, `prompt[:5000]`, `title[:80]` в `suno.py`
- [x] **Имена артистов в промпте**: Suno отвергает запросы с именами ("dua lipa"). Тройная защита:
  1. Правило в системном промпте агента
  2. Правило в `_SYS_ENRICH_MUSIC` с примерами конвертации 10+ артистов
  3. `_strip_artist_names()` — regex-фильтр по списку 60+ артистов прямо в Suno-клиенте
- [x] **Логирование Suno-пейлоадов**: `_dump_payload()` в воркере; файл `backend/logs/generations.log`

### Performance
- [x] Animated WebP для тяжёлых GIF где это выгодно
- [x] React.lazy() на всех страницах — RadioPage загружается только при переходе
- [x] Page Visibility API — GIF на Radio паузируются при скрытой вкладке
- [x] `content-visibility: auto` на карточках профиля

### UX / Notifications
- [x] **Звук уведомления о готовой генерации** — кастомный RIFFA MP3 (`/public/sounds/notification.mp3`)

### Шрифты
- [x] **Sora** (display/brand) + **Manrope** (body/UI) + **JetBrains Mono** заменили Inter/Space Grotesk/Big Shoulders
- [x] CSS-переменные: `--font-brand`, `--font-display`, `--font-body`, `--font-ui`, `--font-mono`
- [x] Применены ко всем micro-UI элементам (чипы, кнопки плеера, метаданные файлов)

### Mobile player
- [x] ≤560px: `flex-direction: column`, трек-строка наверху, полный заголовок трека
- [x] Действия в нижней строке; `padding-bottom: 190px` на `.main` чтобы контент не прятался

### Генерация — дизайн файловой системы
- [x] **Magnetic delete** — grid мгновенно схлопывается, `position:fixed` ghost анимирует взрыв
- [x] **Soft-delete** → корзина → 7-дневное хранение; ручная очистка без возрастного лимита

### Радио
- [x] Лайк на своём треке → автопубликация в «Мою коллекцию»
- [x] Глобальный плеер: кнопки лайк/дизлайк вызывают реальный API (`rateGeneration` / `voteRadioTrack`)

---

## В работе / Следующий спринт

### NanoBanana cover_art (модуль «Обложка»)
- [ ] `POST /api/v1/generate/cover_art` → arq-таска → NanoBanana (через APIYI proxy)
- [ ] 3 модели в UI готово (Nano Banana / 2 / Pro), осталось привязать backend

### Cover song upload pipeline
- [ ] `POST /api/v1/upload/cover-source` → presigned MinIO/S3
- [ ] UI: использовать presigned URL вместо текстового поля
- [ ] После upload автоматически передавать в `generate/cover_song`

### Оплата
- [ ] Robokassa: форма оплаты, webhook подтверждения, зачисление токенов
- [ ] Telegram Stars: deeplink на бота, подтверждение через bot API
- [ ] ProfilePage «Купить пакет» → реальный платёжный flow

### Агент — дальнейшие улучшения
- [ ] Явные chip-подсказки в UI после каждого вопроса агента (быстрые варианты ответа)
- [ ] Показывать черновик текста с markdown-разметкой `[Verse]`/`[Chorus]` красиво в чате
- [ ] Возможность редактировать одобренный текст прямо в полях формы

### Прочее
- [ ] WAV-конвертация: `/api/v1/tracks/:id/:idx/wav` — ffmpeg lossless
- [ ] Продление треков (Suno extend)
- [ ] SEO: meta-теги, og:image для Share-страниц
- [ ] Реальные данные в Share-странице

---

## Технический долг

- [ ] Убрать оставшиеся `MOCK_*` константы (статистика профиля)
- [ ] Error boundary + toast-уведомления об ошибках
- [ ] Rate limiting на API-роутерах генерации
- [ ] Тесты: pytest для новых endpoints (register, change-password, display-name, admin-flow)
- [ ] CI: GitHub Actions lint + test + docker build
- [ ] При первом запуске на чистой БД: alembic upgrade head вместо create_all + stamp

---

## ⚡ Запуск (каждый раз)

```powershell
.\start-all.ps1
```

Открываешь PowerShell в папке проекта и запускаешь — всё поднимается в одном окне.
После запуска сайт доступен по адресу: **http://localhost:5173**

**Что делает скрипт автоматически:**
1. Проверяет Docker, venv, node_modules
2. Поднимает PostgreSQL / Redis / MinIO (если не запущены)
3. Убивает зомби-процессы от прошлых сессий
4. Стартует Backend + Worker + Frontend с цветными логами в одном окне
5. Ctrl+C → корректная остановка всех сервисов

**Первый раз на новой машине** (один раз):
```powershell
.\start-dev.ps1   # создаёт venv, ставит Python-deps, npm install, применяет миграции
```

**Все адреса:**
| Сервис | URL |
|---|---|
| 🌐 Сайт | http://localhost:5173 |
| 📡 API docs | http://localhost:8000/docs |
| 📋 Suno лог | `backend/logs/generations.log` |
| 🗄️ MinIO | http://localhost:9001 (minioadmin/minioadmin) |

**Admin-аккаунт (god mode):**
- Email: `amsergeyzelenkin@gmail.com`
- Пароль: `Helloprime173987-`
- Telegram ID: `8263964445` → `ADMIN_TELEGRAM_IDS` в `.env.dev`
- God mode: токены не списываются, нет ограничений по балансу

---

## Сводка тестов (на момент 2026-05-05)

| Уровень | Команда | Результат |
|---|---|---|
| Backend | `pytest -q` | **62 passed** |
| Frontend | `npm run lint` | 0 warnings |
| Frontend | `npx tsc --noEmit` | 0 errors |

Тесты: agent (9) · health · lyrics (7) · music_enricher (6) · radio (12) · security · suno_lyrics (3) · telegram_auth · tracks (12).

---

## Переменные окружения (`.env.dev` / prod)

| Переменная | Описание |
|---|---|
| `SECRET_KEY` | 32-байтный hex |
| `DATABASE_URL` | postgresql+asyncpg://riffa:riffa@localhost:5432/riffa |
| `REDIS_URL` | redis://localhost:6379/0 |
| `ADMIN_TELEGRAM_IDS` | Comma-separated Telegram user IDs → auto is_admin=True |
| `TELEGRAM_BOT_TOKEN` | Login Widget + Stars |
| `TELEGRAM_BOT_USERNAME`, `TELEGRAM_CHANNEL_USERNAME` | Подписочный бонус |
| `SUNO_API_KEY`, `SUNO_BASE_URL` | Suno API (sunoapi.org) |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | GPT-4o через APIYI proxy |
| `APIYI_KEY` | APIYI proxy key |
| `NANOBANANA_API_KEY`, `NANOBANANA_BASE_URL` | Модуль «Обложка» |
| `ELEVENLABS_API_KEY` | Зарезервировано (TTS) |
| `ROBOKASSA_MERCHANT_LOGIN` + passwords | Платежи |
| `S3_ENDPOINT`, `S3_BUCKET_MEDIA`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | MinIO/S3 |

Полный шаблон: `backend/.env.example`

# RIFFA — Локальная разработка

> Инструкция для разработчика и для локального Claude.
> Цель: поднять полный стек на локальной машине для тестирования и разработки.

---

## Шаг 0 — Получить актуальный код с сервера

На сервере **29+ коммитов не запушены** на GitHub (SSH-ключ не добавлен).
Есть два способа:

### Вариант A — SCP (быстрее, не нужен GitHub)
```bash
# На локальной машине — скачать весь проект с сервера
scp -r root@riffastudio.site:/root/backend ./
scp -r root@riffastudio.site:/root/frontend ./
scp -r root@riffastudio.site:/root/ops ./
scp -r root@riffastudio.site:/root/RiffaBot ./
scp root@riffastudio.site:/root/backend/.env.local.example ./backend/.env.local.example
```

### Вариант B — GitHub (правильный путь, настроить один раз)

**На сервере** — добавить deploy key в GitHub:
```bash
# 1. Посмотреть публичный ключ
cat ~/.ssh/riffa-server-deploy.pub

# 2. Добавить его на GitHub:
#    github.com → Settings → SSH and GPG keys → New SSH key
#    Title: "RIFFA Server", Key: вставить содержимое riffa-server-deploy.pub

# 3. Проверить
SSH_AUTH_SOCK= GIT_SSH_COMMAND="ssh -i ~/.ssh/riffa-server-deploy" ssh -T git@github.com
# → "Hi Sergeyzelenka! You've successfully authenticated"

# 4. Запушить все коммиты
GIT_SSH_COMMAND="ssh -i ~/.ssh/riffa-server-deploy" git push origin main
```

**На локальной машине** — клонировать:
```bash
git clone git@github.com:Sergeyzelenka/RIFFA-Music-Agent.git riffa
cd riffa
```

---

## Шаг 1 — Требования

| Инструмент | Версия | Зачем |
|---|---|---|
| Docker Desktop | ≥ 4.x | Все сервисы (postgres, redis, minio, backend, worker) |
| Node.js | ≥ 20.x | Только для фронтенда (если запускать вне Docker) |
| Python | ≥ 3.12 | Только если запускать backend вне Docker |

Docker Desktop: https://www.docker.com/products/docker-desktop/

---

## Шаг 2 — Файлы окружения

### 2.1 — ops/.env (пароли Docker-сервисов)
```bash
cp ops/.env.example ops/.env
```
Открой `ops/.env` и задай свои пароли:
```
REDIS_PASSWORD=любой-сложный-пароль
POSTGRES_PASSWORD=любой-сложный-пароль
MINIO_ROOT_USER=riffa
MINIO_ROOT_PASSWORD=любой-сложный-пароль
```

### 2.2 — backend/.env (API-ключи)
```bash
cp backend/.env.local.example backend/.env
```
Открой `backend/.env` и заполни:

**ОБЯЗАТЕЛЬНО** (без них генерация не работает):
```
SUNO_API_KEY=           # ключ от suno API
OPENAI_API_KEY=         # ключ APIYI или OpenAI
APIYI_KEY=              # если используешь apiyi прокси
```

**Инфраструктура** — подставь те же пароли, что задал в ops/.env:
```
DATABASE_URL=postgresql+asyncpg://riffa:ВАШ_POSTGRES_PASSWORD@localhost:5432/riffa
REDIS_URL=redis://:ВАШ_REDIS_PASSWORD@localhost:6379/0
S3_SECRET_KEY=ВАШ_MINIO_PASSWORD
```

> ⚠️ `S3_PUBLIC_BASE_URL` должен быть `http://localhost:9000/riffa-media` — НЕ riffastudio.site

**Опциональные** (работает без них, но некоторые функции отключены):
```
OPENROUTER_API_KEY=     # агент — поиск артиста через Perplexity
LASTFM_API_KEY=         # теги жанров
NANOBANANA_API_KEY=     # генерация обложек
TELEGRAM_BOT_TOKEN=     # Telegram-интеграция
ADMIN_TELEGRAM_IDS=     # твой Telegram ID для god-mode
```

---

## Шаг 3 — Запуск

```bash
cd ops

# Поднять всё (postgres + redis + minio + backend + worker + frontend dev-server)
docker compose up --build

# Или в фоне:
docker compose up --build -d
```

Первый старт — ~3-5 минут (скачивает образы, собирает backend).

**Проверка:**
```
http://localhost:5173   ← фронтенд (Vite dev server с hot-reload)
http://localhost:8001   ← backend API напрямую
http://localhost:9001   ← MinIO console (логин: riffa / твой MINIO_PASSWORD)
```

---

## Шаг 4 — Первый запуск: миграции БД + MinIO bucket

После того как все контейнеры запустились:

### 4.1 — Применить миграции БД
```bash
# Из директории ops/
docker compose exec backend alembic upgrade head
```

### 4.2 — Создать bucket в MinIO
```bash
# Открой http://localhost:9001 в браузере
# Войди: логин=riffa, пароль=ВАШ_MINIO_PASSWORD
# Buckets → Create Bucket → Name: riffa-media
# Access Policy → Public (или custom — разрешить GET *)
```

Или через CLI:
```bash
# Установить mc (MinIO client)
# Mac:   brew install minio/stable/mc
# Linux: curl https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc && chmod +x /usr/local/bin/mc

mc alias set local http://localhost:9000 riffa ВАШ_MINIO_PASSWORD
mc mb local/riffa-media
mc anonymous set public local/riffa-media
```

---

## Шаг 5 — Регулярная разработка

### Пересобрать только backend (после изменений в Python-коде):
```bash
docker compose up --build -d backend worker
```

### Фронтенд обновляется автоматически (hot-reload Vite).

### Посмотреть логи:
```bash
docker compose logs -f backend   # логи backend в реальном времени
docker compose logs -f worker    # логи генерации треков
docker compose logs -f           # все сервисы
```

### Остановить всё:
```bash
docker compose down
# С удалением данных (БД, медиафайлы):
docker compose down -v
```

---

## Структура проекта

```
riffa/
├── backend/          ← FastAPI приложение (Python 3.12)
│   ├── app/
│   │   ├── api/v1/   ← эндпоинты (agent.py, generate.py, radio.py, ...)
│   │   ├── services/ ← бизнес-логика (suno.py, lyrics.py, artist_research.py, ...)
│   │   ├── db/       ← модели SQLAlchemy + миграции Alembic
│   │   └── core/     ← config.py, deps.py
│   ├── .env          ← секреты (gitignored — заполнить вручную)
│   ├── .env.local.example ← шаблон
│   └── Dockerfile
├── frontend/         ← React + Vite (TypeScript)
│   ├── src/
│   │   ├── components/studio/ ← AgentChat, StudioPage, ...
│   │   ├── pages/
│   │   └── lib/api/  ← client.ts (типы API)
│   └── vite.config.ts ← /api и /media проксируются на backend:8000
├── ops/
│   ├── docker-compose.yml ← всё окружение
│   ├── .env              ← пароли инфры (gitignored)
│   └── .env.example      ← шаблон паролей инфры
└── RiffaBot/         ← Telegram-бот (gitignored, не обязателен для веба)
```

---

## Разница локал vs продакшн

| | Локально | Продакшн |
|---|---|---|
| `APP_ENV` | `development` | `production` |
| `SECRET_KEY` | любой | сложный (обязателен!) |
| `S3_PUBLIC_BASE_URL` | `http://localhost:9000/riffa-media` | `https://riffastudio.site/media-s3/riffa-media` |
| Frontend | Vite dev server (port 5173) | статика из `backend/static_dist/` |
| Nginx | не нужен | обязателен |
| Платежи | `ROBOKASSA_TEST_MODE=true` | `false` |
| Telegram webhook | работает только с ngrok | реальный домен |

---

## Инструкция для локального Claude

**Прочти это перед работой:**

1. Проект RIFFA — FastAPI backend + React/Vite frontend, всё в Docker через `ops/docker-compose.yml`.
2. Изменения в Python → `docker compose up --build -d backend worker` (из `ops/`)
3. Изменения в React → hot-reload автоматически (Vite dev server)
4. Сборка фронтенда в прод: `cd frontend && npm run build` → результат в `frontend/dist/`, потом скопировать в `backend/static_dist/`
5. **НЕ трогать** `backend/static_dist/` вручную — туда идёт только `npm run build`
6. Миграции БД: `docker compose exec backend alembic upgrade head`
7. Секреты в `backend/.env` и `ops/.env` — **gitignored**, не коммитить
8. API ключи: Suno (`SUNO_API_KEY`), OpenAI/APIYI (`OPENAI_API_KEY`/`APIYI_KEY`) — обязательны для работы генерации
9. Агент (поиск артиста): работает через `OPENROUTER_API_KEY` → Perplexity sonar
10. `S3_PUBLIC_BASE_URL` локально = `http://localhost:9000/riffa-media`, иначе медиафайлы не загрузятся

**Где что лежит:**
- Агент (AI-chat): `backend/app/api/v1/agent.py` + `backend/app/services/artist_research.py`
- Генерация музыки: `backend/app/services/suno.py` + `backend/app/tasks/__init__.py`
- Промт-инженер: `backend/app/services/lyrics.py` + `backend/app/services/prompt_engineering.py`
- Фронтенд агента: `frontend/src/components/studio/AgentChat.tsx`
- Типы API: `frontend/src/lib/api/client.ts`

---

## Частые проблемы

**Backend не стартует — ошибка подключения к БД:**
```bash
docker compose logs postgres  # проверить что postgres healthy
docker compose restart backend
```

**Фронтенд показывает ошибки API (401/502):**
```bash
curl http://localhost:8001/health  # backend должен отвечать {"status":"ok"}
```

**MinIO 403 при загрузке файлов:**
→ bucket `riffa-media` не создан или нет public policy — см. Шаг 4.2

**Сгенерированный трек есть в БД, но не воспроизводится:**
→ `S3_PUBLIC_BASE_URL` указывает на prod-сервер вместо localhost — исправь в `backend/.env`

**`alembic upgrade head` — ошибка "relation already exists":**
→ БД уже инициализирована (импортирована с сервера). Можно игнорировать или:
```bash
docker compose exec backend alembic stamp head
```

# RIFFA Web

Веб-версия сервиса RIFFA — генерация музыки, текстов, обложек и звуковых эффектов через Suno, OpenAI, Nano Banana и ElevenLabs.

> Статус: **этап 0/1** — скелет монорепо и перенос дизайна прототипа в компонентную систему.

## Структура

```
riffa-web/
├── backend/                 # FastAPI + SQLAlchemy + Alembic
│   ├── app/
│   │   ├── api/v1/          # роутеры
│   │   ├── core/            # конфиг, зависимости, безопасность
│   │   ├── db/              # модели + миграции Alembic
│   │   ├── schemas/         # Pydantic-схемы
│   │   ├── services/        # обёртки над Suno / OpenAI / NanoBanana / ElevenLabs
│   │   ├── tasks/           # фоновые задачи (Arq)
│   │   └── payments/        # Robokassa, Telegram Stars, FreeKassa, Tinkoff
│   ├── tests/
│   ├── alembic.ini
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/                # Vite + React + TypeScript
│   ├── src/
│   │   ├── components/      # переиспользуемые UI-компоненты
│   │   ├── pages/           # страницы (Studio, Profile, Library, Radio, Agent)
│   │   ├── lib/             # API-клиент, утилиты
│   │   └── styles/          # дизайн-токены и глобальные стили
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── ops/
│   ├── docker-compose.yml   # postgres + redis + backend + worker + frontend
│   └── nginx/
└── .github/workflows/       # CI: lint + tests + build
```

## Быстрый старт (dev)

### Вариант 1: Docker Compose (рекомендуется)

```bash
cd ops
docker compose up --build
```

После запуска:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api/v1/health
- OpenAPI docs: http://localhost:8000/docs

### Вариант 2: Локально без Docker

Понадобятся: Python 3.12, Node.js 20, Postgres 16, Redis 7.

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e .[dev]
cp .env.example .env  # заполнить значения
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend (в новом терминале)
cd frontend
npm install
npm run dev
```

## Переменные окружения

Шаблон в `backend/.env.example`. Реальные значения хранить в секрет‑менеджере, **не коммитить**.

Минимум для dev:
```
DATABASE_URL=postgresql+asyncpg://riffa:riffa@localhost:5432/riffa
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=<сгенерированный 32-байтный ключ>
TELEGRAM_BOT_TOKEN=<для проверки initData / Login Widget>
SUNO_API_KEY=<ключ Suno API>
OPENAI_API_KEY=<ключ OpenAI или APIYI>
NANOBANANA_API_KEY=<ключ Nano Banana>
NANOBANANA_BASE_URL=<base URL>
ROBOKASSA_MERCHANT_LOGIN=<логин>
ROBOKASSA_PASSWORD_1=<пароль 1>
ROBOKASSA_PASSWORD_2=<пароль 2>
```

## Дорожная карта

См. `RIFFA_WEB_PLAN.md` в корне.

Текущая итерация:
- [x] Скелет монорепо
- [x] Перенос дизайн-токенов и базового лейаута прототипа в Vite/React/TS
- [x] FastAPI skeleton с health-endpoint и `/api/v1/models`
- [x] SQLAlchemy + Alembic — первые модели (users, wallets, generations, transactions)
- [ ] Telegram-login + email magic-link
- [ ] Robokassa + Telegram Stars
- [ ] Очередь Arq + WebSocket прогресс
- [ ] Реальные интеграции Suno / OpenAI

## Лицензия и авторские права

Все права на бренд RIFFA принадлежат правообладателю. Тексты оферты и политики — `frontend/src/pages/Legal/*` (взяты из Telegram-бота).

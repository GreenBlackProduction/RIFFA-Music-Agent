---
type: documentation
category: architecture
tags: [architecture, structure, monorepo]
related: [[02-Infrastructure]], [[20-Design-System]]
---

# Архитектура RIFFA Web

## Структура монорепозитория

```
riffa-web/
├── frontend/          # Vite + React + TypeScript
│   ├── src/pages/     # [[21-Pages|Страницы]]
│   ├── src/components/  # [[22-Components|Компоненты]]
│   ├── src/store/     # Zustand (player, generationStore)
│   ├── src/lib/       # api/client, library, sunoConstraints, i18n, auth
│   └── public/        # icons/ (MP4 модулей), radio/ (GIF настроений)
├── backend/           # FastAPI + SQLAlchemy + Alembic + Arq
│   ├── app/api/v1/    # [[10-Authentication|auth]], [[11-Generation|generate]], health, history
│   ├── app/services/  # suno, lyrics, prompt_engineering, wallet
│   ├── app/auth/      # email (bcrypt), telegram
│   └── logs/          # generations.log
└── ops/               # docker-compose.yml
```

## Технологический стек

### Frontend
- **Framework:** React 18 + TypeScript
- **Build:** Vite (lazy loading, code splitting)
- **State:** Zustand
- **Routing:** React Router
- **Styling:** CSS Modules + CSS Variables
- **Fonts:** [[20-Design-System#Fonts|Sora, Manrope, JetBrains Mono]]

### Backend
- **Framework:** FastAPI
- **ORM:** SQLAlchemy (async)
- **Migrations:** Alembic
- **Queue:** Arq (Redis-based)
- **Auth:** JWT cookies + bcrypt

### Infrastructure
- **Database:** PostgreSQL 16
- **Cache/Queue:** Redis 7
- **Storage:** MinIO (S3-compatible)
- **Container:** Docker Compose

## Модели данных

### Основные таблицы
- `users` — пользователи
- `wallets` — балансы токенов
- `generations` — история генераций
- `transactions` — транзакции
- `radio_votes` — голоса в радио

См. [[02-Infrastructure#Database|Подробнее о БД]]

## API архитектура

### Эндпоинты v1
- `/api/v1/auth/*` — [[10-Authentication|аутентификация]]
- `/api/v1/generate/*` — [[11-Generation|генерация контента]]
- `/api/v1/agent/*` — [[12-Agent|AI агент]]
- `/api/v1/radio/*` — [[13-Radio|радио]]
- `/api/v1/users/*` — [[14-Profile|профиль]]
- `/api/v1/tracks/*` — управление треками
- `/ws/progress/{gen_id}` — WebSocket для статуса генерации

## Интеграции

### Внешние сервисы
- **Suno API** — генерация музыки (V5.5)
- **OpenAI GPT-4o** — AI агент, промт-инжиниринг (через APIYI proxy)
- **NanoBanana** — генерация обложек (через APIYI proxy)
- **ElevenLabs** — TTS (зарезервировано)
- **Robokassa** — платежи
- **Telegram** — Login Widget, Stars

См. [[03-Environment|Переменные окружения]]

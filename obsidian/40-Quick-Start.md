---
type: guide
category: quickstart
tags: [setup, installation, getting-started]
related: [[02-Infrastructure]], [[03-Environment]]
---

# Быстрый старт

## Первый запуск (новая машина)

### 1. Предварительные требования

**Установить:**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Python 3.11+](https://www.python.org/downloads/)
- [Node.js 18+](https://nodejs.org/)
- [Git](https://git-scm.com/)

**Проверить:**
```powershell
docker --version
python --version
node --version
git --version
```

### 2. Клонировать репозиторий

```powershell
git clone <repo-url>
cd riffaweb5
```

### 3. Первичная настройка

```powershell
.\start-dev.ps1
```

**Что делает скрипт:**
1. Создаёт Python venv
2. Устанавливает backend зависимости
3. Устанавливает frontend зависимости (npm install)
4. Применяет миграции Alembic
5. Создаёт `.env.dev` из `.env.example`

### 4. Настроить переменные окружения

Отредактировать `backend/.env.dev`:

```env
# Обязательные
SECRET_KEY=<сгенерировать новый>
ADMIN_TELEGRAM_IDS=<твой telegram id>

# API ключи
SUNO_API_KEY=<твой ключ>
OPENAI_API_KEY=<твой ключ>
# ... остальные
```

См. [[03-Environment|Полный список переменных]]

### 5. Запустить Docker

```powershell
# Открыть Docker Desktop из меню Пуск
# Дождаться "Engine running"

# Проверить
docker ps
```

### 6. Запустить всё

```powershell
.\start-all.ps1
```

**Откроется одно окно PowerShell с логами:**
- `[BACK]` — Backend (FastAPI)
- `[WORK]` — Worker (Arq)
- `[FRONT]` — Frontend (Vite)

### 7. Открыть в браузере

🌐 **Сайт:** http://localhost:5173  
📡 **API Docs:** http://localhost:8000/docs  
🗄️ **MinIO Console:** http://localhost:9001

---

## Ежедневный запуск

```powershell
# 1. Открыть Docker Desktop (если не запущен)
# 2. Запустить проект
.\start-all.ps1
```

**Остановка:** `Ctrl+C` в окне PowerShell

---

## Структура проекта

```
riffaweb5/
├── frontend/          # React + TypeScript + Vite
├── backend/           # FastAPI + SQLAlchemy + Arq
├── ops/               # docker-compose.yml
├── start-all.ps1      # Основной скрипт запуска
├── start-dev.ps1      # Первичная настройка
└── obsidian/          # Документация (эта папка)
```

---

## Порты

| Сервис | Порт | URL |
|--------|------|-----|
| Frontend | 5173 | http://localhost:5173 |
| Backend | 8000 | http://localhost:8000 |
| PostgreSQL | 5432 | localhost:5432 |
| Redis | 6379 | localhost:6379 |
| MinIO API | 9000 | http://localhost:9000 |
| MinIO Console | 9001 | http://localhost:9001 |

---

## Admin аккаунт

**Email:** `amsergeyzelenkin@gmail.com`  
**Пароль:** `Helloprime173987-`  
**Telegram ID:** `8263964465`

**God mode:** Токены не списываются, нет ограничений

См. [[10-Authentication#Admin God Mode]]

---

## Полезные команды

### Backend

```powershell
cd backend

# Активировать venv
..\venv\Scripts\activate

# Запустить сервер
python -m uvicorn app.main:app --reload

# Миграции
alembic upgrade head
alembic revision -m "название"

# Тесты
pytest -v
```

### Frontend

```powershell
cd frontend

# Запустить dev сервер
npm run dev

# Сборка
npm run build

# Lint
npm run lint

# Type check
npx tsc --noEmit
```

### Docker

```powershell
# Запустить сервисы
docker-compose up -d

# Остановить
docker-compose down

# Логи
docker-compose logs -f

# Перезапустить один сервис
docker-compose restart db
```

---

## Troubleshooting

### Docker не запускается

1. Открыть Docker Desktop
2. Дождаться "Engine running" (1-2 минуты)
3. Проверить: `docker ps`

### Порт занят

```powershell
# Найти процесс на порту 8000
netstat -ano | findstr :8000

# Убить процесс
taskkill /F /PID <pid>
```

### База данных не подключается

```powershell
# Проверить контейнер
docker ps | findstr postgres

# Перезапустить
docker-compose restart db
```

### Зависимости не установлены

```powershell
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

См. [[42-Troubleshooting|Полный гайд по решению проблем]]

---

## Следующие шаги

1. 📖 Изучить [[01-Architecture|Архитектуру]]
2. 🎨 Посмотреть [[20-Design-System|Дизайн-систему]]
3. 🚀 Попробовать [[11-Generation|Генерацию]]
4. 🤖 Пообщаться с [[12-Agent|AI Агентом]]
5. 📋 Проверить [[31-In-Progress|Текущие задачи]]

# RIFFA — Развёртывание на Windows (для локального Claude)

> Состояние на старте:
> - Docker v29 ✅, Docker Compose v5 ✅, Node v22 ✅
> - Код склонирован в `C:\Users\Razer\riffa` (git clone с GitHub)
> - Целевая папка проекта: `D:\Боты\RiffaBot\ВЭБ\` (опционально — можно работать прямо из `C:\Users\Razer\riffa`)

---

## Шаг 0 — Определить рабочую папку

Код уже есть в `C:\Users\Razer\riffa`. Если хочешь переместить в `D:\Боты\RiffaBot\ВЭБ\`:
```powershell
Move-Item C:\Users\Razer\riffa D:\Боты\RiffaBot\ВЭБ\riffa
```
Или работай прямо из `C:\Users\Razer\riffa` — без разницы.

Дальше в инструкции используется `$PROJECT` — замени на свой путь:
```powershell
$PROJECT = "C:\Users\Razer\riffa"
# или
$PROJECT = "D:\Боты\RiffaBot\ВЭБ\riffa"
```

---

## Шаг 1 — Создать файл паролей инфраструктуры

```powershell
cd $PROJECT
Copy-Item ops\.env.example ops\.env
```

Открой `ops\.env` в любом редакторе и задай пароли (можно любые, это только локально):
```
REDIS_PASSWORD=localpass123
POSTGRES_PASSWORD=localpass123
MINIO_ROOT_USER=riffa
MINIO_ROOT_PASSWORD=localpass123
```

---

## Шаг 2 — Создать файл API-ключей backend

```powershell
Copy-Item backend\.env.local.example backend\.env
```

Открой `backend\.env` и заполни. **Обязательные** поля (без них генерация не работает):

```env
# Инфраструктура — замени localpass123 на то же что в ops\.env
DATABASE_URL=postgresql+asyncpg://riffa:localpass123@localhost:5432/riffa
REDIS_URL=redis://:localpass123@localhost:6379/0
S3_SECRET_KEY=localpass123
S3_ACCESS_KEY=riffa

# !!! Локально — ОБЯЗАТЕЛЬНО localhost, не riffastudio.site !!!
S3_PUBLIC_BASE_URL=http://localhost:9000/riffa-media

# API-ключи для генерации музыки
SUNO_API_KEY=вставь_ключ
OPENAI_BASE_URL=https://api.apiyi.com/v1
OPENAI_API_KEY=вставь_ключ
APIYI_KEY=вставь_ключ

# Cover art
NANOBANANA_API_KEY=вставь_ключ
NANOBANANA_BASE_URL=https://api.apiyi.com/v1

# Агент (Perplexity поиск артиста)
OPENROUTER_API_KEY=sk-or-v1-вставь_ключ

# Прочее (опционально)
LASTFM_API_KEY=
TELEGRAM_BOT_TOKEN=
ADMIN_TELEGRAM_IDS=
```

Остальные поля в файле — оставь как есть (там уже правильные дефолты для локальной разработки).

---

## Шаг 3 — Запустить все сервисы

```powershell
cd $PROJECT\ops
docker compose up --build
```

**Первый запуск ~5-10 минут** — Docker скачивает образы и собирает backend.

Следи за логами. Готово когда увидишь:
```
ops-backend-1  | INFO:     Application startup complete.
ops-frontend-1 | VITE v6.x.x  ready in ... ms
```

Проверка в браузере:
- http://localhost:5173 — фронтенд ✅
- http://localhost:8001/health → `{"status":"ok"}` — backend ✅
- http://localhost:9001 — MinIO консоль ✅

---

## Шаг 4 — Первый запуск: инициализация БД и MinIO

**Выполнить один раз после первого старта:**

### 4.1 — Применить миграции базы данных

В новом терминале:
```powershell
cd $PROJECT\ops
docker compose exec backend alembic upgrade head
```

Ожидаемый вывод: `INFO  [alembic.runtime.migration] Running upgrade ... -> ...`

### 4.2 — Создать bucket в MinIO

Открой http://localhost:9001 в браузере:
- Логин: `riffa`
- Пароль: `localpass123` (то что задал в ops\.env)

Далее:
1. **Buckets** → **Create Bucket**
2. Name: `riffa-media`
3. Нажать Create Bucket
4. Открыть bucket → **Access Policy** → выбрать **Public** → Save

Или через PowerShell если установлен `mc` (MinIO client):
```powershell
# Скачать mc.exe: https://dl.min.io/client/mc/release/windows-amd64/mc.exe
# Положить в PATH или в папку проекта

.\mc.exe alias set local http://localhost:9000 riffa localpass123
.\mc.exe mb local/riffa-media
.\mc.exe anonymous set public local/riffa-media
```

---

## Шаг 5 — Готово. Обычная работа

**Открыть сайт:** http://localhost:5173

**После изменений в Python-коде (backend):**
```powershell
cd $PROJECT\ops
docker compose up --build -d backend worker
```

**Фронтенд** (React/Vite) обновляется автоматически — сохранил файл → браузер обновился.

**Посмотреть логи:**
```powershell
docker compose logs -f backend    # только backend
docker compose logs -f            # все сервисы
```

**Остановить:**
```powershell
docker compose down
```

**Остановить и удалить все данные (БД, файлы):**
```powershell
docker compose down -v
```

---

## Структура проекта

```
riffa/
├── backend/              ← FastAPI (Python 3.12)
│   ├── app/
│   │   ├── api/v1/       ← эндпоинты: agent.py, generate.py, radio.py...
│   │   ├── services/     ← suno.py, lyrics.py, artist_research.py...
│   │   ├── db/migrations ← миграции Alembic
│   │   └── core/config.py ← все настройки
│   ├── .env              ← API-ключи (создаётся в Шаге 2, gitignored)
│   └── .env.local.example ← шаблон
├── frontend/             ← React + Vite (TypeScript)
│   └── src/components/studio/AgentChat.tsx ← главный компонент агента
├── ops/
│   ├── docker-compose.yml ← всё окружение
│   └── .env              ← пароли инфры (создаётся в Шаге 1, gitignored)
└── LOCAL-DEPLOY-WINDOWS.md ← этот файл
```

---

## Частые проблемы

**`docker compose up` не находит .env:**
```
WARN "ops/.env" not found
```
→ Вернись к Шагу 1, создай файл `ops\.env`

**Backend крашится при старте — ошибка подключения к БД:**
```
asyncpg.exceptions.InvalidPasswordError
```
→ Пароль в `backend\.env` (DATABASE_URL) не совпадает с `POSTGRES_PASSWORD` в `ops\.env`

**Генерация не запускается — 422 или 500:**
→ Проверь `SUNO_API_KEY` и `OPENAI_API_KEY` в `backend\.env`

**Медиафайлы не загружаются (404 на картинки/аудио):**
→ `S3_PUBLIC_BASE_URL` в `backend\.env` должен быть `http://localhost:9000/riffa-media`
→ Bucket `riffa-media` должен быть создан (Шаг 4.2)

**Порт занят (`bind: address already in use`):**
```powershell
# Найти что занимает порт 5173:
netstat -ano | findstr :5173
# Убить процесс по PID:
taskkill /PID <номер> /F
```

**`alembic upgrade head` — ошибка "relation already exists":**
→ БД уже инициализирована. Запусти:
```powershell
docker compose exec backend alembic stamp head
```

# RIFFA Web - План работы после перезагрузки

## 🎯 Текущая задача
Исправить модуль записи голоса и загрузки файлов для генерации кавера.

## ✅ Что уже сделано

### Фронтенд
1. **Создан компонент VoiceRecorder** с визуализацией звуковых волн
   - `frontend/src/components/studio/VoiceRecorder.tsx`
   - `frontend/src/components/studio/VoiceRecorder.css`
   - Модальное окно с Web Audio API визуализацией

2. **Обновлён StudioPage.tsx**
   - Добавлены функции записи: `startRecording()`, `stopRecording()`, `cancelRecording()`
   - Интегрирован компонент VoiceRecorder

3. **Обновлён API клиент**
   - `frontend/src/lib/api/client.ts`
   - Эндпоинт изменён на `/api/v1/generate/upload-cover-url`

4. **Конфигурация Vite**
   - `frontend/vite.config.ts`
   - Прокси настроен на `http://localhost:8002`

### Бэкенд
1. **Создан эндпоинт загрузки**
   - `backend/app/api/v1/generate.py`
   - POST `/api/v1/generate/upload-cover-url`
   - Возвращает presigned URL для S3/MinIO
   - Fallback на mock URLs если MinIO недоступен

2. **Установлены зависимости**
   - sentry-sdk, loguru, arq, boto3, asyncpg, aiosqlite

3. **Конфигурация**
   - `backend/.env.dev` - временно переключено на SQLite (НЕ РАБОТАЕТ - нужен PostgreSQL!)

## ❌ Текущая проблема

**База данных не работает:**
- PostgreSQL требует Docker
- Docker Desktop не запускается
- SQLite не поддерживает UUID (используется в моделях)
- Бэкенд возвращает 500 Internal Server Error

## 🔧 Что делать после перезагрузки

### ШАГ 1: Запустить Docker Desktop
```
1. Открыть Docker Desktop из меню Пуск
2. Дождаться "Engine running" (1-2 минуты)
3. Проверить: docker ps
```

### ШАГ 2: Запустить сервисы
```powershell
cd "D:\Боты\RiffaBot\ВЭБ\Stable vers\riffaweb5"
docker-compose up -d
```

Запустятся:
- PostgreSQL (порт 5432)
- Redis (порт 6379)  
- MinIO (порты 9000, 9001)

### ШАГ 3: Вернуть PostgreSQL
Отредактировать `backend/.env.dev`:
```
DATABASE_URL=postgresql+asyncpg://riffa:riffa@localhost:5432/riffa
```

### ШАГ 4: Запустить бэкенд
```powershell
cd "D:\Боты\RiffaBot\ВЭБ\Stable vers\riffaweb5\backend"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8002
```

### ШАГ 5: Запустить фронтенд
```powershell
cd "D:\Боты\RiffaBot\ВЭБ\Stable vers\riffaweb5\frontend"
npm run dev
```

### ШАГ 6: Тестировать
```
1. Открыть http://localhost:5173
2. Залогиниться
3. Перейти в Studio
4. Попробовать запись голоса (должно открыться модальное окно)
5. Попробовать загрузку файла
```

## 📝 Важные порты

- Фронтенд: **5173**
- Бэкенд: **8002**
- PostgreSQL: **5432**
- Redis: **6379**
- MinIO API: **9000**
- MinIO Console: **9001**

## 🐛 Решённые проблемы

1. ✅ "uploadCoverFile is not defined" - добавлен импорт
2. ✅ 405 Method Not Allowed - убиты дублирующиеся процессы
3. ✅ Отсутствующие зависимости - установлены
4. ✅ Конфликт портов - бэкенд на 8002
5. ⏳ База данных - требует Docker

## 🔍 Альтернатива (если Docker не работает)

1. Установить PostgreSQL для Windows
2. Создать БД: `riffa` / `riffa:riffa`
3. Запустить миграции Alembic
4. Установить Redis для Windows

## 📂 Ключевые файлы

- `backend/.env.dev` - конфигурация БД
- `frontend/vite.config.ts` - прокси на 8002
- `backend/app/api/v1/generate.py` - эндпоинт загрузки
- `frontend/src/components/studio/VoiceRecorder.tsx` - компонент записи
- `frontend/src/pages/StudioPage.tsx` - интеграция записи

---
**Дата**: 2026-05-11
**Статус**: Ожидание перезагрузки и запуска Docker

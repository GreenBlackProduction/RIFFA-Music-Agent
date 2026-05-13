# RIFFA Web - План работы

## Дата обновления: 2026-05-12

## Выполненные задачи (2026-05-12)

### 1. Прогресс-бар генерации — мобильная версия
- **Файл**: `frontend/src/components/layout/ActiveGenerations.css`
- Прогресс-бар перемещён вниз страницы при компактном отображении (max-width: 1180px)
- `position: fixed; bottom: 0` вместо `top`
- Плеер тоже поднят с учётом нового расположения

### 2. Кнопка шеринга трека
- **Файл**: `frontend/src/components/studio/FileActions.tsx`
- Добавлена кнопка "Поделиться треком" в меню молнии (bolt menu)
- Вызывает `shareGeneration(generationId)` — генерирует уникальную ссылку
- Ссылка автоматически копируется в буфер обмена
- Гостевой пользователь попадает на `/s/{shareId}` — может только слушать

### 3. Модуль генерации кавера
- **Файлы**: `frontend/src/components/studio/VoiceRecorder.tsx`, `frontend/src/pages/StudioPage.tsx`, `backend/app/services/suno.py`, `backend/app/tasks/__init__.py`
- Исправлена визуализация записи голоса: добавлено состояние `analyserReady` для корректной синхронизации Web Audio API с рендерингом canvas
- Очистка потоков микрофона при отмене/закрытии записи
- MediaRecorder теперь использует timeslice (250ms) для потоковой записи
- Улучшена обработка ошибок Suno API — теперь выводится код и текст ошибки
- Добавлено предупреждение в лог если upload URL — localhost (Suno не может скачать)

### 4. Загрузка аватара профиля
- **Файл**: `backend/app/api/v1/users.py`
- Эндпоинт `POST /users/avatar` теперь возвращает `{"avatar_url": "..."}` (раньше ничего не возвращал)

### 5. Обложка — полноэкранный просмотр
- **Файл**: `frontend/src/components/layout/ActiveGenerations.tsx`
- Превью обложки теперь рендерится через `createPortal(document.body)` — открывается поверх всего интерфейса, а не внутри сайдбара

### 6. Корзина (удаление файлов)
- **Файл**: `backend/app/api/v1/history.py`
- Маршруты `/trash` и `/trash/purge` перенесены ПЕРЕД `/{gen_id}` — раньше FastAPI перехватывал `/trash` как UUID и возвращал 404
- Фронтенд уже имел полную реализацию корзины (фильтр, восстановление, очистка)

### 7. Радио — мультивариантные треки
- **Файл**: `frontend/src/lib/api/client.ts`
- `toggleHistoryRadio` теперь всегда отправляет `track_index` (и при публикации, и при снятии с радио)
- Раньше при снятии V2 с радио удалялись все варианты (track_index не передавался)

### 8. Логотип сайта
- Логотип сайдбара уже совпадает с логотипом страницы входа (`/riffa-logo.png` + "RIFFAStudio")
- Логотип кликабельный — ведёт на `/studio` через `<NavLink>`

### 9. Звуковые эффекты — кнопка "Свой звук"
- **Файл**: `frontend/src/pages/StudioPage.tsx`
- Кнопка "Свой звук" теперь выделена классом `chip--custom` (подсвечивается)
- При нажатии открывается текстовое поле для ввода своего варианта звука
- Добавлено поле `sfxCustomSource` в состояние
- Значение используется в `buildPrompt` при генерации

### 10. Изображения — скачивание и улучшение
- **Файлы**: `frontend/src/components/studio/FileActions.tsx`, `frontend/src/components/studio/LibraryCard.tsx`
- Для cover_art файлов добавлена кнопка скачивания (используется `coverUrl` как downloadUrl)
- Кнопка молнии (bolt menu) для изображений с опцией "Улучшить качество (Pro)" — генерирует новую обложку через `nano-banana-pro`
- Кнопка "Поделиться" также доступна для изображений

### 11. Агент — вопрос о тексте на обложке
- **Файл**: `backend/app/api/v1/agent.py`
- STEP 4 в COVER ART FLOW разбит на три под-шага (4a, 4b, 4c)
- 4a: Спрашивает ТОЛЬКО "Нужен ли текст?" и ждёт ответа
- 4b: Если "да" — спрашивает "Какой текст?" и ждёт
- 4c: Если "нет" — добавляет "no text, no typography" в prompt

### 12. Анализ и оптимизация
- Удалены отладочные `console.log` из StudioPage.tsx (загрузка файлов кавера)
- Структура кода проверена — нет критических ошибок
- Маршруты API упорядочены для корректной работы FastAPI

---

## Архитектура проекта

### Стек
- **Фронтенд**: React + TypeScript + Vite (порт 5173)
- **Бэкенд**: FastAPI + SQLAlchemy + Arq (порт 8002)
- **БД**: PostgreSQL (5432)
- **Кэш/очереди**: Redis (6379)
- **Хранилище**: MinIO S3 (9000/9001)
- **AI**: Suno API v5.5, OpenAI GPT-4o, NanoBanana

### Ключевые файлы
- `frontend/src/pages/StudioPage.tsx` — главная страница студии
- `frontend/src/components/studio/FileActions.tsx` — действия с файлами
- `frontend/src/components/studio/LibraryCard.tsx` — библиотека файлов
- `frontend/src/lib/api/client.ts` — API клиент
- `frontend/src/lib/library.ts` — типы и утилиты библиотеки
- `backend/app/api/v1/history.py` — API истории генераций
- `backend/app/api/v1/agent.py` — AI-агент промпт-инженер
- `backend/app/services/suno.py` — клиент Suno API
- `backend/app/tasks/__init__.py` — фоновые задачи генерации

### Порты
| Сервис | Порт |
|--------|------|
| Фронтенд (Vite) | 5173 |
| Бэкенд (FastAPI) | 8002 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO API | 9000 |
| MinIO Console | 9001 |

---
**Статус**: Все 12 задач выполнены

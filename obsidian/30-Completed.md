---
type: documentation
category: tasks
tags: [completed, done, changelog]
related: [[31-In-Progress]], [[32-Backlog]]
---

# Выполненные задачи

## Инфраструктура ✅

- [x] Монорепо-скелет (frontend + backend + ops)
- [x] Docker Compose: postgres 16, redis 7, minio
- [x] Vite: lazy loading + manualChunks
- [x] FastAPI: health, роутеры v1, SQLAlchemy async + Alembic
- [x] Модели БД: users, wallets, generations, transactions, radio_votes
- [x] Alembic миграции 001-004
- [x] `.env.dev` настроен
- [x] **`start-all.ps1`** — единый запуск с цветными префиксами
- [x] Исправлен конфликт uvicorn (системный vs venv)

См. [[02-Infrastructure|Инфраструктура]]

## Аутентификация ✅

- [x] Email/password регистрация и вход
- [x] Хеширование через bcrypt (без passlib)
- [x] Миграция 004: `password_hash VARCHAR(128)`
- [x] Email magic-link (legacy)
- [x] JWT cookie (`riffa_session`)
- [x] **Admin god mode** через `ADMIN_TELEGRAM_IDS`
- [x] Telegram Login Widget
- [x] Бонус 5 токенов новому пользователю
- [x] Смена никнейма
- [x] Смена пароля

См. [[10-Authentication|Аутентификация]]

## Дизайн-система ✅

- [x] Дизайн-токены: цвета, шрифты, радиусы, тени
- [x] **Sora + Manrope + JetBrains Mono** шрифты
- [x] **"RIFFAStudio"** брендовый текст с зелёным "Studio"
- [x] Единая система активных состояний кнопок
- [x] Аватар пользователя: `aspect-ratio: 1/1`
- [x] Глобальный плеер: bolt-меню, скачивание, обложка
- [x] Профиль: hover-glow без постоянных теней

См. [[20-Design-System|Дизайн-система]]

## Страницы ✅

- [x] **StudioPage** — тайлы модулей с MP4-иконками
- [x] **RadioPage** — плейлист с GIF-настроениями
- [x] **ProfilePage** — hero-блок с inline-редактированием
- [x] **AgentPage** — живой GPT-4o чат
- [x] **LoginPage** — два таба + Telegram Widget
- [x] **SharePage** — публичная страница трека
- [x] Логотип → /studio

См. [[21-Pages|Страницы]]

## Иконки ✅

- [x] **MP4 иконки модулей** с `mix-blend-mode: screen`
- [x] **GIF настроений** на RadioPage
- [x] **Пауза GIF** при скрытой вкладке (Page Visibility API)
- [x] RadioPage изолирован через `React.lazy()`

## Генерация (Suno) ✅

- [x] Song → Suno V5.5
- [x] Instrumental
- [x] Sound Effect
- [x] Cover Song
- [x] WebSocket `/ws/progress/{gen_id}`
- [x] **Admin god mode** — проверка баланса пропускается
- [x] **Название трека** в итоговой сводке
- [x] **Логирование Suno-пейлоада** в `logs/generations.log`

См. [[11-Generation|Генерация]]

## Lyrics-first Flow ✅

- [x] State machine `idle → generating → review → approved`
- [x] `POST /api/v1/lyrics` — Suno пишет текст
- [x] Блокировка параметров до `approved`
- [x] Custom-режим и Instrumental-режим

## GPT Промт-инжинер ✅

- [x] 36 жанров, 12 настроений, 5 темпов
- [x] `LyricsClient.enrich_music_prompt()` — 150-4500 символов
- [x] Fallback на детерминистский `build_suno_style`

## Умный AgentChat ✅

- [x] `POST /api/v1/agent/chat` — stateless
- [x] **StrictMode-баг исправлен** (`bootedRef` + `cancelled`)
- [x] **Аватар агента** — `riffa-logo.png`
- [x] **401 ошибка** → кнопка "Войти"
- [x] **Динамический статус ожидания** с фазами
- [x] **Системный промпт переработан** — HARD FINALIZATION + LYRICS FLOW
- [x] **Приветственное сообщение**
- [x] Intent-роутинг
- [x] `agent_prompt` передаётся воркеру

См. [[12-Agent|AI Агент]]

## Радио ✅

- [x] `is_public` + `published_track_index`
- [x] CRUD: list, stats, mood-counts, collection, vote, play
- [x] Денормализованные счётчики + `radio_votes`
- [x] Лайк на своём треке → автопубликация

См. [[13-Radio|Радио]]

## Track Naming + ID3 ✅

- [x] Секция «Название трека» (Авто / Своё)
- [x] `POST /api/v1/tracks/auto-title` — GPT-4o генерирует
- [x] `GET /api/v1/tracks/:id/:idx/download` — mp3 с ID3v2.3
- [x] **SFX-названия**: `{prompt} (RIFFA)`
- [x] **WAV-названия**: `{title} WAV`
- [x] **WAV/SFX в сайдбаре**: кнопка ▶ после завершения

## Профиль ✅

- [x] **Inline-редактирование никнейма**
- [x] **Форма смены пароля** в hero-блоке
- [x] 4 пакета токенов, способы оплаты
- [x] **Реструктуризация сетки** — Токены + Файлы в первой строке
- [x] **Файлы** — 1 столбец, прокрутка
- [x] **Корзина** — modal с soft-deleted файлами
- [x] **Аватар** — клик → file picker, брендированная заглушка
- [x] **Magnetic delete** — мгновенное исчезновение + анимация взрыва

См. [[14-Profile|Профиль]]

## Performance ✅

- [x] Animated WebP для тяжёлых GIF
- [x] React.lazy() на всех страницах
- [x] Page Visibility API — пауза GIF
- [x] `content-visibility: auto` на карточках

## UX / Notifications ✅

- [x] **Звук уведомления** — кастомный RIFFA MP3

## Mobile Player ✅

- [x] ≤560px: `flex-direction: column`
- [x] Полный заголовок трека
- [x] `padding-bottom: 190px` на `.main`

## Критические баги исправлены ✅

- [x] **Воркер не запускался** — `arq` не поддерживает `--env-file`
- [x] **`style > 1000 символов`** — жёсткий клампинг
- [x] **Имена артистов в промпте** — тройная защита
- [x] **Логирование Suno-пейлоадов**

## Тестирование ✅

- [x] Backend: 62 passed
- [x] Frontend lint: 0 warnings
- [x] TypeScript: 0 errors

---

**Последнее обновление:** 2026-05-11

См. также:
- [[31-In-Progress|Текущие задачи]]
- [[32-Backlog|Бэклог]]
- [[33-Technical-Debt|Технический долг]]

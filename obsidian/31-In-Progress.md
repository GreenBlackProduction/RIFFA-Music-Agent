---
type: documentation
category: tasks
tags: [in-progress, current, wip]
related: [[30-Completed]], [[32-Backlog]]
---

# Текущие задачи

> **Обновлено:** 2026-05-11

## 🎨 NanoBanana Cover Art {#Cover Art}

**Статус:** Backend готов, нужна интеграция

**Задачи:**
- [ ] Привязать 3 модели к backend (Nano Banana / 2 / Pro)
- [ ] Тестирование через APIYI proxy
- [ ] Обработка ошибок и таймаутов
- [ ] Сохранение результата в MinIO

**Эндпоинт:** `POST /api/v1/generate/cover_art`

**UI готов:**
- Модальное окно с выбором модели
- Стоимость: 1/2/3 токена
- Время: 1-10 / 10-30 / 30-60 сек

**Связано:** [[11-Generation#Cover Art]]

---

## 📤 Cover Song Upload Pipeline {#Upload Pipeline}

**Статус:** Частично реализовано

**Проблема:** Ошибка "Forbidden" при загрузке в MinIO

**Что сделано:**
- [x] Эндпоинт `POST /api/v1/generate/upload-cover-url`
- [x] Presigned URL генерация
- [x] CORS настройка MinIO
- [x] Frontend компонент VoiceRecorder
- [x] Интеграция в StudioPage

**Что осталось:**
- [ ] Исправить ошибку загрузки (SignatureDoesNotMatch)
- [ ] Тестирование полного flow
- [ ] Автоматическая передача в `generate/cover_song`
- [ ] Обработка ошибок загрузки

**Текущая проблема:**
```
SignatureDoesNotMatch: The request signature we calculated 
does not match the signature you provided.
```

**Решение в процессе:**
- [x] Убран Content-Type из presigned URL параметров
- [x] Убран Content-Type header из fetch запроса
- [ ] Тестирование после изменений (ожидает проверки пользователем)

**Последнее обновление:** 2026-05-11 10:30

**Файлы:**
- `backend/app/api/v1/generate.py` — эндпоинт
- `frontend/src/lib/api/client.ts` — uploadCoverFile
- `frontend/src/components/studio/VoiceRecorder.tsx`
- `frontend/src/pages/StudioPage.tsx`

**Связано:** [[11-Generation#Cover Song]]

---

## 💳 Оплата {#Payments}

**Статус:** UI готов, backend не реализован

**Задачи:**

### Robokassa
- [ ] Форма оплаты с выбором пакета
- [ ] Генерация платёжной ссылки
- [ ] Webhook подтверждения оплаты
- [ ] Зачисление токенов на баланс
- [ ] Логирование транзакций

### Telegram Stars
- [ ] Deeplink на бота
- [ ] Обработка платежа через bot API
- [ ] Подтверждение и зачисление
- [ ] Интеграция с ProfilePage

**UI готов:**
- 4 пакета токенов (10/50/100/500)
- Способы оплаты (карта, СБП, Telegram Stars)
- Модальное окно покупки

**Переменные окружения:**
```env
ROBOKASSA_MERCHANT_LOGIN=RIFFA
ROBOKASSA_PASSWORD_1=...
ROBOKASSA_PASSWORD_2=...
ROBOKASSA_TEST_MODE=true
```

**Связано:** [[14-Profile#Tokens]], [[03-Environment#Robokassa]]

---

## 🤖 Агент — дальнейшие улучшения

**Статус:** Базовая функциональность работает

**Задачи:**
- [ ] Явные chip-подсказки в UI после каждого вопроса
- [ ] Красивый рендеринг черновика текста с `[Verse]`/`[Chorus]`
- [ ] Редактирование одобренного текста в полях формы
- [ ] Сохранение истории чата в БД
- [ ] Экспорт чата в текстовый файл

**Связано:** [[12-Agent]]

---

## 🎵 Прочее

### WAV-конвертация
- [ ] `/api/v1/tracks/:id/:idx/wav` — ffmpeg lossless
- [ ] Кнопка "Скачать WAV" в плеере
- [ ] Обработка больших файлов

### Продление треков
- [ ] Suno extend API
- [ ] UI для выбора трека и точки продления
- [ ] Интеграция в StudioPage

### SEO
- [ ] Meta-теги для всех страниц
- [ ] og:image для Share-страниц
- [ ] Sitemap.xml
- [ ] robots.txt

### Share-страница
- [ ] Реальные данные вместо моков
- [ ] Embed player
- [ ] Социальные кнопки

---

**Приоритет:**
1. 🔥 Cover Song Upload Pipeline (критично)
2. 🎨 NanoBanana Cover Art
3. 💳 Оплата
4. 🤖 Агент улучшения

См. также:
- [[30-Completed|Выполненные задачи]]
- [[32-Backlog|Бэклог]]
- [[42-Troubleshooting|Решение проблем]]

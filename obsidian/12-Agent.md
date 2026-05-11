---
type: documentation
category: feature
tags: [ai, gpt, agent, chat]
related: [[11-Generation]], [[21-Pages]]
---

# AI Агент (GPT-4o)

## Обзор

Умный чат-ассистент для создания музыки на базе GPT-4o через APIYI proxy.

**Эндпоинт:** `POST /api/v1/agent/chat`

## Системный промпт

### Структура

1. **FIRST MESSAGE RULE** — приветствие + представление + возможности + вопрос
2. **HARD FINALIZATION REQUIREMENTS** — 5 правил для `done=true`
3. **LYRICS DRAFTING FLOW** — шаги A→E
4. **ADAPTIVE INTERVIEW DEPTH** — 0-3 уточнения в зависимости от брифа
5. **Intent routing** — определение модуля и параметров

### Hard Finalization Requirements

Агент может вернуть `done=true` только если:

1. ✅ Определён тип генерации (song/instrumental/sfx/cover)
2. ✅ Для песни: текст одобрен пользователем
3. ✅ Жанр/настроение/темп выбраны
4. ✅ Пользователь явно подтвердил готовность
5. ✅ Все обязательные параметры заполнены

### Lyrics Drafting Flow

**Шаги:**

**A. Проба темы** — агент уточняет тему, жанр, настроение

**B. Черновик в чате** — агент пишет текст прямо в чат для одобрения

**C. Итерация правок** — пользователь может попросить изменить

**D. Одобрение** — пользователь говорит "ок" / "давай" / "отлично"

**E. Стиль и темп** — агент уточняет финальные параметры

**F. Финализация** — `done=true` с `text_mode=custom`

### Adaptive Interview Depth

- **Богатый бриф** (жанр + настроение + детали) → 0-1 уточнений
- **Средний бриф** (тема + жанр) → 1-2 уточнения
- **Расплывчатый** ("хочу песню") → 2-3 минимум

### Запрет имён артистов

**Правило 6:** Конвертировать "как Dua Lipa" → стилевые дескрипторы

**Примеры:**
- "как Dua Lipa" → "upbeat pop with disco influences, confident female vocals"
- "в стиле Billie Eilish" → "dark pop, whispered vocals, minimalist production"

## API

### Запрос

```http
POST /api/v1/agent/chat
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "Хочу песню про лето"}
  ]
}
```

### Ответ

```json
{
  "message": "Отличная тема! Расскажи подробнее...",
  "done": false,
  "intent": null,
  "suggestions": [
    "Весёлая и энергичная",
    "Романтичная и мечтательная",
    "Ностальгическая"
  ]
}
```

### Intent Routing

Когда `done=true`:

```json
{
  "message": "Готово! Запускаю генерацию...",
  "done": true,
  "intent": {
    "module": "song",
    "params": {
      "description": "Summer love song",
      "text_mode": "custom",
      "lyrics": "[Verse 1]\n...",
      "genre": "Pop",
      "mood": "happy",
      "tempo": "medium",
      "vocal": "female",
      "track_name": "Summer Love"
    }
  }
}
```

## Frontend интеграция

### AgentChat компонент

**Файл:** `frontend/src/components/studio/AgentChat.tsx`

**Props:**
```typescript
interface AgentChatProps {
  onResult?: (result: AgentResult) => void;
  agentInitiates?: boolean;  // true = агент пишет первым
}
```

### Использование

**StudioPage:**
```tsx
<AgentChat 
  onResult={handleAgentResult}
  agentInitiates={false}  // пользователь пишет первым
/>
```

**AgentPage:**
```tsx
<AgentChat 
  onResult={handleAgentResult}
  agentInitiates={true}  // агент пишет первым
/>
```

## UX особенности

### Быстрые ответы (Suggestions)

Бэкенд возвращает `suggestions: list[str]` — фронт рендерит кликабельные чипсы под сообщением агента.

**Пример:**
```json
{
  "suggestions": [
    "Весёлая и энергичная",
    "Романтичная и мечтательная",
    "Ностальгическая"
  ]
}
```

### Динамический статус ожидания

**Фазы:**
1. 🔍 Анализирую запрос (0-5 сек)
2. 💭 Думаю (5-10 сек)
3. ✍ Пишу текст (10+ сек, если lyrics)

**Счётчик времени:** начинается с 5 секунд

**Определение lyrics-фазы:**
- Ключевые слова: "verse", "chorus", "bridge"
- Маркеры: `[Verse]`, `[Chorus]`, `[Bridge]`

### Аватар агента

**Изображение:** `riffa-logo.png`  
**Стиль:** Зелёная рамка с glow

### 401 ошибка

Если пользователь не авторизован → кнопка "Войти в аккаунт" прямо в чате

### Пустой чат

Заглушка: "Напиши первым — агент ответит"

## Приветственное сообщение

```
Привет! Я RIFFA AI — помогу создать твою песню 🎵

Расскажи мне:
• Вокал или инструментал?
• О чём песня? (тема, настроение)
• Есть ли ориентир по жанру или артисту?

Я напишу текст, подберу стиль и запущу генерацию!
```

## StrictMode баг (исправлен)

**Проблема:** `bootedRef` + `cancelled` конфликтовали → агент молчал

**Решение:** Убран флаг `cancelled`, оставлен только `bootedRef`

## Тестирование

```bash
cd backend
pytest tests/test_agent.py -v
```

**Покрытие:**
- Первое сообщение
- Lyrics flow
- Intent routing
- Suggestions
- Error handling

## Промт-инжиниринг для музыки

Агент использует `agent_prompt` как high-priority music prompt:

```python
# backend/app/services/lyrics.py
LyricsClient.enrich_music_prompt(
    genre="Pop",
    mood="happy",
    tempo="medium",
    vocal="female",
    description=agent_prompt  # из агента
)
```

См. [[11-Generation#GPT-4o Промт-инжиниринг|Подробнее]]

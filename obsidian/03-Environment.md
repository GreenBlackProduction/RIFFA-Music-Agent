---
type: documentation
category: configuration
tags: [env, secrets, config]
related: [[01-Architecture]], [[02-Infrastructure]]
---

# Переменные окружения

## Файлы конфигурации

- **Development:** `backend/.env.dev`
- **Production:** `backend/.env.prod` (не в git)
- **Template:** `backend/.env.example`

## Основные переменные

### Application

```env
APP_ENV=development
APP_NAME="RIFFA Web"
SECRET_KEY=riffa-dev-secret-key-32bytes-local
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

### Database

```env
DATABASE_URL=postgresql+asyncpg://riffa:riffa@localhost:5432/riffa
```

### Redis / Queue

```env
REDIS_URL=redis://localhost:6379/0
```

### Admin (God Mode) {#Admin Account}

```env
ADMIN_TELEGRAM_IDS=8263964465
```

**Admin аккаунт:**
- Email: `amsergeyzelenkin@gmail.com`
- Пароль: `Helloprime173987-`
- Telegram ID: `8263964465`
- **God mode:** токены не списываются, нет ограничений

### Telegram

```env
TELEGRAM_BOT_TOKEN=8738949203:AAEmMpfpchmu44NLI2nMZmhwzwerAzZC_mI
TELEGRAM_BOT_USERNAME=The_Riffa_bot
TELEGRAM_CHANNEL_USERNAME=@riffa_music_production
TELEGRAM_CHANNEL_BONUS_TOKENS=5
```

### Suno API

```env
SUNO_API_KEY=d45622ea4f3013e516b8592c1de9212e
SUNO_BASE_URL=https://api.sunoapi.org/api/v1
```

### OpenAI / APIYI Proxy

```env
OPENAI_API_KEY=sk-tUGydc3nrUilyI5L77218cD6D5F04aDcB54f95799a3e1cC1
OPENAI_BASE_URL=https://api.apiyi.com/v1
APIYI_KEY=sk-tUGydc3nrUilyI5L77218cD6D5F04aDcB54f95799a3e1cC1
```

### NanoBanana (Cover Art)

```env
NANOBANANA_API_KEY=sk-Kr3cK1k4l3kIcRsV38F04a57220f46Bc84F49d211d582093
NANOBANANA_BASE_URL=https://api.apiyi.com/v1
```

### ElevenLabs (TTS)

```env
ELEVENLABS_API_KEY=sk_c5b0bde18c7399dd78ef7829c5f983757600a6a107bec46b
```

### Robokassa (Payments)

```env
ROBOKASSA_MERCHANT_LOGIN=RIFFA
ROBOKASSA_PASSWORD_1=Helloprime173987-
ROBOKASSA_PASSWORD_2=Privetzelenkin173987-
ROBOKASSA_TEST_MODE=true
```

### S3 / MinIO

```env
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET_MEDIA=riffa-media
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_PUBLIC_BASE_URL=http://localhost:9000/riffa-media
```

## Безопасность

⚠️ **Никогда не коммитить:**
- `.env.dev` с реальными ключами
- `.env.prod`
- Любые файлы с секретами

✅ **В git:**
- `.env.example` (шаблон без секретов)
- `.gitignore` с правилами исключения

## Генерация SECRET_KEY

```python
import secrets
print(secrets.token_hex(32))
```

## Проверка конфигурации

```bash
cd backend
python -c "from app.core.config import get_settings; print(get_settings())"
```

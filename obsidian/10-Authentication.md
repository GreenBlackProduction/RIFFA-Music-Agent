---
type: documentation
category: feature
tags: [auth, security, jwt, telegram]
related: [[14-Profile]], [[03-Environment]]
---

# Аутентификация

## Методы входа

### 1. Email + Password

**Регистрация:**
```http
POST /api/v1/auth/email/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123",
  "display_name": "John Doe"
}
```

**Вход:**
```http
POST /api/v1/auth/email/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Особенности:**
- Хеширование через `bcrypt` (прямое, без passlib)
- Миграция 004: `password_hash VARCHAR(128)`
- Бонус: 5 токенов новому пользователю

### 2. Telegram Login Widget

**Эндпоинты:**
```http
POST /api/v1/auth/telegram/widget
POST /api/v1/auth/telegram/initdata
```

**Особенности:**
- OAuth через Telegram
- Автоматическая регистрация при первом входе
- Бонус: 5 токенов

### 3. Email Magic Link (legacy)

```http
POST /api/v1/auth/email/request
POST /api/v1/auth/email/verify
```

Сохранён для обратной совместимости.

## JWT Cookie

**Имя:** `riffa_session`  
**Срок:** 30 дней  
**HttpOnly:** true  
**SameSite:** Lax

### Middleware

**`current_user`** — требует аутентификацию (401 если нет)  
**`current_user_optional`** — опциональная (None если нет)

## Admin God Mode

### Настройка

```env
ADMIN_TELEGRAM_IDS=8263964465,123456789
```

### Возможности

- ✅ Токены не списываются при генерации
- ✅ Нет проверки баланса
- ✅ Автоматически `is_admin=True` при входе через Telegram
- ✅ Доступ ко всем функциям

**Реализация:**
- `generate.py` — пропуск проверки баланса
- `wallet.deduct_tokens()` — пропуск списания для admin

См. [[03-Environment#Admin Account|Admin аккаунт]]

## Управление профилем

### Смена никнейма

```http
PATCH /api/v1/users/display-name
Content-Type: application/json

{
  "display_name": "New Name"
}
```

### Смена пароля

```http
POST /api/v1/users/change-password
Content-Type: application/json

{
  "current_password": "OldPass123",
  "new_password": "NewPass456"
}
```

**Требования:**
- Только для email-аккаунтов
- Проверка текущего пароля
- Минимум 8 символов

### Загрузка аватара

```http
POST /api/v1/users/avatar
Content-Type: multipart/form-data

file: <image>
```

## Выход

```http
POST /api/v1/auth/logout
```

Удаляет JWT cookie.

## Безопасность

### Хеширование паролей

```python
import bcrypt

# Хеширование
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())

# Проверка
bcrypt.checkpw(password.encode(), hashed)
```

### Проблемы и решения

**Проблема:** passlib 1.7.4 несовместима с bcrypt 4.x  
**Решение:** Прямое использование bcrypt без passlib

## Frontend интеграция

### LoginPage

**Компонент:** `frontend/src/pages/LoginPage.tsx`

**Табы:**
1. Войти (email + password)
2. Регистрация (email + password + display_name)
3. Telegram Login Widget

### Auth Context

```typescript
// frontend/src/lib/auth.ts
export function useAuth() {
  // ...
}
```

## Тестирование

```bash
cd backend
pytest tests/test_auth.py -v
```

**Покрытие:**
- Регистрация email
- Вход email
- Смена пароля
- Telegram auth
- Admin god mode

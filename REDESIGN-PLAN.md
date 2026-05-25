# RIFFA — План редизайна v1.0 (beta)

**Контекст.** Все правки делаются в worktree `/root/frontend-beta/frontend/` (ветка `design-v3`), деплоятся в `/root/static_beta/` → **https://beta.riffastudio.site**. Прод `/root/frontend/` (ветка `main`) **не трогаем**.

**Референсы:**
- Прототип всех экранов: `/tmp/design-preview-v3.html` (опубликован: https://beta.riffastudio.site/prototype.html)
- HTML-гайды: `RIFFA Guide.html`, `RIFFA Identity.html` (присланы пользователем 2026-05-25)
- Логотипы: `/root/New logo/` (mark/wordmark/lockup/applications, все SVG)
- Дизайн-токены: `project-riffa-design-v3` в memory

**Прод-фиксы (вне дизайна) НЕ потеряны:**
- Backend untracked: `mirror.py`, `legal.py`, `scripts/backfill_mirror.py`, `entrypoint.sh`, миграция `009_terms_acceptance.py` — работают
- Frontend недельные правки: в коммите `373320b` ветки `design-v3` (включают новые i18n, TermsAcceptanceModal, TelegramAuthCallbackPage, обновлённый StudioPage с пресетом «party», новые описания модулей и т.д.). В `main` они НЕ перенесены — только в `design-v3`.

---

## 7 правок от пользователя (по приоритету)

### 1️⃣ Логотипы из `/root/New logo/`
**Действие:**
- Скопировать `/root/New logo/**.svg` → `/root/frontend-beta/frontend/public/brand/`
- Удалить самописные SVG из `RiffaMark.tsx` и `RiffaWordmark.tsx`, заменить на `<img src="/brand/...svg" />` с прокидыванием size

**Маппинг:**
| Где в коде | Файл логотипа |
|---|---|
| Sidebar brand (свет) | `01-mark/riffa-mark.svg` |
| Login topbar (свет) | `01-mark/riffa-mark.svg` |
| Splash screen `index.html` (свет, бумага) | `01-mark/riffa-mark.svg` |
| Тёмные плашки (GlobalPlayer, Login hero, Profile hero) | `01-mark/riffa-mark-on-dark.svg` |
| Большой Login hero | `03-lockup/riffa-lockup-horizontal.svg` |
| Тёмный lockup (Login hero) | `03-lockup/riffa-lockup-horizontal-on-dark.svg` |
| Wordmark в тексте | `02-wordmark/riffa-wordmark.svg` (+ `-on-dark`) |
| Wordmark с «studio» | `02-wordmark/riffa-wordmark-studio.svg` (+ `-on-dark`) |
| Favicon | `04-applications/riffa-favicon-32.svg` |
| Apple-touch-icon | `04-applications/riffa-app-icon.svg` |
| OG-image | `04-applications/riffa-og-image.svg` |

**Файлы трогать:**
- `public/brand/` (создать, скопировать)
- `public/favicon.png` → заменить на SVG (или конвертировать в PNG/ICO)
- `index.html` (favicon link + splash mark)
- `src/components/brand/RiffaMark.tsx` — переписать как обёртку над `<img>`
- `src/components/brand/RiffaWordmark.tsx` — переписать как обёртку над `<img>`
- `src/pages/LoginPage.tsx` — заменить `<RiffaWordmark>` на `<img src="/brand/03-lockup/...svg" />`

---

### 2️⃣ Сайдбар — заголовки заглавными + иконки
**Действие:**
- `Sidebar.css`: `.nav-section { text-transform: uppercase; }` (уже есть)
- Подписи nav-item: оборачивать в uppercase через CSS `text-transform: uppercase; letter-spacing: 0.05em;`
- Иконки (текущие 4 SVG в `Sidebar.tsx`) заменить на иконки из прототипа (строки 1080-1135 в `/tmp/design-preview-v3.html`):
  - studio: `<rect x="2" y="3" w="12" h="10" rx="1.5"/><path d="M5 7l3 2 3-2M5 10l3 2 3-2"/>` (карточки)
  - radio: `<circle cx="8" cy="8" r="2"/><path d="M4.5 4.5a5 5 0 0 0 0 7M11.5 4.5a5 5 0 0 1 0 7M2 2a8 8 0 0 0 0 12M14 2a8 8 0 0 1 0 12"/>` (волны антенны)
  - profile: `<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13c0-2.8 2.2-5 5-5s5 2.2 5 5"/>` (силуэт)
  - admin: `<rect x="2" y="3" w="12" h="10" rx="1"/><path d="M5 6h6M5 8h4M5 10h6"/>` (документ-список)
- Брэнд: убрать самописный `<RiffaMark>` SVG → `<img src="/brand/01-mark/riffa-mark.svg" width="26" />`
- **НЕ добавлять** пункты «вход», «шаринг», «гайд» — они только в прототипе как переключатель

**Файлы:** `Sidebar.tsx`, `Sidebar.css`

---

### 3️⃣ Убрать «Шаринг» из сайдбара
**Состояние:** в коде beta-сайдбара пункта «шаринг» НЕТ. Он есть только в `prototype.html` как служебный переключатель экранов. Реальное приложение этого пункта не имеет — `SharePage` доступен только по `/s/:shareId`. **Пункт уже отсутствует — ничего удалять не нужно.**

---

### 4️⃣ Убрать «Статистика сегодня» с главной
**Состояние:** этого блока в `StudioPage.tsx` ещё НЕТ — он есть только в `prototype.html` (строка 1219). **При переписывании Studio просто не добавлять этот блок.**

---

### 5️⃣ Радио — блок «Плейлисты» + сортировка по жанрам
**Действие:**
1. **Проверить API**: `GET /api/v1/radio/...` — есть ли поле `genre` у треков? Если нет — добавить в backend.
2. **Frontend**:
   - Добавить в `RadioPage.tsx` секцию `<RadioPlaylists />` между hero и текущим списком треков
   - Список карточек жанров: Pop, Rock, Electronic, Lofi, Jazz, Ambient, etc. (взять список из существующих треков, или предопределённый)
   - При клике — `setActiveGenre(genre)` → фильтрация списка ниже
   - Сброс — кнопка «все треки»
3. **Стили** в `RadioPage.css`: editorial-сетка карточек (border 1px ink, paper-3 bg, hover→ink, при активе оранжевая обводка)

**Файлы:**
- `src/pages/RadioPage.tsx`, `src/pages/RadioPage.css`
- Возможно: `src/lib/api/client.ts` (новый endpoint если нужен)
- Возможно: `backend/app/api/v1/radio.py` (добавить фильтр по жанру)

---

### 6️⃣ Профиль — блок «Моя статистика» (как на проде)
**На проде уже есть** (`git show main:frontend/src/pages/ProfilePage.tsx`):
- `genStats` — счётчики по типам генераций (песни/инструменталы/обложки/каверы/sfx)
- `totalGens` — общее
- `favouriteGenres` — топ жанров
- `favouriteMoods` — топ настроений

**Действие:** перенести эту логику в beta-`ProfilePage.tsx` (она уже там есть в коммите 373320b — проверить и оформить в editorial-стиле):
- Карточка «моя статистика» с моно-заголовком
- 4 цифры в строку: всего / песен / инструменталов / обложек
- Bar-chart по типам (горизонтальные полоски ink на paper-2)
- Список топ-3 жанров + топ-3 настроений в моно

**Файлы:** `ProfilePage.tsx`, `ProfilePage.css`

---

### 7️⃣ Кнопки плеера — привести в порядок
**Действие в `GlobalPlayer.tsx` + `GlobalPlayer.css`:**

Все кнопки одного размера (`28px × 28px`, круг кроме «Радио» pill). Группы:

| Кнопка | Стиль |
|---|---|
| Play/Pause | большая (`36×36`), paper-bg, ink-icon, hover → hi-bg |
| Prev/Next | `28×28`, transparent, hi-icon |
| Shuffle / Repeat | `28×28`, transparent + active (hi) |
| Like / Dislike | `28×28` с счётчиком, pill (`52px` фикс ширина) |
| Скачать MP3/WAV | pill с emerald-обводкой |
| Шеринг | `28×28`, иконка ссылки |
| Радио старт/стоп | pill оранжевый когда активен |
| Закрыть | `32×32` круг, paper-x, hover красный |

Текущий `GlobalPlayer.css` уже paper/ink, но размеры не унифицированы — пройти и нормализовать.

**Файлы:** `GlobalPlayer.tsx`, `GlobalPlayer.css`

---

## Порядок выполнения

1. **Логотипы** (#1) — копируем папку, переписываем компоненты, чинят все остальные ссылки на лого
2. **Сайдбар** (#2) — иконки + uppercase + brand mark
3. **Плеер** (#7) — унификация кнопок
4. **Профиль** (#6) — перенос статистики в editorial
5. **Радио** (#5) — нужно сначала проверить API
6. **#3, #4** — нечего делать, просто запомнить

---

## Важные правила работы

- **НИКОГДА** не делать `git checkout`/`git switch` в `/root/frontend/` (прод-каталог). Только в `/root/frontend-beta/` (worktree).
- **НИКОГДА** не пересобирать прод-сайт случайно — деплой только в `/root/static_beta/`.
- Перед `git checkout` всегда `git status` (см. [[feedback-git-safety]]).
- **НЕ** мешать v3-`className` со старыми CSS-файлами — это даёт визуальную кашу. Если правится JSX в beta — это только beta.
- Сохранять промежуточные результаты: коммитить в `design-v3` ветку перед большими изменениями.

## Команды деплоя на beta

```bash
cd /root/frontend-beta/frontend
npm run build
find /root/static_beta -mindepth 1 -delete
cp -a /root/frontend-beta/frontend/dist/. /root/static_beta/
# backend перезапускать НЕ нужно — beta nginx сам читает из static_beta
```

## Ссылки

- Beta: https://beta.riffastudio.site
- Прод (не трогать): https://riffastudio.site
- Прототип: https://beta.riffastudio.site/prototype.html
- Worktree beta: `/root/frontend-beta/frontend/`
- Static beta: `/root/static_beta/`
- Логотипы: `/root/New logo/`
- HTML-гайды от Claude Design: лежат в чате (см. transcript `/root/.claude/projects/-root/12369772-49fc-4f9f-b6f6-cf8005a38049.jsonl`)

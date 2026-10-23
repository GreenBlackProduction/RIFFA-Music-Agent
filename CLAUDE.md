# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## RIFFA — обязательный протокол начала сессии

**Перед любым действием в этом проекте — выполни строго по порядку:**

1. **Прочитай `/root/GUIDE.md`** — стоп-фразы пользователя, опасные операции, чек-листы, workflow для дизайна/разработки
2. **Запусти `git status` и `git log -5`** на ветках `main` и `design-v3` — пойми реальное состояние репо
3. **Отчитайся пользователю** в одном сообщении: что прочитал, что увидел, что предлагаешь делать. Жди явного одобрения.
4. **НЕ начинай работу**, пока пользователь не подтвердит план.

### Структура workspace (запомни)

| Каталог | Ветка | Сайт | Можно трогать? |
|---|---|---|---|
| `/root/frontend/` | `main` | https://riffastudio.site (прод) | **НЕТ** — только по явному «деплой в прод» |
| `/root/frontend-beta/` | `design-v3` | https://beta.riffastudio.site (beta) | Да — основная рабочая зона для дизайна |
| `/root/backend/static_dist/` | — | прод-фронт | **НЕТ** без явного указания |
| `/root/static_beta/` | — | beta-фронт | Да — деплой beta-билдов |

### Критические правила (из горького опыта 2026-05-25)

- **Никогда** `git checkout`/`git switch` без предварительного `git status` — можно потерять uncommitted работу
- **Никогда** не мешать дизайн-правки (CSS, className под v3) с бизнес-логикой в одном коммите
- **Никогда** не пересобирать прод «заодно» при работе над beta
- **Большие коммиты (>50 файлов)** — почти всегда признак замешивания разных типов изменений
- **После compaction** контекста — НЕ импровизировать, перечитать этот файл и связанные

### Связанные файлы памяти

- `/root/.claude/projects/-root/memory/MEMORY.md` — индекс долгосрочной памяти
- `/root/.claude/projects/-root/memory/project_riffa.md` — инфра, креды, деплой-gotchas
- `/root/.claude/projects/-root/memory/project_riffa_design_v3.md` — токены, шрифты, палитра
- `/root/.claude/projects/-root/memory/feedback_git_safety.md` — git-правила безопасности
- `/root/.claude/projects/-root/memory/feedback_user_workflow.md` — правила работы с пользователем

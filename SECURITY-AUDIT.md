# RIFFA — Security audit (2026-05-27)

Quick triage of the live stack (backend + bot + nginx + DB) before
production traffic ramps up. Critical findings fixed inline this session,
the rest tracked as TODO below.

## Methodology
Manually walked through:
- auth (cookies, JWT, Telegram hash verification, email password flow)
- authorization (IDOR, admin gating, ban enforcement)
- input validation (request schemas, file uploads)
- secrets (env vars, defaults, accidental log exposure)
- rate limiting (per-IP throttles on every login surface)
- transport (HTTPS, HSTS, CSP, frame ancestors)
- webhook signatures (Robokassa / Freekassa / Telegram Stars)
- WebSockets (authorization on `/ws/generation/{id}`)
- raw SQL (only in migrations, parameterised → OK)
- public endpoints (`/share/:id`, `/radio/...`)

## FIXED this session

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | `/ws/generation/{gen_id}` accepted any connection without checking the cookie or that the gen_id belonged to the caller → eavesdrop on someone else's lyrics + progress if you know their gen UUID. | Medium | `_authorize_ws` reads `riffa_session` JWT and checks `Generation.user_id`. Closes with 1008 on mismatch. ([backend/app/api/v1/ws.py](backend/app/api/v1/ws.py)) |
| 2 | `/auth/email/register`, `/auth/email/login`, `/auth/email/verify` had **no** rate limit → brute-force passwords / account-spam. | High | `@limiter.limit(...)` added: register 5/min, login 10/min, verify 20/min. |
| 3 | Email password min length = 6 chars. | Medium | Raised to 8 chars + user-facing string updated. |
| 4 | Robokassa webhook compared signatures with `==` (timing-leaky) and logged the **raw signing string including `password_2`** on every call. | Medium | `hmac.compare_digest` + sensitive logs removed. ([RiffaBot/webhook_server.py](RiffaBot/webhook_server.py)) |
| 5 | `SECRET_KEY` defaulted to `"change-me"` — if env wasn't loaded in prod, anyone could forge session JWTs. | Critical (latent) | `get_settings()` now refuses to start in `app_env=production` when the key is empty or `"change-me"`. |
| 6 | Beta site (beta.riffastudio.site) had no HSTS header. | Low | 1-week HSTS added (short TTL keeps a rollback escape hatch). |

Verified after deploy:
- Backend `/api/v1/health` returns 200 OK
- `curl -I https://beta.riffastudio.site/` now includes `Strict-Transport-Security: max-age=604800`
- WS endpoint accepts then immediately closes (code 1008) when no/wrong cookie

## NOT fixed (tracked as follow-ups)

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| 7 | `app/auth/email.py:send_magic_link` is a no-op in production — just logs the link to stdout. Users can never use email magic-link without a configured SMTP. | Functional bug, not security | Wire SendGrid / Postmark / Resend. |
| 8 | Avatar upload trusts the client `Content-Type` and doesn't inspect file magic bytes. Could store an executable named `.png` and serve it as `image/*`. | Low (served as static, browser refuses to render) | Use `python-magic` to verify magic bytes; reject mismatches. |
| 9 | Cover-source upload (`/api/v1/upload/cover-source`) declared a 50 MB ceiling that is **never enforced** — the variable `_COVER_AUDIO_MAX_MB` is dead. Presigned PUT URL has no size guard either; MinIO will accept arbitrary size. | Low–Medium | Either set bucket-level `MaxObjectSize` policy or front the upload through the backend with a streaming size check. |
| 10 | `/share/{id}` increments `share_views` with a read-then-write pattern — concurrent requests can drop counts. | Low (data quality) | Use `UPDATE … SET share_views = share_views + 1`. |
| 11 | No rate limiter on `/share/{id}` or `/api/v1/radio/{id}/play` → small DDoS amplification possible (cheap DB writes). | Low | 60/min per IP would be plenty. |
| 12 | CORS allowlist still includes `http://localhost:5173` in prod env. Harmless on its own (requires being on localhost), but should be split into per-env configs. | Low | Move to separate `.env.prod` without dev origin. |
| 13 | CSP allows `'unsafe-inline'` and `'unsafe-eval'` for scripts. Required only for the React dev server, not the static prod bundle. | Low | Tighten in nginx-prod once we confirm Yandex Metrika doesn't break. |
| 14 | Frontend bundle (prod) still ships `static_dist/wp-admin/install.php`-style 404s logging — bots constantly probe these. Not a vuln, but noise. | Info | Match-then-drop in nginx. |
| 15 | Backend logs validation errors **with the request body** (added this session for the 422 hunt). Useful for triage but should drop sensitive fields if/when bodies start carrying secrets. | Info | Strip `password`, `token`, `api_key` fields before logging. |

## Notes & strengths

- **Telegram auth hash verification** (`app/auth/telegram.py`) is correct: HMAC-SHA256 with the right secret derivation (`sha256(token)` for widget vs `HMAC("WebAppData", token)` for initData), `hmac.compare_digest` for comparison, `auth_date` age check, positive-integer id check.
- **Authorization** (IDOR-style) on Generation endpoints is consistently filtered by `Generation.user_id == user.id` everywhere it should be (`history.py`, `tracks.py`).
- **Admin endpoints** all depend on `admin_user` which requires `user.is_admin=True`.
- **Cookies**: `HttpOnly`, `SameSite=Lax`, `Secure` outside dev, 7-day max-age — standard hygiene.
- **Passwords**: bcrypt with `gensalt()` — correct, no rehashing needed.
- **Raw SQL**: only in migrations, parameterised — no injection vector in the app surface.
- **HTTPS**: nginx terminates TLS, Let's Encrypt certs, modern cipher suite via `options-ssl-nginx.conf`.

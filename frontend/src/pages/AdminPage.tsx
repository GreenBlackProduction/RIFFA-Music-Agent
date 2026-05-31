/**
 * AdminPage — минималистичная админ-панель.
 *
 * Содержит три раздела:
 *  - Сводка по платформе (количество пользователей, банов, генераций, активных
 *    промокодов).
 *  - Пользователи: поиск, список с балансом/статусом, открытие карточки.
 *    В карточке — статистика по типам генераций, способ регистрации,
 *    реферал, использованные промокоды, изменение баланса, бан/предупреждение.
 *  - Промокоды: список + форма создания нового кода.
 *
 * Бэкенд проверяет ``is_admin`` на каждом эндпоинте; здесь — только UI.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  adminCreatePromocode,
  adminFetchStats,
  adminFetchUserDetail,
  adminFetchUserGenerations,
  adminFetchUsers,
  adminListPromocodes,
  adminSetNotice,
  adminClearNotice,
  adminUpdateBalance,
  adminUpdatePromocode,
  type AdminGenRow,
  type AdminUserDetail,
  type AdminUserRow,
  type AdminUserStatus,
} from "@/lib/api/admin";

import "./AdminPage.css";

const ADMIN_USERS_KEY = ["admin", "users"] as const;
const ADMIN_STATS_KEY = ["admin", "stats"] as const;
const ADMIN_PROMOCODES_KEY = ["admin", "promocodes"] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ─── Stats ──────────────────────────────────────────────────────────────────

function StatsRow() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ADMIN_STATS_KEY,
    queryFn: adminFetchStats,
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="admin-stats admin-stats--loading">
        <span>{t("admin.loadingSummary")}</span>
      </div>
    );
  }

  const tiles = [
    { label: t("admin.users"),            value: data.total_users },
    { label: t("admin.banned"),           value: data.banned_users },
    { label: t("admin.admins"),           value: data.admins },
    { label: t("admin.totalGenerations"), value: data.total_generations },
    { label: t("admin.completed"),        value: data.completed_generations },
    { label: t("admin.activePromocodes"), value: data.active_promocodes },
  ];
  return (
    <div className="admin-stats">
      {tiles.map((t) => (
        <div key={t.label} className="admin-stat">
          <span className="admin-stat__label">{t.label}</span>
          <strong className="admin-stat__value">{t.value}</strong>
        </div>
      ))}
    </div>
  );
}

// ─── Users panel ────────────────────────────────────────────────────────────

const USER_FILTERS: { value: AdminUserStatus; key: string }[] = [
  { value: "all",            key: "admin.filterAll" },
  { value: "active_30d",     key: "admin.filterActive30d" },
  { value: "inactive_30d",   key: "admin.filterInactive30d" },
  { value: "morning_on",     key: "admin.filterMorningOn" },
  { value: "morning_off",    key: "admin.filterMorningOff" },
  { value: "telegram_only",  key: "admin.filterTelegramOnly" },
  { value: "email_only",     key: "admin.filterEmailOnly" },
  { value: "banned",         key: "admin.filterBanned" },
  { value: "admins",         key: "admin.filterAdmins" },
];

function UsersPanel({
  onSelectUser,
}: {
  onSelectUser: (u: AdminUserRow) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AdminUserStatus>("all");
  const { data, isLoading } = useQuery({
    queryKey: [...ADMIN_USERS_KEY, query, filter] as const,
    queryFn: () =>
      adminFetchUsers({
        q: query.trim() || undefined,
        status: filter,
        limit: 100,
      }),
    placeholderData: (prev) => prev,
  });

  return (
    <section className="admin-panel">
      <header className="admin-panel__header">
        <h2 className="admin-panel__title">{t("admin.sectionUsers")}</h2>
        <input
          type="search"
          placeholder={t("admin.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="admin-search"
        />
      </header>

      <div className="admin-filters" role="tablist" aria-label={t("admin.filterAria")}>
        {USER_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            className={`filter-chip${filter === f.value ? " filter-chip--active" : ""}`}
            onClick={() => setFilter(f.value)}
          >
            {t(f.key)}
          </button>
        ))}
      </div>

      {isLoading && !data ? (
        <div className="admin-empty">{t("admin.loadingUsers")}</div>
      ) : !data || data.users.length === 0 ? (
        <div className="admin-empty">{t("admin.notFound")}</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t("admin.colUser")}</th>
                <th className="admin-table__col--hide-mobile">{t("admin.colRegistered")}</th>
                <th>{t("admin.colBalance")}</th>
                <th className="admin-table__col--hide-mobile">{t("admin.colGenerations")}</th>
                <th>{t("admin.colStatus")}</th>
                <th className="admin-table__col--hide-mobile">{t("admin.colCreated")}</th>
                <th className="admin-table__col--hide-mobile">{t("admin.colLastSeen")}</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="admin-table__row--clickable" onClick={() => onSelectUser(u)}>
                  <td className="admin-table__id">{u.id}</td>
                  <td className="admin-table__name">
                    <strong>{u.display_name}</strong>
                    <small>
                      {u.email ? u.email : null}
                      {u.email && u.telegram_username ? " · " : null}
                      {u.telegram_username ? `@${u.telegram_username}` : null}
                    </small>
                  </td>
                  <td className="admin-table__col--hide-mobile">
                    {u.telegram_user_id != null
                      ? "Telegram"
                      : u.email
                        ? "Email"
                        : "—"}
                  </td>
                  <td className="admin-table__num">{u.balance_tokens}</td>
                  <td className="admin-table__num admin-table__col--hide-mobile">{u.generations_count}</td>
                  <td>
                    {u.is_banned ? (
                      <span className="admin-pill admin-pill--ban">{t("admin.statusBan")}</span>
                    ) : u.notice_kind === "warning" ? (
                      <span className="admin-pill admin-pill--warn">{t("admin.statusWarn")}</span>
                    ) : u.is_admin ? (
                      <span className="admin-pill admin-pill--admin">{t("admin.statusAdmin")}</span>
                    ) : (
                      <span className="admin-pill admin-pill--ok">OK</span>
                    )}
                  </td>
                  <td className="admin-table__date admin-table__col--hide-mobile">{fmtDate(u.created_at)}</td>
                  <td className="admin-table__date admin-table__col--hide-mobile">{fmtDate(u.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <footer className="admin-panel__footer">
          Показано {data.users.length} из {data.total}
        </footer>
      )}
    </section>
  );
}

// ─── User detail drawer ────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending: "⏳ ожидает",
  processing: "🔄 генерация",
  completed: "✅ готово",
  failed: "❌ ошибка",
};
const TYPE_LABEL: Record<string, string> = {
  song: "Песня",
  instrumental: "Инструментал",
  cover_song: "Кавер",
  sfx: "SFX",
  cover_art: "Обложка",
  wav_convert: "WAV",
  extend: "Продление",
};

function UserGenerations({
  userId,
  onCredit,
}: {
  userId: number;
  onCredit: (amount: number) => void;
}) {
  const { data: gens, isLoading } = useQuery({
    queryKey: ["admin", "user", userId, "generations"],
    queryFn: () => adminFetchUserGenerations(userId, 30),
  });

  return (
    <section className="admin-card">
      <h4>Последние генерации</h4>
      {isLoading && <div className="admin-empty">Загружаем…</div>}
      {gens && gens.length === 0 && <div className="admin-empty">Генераций нет</div>}
      {gens && gens.length > 0 && (
        <div className="admin-gen-list">
          {gens.map((g: AdminGenRow) => (
            <div
              key={g.id}
              className={`admin-gen-row${g.status === "failed" ? " admin-gen-row--failed" : ""}`}
            >
              <div className="admin-gen-row__meta">
                <span className="admin-gen-row__type">{TYPE_LABEL[g.type] ?? g.type}</span>
                <span className="admin-gen-row__status">{STATUS_LABEL[g.status] ?? g.status}</span>
                <span className="admin-gen-row__cost">−{g.cost_tokens} ⓡ</span>
                <span className="admin-gen-row__date">{fmtDate(g.created_at)}</span>
              </div>
              {g.title && <div className="admin-gen-row__title">{g.title}</div>}
              {g.error_message && (
                <div className="admin-gen-row__error">{g.error_message}</div>
              )}
              {g.status === "failed" && g.cost_tokens > 0 && (
                <button
                  type="button"
                  className="admin-btn admin-btn--xs admin-btn--primary"
                  onClick={() => onCredit(g.cost_tokens)}
                >
                  Вернуть {g.cost_tokens} ⓡ
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function UserDetail({
  userId,
  onClose,
}: {
  userId: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const detailKey = ["admin", "user", userId] as const;
  const { data: detail, isLoading } = useQuery({
    queryKey: detailKey,
    queryFn: () => adminFetchUserDetail(userId),
  });

  // Balance form ------------------------------------------------------------
  const [balanceMode, setBalanceMode] = useState<"set" | "add" | "subtract">("add");
  const [balanceAmount, setBalanceAmount] = useState<string>("10");
  const [balanceReason, setBalanceReason] = useState<string>("");
  const balanceMutation = useMutation({
    mutationFn: () =>
      adminUpdateBalance(userId, {
        mode: balanceMode,
        amount: Number(balanceAmount) || 0,
        reason: balanceReason || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey }),
        queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY }),
        queryClient.invalidateQueries({ queryKey: ADMIN_STATS_KEY }),
      ]);
    },
  });

  // Notice form -------------------------------------------------------------
  const [noticeKind, setNoticeKind] = useState<"ban" | "warning">("warning");
  const [noticeMsg, setNoticeMsg] = useState<string>("");
  const noticeMutation = useMutation({
    mutationFn: (vars: { kind: "ban" | "warning"; message: string }) =>
      adminSetNotice(userId, vars),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey }),
        queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY }),
        queryClient.invalidateQueries({ queryKey: ADMIN_STATS_KEY }),
      ]);
    },
  });
  const clearNoticeMutation = useMutation({
    mutationFn: () => adminClearNotice(userId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey }),
        queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY }),
        queryClient.invalidateQueries({ queryKey: ADMIN_STATS_KEY }),
      ]);
    },
  });

  return (
    <div className="admin-drawer-backdrop" onClick={onClose}>
      <div className="admin-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="admin-drawer__header">
          <h3>
            Пользователь #{userId}
            {detail ? ` · ${detail.display_name}` : null}
          </h3>
          <button
            type="button"
            className="admin-drawer__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        {isLoading || !detail ? (
          <div className="admin-empty">Загружаем…</div>
        ) : (
          <div className="admin-drawer__body">
            <UserDetailContent detail={detail} />

            {/* ─── Изменить баланс ──────────────────────────── */}
            <section className="admin-card">
              <h4>Изменить баланс</h4>
              <div className="admin-form">
                <select
                  value={balanceMode}
                  onChange={(e) => setBalanceMode(e.target.value as typeof balanceMode)}
                >
                  <option value="add">Начислить (+)</option>
                  <option value="subtract">Списать (−)</option>
                  <option value="set">Установить значение</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Причина (необязательно)"
                  value={balanceReason}
                  onChange={(e) => setBalanceReason(e.target.value)}
                />
                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  disabled={balanceMutation.isPending}
                  onClick={() => balanceMutation.mutate()}
                >
                  {balanceMutation.isPending ? "..." : "Применить"}
                </button>
              </div>
              {balanceMutation.error && (
                <div className="admin-error">
                  {(balanceMutation.error as { detail?: string }).detail ||
                    "Не удалось обновить баланс"}
                </div>
              )}
            </section>

            {/* ─── Логи генераций ───────────────────────────── */}
            <UserGenerations userId={userId} onCredit={(amount) => {
              setBalanceMode("add");
              setBalanceAmount(String(amount));
              setBalanceReason("Компенсация за ошибку генерации");
            }} />

            {/* ─── Предупреждение / бан ─────────────────────── */}
            <section className="admin-card">
              <h4>Предупреждение или бан</h4>
              <div className="admin-form">
                <select
                  value={noticeKind}
                  onChange={(e) => setNoticeKind(e.target.value as typeof noticeKind)}
                >
                  <option value="warning">Предупреждение (баннер)</option>
                  <option value="ban">Бан (блокировка действий)</option>
                </select>
                <textarea
                  rows={3}
                  placeholder="Сообщение для пользователя (отображается баннером)"
                  value={noticeMsg}
                  onChange={(e) => setNoticeMsg(e.target.value)}
                />
                <div className="admin-form__actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary"
                    disabled={noticeMutation.isPending || !noticeMsg.trim()}
                    onClick={() =>
                      noticeMutation.mutate({ kind: noticeKind, message: noticeMsg.trim() })
                    }
                  >
                    {noticeMutation.isPending ? "..." : "Отправить"}
                  </button>
                  {(detail.notice_message || detail.is_banned) && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={clearNoticeMutation.isPending}
                      onClick={() => clearNoticeMutation.mutate()}
                    >
                      Снять
                    </button>
                  )}
                </div>
              </div>
              {detail.notice_message && (
                <div className="admin-current-notice">
                  Текущий: <strong>{detail.notice_kind}</strong> — {detail.notice_message}
                </div>
              )}
              {noticeMutation.error && (
                <div className="admin-error">
                  {(noticeMutation.error as { detail?: string }).detail ||
                    "Не удалось сохранить"}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function UserDetailContent({ detail }: { detail: AdminUserDetail }) {
  const regLabel: Record<AdminUserDetail["registration_method"], string> = {
    telegram: "Telegram",
    email: "Email + пароль",
    unknown: "Неизвестно",
  };
  return (
    <section className="admin-card">
      <h4>Профиль</h4>
      <dl className="admin-dl">
        <dt>Имя</dt>
        <dd>{detail.display_name}</dd>
        <dt>Email</dt>
        <dd>{detail.email ?? "—"}</dd>
        <dt>Telegram</dt>
        <dd>
          {detail.telegram_username
            ? `@${detail.telegram_username}`
            : detail.telegram_user_id != null
              ? `id:${detail.telegram_user_id}`
              : "—"}
        </dd>
        <dt>Регистрация</dt>
        <dd>{regLabel[detail.registration_method]}</dd>
        <dt>Баланс</dt>
        <dd>{detail.balance_tokens} ⓡ</dd>
        <dt>Реф. код</dt>
        <dd>{detail.referral_code ?? "—"}</dd>
        <dt>Пришёл по рефералке</dt>
        <dd>
          {detail.referred_by_user_id != null ? (
            <>
              {detail.referred_by_name
                ? <strong>{detail.referred_by_name.startsWith("tg_") ? `#${detail.referred_by_user_id}` : detail.referred_by_name}</strong>
                : <strong>#{detail.referred_by_user_id}</strong>
              }
              {detail.referred_by_name && !detail.referred_by_name.startsWith("tg_") && (
                <span style={{ color: "var(--muted)", fontSize: 12 }}> · #{detail.referred_by_user_id}</span>
              )}
              {detail.referred_by_code && (
                <span style={{ color: "var(--muted)", fontSize: 12 }}> · {detail.referred_by_code}</span>
              )}
            </>
          ) : "—"}
        </dd>
        <dt>Привёл</dt>
        <dd>{detail.referrals_made} чел.</dd>
        <dt>Создан</dt>
        <dd>{fmtDate(detail.created_at)}</dd>
        <dt>Последний раз</dt>
        <dd>{fmtDate(detail.last_seen_at)}</dd>
        <dt>Промокоды</dt>
        <dd>
          {detail.promocodes_used.length === 0
            ? "—"
            : detail.promocodes_used
                .map((p) => `${p.code} (+${p.tokens_granted})`)
                .join(", ")}
        </dd>
      </dl>

      <h4 style={{ marginTop: 16 }}>Генерации ({detail.generations_total})</h4>
      {detail.generations_by_type.length === 0 ? (
        <div className="admin-empty admin-empty--inline">Пока нет генераций</div>
      ) : (
        <ul className="admin-gen-breakdown">
          {detail.generations_by_type.map((g) => (
            <li key={g.type}>
              <strong>{g.count}</strong> <span>{g.type}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Promocodes panel ──────────────────────────────────────────────────────

function PromocodesPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ADMIN_PROMOCODES_KEY,
    queryFn: adminListPromocodes,
  });

  const [newCode, setNewCode] = useState("");
  const [newTokens, setNewTokens] = useState<string>("5");
  const [newMaxUses, setNewMaxUses] = useState<string>("0");

  const createMutation = useMutation({
    mutationFn: () =>
      adminCreatePromocode({
        code: newCode.trim().toUpperCase(),
        tokens: Number(newTokens) || 0,
        max_uses: Number(newMaxUses) || 0,
      }),
    onSuccess: async () => {
      setNewCode("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_PROMOCODES_KEY }),
        queryClient.invalidateQueries({ queryKey: ADMIN_STATS_KEY }),
      ]);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      adminUpdatePromocode(id, { is_active }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_PROMOCODES_KEY }),
        queryClient.invalidateQueries({ queryKey: ADMIN_STATS_KEY }),
      ]);
    },
  });

  const activeCodes = useMemo(
    () => (data ?? []).filter((p) => p.is_active),
    [data],
  );

  return (
    <section className="admin-panel">
      <header className="admin-panel__header">
        <h2 className="admin-panel__title">Промокоды</h2>
        <span className="admin-panel__hint">
          Активных: <strong>{activeCodes.length}</strong>
        </span>
      </header>

      {/* Текущий "основной" промокод выделяется отдельной плашкой — для удобства. */}
      {activeCodes.length > 0 && (
        <div className="admin-current-promo">
          <span className="admin-current-promo__label">Активный промокод</span>
          <code className="admin-current-promo__code">{activeCodes[0].code}</code>
          <span className="admin-current-promo__hint">
            +{activeCodes[0].tokens} ⓡ за активацию · использовали{" "}
            {activeCodes[0].used_count}
            {activeCodes[0].max_uses ? ` / ${activeCodes[0].max_uses}` : ""}
          </span>
        </div>
      )}

      <div className="admin-form admin-form--inline">
        <input
          type="text"
          placeholder="Код (RIFFA2026)"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value.toUpperCase())}
          maxLength={32}
        />
        <input
          type="number"
          min={1}
          value={newTokens}
          onChange={(e) => setNewTokens(e.target.value)}
          title="Токенов за активацию"
        />
        <input
          type="number"
          min={0}
          value={newMaxUses}
          onChange={(e) => setNewMaxUses(e.target.value)}
          title="Лимит активаций (0 — без лимита)"
        />
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          disabled={createMutation.isPending || newCode.trim().length < 3}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? "..." : "Сформировать"}
        </button>
      </div>
      {createMutation.error && (
        <div className="admin-error">
          {(createMutation.error as { detail?: string }).detail ||
            "Не удалось создать промокод"}
        </div>
      )}

      {isLoading ? (
        <div className="admin-empty">Загружаем…</div>
      ) : !data || data.length === 0 ? (
        <div className="admin-empty">Промокодов пока нет</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Токенов</th>
                <th>Использовали</th>
                <th>Создан</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td>
                    <code className="admin-code">{p.code}</code>
                  </td>
                  <td className="admin-table__num">{p.tokens}</td>
                  <td className="admin-table__num">
                    {p.used_count}
                    {p.max_uses ? ` / ${p.max_uses}` : ""}
                  </td>
                  <td className="admin-table__date">{fmtDate(p.created_at)}</td>
                  <td>
                    {p.is_active ? (
                      <span className="admin-pill admin-pill--ok">Активен</span>
                    ) : (
                      <span className="admin-pill admin-pill--off">Выкл.</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="admin-btn admin-btn--small"
                      disabled={toggleMutation.isPending}
                      onClick={() =>
                        toggleMutation.mutate({ id: p.id, is_active: !p.is_active })
                      }
                    >
                      {p.is_active ? "Отключить" : "Включить"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── AdminPage ──────────────────────────────────────────────────────────────

export function AdminPage() {
  const { t } = useTranslation();
  const [openUserId, setOpenUserId] = useState<number | null>(null);
  void t; // used by child components via prop — suppress unused warning

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>Админ-панель</h1>
        <p className="admin-page__subtitle">
          Управление пользователями, балансами, банами и промокодами.
        </p>
      </header>

      <StatsRow />

      <UsersPanel onSelectUser={(u) => setOpenUserId(u.id)} />

      <PromocodesPanel />

      {openUserId != null && (
        <UserDetail userId={openUserId} onClose={() => setOpenUserId(null)} />
      )}
    </div>
  );
}

export default AdminPage;

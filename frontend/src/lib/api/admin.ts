/**
 * Admin-only API: users management + promocodes.
 * All endpoints require ``is_admin=True`` on the current user; the server
 * is the source of truth, the frontend only hides the UI for non-admins.
 */

import { apiFetch } from "@/lib/api/client";

export interface AdminStats {
  total_users: number;
  banned_users: number;
  admins: number;
  total_generations: number;
  completed_generations: number;
  active_promocodes: number;
}

export interface AdminUserRow {
  id: number;
  display_name: string;
  email: string | null;
  telegram_username: string | null;
  telegram_user_id: number | null;
  balance_tokens: number;
  is_admin: boolean;
  is_banned: boolean;
  notice_kind: "ban" | "warning" | null;
  created_at: string;
  last_seen_at: string | null;
  morning_messages_enabled: boolean;
  generations_count: number;
}

export type AdminUserStatus =
  | "all"
  | "active_30d"
  | "inactive_30d"
  | "banned"
  | "morning_on"
  | "morning_off"
  | "email_only"
  | "telegram_only"
  | "admins";

export interface AdminUserList {
  total: number;
  users: AdminUserRow[];
}

export interface GenTypeCount {
  type: string;
  count: number;
}

export interface PromoUsageRow {
  code: string;
  tokens_granted: number;
  redeemed_at: string;
}

export interface AdminUserDetail {
  id: number;
  display_name: string;
  email: string | null;
  telegram_username: string | null;
  telegram_user_id: number | null;
  avatar_url: string | null;
  locale: string;
  balance_tokens: number;
  is_admin: boolean;
  is_banned: boolean;
  notice_message: string | null;
  notice_kind: "ban" | "warning" | null;
  referral_code: string | null;
  registration_method: "telegram" | "email" | "unknown";
  created_at: string;
  last_seen_at: string | null;
  generations_total: number;
  generations_by_type: GenTypeCount[];
  generations_by_status: GenTypeCount[];
  referred_by_user_id: number | null;
  referred_by_code: string | null;
  referred_by_name: string | null;
  referrals_made: number;
  promocodes_used: PromoUsageRow[];
}

export interface PromocodeRow {
  id: number;
  code: string;
  tokens: number;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export function adminFetchStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>("/api/v1/admin/stats");
}

export function adminFetchUsers(
  params: {
    q?: string;
    status?: AdminUserStatus;
    offset?: number;
    limit?: number;
  } = {},
): Promise<AdminUserList> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.status && params.status !== "all") qs.set("status", params.status);
  if (params.offset !== undefined) qs.set("offset", String(params.offset));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<AdminUserList>(`/api/v1/admin/users${suffix}`);
}

export function adminFetchUserDetail(userId: number): Promise<AdminUserDetail> {
  return apiFetch<AdminUserDetail>(`/api/v1/admin/users/${userId}`);
}

export function adminUpdateBalance(
  userId: number,
  body: { mode: "set" | "add" | "subtract"; amount: number; reason?: string },
): Promise<{ user_id: number; balance_tokens: number }> {
  return apiFetch<{ user_id: number; balance_tokens: number }>(
    `/api/v1/admin/users/${userId}/balance`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export interface NoticeResponse {
  user_id: number;
  is_banned: boolean;
  notice_kind: "ban" | "warning" | null;
  notice_message: string | null;
}

export function adminSetNotice(
  userId: number,
  body: { kind: "ban" | "warning"; message: string },
): Promise<NoticeResponse> {
  return apiFetch<NoticeResponse>(`/api/v1/admin/users/${userId}/notice`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function adminClearNotice(userId: number): Promise<NoticeResponse> {
  return apiFetch<NoticeResponse>(`/api/v1/admin/users/${userId}/notice`, {
    method: "DELETE",
  });
}

export function adminListPromocodes(): Promise<PromocodeRow[]> {
  return apiFetch<PromocodeRow[]>("/api/v1/admin/promocodes");
}

export function adminCreatePromocode(body: {
  code: string;
  tokens: number;
  max_uses?: number;
  expires_at?: string | null;
}): Promise<PromocodeRow> {
  return apiFetch<PromocodeRow>("/api/v1/admin/promocodes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function adminUpdatePromocode(
  id: number,
  body: { is_active?: boolean; tokens?: number; max_uses?: number; expires_at?: string | null },
): Promise<PromocodeRow> {
  return apiFetch<PromocodeRow>(`/api/v1/admin/promocodes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export interface AdminGenRow {
  id: string;
  type: string;
  status: string;
  title: string;
  cost_tokens: number;
  error_message: string | null;
  created_at: string;
}

export function adminFetchUserGenerations(userId: number, limit = 30): Promise<AdminGenRow[]> {
  return apiFetch<AdminGenRow[]>(`/api/v1/admin/users/${userId}/generations?limit=${limit}`);
}

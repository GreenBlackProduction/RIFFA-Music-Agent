/**
 * Авторизация: TanStack Query поверх /users/me.
 * useAuth() возвращает { user, isLoading, refresh, signOut }.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { type CurrentUser, fetchCurrentUser, logout as apiLogout } from "@/lib/api/client";

const QUERY_KEY = ["auth", "me"] as const;

interface UseAuthResult {
  user: CurrentUser | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      try {
        return await fetchCurrentUser();
      } catch (err) {
        if (err && typeof err === "object" && "status" in err && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    async refresh() {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    async signOut() {
      await apiLogout();
      queryClient.setQueryData(QUERY_KEY, null);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  };
}

export function getTelegramInitData(): string | null {
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  const data = tg?.WebApp?.initData;
  return data && data.length > 0 ? data : null;
}

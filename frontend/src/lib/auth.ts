/**
 * Авторизация: TanStack Query поверх /users/me.
 * useAuth() возвращает { user, isLoading, refresh, signOut }.
 *
 * Если сайт открыт как Telegram Mini App (window.Telegram.WebApp.initData присутствует),
 * выполняет автологин через initData прямо внутри queryFn — страница входа
 * пользователю не показывается вообще.
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CurrentUser,
  fetchCurrentUser,
  loginWithTelegramInitData,
  logout as apiLogout,
} from "@/lib/api/client";

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
          // Если открыто как Mini App — пробуем автологин через initData.
          // isLoading остаётся true всё это время, страница входа не мелькает.
          const initData = getTelegramInitData();
          if (initData) {
            try {
              await loginWithTelegramInitData(initData);
              return await fetchCurrentUser();
            } catch {
              // initData невалидна или сервер недоступен — идём на страницу входа
            }
          }
          return null;
        }
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  const signOut = useCallback(async () => {
    await apiLogout();
    queryClient.setQueryData(QUERY_KEY, null);
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    refresh,
    signOut,
  };
}

export function getTelegramInitData(): string | null {
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  const data = tg?.WebApp?.initData;
  return data && data.length > 0 ? data : null;
}

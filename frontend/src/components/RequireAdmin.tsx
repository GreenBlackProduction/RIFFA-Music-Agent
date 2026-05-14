import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/lib/auth";

interface Props {
  children: ReactNode;
}

/**
 * Гард для админских маршрутов. Не админам показывает 404-вид редирект на
 * /studio (страница как бы не существует), а не явное «403» — чтобы UI не
 * подсвечивал админ-зону.
 *
 * Источник правды — бэкенд (admin_user dep), сюда — только для удобства UX.
 */
export function RequireAdmin({ children }: Props) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div style={{ padding: 24, color: "var(--muted)" }}>Проверяем доступ…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!user.is_admin) {
    return <Navigate to="/studio" replace />;
  }
  return <>{children}</>;
}

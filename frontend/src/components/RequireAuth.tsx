import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/lib/auth";

interface Props {
  children: ReactNode;
}

export function RequireAuth({ children }: Props) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ padding: 24, color: "var(--muted)" }}>Проверяем сессию…</div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

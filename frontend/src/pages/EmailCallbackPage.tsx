import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Panel } from "@/components/ui/Panel";
import { verifyEmailToken } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";

type Status = "loading" | "ok" | "error";

export function EmailCallbackPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("Проверяем ссылку…");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage("В ссылке нет токена. Запроси новый magic-link.");
      return;
    }
    void (async () => {
      try {
        await verifyEmailToken(token);
        await refresh();
        setStatus("ok");
        setMessage("Готово, входим в студию…");
        setTimeout(() => navigate("/studio"), 600);
      } catch (err) {
        setStatus("error");
        setMessage(extractMessage(err));
      }
    })();
  }, [params, refresh, navigate]);

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <Panel title={status === "ok" ? "Вход выполнен" : "Email-вход"}>
        <p>{message}</p>
        {status === "error" && (
          <p>
            <a href="/login">Вернуться к форме входа</a>
          </p>
        )}
      </Panel>
    </div>
  );
}

function extractMessage(err: unknown): string {
  if (err && typeof err === "object" && "detail" in err && typeof err.detail === "string") {
    return err.detail;
  }
  return "Не удалось проверить ссылку. Попробуй запросить новую.";
}

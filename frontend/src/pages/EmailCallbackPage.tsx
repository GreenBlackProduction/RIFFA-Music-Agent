import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Panel } from "@/components/ui/Panel";
import { verifyEmailToken } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";

type Status = "loading" | "ok" | "error";

export function EmailCallbackPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>(() => t("emailCallback.checking"));

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage(t("emailCallback.noToken"));
      return;
    }
    void (async () => {
      try {
        await verifyEmailToken(token);
        await refresh();
        setStatus("ok");
        setMessage(t("emailCallback.success"));
        setTimeout(() => navigate("/studio"), 600);
      } catch (err) {
        setStatus("error");
        setMessage(extractMessage(err, t("emailCallback.genericError")));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, refresh, navigate]);

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <Panel title={status === "ok" ? t("emailCallback.titleOk") : t("emailCallback.titleError")}>
        <p>{message}</p>
        {status === "error" && (
          <p>
            <a href="/login">{t("emailCallback.backToLogin")}</a>
          </p>
        )}
      </Panel>
    </div>
  );
}

function extractMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "detail" in err && typeof err.detail === "string") {
    return err.detail;
  }
  return fallback;
}

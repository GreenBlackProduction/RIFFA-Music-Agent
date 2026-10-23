import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/lib/auth";
import { AgentChat } from "@/components/studio/AgentChat";
import "./AgentPage.css";

export function AgentPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = String(user?.id ?? "");
  const { i18n } = useTranslation();
  const isEN = (i18n.resolvedLanguage || i18n.language || "ru").startsWith("en");
  useEffect(() => {
    document.body.classList.add("agent-page-open");
    return () => document.body.classList.remove("agent-page-open");
  }, []);

  return (
    <div className="agent-page">
      <div className="top-meta">
        <div className="breadcrumb">
          <b>{isEN ? "ai agent" : "ии-агент"}</b>
        </div>
      </div>

      <h1 className="h-page">
        {isEN ? <>Tell an idea — <em>I'll launch</em> generation.</> : <>Расскажи идею — <em>запущу</em> генерацию.</>}
      </h1>
      <p className="h-lead">
        {isEN
          ? "Don't know what to choose? Describe the idea — I'll ask only necessary questions, collect a detailed prompt and launch the right module."
          : "Не знаешь, что выбрать? Опиши идею — задам уточняющие вопросы только если нужно, соберу детальный prompt и запущу нужный модуль."}
      </p>

      <div className="agent-chat-wrap">
        <AgentChat
          userId={userId}
          agentInitiates
          module="song"
          onLaunch={async (r) => {
            // Сохраняем бриф и переходим в студию — StudioPage подхватит
            // sessionStorage и автоматически запустит generation через
            // handleAgentLaunch (его логика уже есть).
            try {
              sessionStorage.setItem(
                "riffa_pending_agent_launch",
                JSON.stringify({
                  summary: r.summary,
                  prompt: r.prompt,
                  intent: r.intent,
                  transcript: r.transcript,
                }),
              );
            } catch { /* sessionStorage может быть недоступен */ }
            navigate("/studio");
          }}
          onCancel={() => navigate("/studio")}
        />
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AgentChat, type AgentResult } from "@/components/studio/AgentChat";
import "./AgentPage.css";

export function AgentPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isEN = (i18n.resolvedLanguage || i18n.language || "ru").startsWith("en");
  const [result, setResult] = useState<AgentResult | null>(null);

  useEffect(() => {
    document.body.classList.add("agent-page-open");
    return () => document.body.classList.remove("agent-page-open");
  }, []);

  useEffect(() => {
    if (result) document.body.classList.add("agent-result-open");
    else document.body.classList.remove("agent-result-open");
    return () => document.body.classList.remove("agent-result-open");
  }, [result]);

  return (
    <div className={`agent-page${result ? " agent-page--with-result" : ""}`}>
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
          agentInitiates
          module="song"
          onComplete={setResult}
          onCancel={() => navigate("/studio")}
        />
      </div>

      {result && (
        <>
          <div className="h-section">
            <div className="tag"><span className="num">02</span> · {isEN ? "ready brief" : "готовый бриф"}</div>
            <h2>{isEN ? "what the agent built" : "что собрал агент"}</h2>
            <div className="right">{isEN ? "after answering questions" : "после ответов на вопросы"}</div>
          </div>

          <div className="panel-soft">
            <div className="panel-head">
              <span className="num">A · {isEN ? "brief" : "бриф"}</span>
              <span className="title">{result.summary?.split("\n")[0] ?? t("agent.briefReady")}</span>
              <span className="right">deepseek v4-pro</span>
            </div>
            <div className="agent-brief-grid">
              <div>
                <div className="agent-brief-label">{isEN ? "description" : "описание"}</div>
                <p className="agent-brief-text">{result.summary}</p>
              </div>
              <div>
                <div className="agent-brief-label">suno prompt</div>
                <p className="agent-brief-prompt">{result.prompt}</p>
              </div>
            </div>
            <div className="agent-brief-actions">
              <button type="button" className="btn btn-primary" onClick={() => navigate("/studio")}>
                {t("agent.openStudio")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setResult(null)}>
                {t("agent.startOver")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

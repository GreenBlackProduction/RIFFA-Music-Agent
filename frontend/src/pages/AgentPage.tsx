import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AgentChat, type AgentResult } from "@/components/studio/AgentChat";
import "./AgentPage.css";

export function AgentPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<AgentResult | null>(null);

  if (result) {
    return (
      <div className="agent-page-result">
        <div className="agent-page-result__card">
          <h2 className="agent-page-result__title">Бриф готов</h2>
          {result.intent?.note && (
            <p className="agent-page-result__note">{result.intent.note}</p>
          )}
          <div className="agent-page-result__section">
            <span className="agent-page-result__label">Описание</span>
            <pre className="agent-page-result__pre">{result.summary}</pre>
          </div>
          <div className="agent-page-result__section">
            <span className="agent-page-result__label">Suno prompt</span>
            <pre className="agent-page-result__pre">{result.prompt}</pre>
          </div>
          <div className="agent-page-result__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate("/studio")}
            >
              Открыть Студию
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setResult(null)}
            >
              Начать заново
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-page">
      <AgentChat
        agentInitiates
        module="song"
        onComplete={setResult}
        onCancel={() => navigate("/studio")}
      />
    </div>
  );
}

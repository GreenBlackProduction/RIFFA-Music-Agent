/**
 * TermsAcceptanceModal — обязательная модалка с принятием юридических
 * документов. Показывается при первом входе и при изменении версии
 * (когда `user.terms_version` отстаёт от `user.legal_version`).
 *
 * Документы (offer / privacy / license / refund) подгружаются с
 * `/api/v1/legal/<slug>` лениво — только когда пользователь
 * раскрывает соответствующий раздел.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import {
  type LegalIndex,
  acceptTerms,
  fetchLegalDocument,
  fetchLegalIndex,
} from "@/lib/api/client";
import { useAuth } from "@/lib/auth";

import "./TermsAcceptanceModal.css";

export function TermsAcceptanceModal() {
  const { user, refresh } = useAuth();
  const { t } = useTranslation();
  const [index, setIndex] = useState<LegalIndex | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsAcceptance =
    !!user &&
    (!user.terms_accepted_at ||
      (user.legal_version && user.terms_version !== user.legal_version));

  useEffect(() => {
    if (!needsAcceptance) return;
    if (index) return;
    fetchLegalIndex()
      .then(setIndex)
      .catch(() => setError(t("terms.loadError", "Не удалось загрузить документы")));
  }, [needsAcceptance, index, t]);

  if (!user || !needsAcceptance) return null;

  const toggleDoc = async (slug: string) => {
    if (openSlug === slug) {
      setOpenSlug(null);
      return;
    }
    setOpenSlug(slug);
    if (bodies[slug] || loading[slug]) return;
    setLoading((prev) => ({ ...prev, [slug]: true }));
    try {
      const doc = await fetchLegalDocument(slug);
      setBodies((prev) => ({ ...prev, [slug]: doc.body }));
    } catch {
      setBodies((prev) => ({
        ...prev,
        [slug]: t("terms.docError", "Не удалось загрузить текст документа."),
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [slug]: false }));
    }
  };

  const handleAccept = async () => {
    if (!agreed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await acceptTerms();
      await refresh();
    } catch {
      setError(t("terms.submitError", "Не получилось сохранить. Попробуйте ещё раз."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="terms-modal" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <div className="terms-modal__card">
        <div className="terms-modal__header">
          <h2 id="terms-title" className="terms-modal__title">
            {t("terms.title", "Правила сервиса")}
          </h2>
          <p className="terms-modal__lead">
            {t(
              "terms.lead",
              "Прежде чем продолжить, ознакомьтесь с условиями использования и подтвердите согласие.",
            )}
          </p>
        </div>

        <ul className="terms-modal__list">
          {(index?.documents ?? []).map((doc) => {
            const isOpen = openSlug === doc.slug;
            return (
              <li key={doc.slug} className="terms-modal__item">
                <button
                  type="button"
                  className="terms-modal__item-head"
                  aria-expanded={isOpen}
                  onClick={() => toggleDoc(doc.slug)}
                >
                  <span className="terms-modal__item-title">{doc.title}</span>
                  <span className="terms-modal__item-chevron">{isOpen ? "▴" : "▾"}</span>
                </button>
                {isOpen ? (
                  <div className="terms-modal__item-body">
                    {loading[doc.slug] ? (
                      <div className="terms-modal__loading">{t("common.loading", "Загрузка…")}</div>
                    ) : (
                      <pre className="terms-modal__text">{bodies[doc.slug] ?? ""}</pre>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
          {!index ? <li className="terms-modal__loading">{t("common.loading", "Загрузка…")}</li> : null}
        </ul>

        <label className="terms-modal__agree">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            {t(
              "terms.agree",
              "Я прочитал и принимаю условия публичной оферты, политики конфиденциальности и лицензии на треки.",
            )}
          </span>
        </label>

        {error ? <div className="terms-modal__error">{error}</div> : null}

        <div className="terms-modal__actions">
          <Button
            type="button"
            variant="primary"
            disabled={!agreed || submitting || !index}
            onClick={handleAccept}
          >
            {submitting ? t("common.saving", "Сохраняем…") : t("terms.accept", "Принимаю")}
          </Button>
        </div>
      </div>
    </div>
  );
}

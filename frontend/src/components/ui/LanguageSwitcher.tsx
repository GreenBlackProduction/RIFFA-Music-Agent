import { type Locale, useLocale } from "@/lib/i18n";
import "./LanguageSwitcher.css";

const OPTIONS: ReadonlyArray<{ code: Locale; label: string }> = [
  { code: "ru", label: "RU" },
  { code: "en", label: "EN" },
];

export function LanguageSwitcher() {
  const [current, setLocale] = useLocale();
  return (
    <div className="lang-switch" role="radiogroup" aria-label="Language">
      {OPTIONS.map((opt) => (
        <button
          key={opt.code}
          type="button"
          role="radio"
          aria-checked={current === opt.code}
          className={`lang-switch__btn${current === opt.code ? " lang-switch__btn--active" : ""}`}
          onClick={() => setLocale(opt.code)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

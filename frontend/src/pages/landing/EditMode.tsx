/* ════════════════════════════════════════════════
   RIFFA · Landing visual Edit Mode (beta-only, ?edit=1)
   ────────────────────────────────────────────────
   Lets the product owner tweak blocks visually — size, text colour/size,
   opacity, padding, background, alignment — by clicking a block and using the
   panel. Changes apply live (inline styles on every [data-edit] match) and
   persist to localStorage. "Скопировать правки" exports a readable report the
   owner pastes back so the dev can bake it into the real CSS.

   Zero effect on normal visitors: only mounts when the URL has ?edit=1.
   ════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "riffa_landing_edits_v1";

// CSS props we manage — cleared + re-applied on every change so a removed
// override fully resets.
const MANAGED = [
  "font-size", "font-weight", "color", "opacity", "text-align",
  "letter-spacing", "padding", "margin-top", "max-width", "background",
] as const;

type Overrides = Record<string, Record<string, string>>;

const SWATCHES: { name: string; value: string }[] = [
  { name: "чернила", value: "#161413" },
  { name: "чернила-2", value: "#4A4641" },
  { name: "оранжевый", value: "#FF3B1F" },
  { name: "изумруд", value: "#0F5D47" },
  { name: "бумага", value: "#E9E5DA" },
  { name: "бумага-2", value: "#DDD8C9" },
  { name: "белый", value: "#FAFAFA" },
];

function loadOverrides(): Overrides {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Overrides;
  } catch {
    return {};
  }
}

function applyOverrides(o: Overrides) {
  // 1. Clear every managed prop from every editable node.
  document.querySelectorAll<HTMLElement>("[data-edit]").forEach((el) => {
    MANAGED.forEach((p) => el.style.removeProperty(p));
  });
  // 2. Apply current overrides to all nodes sharing each data-edit name.
  Object.entries(o).forEach(([name, props]) => {
    document.querySelectorAll<HTMLElement>(`[data-edit="${name}"]`).forEach((el) => {
      Object.entries(props).forEach(([p, v]) => el.style.setProperty(p, v));
    });
  });
}

function numFrom(value: string | undefined): string {
  if (!value) return "";
  const m = value.match(/-?\d*\.?\d+/);
  return m ? m[0] : "";
}

export function EditMode() {
  const [overrides, setOverrides] = useState<Overrides>(() => loadOverrides());
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Persist + apply on every change.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)); } catch { /* ignore */ }
    applyOverrides(overrides);
  }, [overrides]);

  // Re-apply once more after mount (covers async-rendered blocks like examples).
  useEffect(() => {
    const t = setTimeout(() => applyOverrides(overrides), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click-to-select. Intercept clicks on editable nodes so buttons don't
  // navigate / audio doesn't play while editing.
  useEffect(() => {
    document.body.classList.add("lp-editing");
    const onClick = (e: globalThis.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".lp-edit-panel")) return; // panel stays interactive
      const node = target.closest<HTMLElement>("[data-edit]");
      if (node) {
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll(".lp-edit-selected").forEach((n) => n.classList.remove("lp-edit-selected"));
        document.querySelectorAll<HTMLElement>(`[data-edit="${node.dataset.edit}"]`).forEach((n) => n.classList.add("lp-edit-selected"));
        setSelected(node.dataset.edit || null);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.body.classList.remove("lp-editing");
      document.querySelectorAll(".lp-edit-selected").forEach((n) => n.classList.remove("lp-edit-selected"));
    };
  }, []);

  const cur = (selected && overrides[selected]) || {};

  const setProp = useCallback((prop: string, value: string) => {
    if (!selected) return;
    setOverrides((prev) => {
      const next = { ...prev, [selected]: { ...(prev[selected] || {}) } };
      if (value === "" || value == null) delete next[selected][prop];
      else next[selected][prop] = value;
      if (Object.keys(next[selected]).length === 0) delete next[selected];
      return next;
    });
  }, [selected]);

  const resetSelected = () => {
    if (!selected) return;
    setOverrides((prev) => { const n = { ...prev }; delete n[selected]; return n; });
  };
  const resetAll = () => setOverrides({});

  const exportText = (() => {
    const lines = ["=== RIFFA Landing — правки ==="];
    const names = Object.keys(overrides);
    if (names.length === 0) lines.push("(пусто — ничего не менялось)");
    names.forEach((name) => {
      lines.push(`[${name}]`);
      Object.entries(overrides[name]).forEach(([p, v]) => lines.push(`  ${p}: ${v}`));
    });
    return lines.join("\n");
  })();

  const copy = async () => {
    try { await navigator.clipboard.writeText(exportText); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { /* fallback: textarea is selectable */ }
  };

  return (
    <div className="lp-edit-panel" onClick={(e) => e.stopPropagation()}>
      <div className="lp-edit-head">
        <strong>режим правок</strong>
        <span className="lp-edit-sel">{selected ? `выбран: ${selected}` : "кликни блок →"}</span>
      </div>

      {selected ? (
        <div className="lp-edit-controls">
          <Row label="размер текста, px">
            <input type="number" value={numFrom(cur["font-size"])} placeholder="auto"
              onChange={(e) => setProp("font-size", e.target.value ? `${e.target.value}px` : "")} />
          </Row>
          <Row label="жирность">
            <select value={cur["font-weight"] || ""} onChange={(e) => setProp("font-weight", e.target.value)}>
              <option value="">—</option><option value="400">400</option><option value="500">500</option>
              <option value="600">600</option><option value="700">700</option><option value="900">900</option>
            </select>
          </Row>
          <Row label="цвет текста">
            <Swatches value={cur["color"]} onPick={(v) => setProp("color", v)} />
          </Row>
          <Row label="фон">
            <Swatches value={cur["background"]} onPick={(v) => setProp("background", v)} allowNone />
          </Row>
          <Row label="выравнивание">
            <div className="lp-edit-seg">
              {(["left", "center", "right"] as const).map((a) => (
                <button key={a} className={cur["text-align"] === a ? "on" : ""} onClick={() => setProp("text-align", cur["text-align"] === a ? "" : a)}>
                  {a === "left" ? "←" : a === "center" ? "↔" : "→"}
                </button>
              ))}
            </div>
          </Row>
          <Row label={`непрозрачность · ${numFrom(cur["opacity"]) || "1"}`}>
            <input type="range" min={0} max={1} step={0.05} value={numFrom(cur["opacity"]) || "1"}
              onChange={(e) => setProp("opacity", e.target.value === "1" ? "" : e.target.value)} />
          </Row>
          <Row label="межбукв., em">
            <input type="number" step={0.01} value={numFrom(cur["letter-spacing"])} placeholder="0"
              onChange={(e) => setProp("letter-spacing", e.target.value ? `${e.target.value}em` : "")} />
          </Row>
          <Row label="внутр. отступ, px">
            <input type="number" value={numFrom(cur["padding"])} placeholder="auto"
              onChange={(e) => setProp("padding", e.target.value ? `${e.target.value}px` : "")} />
          </Row>
          <Row label="отступ сверху, px">
            <input type="number" value={numFrom(cur["margin-top"])} placeholder="auto"
              onChange={(e) => setProp("margin-top", e.target.value ? `${e.target.value}px` : "")} />
          </Row>
          <Row label="ширина (max), px">
            <input type="number" value={numFrom(cur["max-width"])} placeholder="auto"
              onChange={(e) => setProp("max-width", e.target.value ? `${e.target.value}px` : "")} />
          </Row>
          <button className="lp-edit-reset" onClick={resetSelected}>сбросить этот блок</button>
        </div>
      ) : (
        <p className="lp-edit-hint">Наведи и кликни любой блок лендинга — появятся ползунки. Меняй размеры, цвет, текст, непрозрачность. Всё применяется сразу.</p>
      )}

      <div className="lp-edit-foot">
        <button className="lp-edit-copy" onClick={copy}>{copied ? "скопировано ✓" : "скопировать правки"}</button>
        <button className="lp-edit-resetall" onClick={resetAll}>сбросить всё</button>
      </div>
      <textarea className="lp-edit-export" readOnly value={exportText} onFocus={(e) => e.currentTarget.select()} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="lp-edit-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Swatches({ value, onPick, allowNone }: { value?: string; onPick: (v: string) => void; allowNone?: boolean }) {
  return (
    <div className="lp-edit-swatches">
      {allowNone && (
        <button className={!value ? "on" : ""} title="нет" onClick={() => onPick("")} style={{ background: "transparent" }}>×</button>
      )}
      {SWATCHES.map((s) => (
        <button key={s.value} title={s.name} className={value?.toLowerCase() === s.value.toLowerCase() ? "on" : ""}
          style={{ background: s.value }} onClick={() => onPick(s.value)} />
      ))}
      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "#161413"} onChange={(e) => onPick(e.target.value)} />
    </div>
  );
}

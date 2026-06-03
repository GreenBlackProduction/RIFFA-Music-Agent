/* ════════════════════════════════════════════════
   RIFFA · Landing visual Edit Mode (beta-only, ?edit=1)
   ────────────────────────────────────────────────
   Click a block → tweak size, text colour/size, weight, opacity, alignment,
   padding, width/height, background — or drag the corner handle to resize, or
   hide it. Live + persisted to localStorage. "Скопировать правки" exports a
   report the owner pastes back so the dev bakes it into the real CSS.

   Only mounts when the URL has ?edit=1 — zero effect on normal visitors.
   ════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "riffa_landing_edits_v1";

const MANAGED = [
  "font-size", "font-weight", "color", "opacity", "text-align", "letter-spacing",
  "padding", "margin-top", "max-width", "width", "height", "min-height",
  "background", "display",
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
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Overrides; }
  catch { return {}; }
}

function applyOverrides(o: Overrides) {
  document.querySelectorAll<HTMLElement>("[data-edit]").forEach((el) => {
    MANAGED.forEach((p) => el.style.removeProperty(p));
  });
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
  const [handle, setHandle] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)); } catch { /* ignore */ }
    applyOverrides(overrides);
  }, [overrides]);

  useEffect(() => {
    const t = setTimeout(() => applyOverrides(overrides), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstEl = useCallback(
    () => (selected ? document.querySelector<HTMLElement>(`[data-edit="${selected}"]`) : null),
    [selected],
  );

  // Keep the drag handle pinned to the selected element's bottom-right corner.
  const positionHandle = useCallback(() => {
    const el = firstEl();
    if (!el) { setHandle(null); return; }
    const r = el.getBoundingClientRect();
    setHandle({ x: r.right, y: r.bottom });
  }, [firstEl]);

  useEffect(() => { positionHandle(); }, [selected, overrides, positionHandle]);
  useEffect(() => {
    const on = () => positionHandle();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on, true); window.removeEventListener("resize", on); };
  }, [positionHandle]);

  // Click-to-select; intercept so buttons don't navigate / audio doesn't play.
  useEffect(() => {
    document.body.classList.add("lp-editing");
    const onClick = (e: globalThis.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".lp-edit-panel") || target.closest(".lp-edit-handle")) return;
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
  const resetAll = () => { setOverrides({}); setSelected(null); };

  const hidden = cur["display"] === "none";
  const toggleHide = () => setProp("display", hidden ? "" : "none");

  // Drag the corner handle → live width/height.
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = firstEl();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY, startW = r.width, startH = r.height;
    const move = (ev: PointerEvent) => {
      const w = Math.max(40, Math.round(startW + (ev.clientX - startX)));
      const h = Math.max(20, Math.round(startH + (ev.clientY - startY)));
      setProp("width", `${w}px`);
      setProp("height", `${h}px`);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

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
    catch { /* textarea is selectable as fallback */ }
  };

  return (
    <>
      {handle && !hidden && (
        <div className="lp-edit-handle" style={{ left: handle.x, top: handle.y }} onPointerDown={startDrag} title="тяни — меняй размер" />
      )}
      <div className="lp-edit-panel" onClick={(e) => e.stopPropagation()}>
        <div className="lp-edit-head">
          <strong>режим правок</strong>
          <span className="lp-edit-sel">{selected ? `выбран: ${selected}` : "кликни блок →"}</span>
        </div>

        {selected ? (
          <div className="lp-edit-controls">
            <button className={`lp-edit-hide${hidden ? " on" : ""}`} onClick={toggleHide}>
              {hidden ? "показать блок" : "скрыть / удалить блок"}
            </button>
            <Row label="ширина, px"><NumIn unit="px" value={cur["width"]} onChange={(v) => setProp("width", v)} /></Row>
            <Row label="высота, px"><NumIn unit="px" value={cur["height"]} onChange={(v) => setProp("height", v)} /></Row>
            <Row label="мин. высота, px"><NumIn unit="px" value={cur["min-height"]} onChange={(v) => setProp("min-height", v)} /></Row>
            <Row label="размер текста, px"><NumIn unit="px" value={cur["font-size"]} onChange={(v) => setProp("font-size", v)} /></Row>
            <Row label="жирность">
              <select value={cur["font-weight"] || ""} onChange={(e) => setProp("font-weight", e.target.value)}>
                <option value="">—</option><option value="400">400</option><option value="500">500</option>
                <option value="600">600</option><option value="700">700</option><option value="900">900</option>
              </select>
            </Row>
            <Row label="цвет текста"><Swatches value={cur["color"]} onPick={(v) => setProp("color", v)} /></Row>
            <Row label="фон"><Swatches value={cur["background"]} onPick={(v) => setProp("background", v)} allowNone /></Row>
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
            <Row label="межбукв., em"><NumIn unit="em" step={0.01} value={cur["letter-spacing"]} onChange={(v) => setProp("letter-spacing", v)} /></Row>
            <Row label="внутр. отступ, px"><NumIn unit="px" value={cur["padding"]} onChange={(v) => setProp("padding", v)} /></Row>
            <Row label="отступ сверху, px"><NumIn unit="px" value={cur["margin-top"]} onChange={(v) => setProp("margin-top", v)} /></Row>
            <Row label="ширина (max), px"><NumIn unit="px" value={cur["max-width"]} onChange={(v) => setProp("max-width", v)} /></Row>
            <button className="lp-edit-reset" onClick={resetSelected}>сбросить этот блок</button>
          </div>
        ) : (
          <p className="lp-edit-hint">Кликни любой блок. Появятся ползунки + оранжевый квадрат в углу — тяни его, чтобы менять размер. «Скрыть» убирает блок. Всё применяется сразу.</p>
        )}

        <div className="lp-edit-foot">
          <button className="lp-edit-copy" onClick={copy}>{copied ? "скопировано ✓" : "скопировать правки"}</button>
          <button className="lp-edit-resetall" onClick={resetAll}>сбросить всё</button>
        </div>
        <textarea className="lp-edit-export" readOnly value={exportText} onFocus={(e) => e.currentTarget.select()} />
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="lp-edit-row"><span>{label}</span>{children}</label>;
}

function NumIn({ value, onChange, unit, step }: { value?: string; onChange: (v: string) => void; unit: string; step?: number }) {
  return (
    <input
      type="number"
      step={step}
      value={numFrom(value)}
      placeholder="auto"
      onChange={(e) => onChange(e.target.value ? `${e.target.value}${unit}` : "")}
    />
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
      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value || "") ? (value as string) : "#161413"} onChange={(e) => onPick(e.target.value)} />
    </div>
  );
}

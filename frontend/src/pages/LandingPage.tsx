/* ════════════════════════════════════════════════
   RIFFA · Landing (/) — faithful 1:1 port of the fresh Claude Design mockup
   (RIFFA Landing Standalone.html). Content/layout/colours + the owner's inline
   tweaks reproduced verbatim. Tweaks-panel removed; buttons wired to SPA
   routes; scroll-reveal + active-nav + ?edit=1 visual editor kept.
   ════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { fetchRadio, type RadioTrackOut } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { EditMode } from "./landing/EditMode";
import "./LandingPage.css";

const EDIT_MODE = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("edit") === "1";
const BOT = "https://t.me/the_riffa_bot";

/* ═══════════ TWEAK DEFAULTS (frozen from the fresh mockup) ═══════════ */
const t = {
  headline: "Создай свой Аудиохит",
  subheadline: "RIFFA Studio AI создаёт треки с голосом, инструменталы, кавер-версии, звуковые эффекты на основе Suno AI — без плагинов, на Русском и Английском языке.",
  ctaMain: "Попробовать бесплатно",
  ctaSecond: "Слушать примеры",
  domain: "riffastudio.site",
  t1: "Песня с голосом", t1sub: "2–4 мин · MP3 · WAV · ОБЛОЖКА",
  t2: "Инструментальная музыка", t2sub: "Только музыка. Только инструменты и твоя фантазия",
  t3: "Обложка альбома", t3sub: "1024 × 1024 пикселей",
  t4: "Кавер-версия", t4sub: "Ваш трек/запись → любой жанр",
  t5: "Звуковой эффект", t5sub: "SFX до 30 сек",
  p1name: "ДЛЯ ТЭСТА", p1price: "Бесплатно", p1tokens: "3 токена",
  p1feat: ["1 Песня с вокалом или 1 Инструментал", "1 Обложка альбома", "Скачать MP3"],
  p2name: "СТАРТОВЫЙ", p2price: "100₽", p2tokens: "10 токенов\n~5 генераций",
  p2feat: ["5 ген. песен / инстр. / каверов (10 треков)", "20 ген. звуковых эффектов", "до 10 ген. обложек"],
  p3name: "ПРОДВИНУТЫЙ", p3price: "400₽", p3tokens: "60 токенов\n~30 генераций",
  p3feat: ["30 ген. песен / инстр. / каверов (60 треков)", "120 ген. звуковых эффектов", "до 60 ген. обложек"],
  p4name: "ПРЕМИУМ", p4price: "999₽", p4tokens: "150 · ~75 генераций",
  p4feat: ["75 ген. песен / инстр. / каверов (150 треков)", "300 ген. звуковых эффектов", "до 150 ген. обложек"],
};

/* paper bg, emerald accent */
const c = {
  bg: "#E9E5DA", bg2: "#DDD8C9", bgCard: "#E9E5DA",
  ink: "#161413", ink2: "#4A4641", rule: "rgba(22,20,19,0.18)",
  accent: "#0F5D47", emr: "#0F5D47",
};

function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="50" fill="#161413" />
      <circle cx="50" cy="50" r="38" fill="#E9E5DA" />
      <polygon points="40,32 40,68 72,50" fill="#FF3B1F" />
    </svg>
  );
}

/* ═══════════ SCHEMATIC HERO SVG (verbatim) ═══════════ */
function SchematicSVG() {
  const accent = c.accent;
  return (
    <div className="schematic-wrap" style={{ border: `1px solid ${c.rule}` }}>
      <svg viewBox="0 0 560 420" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="sch-dots" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="0.6" cy="0.6" r="0.6" fill={c.ink} opacity="0.18" />
          </pattern>
        </defs>
        <rect width="560" height="420" fill={c.bg2} />
        <rect width="560" height="420" fill="url(#sch-dots)" />
        <rect x="36" y="28" width="488" height="364" rx="18" fill={c.bg} stroke={c.ink} strokeWidth="1.2" />
        <rect x="46" y="38" width="468" height="344" rx="12" stroke={c.ink} strokeWidth="0.5" fill="none" opacity="0.25" />
        <line x1="46" y1="78" x2="514" y2="78" stroke={c.ink} strokeWidth="0.8" />
        <rect x="60" y="54" width="80" height="24" rx="12" fill={c.ink} />
        <text x="100" y="71" fontFamily="JetBrains Mono" fontSize="9" fill={c.bg} textAnchor="middle" fontWeight="600">ПЕСНЯ</text>
        <rect x="146" y="54" width="110" height="24" rx="12" stroke={c.ink} strokeWidth="0.8" fill="none" />
        <text x="201" y="71" fontFamily="JetBrains Mono" fontSize="9" fill={c.ink} textAnchor="middle">ИНСТРУМЕНТАЛ</text>
        <rect x="262" y="54" width="90" height="24" rx="12" stroke={c.ink} strokeWidth="0.8" fill="none" />
        <text x="307" y="71" fontFamily="JetBrains Mono" fontSize="9" fill={c.ink} textAnchor="middle">ОБЛОЖКА</text>
        <rect x="60" y="92" width="440" height="88" rx="10" stroke={c.ink} strokeWidth="0.8" fill="none" />
        <text x="74" y="114" fontFamily="JetBrains Mono" fontSize="8" fill={c.ink} opacity="0.5">ОПИШИТЕ ИДЕЮ</text>
        <text x="74" y="140" fontFamily="Inter" fontSize="14" fontWeight="500" fill={c.ink}>меланхоличная лофай-песня о ноябре</text>
        <rect x="74" y="150" width="2.5" height="14" fill={accent} />
        <text x="490" y="114" fontFamily="JetBrains Mono" fontSize="8" fill={c.ink} opacity="0.45" textAnchor="end">142 / 500</text>
        <rect x="60" y="192" width="64" height="26" rx="13" stroke={c.ink} strokeWidth="0.8" fill="none" />
        <text x="92" y="209" fontFamily="JetBrains Mono" fontSize="9" fill={c.ink} textAnchor="middle">ЛО-ФАЙ</text>
        <rect x="130" y="192" width="72" height="26" rx="13" stroke={c.ink} strokeWidth="0.8" fill="none" />
        <text x="166" y="209" fontFamily="JetBrains Mono" fontSize="9" fill={c.ink} textAnchor="middle">82 BPM</text>
        <rect x="208" y="192" width="78" height="26" rx="13" stroke={c.ink} strokeWidth="0.8" fill="none" />
        <text x="247" y="209" fontFamily="JetBrains Mono" fontSize="9" fill={c.ink} textAnchor="middle">М. ГОЛОС</text>
        <rect x="362" y="188" width="138" height="34" rx="17" fill={accent} />
        <text x="431" y="210" fontFamily="Inter" fontWeight="600" fontSize="12" fill="#E9E5DA" textAnchor="middle">СОЗДАТЬ →</text>
        <rect x="60" y="232" width="440" height="60" rx="10" fill={c.bg2} stroke={c.ink} strokeWidth="0.5" />
        <text x="74" y="254" fontFamily="JetBrains Mono" fontSize="8" fill={c.ink} opacity="0.5">ЗАДАЧА #4A91</text>
        <text x="490" y="254" fontFamily="JetBrains Mono" fontSize="8" fill="#0F5D47" fontWeight="600" textAnchor="end">63%</text>
        <rect x="74" y="262" width="412" height="3" fill={c.ink} opacity="0.1" />
        <rect x="74" y="262" width="260" height="3" fill={accent} />
        <text x="74" y="282" fontFamily="JetBrains Mono" fontSize="8" fill={c.ink} opacity="0.55">РЕНДЕР АУДИО · ОСТАЛОСЬ ≈12 СЕК</text>
        <rect x="60" y="306" width="440" height="56" rx="10" stroke={c.ink} strokeWidth="0.8" fill="none" />
        <rect x="78" y="320" width="32" height="28" rx="4" fill={c.ink} />
        <polygon points="86,326 86,342 100,334" fill={c.bg} />
        <text x="124" y="334" fontFamily="Inter" fontSize="13" fontWeight="600" fill={c.ink}>монолог в дождь</text>
        <text x="124" y="350" fontFamily="JetBrains Mono" fontSize="8" fill={c.ink} opacity="0.6">2:14 / 2:48 · ЛО-ФАЙ</text>
        {[0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78].map((x, i) => {
          const h = [6, 12, 8, 16, 8, 12, 14, 8, 10, 14, 8, 8, 6, 6][i];
          const op = i > 9 ? 1 - (i - 9) * 0.25 : 1;
          return <line key={x} x1={280 + x} y1={334 - h / 2} x2={280 + x} y2={334 + h / 2} stroke={c.ink} strokeWidth="1.6" strokeLinecap="round" opacity={op} />;
        })}
        <rect x="392" y="322" width="58" height="24" rx="12" fill="#0F5D47" />
        <text x="421" y="338" fontFamily="JetBrains Mono" fontSize="8" fill="#E9E5DA" fontWeight="600" textAnchor="middle">↓ MP3</text>
        <rect x="456" y="322" width="44" height="24" rx="12" stroke="#0F5D47" strokeWidth="0.8" fill="none" />
        <text x="478" y="338" fontFamily="JetBrains Mono" fontSize="8" fill="#0F5D47" fontWeight="600" textAnchor="middle">WAV</text>
        {[{ n: "1", x: 22, y: 66 }, { n: "2", x: 22, y: 136 }, { n: "3", x: 22, y: 205 }, { n: "4", x: 22, y: 262 }].map(({ n, x, y }) => (
          <g key={n}>
            <line x1={x + 14} y1={y} x2={58} y2={y} stroke={c.ink} strokeWidth="0.7" />
            <circle cx={x} cy={y} r={11} fill={n === "3" ? "#0F5D47" : accent} />
            <text x={x} y={y + 4} fontFamily="JetBrains Mono" fontSize="10" fontWeight="600" fill="#E9E5DA" textAnchor="middle">{n}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ═══════════ TYPE ICONS (verbatim) ═══════════ */
function typeIcon(key: number, ink: string) {
  switch (key) {
    case 0: return (<svg width="48" height="48" viewBox="0 0 24 24" fill={ink}><path d="M9.34,10.793a6.179,6.179,0,0,1,.545-8.275l.633-.634a6.179,6.179,0,0,1,8.274-.544,5.946,5.946,0,0,1,2.146,4.343,6.01,6.01,0,0,1-1.751,4.5l-1,1a6.018,6.018,0,0,1-4.246,1.758q-.129,0-.258-.006A5.95,5.95,0,0,1,9.34,10.793ZM18.757,16a5.214,5.214,0,0,0-3.707,1.535A15.14,15.14,0,0,1,4.272,22H3.122a1.121,1.121,0,0,1-.794-1.914l.7-.7a7.176,7.176,0,0,0,4.6-2.092l3.054-3.054A8,8,0,0,1,7.809,12.08a7.568,7.568,0,0,1-1.082-1.725L3.7,13.379a7.171,7.171,0,0,0-2.092,4.6l-.7.7A3.121,3.121,0,0,0,3.122,24h1.15a17.13,17.13,0,0,0,12.192-5.05A3.243,3.243,0,0,1,22,21.242V23a1,1,0,0,0,2,0V21.242A5.249,5.249,0,0,0,18.757,16Z" /></svg>);
    case 1: return (<svg width="48" height="48" viewBox="0 0 24 24" fill={ink}><path d="m22.668,16.94c-.475-.769-.85-1.376-.85-2.122,0-.784.186-1.366.421-2.104.279-.875.626-1.963.729-3.653.031-.51-.326-.96-.83-1.047-.499-.085-.99.221-1.13.711-.172.602-.797,1.904-3.009,2.209V1c0-.552-.448-1-1-1-.346,0-.651.176-.831.444-.007-.019-.011-.028-.011-.028,0,0-2.158,2.543-2.158,4.085,0,.5,1.08,1.436,2,1.5v4.929c-2.837-.427-2.992-2.657-3-2.945-.008-.546-.454-.985-1-.985h-.004c-.551.002-.996.449-.996,1,0,2.33.422,3.652.76,4.714.235.737.421,1.32.421,2.104,0,.746-.375,1.353-.85,2.122-.593.959-1.332,2.154-1.332,3.878,0,2.517,2.795,3.182,4.273,3.182h5.454c1.478,0,4.273-.665,4.273-3.182,0-1.724-.738-2.918-1.332-3.878Zm-2.941,5.06h-5.454c-.023,0-2.273-.051-2.273-1.182,0-1.156.501-1.967,1.033-2.827.539-.872,1.149-1.859,1.149-3.173,0-1.01-.213-1.756-.454-2.518.839.428,1.913.7,3.272.7,1.373,0,2.436-.263,3.258-.654-.235.747-.44,1.483-.44,2.473,0,1.314.61,2.302,1.149,3.173.531.859,1.033,1.671,1.033,2.827,0,1.136-2.253,1.182-2.273,1.182ZM9,1.5v1.046c0,.62-.192,1.226-.551,1.732l-.449.636v3.119c.024.002.049.003.073.005.551.041.965.52.924,1.07-.039.526-.477.927-.996.927v4.965c0,.552-.448,1-1,1s-1-.448-1-1v-4.963c-1.991.156-3,.815-3,1.963,0,.306.218.726.429,1.132.281.542.571,1.102.571,1.743,0,.827-.494,1.461-.971,2.074-.529.679-1.029,1.321-1.029,2.26,0,1.342,1.912,2.792,5,2.792.552,0,1,.448,1,1s-.448,1-1,1c-3.991,0-7-2.06-7-4.792,0-1.626.838-2.702,1.451-3.488.205-.263.547-.703.549-.845,0-.153-.201-.54-.347-.822-.291-.561-.653-1.26-.653-2.053,0-1.393.678-3.665,5-3.966v-3.105l-.441-.618c-.363-.509-.559-1.118-.559-1.744v-1.067c0-.828.672-1.5,1.5-1.5h1c.828,0,1.5.672,1.5,1.5Zm10,17.5c0,.552-.448,1-1,1h-2c-.552,0-1-.448-1-1s.448-1,1-1h2c.552,0,1,.448,1,1Z" /></svg>);
    case 2: return (<svg width="48" height="48" viewBox="0 0 24 24" fill={ink}><path d="M9,5.5c0-.83,.67-1.5,1.5-1.5s1.5,.67,1.5,1.5-.67,1.5-1.5,1.5-1.5-.67-1.5-1.5Zm15-.5v6c0,2.76-2.24,5-5,5H10c-2.76,0-5-2.24-5-5V5C5,2.24,7.24,0,10,0h9c2.76,0,5,2.24,5,5ZM7,11c0,.77,.29,1.47,.77,2.01l5.24-5.24c.98-.98,2.69-.98,3.67,0l1.04,1.04c.23,.23,.62,.23,.85,0l3.43-3.43v-.38c0-1.65-1.35-3-3-3H10c-1.65,0-3,1.35-3,3v6Zm15,0v-2.79l-2.02,2.02c-.98,.98-2.69,.98-3.67,0l-1.04-1.04c-.23-.23-.61-.23-.85,0l-4.79,4.79c.12,.02,.24,.02,.37,.02h9c1.65,0,3-1.35,3-3Zm-3.91,7.04c-.53-.15-1.08,.17-1.23,.7l-.29,1.06c-.21,.77-.71,1.42-1.41,1.81-.7,.4-1.51,.5-2.28,.29l-8.68-2.38c-1.6-.44-2.54-2.09-2.1-3.69l.96-3.56c.14-.53-.17-1.08-.7-1.23-.53-.14-1.08,.17-1.23,.7L.18,15.29c-.73,2.66,.84,5.42,3.5,6.15l8.68,2.38c.44,.12,.89,.18,1.33,.18,.86,0,1.7-.22,2.47-.66,1.16-.66,1.99-1.73,2.35-3.02l.29-1.06c.15-.53-.17-1.08-.7-1.23Z" /></svg>);
    case 3: return (<svg width="48" height="48" viewBox="0 0 24 24" fill={ink}><path d="m9,8c-2.206,0-4,1.794-4,4s1.794,4,4,4,4-1.794,4-4-1.794-4-4-4Zm0,5.5c-.828,0-1.5-.672-1.5-1.5s.672-1.5,1.5-1.5,1.5.672,1.5,1.5-.672,1.5-1.5,1.5ZM19,2H5C2.243,2,0,4.243,0,7v10c0,2.757,2.243,5,5,5h14c2.757,0,5-2.243,5-5V7c0-2.757-2.243-5-5-5Zm-10,16c-3.309,0-6-2.691-6-6s2.691-6,6-6,6,2.691,6,6-2.691,6-6,6Zm11-5.321c0,.682-.136,1.344-.404,1.97l-1.177,2.745c-.163.38-.532.606-.919.606-.131,0-.265-.025-.394-.081-.507-.218-.743-.806-.525-1.312l1.177-2.745c.161-.376.242-.773.242-1.183v-5.679c0-.553.448-1,1-1s1,.447,1,1v5.679Z" /></svg>);
    case 4: return (<svg width="48" height="48" viewBox="0 0 24 24" fill={ink}><path d="m19,8v8c0,.553-.447,1-1,1s-1-.447-1-1v-8c0-.553.447-1,1-1s1,.447,1,1ZM14,0c-.553,0-1,.447-1,1v22c0,.553.447,1,1,1s1-.447,1-1V1c0-.553-.447-1-1-1Zm8,4c-.553,0-1,.447-1,1v14c0,.553.447,1,1,1s1-.447,1-1V5c0-.553-.447-1-1-1Zm-12,0c-.553,0-1,.447-1,1v14c0,.553.447,1,1,1s1-.447,1-1V5c0-.553-.447-1-1-1Zm-4,3c-.553,0-1,.447-1,1v8c0,.553.447,1,1,1s1-.447,1-1v-8c0-.553-.447-1-1-1Zm-4,2c-.553,0-1,.447-1,1v4c0,.553.447,1,1,1s1-.447,1-1v-4c0-.553-.447-1-1-1Z" /></svg>);
    default: return null;
  }
}

export function LandingPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeTrack, setActiveTrack] = useState<number | null>(null);
  const [hoverTrack, setHoverTrack] = useState<number | null>(null);
  const [realRadioTracks, setRealRadioTracks] = useState<RadioTrackOut[]>([]);
  const radioAudioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch real radio tracks for the landing chart
  useEffect(() => {
    let alive = true;
    fetchRadio({ sort: "plays", period: "week", limit: 6 })
      .then((r) => { if (alive && r.items.length > 0) setRealRadioTracks(r.items); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Active section tracking for nav highlight
  const [activeSection, setActiveSection] = useState("hero");
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const ids = ["hero", "types", "agent", "process", "radio", "interactions", "pricing"];
    const ios: IntersectionObserver[] = [];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const io = new IntersectionObserver(
        (entries) => { entries.forEach((e) => { if (e.isIntersecting) setActiveSection(id); }); },
        { threshold: 0.35 },
      );
      io.observe(el);
      ios.push(io);
    });
    return () => ios.forEach((io) => io.disconnect());
  }, []);

  // Scroll-reveal (skipped in edit mode so blocks stay visible).
  useEffect(() => {
    if (EDIT_MODE) return;
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    root.querySelectorAll<HTMLElement>(".type-card, .process-step, .price-card, .agent-feature, .section-head, .track-action-card").forEach((el, i) => {
      el.classList.add("reveal");
      const d = i % 6;
      if (d) el.classList.add(`reveal-delay-${d}`);
      io.observe(el);
    });
    root.querySelectorAll<HTMLElement>(".radio-track").forEach((el, i) => {
      el.classList.add("reveal");
      if (i < 6) el.classList.add(`reveal-delay-${i + 1}`);
      io.observe(el);
    });
    root.querySelectorAll<HTMLElement>(".agent-left").forEach((el) => { el.classList.add("reveal-left"); io.observe(el); });
    root.querySelectorAll<HTMLElement>(".agent-right").forEach((el) => { el.classList.add("reveal-right"); io.observe(el); });
    return () => io.disconnect();
  }, []);

  if (!isLoading && user && !EDIT_MODE) return <Navigate to="/studio" replace />;

  const go = (href: string) => () => { if (/^https?:\/\//.test(href)) window.open(href, "_blank", "noopener"); else navigate(href); };
  const scrollTo = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  // 85% opacity + backdrop blur → frosted-glass effect over page content.
  const glassBg = "rgba(233,229,218,0.85)";
  const navToSection: Record<string, string> = { types: "студия", agent: "агент", process: "как пользоваться", radio: "радио", pricing: "тарифы", interactions: "радио" };

  const types = [{ name: t.t1, sub: t.t1sub }, { name: t.t2, sub: t.t2sub }, { name: t.t3, sub: t.t3sub }, { name: t.t4, sub: t.t4sub }, { name: t.t5, sub: t.t5sub }];
  const agentFeatures = [
    { n: "01", title: "Понимает", desc: "Понимает контекст, анализирует исполнителей, специалист в музыке" },
    { n: "02", title: "Уточняет", desc: "Задаёт вопросы, чтобы трек вышел точнее" },
    { n: "03", title: "Помнит", desc: "История заказов сохраняется в профиле" },
    { n: "04", title: "Отправляет", desc: "уведомление о готовности генерации" },
  ];
  const steps = [
    { h: "Опишите идею.\nИли спросите агента.", p: "Напишите в свободной форме — жанр, настроение, повод. Агент задаст уточняющие вопросы и сам соберёт параметры.", tip: "Или вставьте готовый текст песни — модель использует его как лирику" },
    { h: "Ждите около 2–4 минут.", p: "Нейросеть обрабатывает промт, пишет структуру, лирику и рендерит аудио. Прогресс виден в карточке задачи.", tip: "≈ от 30 сек для треков\n≈ 20 сек для обложки" },
    { h: "Скачайте MP3 или WAV. Используйте где угодно.", p: "Без копирайта — заливайте в YouTube, TikTok, Reels, на стриминги. Все треки хранятся в профиле.", tip: "mp3 · конвертация в wav без сжатия" },
  ];
  // Fallback demo tracks shown until real ones load
  const demoTracks = [
    { rank: "01", title: "Монолог в дождь", genre: "Ло-фай", mood: "меланхолия", dur: "2:48", audioUrl: "" },
    { rank: "02", title: "Последний автобус", genre: "Поп", mood: "ностальгия", dur: "3:12", audioUrl: "" },
    { rank: "03", title: "Северный ветер", genre: "Инструментал", mood: "атмосфера", dur: "4:05", audioUrl: "" },
    { rank: "04", title: "Апрельский джаз", genre: "Джаз", mood: "лёгкость", dur: "3:44", audioUrl: "" },
    { rank: "05", title: "Летний кавер", genre: "Кавер", mood: "энергия", dur: "2:58", audioUrl: "" },
    { rank: "06", title: "Городские огни", genre: "R&B", mood: "вечер", dur: "3:28", audioUrl: "" },
  ];
  const tracks = realRadioTracks.length > 0
    ? realRadioTracks.slice(0, 6).map((t, i) => ({
        rank: String(i + 1).padStart(2, "0"),
        title: t.title || "Без названия",
        genre: t.genre || "–",
        mood: t.mood || "",
        dur: t.duration > 0 ? `${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, "0")}` : "–",
        audioUrl: t.audio_url,
      }))
    : demoTracks;
  // Cycling brand colours for rank numbers: emerald → orange → dark
  const rankColors = ["#0F5D47", "#FF3B1F", "#161413"];
  const bars = [
    [4, 9, 13, 6, 15, 8, 5, 11, 7, 12, 9, 4, 8, 10, 6], [6, 11, 8, 14, 6, 12, 10, 5, 8, 13, 7, 9, 11, 6, 8],
    [8, 5, 12, 10, 6, 14, 9, 7, 11, 5, 8, 12, 6, 9, 7], [5, 12, 7, 9, 14, 6, 10, 8, 5, 11, 7, 12, 9, 6, 10],
    [10, 6, 13, 8, 5, 11, 7, 9, 12, 6, 10, 5, 8, 13, 7], [7, 11, 5, 12, 8, 6, 14, 9, 5, 10, 8, 11, 6, 9, 12],
  ];
  const tiers = [
    { name: t.p1name, price: t.p1price, tokens: t.p1tokens, feat: t.p1feat, featured: false },
    { name: t.p2name, price: t.p2price, tokens: t.p2tokens, feat: t.p2feat, featured: false },
    { name: t.p3name, price: t.p3price, tokens: t.p3tokens, feat: t.p3feat, featured: false },
    { name: t.p4name, price: t.p4price, tokens: t.p4tokens, feat: t.p4feat, featured: true },
  ];

  return (
    <div className="rl-root page" ref={rootRef} style={{ background: c.bg, color: c.ink }}>
      {/* NAV — position:sticky top:0, 95% backdrop, active-link per section */}
      <nav className={`nav${scrolled ? " glass" : ""}`} data-edit="nav" style={{ background: glassBg, borderColor: c.rule, color: c.ink }}>
        <div className="wrap">
          <div className="nav-inner">
            <div className="nav-brand">
              <Mark size={22} />
              <span style={{ color: c.ink, fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 22 }}>RIFFA Studio AI</span>
            </div>
            <div className="nav-links">
              {[
                ["#types",   "types",   "студия"],
                ["#agent",   "agent",   "агент"],
                ["#process", "process", "как пользоваться"],
                ["#radio",   "radio",   "радио"],
                ["#pricing", "pricing", "тарифы"],
              ].map(([href, id, label]) => (
                <a key={id} href={href} style={{ color: c.ink }} className={navToSection[activeSection] === label ? "active" : ""} onClick={scrollTo(id)}>{label}</a>
              ))}
            </div>
            <button className="nav-cta" style={{ background: c.accent, color: "#E9E5DA", fontSize: "13px" }} onClick={go("/studio")}>{t.ctaMain}</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero" className="hero" data-edit="hero" style={{ borderColor: c.rule, background: c.bg, color: c.ink }}>
        <div className="wrap">
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.45, marginBottom: 28, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px" }}>{t.domain} · ПЛАТФОРМА AI ГЕНЕРАЦИИ МУЗЫКИ</span>
            <span>· 2026</span>
          </div>
          <div className="hero-split">
            <div>
              <h1 className="hero-headline" data-edit="hero-title" style={{ color: "rgb(209, 98, 42)", fontSize: "95px", whiteSpace: "pre-line" }}>
                Создай <span style={{ color: "#232323" }}>свой</span> <span style={{ fontSize: "107px", color: "rgb(15, 93, 71)" }}>Аудиохит!</span>
              </h1>
              <div className="hero-actions" style={{ marginTop: "36px" }}>
                <button className="btn-primary" style={{ background: c.accent, color: "#E9E5DA", height: 52, padding: "0 32px", fontSize: "13px", letterSpacing: "1.5px" }} onClick={go("/studio")}>{t.ctaMain}</button>
                <button className="btn-ghost" style={{ color: "#EC560B", borderColor: "#EC560B", padding: "0 28px", fontSize: "13px", letterSpacing: "1px", height: 52 }} onClick={scrollTo("radio")}>{t.ctaSecond}</button>
              </div>
            </div>
            <SchematicSVG />
          </div>
          {/* Subheadline — full width below both columns */}
          <p data-edit="hero-sub" style={{
            color: c.ink, letterSpacing: "0.02em", fontWeight: 500,
            margin: "32px 0 0", lineHeight: "1.65", fontSize: "16px",
            maxWidth: "100%", borderTop: `1px solid ${c.rule}`, paddingTop: "24px",
            opacity: 0.75,
          }}>{t.subheadline}</p>
        </div>
      </section>

      {/* TYPES */}
      <section id="types" className="types-section" data-edit="types" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">01</span> · что можно создать</div>
            <h2 style={{ color: "rgb(220, 99, 40)" }}>Создавай — что хочешь!</h2>
            <div className="right">на одном экране</div>
          </div>
          <div className="types-grid" style={{ borderColor: c.rule }}>
            {types.map((tp, i) => (
              <div key={i} className="type-card" data-edit="type-card" style={{ borderColor: c.rule }}>
                <div className="type-num" style={{ color: c.ink }}>{"0" + (i + 1)}</div>
                <div className="type-icon">{typeIcon(i, c.ink)}</div>
                <h3 style={{ color: c.ink }}>{tp.name}</h3>
                <p style={{ color: c.ink }}>{tp.sub}</p>
                <div className="type-meta" style={{ borderColor: c.rule, color: "#0F5D47", fontWeight: 800, fontSize: 12, opacity: 1, height: "45px", letterSpacing: "0.8px" }}>без копирайта</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AGENT */}
      <section id="agent" className="agent-section" data-edit="agent" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">02</span> · агент</div>
            <h2 style={{ color: "rgb(220, 99, 40)" }}>Умный ИИ агент собирает промт на лету.</h2>
            <div className="right" style={{ fontSize: "15px" }}>@the_riffa_bot</div>
          </div>
          <div className="agent-grid">
            <div className="agent-left" style={{ borderColor: c.rule }}>
              <div className="agent-headline" style={{ color: c.ink }}>
                Просто напиши —<br />
                <span style={{ color: c.accent }}>остальное сделаю я.</span>
              </div>
              <p className="agent-sub" style={{ color: c.ink }}>Агент понимает любой запрос на русском или английском. Уточняет детали, генерирует трек и отправляет файл в чат — без форм, без сайта, без установки.</p>
              <button className="btn-primary" style={{ background: c.accent, color: "#E9E5DA", width: "fit-content", height: 46, fontSize: 13, letterSpacing: "1.5px", padding: "0 24px" }} onClick={go(BOT)}>Открыть агента →</button>
            </div>
            <div className="agent-right">
              <div className="agent-features-grid">
                {agentFeatures.map((f) => (
                  <div key={f.n} className="agent-feature" data-edit="agent-feature" style={{ borderColor: c.rule, background: "transparent" }}>
                    <div className="agent-feature-num" style={{ color: c.ink }}>{f.n}</div>
                    <div className="agent-feature-title" style={{ color: c.ink }}>{f.title}</div>
                    <div className="agent-feature-desc" style={{ color: c.ink }}>{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section id="process" className="process-section" data-edit="process" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">02</span> · как работает</div>
            <h2 style={{ color: "rgb(220, 99, 40)" }}>Всего три шага до твоего первого трека, около 2–4 минут.</h2>
            <div className="right"></div>
          </div>
          <div className="process-grid">
            {steps.map((s, i) => (
              <div key={i} className="process-step" data-edit="process-step" style={{ borderColor: c.rule }}>
                <div className="step-num" style={{ color: c.accent, opacity: 1 }}>{"0" + (i + 1)}</div>
                <h3 style={{ color: c.ink }}>{s.h}</h3>
                <p style={{ color: c.ink }}>{s.p}</p>
                <div className="tip" style={{ borderColor: c.rule, color: c.ink, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.02em" }}>{s.tip}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RADIO */}
      <section id="radio" className="radio-section" data-edit="radio" style={{ background: c.bg2, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">04</span> · радио</div>
            <h2 style={{ color: "rgb(220, 99, 40)" }}>Недельный чарт — треки, созданные в RIFFA.</h2>
            <div className="right" style={{ fontSize: "15px" }}>обновляется еженедельно</div>
          </div>
          <div className="radio-chart" style={{ borderColor: c.rule }}>
            {tracks.map((tr, i) => {
              const isActive = activeTrack === i;
              const isHover = hoverTrack === i;
              // Rank colour: on hover cycle through brand colours; active uses accent
              const rankCol = isActive ? c.accent : isHover ? rankColors[i % 3] : c.ink;
              const rankOp  = isActive || isHover ? 1 : 0.2;
              const playFill = isActive ? c.accent : c.rule;
              return (
                <div
                  key={i}
                  className="radio-track"
                  style={{ borderColor: c.rule, background: isActive ? "rgba(22,20,19,0.04)" : "transparent" }}
                  onMouseEnter={() => setHoverTrack(i)}
                  onMouseLeave={() => setHoverTrack(null)}
                >
                  <div className="radio-rank" style={{ color: rankCol, opacity: rankOp }}>{tr.rank}</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: c.ink }}>{tr.title}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.5, marginTop: 3, color: c.ink }}>{tr.genre}{tr.mood ? ` · ${tr.mood}` : ""}</div>
                  </div>
                  <svg width="110" height="28" viewBox="0 0 110 28" style={{ opacity: isActive ? 1 : 0.3 }}>
                    {bars[i].map((h, j) => <rect key={j} x={j * 7.5} y={(28 - h) / 2} width="5" height={h} rx="2.5" fill={isActive && j < 9 ? rankCol : c.ink} />)}
                  </svg>
                  <div className="radio-dur" style={{ color: c.ink }}>{tr.dur}</div>
                  <button
                    className="radio-play-btn"
                    style={{ borderColor: playFill, background: isActive ? c.accent : "transparent" }}
                    onClick={() => {
                      const audio = radioAudioRef.current;
                      if (!audio) return;
                      if (isActive) { audio.pause(); setActiveTrack(null); return; }
                      if (tr.audioUrl) {
                        audio.src = tr.audioUrl;
                        void audio.play().catch(() => {});
                      }
                      setActiveTrack(i);
                    }}
                  >
                    {isActive
                      ? <svg width="10" height="12" viewBox="0 0 10 12" fill="#E9E5DA"><rect x="0" y="0" width="3.5" height="12"/><rect x="6.5" y="0" width="3.5" height="12"/></svg>
                      : <svg width="10" height="12" viewBox="0 0 10 12" fill={c.ink}><polygon points="0,0 10,6 0,12"/></svg>}
                  </button>
                </div>
              );
            })}
          </div>
          <audio ref={radioAudioRef} onEnded={() => setActiveTrack(null)} preload="none" crossOrigin="anonymous" />
          <div className="radio-cta-wrap">
            <button className="btn-ghost" style={{ color: c.accent, borderColor: c.accent, height: 46, fontSize: 13, letterSpacing: "1.5px", padding: "0 28px" }} onClick={go("/studio")}>Создать свой трек →</button>
          </div>
        </div>
      </section>

      {/* TRACK INTERACTIONS — between radio and pricing */}
      <TrackInteractionsSection />

      {/* PRICING */}
      <section id="pricing" className="pricing-section" data-edit="pricing" style={{ background: c.bg, color: c.ink, borderColor: "rgba(255,255,255,0.18)" }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">03</span> · тарифы</div>
            <h2 style={{ maxWidth: "769px", color: "rgb(220, 99, 40)" }}>Прозрачная цена — оплата картой РФ/СНГ, USD, Telegram Stars.</h2>
            <div className="right" style={{ fontSize: "15px", lineHeight: "1.3" }}>токены без срока</div>
          </div>
          <div className="pricing-grid" style={{ borderColor: c.rule }}>
            {tiers.map((tier, i) => (
              <div key={i} className={`price-card${tier.featured ? " featured" : ""}`} data-edit="price-card" style={{ borderColor: c.rule, background: tier.featured ? c.ink : "transparent", border: tier.featured ? "none" : undefined, padding: tier.featured ? "32px 28px" : undefined }}>
                <div className="price-tier" style={{ color: tier.featured ? "#E9E5DA" : i === 2 ? "rgb(15,93,71)" : c.ink, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 1, fontSize: "14px" }}>{tier.name}</div>
                <div className="price-amount" style={{ fontSize: "40px", color: i === 0 ? c.ink : i === 1 ? "rgb(0,0,0)" : i === 2 ? "rgb(15,93,71)" : "rgb(220,99,40)" }}>{tier.price}</div>
                <div className="price-tokens" style={{ borderColor: tier.featured ? "rgba(233,229,218,0.3)" : c.rule, color: tier.featured ? "#E9E5DA" : c.ink, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "18px", opacity: 1, whiteSpace: "pre-line" }}>{tier.tokens}</div>
                <ul className="price-features">
                  {tier.feat.filter((f) => f && f.trim()).map((f, j) => (
                    <li key={j} style={{ color: tier.featured ? "#E9E5DA" : c.ink, fontWeight: 600, padding: "0 0 0 16px", opacity: 1 }}>{f}</li>
                  ))}
                </ul>
                <button className="price-cta" style={{ background: tier.featured ? "rgba(233,229,218,0.15)" : "transparent", color: tier.featured ? "#FFFFFF" : c.ink, borderColor: "rgb(15, 93, 71)", borderWidth: tier.featured ? "3px" : i === 0 ? "4px" : undefined, borderRadius: i === 0 ? "0px" : undefined, fontSize: "20px", opacity: 1 }} onClick={go(i === 0 ? "/studio" : "/profile")}>
                  {i === 0 ? "НАЧАТЬ" : "ВЫБРАТЬ"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer" data-edit="footer" style={{ background: c.bg, color: c.ink }}>
        <div className="wrap">
          <div className="footer-grid" style={{ borderColor: c.rule }}>
            {[
              { title: "продукт", links: [["агент", BOT], ["студия", "/studio"], ["радио", "/radio"], ["профиль", "/profile"]] },
              { title: "контент", links: [["песни с вокалом", "/studio"], ["инструменталы", "/studio"], ["обложки", "/studio"], ["каверы", "/studio"]] },
              { title: "помощь", links: [["как пользоваться", "#process"], ["тарифы", "#pricing"], ["faq", "#process"], ["поддержка", "https://t.me/riffasupport"]] },
              { title: "компания", links: [["о нас", BOT], ["условия", "/docs/offer.txt"], ["конфиденциальность", "/docs/privacy.txt"], ["контакты", BOT]] },
            ].map((col) => (
              <div key={col.title} className="footer-col" style={{ color: c.ink }}>
                <div className="title">{col.title}</div>
                {col.links.map(([label, href]) => (
                  <a key={label} href={href} style={{ color: c.ink, opacity: 1 }} onClick={(e) => {
                    if (href.startsWith("#")) { e.preventDefault(); document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth" }); }
                    else if (href.startsWith("/") && !href.endsWith(".txt")) { e.preventDefault(); navigate(href); }
                    else if (href.startsWith("http")) { e.preventDefault(); window.open(href, "_blank", "noopener"); }
                  }}>{label}</a>
                ))}
              </div>
            ))}
          </div>
          <div className="footer-bottom" style={{ borderColor: c.rule, color: c.ink, opacity: 1 }}>
            <span>© 2026 riffa studio · все права защищены</span>
            <span>{t.domain}</span>
            <span>telegram: @the_riffa_bot · @riffasupport</span>
          </div>
        </div>
      </footer>

      {EDIT_MODE && <EditMode />}
    </div>
  );
}

/* ═══════════ TRACK INTERACTIONS SECTION ═══════════ */
function TrackInteractionsSection() {
  type ActionVariant = "emr" | "accent" | "hi" | "default";
  // Icons from the real app (GlobalPlayer/FileActions)
  const IcoDown = () => <svg viewBox="0 0 16 16" width="13" height="13" fill="none"><path d="M8 2v8M5 7l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const IcoBolt = () => <svg viewBox="0 0 16 16" width="13" height="13" fill="none"><path d="M9 2L4 9h4l-1 5 5-7H8l1-5z" fill="currentColor"/></svg>;
  const IcoUp   = () => <svg viewBox="0 0 16 16" width="13" height="13" fill="none"><path d="M8 13V5M5 8l3-3 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 14h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
  const IcoThumb = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>;
  const IcoPen  = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
  const IcoLink = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>;

  const actions: { n: string; icon: React.ReactNode; label: string; desc: string; variant: ActionVariant }[] = [
    { n: "1", icon: <IcoDown />,  label: "MP3",           desc: "Скачать трек",              variant: "emr"     },
    { n: "2", icon: <IcoDown />,  label: "WAV",           desc: "Конвертировать в WAV",       variant: "hi"      },
    { n: "3", icon: <IcoBolt />,  label: "Похожий",       desc: "Создать похожий трек",       variant: "hi"      },
    { n: "4", icon: <IcoUp />,    label: "Радио",         desc: "Отправить трек на радио",    variant: "accent"  },
    { n: "5", icon: <IcoThumb />, label: "Лайк / Дизлайк", desc: "Оценить трек",             variant: "default" },
    { n: "6", icon: <IcoPen />,   label: "Переименовать", desc: "Сменить название файла",     variant: "hi"      },
    { n: "7", icon: <IcoLink />,  label: "Поделиться",    desc: "Поделиться страницей песни", variant: "hi"      },
  ];

  return (
    <section id="interactions" className="interactions-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
      <div className="wrap">
        <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
          <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">05</span> · библиотека</div>
          <h2 style={{ color: "rgb(220, 99, 40)" }}>Управляй треками — 7 действий.</h2>
          <div className="right">всё на одном экране</div>
        </div>

        <div className="interactions-grid">
          {/* LEFT — schematic SVG illustration */}
          <div className="interactions-svg-col">
            <TrackCardSVG />
          </div>

          {/* RIGHT — action cards list */}
          <div className="interactions-list-col">
            <p className="interactions-intro">
              У каждого трека в библиотеке есть меню действий —<br />
              нажми кнопку <strong>⚡</strong> на карточке трека.
            </p>
            <div className="interactions-actions">
              {actions.map((a) => {
                const col = a.variant === "accent" ? c.accent : a.variant === "emr" ? "#0F5D47" : a.variant === "hi" ? "#FF3B1F" : c.ink;
                return (
                  <div key={a.n} className="track-action-card" style={{ borderColor: c.rule }}>
                    <div className="tac-badge" style={{ background: col }}>{a.n}</div>
                    <div className="tac-name-col">
                      <span className="tac-icon" style={{ color: col }}>{a.icon}</span>
                      <span className="tac-label" style={{ color: col }}>{a.label}</span>
                    </div>
                    <div className="tac-desc">{a.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Schematic SVG of a track card with the bolt-menu expanded */
function TrackCardSVG() {
  const ink = c.ink;
  const bg = c.bg;
  const bg2 = c.bg2;
  const rule = c.rule;
  const accent = c.accent;
  const emr = "#0F5D47";
  const hi = "#FF3B1F";
  const paper = "#E9E5DA";

  // Helper: render a single action button with an in-button numbered badge.
  // Numbers are placed INSIDE the button left-side — no elements overlap.
  type V = "default" | "emr" | "accent" | "hi";
  const actionBtn = (bx: number, by: number, bw: number, num: string, label: string, v: V) => {
    const bh = 32, br = 16;
    let fill = "transparent", stroke = ink, sw = 0.8, tf = ink;
    let bf = ink, bfOp = 0.12, btf = ink;
    if (v === "emr")    { stroke = emr; tf = emr; bf = emr; btf = emr; }
    if (v === "hi")     { stroke = hi;  tf = hi;  bf = hi;  btf = hi;  }
    if (v === "accent") { fill = accent; sw = 0; tf = paper; bf = paper; bfOp = 0.22; btf = paper; }
    const cy = by + bh / 2;
    return (
      <g key={`ab-${num}`}>
        <rect x={bx} y={by} width={bw} height={bh} rx={br} fill={fill} stroke={stroke} strokeWidth={sw} />
        <circle cx={bx + 17} cy={cy} r={10} fill={bf} fillOpacity={bfOp} />
        <text x={bx + 17} y={cy + 3.5} fontFamily="JetBrains Mono" fontSize="9" fill={btf} textAnchor="middle" fontWeight="700">{num}</text>
        <text x={bx + 34} y={cy + 3.5} fontFamily="JetBrains Mono" fontSize="9" fill={tf}>{label}</text>
      </g>
    );
  };

  const wH = [4, 8, 12, 6, 14, 8, 5, 10, 7, 11, 8, 5, 8, 9, 6, 4, 9, 11, 6, 5];

  return (
    <div className="schematic-wrap" style={{ border: `1px solid ${rule}` }}>
      <svg viewBox="0 0 540 360" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="int-dots2" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="0.6" cy="0.6" r="0.6" fill={ink} opacity="0.14" />
          </pattern>
        </defs>

        {/* Background */}
        <rect width="540" height="360" fill={bg2} />
        <rect width="540" height="360" fill="url(#int-dots2)" />

        {/* Outer frame */}
        <rect x="12" y="12" width="516" height="336" rx="14" fill={bg} stroke={ink} strokeWidth="1" />

        {/* Corner labels */}
        <text x="26" y="30" fontFamily="JetBrains Mono" fontSize="8" fill={ink} opacity="0.38">ВАША БИБЛИОТЕКА</text>
        <text x="514" y="30" fontFamily="JetBrains Mono" fontSize="8" fill={ink} opacity="0.38" textAnchor="end">КАРТОЧКА ТРЕКА</text>

        {/* ── Track row (y 40–104) ── */}
        <rect x="20" y="40" width="500" height="62" rx="7" fill="transparent" stroke={rule} strokeWidth="0.8" />

        {/* Cover */}
        <rect x="30" y="48" width="48" height="46" rx="6" fill={bg2} stroke={ink} strokeWidth="0.8" />
        <text x="54" y="78" fontFamily="Inter" fontSize="20" fill={ink} opacity="0.28" textAnchor="middle">♪</text>

        {/* Title + meta */}
        <text x="90" y="66" fontFamily="Inter" fontSize="13" fontWeight="600" fill={ink}>Закат над городом</text>
        <text x="90" y="82" fontFamily="JetBrains Mono" fontSize="8" fill={ink} opacity="0.5">ПОП · МЕЛАНХОЛИЯ · 84 BPM</text>

        {/* Duration */}
        <text x="448" y="67" fontFamily="JetBrains Mono" fontSize="9" fill={ink} opacity="0.45" textAnchor="end">3:24</text>

        {/* Waveform */}
        {wH.map((h, i) => (
          <rect key={i} x={330 + i * 5.5} y={62 + (14 - h) / 2} width="3.5" height={h} rx="1.5"
            fill={ink} opacity={i < 13 ? 0.55 : 0.18} />
        ))}

        {/* Play circle */}
        <circle cx="462" cy="71" r="15" fill="transparent" stroke={ink} strokeWidth="0.8" />
        <polygon points="457,65 457,77 469,71" fill={ink} />

        {/* Bolt button — highlighted */}
        <rect x="484" y="59" width="26" height="24" rx="12" fill="rgba(255,59,31,0.10)" stroke={hi} strokeWidth="1.2" />
        <text x="497" y="75" fontFamily="Inter" fontSize="13" fill={hi} textAnchor="middle">⚡</text>

        {/* Dashed arrow from bolt to menu */}
        <line x1="497" y1="84" x2="497" y2="112" stroke={hi} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        <polygon points="493,110 497,117 501,110" fill={hi} opacity="0.5" />

        {/* ── Bolt menu panel (y 116–218) ── */}
        <rect x="20" y="116" width="500" height="100" rx="7" fill="transparent" stroke={rule} strokeWidth="0.8" />

        {/* Panel header */}
        <text x="32" y="131" fontFamily="JetBrains Mono" fontSize="8" fill={ink} opacity="0.4">МЕНЮ ДЕЙСТВИЙ</text>
        <line x1="32" y1="136" x2="508" y2="136" stroke={rule} strokeWidth="0.5" />

        {/* Row 1 — 4 buttons at y=142, h=32, gap=10 */}
        {/* Available width: x=32 to x=508 = 476. Four buttons + 3 gaps(10) = 30 → 446/4 = 111 each */}
        {actionBtn(32,  142, 111, "1", "↓ MP3",        "emr")}
        {actionBtn(153, 142, 111, "2", "↓ WAV",        "hi")}
        {actionBtn(274, 142, 111, "3", "⚡ похожий",   "hi")}
        {actionBtn(395, 142, 113, "4", "↑ радио",      "accent")}

        {/* Row 2 — 3 buttons at y=182, h=32, gap=10 */}
        {actionBtn(32,  182, 152, "5", "👍 / 👎 оценить",    "default")}
        {actionBtn(194, 182, 152, "6", "✏️ переименовать",    "hi")}
        {actionBtn(356, 182, 152, "7", "🔗 поделиться",       "hi")}

        {/* ── Info strip (y 226–280) ── */}
        <line x1="20" y1="226" x2="520" y2="226" stroke={rule} strokeWidth="0.8" />

        <text x="28" y="241" fontFamily="JetBrains Mono" fontSize="8" fill={ink} opacity="0.42">СТАТУС</text>
        <circle cx="78" cy="238" r="3.5" fill={emr} />
        <text x="86" y="241" fontFamily="JetBrains Mono" fontSize="8" fill={emr} fontWeight="600">ГОТОВО</text>

        <text x="158" y="241" fontFamily="JetBrains Mono" fontSize="8" fill={ink} opacity="0.42">ЖАНР</text>
        <text x="192" y="241" fontFamily="JetBrains Mono" fontSize="8" fill={ink}>ПОП</text>

        <text x="248" y="241" fontFamily="JetBrains Mono" fontSize="8" fill={ink} opacity="0.42">НАСТР.</text>
        <text x="287" y="241" fontFamily="JetBrains Mono" fontSize="8" fill={ink}>МЕЛАНХОЛИЯ</text>

        <text x="392" y="241" fontFamily="JetBrains Mono" fontSize="8" fill={ink} opacity="0.42">BPM</text>
        <text x="416" y="241" fontFamily="JetBrains Mono" fontSize="8" fill={ink}>84</text>

        {/* Tags row */}
        <rect x="28" y="250" width="36" height="16" rx="8" fill="transparent" stroke={emr} strokeWidth="0.8" />
        <text x="46" y="262" fontFamily="JetBrains Mono" fontSize="7" fill={emr} textAnchor="middle">ПОП</text>

        <rect x="70" y="250" width="76" height="16" rx="8" fill="transparent" stroke={rule} strokeWidth="0.8" />
        <text x="108" y="262" fontFamily="JetBrains Mono" fontSize="7" fill={ink} opacity="0.6" textAnchor="middle">МЕЛАНХОЛИЯ</text>

        <rect x="152" y="250" width="44" height="16" rx="8" fill="transparent" stroke={rule} strokeWidth="0.8" />
        <text x="174" y="262" fontFamily="JetBrains Mono" fontSize="7" fill={ink} opacity="0.6" textAnchor="middle">84 BPM</text>

        {/* WAV badge */}
        <rect x="440" y="250" width="36" height="16" rx="4" fill={emr} />
        <text x="458" y="262" fontFamily="JetBrains Mono" fontSize="7" fill={paper} fontWeight="600" textAnchor="middle">WAV</text>

        {/* Like / dislike */}
        <text x="486" y="263" fontFamily="Inter" fontSize="13" fill={hi}>♥</text>
        <text x="506" y="263" fontFamily="Inter" fontSize="13" fill={ink} opacity="0.22">✕</text>

        {/* Bottom divider + labels */}
        <line x1="20" y1="284" x2="520" y2="284" stroke={rule} strokeWidth="0.5" />
        <text x="26" y="302" fontFamily="JetBrains Mono" fontSize="8" fill={ink} opacity="0.32">7 ДЕЙСТВИЙ В ОДНОМ МЕНЮ</text>
        <text x="514" y="302" fontFamily="JetBrains Mono" fontSize="8" fill={ink} opacity="0.32" textAnchor="end">НАЖМИ ⚡ НА КАРТОЧКЕ</text>
      </svg>
    </div>
  );
}

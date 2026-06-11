/* ════════════════════════════════════════════════
   RIFFA · /business — посадочная для владельцев заведений
   (кофейни, фитнес, йога, бары, магазины, таймкафе).
   Оффер: плейлисты оптом по часам, от 1 000 ₽/час.
   Дизайн-система lend-v3: .rl-root стили из LandingPage.css +
   анимации/читаемость из AdLanding.css (скоуп .adl).
   ════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ScrollToTop } from "@/components/ui/ScrollToTop";

import "./LandingPage.css";
import "./AdLanding.css";

const TG_LEAD = "https://t.me/RIFFAsupport_bot"; // куда падают заявки B2B

/* Примеры композиций под каждую атмосферу — реальные треки владельца
   (public/sounds/business/NN.mp3). Бар делит файл с кофейней (так прислали). */
const BIZ_EXAMPLES = [
  { title: "Velvet Brew", meta: "кофейня и пекарня · funk", src: "/sounds/business/01.mp3" },
  { title: "Звон Бамбуковых Ветров", meta: "фитнес и тренажёрка · phonk", src: "/sounds/business/02.mp3" },
  { title: "Музыка поющих чаш и гонгов", meta: "йога и массаж · ambient", src: "/sounds/business/03.mp3" },
  { title: "Velvet Brew", meta: "бар и ресторан · funk", src: "/sounds/business/01.mp3" },
  { title: "Echo Drift", meta: "магазин и шоурум · house", src: "/sounds/business/05.mp3" },
  { title: "Echoes in Stillness", meta: "таймкафе и коворкинг · trip-hop", src: "/sounds/business/06.mp3" },
];

/* paper bg, emerald accent — палитра основного лендинга */
const c = {
  bg: "#E9E5DA", bg2: "#DDD8C9",
  ink: "#161413", ink2: "#4A4641", ink3: "#37332F", rule: "rgba(22,20,19,0.18)",
  accent: "#0F5D47", orange: "rgb(220, 99, 40)", red: "#FF3B1F",
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

/* Тематические SVG-иконки атмосфер — сплошная заливка ink, как у type-карточек
   главного лендинга. Эмодзи заменены: их рендерит ОС посетителя (на части
   устройств — бесцветные контуры или пустые квадраты), SVG одинаков у всех. */
function venueIcon(key: number, ink: string) {
  switch (key) {
    case 0: /* кофейня — чашка с паром и блюдцем */ return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill={ink}>
        <path d="M4 9h13v4.2A5.8 5.8 0 0 1 11.2 19h-1.4A5.8 5.8 0 0 1 4 13.2V9z" />
        <path d="M17.8 10.2c2 .2 3.7 1.1 3.7 2.8 0 1.8-2 2.9-4.2 3l.4-1.7c1.1-.2 1.9-.7 1.9-1.3 0-.5-.7-1-1.6-1.1l-.2-1.7z" />
        <rect x="3" y="20.2" width="15" height="1.8" rx="0.9" />
        <path d="M8.2 2.6c0 1.3 1.3 1.6 1.3 2.9 0 .7-.4 1.2-.7 1.6l-1.4-.5c.3-.4.6-.7.6-1.1 0-1-1.3-1.4-1.3-2.8 0-.7.4-1.3.8-1.7l1.4.5c-.4.4-.7.7-.7 1.1z" />
        <path d="M12.4 2.6c0 1.3 1.3 1.6 1.3 2.9 0 .7-.4 1.2-.7 1.6l-1.4-.5c.3-.4.6-.7.6-1.1 0-1-1.3-1.4-1.3-2.8 0-.7.4-1.3.8-1.7l1.4.5c-.4.4-.7.7-.7 1.1z" />
      </svg>
    );
    case 1: /* фитнес — гантель */ return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill={ink}>
        <rect x="7" y="11" width="10" height="2" />
        <rect x="4.4" y="7.5" width="2.4" height="9" rx="1.2" />
        <rect x="1.8" y="9.5" width="1.9" height="5" rx="0.95" />
        <rect x="17.2" y="7.5" width="2.4" height="9" rx="1.2" />
        <rect x="20.3" y="9.5" width="1.9" height="5" rx="0.95" />
      </svg>
    );
    case 2: /* йога — лотос */ return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill={ink}>
        <path d="M12 4c-1.9 2.6-1.9 6.4 0 9 1.9-2.6 1.9-6.4 0-9z" />
        <path d="M4.5 8.5c.4 3.2 2.7 5.8 6 6.6-.9-3.2-3.1-5.7-6-6.6z" />
        <path d="M19.5 8.5c-2.9.9-5.1 3.4-6 6.6 3.3-.8 5.6-3.4 6-6.6z" />
        <path d="M3 16.2c2.4 2.6 5.6 4 9 4s6.6-1.4 9-4c-2.9.6-6 .9-9 .9s-6.1-.3-9-.9z" />
      </svg>
    );
    case 3: /* бар — бокал мартини */ return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill={ink}>
        <path d="M3.5 4h17l-7.2 8v6h3.2v2H7.5v-2h3.3v-6L3.5 4zm4.3 3h9.4l1.8-2H6l1.8 2z" fillRule="evenodd" />
        <circle cx="16.8" cy="3" r="1.4" />
      </svg>
    );
    case 4: /* магазин — пакет с ручками */ return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill={ink}>
        <path d="M5.5 8.2h13l-1 12.8h-11l-1-12.8z" />
        <path d="M9.4 9.5V6.6a2.6 2.6 0 0 1 5.2 0v2.9h-1.8V6.6a.8.8 0 0 0-1.6 0v2.9H9.4z" fill="#E9E5DA" />
        <path d="M8.5 8.2V6.6a3.5 3.5 0 0 1 7 0v1.6h-1.7V6.6a1.8 1.8 0 0 0-3.6 0v1.6H8.5z" />
      </svg>
    );
    case 5: /* таймкафе — песочные часы */ return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill={ink}>
        <path d="M5.5 2.5h13v2.1c0 2.9-2.6 4.5-4.1 7.4 1.5 2.9 4.1 4.5 4.1 7.4v2.1h-13v-2.1c0-2.9 2.6-4.5 4.1-7.4-1.5-2.9-4.1-4.5-4.1-7.4V2.5zm2 2.1c0 2.2 2.1 3.7 3.4 5.6h2.2c1.3-1.9 3.4-3.4 3.4-5.6H7.5z" fillRule="evenodd" />
      </svg>
    );
    default: return null;
  }
}

function Marquee({ items }: { items: string[] }) {
  const line = items.join("  ·  ") + "  ·  ";
  return (
    <div className="adl-marquee" aria-hidden="true">
      <div className="adl-marquee__track">
        <span>{line}</span>
        <span>{line}</span>
      </div>
    </div>
  );
}

/* Схематичная карточка плейлиста — в духе SchematicSVG главного лендинга */
function PlaylistSVG() {
  return (
    <div className="schematic-wrap" style={{ border: `1px solid ${c.rule}` }}>
      <svg viewBox="0 0 560 420" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="biz-dots" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="0.6" cy="0.6" r="0.6" fill={c.ink} opacity="0.18" />
          </pattern>
        </defs>
        <rect width="560" height="420" fill={c.bg2} />
        <rect width="560" height="420" fill="url(#biz-dots)" />
        <rect x="36" y="28" width="488" height="364" rx="18" fill={c.bg} stroke={c.ink} strokeWidth="1.2" />
        <line x1="46" y1="86" x2="514" y2="86" stroke={c.ink} strokeWidth="0.8" />
        <text x="60" y="62" fontFamily="JetBrains Mono" fontSize="11" fill={c.ink2}>ПЛЕЙЛИСТ #B-204</text>
        <rect x="330" y="44" width="170" height="26" rx="13" fill={c.accent} />
        <text x="415" y="61" fontFamily="JetBrains Mono" fontSize="10" fill="#E9E5DA" textAnchor="middle" fontWeight="600">КОФЕЙНЯ · УТРО</text>
        {[
          ["01", "Утренний свет", "лоу-фай · 76 BPM", "3:42"],
          ["02", "Корица и пар", "джаз-хоп · 82 BPM", "4:05"],
          ["03", "Окно на бульвар", "соул · 74 BPM", "3:28"],
          ["04", "Тёплая чашка", "лоу-фай · 70 BPM", "3:51"],
        ].map(([n, name, meta, dur], i) => (
          <g key={n}>
            <rect x="60" y={104 + i * 56} width="440" height="44" rx="10" stroke={c.ink} strokeWidth="0.7" fill={i === 1 ? c.bg2 : "none"} />
            <text x="78" y={131 + i * 56} fontFamily="JetBrains Mono" fontSize="10" fill={c.accent} fontWeight="600">{n}</text>
            <text x="106" y={126 + i * 56} fontFamily="Inter" fontSize="13" fontWeight="600" fill={c.ink}>{name}</text>
            <text x="106" y={141 + i * 56} fontFamily="JetBrains Mono" fontSize="8" fill={c.ink2}>{meta}</text>
            <text x="452" y={131 + i * 56} fontFamily="JetBrains Mono" fontSize="10" fill={c.ink2}>{dur}</text>
            {i === 1 && (
              <>
                {/* играющий трек: пульс вокруг play + живой эквалайзер */}
                <circle className="adl-ring" cx="434" cy={126 + i * 56} r="11" fill="none" stroke={c.accent} strokeWidth="1.5" />
                <polygon points={`428,${118 + i * 56} 428,${134 + i * 56} 441,${126 + i * 56}`} fill={c.accent} />
                {[0, 1, 2].map((b) => (
                  <rect key={b} className="adl-eq" style={{ animationDelay: `${b * 0.16}s` }} x={398 + b * 7} y={118 + i * 56} width="3.5" height="16" rx="1.5" fill={c.accent} />
                ))}
              </>
            )}
          </g>
        ))}
        <line x1="46" y1="342" x2="514" y2="342" stroke={c.ink} strokeWidth="0.8" />
        <text x="60" y="370" fontFamily="JetBrains Mono" fontSize="10" fill={c.ink2}>ВСЕГО: 5 ЧАСОВ · 100 ТРЕКОВ</text>
        <rect x="354" y="352" width="146" height="28" rx="14" fill={c.ink} />
        <text x="427" y="370" fontFamily="JetBrains Mono" fontSize="9" fill={c.bg} textAnchor="middle" fontWeight="600">↓ СКАЧАТЬ ВСЁ · MP3</text>
      </svg>
    </div>
  );
}

export function BusinessPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [missing, setMissing] = useState<Set<number>>(new Set());
  const [activeSec, setActiveSec] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Scrollspy: какая секция сейчас в центральной полосе экрана —
  // её заголовок подсвечивается фирменным оранжевым.
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActiveSec((e.target as HTMLElement).id); });
    }, { rootMargin: "-35% 0px -55% 0px", threshold: 0 });
    document.querySelectorAll("section[id]").forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);
  const h2c = (id: string) => ({ color: activeSec === id ? c.orange : c.ink });

  // Какая ссылка меню соответствует текущей секции (соседние блоки без
  // собственного пункта приклеены к ближайшему по смыслу).
  const NAV_MAP: Record<string, string> = {
    pain: "pain", solution: "pain", venues: "venues",
    examples: "examples", how: "how", faq: "how", pricing: "pricing",
  };
  const NAV_LINKS: Array<[string, string]> = [
    ["pain", "проблема"], ["venues", "атмосферы"], ["examples", "примеры"],
    ["how", "как заказать"], ["pricing", "цены"],
  ];
  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  useEffect(() => {
    document.title = "Фоновая музыка для бизнеса — плейлисты для кофеен, фитнеса, студий | RIFFA";
    document.querySelector('meta[name="description"]')?.setAttribute("content",
      "Уникальные плейлисты под атмосферу вашего заведения. Без абонентской платы и претензий правообладателей. От 1 000 ₽ за час музыки.");
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Scroll-reveal — классы из AdLanding.css
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    root.querySelectorAll<HTMLElement>(".type-card, .process-step, .price-card, .section-head, .adl-ex-row").forEach((el, i) => {
      el.classList.add("reveal");
      const d = i % 6;
      if (d) el.classList.add(`reveal-delay-${d}`);
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  // Проверяем, какие файлы примеров уже загружены (nginx отдаёт 404 на отсутствующие)
  useEffect(() => {
    BIZ_EXAMPLES.forEach((ex, i) => {
      fetch(ex.src, { method: "HEAD" })
        .then((r) => { if (!r.ok) setMissing((s) => new Set(s).add(i)); })
        .catch(() => setMissing((s) => new Set(s).add(i)));
    });
  }, []);

  // Глушим плеер при уходе со страницы
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };
  const lead = () => window.open(TG_LEAD, "_blank", "noopener");

  function toggleExample(i: number) {
    if (missing.has(i)) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    if (playing === i) { audio.pause(); setPlaying(null); return; }
    audio.src = BIZ_EXAMPLES[i].src;
    audio.onended = () => setPlaying(null);
    audio.onerror = () => { setMissing((s) => new Set(s).add(i)); setPlaying(null); };
    audio.play()
      .then(() => setPlaying(i))
      .catch(() => { setMissing((s) => new Set(s).add(i)); setPlaying(null); });
  }

  // Чистый бежевый с явной прозрачностью — стекло читается сразу.
  const glassBg = scrolled ? "rgba(233,229,218,0.78)" : "rgba(233,229,218,0.6)";

  const pains = [
    { n: "01", h: "Штрафы за чужую музыку", p: "Колонка с плейлистом из стриминга — это публичное воспроизведение. РАО и ВОИС приходят с претензиями даже к маленьким кофейням." },
    { n: "02", h: "Подписки дорожают", p: "Сервисы фоновой музыки берут плату каждый месяц. Год аренды чужой музыки стоит дороже собственной." },
    { n: "03", h: "Треки приедаются", p: "Один плейлист по кругу неделями. Персонал устал, постоянные гости замечают повторы." },
    { n: "04", h: "Некогда подбирать", p: "Собрать атмосферный плейлист самому — часы работы, которых у владельца нет." },
  ];

  const venues = [
    { h: "Кофейня и пекарня", p: "Мягкий лоу-фай, джаз-хоп и соул — гости задерживаются дольше" },
    { h: "Фитнес и тренажёрка", p: "Драйв и энергия, 120–150 BPM — темп зала держится сам" },
    { h: "Йога и массаж", p: "Спокойный эмбиент без слов — ничто не отвлекает от практики" },
    { h: "Бар и ресторан", p: "Вечерний грув и диско — атмосфера, под которую заказывают ещё" },
    { h: "Магазин и шоурум", p: "Ненавязчивый фон — покупатели не спешат к выходу" },
    { h: "Таймкафе и коворкинг", p: "Фокус и уют — музыка, под которую работается" },
  ];

  const features = [
    { n: "01", h: "Музыка создана для вас", p: "Каждый трек собирается с нуля под ваше заведение. Его нет в чужих каталогах и реестрах правообладателей." },
    { n: "02", h: "Файлы ваши навсегда", p: "MP3 высокого качества. Играют офлайн с любого устройства — ноутбука, телефона, плеера. Интернет не нужен." },
    { n: "03", h: "Без абонентской платы", p: "Покупаете часы музыки один раз — используете каждый день без ограничений и продлений." },
    { n: "04", h: "Под вашу атмосферу", p: "Жанр, темп и настроение подбираются под зал, время суток и вашу аудиторию." },
  ];

  const tiers = [
    { name: "ПРОБНЫЙ", hours: "1 час", price: "1 000 ₽", per: "1 000 ₽/час", feat: ["20 уникальных треков", "Подбор под вашу атмосферу", "MP3 + обложки", "Превью до оплаты"], featured: false },
    { name: "СМЕНА", hours: "5 часов", price: "4 500 ₽", per: "900 ₽/час", feat: ["90–100 уникальных треков", "Хватает почти на весь рабочий день", "Разбивка по времени суток", "MP3 + обложки"], featured: false },
    { name: "НЕДЕЛЯ", hours: "10 часов", price: "8 000 ₽", per: "800 ₽/час", feat: ["180–200 уникальных треков", "Ротация без повторов", "Несколько атмосфер в одном пакете", "Приоритетная сборка"], featured: true },
  ];

  const steps = [
    { h: "Заявка", p: "Расскажите про заведение: формат, атмосфера, пожелания по жанрам. Это 5 минут в Telegram.", tip: "«кофейня, утро — спокойно,\nвечер — джаз» — этого достаточно" },
    { h: "Превью", p: "Собираем плейлист под вас и присылаем фрагменты на согласование. Правки — бесплатно.", tip: "обычно готово\nза 1–2 дня" },
    { h: "Файлы", p: "После оплаты получаете все треки в MP3 и обложки. Загружайте в любую колонку или систему.", tip: "оплата картой РФ/СНГ\nили по счёту" },
  ];

  const faq = [
    { q: "Можно ли включать без интернета?", a: "Да. Вы получаете обычные MP3-файлы — они играют с любого устройства офлайн." },
    { q: "Это подписка?", a: "Нет. Разовая покупка: купили часы музыки — пользуетесь без ограничений по времени." },
    { q: "А если музыка не подойдёт?", a: "Сначала присылаем превью. Не зашло — правим жанры и настроение, пока не подойдёт. Платите только за готовый результат." },
    { q: "Что с правами на музыку?", a: "Треки создаются с нуля специально для вас — их нет в реестрах правообладателей, претензии по чужим фонограммам к ним не применимы." },
  ];

  return (
    <div className="rl-root adl page" ref={rootRef} style={{ background: c.bg, color: c.ink }}>
      {/* NAV */}
      <nav className={`nav${scrolled ? " glass" : ""}`} style={{ background: glassBg, borderColor: c.rule, color: c.ink }}>
        <div className="wrap">
          <div className="nav-inner">
            <div className="nav-brand" onClick={toTop} style={{ cursor: "pointer" }} title="К началу страницы">
              <Mark size={22} />
              <span style={{ color: c.ink, fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 22 }}>RIFFA для бизнеса</span>
            </div>
            <div className="nav-links">
              {NAV_LINKS.map(([id, label]) => {
                const active = NAV_MAP[activeSec] === id;
                return (
                  <a key={id} href={`#${id}`} className={active ? "active" : ""}
                    style={{ color: active ? c.orange : c.ink, fontWeight: active ? 700 : undefined, transition: "color 0.25s" }}
                    onClick={scrollTo(id)}>{label}</a>
                );
              })}
            </div>
            <button className="nav-cta" style={{ background: c.accent, color: "#E9E5DA", fontSize: "13px" }} onClick={lead}>Заказать плейлист</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero" className="hero" style={{ borderColor: c.rule, background: c.bg, color: c.ink }}>
        <div className="wrap">
          <div data-anim="1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.ink2, marginBottom: 28, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px" }}>riffastudio.site · ФОНОВАЯ МУЗЫКА ДЛЯ БИЗНЕСА</span>
            <span>· 2026</span>
          </div>
          <div className="hero-split">
            <div>
              <h1 className="hero-headline" data-anim="2" style={{ color: c.orange, fontSize: "72px" }}>
                Музыка для <span style={{ color: "#232323" }}>вашего</span> <span style={{ color: c.accent }}>заведения.</span>
              </h1>
              <p data-anim="3" style={{ fontSize: 19, lineHeight: 1.55, marginTop: 28, maxWidth: 520, fontWeight: 500, color: c.ink3 }}>
                Готовые плейлисты, созданные специально под атмосферу вашей кофейни,
                фитнес-клуба или студии. Купите один раз — играйте каждый день.
              </p>
              <div className="hero-actions" data-anim="4" style={{ marginTop: "36px" }}>
                <button className="btn-primary" style={{ background: c.accent, color: "#E9E5DA", height: 52, padding: "0 32px", fontSize: "13px", letterSpacing: "1.5px", border: "none", cursor: "pointer" }} onClick={lead}>ЗАКАЗАТЬ ПЛЕЙЛИСТ</button>
                <button className="btn-ghost" style={{ color: "#EC560B", borderColor: "#EC560B", padding: "0 28px", fontSize: "13px", letterSpacing: "1px", height: 52, background: "transparent", cursor: "pointer" }} onClick={scrollTo("examples")}>ПОСЛУШАТЬ ПРИМЕРЫ</button>
              </div>
            </div>
            <div data-anim="5">
              <PlaylistSVG />
            </div>
          </div>
          <p data-anim="5" style={{
            color: c.ink3, letterSpacing: "0.02em", fontWeight: 500,
            margin: "32px 0 0", lineHeight: "1.65", fontSize: "16px",
            borderTop: `1px solid ${c.rule}`, paddingTop: "24px",
          }}>
            Час уникальной музыки — от 1 000 ₽. Без абонентской платы, без претензий
            правообладателей, без повторов. Файлы остаются у вас навсегда.
          </p>
        </div>
      </section>

      {/* БЕГУЩАЯ СТРОКА */}
      <Marquee items={["КОФЕЙНЯ", "ФИТНЕС", "ЙОГА", "БАР", "РЕСТОРАН", "МАГАЗИН", "ТАЙМКАФЕ", "КОВОРКИНГ", "БЕЗ АБОНЕНТСКОЙ ПЛАТЫ", "ОТ 1 000 ₽/ЧАС"]} />

      {/* 01 · ПРОБЛЕМА */}
      <section id="pain" className="types-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">01</span> · знакомо?</div>
            <h2 style={h2c("pain")}>Фоновая музыка — головная боль владельца.</h2>
            <div className="right">4 типовые проблемы</div>
          </div>
          <div className="types-grid adl-cols-4" style={{ borderColor: c.rule }}>
            {pains.map((it) => (
              <div key={it.n} className="type-card" style={{ borderColor: c.rule }}>
                <div className="type-num">{it.n}</div>
                <h3 style={{ color: c.red, fontSize: 18 }}>{it.h}</h3>
                <p style={{ fontSize: 14 }}>{it.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 02 · РЕШЕНИЕ */}
      <section id="solution" className="types-section" style={{ background: c.bg2, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">02</span> · решение</div>
            <h2 style={h2c("solution")}>Плейлист, созданный под ваше заведение.</h2>
            <div className="right">riffa для бизнеса</div>
          </div>
          <div className="types-grid adl-cols-4" style={{ borderColor: c.rule }}>
            {features.map((it) => (
              <div key={it.n} className="type-card" style={{ borderColor: c.rule }}>
                <div className="type-num">{it.n}</div>
                <h3 style={{ color: c.accent, fontSize: 18 }}>{it.h}</h3>
                <p style={{ fontSize: 14 }}>{it.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 03 · АТМОСФЕРЫ */}
      <section id="venues" className="types-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">03</span> · атмосферы</div>
            <h2 style={h2c("venues")}>Под формат вашего бизнеса.</h2>
            <div className="right">6 готовых направлений</div>
          </div>
          <div className="types-grid adl-cols-3" style={{ borderColor: c.rule }}>
            {venues.map((v, i) => (
              <div key={v.h} className="type-card" style={{ borderColor: c.rule, borderBottom: `1px solid ${c.rule}` }}>
                <div className="type-icon" style={{ height: 64 }}>{venueIcon(i, c.ink)}</div>
                <h3 style={{ color: c.ink, fontSize: 17 }}>{v.h}</h3>
                <p style={{ fontSize: 13.5 }}>{v.p}</p>
                <div className="type-meta" style={{ borderColor: c.rule, color: c.accent, fontWeight: 800, fontSize: 11, letterSpacing: "0.8px" }}>есть пресет</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 04 · ПРИМЕРЫ */}
      <section id="examples" className="types-section" style={{ background: c.bg2, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">04</span> · примеры</div>
            <h2 style={h2c("examples")}>Послушайте настроения в деле.</h2>
            <div className="right">фрагменты реальных плейлистов</div>
          </div>
          <div className="adl-ex" style={{ background: c.bg }}>
            {BIZ_EXAMPLES.map((ex, i) => (
              <button key={ex.src} type="button" className="adl-ex-row" onClick={() => toggleExample(i)}>
                <span className="adl-ex-num">{"0" + (i + 1)}</span>
                <span>
                  <span className="adl-ex-title" style={{ display: "block" }}>{ex.title}</span>
                  <span className="adl-ex-meta" style={{ display: "block" }}>{ex.meta}</span>
                </span>
                {playing === i ? (
                  <span className="adl-ex-eq" aria-hidden="true"><i /><i /><i /></span>
                ) : <span />}
                {missing.has(i) ? (
                  <span className="adl-ex-soon">скоро</span>
                ) : (
                  <span className={`adl-ex-play${playing === i ? " on" : ""}`} aria-label={playing === i ? "Пауза" : "Слушать"}>
                    {playing === i ? (
                      <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="3.4" height="10" rx="1" fill="currentColor" /><rect x="8.6" y="2" width="3.4" height="10" rx="1" fill="currentColor" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 14 14"><polygon points="3,2 3,12 12,7" fill="currentColor" /></svg>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>
          <p style={{ marginTop: 18, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: c.ink2 }}>
            Каждый плейлист собирается под конкретное заведение — это лишь ориентиры по настроению.
          </p>
        </div>
      </section>

      {/* 05 · КАК ЗАКАЗАТЬ */}
      <section id="how" className="process-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">05</span> · как заказать</div>
            <h2 style={h2c("how")}>Три шага — и музыка играет у вас.</h2>
            <div className="right"></div>
          </div>
          <div className="process-grid">
            {steps.map((s, i) => (
              <div key={i} className="process-step" style={{ borderColor: c.rule }}>
                <div className="step-num" style={{ color: c.accent, opacity: 1 }}>{"0" + (i + 1)}</div>
                <h3 style={{ color: c.ink }}>{s.h}</h3>
                <p>{s.p}</p>
                <div className="tip" style={{ borderColor: c.rule, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.02em" }}>{s.tip}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 06 · FAQ */}
      <section id="faq" className="types-section" style={{ background: c.bg2, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">06</span> · вопросы</div>
            <h2 style={h2c("faq")}>Коротко о главном.</h2>
            <div className="right"></div>
          </div>
          <div className="adl-faq">
            {faq.map((f, i) => (
              <div key={i} className="adl-faq-cell">
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: c.accent, fontWeight: 600, marginBottom: 10 }}>Q{i + 1}</div>
                <h3 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 10px" }}>{f.q}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: c.ink3, margin: 0 }}>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 07 · ЦЕНЫ — в самом низу, перед финальным CTA */}
      <section id="pricing" className="pricing-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">07</span> · цены</div>
            <h2 style={h2c("pricing")}>Платите за часы — получаете музыку навсегда.</h2>
            <div className="right" style={{ fontSize: "15px" }}>разовая покупка</div>
          </div>
          <div className="pricing-grid adl-cols-3" style={{ borderColor: c.rule }}>
            {tiers.map((tier) => (
              <div key={tier.name} className={`price-card${tier.featured ? " featured bp-featured" : ""}`} style={{ borderColor: c.rule, background: tier.featured ? c.ink : "transparent", border: tier.featured ? "none" : undefined, padding: tier.featured ? "32px 28px" : undefined }}>
                <div className="price-tier" style={{ color: tier.featured ? "#E9E5DA" : c.accent, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "14px" }}>{tier.name}</div>
                <div className="price-amount" style={{ fontSize: "40px", color: tier.featured ? "#E9E5DA" : c.ink }}>{tier.price}</div>
                <div className="price-tokens" style={{ borderColor: tier.featured ? "rgba(233,229,218,0.3)" : c.rule, color: tier.featured ? "#E9E5DA" : c.accent, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "16px" }}>
                  {tier.hours} музыки · {tier.per}
                </div>
                <ul className="price-features">
                  {tier.feat.map((f) => (
                    <li key={f} style={{ color: tier.featured ? "#E9E5DA" : c.ink, fontWeight: 600, padding: "0 0 0 16px" }}>{f}</li>
                  ))}
                </ul>
                <button className="price-cta" style={{ background: tier.featured ? "rgba(233,229,218,0.15)" : "transparent", color: tier.featured ? "#FFFFFF" : c.ink, borderColor: c.accent, borderWidth: "3px", fontSize: "18px", cursor: "pointer" }} onClick={lead}>
                  ЗАКАЗАТЬ
                </button>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 20, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: c.ink2 }}>
            Нужно больше часов, несколько точек или особый формат — напишите, соберём индивидуальное предложение.
          </p>
        </div>
      </section>

      {/* CTA-ПОЛОСА */}
      <section style={{ background: c.ink, color: c.bg }}>
        <div className="wrap" style={{ padding: "72px 32px", textAlign: "center" }}>
          <h2 className="adl-cta-h" style={{ fontFamily: "'Archivo Black', sans-serif", margin: 0, letterSpacing: "-0.02em", color: c.bg }}>
            Запустите свою музыку <span style={{ color: "#7BD389" }}>на этой неделе.</span>
          </h2>
          <p style={{ fontSize: 16, color: "#C9C4B8", margin: "18px auto 32px", maxWidth: 560 }}>
            Напишите нам в Telegram — зададим три вопроса о заведении и пришлём превью плейлиста.
          </p>
          <button className="btn-primary" style={{ background: c.accent, color: "#E9E5DA", height: 56, padding: "0 40px", fontSize: "14px", letterSpacing: "1.5px", border: "none", cursor: "pointer" }} onClick={lead}>
            НАПИСАТЬ В TELEGRAM →
          </button>
        </div>
      </section>

      <ScrollToTop />

      {/* FOOTER */}
      <footer className="footer" style={{ background: c.bg, color: c.ink }}>
        <div className="wrap">
          <div className="footer-bottom" style={{ borderColor: c.rule, borderTop: "none" }}>
            <span>© 2026 riffa studio · все права защищены</span>
            <span style={{ cursor: "pointer" }} onClick={() => navigate("/")}>riffastudio.site</span>
            <span>telegram: @the_riffa_bot · @riffasupport</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

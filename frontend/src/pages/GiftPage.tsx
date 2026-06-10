/* ════════════════════════════════════════════════
   RIFFA · /gift — посадочная «Песня в подарок».
   Аудитория постарше: максимально простой язык, никакого «ИИ» —
   просто сервис, где легко и недорого заказать песню для близкого.
   Дизайн-система lend-v3: .rl-root стили из LandingPage.css +
   анимации/читаемость из AdLanding.css (скоуп .adl).
   ════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./LandingPage.css";
import "./AdLanding.css";

/* paper bg, emerald accent — палитра основного лендинга */
const c = {
  bg: "#E9E5DA", bg2: "#DDD8C9",
  ink: "#161413", ink2: "#4A4641", ink3: "#37332F", rule: "rgba(22,20,19,0.18)",
  accent: "#0F5D47", orange: "rgb(220, 99, 40)", red: "#FF3B1F",
};

/* Примеры поздравительных песен. Файлы кладём в public/sounds/gift/
   (NN.mp3) — пока файла нет, строка показывает бейдж «скоро». */
const GIFT_EXAMPLES = [
  { title: "С юбилеем, мама", meta: "юбилей · для мамы", src: "/sounds/gift/01.mp3" },
  { title: "С днём рождения, дружище", meta: "день рождения · другу", src: "/sounds/gift/02.mp3" },
  { title: "Десять лет вместе", meta: "годовщина · жене", src: "/sounds/gift/03.mp3" },
  { title: "Просто потому что люблю", meta: "без повода", src: "/sounds/gift/04.mp3" },
];

function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="50" fill="#161413" />
      <circle cx="50" cy="50" r="38" fill="#E9E5DA" />
      <polygon points="40,32 40,68 72,50" fill="#FF3B1F" />
    </svg>
  );
}

/* Тематические SVG-иконки поводов — сплошная заливка ink, как у type-карточек
   главного лендинга. Эмодзи заменены: их рендерит ОС посетителя (на части
   устройств — бесцветные контуры или пустые квадраты), SVG одинаков у всех. */
function occasionIcon(key: number, ink: string) {
  switch (key) {
    case 0: /* день рождения — торт со свечой */ return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill={ink}>
        <path d="M11.1 4.6h1.8V8h-1.8V4.6z" />
        <path d="M12 1.2c.7.9 1.2 1.5 1.2 2.2a1.2 1.2 0 0 1-2.4 0c0-.7.5-1.3 1.2-2.2z" />
        <path d="M5.5 9.5h13v3.4c-.9.8-2 .8-2.9 0-.9.9-2.3.9-3.2 0-.9.9-2.3.9-3.2 0-.9.8-2 .8-2.9 0V9.5h-.8z" />
        <path d="M4 14.6c1.2.7 2.6.6 3.7-.1 1.1.8 2.7.8 3.8 0 1.1.8 2.7.8 3.8 0 1.1.7 2.5.8 3.7.1V20h1v1.8H3V20h1v-5.4z" />
      </svg>
    );
    case 1: /* свадьба — кольца */ return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="1.9">
        <circle cx="9" cy="14" r="5.6" />
        <circle cx="15" cy="14" r="5.6" />
        <path d="M15 5.2l1.9 1.9L15 9l-1.9-1.9z" fill={ink} stroke="none" />
      </svg>
    );
    case 2: /* маме — тюльпан */ return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill={ink}>
        <path d="M7.5 3.5c0 3.6 1.9 6 4.5 6s4.5-2.4 4.5-6c-1.4 1.4-2.7 1.4-3.4.2L12 2.6l-1.1 1.1c-.7 1.2-2 1.2-3.4-.2z" />
        <rect x="11.2" y="9.5" width="1.6" height="11" rx="0.8" />
        <path d="M11.6 15.8c-3-.5-5-2.2-5.7-4.8 3 .5 5 2.2 5.7 4.8z" />
        <path d="M12.4 15.8c.7-2.6 2.7-4.3 5.7-4.8-.7 2.6-2.7 4.3-5.7 4.8z" />
      </svg>
    );
    case 3: /* юбилей — бокалы чокаются */ return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill={ink}>
        <g transform="rotate(-14 8 12)">
          <path d="M5.6 3h5l-.5 6.2c-.1 1.6-1 2.6-2 2.8V19h2v1.6H4.1V19h2v-7c-1-.2-1.9-1.2-2-2.8L5.6 3z" />
        </g>
        <g transform="rotate(14 16 12)">
          <path d="M13.4 3h5l-.5 6.2c-.1 1.6-1 2.6-2 2.8V19h2v1.6h-6V19h2v-7c-1-.2-1.9-1.2-2-2.8L13.4 3z" />
        </g>
        <circle cx="12" cy="2.6" r="0.9" />
        <circle cx="9.8" cy="1.4" r="0.6" />
        <circle cx="14.2" cy="1.4" r="0.6" />
      </svg>
    );
    case 4: /* выпускной — академическая шапочка */ return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill={ink}>
        <path d="M12 4 1.8 8.8 12 13.6l10.2-4.8L12 4z" />
        <path d="M6.4 11.6v3.6c0 1.5 2.5 2.7 5.6 2.7s5.6-1.2 5.6-2.7v-3.6L12 14.3l-5.6-2.7z" />
        <path d="M20.6 9.9h1.2v5.4h-1.2z" />
        <circle cx="21.2" cy="16.4" r="1.1" />
      </svg>
    );
    case 5: /* просто так — сердце */ return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill={ink}>
        <path d="M12 21C5.4 15.4 2.4 11.6 2.4 8.1 2.4 5.3 4.7 3.2 7.2 3.2c1.9 0 3.8 1.1 4.8 2.9 1-1.8 2.9-2.9 4.8-2.9 2.5 0 4.8 2.1 4.8 4.9 0 3.5-3 7.3-9.6 12.9z" />
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

/* Схематичная «открытка с песней» — в духе SchematicSVG главного лендинга */
function GiftCardSVG() {
  return (
    <div className="schematic-wrap" style={{ border: `1px solid ${c.rule}` }}>
      <svg viewBox="0 0 560 420" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="gift-dots" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="0.6" cy="0.6" r="0.6" fill={c.ink} opacity="0.18" />
          </pattern>
        </defs>
        <rect width="560" height="420" fill={c.bg2} />
        <rect width="560" height="420" fill="url(#gift-dots)" />
        {/* открытка */}
        <rect x="60" y="48" width="440" height="324" rx="18" fill={c.bg} stroke={c.ink} strokeWidth="1.2" />
        <text x="84" y="92" fontFamily="JetBrains Mono" fontSize="10" fill={c.ink2}>ПЕСНЯ В ПОДАРОК</text>
        <text x="476" y="92" fontFamily="JetBrains Mono" fontSize="10" fill={c.red} textAnchor="end">♥</text>
        <line x1="84" y1="104" x2="476" y2="104" stroke={c.ink} strokeWidth="0.8" />
        <text x="84" y="148" fontFamily="Inter" fontSize="26" fontWeight="700" fill={c.ink}>«Для мамы»</text>
        <text x="84" y="172" fontFamily="JetBrains Mono" fontSize="10" fill={c.ink2}>ОТ СЕРЁЖИ · НА ЮБИЛЕЙ · 3:08</text>
        {/* плеер */}
        <rect x="84" y="196" width="392" height="64" rx="12" stroke={c.ink} strokeWidth="0.8" fill="none" />
        <circle className="adl-ring" cx="120" cy="228" r="18" fill="none" stroke={c.accent} strokeWidth="2" />
        <circle cx="120" cy="228" r="18" fill={c.accent} />
        <polygon points="114,219 114,237 130,228" fill="#E9E5DA" />
        {[0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 91, 98, 105, 112].map((x, i) => {
          const h = [8, 14, 10, 18, 12, 20, 14, 9, 16, 11, 19, 13, 8, 15, 10, 12, 7][i];
          return (
            <line
              key={x}
              className={i < 9 ? "adl-eq" : undefined}
              style={i < 9 ? { animationDelay: `${(i % 5) * 0.14}s` } : undefined}
              x1={158 + x * 2.4} y1={228 - h / 2} x2={158 + x * 2.4} y2={228 + h / 2}
              stroke={i < 9 ? c.accent : c.ink} strokeWidth="2.2" strokeLinecap="round"
              opacity={i < 9 ? 1 : 0.35}
            />
          );
        })}
        <text x="460" y="233" fontFamily="JetBrains Mono" fontSize="10" fill={c.ink2} textAnchor="end">1:12</text>
        {/* строки песни */}
        <text x="84" y="296" fontFamily="Inter" fontSize="14" fontStyle="italic" fill={c.ink3}>«Твои руки пахнут пирогами,</text>
        <text x="84" y="318" fontFamily="Inter" fontSize="14" fontStyle="italic" fill={c.ink3}>твой голос — самый тёплый дом…»</text>
        {/* кнопки */}
        <rect x="84" y="336" width="120" height="26" rx="13" fill={c.ink} />
        <text x="144" y="353" fontFamily="JetBrains Mono" fontSize="9" fill={c.bg} textAnchor="middle" fontWeight="600">↓ СКАЧАТЬ</text>
        <rect x="212" y="336" width="150" height="26" rx="13" stroke={c.accent} strokeWidth="1" fill="none" />
        <text x="287" y="353" fontFamily="JetBrains Mono" fontSize="9" fill={c.accent} textAnchor="middle" fontWeight="600">ОТПРАВИТЬ ССЫЛКОЙ</text>
      </svg>
    </div>
  );
}

export function GiftPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [missing, setMissing] = useState<Set<number>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    document.title = "Песня в подарок близкому человеку — готова сегодня | RIFFA";
    document.querySelector('meta[name="description"]')?.setAttribute("content",
      "Расскажите о близком человеке — мы превратим вашу историю в настоящую песню с его именем. Первая песня бесплатно, дальше от 100 ₽.");
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Проверяем, какие файлы примеров уже загружены (nginx отдаёт 404 на отсутствующие)
  useEffect(() => {
    GIFT_EXAMPLES.forEach((ex, i) => {
      fetch(ex.src, { method: "HEAD" })
        .then((r) => { if (!r.ok) setMissing((s) => new Set(s).add(i)); })
        .catch(() => setMissing((s) => new Set(s).add(i)));
    });
  }, []);

  // Глушим плеер при уходе со страницы
  useEffect(() => () => { audioRef.current?.pause(); }, []);

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

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };
  const start = () => navigate("/studio");

  function toggleExample(i: number) {
    if (missing.has(i)) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    if (playing === i) { audio.pause(); setPlaying(null); return; }
    audio.src = GIFT_EXAMPLES[i].src;
    audio.onended = () => setPlaying(null);
    audio.onerror = () => { setMissing((s) => new Set(s).add(i)); setPlaying(null); };
    audio.play()
      .then(() => setPlaying(i))
      .catch(() => { setMissing((s) => new Set(s).add(i)); setPlaying(null); });
  }

  const glassBg = scrolled ? "rgba(233,229,218,0.95)" : "rgba(233,229,218,0.85)";

  const occasions = [
    { h: "День рождения", p: "Именинник услышит песню, где звучит его имя — такого подарка у него ещё не было" },
    { h: "Свадьба и годовщина", p: "Ваша общая история — в песне для первого танца или семейного вечера" },
    { h: "Маме", p: "Все тёплые слова, которые сложно сказать вслух — легко спеть" },
    { h: "Юбилей", p: "Песня про юбиляра соберёт весь стол — и слёзы, и аплодисменты" },
    { h: "Выпускной", p: "Памятная песня для класса, группы или любимого учителя" },
    { h: "Просто так", p: "Без повода — самый честный повод сказать человеку, что он дорог" },
  ];

  const steps = [
    { h: "Расскажите о человеке", p: "Имя, пара тёплых деталей, любимая история. Двух-трёх предложений достаточно — остальное мы сделаем сами.", tip: "«мама Наташа, печёт лучшие пироги,\nвырастила нас троих» — этого хватит" },
    { h: "Выберите настроение", p: "Весёлая, нежная или торжественная. Стиль — любой: от душевного романса до зажигательной танцевальной.", tip: "не разбираетесь в жанрах?\nпросто напишите «как у Аллы Пугачёвой»" },
    { h: "Получите песню", p: "Слушайте, скачивайте, отправляйте в WhatsApp или Telegram. Или включите вживую — за столом, под торт.", tip: "готово в течение 10 минут,\nдаже если праздник завтра" },
  ];

  const reasons = [
    { n: "01", h: "Личное", p: "Песня именно про вашего человека: с его именем, вашей историей и словами, которые важны только вам двоим." },
    { n: "02", h: "Быстро", p: "Песня будет готова в течение 10 минут. Даже если день рождения уже завтра утром — вы успеваете." },
    { n: "03", h: "Просто", p: "Никаких студий, музыкантов и сложных программ. Всё делается с телефона за несколько минут." },
    { n: "04", h: "Недорого", p: "Первую песню можно сделать бесплатно. Дальше — от 100 рублей. Дешевле открытки с букетом." },
  ];

  const faq = [
    { q: "Я не разбираюсь в музыке. Справлюсь?", a: "Да. Вы просто отвечаете на пару вопросов простыми словами — как рассказали бы подруге. Всю музыкальную часть сервис берёт на себя." },
    { q: "Песня правда будет про моего человека?", a: "Да. Имя, ваша история и детали, которые вы расскажете, попадут в текст песни. Это не шаблон — каждая песня пишется заново." },
    { q: "Как подарить песню?", a: "Как удобно: отправьте ссылкой в WhatsApp или Telegram через кнопку «Поделиться», скачайте файл, запишите на флешку или включите вживую на празднике." },
    { q: "Сколько это стоит?", a: "Попробовать — бесплатно: первая песня в подарок от нас. Дальше пакет за 100 ₽, которого хватит на пять разных песен — выберете лучшую." },
  ];

  return (
    <div className="rl-root adl page" ref={rootRef} style={{ background: c.bg, color: c.ink }}>
      {/* NAV */}
      <nav className={`nav${scrolled ? " glass" : ""}`} style={{ background: glassBg, borderColor: c.rule, color: c.ink }}>
        <div className="wrap">
          <div className="nav-inner">
            <div className="nav-brand">
              <Mark size={22} />
              <span style={{ color: c.ink, fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 22 }}>RIFFA · песня в подарок</span>
            </div>
            <div className="nav-links">
              <a href="#examples" style={{ color: c.ink }} onClick={scrollTo("examples")}>примеры</a>
              <a href="#occasions" style={{ color: c.ink }} onClick={scrollTo("occasions")}>поводы</a>
              <a href="#how" style={{ color: c.ink }} onClick={scrollTo("how")}>как заказать</a>
              <a href="#price" style={{ color: c.ink }} onClick={scrollTo("price")}>цена</a>
            </div>
            <button className="nav-cta" style={{ background: c.accent, color: "#E9E5DA", fontSize: "13px" }} onClick={start}>Создать песню</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero" className="hero" style={{ borderColor: c.rule, background: c.bg, color: c.ink }}>
        <div className="wrap">
          <div data-anim="1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.ink2, marginBottom: 28, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px" }}>riffastudio.site · ПЕСНЯ В ПОДАРОК</span>
            <span>· 2026</span>
          </div>
          <div className="hero-split">
            <div>
              <h1 className="hero-headline" data-anim="2" style={{ color: c.orange, fontSize: "76px" }}>
                Подарите <span style={{ color: c.accent }}>песню.</span><br />
                <span style={{ color: "#232323", fontSize: "0.62em" }}>Про него. Про неё. Про вас.</span>
              </h1>
              <p data-anim="3" style={{ fontSize: 19, lineHeight: 1.55, marginTop: 28, maxWidth: 520, fontWeight: 500, color: c.ink3 }}>
                Расскажите о близком человеке — мы превратим вашу историю в настоящую
                песню с его именем. Подарок, который не пылится на полке.
              </p>
              <div className="hero-actions" data-anim="4" style={{ marginTop: "36px" }}>
                <button className="btn-primary" style={{ background: c.accent, color: "#E9E5DA", height: 52, padding: "0 32px", fontSize: "13px", letterSpacing: "1.5px", border: "none", cursor: "pointer" }} onClick={start}>СОЗДАТЬ ПЕСНЮ</button>
                <button className="btn-ghost" style={{ color: "#EC560B", borderColor: "#EC560B", padding: "0 28px", fontSize: "13px", letterSpacing: "1px", height: 52, background: "transparent", cursor: "pointer" }} onClick={scrollTo("examples")}>ПОСЛУШАТЬ ПРИМЕРЫ</button>
              </div>
            </div>
            <div data-anim="5">
              <GiftCardSVG />
            </div>
          </div>
          <p data-anim="5" style={{
            color: c.ink3, letterSpacing: "0.02em", fontWeight: 500,
            margin: "32px 0 0", lineHeight: "1.65", fontSize: "16px",
            borderTop: `1px solid ${c.rule}`, paddingTop: "24px",
          }}>
            Первая песня — бесплатно. Готово в течение 10 минут. Никаких студий
            и сложных программ — всё с телефона.
          </p>
        </div>
      </section>

      {/* БЕГУЩАЯ СТРОКА */}
      <Marquee items={["ДЕНЬ РОЖДЕНИЯ", "ЮБИЛЕЙ", "СВАДЬБА", "ГОДОВЩИНА", "8 МАРТА", "ВЫПУСКНОЙ", "ПРОСТО ТАК", "ПЕРВАЯ ПЕСНЯ — БЕСПЛАТНО"]} />

      {/* 01 · ПРИМЕРЫ */}
      <section id="examples" className="types-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">01</span> · примеры</div>
            <h2 style={{ color: c.orange }}>Послушайте, как это звучит.</h2>
            <div className="right">настоящие поздравительные песни</div>
          </div>
          <div className="adl-ex">
            {GIFT_EXAMPLES.map((ex, i) => (
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
            Все песни созданы в RIFFA — так же, как создадите вы: рассказали историю, выбрали настроение, получили песню.
          </p>
        </div>
      </section>

      {/* 02 · ПОВОДЫ */}
      <section id="occasions" className="types-section" style={{ background: c.bg2, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">02</span> · поводы</div>
            <h2 style={{ color: c.orange }}>Для любого случая — свой повод спеть.</h2>
            <div className="right">и без повода тоже</div>
          </div>
          <div className="types-grid" style={{ borderColor: c.rule, gridTemplateColumns: "repeat(3, 1fr)" }}>
            {occasions.map((o, i) => (
              <div key={o.h} className="type-card" style={{ borderColor: c.rule, borderBottom: `1px solid ${c.rule}` }}>
                <div className="type-icon" style={{ height: 64 }}>{occasionIcon(i, c.ink)}</div>
                <h3 style={{ color: c.ink, fontSize: 17 }}>{o.h}</h3>
                <p style={{ fontSize: 13.5 }}>{o.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 03 · КАК ЗАКАЗАТЬ */}
      <section id="how" className="process-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">03</span> · как заказать</div>
            <h2 style={{ color: c.orange }}>Три простых шага. Справится каждый.</h2>
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

      {/* 04 · ПОЧЕМУ ПЕСНЯ */}
      <section id="why" className="types-section" style={{ background: c.bg2, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">04</span> · почему песня</div>
            <h2 style={{ color: c.orange }}>Лучший подарок — тот, что про человека.</h2>
            <div className="right"></div>
          </div>
          <div className="types-grid" style={{ borderColor: c.rule, gridTemplateColumns: "repeat(4, 1fr)" }}>
            {reasons.map((r) => (
              <div key={r.n} className="type-card" style={{ borderColor: c.rule }}>
                <div className="type-num">{r.n}</div>
                <h3 style={{ color: c.accent, fontSize: 18 }}>{r.h}</h3>
                <p style={{ fontSize: 14 }}>{r.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 05 · FAQ */}
      <section id="faq" className="types-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">05</span> · вопросы</div>
            <h2 style={{ color: c.orange }}>Спрашивают чаще всего.</h2>
            <div className="right"></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, border: `1px solid ${c.rule}`, borderTop: "none" }}>
            {faq.map((f, i) => (
              <div key={i} style={{ padding: "28px 28px 32px", borderRight: i % 2 === 0 ? `1px solid ${c.rule}` : "none", borderBottom: i < 2 ? `1px solid ${c.rule}` : "none" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: c.accent, fontWeight: 600, marginBottom: 10 }}>Q{i + 1}</div>
                <h3 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 10px" }}>{f.q}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: c.ink3, margin: 0 }}>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 06 · ЦЕНА — в самом низу, перед финальным CTA */}
      <section id="price" className="pricing-section" style={{ background: c.bg2, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ fontSize: "19px" }}><span className="num">06</span> · цена</div>
            <h2 style={{ color: c.orange }}>Дешевле букета. Памятнее любого свитера.</h2>
            <div className="right" style={{ fontSize: "15px" }}>без подписок</div>
          </div>
          <div className="pricing-grid" style={{ borderColor: c.rule, gridTemplateColumns: "1fr 1fr" }}>
            <div className="price-card" style={{ borderColor: c.rule, background: c.bg }}>
              <div className="price-tier" style={{ color: c.accent, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "14px" }}>ПОПРОБОВАТЬ</div>
              <div className="price-amount" style={{ fontSize: "40px", color: c.ink }}>Бесплатно</div>
              <div className="price-tokens" style={{ borderColor: c.rule, color: c.accent, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "16px" }}>первая песня — в подарок от нас</div>
              <ul className="price-features">
                <li style={{ color: c.ink, fontWeight: 600, padding: "0 0 0 16px" }}>Полноценная песня с именем</li>
                <li style={{ color: c.ink, fontWeight: 600, padding: "0 0 0 16px" }}>Можно скачать и отправить</li>
                <li style={{ color: c.ink, fontWeight: 600, padding: "0 0 0 16px" }}>Без карты и обязательств</li>
              </ul>
              <button className="price-cta" style={{ background: "transparent", color: c.ink, borderColor: c.accent, borderWidth: "3px", fontSize: "18px", cursor: "pointer" }} onClick={start}>НАЧАТЬ</button>
            </div>
            <div className="price-card featured bp-featured" style={{ background: c.ink, border: "none", padding: "32px 28px" }}>
              <div className="price-tier" style={{ color: "#E9E5DA", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "14px" }}>ПЕСНЯ В ПОДАРОК</div>
              <div className="price-amount" style={{ fontSize: "40px", color: "#E9E5DA" }}>от 100 ₽</div>
              <div className="price-tokens" style={{ borderColor: "rgba(233,229,218,0.3)", color: "#E9E5DA", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "16px" }}>хватит на 5 разных песен</div>
              <ul className="price-features">
                <li style={{ color: "#E9E5DA", fontWeight: 600, padding: "0 0 0 16px" }}>Сделайте несколько вариантов</li>
                <li style={{ color: "#E9E5DA", fontWeight: 600, padding: "0 0 0 16px" }}>Выберете самую трогательную</li>
                <li style={{ color: "#E9E5DA", fontWeight: 600, padding: "0 0 0 16px" }}>Оплата картой РФ/СНГ</li>
              </ul>
              <button className="price-cta" style={{ background: "rgba(233,229,218,0.15)", color: "#FFFFFF", borderColor: c.accent, borderWidth: "3px", fontSize: "18px", cursor: "pointer" }} onClick={start}>СОЗДАТЬ ПЕСНЮ</button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA-ПОЛОСА */}
      <section style={{ background: c.ink, color: c.bg }}>
        <div className="wrap" style={{ padding: "72px 32px", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 44, margin: 0, letterSpacing: "-0.02em", color: c.bg }}>
            Сделайте подарок, <span style={{ color: "#7BD389" }}>который не забудут.</span>
          </h2>
          <p style={{ fontSize: 16, color: "#C9C4B8", margin: "18px auto 32px", maxWidth: 560 }}>
            Первая песня — бесплатно. Начните сейчас — через десять минут у вас будет
            подарок, которого нет ни в одном магазине.
          </p>
          <button className="btn-primary" style={{ background: c.accent, color: "#E9E5DA", height: 56, padding: "0 40px", fontSize: "14px", letterSpacing: "1.5px", border: "none", cursor: "pointer" }} onClick={start}>
            СОЗДАТЬ ПЕСНЮ В ПОДАРОК →
          </button>
        </div>
      </section>

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

/* ════════════════════════════════════════════════
   RIFFA · /business — посадочная для владельцев заведений
   (кофейни, фитнес, йога, бары, магазины, таймкафе).
   Оффер: плейлисты оптом по часам, от 1 000 ₽/час.
   Дизайн-система lend-v3: переиспользует .rl-root стили LandingPage.css.
   ════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./LandingPage.css";

const TG_LEAD = "https://t.me/RIFFAsupport_bot"; // куда падают заявки B2B

/* paper bg, emerald accent — палитра основного лендинга */
const c = {
  bg: "#E9E5DA", bg2: "#DDD8C9",
  ink: "#161413", ink2: "#4A4641", rule: "rgba(22,20,19,0.18)",
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
        <text x="60" y="62" fontFamily="JetBrains Mono" fontSize="11" fill={c.ink} opacity="0.5">ПЛЕЙЛИСТ #B-204</text>
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
            <text x="106" y={141 + i * 56} fontFamily="JetBrains Mono" fontSize="8" fill={c.ink} opacity="0.55">{meta}</text>
            <text x="452" y={131 + i * 56} fontFamily="JetBrains Mono" fontSize="10" fill={c.ink} opacity="0.6">{dur}</text>
            {i === 1 && <polygon points={`428,${118 + i * 56} 428,${134 + i * 56} 441,${126 + i * 56}`} fill={c.accent} />}
          </g>
        ))}
        <line x1="46" y1="342" x2="514" y2="342" stroke={c.ink} strokeWidth="0.8" />
        <text x="60" y="370" fontFamily="JetBrains Mono" fontSize="10" fill={c.ink} opacity="0.55">ВСЕГО: 5 ЧАСОВ · 72 ТРЕКА</text>
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

  // Scroll-reveal — тот же эффект, что на главном лендинге
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    root.querySelectorAll<HTMLElement>(".type-card, .process-step, .price-card, .section-head").forEach((el, i) => {
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
  const lead = () => window.open(TG_LEAD, "_blank", "noopener");

  const glassBg = scrolled ? "rgba(233,229,218,0.95)" : "rgba(233,229,218,0.85)";

  const pains = [
    { n: "01", h: "Штрафы за чужую музыку", p: "Колонка с плейлистом из стриминга — это публичное воспроизведение. РАО и ВОИС приходят с претензиями даже к маленьким кофейням." },
    { n: "02", h: "Подписки дорожают", p: "Сервисы фоновой музыки берут плату каждый месяц. Год аренды чужой музыки стоит дороже собственной." },
    { n: "03", h: "Треки приедаются", p: "Один плейлист по кругу неделями. Персонал устал, постоянные гости замечают повторы." },
    { n: "04", h: "Некогда подбирать", p: "Собрать атмосферный плейлист самому — часы работы, которых у владельца нет." },
  ];

  const venues = [
    { icon: "☕", h: "Кофейня и пекарня", p: "Мягкий лоу-фай, джаз-хоп и соул — гости задерживаются дольше" },
    { icon: "🏋️", h: "Фитнес и тренажёрка", p: "Драйв и энергия, 120–150 BPM — темп зала держится сам" },
    { icon: "🧘", h: "Йога и массаж", p: "Спокойный эмбиент без слов — ничто не отвлекает от практики" },
    { icon: "🍸", h: "Бар и ресторан", p: "Вечерний грув и диско — атмосфера, под которую заказывают ещё" },
    { icon: "🛍", h: "Магазин и шоурум", p: "Ненавязчивый фон — покупатели не спешат к выходу" },
    { icon: "⏳", h: "Таймкафе и коворкинг", p: "Фокус и уют — музыка, под которую работается" },
  ];

  const features = [
    { n: "01", h: "Музыка создана для вас", p: "Каждый трек собирается с нуля под ваше заведение. Его нет в чужих каталогах и реестрах правообладателей." },
    { n: "02", h: "Файлы ваши навсегда", p: "MP3 высокого качества. Играют офлайн с любого устройства — ноутбука, телефона, плеера. Интернет не нужен." },
    { n: "03", h: "Без абонентской платы", p: "Покупаете часы музыки один раз — используете каждый день без ограничений и продлений." },
    { n: "04", h: "Под вашу атмосферу", p: "Жанр, темп и настроение подбираются под зал, время суток и вашу аудиторию." },
  ];

  const tiers = [
    { name: "ПРОБНЫЙ", hours: "1 час", price: "1 000 ₽", per: "1 000 ₽/час", feat: ["12–15 уникальных треков", "Подбор под вашу атмосферу", "MP3 + обложки", "Превью до оплаты"], featured: false },
    { name: "СМЕНА", hours: "5 часов", price: "4 500 ₽", per: "900 ₽/час", feat: ["60–75 уникальных треков", "Хватает на рабочий день", "Разбивка по времени суток", "MP3 + обложки"], featured: false },
    { name: "НЕДЕЛЯ", hours: "10 часов", price: "8 000 ₽", per: "800 ₽/час", feat: ["120–150 уникальных треков", "Ротация без повторов", "Несколько атмосфер в одном пакете", "Приоритетная сборка"], featured: true },
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
    <div className="rl-root page" ref={rootRef} style={{ background: c.bg, color: c.ink }}>
      {/* NAV */}
      <nav className={`nav${scrolled ? " glass" : ""}`} style={{ background: glassBg, borderColor: c.rule, color: c.ink }}>
        <div className="wrap">
          <div className="nav-inner">
            <div className="nav-brand">
              <Mark size={22} />
              <span style={{ color: c.ink, fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 22 }}>RIFFA для бизнеса</span>
            </div>
            <div className="nav-links">
              <a href="#pain" style={{ color: c.ink }} onClick={scrollTo("pain")}>проблема</a>
              <a href="#venues" style={{ color: c.ink }} onClick={scrollTo("venues")}>атмосферы</a>
              <a href="#pricing" style={{ color: c.ink }} onClick={scrollTo("pricing")}>цены</a>
              <a href="#how" style={{ color: c.ink }} onClick={scrollTo("how")}>как заказать</a>
            </div>
            <button className="nav-cta" style={{ background: c.accent, color: "#E9E5DA", fontSize: "13px" }} onClick={lead}>Заказать плейлист</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero" className="hero" style={{ borderColor: c.rule, background: c.bg, color: c.ink }}>
        <div className="wrap">
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.45, marginBottom: 28, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px" }}>riffastudio.site · ФОНОВАЯ МУЗЫКА ДЛЯ БИЗНЕСА</span>
            <span>· 2026</span>
          </div>
          <div className="hero-split">
            <div>
              <h1 className="hero-headline" style={{ color: c.orange, fontSize: "72px" }}>
                Музыка для <span style={{ color: "#232323" }}>вашего</span> <span style={{ color: c.accent }}>заведения.</span>
              </h1>
              <p style={{ fontSize: 19, lineHeight: 1.55, marginTop: 28, maxWidth: 520, fontWeight: 500, opacity: 0.8 }}>
                Готовые плейлисты, созданные специально под атмосферу вашей кофейни,
                фитнес-клуба или студии. Купите один раз — играйте каждый день.
              </p>
              <div className="hero-actions" style={{ marginTop: "36px" }}>
                <button className="btn-primary" style={{ background: c.accent, color: "#E9E5DA", height: 52, padding: "0 32px", fontSize: "13px", letterSpacing: "1.5px", border: "none", cursor: "pointer" }} onClick={lead}>ЗАКАЗАТЬ ПЛЕЙЛИСТ</button>
                <button className="btn-ghost" style={{ color: "#EC560B", borderColor: "#EC560B", padding: "0 28px", fontSize: "13px", letterSpacing: "1px", height: 52, background: "transparent", cursor: "pointer" }} onClick={() => navigate("/radio")}>ПОСЛУШАТЬ ПРИМЕРЫ</button>
              </div>
            </div>
            <PlaylistSVG />
          </div>
          <p style={{
            color: c.ink, letterSpacing: "0.02em", fontWeight: 500,
            margin: "32px 0 0", lineHeight: "1.65", fontSize: "16px",
            borderTop: `1px solid ${c.rule}`, paddingTop: "24px", opacity: 0.75,
          }}>
            Час уникальной музыки — от 1 000 ₽. Без абонентской платы, без претензий
            правообладателей, без повторов. Файлы остаются у вас навсегда.
          </p>
        </div>
      </section>

      {/* 01 · ПРОБЛЕМА */}
      <section id="pain" className="types-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">01</span> · знакомо?</div>
            <h2 style={{ color: c.orange }}>Фоновая музыка — головная боль владельца.</h2>
            <div className="right">4 типовые проблемы</div>
          </div>
          <div className="types-grid" style={{ borderColor: c.rule, gridTemplateColumns: "repeat(4, 1fr)" }}>
            {pains.map((it) => (
              <div key={it.n} className="type-card" style={{ borderColor: c.rule }}>
                <div className="type-num" style={{ color: c.ink }}>{it.n}</div>
                <h3 style={{ color: c.red, fontSize: 18 }}>{it.h}</h3>
                <p style={{ color: c.ink, fontSize: 14, opacity: 0.75 }}>{it.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 02 · РЕШЕНИЕ */}
      <section id="solution" className="types-section" style={{ background: c.bg2, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">02</span> · решение</div>
            <h2 style={{ color: c.orange }}>Плейлист, созданный под ваше заведение.</h2>
            <div className="right">riffa для бизнеса</div>
          </div>
          <div className="types-grid" style={{ borderColor: c.rule, gridTemplateColumns: "repeat(4, 1fr)" }}>
            {features.map((it) => (
              <div key={it.n} className="type-card" style={{ borderColor: c.rule }}>
                <div className="type-num" style={{ color: c.ink }}>{it.n}</div>
                <h3 style={{ color: c.accent, fontSize: 18 }}>{it.h}</h3>
                <p style={{ color: c.ink, fontSize: 14, opacity: 0.75 }}>{it.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 03 · АТМОСФЕРЫ */}
      <section id="venues" className="types-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">03</span> · атмосферы</div>
            <h2 style={{ color: c.orange }}>Под формат вашего бизнеса.</h2>
            <div className="right">6 готовых направлений</div>
          </div>
          <div className="types-grid" style={{ borderColor: c.rule, gridTemplateColumns: "repeat(3, 1fr)" }}>
            {venues.map((v) => (
              <div key={v.h} className="type-card" style={{ borderColor: c.rule, borderBottom: `1px solid ${c.rule}` }}>
                <div className="type-icon" style={{ fontSize: 44, height: 64 }}>{v.icon}</div>
                <h3 style={{ color: c.ink, fontSize: 17 }}>{v.h}</h3>
                <p style={{ color: c.ink, fontSize: 13.5, opacity: 0.7 }}>{v.p}</p>
                <div className="type-meta" style={{ borderColor: c.rule, color: c.accent, fontWeight: 800, fontSize: 11, opacity: 1, letterSpacing: "0.8px" }}>есть пресет</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 04 · ЦЕНЫ */}
      <section id="pricing" className="pricing-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">04</span> · цены</div>
            <h2 style={{ color: c.orange }}>Платите за часы — получаете музыку навсегда.</h2>
            <div className="right" style={{ fontSize: "15px" }}>разовая покупка</div>
          </div>
          <div className="pricing-grid" style={{ borderColor: c.rule, gridTemplateColumns: "repeat(3, 1fr)" }}>
            {tiers.map((tier) => (
              <div key={tier.name} className={`price-card${tier.featured ? " featured" : ""}`} style={{ borderColor: c.rule, background: tier.featured ? c.ink : "transparent", border: tier.featured ? "none" : undefined, padding: tier.featured ? "32px 28px" : undefined }}>
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
          <p style={{ marginTop: 20, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, opacity: 0.6 }}>
            Нужно больше часов, несколько точек или особый формат — напишите, соберём индивидуальное предложение.
          </p>
        </div>
      </section>

      {/* 05 · КАК ЗАКАЗАТЬ */}
      <section id="how" className="process-section" style={{ background: c.bg2, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">05</span> · как заказать</div>
            <h2 style={{ color: c.orange }}>Три шага — и музыка играет у вас.</h2>
            <div className="right"></div>
          </div>
          <div className="process-grid">
            {steps.map((s, i) => (
              <div key={i} className="process-step" style={{ borderColor: c.rule }}>
                <div className="step-num" style={{ color: c.accent, opacity: 1 }}>{"0" + (i + 1)}</div>
                <h3 style={{ color: c.ink }}>{s.h}</h3>
                <p style={{ color: c.ink }}>{s.p}</p>
                <div className="tip" style={{ borderColor: c.rule, color: c.ink, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.02em" }}>{s.tip}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 06 · FAQ */}
      <section id="faq" className="types-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">06</span> · вопросы</div>
            <h2 style={{ color: c.orange }}>Коротко о главном.</h2>
            <div className="right"></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, border: `1px solid ${c.rule}`, borderTop: "none" }}>
            {faq.map((f, i) => (
              <div key={i} style={{ padding: "28px 28px 32px", borderRight: i % 2 === 0 ? `1px solid ${c.rule}` : "none", borderBottom: i < 2 ? `1px solid ${c.rule}` : "none" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: c.accent, fontWeight: 600, marginBottom: 10 }}>Q{i + 1}</div>
                <h3 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 10px" }}>{f.q}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, opacity: 0.7, margin: 0 }}>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA-ПОЛОСА */}
      <section style={{ background: c.ink, color: c.bg }}>
        <div className="wrap" style={{ padding: "72px 32px", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 44, margin: 0, letterSpacing: "-0.02em", color: c.bg }}>
            Запустите свою музыку <span style={{ color: "#7BD389" }}>на этой неделе.</span>
          </h2>
          <p style={{ fontSize: 16, opacity: 0.7, margin: "18px auto 32px", maxWidth: 560 }}>
            Напишите нам в Telegram — зададим три вопроса о заведении и пришлём превью плейлиста.
          </p>
          <button className="btn-primary" style={{ background: c.accent, color: "#E9E5DA", height: 56, padding: "0 40px", fontSize: "14px", letterSpacing: "1.5px", border: "none", cursor: "pointer" }} onClick={lead}>
            НАПИСАТЬ В TELEGRAM →
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer" style={{ background: c.bg, color: c.ink }}>
        <div className="wrap">
          <div className="footer-bottom" style={{ borderColor: c.rule, color: c.ink, opacity: 1, borderTop: "none" }}>
            <span>© 2026 riffa studio · все права защищены</span>
            <span style={{ cursor: "pointer" }} onClick={() => navigate("/")}>riffastudio.site</span>
            <span>telegram: @the_riffa_bot · @riffasupport</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

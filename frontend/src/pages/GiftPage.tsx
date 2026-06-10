/* ════════════════════════════════════════════════
   RIFFA · /gift — посадочная «Песня в подарок».
   Аудитория постарше: максимально простой язык, никакого «ИИ» —
   просто сервис, где легко и недорого заказать песню для близкого.
   Дизайн-система lend-v3: переиспользует .rl-root стили LandingPage.css.
   ════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./LandingPage.css";

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
        <text x="84" y="92" fontFamily="JetBrains Mono" fontSize="10" fill={c.ink} opacity="0.5">ПЕСНЯ В ПОДАРОК</text>
        <text x="476" y="92" fontFamily="JetBrains Mono" fontSize="10" fill={c.red} textAnchor="end">♥</text>
        <line x1="84" y1="104" x2="476" y2="104" stroke={c.ink} strokeWidth="0.8" />
        <text x="84" y="148" fontFamily="Inter" fontSize="26" fontWeight="700" fill={c.ink}>«Для мамы»</text>
        <text x="84" y="172" fontFamily="JetBrains Mono" fontSize="10" fill={c.ink} opacity="0.6">ОТ СЕРЁЖИ · НА ЮБИЛЕЙ · 3:08</text>
        {/* плеер */}
        <rect x="84" y="196" width="392" height="64" rx="12" stroke={c.ink} strokeWidth="0.8" fill="none" />
        <circle cx="120" cy="228" r="18" fill={c.accent} />
        <polygon points="114,219 114,237 130,228" fill="#E9E5DA" />
        {[0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 91, 98, 105, 112].map((x, i) => {
          const h = [8, 14, 10, 18, 12, 20, 14, 9, 16, 11, 19, 13, 8, 15, 10, 12, 7][i];
          return <line key={x} x1={158 + x * 2.4} y1={228 - h / 2} x2={158 + x * 2.4} y2={228 + h / 2} stroke={i < 7 ? c.accent : c.ink} strokeWidth="2.2" strokeLinecap="round" opacity={i < 7 ? 1 : 0.35} />;
        })}
        <text x="460" y="233" fontFamily="JetBrains Mono" fontSize="10" fill={c.ink} opacity="0.6" textAnchor="end">1:12</text>
        {/* строки песни */}
        <text x="84" y="296" fontFamily="Inter" fontSize="14" fontStyle="italic" fill={c.ink} opacity="0.75">«Твои руки пахнут пирогами,</text>
        <text x="84" y="318" fontFamily="Inter" fontSize="14" fontStyle="italic" fill={c.ink} opacity="0.75">твой голос — самый тёплый дом…»</text>
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
  const start = () => navigate("/studio");

  const glassBg = scrolled ? "rgba(233,229,218,0.95)" : "rgba(233,229,218,0.85)";

  const occasions = [
    { icon: "🎂", h: "День рождения", p: "Именинник услышит песню, где звучит его имя — такого подарка у него ещё не было" },
    { icon: "💍", h: "Свадьба и годовщина", p: "Ваша общая история — в песне для первого танца или семейного вечера" },
    { icon: "🌷", h: "Маме", p: "Все тёплые слова, которые сложно сказать вслух — легко спеть" },
    { icon: "🥂", h: "Юбилей", p: "Песня про юбиляра соберёт весь стол — и слёзы, и аплодисменты" },
    { icon: "🎓", h: "Выпускной", p: "Памятная песня для класса, группы или любимого учителя" },
    { icon: "❤️", h: "Просто так", p: "Без повода — самый честный повод сказать человеку, что он дорог" },
  ];

  const steps = [
    { h: "Расскажите о человеке", p: "Имя, пара тёплых деталей, любимая история. Двух-трёх предложений достаточно — остальное мы сделаем сами.", tip: "«мама Наташа, печёт лучшие пироги,\nвырастила нас троих» — этого хватит" },
    { h: "Выберите настроение", p: "Весёлая, нежная или торжественная. Стиль — любой: от душевного романса до зажигательной танцевальной.", tip: "не разбираетесь в жанрах?\nпросто напишите «как у Аллы Пугачёвой»" },
    { h: "Получите песню", p: "Слушайте, скачивайте, отправляйте в WhatsApp или Telegram. Или включите вживую — за столом, под торт.", tip: "готово в тот же день,\nдаже если праздник завтра" },
  ];

  const reasons = [
    { n: "01", h: "Личное", p: "Песня именно про вашего человека: с его именем, вашей историей и словами, которые важны только вам двоим." },
    { n: "02", h: "Быстро", p: "Песня будет готова сегодня. Даже если день рождения уже завтра утром — вы успеваете." },
    { n: "03", h: "Просто", p: "Никаких студий, музыкантов и сложных программ. Всё делается с телефона за несколько минут." },
    { n: "04", h: "Недорого", p: "Первую песню можно сделать бесплатно. Дальше — от 100 рублей. Дешевле открытки с букетом." },
  ];

  const faq = [
    { q: "Я не разбираюсь в музыке. Справлюсь?", a: "Да. Вы просто отвечаете на пару вопросов простыми словами — как рассказали бы подруге. Всю музыкальную часть сервис берёт на себя." },
    { q: "Песня правда будет про моего человека?", a: "Да. Имя, ваша история и детали, которые вы расскажете, попадут в текст песни. Это не шаблон — каждая песня пишется заново." },
    { q: "Как подарить песню?", a: "Как удобно: отправьте ссылкой в WhatsApp или Telegram, скачайте файл, запишите на флешку или включите вживую на празднике." },
    { q: "Сколько это стоит?", a: "Попробовать — бесплатно: первая песня в подарок от нас. Дальше пакет за 100 ₽, которого хватит на пять разных песен — выберете лучшую." },
  ];

  return (
    <div className="rl-root page" ref={rootRef} style={{ background: c.bg, color: c.ink }}>
      {/* NAV */}
      <nav className={`nav${scrolled ? " glass" : ""}`} style={{ background: glassBg, borderColor: c.rule, color: c.ink }}>
        <div className="wrap">
          <div className="nav-inner">
            <div className="nav-brand">
              <Mark size={22} />
              <span style={{ color: c.ink, fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 22 }}>RIFFA · песня в подарок</span>
            </div>
            <div className="nav-links">
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
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.45, marginBottom: 28, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px" }}>riffastudio.site · ПЕСНЯ В ПОДАРОК</span>
            <span>· 2026</span>
          </div>
          <div className="hero-split">
            <div>
              <h1 className="hero-headline" style={{ color: c.orange, fontSize: "76px" }}>
                Подарите <span style={{ color: c.accent }}>песню.</span><br />
                <span style={{ color: "#232323", fontSize: "0.62em" }}>Про него. Про неё. Про вас.</span>
              </h1>
              <p style={{ fontSize: 19, lineHeight: 1.55, marginTop: 28, maxWidth: 520, fontWeight: 500, opacity: 0.8 }}>
                Расскажите о близком человеке — мы превратим вашу историю в настоящую
                песню с его именем. Подарок, который не пылится на полке.
              </p>
              <div className="hero-actions" style={{ marginTop: "36px" }}>
                <button className="btn-primary" style={{ background: c.accent, color: "#E9E5DA", height: 52, padding: "0 32px", fontSize: "13px", letterSpacing: "1.5px", border: "none", cursor: "pointer" }} onClick={start}>СОЗДАТЬ ПЕСНЮ</button>
                <button className="btn-ghost" style={{ color: "#EC560B", borderColor: "#EC560B", padding: "0 28px", fontSize: "13px", letterSpacing: "1px", height: 52, background: "transparent", cursor: "pointer" }} onClick={() => navigate("/radio")}>ПОСЛУШАТЬ ПРИМЕРЫ</button>
              </div>
            </div>
            <GiftCardSVG />
          </div>
          <p style={{
            color: c.ink, letterSpacing: "0.02em", fontWeight: 500,
            margin: "32px 0 0", lineHeight: "1.65", fontSize: "16px",
            borderTop: `1px solid ${c.rule}`, paddingTop: "24px", opacity: 0.75,
          }}>
            Первая песня — бесплатно. Готово в тот же день: даже если праздник завтра,
            вы успеваете. Никаких студий и сложных программ — всё с телефона.
          </p>
        </div>
      </section>

      {/* 01 · ПОВОДЫ */}
      <section id="occasions" className="types-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">01</span> · поводы</div>
            <h2 style={{ color: c.orange }}>Для любого случая — свой повод спеть.</h2>
            <div className="right">и без повода тоже</div>
          </div>
          <div className="types-grid" style={{ borderColor: c.rule, gridTemplateColumns: "repeat(3, 1fr)" }}>
            {occasions.map((o) => (
              <div key={o.h} className="type-card" style={{ borderColor: c.rule, borderBottom: `1px solid ${c.rule}` }}>
                <div className="type-icon" style={{ fontSize: 44, height: 64 }}>{o.icon}</div>
                <h3 style={{ color: c.ink, fontSize: 17 }}>{o.h}</h3>
                <p style={{ color: c.ink, fontSize: 13.5, opacity: 0.7 }}>{o.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 02 · КАК ЗАКАЗАТЬ */}
      <section id="how" className="process-section" style={{ background: c.bg2, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">02</span> · как заказать</div>
            <h2 style={{ color: c.orange }}>Три простых шага. Справится каждый.</h2>
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

      {/* 03 · ПОЧЕМУ ПЕСНЯ */}
      <section id="why" className="types-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">03</span> · почему песня</div>
            <h2 style={{ color: c.orange }}>Лучший подарок — тот, что про человека.</h2>
            <div className="right"></div>
          </div>
          <div className="types-grid" style={{ borderColor: c.rule, gridTemplateColumns: "repeat(4, 1fr)" }}>
            {reasons.map((r) => (
              <div key={r.n} className="type-card" style={{ borderColor: c.rule }}>
                <div className="type-num" style={{ color: c.ink }}>{r.n}</div>
                <h3 style={{ color: c.accent, fontSize: 18 }}>{r.h}</h3>
                <p style={{ color: c.ink, fontSize: 14, opacity: 0.75 }}>{r.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 04 · ЦЕНА */}
      <section id="price" className="pricing-section" style={{ background: c.bg, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">04</span> · цена</div>
            <h2 style={{ color: c.orange }}>Дешевле букета. Памятнее любого свитера.</h2>
            <div className="right" style={{ fontSize: "15px" }}>без подписок</div>
          </div>
          <div className="pricing-grid" style={{ borderColor: c.rule, gridTemplateColumns: "1fr 1fr" }}>
            <div className="price-card" style={{ borderColor: c.rule }}>
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
            <div className="price-card featured" style={{ background: c.ink, border: "none", padding: "32px 28px" }}>
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

      {/* 05 · FAQ */}
      <section id="faq" className="types-section" style={{ background: c.bg2, color: c.ink, borderColor: c.rule }}>
        <div className="wrap">
          <div className="section-head" style={{ borderColor: c.rule, color: c.ink }}>
            <div className="section-tag" style={{ color: c.ink, fontSize: "19px" }}><span className="num">05</span> · вопросы</div>
            <h2 style={{ color: c.orange }}>Спрашивают чаще всего.</h2>
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
            Сделайте подарок, <span style={{ color: "#7BD389" }}>который не забудут.</span>
          </h2>
          <p style={{ fontSize: 16, opacity: 0.7, margin: "18px auto 32px", maxWidth: 560 }}>
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

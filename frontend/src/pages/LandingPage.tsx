/* ════════════════════════════════════════════════
   RIFFA · Landing (/) — публичная главная (маркетинг)
   Верстка — из Claude Design handoff (pages/Landing.tsx),
   плюс: проигрываемый чарт-радио блок, scroll-reveal,
   роутинг кнопок. Логика/данные приложения не трогаются.
   ════════════════════════════════════════════════ */

import { MouseEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { fetchRadio, type RadioTrackOut } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { Button, Mark, MetaRow, Pill, SectionHead, Stage, TwoCol, Wordmark } from "./landing/brand";
import "./LandingPage.css";

/* Reveal-on-scroll: добавляет .is-in элементам .lp-reveal при попадании во
   вьюпорт. Уважает prefers-reduced-motion (тогда показываем сразу). */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Progressive enhancement: content is visible by default. Only once JS is
    // running (and motion is allowed) do we "arm" the hide-then-reveal — so a
    // failed observer or disabled JS can never leave sections invisible.
    if (reduce || !("IntersectionObserver" in window)) return;
    root.classList.add("is-armed");
    const items = Array.from(root.querySelectorAll<HTMLElement>(".lp-reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0, rootMargin: "0px 0px -10% 0px" },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, []);
  return ref;
}

function scrollToExamples(e?: MouseEvent) {
  e?.preventDefault();
  document.getElementById("lp-examples")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function LandingPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const revealRef = useReveal();

  // Залогиненных — сразу в студию, маркетинговая главная им не нужна.
  if (!isLoading && user) return <Navigate to="/studio" replace />;

  return (
    <div className="r-app" ref={revealRef}>
      <div className="r-page">
        {/* ─── HEADER (публичный, с CTA «войти») ─── */}
        <header className="r-topbar lp-topbar">
          <div className="r-brand">
            <Mark size={22} variant="light" />
            <span>RIFFA</span>
          </div>
          <nav className="r-topnav">
            <a href="/studio" onClick={(e) => { e.preventDefault(); navigate("/studio"); }}>студия</a>
            <a href="/radio" onClick={(e) => { e.preventDefault(); navigate("/radio"); }}>радио</a>
            <a href="#lp-examples" onClick={scrollToExamples}>примеры</a>
            <a href="/guide" onClick={(e) => { e.preventDefault(); navigate("/guide"); }}>гайд</a>
          </nav>
          <div className="r-topright">
            <Button variant="primary" size="sm" href="/login">войти →</Button>
          </div>
        </header>

        <MetaRow left="riffa studio · 2026" center="песни с вокалом за минуту" right="riffastudio.site" />

        {/* ─── HERO ─── */}
        <section className="lp-hero">
          <aside className="lp-hero__side">
            <div className="lp-kv">
              <div className="lp-kv__k">движок</div><div className="lp-kv__v">нейросеть</div>
              <div className="lp-kv__k">песня</div><div className="lp-kv__v">≈1–2 мин</div>
              <div className="lp-kv__k">обложка</div><div className="lp-kv__v">≈20 сек</div>
              <div className="lp-kv__k">форматы</div><div className="lp-kv__v">mp3 · wav</div>
              <div className="lp-kv__k">копирайт</div><div className="lp-kv__v lp-kv__v--emr">свободно</div>
              <div className="lp-kv__k">старт</div><div className="lp-kv__v lp-kv__v--emr">бесплатно</div>
            </div>
          </aside>
          <div>
            <h1 className="lp-h1">
              сделай <em>песню</em>.<br />любую <span className="lp-h1__emr">песню</span>.
            </h1>
            <p className="lp-lede">
              RIFFA Studio — онлайн-сервис на русском, который собирает полноценную песню с вокалом за минуту.{" "}
              <b>Опиши идею словами</b> — или попроси агента: он сам задаст вопросы и соберёт промт. Готово — скачиваешь в MP3 или WAV.
            </p>
            <div className="lp-cta">
              <Button variant="primary" size="lg" href="/studio">создать песню →</Button>
              <Button variant="ghost" size="lg" onClick={scrollToExamples}>послушать примеры</Button>
            </div>
          </div>
        </section>

        {/* ─── HERO STAGE ─── */}
        <div className="lp-stage">
          <Stage dark topLeft="RIFFA · IDENTITY" bottomRight="play, twice" aspectRatio={2.4} padding={48} maxContentWidth={900}>
            <div className="lp-stage__lockup">
              <Mark size={180} variant="inverted" />
              <Wordmark height={160} variant="paper" />
            </div>
          </Stage>
        </div>

        {/* ─── ПРИМЕРЫ · ЧАРТ РАДИО (проигрываемые) ─── */}
        <ExamplesSection />

        {/* ─── ЧТО МОЖНО СОЗДАТЬ ─── */}
        <div className="lp-reveal">
          <SectionHead num="01" label="что можно создать" title="пять типов на одном экране." right="все на одних токенах" />
          <div className="lp-types">
            <TypeCard num="01" name="Песня с вокалом" desc="2–4 минуты · м/ж голос · с куплетами и припевом" meta="MP3 · WAV" />
            <TypeCard num="02" name="Инструментал" desc="Фоновая музыка без вокала, без копирайта" meta="2–4 МИН" />
            <TypeCard num="03" name="Обложка альбома" desc="Квадратное изображение под трек или альбом" meta="1024²" />
            <TypeCard num="04" name="Кавер-версия" desc="Переработка трека в новом жанре" meta="+ загрузка" />
            <TypeCard num="05" name="Звуковой эффект" desc="Короткие звуки до 30 секунд для игр и монтажа" meta="ДО 30 СЕК" />
          </div>
        </div>

        {/* ─── КАК ПОЛЬЗОВАТЬСЯ ─── */}
        <div className="lp-reveal">
          <SectionHead num="02" label="как пользоваться" title="три шага, около минуты." right="60 сек" />
          <TwoCol label="Шаг 01" description="Опиши идею своими словами" note="Можно на русском, в свободной форме. До 500 символов. Или попроси агента — он сам задаст вопросы.">
            <div className="lp-step">
              <span className="lp-step__num">01</span>
              <span className="lp-step__txt">«грустная фортепианная песня о возвращении домой в ноябре»</span>
            </div>
          </TwoCol>
          <TwoCol label="Шаг 02" description="Жди минуту-две" note="Прогресс генерации виден в очереди. Можно создавать несколько треков параллельно.">
            <div className="lp-step">
              <span className="lp-step__num">02</span>
              <span className="lp-step__txt"><span className="lp-step__ok">✓</span> разбор · <span className="lp-step__ok">✓</span> структура · <span className="lp-step__hi">●</span> текст · ⋯ рендер</span>
            </div>
          </TwoCol>
          <TwoCol label="Шаг 03" description="Скачивай и используй" note="MP3 или WAV. Без копирайта — можно заливать в TikTok, YouTube, Reels.">
            <div className="lp-step">
              <span className="lp-step__num">03</span>
              <span className="lp-step__txt">
                <Pill variant="emerald">готово</Pill>
                <Button variant="emerald" size="sm" href="/studio">↓ MP3</Button>
                <Button variant="default" size="sm" href="/studio">↓ WAV</Button>
              </span>
            </div>
          </TwoCol>
        </div>

        {/* ─── ИТОГОВЫЙ CTA ─── */}
        <div className="lp-cta-block lp-reveal">
          <h2 className="lp-cta-block__title">стартовые токены — бесплатно.</h2>
          <p className="lp-cta-block__sub">
            Регистрация по email, через Google или Telegram. Дальше — пакеты от 100 ₽, оплата картой РФ через Robokassa или Telegram Stars.
          </p>
          <div className="lp-cta-block__btns">
            <Button variant="primary" size="lg" href="/studio">начать бесплатно →</Button>
            <Button variant="default" size="lg" href="/login">войти</Button>
          </div>
        </div>

        {/* ─── FOOTER ─── */}
        <footer className="lp-foot">
          <div><b>продукт</b><LpLink href="/studio">студия</LpLink><LpLink href="/radio">радио</LpLink><LpLink href="/guide">гайд</LpLink></div>
          <div><b>контакт</b><LpLink href="https://t.me/The_Riffa_bot">telegram-бот</LpLink><LpLink href="https://t.me/RiffaSupportBot">поддержка</LpLink></div>
          <div><b>правовое</b><LpLink href="/docs/offer.txt">условия</LpLink><LpLink href="/docs/privacy.txt">приватность</LpLink></div>
          <div><b>сайт</b><LpLink href="https://riffastudio.site">riffastudio.site</LpLink></div>
        </footer>
        <div className="lp-copyright">
          <span>© 2026 riffa studio</span>
          <span>песни с вокалом за минуту</span>
          <span>сделано в россии</span>
        </div>
      </div>
    </div>
  );
}

/* ─── вспомогательные ─── */

function TypeCard({ num, name, desc, meta }: { num: string; name: string; desc: string; meta: string }) {
  return (
    <div className="lp-type">
      <div className="lp-type__num">{num}</div>
      <h3 className="lp-type__name">{name}</h3>
      <p className="lp-type__desc">{desc}</p>
      <div className="lp-type__meta">{meta}</div>
    </div>
  );
}

function LpLink({ href, children }: { href: string; children: ReactNode }) {
  const navigate = useNavigate();
  const external = /^https?:\/\//.test(href) || href.endsWith(".txt");
  if (external) {
    return <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined}>{children}</a>;
  }
  return <a href={href} onClick={(e) => { e.preventDefault(); navigate(href); }}>{children}</a>;
}

/* ─── ПРИМЕРЫ · ЧАРТ РАДИО ───────────────────────────────────
   Тянем топ публичных треков по прослушиваниям и даём слушать
   прямо на лендинге (public-stream, без авторизации). */
function ExamplesSection() {
  const [tracks, setTracks] = useState<RadioTrackOut[]>([]);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRadio({ sort: "plays", period: "all", limit: 6 })
      .then((r) => { if (alive) setTracks(r.items.slice(0, 6)); })
      .catch(() => { if (alive) setTracks([]); });
    return () => { alive = false; };
  }, []);

  // Self-reveal: this block renders *after* the async radio fetch, so the
  // page-level reveal observer (set up at mount) never sees it. Observe our
  // own root once the cards are in the DOM.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { el.classList.add("is-in"); io.disconnect(); } }),
      { threshold: 0, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [tracks.length]);

  const toggle = (t: RadioTrackOut) => {
    const key = `${t.id}:${t.track_index}`;
    const audio = audioRef.current;
    if (!audio) return;
    if (playingKey === key) {
      audio.pause();
      setPlayingKey(null);
      return;
    }
    audio.src = t.audio_url;
    void audio.play().catch(() => setPlayingKey(null));
    setPlayingKey(key);
  };

  if (tracks.length === 0) return null;

  return (
    <div id="lp-examples" ref={rootRef} className="lp-reveal">
      <SectionHead num="◆" label="примеры" title="чарт радио — послушай, что делают другие." right="топ по прослушиваниям" />
      <div className="lp-ex-grid">
        {tracks.map((t) => {
          const key = `${t.id}:${t.track_index}`;
          const isPlaying = playingKey === key;
          return (
            <button key={key} type="button" className={`lp-ex${isPlaying ? " is-playing" : ""}`} onClick={() => toggle(t)}>
              <span className="lp-ex__cover">
                {t.image_url ? <img src={t.image_url} alt="" loading="lazy" /> : <Mark size={28} variant="light" />}
                <span className="lp-ex__play" aria-hidden>{isPlaying ? "❚❚" : "▶"}</span>
              </span>
              <span className="lp-ex__body">
                <span className="lp-ex__title">{t.title || "Без названия"}</span>
                <span className="lp-ex__author">{t.author}</span>
                <span className="lp-ex__tags">
                  {t.genre && <span className="lp-ex__tag">{t.genre}</span>}
                  <span className="lp-ex__plays">{t.play_count} ▶</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="lp-ex-foot">
        <Button variant="default" size="md" href="/radio">всё радио →</Button>
      </div>
      <audio ref={audioRef} onEnded={() => setPlayingKey(null)} preload="none" crossOrigin="anonymous" />
    </div>
  );
}

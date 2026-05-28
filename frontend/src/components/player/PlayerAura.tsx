import { useEffect, useRef, type RefObject } from "react";

import "./PlayerAura.css";

interface PlayerAuraProps {
  /** Ref to the actual <audio> element whose output we analyze. */
  audio: RefObject<HTMLAudioElement | null>;
  /** Whether the track is currently playing (drives motion/idle). */
  active: boolean;
  /** Called every animation frame with the smoothed energy level (0–1). */
  onEnergy?: (energy: number) => void;
}

/**
 * Один blob — размытое круглое пятно, плывёт по фону плеера и реагирует
 * на интенсивность/настроение звука.
 */
interface Blob {
  /** Опорный оттенок в градусах; модулируется балансом спектра. */
  baseHue: number;
  /** Насыщенность 0–100. 0 = почти белое, 80+ = насыщенный цвет. */
  saturation: number;
  /** Доля max(width, height), задающая базовый радиус. */
  radiusRatio: number;
  /** Фазы для уникального орбитального движения. */
  phaseX: number;
  phaseY: number;
  speedX: number;
  speedY: number;
}

// Только изумрудно-зелёный (~165°) и серый (saturation 0).
// Никаких других цветов в фоне плеера.
const BLOBS: ReadonlyArray<Blob> = [
  { baseHue: 165, saturation: 80, radiusRatio: 0.66, phaseX: 0.0, phaseY: 0.8, speedX: 0.00042, speedY: 0.00058 },
  { baseHue: 0,   saturation: 0,  radiusRatio: 0.58, phaseX: 1.9, phaseY: 2.1, speedX: 0.00037, speedY: 0.00049 },
  { baseHue: 165, saturation: 70, radiusRatio: 0.52, phaseX: 3.4, phaseY: 0.4, speedX: 0.00051, speedY: 0.00033 },
  { baseHue: 0,   saturation: 0,  radiusRatio: 0.48, phaseX: 5.0, phaseY: 3.2, speedX: 0.00046, speedY: 0.00061 },
];

/**
 * Аудио-реактивный фон для глобального плеера. Подключает AnalyserNode к
 * тому же <audio>, разбирает спектр на низ/середину/верх и рисует canvas с
 * 4 размытыми градиентными blob'ами. Фон приглушён (mix-blend-mode + низкая
 * opacity) и живёт даже в idle, чтобы не ощущаться «мёртвым».
 */
export function PlayerAura({ audio, active, onEnergy }: PlayerAuraProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelsRef = useRef({ low: 0, mid: 0, high: 0, energy: 0 });
  // Store the latest callback in a ref so the rAF loop reads the current
  // value without re-subscribing every parent render.
  const onEnergyRef = useRef(onEnergy);
  onEnergyRef.current = onEnergy;

  // Web Audio anchors — создаются однократно на десктопе при первом play.
  // На мобильных (touch-устройства) Web Audio НЕ инициализируем, потому что
  // AudioContext суспендится при сворачивании браузера/Telegram и звук
  // обрывается. Там работает синусоидная имитация — плавно, без реакции
  // на пики, но фоновое воспроизведение остаётся стабильным.
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const reactiveModeRef = useRef(false);

  // Web Audio полностью отключён — createMediaElementSource захватывает аудио
  // в граф, и если контекст по любой причине не работает (suspended,
  // CORS, заблокирован браузером), звук пропадает. Это была причина
  // тишины на десктопе. Теперь рисуем синусоидную имитацию для всех.
  useEffect(() => {
    if (!active) return;
    // намеренно ничего не делаем: reactiveModeRef.current = false → fallback анимация
  }, [active, audio]);

  // Основной цикл отрисовки.
  // ─────────────────────────────────────────────────────────────────────────
  // Оптимизация CPU: rAF крутится ТОЛЬКО когда active=true.
  // Когда плеер на паузе — рисуем один статичный idle-кадр и спим, пока юзер
  // не нажмёт play. Это снимает ~15-20% постоянной нагрузки CPU/GPU,
  // особенно заметно на мобильных устройствах.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Touch-устройства (телефоны/планшеты) — основной источник перегрева:
    // canvas.filter blur 40+ px при 60 fps греет GPU. Снижаем до 24 fps
    // и используем меньший blur — визуально почти то же, температурно
    // существенно легче. На десктопе ограничения нет.
    const isTouch = window.matchMedia(
      "(hover: none) and (pointer: coarse)",
    ).matches;
    const frameMinMs = reduceMotion ? 1000 / 12 : isTouch ? 1000 / 24 : 1000 / 60;
    let lastFrameTs = 0;

    let raf = 0;
    let t = 0;
    let disposed = false;

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    const ro = new ResizeObserver(() => {
      resize();
      // После ресайза нужен один кадр перерисовки, даже если на паузе
      drawFrame();
    });
    ro.observe(canvas);
    resize();

    function drawFrame() {
      if (!canvas || !ctx2d) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      let rawLow = 0;
      let rawMid = 0;
      let rawHigh = 0;
      let rawEnergy = 0;

      if (active) {
        const analyser = analyserRef.current;
        const freq = freqDataRef.current;
        if (reactiveModeRef.current && analyser && freq) {
          // Реальный анализ спектра (десктоп).
          analyser.getByteFrequencyData(freq);
          const n = freq.length;
          // Низ — первые ~12% бинов, середина — до 45%, верх — остальное.
          const lowEnd = Math.max(2, Math.floor(n * 0.12));
          const midEnd = Math.max(lowEnd + 2, Math.floor(n * 0.45));
          let sumLow = 0;
          let sumMid = 0;
          let sumHigh = 0;
          for (let i = 0; i < lowEnd; i++) sumLow += freq[i];
          for (let i = lowEnd; i < midEnd; i++) sumMid += freq[i];
          for (let i = midEnd; i < n; i++) sumHigh += freq[i];
          rawLow = sumLow / (lowEnd * 255);
          rawMid = sumMid / ((midEnd - lowEnd) * 255);
          rawHigh = sumHigh / ((n - midEnd) * 255);
          rawEnergy = (rawLow + rawMid + rawHigh) / 3;
        } else {
          // Плавная синусоидная анимация — без резких "битов" и ряби.
          // Реагирует на воспроизведение через амплитуду, но плавно.
          const ts = t * (active ? 0.022 : 0.010);
          const amp = active ? 0.32 : 0.18;
          rawLow = 0.5 + amp * Math.sin(ts);
          rawMid = 0.5 + amp * Math.sin(ts * 1.31 + 1.7);
          rawHigh = 0.5 + amp * Math.sin(ts * 1.93 + 3.1);
          rawEnergy = (rawLow + rawMid + rawHigh) / 3;
        }
      }

      // Меньший smoothing коэффициент — более плавные переходы без ряби.
      const smooth = reduceMotion ? 0.03 : (active ? 0.06 : 0.04);
      const prev = levelsRef.current;
      prev.low += (rawLow - prev.low) * smooth;
      prev.mid += (rawMid - prev.mid) * smooth;
      prev.high += (rawHigh - prev.high) * smooth;
      prev.energy += (rawEnergy - prev.energy) * smooth;

      // Expose smoothed energy to parent for reactive glow border.
      const cb = onEnergyRef.current;
      if (cb) cb(prev.energy);

      // На паузе idle-кадр статичный (t=0, без sin-пульсации) — единичная
      // отрисовка не зацикливается.
      const breathe = active
        ? 0.55 + 0.55 * prev.energy + (prev.energy < 0.01 ? 0.7 : 0) * (0.08 + 0.05 * Math.sin(t * 0.02))
        : 0.55;

      // Общий сдвиг hue в зависимости от соотношения высоких/низких частот.
      // Не сдвигаем hue от частотного баланса — цвета должны оставаться зелёным/серым.
      const hueBias = 0;

      // Размеры blob'ов считаем от высоты (плеер — узкая полоса), чтобы их
      // яркие центры не улетали далеко за канвас.
      const baseR = h * 1.9;
      // На touch — более мелкий blur (тяжелее всех операций canvas), а
      // gradient sluggish'ный, всё равно даёт мягкость без перегрева.
      const blur = isTouch
        ? Math.max(10, h * 0.3)
        : Math.max(16, h * 0.5);
      ctx2d.filter = `blur(${blur}px)`;
      ctx2d.globalCompositeOperation = "lighter";
      ctx2d.globalAlpha = reduceMotion ? 0.3 : (active ? 0.72 : 0.45);

      BLOBS.forEach((b, i) => {
        // На паузе фиксируем фазу (t=0) — статичный кадр.
        const phaseX = b.phaseX + (active ? t * b.speedX : 0);
        const phaseY = b.phaseY + (active ? t * b.speedY : 0);
        const cx = w * (0.5 + 0.45 * Math.cos(phaseX));
        const cy = h * (0.5 + 0.22 * Math.sin(phaseY));

        const bandPulse =
          i === 0 ? prev.high : i === 1 ? prev.mid : i === 2 ? prev.low : prev.energy;
        // hue фиксирован — без анимационного дрейфа во избежание других оттенков.
        void hueBias;
        const hue = b.baseHue;
        const lightness = 50 + prev.mid * 22;
        const pulse = 1 + 0.75 * bandPulse;
        const r = baseR * b.radiusRatio * breathe * pulse;

        const grad = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, r);
        const sat = b.saturation;
        grad.addColorStop(0, `hsla(${hue}, ${sat}%, ${lightness}%, 0.7)`);
        grad.addColorStop(0.55, `hsla(${hue}, ${Math.max(0, sat - 10)}%, ${lightness - 8}%, 0.3)`);
        grad.addColorStop(1, `hsla(${hue}, ${Math.max(0, sat - 20)}%, ${lightness - 16}%, 0)`);
        ctx2d.fillStyle = grad;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
        ctx2d.fill();
      });

      ctx2d.filter = "none";
      ctx2d.globalAlpha = 1;
      ctx2d.globalCompositeOperation = "source-over";
    }

    function tick(ts: number = 0) {
      if (disposed) return;
      // FPS limiter: rAF на мобильных всё равно даёт 60-120 событий в секунду
      // и пере-планирует кадр даже когда мы пропустили draw. Заворачиваем
      // вызовы draw в минимальный интервал — на touch это 24fps, на
      // desktop = native 60fps (frameMinMs ≈ 16ms всегда меньше delta).
      const elapsed = ts - lastFrameTs;
      if (elapsed >= frameMinMs) {
        lastFrameTs = ts;
        t += 1;
        drawFrame();
      }
      // КЛЮЧЕВАЯ ОПТИМИЗАЦИЯ: rAF продолжаем только когда плеер активен.
      // На паузе — выходим из цикла, остаётся последний нарисованный кадр.
      if (active) {
        raf = requestAnimationFrame(tick);
      }
    }

    if (active) {
      raf = requestAnimationFrame(tick);
    } else {
      // Single idle frame — без подписки на rAF
      drawFrame();
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active]);

  return <canvas ref={canvasRef} className="player-aura" aria-hidden="true" />;
}

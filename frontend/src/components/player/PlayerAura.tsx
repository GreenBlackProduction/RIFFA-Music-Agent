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
  /** Доля max(width, height), задающая базовый радиус. */
  radiusRatio: number;
  /** Фазы для уникального орбитального движения. */
  phaseX: number;
  phaseY: number;
  speedX: number;
  speedY: number;
}

const BLOBS: ReadonlyArray<Blob> = [
  { baseHue: 95,  radiusRatio: 0.68, phaseX: 0.0, phaseY: 0.8, speedX: 0.00042, speedY: 0.00058 },
  { baseHue: 22,  radiusRatio: 0.58, phaseX: 1.9, phaseY: 2.1, speedX: 0.00037, speedY: 0.00049 },
  { baseHue: 295, radiusRatio: 0.62, phaseX: 3.4, phaseY: 0.4, speedX: 0.00051, speedY: 0.00033 },
  { baseHue: 200, radiusRatio: 0.52, phaseX: 5.0, phaseY: 3.2, speedX: 0.00046, speedY: 0.00061 },
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const sourceConnectedRef = useRef(false);
  const reactiveModeRef = useRef(false);

  // Инициализация Web Audio API — только для десктопа.
  // Подключается лениво при первом active=true (нужен user gesture для
  // resume AudioContext).
  useEffect(() => {
    if (!active) return;
    const el = audio.current;
    if (!el) return;

    // Десктоп определяем по комбинации pointer и отсутствию touch.
    // На iPad с подключённой мышкой это всё равно даст "fine + ontouchstart" —
    // лучше быть консервативными и не ломать фон на гибридных устройствах.
    const isDesktop =
      window.matchMedia("(pointer: fine)").matches &&
      !("ontouchstart" in window) &&
      navigator.maxTouchPoints === 0;
    if (!isDesktop) return;
    if (sourceConnectedRef.current) {
      // Уже подключали для этого <audio> — переиспользуем существующий граф.
      reactiveModeRef.current = true;
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === "suspended") {
        void ctx.resume();
      }
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();

      // Если AudioContext создался в suspended-состоянии (это бывает, когда
      // useEffect запускается вне прямого user gesture), пытаемся его
      // возобновить. Если resume не удался — НЕ захватываем аудиоэлемент,
      // иначе звук пропадёт (audio уйдёт в граф, но граф заморожен).
      const connect = () => {
        const source = ctx.createMediaElementSource(el);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.78;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        freqDataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        sourceConnectedRef.current = true;
        reactiveModeRef.current = true;
      };

      const connectAndWatch = () => {
        connect();
        // Если браузер суспендит контекст mid-play (фоновая вкладка, экран выключен) —
        // автоматически возобновляем, иначе звук пропадёт (audio захвачен графом).
        ctx.addEventListener("statechange", () => {
          if (ctx.state === "suspended") void ctx.resume();
        });
      };

      if (ctx.state === "running") {
        connectAndWatch();
      } else {
        ctx.resume().then(() => {
          if (ctx.state === "running") {
            connectAndWatch();
          } else {
            ctx.close();
          }
        }).catch(() => ctx.close());
      }
    } catch (err) {
      console.warn("[PlayerAura] Web Audio unavailable, falling back to idle animation:", err);
      reactiveModeRef.current = false;
    }
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
          // Синусоидная имитация (мобильные / fallback).
          const ts = t * 0.018;
          rawLow = 0.5 + 0.3 * Math.sin(ts);
          rawMid = 0.5 + 0.3 * Math.sin(ts * 1.31 + 1.7);
          rawHigh = 0.5 + 0.3 * Math.sin(ts * 1.93 + 3.1);
          rawEnergy = (rawLow + rawMid + rawHigh) / 3;
        }
      }

      const smooth = reduceMotion ? 0.04 : (active ? 0.28 : 0.12);
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
      const hueBias = (prev.high - prev.low) * 90;

      // Размеры blob'ов считаем от высоты (плеер — узкая полоса), чтобы их
      // яркие центры не улетали далеко за канвас.
      const baseR = h * 1.9;
      const blur = Math.max(16, h * 0.5);
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
        const hue = (b.baseHue + hueBias + (active ? t * 0.04 : 0)) % 360;
        const lightness = 50 + prev.mid * 22;
        const pulse = 1 + 0.75 * bandPulse;
        const r = baseR * b.radiusRatio * breathe * pulse;

        const grad = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `hsla(${hue}, 92%, ${lightness}%, 0.95)`);
        grad.addColorStop(0.55, `hsla(${hue}, 78%, ${lightness - 8}%, 0.4)`);
        grad.addColorStop(1, `hsla(${hue}, 70%, ${lightness - 16}%, 0)`);
        ctx2d.fillStyle = grad;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
        ctx2d.fill();
      });

      ctx2d.filter = "none";
      ctx2d.globalAlpha = 1;
      ctx2d.globalCompositeOperation = "source-over";
    }

    function tick() {
      if (disposed) return;
      t += 1;
      drawFrame();
      // КЛЮЧЕВАЯ ОПТИМИЗАЦИЯ: rAF продолжаем только когда плеер активен.
      // На паузе — выходим из цикла, остаётся последний нарисованный кадр.
      if (active) {
        raf = requestAnimationFrame(tick);
      }
    }

    if (active) {
      tick();
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

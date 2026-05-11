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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const levelsRef = useRef({ low: 0, mid: 0, high: 0, energy: 0 });

  // Инициализация AudioContext + Analyser (один раз на <audio>).
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    if (audioCtxRef.current) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;

    let ctx: AudioContext;
    try {
      ctx = new AC();
    } catch {
      return;
    }

    try {
      const source = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      freqRef.current = new Uint8Array(
        new ArrayBuffer(analyser.frequencyBinCount),
      );
    } catch {
      // createMediaElementSource кидает, если узел уже был создан для этого
      // <audio>. Закрываем временный контекст и идём в idle-режим.
      ctx.close().catch(() => undefined);
    }
  }, [audio]);

  // Resume на старте воспроизведения (браузер требует user gesture).
  useEffect(() => {
    if (!active) return;
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => undefined);
    }
  }, [active]);

  // Основной цикл отрисовки.
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

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    function tick() {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      t += 1;

      if (!canvas || !ctx2d) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      const analyser = analyserRef.current;
      const buf = freqRef.current;
      let rawLow = 0;
      let rawMid = 0;
      let rawHigh = 0;
      let rawEnergy = 0;

      if (active && analyser && buf) {
        analyser.getByteFrequencyData(buf);
        const n = buf.length;
        const lowEnd = Math.floor(n * 0.14);
        const midEnd = Math.floor(n * 0.55);
        let sumLow = 0;
        let sumMid = 0;
        let sumHigh = 0;
        for (let i = 0; i < n; i++) {
          const v = buf[i];
          if (i < lowEnd) sumLow += v;
          else if (i < midEnd) sumMid += v;
          else sumHigh += v;
          rawEnergy += v;
        }
        rawLow = sumLow / Math.max(1, lowEnd * 255);
        rawMid = sumMid / Math.max(1, (midEnd - lowEnd) * 255);
        rawHigh = sumHigh / Math.max(1, (n - midEnd) * 255);
        rawEnergy /= Math.max(1, n * 255);
      }

      const smooth = reduceMotion ? 0.04 : (active ? 0.28 : 0.12);
      const prev = levelsRef.current;
      prev.low += (rawLow - prev.low) * smooth;
      prev.mid += (rawMid - prev.mid) * smooth;
      prev.high += (rawHigh - prev.high) * smooth;
      prev.energy += (rawEnergy - prev.energy) * smooth;

      // Expose smoothed energy to parent for reactive glow border.
      if (onEnergy) onEnergy(prev.energy);

      // Ненавязчивая «жизнь» даже без аудио-данных (пауза или CORS-тайнинг).
      const noSignal = prev.energy < 0.01;
      const idleAmp = !active ? 1 : noSignal ? 0.7 : 0;
      const idlePulse = idleAmp * (0.08 + 0.05 * Math.sin(t * 0.02));
      const breathe = 0.55 + 0.55 * prev.energy + idlePulse;

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
        const phaseX = b.phaseX + t * b.speedX;
        const phaseY = b.phaseY + t * b.speedY;
        const cx = w * (0.5 + 0.45 * Math.cos(phaseX));
        const cy = h * (0.5 + 0.22 * Math.sin(phaseY));

        // Разные blob'ы реагируют преимущественно на свой диапазон, чтобы
        // «настроение» читалось глазом.
        const bandPulse =
          i === 0
            ? prev.high
            : i === 1
              ? prev.mid
              : i === 2
                ? prev.low
                : prev.energy;

        const hue = (b.baseHue + hueBias + t * 0.04) % 360;
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

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active]);

  return <canvas ref={canvasRef} className="player-aura" aria-hidden="true" />;
}

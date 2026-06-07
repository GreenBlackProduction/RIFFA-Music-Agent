import { useEffect, useRef, type RefObject } from "react";

import "./PlayerAura.css";

interface PlayerAuraProps {
  /** Ref to the actual <audio> element whose output we (optionally) analyze. */
  audio: RefObject<HTMLAudioElement | null>;
  /** Whether the track is currently playing (drives motion/idle). */
  active: boolean;
}

/**
 * Soft "bubbles" background for the global player.
 *
 * Rendering strategy (why this is cheap and runs cool):
 *   • Each blob is a real DOM <div> with a baked `filter: blur()`. The blur is
 *     rasterised ONCE per layer by the compositor — NOT every frame.
 *   • The animation loop only writes `transform` and `opacity`, the two
 *     properties the compositor can animate on the GPU WITHOUT repaint /
 *     re-rasterisation. No per-frame canvas blur (the old implementation's
 *     `ctx.filter = blur()` every frame was the device-overheating culprit).
 *
 * Audio reactivity:
 *   • Desktop + same-origin audio → real spectrum via an AnalyserNode.
 *   • Touch devices → NO Web Audio at all. Their AudioContext suspends when the
 *     browser/Telegram is backgrounded and would KILL background playback, which
 *     is exactly what we must protect. They get a smooth sine fallback instead.
 */

interface BlobDef {
  /** Inner colour of the radial gradient. */
  color: string;
  /** Base anchor across the player, 0..1. */
  x: number;
  y: number;
  /** Diameter as a multiple of the player height (it's a short, wide bar). */
  size: number;
  /** Orbit amplitudes as a fraction of width/height. */
  ampX: number;
  ampY: number;
  /** Orbit speeds and phases for unique drift. */
  spX: number;
  spY: number;
  phX: number;
  phY: number;
  /** Which energy band scales this blob: 0 low · 1 mid · 2 high · 3 overall. */
  band: 0 | 1 | 2 | 3;
}

// Only emerald (~160°) and neutral grey — no other hues in the player.
const EMERALD = "rgba(18, 205, 130, 0.60)";
const EMERALD_SOFT = "rgba(20, 170, 115, 0.52)";
const GREY = "rgba(200, 206, 212, 0.30)";

const BLOBS: ReadonlyArray<BlobDef> = [
  { color: EMERALD,      x: 0.20, y: 0.50, size: 2.3, ampX: 0.10, ampY: 0.20, spX: 0.00040, spY: 0.00057, phX: 0.0, phY: 0.8, band: 0 },
  { color: GREY,         x: 0.46, y: 0.44, size: 2.0, ampX: 0.12, ampY: 0.17, spX: 0.00035, spY: 0.00048, phX: 1.9, phY: 2.1, band: 1 },
  { color: EMERALD_SOFT, x: 0.72, y: 0.56, size: 1.8, ampX: 0.11, ampY: 0.22, spX: 0.00050, spY: 0.00032, phX: 3.4, phY: 0.4, band: 2 },
  { color: GREY,         x: 0.90, y: 0.48, size: 1.6, ampX: 0.13, ampY: 0.16, spX: 0.00045, spY: 0.00060, phX: 5.0, phY: 3.2, band: 3 },
];

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function PlayerAura({ audio, active }: PlayerAuraProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const blobRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Smoothed energy bands, 0..1.
  const levelsRef = useRef({ low: 0, mid: 0, high: 0, energy: 0 });

  // Web Audio anchors — created once, desktop + same-origin only. createMedia-
  // ElementSource can only be called once per element, and the element persists
  // for the player's lifetime, so the graph survives across track changes (all
  // our stream URLs are same-origin proxies → never tainted).
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const reactiveRef = useRef(false);
  const triedSetupRef = useRef(false);

  const isTouch = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches,
  );

  // Lazily wire the analyser on desktop once we're actually playing a
  // same-origin source. Fully guarded: any failure → sine fallback, and we
  // never touch playback on touch devices.
  useEffect(() => {
    if (!active || isTouch.current || triedSetupRef.current) return;
    const el = audio.current;
    if (!el) return;
    const src = el.currentSrc || el.src;
    if (!src || !isSameOrigin(src)) return; // skip cross-origin → no taint risk
    triedSetupRef.current = true;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      // source → analyser → destination: audio keeps flowing to the speakers
      // AND the analyser taps it. Skipping the destination link would mute it.
      source.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      freqRef.current = new Uint8Array(analyser.frequencyBinCount);
      reactiveRef.current = true;
    } catch {
      // Web Audio unavailable / blocked → smooth sine fallback. Playback is
      // unaffected because we never rerouted the element on failure.
      reactiveRef.current = false;
    }
  }, [active, audio]);

  // Resume a suspended context when playback starts (autoplay-policy parks it
  // until a gesture). Best-effort.
  useEffect(() => {
    if (active && ctxRef.current?.state === "suspended") {
      ctxRef.current.resume().catch(() => undefined);
    }
  }, [active]);

  // Animation loop — runs ONLY while playing. On pause we render one idle frame
  // and stop the rAF entirely (no idle CPU/GPU drain).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // Touch devices stay at 30 fps (blobs are slow — visually smooth, far
    // cooler). Desktop runs 60 fps so real beats read crisply.
    const frameMinMs = reduceMotion ? 1000 / 12 : isTouch.current ? 1000 / 30 : 1000 / 60;

    let raf = 0;
    let t = 0;
    let lastTs = 0;
    let disposed = false;
    let W = root.clientWidth || 1;
    let H = root.clientHeight || 1;

    const ro = new ResizeObserver(() => {
      W = root.clientWidth || 1;
      H = root.clientHeight || 1;
      // Size each blob from the (new) height — they're circles sized to the bar.
      BLOBS.forEach((b, i) => {
        const el = blobRefs.current[i];
        if (!el) return;
        const d = Math.round(H * b.size);
        el.style.width = `${d}px`;
        el.style.height = `${d}px`;
      });
      draw();
    });
    ro.observe(root);

    function readEnergy() {
      let low = 0;
      let mid = 0;
      let high = 0;
      if (active && reactiveRef.current && analyserRef.current && freqRef.current) {
        const analyser = analyserRef.current;
        const freq = freqRef.current;
        analyser.getByteFrequencyData(freq);
        const n = freq.length;
        const lowEnd = Math.max(2, Math.floor(n * 0.18));
        const midEnd = Math.max(lowEnd + 2, Math.floor(n * 0.5));
        let sl = 0;
        let sm = 0;
        let sh = 0;
        for (let i = 0; i < lowEnd; i++) sl += freq[i];
        for (let i = lowEnd; i < midEnd; i++) sm += freq[i];
        for (let i = midEnd; i < n; i++) sh += freq[i];
        low = sl / (lowEnd * 255);
        mid = sm / ((midEnd - lowEnd) * 255);
        high = sh / ((n - midEnd) * 255);
      } else if (active) {
        // Smooth sine imitation — moves with playback, no real beats.
        const ts = t * 0.03;
        low = 0.5 + 0.32 * Math.sin(ts);
        mid = 0.5 + 0.32 * Math.sin(ts * 1.31 + 1.7);
        high = 0.5 + 0.32 * Math.sin(ts * 1.93 + 3.1);
      }
      const energy = (low + mid + high) / 3;
      const smooth = reduceMotion ? 0.04 : active ? 0.12 : 0.06;
      const p = levelsRef.current;
      p.low += (low - p.low) * smooth;
      p.mid += (mid - p.mid) * smooth;
      p.high += (high - p.high) * smooth;
      p.energy += (energy - p.energy) * smooth;
      return p;
    }

    function draw() {
      const p = readEnergy();
      const base = reduceMotion ? 0.30 : active ? 0.52 : 0.34;
      BLOBS.forEach((b, i) => {
        const el = blobRefs.current[i];
        if (!el) return;
        const phX = b.phX + (active ? t * b.spX : 0);
        const phY = b.phY + (active ? t * b.spY : 0);
        const cx = (b.x + b.ampX * Math.cos(phX)) * W;
        const cy = (b.y + b.ampY * Math.sin(phY)) * H;
        const bandE = b.band === 0 ? p.low : b.band === 1 ? p.mid : b.band === 2 ? p.high : p.energy;
        const scale = 1 + (active ? 0.55 * bandE : 0);
        // translate(-50%,-50%) centres the blob on (cx,cy).
        el.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        el.style.opacity = (base * (0.7 + 0.6 * bandE)).toFixed(3);
      });
    }

    function tick(ts: number) {
      if (disposed) return;
      if (ts - lastTs >= frameMinMs) {
        lastTs = ts;
        t += 1;
        draw();
      }
      if (active) raf = requestAnimationFrame(tick);
    }

    // Apply sizes once on mount, then start/idle.
    BLOBS.forEach((b, i) => {
      const el = blobRefs.current[i];
      if (!el) return;
      const d = Math.round(H * b.size);
      el.style.width = `${d}px`;
      el.style.height = `${d}px`;
    });

    if (active) {
      raf = requestAnimationFrame(tick);
    } else {
      draw();
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active]);

  return (
    <div ref={rootRef} className="player-aura" aria-hidden="true">
      {BLOBS.map((b, i) => (
        <div
          key={i}
          ref={(el) => {
            blobRefs.current[i] = el;
          }}
          className="aura-blob"
          style={{
            background: `radial-gradient(circle at center, ${b.color} 0%, ${b.color.replace(/[\d.]+\)$/, "0.18)")} 45%, rgba(0,0,0,0) 72%)`,
          }}
        />
      ))}
    </div>
  );
}

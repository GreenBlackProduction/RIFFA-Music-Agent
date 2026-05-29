import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./VoiceRecorder.css";

interface VoiceRecorderProps {
  isRecording: boolean;
  recordingTime: number;
  onStop: () => void;
  onCancel: () => void;
}

export function VoiceRecorder({ isRecording, recordingTime, onStop, onCancel }: VoiceRecorderProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [analyserReady, setAnalyserReady] = useState(false);

  useEffect(() => {
    if (!isRecording) {
      setAnalyserReady(false);
      return;
    }

    let cancelled = false;
    const initAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        analyserRef.current = analyser;
        audioContextRef.current = ctx;
        streamRef.current = stream;
        setAnalyserReady(true);
      } catch (err) {
        console.error("Failed to initialize audio:", err);
      }
    };

    initAudio();

    return () => {
      cancelled = true;
      const ctx = audioContextRef.current;
      if (ctx) {
        ctx.close().catch(() => undefined);
        audioContextRef.current = null;
      }
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      analyserRef.current = null;
      setAnalyserReady(false);
    };
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording || !analyserReady || !analyserRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = "rgba(10, 10, 18, 0.3)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, "rgba(124, 255, 31, 0.8)");
        gradient.addColorStop(0.5, "rgba(255, 90, 0, 0.6)");
        gradient.addColorStop(1, "rgba(15, 93, 71, 0.4)");

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRecording, analyserReady]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isRecording) return null;

  return createPortal(
    <div className="voice-recorder-backdrop" onClick={onCancel}>
      <div className="voice-recorder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="voice-recorder-header">
          <div className="voice-recorder-status">
            <span className="voice-recorder-pulse" />
            <span>{t("voiceRecorder.recording")}</span>
          </div>
          <button
            type="button"
            className="voice-recorder-close"
            onClick={onCancel}
            aria-label={t("voiceRecorder.cancelAria")}
          >
            ×
          </button>
        </div>

        <canvas
          ref={canvasRef}
          className="voice-recorder-canvas"
          width={400}
          height={120}
        />

        <div className="voice-recorder-time">{formatTime(recordingTime)}</div>

        <div className="voice-recorder-actions">
          <button
            type="button"
            className="voice-recorder-btn voice-recorder-btn--cancel"
            onClick={onCancel}
          >
            {t("voiceRecorder.cancel")}
          </button>
          <button
            type="button"
            className="voice-recorder-btn voice-recorder-btn--stop"
            onClick={onStop}
          >
            {t("voiceRecorder.stopSave")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

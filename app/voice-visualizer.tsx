"use client";

import { useEffect, useRef } from "react";

const BAR_COUNT = 24;

/**
 * Live mic visualizer shown over the composer while voice input is recording.
 * Opens its own getUserMedia stream + AnalyserNode (the SpeechRecognition API
 * doesn't expose audio), reads the frequency spectrum each frame, and drives the
 * bars via transform: scaleY (GPU-friendly, no layout). Renders nothing when
 * inactive or if the mic is unavailable — recognition still works either way.
 *
 * ponytail: a second mic stream alongside SpeechRecognition. Fine on desktop; if
 * a browser refuses the concurrent stream the catch just skips the bars.
 */
export function VoiceVisualizer({ active }: { active: boolean }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) return;

    let raf = 0;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return;
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtx = new Ctx();
        if (audioCtx.state === "suspended") await audioCtx.resume();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64; // 32 frequency bins; we use the lower (voice) range
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const draw = () => {
          analyser.getByteFrequencyData(data);
          const bars = barsRef.current;
          for (let i = 0; i < bars.length; i++) {
            const bar = bars[i];
            if (!bar) continue;
            const scale = 0.08 + (data[i] / 255) * 0.92;
            bar.style.transform = `scaleY(${scale})`;
          }
          raf = requestAnimationFrame(draw);
        };
        draw();
      } catch {
        // Mic unavailable / concurrent-stream refused — skip the bars silently.
      }
    }
    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
      void audioCtx?.close().catch(() => {});
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="voice-visualizer" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}

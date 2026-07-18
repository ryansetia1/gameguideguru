"use client";

const BAR_COUNT = 24;

/**
 * Decorative mic bars over the composer while voice input runs. CSS-only —
 * SpeechRecognition must own the mic alone; a concurrent getUserMedia stream for
 * live levels blocks recognition on desktop and mobile.
 */
export function VoiceVisualizer({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="voice-visualizer" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <span key={i} style={{ animationDelay: `${(i % 8) * 0.08}s` }} />
      ))}
    </div>
  );
}

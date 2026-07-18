"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import { getSupabase } from "@/lib/supabase";
import {
  getSpeechRecognition,
  loadVoiceLang,
  saveVoiceLang,
  VOICE_LANGUAGES,
  voiceLangFromUserMetadata,
} from "@/lib/voice.js";
import { IconMic, IconStop } from "./icons";

type VoiceInputOptions = {
  user: User | null;
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
};

async function persistVoiceLangForUser(code: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.auth.updateUser({ data: { voice_lang: code || null } });
  } catch (error) {
    console.error("Failed to save voice language:", error);
  }
}

/**
 * Shared Web Speech dictation state for the standalone mic button and the
 * mobile combined composer-extras menu.
 *
 * ponytail: final-result only (interimResults/continuous off) for stability
 * across devices — iOS Safari drops interim results.
 */
export function useVoiceInput({
  user,
  disabled,
  onTranscript,
  onListeningChange,
}: VoiceInputOptions) {
  const [supported, setSupported] = useState(false);
  const [lang, setLang] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    onListeningChange?.(listening);
  }, [listening, onListeningChange]);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognition()));
    setLang(loadVoiceLang());
  }, []);

  useEffect(() => {
    if (!user) return;
    const remote = voiceLangFromUserMetadata(user.user_metadata);
    if (remote) {
      setLang(remote);
      saveVoiceLang(remote);
    }
  }, [user]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // already stopped
      }
    };
  }, []);

  function start(code: string) {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition || !code || disabled) return;
    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }
    const recognition = new SpeechRecognition();
    recognition.lang = code;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (typeof transcript === "string" && transcript.trim()) {
        onTranscript(transcript.trim());
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  function stop() {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setListening(false);
  }

  function pickLanguage(code: string) {
    setLang(code);
    saveVoiceLang(code);
    if (user) void persistVoiceLangForUser(code);
    setPickerOpen(false);
    start(code);
  }

  function handleClick() {
    if (listening) {
      stop();
      return;
    }
    if (!lang) {
      setPickerOpen((open) => !open);
      return;
    }
    start(lang);
  }

  return {
    supported,
    lang,
    listening,
    pickerOpen,
    setPickerOpen,
    start,
    stop,
    handleClick,
    pickLanguage,
  };
}

type Props = VoiceInputOptions;

/**
 * Mic button (Web Speech API). Free browser dictation; permission prompts only
 * on click. Hidden when the browser lacks SpeechRecognition (e.g. Firefox).
 */
export function VoiceInput({ user, disabled, onTranscript, onListeningChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { supported, lang, listening, pickerOpen, setPickerOpen, handleClick, pickLanguage } =
    useVoiceInput({ user, disabled, onTranscript, onListeningChange });

  useEffect(() => {
    if (!pickerOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pickerOpen, setPickerOpen]);

  if (!supported) return null;

  return (
    <div className="composer-attach-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`composer-attach composer-mic${listening ? " listening" : ""}`}
        title={listening ? "Stop listening" : "Voice input"}
        aria-label={listening ? "Stop listening" : "Voice input"}
        aria-expanded={pickerOpen}
        aria-haspopup={lang ? undefined : "menu"}
        disabled={disabled}
        onClick={handleClick}
      >
        {listening ? <IconStop /> : <IconMic />}
      </button>
      {pickerOpen && (
        <div className="composer-attach-menu composer-lang-menu" role="menu">
          {VOICE_LANGUAGES.map((entry) => (
            <button
              key={entry.code}
              type="button"
              role="menuitem"
              onClick={() => pickLanguage(entry.code)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

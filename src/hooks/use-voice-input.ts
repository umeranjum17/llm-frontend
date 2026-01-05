"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

export function useVoiceInput(options?: { lang?: string }) {
  const recognitionCtor = useMemo(() => getSpeechRecognitionCtor(), []);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [isSupported, setIsSupported] = useState<boolean>(!!recognitionCtor);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsSupported(!!recognitionCtor);
  }, [recognitionCtor]);

  const start = useCallback(() => {
    setError(null);
    setTranscript("");

    if (!recognitionCtor) {
      setIsSupported(false);
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new recognitionCtor();
    recognition.lang = options?.lang || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result?.[0]?.transcript;
        if (typeof text === "string") parts.push(text);
      }
      setTranscript(parts.join(" ").trim());
    };

    recognition.onerror = (event: any) => {
      setError(event?.error || "Speech recognition error");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, [recognitionCtor, options?.lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  return { isSupported, isListening, transcript, error, start, stop };
}


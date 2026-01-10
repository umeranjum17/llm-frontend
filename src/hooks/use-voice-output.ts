"use client";

import { useState, useCallback, useEffect } from "react";

export function useVoiceOutput() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [utterance, setUtterance] = useState<SpeechSynthesisUtterance | null>(null);

    const stop = useCallback(() => {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            setIsPlaying(false);
        }
    }, []);

    const speak = useCallback((text: string) => {
        if (!window.speechSynthesis) return;

        // Stop current speech if any
        stop();

        const newUtterance = new SpeechSynthesisUtterance(text);

        newUtterance.onstart = () => setIsPlaying(true);
        newUtterance.onend = () => setIsPlaying(false);
        newUtterance.onerror = () => setIsPlaying(false);

        // Try to find a good voice (optional, but nice)
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang.startsWith("en") && v.name.includes("Google")) || voices[0];
        if (preferredVoice) {
            newUtterance.voice = preferredVoice;
        }

        setUtterance(newUtterance);
        window.speechSynthesis.speak(newUtterance);
    }, [stop]);

    useEffect(() => {
        return () => {
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    return {
        speak,
        stop,
        isPlaying,
    };
}

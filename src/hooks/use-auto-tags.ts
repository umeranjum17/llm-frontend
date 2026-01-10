import { useRef, useEffect } from "react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import type { Message } from "ai";
import { generateAndApplyTags } from "@/lib/ai/auto-tagging";

export function useAutoTags(
    chatId: string,
    messages: Message[],
    tags: string[] = [],
    enabled: boolean = true
) {
    const generatedRef = useRef(false);
    const keys = useApiKeysStore((s) => s.keys);

    useEffect(() => {
        // Conditions to trigger auto-tagging:
        // 1. Enabled
        // 2. Not already generated this session (ref)
        // 3. No existing tags (we only auto-tag new conversations)
        // 4. Sufficient message history (at least 3 messages)
        if (
            !enabled ||
            generatedRef.current ||
            (tags && tags.length > 0) ||
            messages.length < 3
        ) {
            return;
        }

        const runAutoTagging = async () => {
            console.log("[AutoTags] potentially triggering...");
            generatedRef.current = true; // Mark as started to prevent duplicates
            await generateAndApplyTags({ chatId, messages, keys });
        };

        // Debounce slightly to ensure we don't trigger mid-stream too early
        const timer = setTimeout(runAutoTagging, 2000);
        return () => clearTimeout(timer);
    }, [chatId, messages.length, tags, enabled, keys]);
}

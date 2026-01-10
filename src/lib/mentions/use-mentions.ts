
import { useState, useCallback, useEffect } from "react";
import Fuse from "fuse.js";
import { MentionItem, MentionType } from "./types";

interface UseMentionsProps {
    items: MentionItem[];
    triggerChars?: string[];
}

export function useMentions({ items, triggerChars = ["@", "#", "/"] }: UseMentionsProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [filteredItems, setFilteredItems] = useState<MentionItem[]>([]);
    const [triggerChar, setTriggerChar] = useState<string | null>(null);

    const fuse = new Fuse(items, {
        keys: ["label", "value", "description", "type"],
        threshold: 0.3,
    });

    useEffect(() => {
        if (!query) {
            setFilteredItems(items.slice(0, 10)); // Show top 10 by default
            return;
        }

        const results = fuse.search(query);
        setFilteredItems(results.map((r) => r.item).slice(0, 10));
        setActiveIndex(0);
    }, [query, items]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent, onSelect: (item: MentionItem) => void) => {
            if (!isOpen) return false;

            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setActiveIndex((prev) => (prev + 1) % filteredItems.length);
                    return true;
                case "ArrowUp":
                    e.preventDefault();
                    setActiveIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
                    return true;
                case "Enter":
                case "Tab":
                    e.preventDefault();
                    if (filteredItems[activeIndex]) {
                        onSelect(filteredItems[activeIndex]);
                    }
                    return true;
                case "Escape":
                    e.preventDefault();
                    setIsOpen(false);
                    return true;
            }

            return false;
        },
        [isOpen, filteredItems, activeIndex]
    );

    return {
        isOpen,
        setIsOpen,
        query,
        setQuery,
        activeIndex,
        setActiveIndex,
        filteredItems,
        triggerChar,
        setTriggerChar,
        handleKeyDown,
    };
}

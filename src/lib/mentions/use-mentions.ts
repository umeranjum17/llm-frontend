
import { useState, useCallback, useEffect, useMemo } from "react";
import Fuse from "fuse.js";
import { MentionItem, MentionType, TriggerChar } from "./types";

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

    // Filter items by trigger character first
    const itemsForTrigger = useMemo(() => {
        if (!triggerChar) return items;
        return items.filter(item => {
            // Default trigger is "@" if not specified
            const itemTrigger = item.trigger || "@";
            return itemTrigger === triggerChar;
        });
    }, [items, triggerChar]);

    const fuse = useMemo(() => new Fuse(itemsForTrigger, {
        keys: ["label", "value", "description", "type"],
        threshold: 0.3,
    }), [itemsForTrigger]);

    useEffect(() => {
        if (!query) {
            setFilteredItems(itemsForTrigger.slice(0, 10)); // Show top 10 by default
            return;
        }

        const results = fuse.search(query);
        setFilteredItems(results.map((r) => r.item).slice(0, 10));
        setActiveIndex(0);
    }, [query, itemsForTrigger, fuse]);

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

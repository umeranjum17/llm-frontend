"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getMessages } from "@/lib/db/queries";
import type { Message } from "@/lib/db/schema";
import { getTextFromMessageContent } from "@/lib/utils/message-content";

interface ChatSearchProps {
  chatId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

interface SearchMatch {
  messageId: string;
  messageIndex: number;
  text: string;
  matchStart: number;
}

export function ChatSearch({ chatId, isOpen, onClose }: ChatSearchProps) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setMatches([]);
      setCurrentMatchIndex(0);
    }
  }, [isOpen]);

  // Search messages when query changes
  useEffect(() => {
    if (!chatId || !query.trim()) {
      setMatches([]);
      setCurrentMatchIndex(0);
      return;
    }

    const search = async () => {
      const messages = await getMessages(chatId);
      const results: SearchMatch[] = [];
      const lowerQuery = query.toLowerCase();

      messages.forEach((msg: Message, index: number) => {
        const text = getTextFromMessageContent(msg.content);
        const lowerText = text.toLowerCase();
        let pos = 0;
        while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
          results.push({
            messageId: msg.id,
            messageIndex: index,
            text: text.slice(Math.max(0, pos - 20), pos + query.length + 20),
            matchStart: pos,
          });
          pos += 1;
        }
      });

      setMatches(results);
      setCurrentMatchIndex(0);

      // Scroll to first match
      if (results.length > 0) {
        scrollToMatch(results[0]);
      }
    };

    const timer = setTimeout(search, 200);
    return () => clearTimeout(timer);
  }, [chatId, query]);

  const scrollToMatch = useCallback((match: SearchMatch) => {
    const element = document.querySelector(`[data-message-id="${match.messageId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      // Briefly highlight
      element.classList.add("ring-2", "ring-primary/50");
      setTimeout(() => element.classList.remove("ring-2", "ring-primary/50"), 1500);
    }
  }, []);

  const goToMatch = useCallback((direction: "next" | "prev") => {
    if (matches.length === 0) return;
    const newIndex = direction === "next"
      ? (currentMatchIndex + 1) % matches.length
      : (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(newIndex);
    scrollToMatch(matches[newIndex]);
  }, [matches, currentMatchIndex, scrollToMatch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      goToMatch(e.shiftKey ? "prev" : "next");
    }
  }, [onClose, goToMatch]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
          className="absolute top-2 right-4 z-50 flex items-center gap-1.5 rounded-lg border bg-background/95 backdrop-blur px-3 py-1.5 shadow-lg"
        >
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search messages..."
            className="h-7 w-48 text-sm border-0 bg-transparent focus-visible:ring-0 px-1"
          />
          {matches.length > 0 && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {currentMatchIndex + 1}/{matches.length}
            </span>
          )}
          {query && matches.length === 0 && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              No results
            </span>
          )}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => goToMatch("prev")}
              disabled={matches.length === 0}
              aria-label="Previous match"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => goToMatch("next")}
              disabled={matches.length === 0}
              aria-label="Next match"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClose}
              aria-label="Close search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

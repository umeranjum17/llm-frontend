import { useMemo, useState, useEffect } from "react";
import Fuse from "fuse.js";
import type { Chat } from "@/lib/db/schema";
import { searchMessages } from "@/lib/db/queries";

export function useChatSearch(chats: Chat[], searchQuery: string) {
  const [messageMatchIds, setMessageMatchIds] = useState<Set<string>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isSearching, setIsSearching] = useState(false);

  // Configure Fuse.js for fuzzy search on Titles
  const fuse = useMemo(() => {
    return new Fuse(chats, {
      keys: ["title", "modelId"],
      threshold: 0.3, // Lower = more strict matching
      includeScore: true,
      minMatchCharLength: 2,
    });
  }, [chats]);

  // Async search for message content
  useEffect(() => {
    if (!searchQuery.trim()) {
      setMessageMatchIds(new Set());
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const messages = await searchMessages(searchQuery);
        const chatIds = new Set(messages.map((m) => m.chatId));
        setMessageMatchIds(chatIds);
      } catch (error) {
        console.error("Message search failed", error);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const results = useMemo(() => {
    if (!searchQuery.trim()) {
      return chats;
    }

    // 1. Title matches (Fuse)
    const fuseResults = fuse.search(searchQuery);
    const titleMatchIds = new Set(fuseResults.map((r) => r.item.id));

    // 2. Combine with message matches
    const allMatchIds = new Set([...titleMatchIds, ...messageMatchIds]);

    return chats.filter((chat) => allMatchIds.has(chat.id));
  }, [chats, searchQuery, fuse, messageMatchIds]);

  return results;
}

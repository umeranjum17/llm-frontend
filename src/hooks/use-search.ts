import { useMemo, useState, useEffect } from "react";
import Fuse from "fuse.js";
import type { Chat } from "@/lib/db/schema";
import { searchMessages, type MessageSearchResult } from "@/lib/db/queries";

export function useChatSearch(chats: Chat[], searchQuery: string) {
  const [messageMatches, setMessageMatches] = useState<MessageSearchResult[]>([]);
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
      setMessageMatches([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const messages = await searchMessages(searchQuery);
        setMessageMatches(messages);
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
      return { chats, matches: new Map<string, MessageSearchResult[]>() };
    }

    // 1. Title matches (Fuse)
    const fuseResults = fuse.search(searchQuery);
    const titleMatchIds = new Set(fuseResults.map((r) => r.item.id));

    // 2. Message matches
    const matchesMap = new Map<string, MessageSearchResult[]>();
    const messageMatchIds = new Set<string>();

    messageMatches.forEach(msg => {
      if (!matchesMap.has(msg.chatId)) {
        matchesMap.set(msg.chatId, []);
      }
      matchesMap.get(msg.chatId)?.push(msg);
      messageMatchIds.add(msg.chatId);
    });

    // 3. Combine
    const allMatchIds = new Set([...titleMatchIds, ...messageMatchIds]);
    const filteredChats = chats.filter((chat) => allMatchIds.has(chat.id));

    return { chats: filteredChats, matches: matchesMap };
  }, [chats, searchQuery, fuse, messageMatches]);

  return results;
}

import { useMemo } from "react";
import Fuse from "fuse.js";
import type { Chat } from "@/lib/db/schema";

export function useChatSearch(chats: Chat[], searchQuery: string) {
  // Configure Fuse.js for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(chats, {
      keys: ["title", "modelId"],
      threshold: 0.3, // Lower = more strict matching
      includeScore: true,
      minMatchCharLength: 2,
    });
  }, [chats]);

  const results = useMemo(() => {
    if (!searchQuery.trim()) {
      return chats;
    }

    const fuseResults = fuse.search(searchQuery);
    return fuseResults.map((result) => result.item);
  }, [fuse, searchQuery, chats]);

  return results;
}

/**
 * Extended tag schema for enhanced tagging system
 */

export interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
  createdAt: number;
  usageCount?: number; // Track how many chats use this tag
}

export interface TagRule {
  id: string;
  tagId: string;
  pattern: string; // Regex pattern or keyword
  type: "keyword" | "regex";
  enabled: boolean;
  createdAt: number;
}

export const TAG_COLORS = [
  { id: "red", name: "Red", value: "#ef4444" },
  { id: "orange", name: "Orange", value: "#f97316" },
  { id: "yellow", name: "Yellow", value: "#eab308" },
  { id: "green", name: "Green", value: "#22c55e" },
  { id: "blue", name: "Blue", value: "#3b82f6" },
  { id: "indigo", name: "Indigo", value: "#6366f1" },
  { id: "purple", name: "Purple", value: "#a855f7" },
  { id: "pink", name: "Pink", value: "#ec4899" },
  { id: "gray", name: "Gray", value: "#6b7280" },
];

/**
 * Parses mention strings and extracts structured mention data.
 *
 * Mention formats:
 * - @agent:id[label]
 * - @file:id[label]
 * - @codebase:id[label]
 * - #chat:id[label]
 * - #tag:id[label]
 */

export interface ParsedMention {
  type: "agent" | "file" | "chat" | "tag" | "codebase";
  id: string;
  label: string;
  raw: string; // The full matched string
  startIndex: number;
  endIndex: number;
}

export interface TextSegment {
  type: "text" | "mention";
  content: string;
  mention?: ParsedMention;
}

// Regex to match all mention patterns: @type:id[label] or #type:id[label]
const MENTION_REGEX = /[@#](agent|file|chat|tag|codebase):([^\[]+)\[([^\]]+)\]/g;

/**
 * Parses a text string and extracts all mentions.
 */
export function parseMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  MENTION_REGEX.lastIndex = 0;

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    mentions.push({
      type: match[1] as ParsedMention["type"],
      id: match[2],
      label: match[3],
      raw: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return mentions;
}

/**
 * Segments text into alternating text and mention parts.
 * This is useful for rendering text with highlighted mentions.
 */
export function segmentTextWithMentions(text: string): TextSegment[] {
  const mentions = parseMentions(text);

  if (mentions.length === 0) {
    return [{ type: "text", content: text }];
  }

  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const mention of mentions) {
    // Add text before this mention
    if (mention.startIndex > lastIndex) {
      segments.push({
        type: "text",
        content: text.slice(lastIndex, mention.startIndex),
      });
    }

    // Add the mention
    segments.push({
      type: "mention",
      content: mention.label,
      mention,
    });

    lastIndex = mention.endIndex;
  }

  // Add any remaining text after the last mention
  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      content: text.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Checks if a text string contains any mentions.
 */
export function hasMentions(text: string): boolean {
  MENTION_REGEX.lastIndex = 0;
  return MENTION_REGEX.test(text);
}

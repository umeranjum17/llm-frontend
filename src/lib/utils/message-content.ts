import type { MessageContent, MessageContentPart } from "@/lib/db/schema";

export function isMessageContentParts(
  content: MessageContent
): content is MessageContentPart[] {
  return Array.isArray(content);
}

export function getTextFromMessageContent(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function mapTextInMessageContent(
  content: MessageContent,
  mapText: (text: string) => string
): MessageContent {
  if (typeof content === "string") return mapText(content);
  return content.map((part) =>
    part.type === "text" ? { ...part, text: mapText(part.text) } : part
  );
}

export function getImagesFromMessageContent(content: MessageContent): string[] {
  if (typeof content === "string") return [];
  return content
    .filter((part) => part.type === "image_url")
    .map((part) => part.image_url.url);
}

export function prependTextToMessageContent(
  content: MessageContent,
  prefix: string
): MessageContent {
  if (!prefix) return content;
  if (typeof content === "string") return `${prefix}${content}`;
  if (content.length === 0) return [{ type: "text", text: prefix }];

  const firstTextIndex = content.findIndex((part) => part.type === "text");
  if (firstTextIndex === -1) {
    return [{ type: "text", text: prefix }, ...content];
  }

  return content.map((part, idx) => (
    part.type === "text" && idx === firstTextIndex
      ? { ...part, text: `${prefix}${part.text}` }
      : part
  ));
}

/**
 * Convert message content to AI SDK ModelMessage format.
 * The AI SDK uses a different format than OpenAI:
 * - User images: { type: "image", image: "url" } instead of { type: "image_url", image_url: { url } }
 * - Assistant messages: Only text and tool-call allowed, NOT image_url
 * 
 * AI SDK v6 is stricter about message validation:
 * - Content must be a non-empty string OR a valid content parts array
 * - Empty arrays are NOT valid and cause validation errors
 */
export function convertToAISDKContent(
  content: MessageContent,
  role: "system" | "user" | "assistant"
): string | Array<{ type: "text"; text: string } | { type: "image"; image: string }> {
  // Null/undefined safety - return empty string
  if (content == null) return "";

  // String content is fine as-is (empty strings are valid)
  if (typeof content === "string") return content;

  // Empty array - return empty string (AI SDK v6 doesn't accept empty arrays)
  if (!Array.isArray(content) || content.length === 0) return "";

  // For system messages, just extract text
  if (role === "system") {
    return getTextFromMessageContent(content);
  }

  // For assistant messages, convert image_url to text descriptions
  // (AI SDK doesn't support images in assistant messages)
  if (role === "assistant") {
    const parts: Array<{ type: "text"; text: string }> = [];
    for (const part of content) {
      if (part.type === "text") {
        // Skip empty text parts
        if (part.text) {
          parts.push({ type: "text", text: part.text });
        }
      } else if (part.type === "image_url") {
        // Convert image to a text reference (the image was shown to the user but can't be sent to LLM)
        parts.push({ type: "text", text: "[Generated image]" });
      }
    }
    // AI SDK v6: Always return string for assistant to avoid array validation issues
    // Concatenate all text parts into a single string
    if (parts.length === 0) return "";
    return parts.map(p => p.text).join("\n");
  }

  // For user messages, convert image_url to AI SDK image format
  const convertedParts: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [];
  for (const part of content) {
    if (part.type === "text") {
      // Skip empty text parts
      if (part.text) {
        convertedParts.push({ type: "text", text: part.text });
      }
    } else if (part.type === "image_url") {
      // AI SDK uses { type: "image", image: url } format
      convertedParts.push({ type: "image", image: part.image_url.url });
    }
  }

  // If no valid parts, return empty string
  if (convertedParts.length === 0) return "";

  // For user messages with only text (no images), return as string for simplicity
  const hasImages = convertedParts.some(p => p.type === "image");
  if (!hasImages && convertedParts.length === 1) {
    return (convertedParts[0] as { type: "text"; text: string }).text;
  }

  return convertedParts;
}

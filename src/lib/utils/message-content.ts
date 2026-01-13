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

/**
 * Convert message content to AI SDK CoreMessage format.
 * The AI SDK uses a different format than OpenAI:
 * - User images: { type: "image", image: "url" } instead of { type: "image_url", image_url: { url } }
 * - Assistant messages: Only text and tool-call allowed, NOT image_url
 */
export function convertToAISDKContent(
  content: MessageContent,
  role: "system" | "user" | "assistant"
): string | Array<{ type: "text"; text: string } | { type: "image"; image: string }> {
  // String content is fine as-is
  if (typeof content === "string") return content;

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
        parts.push({ type: "text", text: part.text });
      } else if (part.type === "image_url") {
        // Convert image to a text reference (the image was shown to the user but can't be sent to LLM)
        parts.push({ type: "text", text: "[Generated image]" });
      }
    }
    // If we only have one text part, return as string
    if (parts.length === 1 && parts[0].type === "text") {
      return parts[0].text;
    }
    return parts.length > 0 ? parts : "";
  }

  // For user messages, convert image_url to AI SDK image format
  const convertedParts: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [];
  for (const part of content) {
    if (part.type === "text") {
      convertedParts.push({ type: "text", text: part.text });
    } else if (part.type === "image_url") {
      // AI SDK uses { type: "image", image: url } format
      convertedParts.push({ type: "image", image: part.image_url.url });
    }
  }
  return convertedParts;
}


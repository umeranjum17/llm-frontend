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


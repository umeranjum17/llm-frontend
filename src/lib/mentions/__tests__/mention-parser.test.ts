import { describe, it, expect } from "vitest";
import { parseMentions, segmentTextWithMentions, hasMentions } from "../mention-parser";

describe("mention-parser", () => {
  describe("parseMentions", () => {
    it("parses agent mentions", () => {
      const text = "Hello @agent:abc123[Code Assistant], how are you?";
      const mentions = parseMentions(text);

      expect(mentions).toHaveLength(1);
      expect(mentions[0]).toEqual({
        type: "agent",
        id: "abc123",
        label: "Code Assistant",
        raw: "@agent:abc123[Code Assistant]",
        startIndex: 6,
        endIndex: 35,
      });
    });

    it("parses file mentions", () => {
      const text = "Check @file:xyz789[README.md] for details";
      const mentions = parseMentions(text);

      expect(mentions).toHaveLength(1);
      expect(mentions[0].type).toBe("file");
      expect(mentions[0].id).toBe("xyz789");
      expect(mentions[0].label).toBe("README.md");
    });

    it("parses chat mentions", () => {
      const text = "See #chat:chat123[Previous Chat] for context";
      const mentions = parseMentions(text);

      expect(mentions).toHaveLength(1);
      expect(mentions[0].type).toBe("chat");
      expect(mentions[0].id).toBe("chat123");
      expect(mentions[0].label).toBe("Previous Chat");
    });

    it("parses tag mentions", () => {
      const text = "Tagged with #tag:tag1[important]";
      const mentions = parseMentions(text);

      expect(mentions).toHaveLength(1);
      expect(mentions[0].type).toBe("tag");
      expect(mentions[0].id).toBe("tag1");
      expect(mentions[0].label).toBe("important");
    });

    it("parses multiple mentions", () => {
      const text = "Hey @agent:a1[Bot], check @file:f1[test.ts] and #chat:c1[Chat]";
      const mentions = parseMentions(text);

      expect(mentions).toHaveLength(3);
      expect(mentions[0].type).toBe("agent");
      expect(mentions[1].type).toBe("file");
      expect(mentions[2].type).toBe("chat");
    });

    it("returns empty array for text without mentions", () => {
      const text = "Just regular text without mentions";
      const mentions = parseMentions(text);

      expect(mentions).toHaveLength(0);
    });
  });

  describe("segmentTextWithMentions", () => {
    it("segments text with a single mention", () => {
      const text = "Hello @agent:abc[Bot] world";
      const segments = segmentTextWithMentions(text);

      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ type: "text", content: "Hello " });
      expect(segments[1].type).toBe("mention");
      expect(segments[1].content).toBe("Bot");
      expect(segments[2]).toEqual({ type: "text", content: " world" });
    });

    it("handles text without mentions", () => {
      const text = "Just plain text";
      const segments = segmentTextWithMentions(text);

      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({ type: "text", content: "Just plain text" });
    });

    it("handles mention at the beginning", () => {
      const text = "@agent:id[Name] at start";
      const segments = segmentTextWithMentions(text);

      expect(segments).toHaveLength(2);
      expect(segments[0].type).toBe("mention");
      expect(segments[1]).toEqual({ type: "text", content: " at start" });
    });

    it("handles mention at the end", () => {
      const text = "Ends with @agent:id[Name]";
      const segments = segmentTextWithMentions(text);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({ type: "text", content: "Ends with " });
      expect(segments[1].type).toBe("mention");
    });
  });

  describe("hasMentions", () => {
    it("returns true for text with mentions", () => {
      expect(hasMentions("Hello @agent:id[Name]")).toBe(true);
      expect(hasMentions("Check #chat:id[Chat]")).toBe(true);
    });

    it("returns false for text without mentions", () => {
      expect(hasMentions("Just plain text")).toBe(false);
      expect(hasMentions("@partial:mention")).toBe(false);
    });
  });
});

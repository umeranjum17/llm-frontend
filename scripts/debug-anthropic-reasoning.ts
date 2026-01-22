#!/usr/bin/env npx tsx
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  console.log("Testing Anthropic Claude reasoning...");

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    messages: [{ role: "user", content: "What is 2+2? Think step by step." }],
    providerOptions: {
      anthropic: {
        thinking: { type: "enabled", budgetTokens: 5000 },
      },
    },
  });

  console.log("Streaming events:");
  let reasoningText = "";
  for await (const part of result.fullStream) {
    const type = (part as any).type;
    // Capture reasoning content
    if (type === "reasoning" || type === "reasoning-delta") {
      const text = (part as any).text ?? (part as any).textDelta ?? "";
      reasoningText += text;
      process.stdout.write("."); // Progress indicator
    }
    if (type !== "text-delta" && type !== "reasoning" && type !== "reasoning-delta") {
      console.log(`\n[${type}]`, JSON.stringify(part, null, 2).slice(0, 800));
    }
  }
  console.log("\n\nTotal reasoning text captured:", reasoningText.length, "chars");
  if (reasoningText) {
    console.log("Reasoning preview:", reasoningText.slice(0, 500));
  }
}

main().catch(console.error);

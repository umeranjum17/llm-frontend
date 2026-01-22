#!/usr/bin/env npx tsx
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const result = streamText({
    model: openai("gpt-5.2"),
    messages: [{ role: "user", content: "What is 2+2? Think step by step." }],
    providerOptions: {
      openai: {
        reasoningEffort: "medium",
        reasoningSummary: "detailed",
      },
    },
  });

  console.log("Streaming events from OpenAI o4-mini:");
  let reasoningText = "";
  for await (const part of result.fullStream) {
    const type = (part as any).type;
    // Capture reasoning content
    if (type === "reasoning" || type === "reasoning-delta") {
      const text = (part as any).text ?? (part as any).textDelta ?? "";
      reasoningText += text;
    }
    if (type !== "text-delta") {
      console.log(`\n[${type}]`, JSON.stringify(part, null, 2).slice(0, 1000));
    }
  }
  console.log("\n\nTotal reasoning text captured:", reasoningText.length, "chars");
  if (reasoningText) {
    console.log("Reasoning preview:", reasoningText.slice(0, 500));
  }
}

main().catch(console.error);

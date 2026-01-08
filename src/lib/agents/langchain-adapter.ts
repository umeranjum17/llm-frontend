import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import type { BaseMessage } from "@langchain/core/messages";

export interface LangChainConfig {
  provider: "openai" | "anthropic" | "openrouter";
  apiKey: string;
  model: string;
  baseURL?: string;
}

/**
 * Create a LangChain chat model based on provider
 */
export function createLangChainModel(config: LangChainConfig) {
  const { provider, apiKey, model, baseURL } = config;

  switch (provider) {
    case "openai":
      return new ChatOpenAI({
        modelName: model,
        openAIApiKey: apiKey,
        configuration: {
          baseURL: baseURL || "https://api.openai.com/v1",
        },
        temperature: 0.7,
        streaming: true,
      });

    case "anthropic":
      return new ChatAnthropic({
        modelName: model,
        anthropicApiKey: apiKey,
        temperature: 0.7,
        streaming: true,
      });

    case "openrouter":
      return new ChatOpenAI({
        modelName: model,
        openAIApiKey: apiKey,
        configuration: {
          baseURL: baseURL || "https://openrouter.ai/api/v1",
        },
        temperature: 0.7,
        streaming: true,
      });

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Convert Vercel AI SDK messages to LangChain messages
 */
export function convertToLangChainMessages(
  messages: Array<{ role: string; content: string }>
): BaseMessage[] {
  const { HumanMessage, AIMessage, SystemMessage } = require("@langchain/core/messages");

  return messages.map((msg) => {
    switch (msg.role) {
      case "user":
        return new HumanMessage(msg.content);
      case "assistant":
        return new AIMessage(msg.content);
      case "system":
        return new SystemMessage(msg.content);
      default:
        return new HumanMessage(msg.content);
    }
  });
}

/**
 * Create a simple chat chain with LangChain
 */
export function createChatChain(model: any, systemPrompt?: string) {
  const prompt = systemPrompt
    ? ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        new MessagesPlaceholder("messages"),
      ])
    : ChatPromptTemplate.fromMessages([new MessagesPlaceholder("messages")]);

  return RunnableSequence.from([prompt, model]);
}





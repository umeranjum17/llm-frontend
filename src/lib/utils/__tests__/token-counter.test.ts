import { describe, it, expect, vi } from 'vitest';
import {
  countTokens,
  formatTokenCount,
  formatCost,
  countMessagesTokens,
} from '../token-counter';

// Mock the gpt-tokenizer encode function
vi.mock('gpt-tokenizer', () => ({
  encode: vi.fn((text: string) => {
    // Simple mock: roughly 4 chars per token
    return new Array(Math.ceil(text.length / 4));
  }),
}));

// Mock the models module
vi.mock('@/lib/constants/models', () => ({
  getModelById: vi.fn((id: string) => {
    if (id === 'openai/gpt-4') {
      return { id: 'openai/gpt-4', inputCost: 30, outputCost: 60, contextLength: 8192 };
    }
    if (id === 'anthropic/claude-3-sonnet') {
      return { id: 'anthropic/claude-3-sonnet', inputCost: 3, outputCost: 15, contextLength: 200000 };
    }
    if (id === 'free-model:free') {
      return { id: 'free-model:free', inputCost: 0, outputCost: 0, contextLength: 4096 };
    }
    return null;
  }),
  getAllModels: vi.fn(() => [
    { id: 'openai/gpt-4', inputCost: 30, outputCost: 60, contextLength: 8192 },
    { id: 'anthropic/claude-3-sonnet', inputCost: 3, outputCost: 15, contextLength: 200000 },
  ]),
}));

describe('token-counter', () => {
  describe('countTokens', () => {
    it('counts tokens in a string', () => {
      const text = 'Hello, world!'; // 13 chars = ~3-4 tokens
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
    });

    it('returns 0 for empty string', () => {
      expect(countTokens('')).toBe(0);
    });

    it('handles long text', () => {
      const longText = 'word '.repeat(1000);
      const count = countTokens(longText);
      expect(count).toBeGreaterThan(100);
    });

    it('handles special characters', () => {
      const text = '🎉 Hello! @#$%^&*()';
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('formatTokenCount', () => {
    it('formats small token counts', () => {
      expect(formatTokenCount(500)).toBe('500 tokens');
    });

    it('formats thousands with k suffix', () => {
      expect(formatTokenCount(5000)).toBe('5.0k tokens');
      expect(formatTokenCount(15000)).toBe('15.0k tokens');
    });

    it('formats millions with M suffix', () => {
      expect(formatTokenCount(1500000)).toBe('1.50M tokens');
    });

    it('handles edge cases', () => {
      expect(formatTokenCount(0)).toBe('0 tokens');
      expect(formatTokenCount(999)).toBe('999 tokens');
      expect(formatTokenCount(1000)).toBe('1.0k tokens');
    });
  });

  describe('formatCost', () => {
    it('formats zero cost as Free', () => {
      expect(formatCost(0)).toBe('Free');
    });

    it('formats very small costs', () => {
      expect(formatCost(0.001)).toBe('<$0.01');
      expect(formatCost(0.009)).toBe('<$0.01');
    });

    it('formats normal costs with 2 decimal places', () => {
      expect(formatCost(0.05)).toBe('$0.05');
      expect(formatCost(1.23)).toBe('$1.23');
      expect(formatCost(10.00)).toBe('$10.00');
    });

    it('formats large costs', () => {
      expect(formatCost(100.50)).toBe('$100.50');
    });
  });

  describe('countMessagesTokens', () => {
    it('counts tokens in a single message', () => {
      const messages = [
        {
          id: 'msg-1',
          chatId: 'chat-1',
          role: 'user' as const,
          content: 'Hello, how are you?',
          createdAt: Date.now(),
        },
      ];
      const count = countMessagesTokens(messages);
      expect(count).toBeGreaterThan(0);
    });

    it('counts tokens in multiple messages', () => {
      const messages = [
        {
          id: 'msg-1',
          chatId: 'chat-1',
          role: 'user' as const,
          content: 'Hello',
          createdAt: Date.now(),
        },
        {
          id: 'msg-2',
          chatId: 'chat-1',
          role: 'assistant' as const,
          content: 'Hi there! How can I help you today?',
          createdAt: Date.now(),
        },
      ];
      const count = countMessagesTokens(messages);
      // Should be more than a single message
      expect(count).toBeGreaterThan(countMessagesTokens([messages[0]]));
    });

    it('handles messages with array content', () => {
      const messages = [
        {
          id: 'msg-1',
          chatId: 'chat-1',
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: 'What is in this image?' },
            { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,abc' } },
          ],
          createdAt: Date.now(),
        },
      ];
      const count = countMessagesTokens(messages);
      // Should include text tokens + image overhead (200 per image)
      expect(count).toBeGreaterThan(200);
    });

    it('includes message overhead', () => {
      const messages = [
        {
          id: 'msg-1',
          chatId: 'chat-1',
          role: 'user' as const,
          content: '',
          createdAt: Date.now(),
        },
      ];
      const count = countMessagesTokens(messages);
      // Even empty message has overhead
      expect(count).toBeGreaterThan(0);
    });

    it('counts tool calls and results', () => {
      const messagesWithTools = [
        {
          id: 'msg-1',
          chatId: 'chat-1',
          role: 'assistant' as const,
          content: 'Let me search for that.',
          toolCalls: [{ id: 'call-1', name: 'search', args: { query: 'test' } }],
          toolResults: [{ id: 'call-1', name: 'search', result: 'Found 5 results' }],
          createdAt: Date.now(),
        },
      ];

      const messagesWithoutTools = [
        {
          id: 'msg-1',
          chatId: 'chat-1',
          role: 'assistant' as const,
          content: 'Let me search for that.',
          createdAt: Date.now(),
        },
      ];

      const withTools = countMessagesTokens(messagesWithTools);
      const withoutTools = countMessagesTokens(messagesWithoutTools);

      expect(withTools).toBeGreaterThan(withoutTools);
    });

    it('returns 0 for empty messages array', () => {
      expect(countMessagesTokens([])).toBe(0);
    });
  });
});

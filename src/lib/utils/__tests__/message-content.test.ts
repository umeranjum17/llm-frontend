import { describe, it, expect } from 'vitest';
import {
  isMessageContentParts,
  getTextFromMessageContent,
  mapTextInMessageContent,
  getImagesFromMessageContent,
  convertToAISDKContent,
} from '../message-content';

describe('message-content utilities', () => {
  describe('isMessageContentParts', () => {
    it('returns true for array content', () => {
      const content = [{ type: 'text' as const, text: 'Hello' }];
      expect(isMessageContentParts(content)).toBe(true);
    });

    it('returns false for string content', () => {
      expect(isMessageContentParts('Hello')).toBe(false);
    });

    it('returns true for empty array', () => {
      expect(isMessageContentParts([])).toBe(true);
    });
  });

  describe('getTextFromMessageContent', () => {
    it('returns string content as-is', () => {
      expect(getTextFromMessageContent('Hello World')).toBe('Hello World');
    });

    it('extracts text from single text part', () => {
      const content = [{ type: 'text' as const, text: 'Hello' }];
      expect(getTextFromMessageContent(content)).toBe('Hello');
    });

    it('concatenates multiple text parts', () => {
      const content = [
        { type: 'text' as const, text: 'Hello ' },
        { type: 'text' as const, text: 'World' },
      ];
      expect(getTextFromMessageContent(content)).toBe('Hello World');
    });

    it('ignores image parts', () => {
      const content = [
        { type: 'text' as const, text: 'Check this out: ' },
        { type: 'image_url' as const, image_url: { url: 'https://example.com/img.png' } },
        { type: 'text' as const, text: ' Pretty cool!' },
      ];
      expect(getTextFromMessageContent(content)).toBe('Check this out:  Pretty cool!');
    });

    it('returns empty string for content with only images', () => {
      const content = [
        { type: 'image_url' as const, image_url: { url: 'https://example.com/img.png' } },
      ];
      expect(getTextFromMessageContent(content)).toBe('');
    });

    it('returns empty string for empty array', () => {
      expect(getTextFromMessageContent([])).toBe('');
    });
  });

  describe('mapTextInMessageContent', () => {
    it('transforms string content', () => {
      const result = mapTextInMessageContent('hello', (t) => t.toUpperCase());
      expect(result).toBe('HELLO');
    });

    it('transforms text parts in array', () => {
      const content = [
        { type: 'text' as const, text: 'hello' },
        { type: 'text' as const, text: 'world' },
      ];
      const result = mapTextInMessageContent(content, (t) => t.toUpperCase());
      expect(result).toEqual([
        { type: 'text', text: 'HELLO' },
        { type: 'text', text: 'WORLD' },
      ]);
    });

    it('preserves image parts unchanged', () => {
      const content = [
        { type: 'text' as const, text: 'hello' },
        { type: 'image_url' as const, image_url: { url: 'https://example.com/img.png' } },
      ];
      const result = mapTextInMessageContent(content, (t) => t.toUpperCase());
      expect(result).toEqual([
        { type: 'text', text: 'HELLO' },
        { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
      ]);
    });

    it('handles empty array', () => {
      const result = mapTextInMessageContent([], (t) => t.toUpperCase());
      expect(result).toEqual([]);
    });
  });

  describe('getImagesFromMessageContent', () => {
    it('returns empty array for string content', () => {
      expect(getImagesFromMessageContent('Hello')).toEqual([]);
    });

    it('extracts single image URL', () => {
      const content = [
        { type: 'image_url' as const, image_url: { url: 'https://example.com/img.png' } },
      ];
      expect(getImagesFromMessageContent(content)).toEqual(['https://example.com/img.png']);
    });

    it('extracts multiple image URLs', () => {
      const content = [
        { type: 'image_url' as const, image_url: { url: 'https://example.com/1.png' } },
        { type: 'text' as const, text: 'Middle text' },
        { type: 'image_url' as const, image_url: { url: 'https://example.com/2.png' } },
      ];
      expect(getImagesFromMessageContent(content)).toEqual([
        'https://example.com/1.png',
        'https://example.com/2.png',
      ]);
    });

    it('returns empty array for content with no images', () => {
      const content = [
        { type: 'text' as const, text: 'Just text' },
      ];
      expect(getImagesFromMessageContent(content)).toEqual([]);
    });

    it('handles base64 image URLs', () => {
      const content = [
        { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,abc123' } },
      ];
      expect(getImagesFromMessageContent(content)).toEqual(['data:image/png;base64,abc123']);
    });
  });

  describe('convertToAISDKContent', () => {
    describe('string content', () => {
      it('returns string as-is for any role', () => {
        expect(convertToAISDKContent('Hello', 'user')).toBe('Hello');
        expect(convertToAISDKContent('Hello', 'assistant')).toBe('Hello');
        expect(convertToAISDKContent('Hello', 'system')).toBe('Hello');
      });
    });

    describe('system role', () => {
      it('extracts only text from mixed content', () => {
        const content = [
          { type: 'text' as const, text: 'System prompt' },
          { type: 'image_url' as const, image_url: { url: 'https://example.com/img.png' } },
        ];
        expect(convertToAISDKContent(content, 'system')).toBe('System prompt');
      });
    });

    describe('assistant role', () => {
      it('converts text parts', () => {
        const content = [
          { type: 'text' as const, text: 'Here is my response' },
        ];
        expect(convertToAISDKContent(content, 'assistant')).toBe('Here is my response');
      });

      it('converts image_url to text placeholder', () => {
        const content = [
          { type: 'text' as const, text: 'I generated this: ' },
          { type: 'image_url' as const, image_url: { url: 'https://example.com/generated.png' } },
        ];
        const result = convertToAISDKContent(content, 'assistant');
        expect(result).toEqual([
          { type: 'text', text: 'I generated this: ' },
          { type: 'text', text: '[Generated image]' },
        ]);
      });

      it('returns single text as string', () => {
        const content = [{ type: 'text' as const, text: 'Single response' }];
        expect(convertToAISDKContent(content, 'assistant')).toBe('Single response');
      });

      it('returns empty string for empty array', () => {
        expect(convertToAISDKContent([], 'assistant')).toBe('');
      });
    });

    describe('user role', () => {
      it('converts text parts', () => {
        const content = [{ type: 'text' as const, text: 'User message' }];
        expect(convertToAISDKContent(content, 'user')).toEqual([
          { type: 'text', text: 'User message' },
        ]);
      });

      it('converts image_url to AI SDK image format', () => {
        const content = [
          { type: 'text' as const, text: 'What is in this image?' },
          { type: 'image_url' as const, image_url: { url: 'https://example.com/photo.jpg' } },
        ];
        expect(convertToAISDKContent(content, 'user')).toEqual([
          { type: 'text', text: 'What is in this image?' },
          { type: 'image', image: 'https://example.com/photo.jpg' },
        ]);
      });

      it('handles multiple images', () => {
        const content = [
          { type: 'text' as const, text: 'Compare these:' },
          { type: 'image_url' as const, image_url: { url: 'https://example.com/1.png' } },
          { type: 'image_url' as const, image_url: { url: 'https://example.com/2.png' } },
        ];
        expect(convertToAISDKContent(content, 'user')).toEqual([
          { type: 'text', text: 'Compare these:' },
          { type: 'image', image: 'https://example.com/1.png' },
          { type: 'image', image: 'https://example.com/2.png' },
        ]);
      });

      it('handles base64 images', () => {
        const content = [
          { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,abc123' } },
        ];
        expect(convertToAISDKContent(content, 'user')).toEqual([
          { type: 'image', image: 'data:image/png;base64,abc123' },
        ]);
      });
    });
  });
});

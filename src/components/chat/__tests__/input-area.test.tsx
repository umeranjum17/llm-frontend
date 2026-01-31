import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { setMatchMediaWidth } from '@/test/setup';

// Mock all the complex dependencies
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => null),
}));

vi.mock('@/hooks/use-chat', () => ({
  useChat: vi.fn(() => ({
    sendMessage: vi.fn(),
    isLoading: false,
    cancelRequest: vi.fn(),
  })),
}));

vi.mock('@/hooks/use-keyboard-shortcuts', () => ({
  useChatKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/hooks/use-voice-input', () => ({
  useVoiceInput: vi.fn(() => ({
    isListening: false,
    transcript: '',
    isSupported: true,
    start: vi.fn(),
    stop: vi.fn(),
    error: null,
  })),
}));

vi.mock('@/lib/db/queries', () => ({
  getAllPrompts: vi.fn(() => Promise.resolve([])),
  getChatById: vi.fn(() => Promise.resolve(null)),
  incrementPromptUsage: vi.fn(() => Promise.resolve()),
  getProjectFiles: vi.fn(() => Promise.resolve([])),
  getChatsByProject: vi.fn(() => Promise.resolve([])),
  getAllAgents: vi.fn(() => Promise.resolve([])),
  getAllTags: vi.fn(() => Promise.resolve([])),
  getMessages: vi.fn(() => Promise.resolve([])),
  getAllSkills: vi.fn(() => Promise.resolve([])),
  saveDraft: vi.fn(() => Promise.resolve()),
  getDraft: vi.fn(() => Promise.resolve(null)),
  deleteDraft: vi.fn(() => Promise.resolve()),
  addChatFile: vi.fn(() => Promise.resolve()),
  updateChat: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/components/chat/mention-textarea', () => {
  const React = require('react');
  const MockMentionTextarea = React.forwardRef(({ value, onChange, placeholder, disabled, className }: any, ref: any) => (
    React.createElement('textarea', {
      ref,
      value,
      onChange,
      placeholder,
      disabled,
      className,
      'data-testid': 'mention-textarea',
    })
  ));
  MockMentionTextarea.displayName = 'MockMentionTextarea';
  return {
    MentionTextarea: MockMentionTextarea,
  };
});

vi.mock('@/components/chat/skill-quick-select', () => ({
  SkillQuickSelect: () => <div data-testid="skill-quick-select">Skill Select</div>,
}));

vi.mock('@/lib/constants/skills', () => ({
  SKILL_COLORS: {},
}));

vi.mock('@/lib/rag/file-indexer', () => ({
  indexChatFile: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/utils/token-counter', () => ({
  countMessagesTokens: vi.fn(() => 0),
  countTokens: vi.fn(() => 0),
}));

vi.mock('@/lib/constants/models', () => ({
  getModelById: vi.fn(() => null),
}));

vi.mock('@/lib/constants/model-capabilities', () => ({
  getModelCapabilities: vi.fn(() => ({ vision: false, functionCalling: false })),
}));

vi.mock('@/lib/utils/file-extractor', () => ({
  extractTextFromFile: vi.fn(() => Promise.resolve('')),
}));

vi.mock('@/lib/constants/agents', () => ({
  BUILTIN_AGENTS: [],
}));

vi.mock('@/stores/streaming-store', () => ({
  useStreamingStore: vi.fn((selector) => {
    const state = {
      streamingChatIds: new Set(),
      chatStreams: {},
      setActiveSkill: vi.fn(),
      getChatStream: vi.fn(() => ({ streamingMessageId: null, messageQueue: [], activeSkill: null })),
      enqueueMessage: vi.fn(),
      clearQueue: vi.fn(),
      removeQueuedMessage: vi.fn(),
      moveQueuedMessageUp: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock('@/lib/mentions/types', () => ({}));

vi.mock('@/components/mobile-nav', () => ({
  MobileNavInline: () => <div data-testid="mobile-nav">Mobile Nav</div>,
}));

vi.mock('@/components/prompts/prompt-library-dialog', () => ({
  PromptLibraryDialog: () => null,
}));

vi.mock('@/components/prompts/variable-input-modal', () => ({
  VariableInputModal: () => null,
}));

vi.mock('@/components/chat/token-display', () => ({
  TokenDisplay: () => <div data-testid="token-display">Token Display</div>,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Import after mocks are set up
import { InputArea } from '../input-area';

describe('InputArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMatchMediaWidth(1280); // Default to desktop
  });

  describe('basic rendering', () => {
    it('renders textarea for message input', () => {
      render(<InputArea chatId="test-chat" />);
      expect(screen.getByTestId('mention-textarea')).toBeInTheDocument();
    });

    it('renders send button', () => {
      render(<InputArea chatId="test-chat" />);
      expect(screen.getByLabelText('Send message')).toBeInTheDocument();
    });

    it('renders attach button', () => {
      render(<InputArea chatId="test-chat" />);
      expect(screen.getByLabelText('Attach images or files')).toBeInTheDocument();
    });
  });

  describe('mobile vs desktop elements', () => {
    it('renders voice input button on desktop (hidden on mobile via CSS)', () => {
      render(<InputArea chatId="test-chat" />);

      const voiceButton = screen.getByLabelText(/Voice input|Stop recording/i);
      expect(voiceButton).toBeInTheDocument();
      expect(voiceButton.className).toContain('hidden');
      expect(voiceButton.className).toContain('sm:flex');
    });

    it('renders skill quick select', () => {
      render(<InputArea chatId="test-chat" />);

      const skillSelect = screen.getByTestId('skill-quick-select');
      expect(skillSelect).toBeInTheDocument();
    });

    it('renders mobile navigation component', () => {
      render(<InputArea chatId="test-chat" />);
      expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
    });

    it('has responsive button sizes (sm: larger, mobile: smaller)', () => {
      render(<InputArea chatId="test-chat" />);

      const attachButton = screen.getByLabelText('Attach images or files');
      expect(attachButton.className).toContain('h-9');
      expect(attachButton.className).toContain('sm:h-10');
    });

    it('has responsive padding on input container', () => {
      render(<InputArea chatId="test-chat" />);

      const form = document.querySelector('form');
      const inputContainer = form?.querySelector('.rounded-xl');
      expect(inputContainer?.className).toContain('p-1.5');
      expect(inputContainer?.className).toContain('sm:p-2');
    });
  });

  describe('send button state', () => {
    it('send button is disabled when input is empty', () => {
      render(<InputArea chatId="test-chat" />);

      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).toBeDisabled();
    });

    it('send button is enabled when input has text', () => {
      render(<InputArea chatId="test-chat" />);

      const textarea = screen.getByTestId('mention-textarea');
      fireEvent.change(textarea, { target: { value: 'Hello' } });

      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).not.toBeDisabled();
    });
  });

  describe('file input', () => {
    it('has hidden file input element', () => {
      render(<InputArea chatId="test-chat" />);

      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput?.className).toContain('hidden');
    });

    it('file input accepts images and code files', () => {
      render(<InputArea chatId="test-chat" />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput.accept).toContain('image/*');
      expect(fileInput.accept).toContain('.txt');
      expect(fileInput.accept).toContain('.md');
      expect(fileInput.accept).toContain('.js');
    });

    it('clicking attach button triggers file input', () => {
      render(<InputArea chatId="test-chat" />);

      const attachButton = screen.getByLabelText('Attach images or files');
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

      const clickSpy = vi.spyOn(fileInput, 'click');
      fireEvent.click(attachButton);

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('responsive layout', () => {
    it('form has max-width constraint', () => {
      render(<InputArea chatId="test-chat" />);

      const form = document.querySelector('form');
      expect(form?.className).toContain('max-w-3xl');
      expect(form?.className).toContain('2xl:max-w-4xl');
    });

    it('input container uses flex layout', () => {
      render(<InputArea chatId="test-chat" />);

      const form = document.querySelector('form');
      const inputContainer = form?.querySelector('.flex.gap-1\\.5');
      expect(inputContainer).toBeInTheDocument();
    });

    it('textarea container is flex-1 to fill available space', () => {
      render(<InputArea chatId="test-chat" />);

      const textareaContainer = screen.getByTestId('mention-textarea').closest('.flex-1');
      expect(textareaContainer).toBeInTheDocument();
    });
  });

  describe('placeholder text', () => {
    it('shows default placeholder', () => {
      render(<InputArea chatId="test-chat" />);

      const textarea = screen.getByTestId('mention-textarea');
      expect(textarea).toHaveAttribute('placeholder', 'Message Lumina...');
    });
  });
});

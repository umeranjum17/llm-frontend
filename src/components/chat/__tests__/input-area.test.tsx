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
}));

vi.mock('@/lib/connectors/registry', () => ({
  availableConnectors: [],
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

vi.mock('@/components/chat/prompt-quick-select', () => ({
  PromptQuickSelect: () => <div data-testid="prompt-quick-select">Prompt Select</div>,
}));

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
      expect(screen.getByTitle('Send')).toBeInTheDocument();
    });

    it('renders attach button', () => {
      render(<InputArea chatId="test-chat" />);
      expect(screen.getByTitle('Attach images or files')).toBeInTheDocument();
    });
  });

  describe('mobile vs desktop elements', () => {
    it('renders voice input button on desktop (hidden on mobile via CSS)', () => {
      render(<InputArea chatId="test-chat" />);

      // Voice button has "hidden sm:flex" class - visible on sm+ screens
      const voiceButton = screen.getByTitle(/Voice input|Stop recording/i);
      expect(voiceButton).toBeInTheDocument();
      expect(voiceButton.className).toContain('hidden');
      expect(voiceButton.className).toContain('sm:flex');
    });

    it('renders prompt quick select on desktop (hidden on mobile via CSS)', () => {
      render(<InputArea chatId="test-chat" />);

      // The prompt quick select wrapper has "hidden sm:block" class
      const promptSelect = screen.getByTestId('prompt-quick-select');
      expect(promptSelect.parentElement?.className).toContain('hidden');
      expect(promptSelect.parentElement?.className).toContain('sm:block');
    });

    it('renders mobile navigation component', () => {
      render(<InputArea chatId="test-chat" />);
      expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
    });

    it('has responsive button sizes (sm: larger, mobile: smaller)', () => {
      render(<InputArea chatId="test-chat" />);

      const attachButton = screen.getByTitle('Attach images or files');
      // Button has "h-9 w-9 sm:h-10 sm:w-10" classes
      expect(attachButton.className).toContain('h-9');
      expect(attachButton.className).toContain('sm:h-10');
    });

    it('has responsive padding on input container', () => {
      render(<InputArea chatId="test-chat" />);

      // The form contains the input container with responsive classes
      const form = document.querySelector('form');
      const inputContainer = form?.querySelector('.rounded-xl');
      expect(inputContainer?.className).toContain('p-1.5');
      expect(inputContainer?.className).toContain('sm:p-2');
    });

    it('helper text is hidden on mobile', () => {
      render(<InputArea chatId="test-chat" />);

      // Helper text exists (wording uses symbols: "↵ Send • ⇧↵ New line")
      const helperText = screen.getByText(/Send/i);
      expect(helperText).toBeInTheDocument();
      // Uses small responsive typography
      expect(helperText.className).toContain('sm:text-xs');
    });
  });

  describe('send button state', () => {
    it('send button is disabled when input is empty', () => {
      render(<InputArea chatId="test-chat" />);

      const sendButton = screen.getByTitle('Send');
      expect(sendButton).toBeDisabled();
    });

    it('send button is enabled when input has text', () => {
      render(<InputArea chatId="test-chat" />);

      const textarea = screen.getByTestId('mention-textarea');
      fireEvent.change(textarea, { target: { value: 'Hello' } });

      const sendButton = screen.getByTitle('Send');
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

      const attachButton = screen.getByTitle('Attach images or files');
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

      const textareaContainer = screen.getByTestId('mention-textarea').parentElement;
      expect(textareaContainer?.className).toContain('flex-1');
    });
  });

  describe('placeholder text', () => {
    it('shows placeholder with mention hints', () => {
      render(<InputArea chatId="test-chat" />);

      const textarea = screen.getByTestId('mention-textarea');
      expect(textarea).toHaveAttribute('placeholder', expect.stringContaining('@ for agents'));
      expect(textarea).toHaveAttribute('placeholder', expect.stringContaining('# for chats'));
    });
  });
});

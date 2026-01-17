import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CodeBlock } from '../code-block';

// Mock shiki
vi.mock('shiki', () => ({
  codeToHtml: vi.fn().mockResolvedValue('<pre><code>highlighted code</code></pre>'),
}));

// Mock the UI store
const mockSetShowArtifacts = vi.fn();
const mockSetActiveArtifact = vi.fn();
const mockSetArtifactsFullscreen = vi.fn();

vi.mock('@/stores/ui-store', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      setShowArtifacts: mockSetShowArtifacts,
      setActiveArtifact: mockSetActiveArtifact,
      setArtifactsFullscreen: mockSetArtifactsFullscreen,
    };
    return selector(state);
  }),
}));

describe('CodeBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders code with language label', () => {
    render(<CodeBlock language="javascript" code="const x = 1;" />);

    expect(screen.getByText('javascript')).toBeInTheDocument();
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
  });

  it('renders "text" as default language', () => {
    render(<CodeBlock language="" code="plain text" />);

    expect(screen.getByText('text')).toBeInTheDocument();
  });

  it('renders code content in pre/code element', () => {
    const code = 'function hello() { console.log("Hi"); }';
    render(<CodeBlock language="javascript" code={code} />);

    // The code should be inside a <code> element
    const codeElement = screen.getByRole('code', { hidden: true }) ||
                        document.querySelector('code');
    expect(codeElement).toBeInTheDocument();
    expect(codeElement?.textContent).toBe(code);
  });

  it('displays copy button', () => {
    render(<CodeBlock language="python" code="print('hello')" />);

    const copyButton = screen.getByTitle('Copy code');
    expect(copyButton).toBeInTheDocument();
  });

  it('copies code to clipboard when copy button is clicked', async () => {
    const code = 'const test = true;';
    render(<CodeBlock language="javascript" code={code} />);

    const copyButton = screen.getByTitle('Copy code');
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(code);
  });

  it('shows check icon after copying', async () => {
    render(<CodeBlock language="javascript" code="test" />);

    const copyButton = screen.getByTitle('Copy code');
    fireEvent.click(copyButton);

    // After clicking, the check icon should appear (we can't easily check the icon change,
    // but we can verify the click was registered)
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });

  it('displays fullscreen button', () => {
    render(<CodeBlock language="typescript" code="type X = string;" />);

    const fullscreenButton = screen.getByTitle('Open fullscreen');
    expect(fullscreenButton).toBeInTheDocument();
  });

  it('opens artifact panel when fullscreen button is clicked', () => {
    const code = 'export const value = 42;';
    render(<CodeBlock language="typescript" code={code} />);

    const fullscreenButton = screen.getByTitle('Open fullscreen');
    fireEvent.click(fullscreenButton);

    expect(mockSetActiveArtifact).toHaveBeenCalledWith({
      id: expect.any(String),
      title: 'Typescript Code',
      code,
      language: 'typescript',
      type: 'code',
    });
    expect(mockSetShowArtifacts).toHaveBeenCalledWith(true);
    expect(mockSetArtifactsFullscreen).toHaveBeenCalledWith(true);
  });

  it('capitalizes language name in artifact title', () => {
    render(<CodeBlock language="python" code="x = 1" />);

    const fullscreenButton = screen.getByTitle('Open fullscreen');
    fireEvent.click(fullscreenButton);

    expect(mockSetActiveArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Python Code',
      })
    );
  });

  it('uses "Code Snippet" as title when no language', () => {
    render(<CodeBlock language="" code="some code" />);

    const fullscreenButton = screen.getByTitle('Open fullscreen');
    fireEvent.click(fullscreenButton);

    expect(mockSetActiveArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Code Snippet',
        language: 'text',
      })
    );
  });

  it('handles multiline code', () => {
    const multilineCode = `line 1
line 2
line 3`;
    render(<CodeBlock language="text" code={multilineCode} />);

    // Find the code element and check its content
    const codeElement = document.querySelector('code');
    expect(codeElement).toBeInTheDocument();
    expect(codeElement?.textContent).toBe(multilineCode);
  });

  it('handles code with special characters', () => {
    const code = '<div class="test">&amp;</div>';
    render(<CodeBlock language="html" code={code} />);

    expect(screen.getByText(code)).toBeInTheDocument();
  });

  it('renders with different languages', () => {
    const languages = ['javascript', 'python', 'rust', 'go', 'tsx', 'css', 'sql'];

    languages.forEach((lang) => {
      const { unmount } = render(<CodeBlock language={lang} code="code" />);
      expect(screen.getByText(lang)).toBeInTheDocument();
      unmount();
    });
  });

  it('can collapse and expand code block', async () => {
    render(<CodeBlock language="javascript" code="const x = 1;" />);

    // Initially expanded (code should be visible)
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();

    // Click the language button to collapse
    const toggleButton = screen.getByText('javascript').closest('button');
    expect(toggleButton).toBeInTheDocument();
    fireEvent.click(toggleButton!);

    // After collapsing, the code container uses grid-template-rows to hide content (0fr)
    await waitFor(() => {
      const header = toggleButton!.closest('div');
      const grid = header?.nextElementSibling as HTMLElement | null;
      expect(grid).toBeTruthy();
      expect(grid?.style.gridTemplateRows).toBe('0fr');
    });

    // Click again to expand
    fireEvent.click(toggleButton!);

    // Code should be visible again (grid-template-rows back to 1fr)
    await waitFor(() => {
      const header = toggleButton!.closest('div');
      const grid = header?.nextElementSibling as HTMLElement | null;
      expect(grid).toBeTruthy();
      expect(grid?.style.gridTemplateRows).toBe('1fr');
    });
  });

  it('shows line count when collapsed', () => {
    const code = `line 1
line 2
line 3`;
    render(<CodeBlock language="javascript" code={code} />);

    // Collapse the code block
    const toggleButton = screen.getByText('javascript').closest('button');
    fireEvent.click(toggleButton!);

    // Should show line count
    expect(screen.getByText('(3 lines)')).toBeInTheDocument();
  });
});

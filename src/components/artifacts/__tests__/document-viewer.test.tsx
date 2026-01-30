import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocumentViewer } from "../document-viewer";

// Mock MarkdownRenderer
vi.mock("@/components/markdown/markdown-renderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="doc-content">{content}</div>
  ),
}));

describe("DocumentViewer", () => {
  it("renders document title from YAML frontmatter", () => {
    const content = `---\ntitle: My Document\nauthor: Jane Doe\ndate: 2026-01-30\n---\n# Introduction\nSome text.`;
    render(<DocumentViewer content={content} />);
    expect(screen.getByText("My Document")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("renders table of contents from headings", () => {
    const content = `# Heading One\n\nSome text.\n\n## Heading Two\n\nMore text.`;
    render(<DocumentViewer content={content} />);
    expect(screen.getByText("Heading One")).toBeInTheDocument();
    expect(screen.getByText("Heading Two")).toBeInTheDocument();
  });

  it("renders body content", () => {
    const content = `# Hello\n\nThis is the body.`;
    render(<DocumentViewer content={content} />);
    expect(screen.getByTestId("doc-content").textContent).toContain("Hello");
  });

  it("works without frontmatter", () => {
    const content = `# Just a heading\n\nSome body text.`;
    render(<DocumentViewer content={content} />);
    expect(screen.getByTestId("doc-content").textContent).toContain("Just a heading");
  });
});

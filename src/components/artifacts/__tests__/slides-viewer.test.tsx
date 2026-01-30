import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlidesViewer } from "../slides-viewer";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock MarkdownRenderer
vi.mock("@/components/markdown/markdown-renderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="slide-content">{content}</div>
  ),
}));

const threeSlides = `# Slide 1\nFirst slide content\n---\n# Slide 2\nSecond slide content\n---\n# Slide 3\nThird slide content`;

describe("SlidesViewer", () => {
  it("renders first slide by default", () => {
    render(<SlidesViewer content={threeSlides} />);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByTestId("slide-content").textContent).toContain("Slide 1");
  });

  it("shows slide count", () => {
    render(<SlidesViewer content={threeSlides} />);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("navigates to next slide", () => {
    render(<SlidesViewer content={threeSlides} />);
    const buttons = screen.getAllByRole("button");
    // Last button with ChevronRight is the next button
    const nextBtn = buttons[buttons.length - 1];
    fireEvent.click(nextBtn);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("disables prev on first slide", () => {
    render(<SlidesViewer content={threeSlides} />);
    const buttons = screen.getAllByRole("button");
    const prevBtn = buttons[0];
    expect(prevBtn).toBeDisabled();
  });

  it("navigates with keyboard arrows", () => {
    render(<SlidesViewer content={threeSlides} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });
});

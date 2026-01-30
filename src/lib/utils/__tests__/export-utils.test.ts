import { describe, it, expect } from "vitest";
import { parseSlides, parseCsvContent } from "../export-utils";

describe("parseSlides", () => {
  it("splits content by --- separators", () => {
    const content = "# Slide 1\nContent\n---\n# Slide 2\nMore";
    const slides = parseSlides(content);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toContain("Slide 1");
    expect(slides[1]).toContain("Slide 2");
  });

  it("filters empty slides", () => {
    const content = "# Slide 1\n---\n\n---\n# Slide 3";
    const slides = parseSlides(content);
    expect(slides).toHaveLength(2);
  });
});

describe("parseCsvContent", () => {
  it("parses headers and rows", async () => {
    const csv = "Name,Age,City\nAlice,30,NYC\nBob,25,London";
    const { headers, rows } = await parseCsvContent(csv);
    expect(headers).toEqual(["Name", "Age", "City"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["Alice", "30", "NYC"]);
  });

  it("handles empty content", async () => {
    const { headers, rows } = await parseCsvContent("");
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });
});

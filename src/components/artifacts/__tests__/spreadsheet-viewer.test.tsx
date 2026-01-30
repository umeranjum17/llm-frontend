import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpreadsheetViewer } from "../spreadsheet-viewer";

const csvData = `Name,Age,City\nAlice,30,New York\nBob,25,London\nCharlie,35,Tokyo`;

describe("SpreadsheetViewer", () => {
  it("renders table headers from CSV", () => {
    render(<SpreadsheetViewer content={csvData} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("City")).toBeInTheDocument();
  });

  it("renders all rows", () => {
    render(<SpreadsheetViewer content={csvData} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("filters rows with search input", () => {
    render(<SpreadsheetViewer content={csvData} />);
    const searchInput = screen.getByPlaceholderText("Search...");
    fireEvent.change(searchInput, { target: { value: "Alice" } });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("shows row count", () => {
    render(<SpreadsheetViewer content={csvData} />);
    expect(screen.getByText("3 of 3 rows")).toBeInTheDocument();
  });
});

/**
 * Lazy-loaded export utilities for artifact viewers.
 * Each function dynamically imports its library to keep bundle size small.
 */

// Helper to trigger file download
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Parse slide content by splitting on --- separators */
export function parseSlides(content: string): string[] {
  return content
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse CSV content into header + rows using PapaParse for proper handling of quoted fields */
export async function parseCsvContent(content: string): Promise<{ headers: string[]; rows: string[][] }> {
  const Papa = (await import("papaparse")).default;
  const result = Papa.parse<string[]>(content.trim(), { skipEmptyLines: true });
  if (!result.data || result.data.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = result.data;
  return { headers, rows };
}

/** Parse markdown slide content into structured text runs for pptxgenjs */
function parseMarkdownToTextProps(
  md: string
): Array<{ text: string; options: Record<string, unknown> }> {
  const lines = md.split("\n");
  const result: Array<{ text: string; options: Record<string, unknown> }> = [];

  const bodyColor = "E0E0E8";
  const headingColor = "A78BFA";
  const accentColor = "C4B5FD";

  for (const line of lines) {
    // Skip mermaid/code blocks
    if (line.trim().startsWith("```")) continue;

    // Headings
    const h1 = line.match(/^#\s+(.+)/);
    if (h1) {
      result.push({ text: h1[1] + "\n", options: { fontSize: 28, bold: true, color: headingColor, fontFace: "Arial" } });
      continue;
    }
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      result.push({ text: h2[1] + "\n", options: { fontSize: 22, bold: true, color: headingColor, fontFace: "Arial" } });
      continue;
    }
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) {
      result.push({ text: h3[1] + "\n", options: { fontSize: 18, bold: true, color: accentColor, fontFace: "Arial" } });
      continue;
    }

    // Bullet points
    const bullet = line.match(/^[\s]*[-*]\s+(.+)/);
    if (bullet) {
      const text = bullet[1]
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1");
      result.push({ text: "  • " + text + "\n", options: { fontSize: 14, color: bodyColor, fontFace: "Arial" } });
      continue;
    }

    // Numbered list
    const numbered = line.match(/^[\s]*\d+\.\s+(.+)/);
    if (numbered) {
      const text = numbered[1]
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1");
      result.push({ text: "  " + line.match(/^\s*(\d+)/)![1] + ". " + text + "\n", options: { fontSize: 14, color: bodyColor, fontFace: "Arial" } });
      continue;
    }

    // Regular text (strip inline markdown)
    if (line.trim()) {
      const text = line
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1");
      result.push({ text: text + "\n", options: { fontSize: 14, color: bodyColor, fontFace: "Arial" } });
    } else {
      result.push({ text: "\n", options: { fontSize: 10, color: bodyColor } });
    }
  }

  return result;
}

/** Export slides to PPTX using pptxgenjs */
export async function exportSlidesToPptx(content: string, title: string = "Presentation") {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const slides = parseSlides(content);

  const pptx = new PptxGenJS();
  pptx.title = title;
  pptx.layout = "LAYOUT_WIDE";

  for (const slideContent of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: "1A1A2E" };

    const textProps = parseMarkdownToTextProps(slideContent);
    slide.addText(textProps, {
      x: 0.6,
      y: 0.5,
      w: "88%",
      h: "85%",
      valign: "top",
      wrap: true,
      paraSpaceAfter: 4,
    });
  }

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  downloadBlob(blob, `${title}.pptx`);
}

/** Export content to PDF using jspdf + html2canvas */
export async function exportToPdf(element: HTMLElement, title: string = "Document") {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [canvas.width / 2, canvas.height / 2],
  });

  pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
  pdf.save(`${title}.pdf`);
}

/** Export markdown content to DOCX using docx library */
export async function exportToDocx(content: string, title: string = "Document") {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const lines = content.split("\n");
  const children: any[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingLevelMap: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
      };
      children.push(
        new Paragraph({
          heading: headingLevelMap[level] || HeadingLevel.HEADING_1,
          children: [new TextRun(headingMatch[2])],
        })
      );
    } else if (line.trim()) {
      children.push(
        new Paragraph({
          children: [new TextRun(line)],
        })
      );
    } else {
      children.push(new Paragraph({}));
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${title}.docx`);
}

/** Export data to XLSX using SheetJS */
export async function exportToXlsx(content: string, title: string = "Spreadsheet") {
  const XLSX = await import("xlsx");
  const { headers, rows } = await parseCsvContent(content);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, `${title}.xlsx`);
}

/** Export data to CSV (native, no library needed) */
export function exportToCsv(content: string, title: string = "Spreadsheet") {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${title}.csv`);
}

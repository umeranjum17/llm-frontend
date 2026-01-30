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

/** Parse CSV content into header + rows */
export function parseCsvContent(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => line.split(",").map((c) => c.trim()));
  return { headers, rows };
}

/** Export slides to PPTX using pptxgenjs */
export async function exportSlidesToPptx(content: string, title: string = "Presentation") {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const slides = parseSlides(content);

  const pptx = new PptxGenJS();
  pptx.title = title;

  for (const slideContent of slides) {
    const slide = pptx.addSlide();
    slide.addText(slideContent, {
      x: 0.5,
      y: 0.5,
      w: "90%",
      h: "80%",
      fontSize: 14,
      fontFace: "Arial",
      valign: "top",
      wrap: true,
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
  const { headers, rows } = parseCsvContent(content);

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

const MAX_PDF_PAGES = 500;
const MAX_EXTRACTED_TEXT_CHARS = 200_000;

export async function extractTextFromFile(file: File): Promise<string> {
  const fileType = file.name.split(".").pop()?.toLowerCase();

  // Plain text files
  if (["txt", "md", "csv", "json", "js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "h", "html", "css"].includes(fileType || "")) {
    return await file.text();
  }

  // PDF files — client-side extraction via pdf.js
  if (fileType === "pdf") {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      // Use CDN worker — import.meta.url is unreliable with Next.js webpack bundling
      const pdfjsVersion = pdfjsLib.version || "5.4.530";
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];

      const totalPages = pdf.numPages;
      const pagesToExtract = Math.min(totalPages, MAX_PDF_PAGES);

      for (let i = 1; i <= pagesToExtract; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((item: any) => item.str)
          .join(" ");
        pages.push(`--- Page ${i} ---\n\n${text}`);
      }

      // Check if all pages have empty text (scanned/image-only PDF)
      const hasText = pages.some(p => p.replace(/--- Page \d+ ---/, "").trim().length > 0);
      if (pages.length === 0 || !hasText) {
        return `[PDF file: ${file.name}]\n\nNo extractable text found. The PDF may contain only images.`;
      }

      let result = pages.join("\n\n");
      if (totalPages > MAX_PDF_PAGES) {
        result += `\n\n[Truncated — extracted first ${MAX_PDF_PAGES} of ${totalPages} pages]`;
      }
      if (result.length > MAX_EXTRACTED_TEXT_CHARS) {
        result = result.slice(0, MAX_EXTRACTED_TEXT_CHARS) + `\n\n[Truncated — text exceeded ${MAX_EXTRACTED_TEXT_CHARS} characters]`;
      }
      return result;
    } catch (error) {
      return `[PDF file: ${file.name}]\n\nFailed to extract text: ${error instanceof Error ? error.message : "unknown error"}. Try exporting the PDF as plain text.`;
    }
  }

  // DOCX files — client-side extraction via mammoth
  if (fileType === "docx") {
    try {
      const mammothModule = await import("mammoth");
      const mammoth = mammothModule.default ?? mammothModule;
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (!result.value.trim()) {
        return `[DOCX file: ${file.name}]\n\nNo extractable text found.`;
      }
      let text = result.value;
      if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
        text = text.slice(0, MAX_EXTRACTED_TEXT_CHARS) + `\n\n[Truncated — text exceeded ${MAX_EXTRACTED_TEXT_CHARS} characters]`;
      }
      return text;
    } catch (error) {
      return `[DOCX file: ${file.name}]\n\nFailed to extract text: ${error instanceof Error ? error.message : "unknown error"}. Try exporting the document as plain text.`;
    }
  }

  // Unsupported file type — including .doc (only .docx is supported)
  throw new Error(`Unsupported file type: .${fileType}. ${fileType === "doc" ? "Please save as .docx instead." : ""}`);
}

export function getFileIcon(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "pdf":
      return "📄";
    case "docx":
    case "doc":
      return "📝";
    case "txt":
    case "md":
      return "📃";
    case "csv":
      return "📊";
    case "json":
      return "📋";
    case "js":
    case "ts":
    case "tsx":
    case "jsx":
      return "⚙️";
    case "py":
      return "🐍";
    case "java":
      return "☕";
    default:
      return "📁";
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

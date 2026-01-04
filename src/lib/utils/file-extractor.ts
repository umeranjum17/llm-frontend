export async function extractTextFromFile(file: File): Promise<string> {
  const fileType = file.name.split(".").pop()?.toLowerCase();

  // Plain text files
  if (["txt", "md", "csv", "json", "js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "html", "css"].includes(fileType || "")) {
    return await file.text();
  }

  // PDF files
  if (fileType === "pdf") {
    try {
      // For PDF, we'll use pdf-parse in Node.js environment
      // In browser, we need a different approach
      // For now, return a placeholder
      return `[PDF file: ${file.name}]\n\nPDF text extraction requires server-side processing. Please use a plain text export of this PDF or use the file upload feature in the desktop version.`;
    } catch (error) {
      throw new Error(`Failed to extract text from PDF: ${error}`);
    }
  }

  // DOCX files
  if (fileType === "docx") {
    try {
      // Similar to PDF, mammoth requires server-side processing
      // Return placeholder for now
      return `[DOCX file: ${file.name}]\n\nWord document text extraction requires server-side processing. Please export this document to TXT or MD format.`;
    } catch (error) {
      throw new Error(`Failed to extract text from DOCX: ${error}`);
    }
  }

  // Unsupported file type
  throw new Error(`Unsupported file type: ${fileType}`);
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

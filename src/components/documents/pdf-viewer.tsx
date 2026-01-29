"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
// Lazy-load react-pdf and pdfjs-dist only when a PDF is opened
let ReactPDF: { Document: React.ComponentType<any>; Page: React.ComponentType<any> } | null = null;

async function loadReactPDF() {
  if (!ReactPDF) {
    const reactPdf = await import("react-pdf");
    // @ts-ignore -- CSS imports have no type declarations
    await import("react-pdf/dist/Page/AnnotationLayer.css");
    // @ts-ignore -- CSS imports have no type declarations
    await import("react-pdf/dist/Page/TextLayer.css");
    reactPdf.pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${reactPdf.pdfjs.version}/pdf.worker.min.js`;
    ReactPDF = { Document: reactPdf.Document, Page: reactPdf.Page };
  }
  return ReactPDF;
}

interface PDFViewerProps {
  file: string | File | ArrayBuffer;
  className?: string;
}

export function PDFViewer({ file, className }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfComponents, setPdfComponents] = useState<typeof ReactPDF>(null);

  useEffect(() => {
    loadReactPDF().then(setPdfComponents).catch((err) => {
      setError(`Failed to load PDF viewer: ${err.message}`);
      setLoading(false);
    });
  }, []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }

  function onDocumentLoadError(error: Error) {
    setError(`Failed to load PDF: ${error.message}`);
    setLoading(false);
  }

  const goToPrevPage = () => {
    setPageNumber((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setPageNumber((prev) => Math.min(numPages, prev + 1));
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(3.0, prev + 0.2));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(0.5, prev - 0.2));
  };

  const rotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="text-center p-8">
          <p className="text-destructive mb-2">Error loading PDF</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Controls */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/30 gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            Page {pageNumber} of {numPages || "?"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextPage}
            disabled={pageNumber >= numPages || loading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={zoomOut} disabled={loading}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm min-w-[60px] text-center">{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="sm" onClick={zoomIn} disabled={loading}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={rotate} disabled={loading}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <ScrollArea className="flex-1">
        <div className="flex justify-center p-4">
          {pdfComponents ? (
            <pdfComponents.Document
              file={file}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex items-center justify-center p-8">
                  <p className="text-muted-foreground">Loading PDF...</p>
                </div>
              }
            >
              <pdfComponents.Page
                pageNumber={pageNumber}
                scale={scale}
                rotate={rotation}
                className="shadow-lg"
                loading={
                  <div className="flex items-center justify-center p-8">
                    <p className="text-muted-foreground">Loading page...</p>
                  </div>
                }
              />
            </pdfComponents.Document>
          ) : (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Loading PDF viewer...</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}





"use client";

import { isValidElement, memo, createContext, useContext, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkGemoji from "remark-gemoji";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import dynamic from "next/dynamic";
import { CodeBlock } from "./code-block";
import { SkillDefinitionBlock } from "./skill-definition-block";
import { AgentDefinitionBlock } from "./agent-definition-block";
import "katex/dist/katex.min.css";

const MermaidDiagram = dynamic(() => import("./mermaid-diagram").then(m => ({ default: m.MermaidDiagram })), {
  loading: () => <div className="animate-pulse bg-muted rounded-lg h-32 my-4" />,
  ssr: false,
});

const ChartRenderer = dynamic(() => import("./chart-renderer").then(m => ({ default: m.ChartRenderer })), {
  loading: () => <div className="animate-pulse bg-muted rounded-lg h-32 my-4" />,
  ssr: false,
});

// Context to collect code blocks for multi-file project detection
export interface CodeFile {
  language: string;
  filename: string | null;
  code: string;
}

interface CodeBlockContextType {
  registerCodeBlock: (file: CodeFile) => void;
  getCodeBlocks: () => CodeFile[];
}

export const CodeBlockContext = createContext<CodeBlockContextType | null>(null);

// Parse language:filename format (e.g., "html:index.html", "css:styles/main.css")
function parseCodeFenceInfo(className: string): { language: string; filename: string | null } {
  const match = /language-(\S+)/.exec(className);
  if (!match) return { language: "", filename: null };

  const info = match[1];
  const colonIndex = info.indexOf(":");

  if (colonIndex > 0) {
    return {
      language: info.slice(0, colonIndex),
      filename: info.slice(colonIndex + 1),
    };
  }

  return { language: info, filename: null };
}

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  onCodeBlocksCollected?: (blocks: CodeFile[]) => void;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  isStreaming = false,
  onCodeBlocksCollected
}: MarkdownRendererProps) {
  // Collect code blocks for multi-file project detection
  const codeBlocksRef = useRef<CodeFile[]>([]);

  const registerCodeBlock = useCallback((file: CodeFile) => {
    // Avoid duplicates
    const exists = codeBlocksRef.current.some(
      f => f.code === file.code && f.language === file.language
    );
    if (!exists) {
      codeBlocksRef.current.push(file);
      onCodeBlocksCollected?.(codeBlocksRef.current);
    }
  }, [onCodeBlocksCollected]);

  const getCodeBlocks = useCallback(() => codeBlocksRef.current, []);

  const contextValue = { registerCodeBlock, getCodeBlocks };

  return (
    <CodeBlockContext.Provider value={contextValue}>
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [remarkMath, { singleDollarTextMath: false }],
          remarkGemoji,
          remarkBreaks,
        ]}
        rehypePlugins={[
          rehypeRaw,
          rehypeKatex,
          [rehypeSanitize, {
            ...defaultSchema,
            tagNames: [...(defaultSchema.tagNames || []), "span", "math", "semantics", "mrow", "mi", "mo", "mn", "msup", "msub", "mfrac", "munderover", "mover", "munder", "msqrt", "mroot", "mtable", "mtr", "mtd", "mtext", "mspace", "annotation"],
            attributes: {
              ...defaultSchema.attributes,
              "*": [...(defaultSchema.attributes?.["*"] || []), "className", "class", "style", "aria-hidden"],
              span: [...(defaultSchema.attributes?.["span"] || []), "className", "class", "style", "aria-hidden"],
              math: ["xmlns"],
              annotation: ["encoding"],
            },
          }],
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: "wrap" }],
        ]}
        components={{
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children;
            if (!isValidElement(child)) {
              return <pre>{children}</pre>;
            }

            const className = String((child.props as { className?: unknown }).className || "");
            // Parse language:filename format (e.g., "html:index.html")
            const { language, filename } = parseCodeFenceInfo(className);

            // Handle children that could be string, array of strings, or nested arrays
            const rawChildren = (child.props as { children?: unknown }).children;
            const code = (Array.isArray(rawChildren)
              ? rawChildren.flat(Infinity).join("")
              : String(rawChildren || "")
            ).replace(/\n$/, "");

            // Handle mermaid diagrams - only render after streaming completes to avoid parse errors
            if (language === "mermaid") {
              if (isStreaming) {
                return <CodeBlock language={language} code={code} filename={null} isStreaming={isStreaming} />;
              }
              return <MermaidDiagram code={code} />;
            }

            // Handle chart/graph data (JSON-based charts) - only render after streaming completes
            if (language === "chart" || language === "graph") {
              if (isStreaming) {
                return <CodeBlock language={language} code={code} filename={null} isStreaming={isStreaming} />;
              }
              return <ChartRenderer code={code} />;
            }

            // Handle skill definitions - only render after streaming completes to avoid JSON parse errors
            if (language === "skill") {
              // During streaming, show JSON unless content appears complete
              // This handles race conditions where streaming state isn't cleared promptly
              if (isStreaming) {
                try {
                  // If we can parse valid JSON with required skill fields, render as skill block
                  const parsed = JSON.parse(code);
                  if (parsed && parsed.name && parsed.systemPrompt) {
                    return <SkillDefinitionBlock code={code} />;
                  }
                } catch {
                  // Invalid JSON - still streaming, show as JSON code block
                }
                return <CodeBlock language="json" code={code} filename={null} isStreaming={isStreaming} />;
              }
              return <SkillDefinitionBlock code={code} />;
            }

            // Handle agent definitions - only render after streaming completes
            if (language === "agent") {
              if (isStreaming) {
                return <CodeBlock language="json" code={code} filename={null} isStreaming={isStreaming} />;
              }
              return <AgentDefinitionBlock code={code} />;
            }

            return (
              <CodeBlock
                language={language}
                code={code}
                filename={filename}
                isStreaming={isStreaming}
              />
            );
          },
        code: ({ node, className, children, ...props }) => {
          // If className contains "language-", it's a fenced code block handled by <pre> — render plain
          if (className && /language-/.test(className)) {
            return <code className={className} {...props}>{children}</code>;
          }
          // Inline code
          return (
            <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
              {children}
            </code>
          );
        },
        a: ({ node, children, href, ...props }) => {
          // Block javascript: URLs to prevent XSS
          const isUnsafe = href?.trim().toLowerCase().startsWith("javascript:");
          
          // Ensure links break properly and don't overflow
          const linkClassName = "break-all text-primary hover:underline";
          const safeHref = isUnsafe ? "#blocked" : href;

          // Check if this is a "View Image" link that should be rendered as an inline image
          const linkText = typeof children === "string" ? children :
            (Array.isArray(children) && typeof children[0] === "string" ? children[0] : "");
          const isViewImageLink = /^view\s*image$/i.test(linkText.trim());

          // Check if URL looks like an image (common image extensions or image hosting domains)
          const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|avif)(\?.*)?$/i;
          const imageHostingDomains = /(images\.unsplash\.com|i\.imgur\.com|pbs\.twimg\.com|cdn\.discordapp\.com|upload\.wikimedia\.org|googleusercontent\.com|bing\.com\/th|serpapi\.com|gstatic\.com|pinimg\.com|flickr\.com|staticflickr\.com|media\.tumblr\.com|redd\.it|preview\.redd\.it|external-preview\.redd\.it|gettyimages\.com|istockphoto\.com|shutterstock\.com|alamy\.com|depositphotos\.com|dreamstime\.com|fotolia\.com|123rf\.com|rawpixel\.com|pixabay\.com|pexels\.com|freepik\.com|stock\.adobe\.com|licdn\.com|fbcdn\.net|twimg\.com|cdninstagram\.com|media-amazon\.com|ssl-images-amazon\.com|googleapis\.com|cloudfront\.net|akamaihd\.net)/i;
          // Also check for common image URL patterns (query params containing image indicators)
          const imageUrlPatterns = /[?&](image|img|photo|pic|thumb|w=|h=|width=|height=|format=)/i;
          const isImageUrl = href && (imageExtensions.test(href) || imageHostingDomains.test(href) || imageUrlPatterns.test(href));

          // Render as image if it's a "View Image" link - if URL detection fails, still try to render
          // since the AI specifically labeled it as an image link
          if (isViewImageLink && !isUnsafe && href) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={href}
                alt="Image"
                className="rounded-lg my-2 max-w-full max-h-80 object-contain"
                loading="lazy"
              />
            );
          }

          return (
            <a
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClassName}
              style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}
              onClick={isUnsafe ? (e) => e.preventDefault() : undefined}
              {...props}
            >
              {children}
            </a>
          );
        },
        table: ({ node, children, ...props }) => (
          <div className="my-4 -mx-3 sm:mx-0">
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
              <div className="inline-block min-w-full align-middle px-3 sm:px-0">
                <div className="overflow-hidden rounded-lg border border-border/60 shadow-sm">
                  <table className="min-w-full divide-y divide-border/60" {...props}>
                    {children}
                  </table>
                </div>
              </div>
            </div>
          </div>
        ),
        thead: ({ node, children, ...props }) => (
          <thead className="bg-muted/60" {...props}>
            {children}
          </thead>
        ),
        th: ({ node, children, ...props }) => (
          <th
            className="px-3 py-2.5 sm:px-4 sm:py-3 text-left text-xs font-semibold text-foreground/90 uppercase tracking-wider whitespace-nowrap"
            {...props}
          >
            {children}
          </th>
        ),
        td: ({ node, children, ...props }) => (
          <td
            className="px-3 py-3 sm:px-4 sm:py-4 text-sm text-foreground/80 align-top"
            {...props}
          >
            <div className="max-w-xs sm:max-w-sm md:max-w-md lg:max-w-none">
              {children}
            </div>
          </td>
        ),
        tr: ({ node, children, ...props }) => (
          <tr className="border-b border-border/40 last:border-b-0 hover:bg-muted/40 transition-colors" {...props}>
            {children}
          </tr>
        ),
        blockquote: ({ node, children, ...props }) => (
          <blockquote
            className="border-l-4 border-primary pl-4 italic my-4"
            {...props}
          >
            {children}
          </blockquote>
        ),
        ul: ({ node, children, ...props }) => (
          <ul className="my-3 ml-6 list-disc" {...props}>
            {children}
          </ul>
        ),
        ol: ({ node, children, ...props }) => (
          <ol className="my-3 ml-6 list-decimal" {...props}>
            {children}
          </ol>
        ),
        li: ({ node, children, ...props }) => (
          <li className="my-1" {...props}>
            {children}
          </li>
        ),
        h1: ({ node, children, ...props }) => (
          <h1 id={props.id} className="text-2xl font-bold mt-6 mb-4 scroll-mt-4" {...props}>
            {children}
          </h1>
        ),
        h2: ({ node, children, ...props }) => (
          <h2 id={props.id} className="text-xl font-bold mt-5 mb-3 scroll-mt-4" {...props}>
            {children}
          </h2>
        ),
        h3: ({ node, children, ...props }) => (
          <h3 id={props.id} className="text-lg font-semibold mt-4 mb-2 scroll-mt-4" {...props}>
            {children}
          </h3>
        ),
        p: ({ node, children, ...props }) => (
          <p className="my-3 leading-7" {...props}>
            {children}
          </p>
        ),
        img: ({ node, src, alt, ...props }) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            className="rounded-lg my-4 max-w-full"
            {...props}
          />
        ),
        hr: ({ node, ...props }) => (
          <hr className="my-6 border-border" {...props} />
        ),
        }}
      >
        {content}
      </ReactMarkdown>
    </CodeBlockContext.Provider>
  );
});

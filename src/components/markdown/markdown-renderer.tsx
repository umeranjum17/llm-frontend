"use client";

import { isValidElement, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkGemoji from "remark-gemoji";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { CodeBlock } from "./code-block";
import "katex/dist/katex.min.css";

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[
        remarkGfm,
        remarkMath,
        remarkGemoji,
        remarkBreaks,
      ]}
      rehypePlugins={[
        rehypeRaw,
        rehypeSanitize,
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "wrap" }],
        rehypeKatex,
      ]}
      components={{
        pre: ({ children }) => {
          const child = Array.isArray(children) ? children[0] : children;
          if (!isValidElement(child)) {
            return <pre>{children}</pre>;
          }

          const className = String((child.props as { className?: unknown }).className || "");
          const match = /language-(\w+)/.exec(className);
          const language = match ? match[1] : "";
          const code = String((child.props as { children?: unknown }).children || "").replace(/\n$/, "");

          return <CodeBlock language={language} code={code} />;
        },
        code: ({ node, className, children, ...props }) => (
          <code className={className} {...props}>
            {children}
          </code>
        ),
        a: ({ node, children, href, ...props }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
            {...props}
          >
            {children}
          </a>
        ),
        table: ({ node, children, ...props }) => (
          <div className="my-4 overflow-x-auto">
            <table className="w-full border-collapse" {...props}>
              {children}
            </table>
          </div>
        ),
        th: ({ node, children, ...props }) => (
          <th
            className="border bg-muted px-4 py-2 text-left font-semibold"
            {...props}
          >
            {children}
          </th>
        ),
        td: ({ node, children, ...props }) => (
          <td className="border px-4 py-2" {...props}>
            {children}
          </td>
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
  );
});

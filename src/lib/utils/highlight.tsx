"use client";

import { cloneElement, isValidElement, type ReactNode } from "react";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSkippableElementType(type: unknown) {
  // Avoid highlighting inside code/pre blocks where formatting matters.
  return type === "code" || type === "pre";
}

export function highlightString(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;

  const re = new RegExp(escapeRegExp(q), "gi");
  const matches = Array.from(text.matchAll(re));
  if (matches.length === 0) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of matches) {
    const start = match.index ?? -1;
    if (start < 0) continue;
    const end = start + match[0].length;

    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={`m:${start}:${end}`}
        className="rounded bg-yellow-200/60 px-0.5 dark:bg-yellow-500/30"
      >
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function highlightReactNode(node: ReactNode, query: string): ReactNode {
  const q = query.trim();
  if (!q) return node;

  if (typeof node === "string") return highlightString(node, q);
  if (typeof node === "number") return highlightString(String(node), q);
  if (node == null || typeof node === "boolean") return node;

  if (Array.isArray(node)) {
    return node.map((child, i) => <span key={`h:${i}`}>{highlightReactNode(child, q)}</span>);
  }

  if (isValidElement(node)) {
    if (isSkippableElementType(node.type)) return node;

    const children = (node.props as { children?: ReactNode }).children;
    if (children === undefined) return node;

    return cloneElement(node, undefined, highlightReactNode(children, q));
  }

  return node;
}

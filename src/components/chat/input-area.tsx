"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, Loader2, Paperclip, X, FileText, Image as ImageIcon, Mic, Square, Star, Code2, ChevronDown, ChevronUp } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useChatKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { TokenDisplay } from "./token-display";
import { getChatById, getProjectFiles, getChatsByProject, getAllAgents, getAllTags, getMessages } from "@/lib/db/queries";
import { countMessagesTokens, countTokens } from "@/lib/utils/token-counter";
import { getModelById } from "@/lib/constants/models";
import { BUILTIN_AGENTS } from "@/lib/constants/agents";
import { toast } from "sonner";
import type { MessageContentPart, Skill } from "@/lib/db/schema";
import { MentionTextarea } from "@/components/chat/mention-textarea";
import { MentionItem } from "@/lib/mentions/types";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { SkillQuickSelect } from "@/components/chat/skill-quick-select";
import { MobileNavInline } from "@/components/mobile-nav";

interface InputAreaProps {
  chatId: string;
}

interface TextAttachment {
  name: string;
  content: string;
  size: number;
}

interface ImageAttachment {
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
}

interface CodeSnippet {
  id: string;
  content: string;
  language: string | null;
  lineCount: number;
}

const MAX_TEXT_ATTACHMENT_BYTES = 1024 * 1024 * 2; // 2MB
const MAX_IMAGE_ATTACHMENT_BYTES = 1024 * 1024 * 5; // 5MB
const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_TEXT_ATTACHMENTS = 10;
const MAX_TOTAL_ATTACHMENTS = 12; // Total limit for all attachments combined
const CODE_SNIPPET_LINE_THRESHOLD = 3; // Minimum lines to treat as code snippet

// Detect if text looks like code
function detectCode(text: string): { isCode: boolean; language: string | null } {
  const lines = text.split('\n');
  const lineCount = lines.length;

  // Single line or very short text - not a code snippet
  if (lineCount < CODE_SNIPPET_LINE_THRESHOLD) {
    return { isCode: false, language: null };
  }

  // Language detection patterns
  const patterns: { language: string; patterns: RegExp[] }[] = [
    {
      language: 'typescript', patterns: [
        /^import\s+.*from\s+['"]/, /^export\s+(default\s+)?(function|class|const|interface|type)/,
        /:\s*(string|number|boolean|void|any)\b/, /<[A-Z]\w*>/
      ]
    },
    {
      language: 'javascript', patterns: [
        /^import\s+.*from\s+['"]/, /^export\s+(default\s+)?(function|class|const)/,
        /^const\s+\w+\s*=\s*(async\s+)?\(/, /^function\s+\w+\s*\(/
      ]
    },
    {
      language: 'python', patterns: [
        /^def\s+\w+\s*\(/, /^class\s+\w+[:(]/, /^import\s+\w+/, /^from\s+\w+\s+import/,
        /^\s*if\s+__name__\s*==\s*['"]__main__['"]/
      ]
    },
    {
      language: 'java', patterns: [
        /^public\s+(static\s+)?(class|void|int|String)/, /^private\s+/, /^package\s+\w+/,
        /System\.(out|err)\.print/
      ]
    },
    {
      language: 'rust', patterns: [
        /^fn\s+\w+/, /^pub\s+(fn|struct|enum|mod)/, /^use\s+\w+::/, /^impl\s+/,
        /let\s+mut\s+\w+/
      ]
    },
    {
      language: 'go', patterns: [
        /^package\s+\w+/, /^func\s+(\(\w+\s+\*?\w+\)\s+)?\w+\s*\(/, /^import\s+\(/,
        /fmt\.(Print|Sprintf)/
      ]
    },
    {
      language: 'html', patterns: [
        /^<!DOCTYPE\s+html/i, /^<html/, /<\/?(div|span|head|body|script|style)\b/
      ]
    },
    {
      language: 'css', patterns: [
        /^\.[a-z][\w-]*\s*\{/, /^#[a-z][\w-]*\s*\{/, /^@media\s+/, /^@import\s+/
      ]
    },
    {
      language: 'json', patterns: [
        /^\s*\{[\s\S]*"[\w]+"\s*:/, /^\s*\[[\s\S]*\{/
      ]
    },
    {
      language: 'sql', patterns: [
        /^SELECT\s+/i, /^INSERT\s+INTO/i, /^CREATE\s+TABLE/i, /^UPDATE\s+\w+\s+SET/i
      ]
    },
    {
      language: 'bash', patterns: [
        /^#!\/bin\/(bash|sh)/, /^\s*\$\s+\w+/, /^(sudo|npm|yarn|pip|git|docker)\s+/
      ]
    },
  ];

  // Check for specific language patterns
  for (const { language, patterns: langPatterns } of patterns) {
    for (const pattern of langPatterns) {
      for (const line of lines.slice(0, 10)) { // Check first 10 lines
        if (pattern.test(line)) {
          return { isCode: true, language };
        }
      }
    }
  }

  // Generic code indicators
  const codeIndicators = [
    /^\s*(const|let|var|function|class|def|fn|pub|import|export|return|if|else|for|while)\b/,
    /[{}();]$/, // Line ends with code punctuation
    /^\s*\/\//, // Single-line comment
    /^\s*\/\*/, // Multi-line comment start
    /^\s*#\s*\w+/, // Preprocessor or comment
    /^\s*@\w+/, // Decorators
    /=>\s*\{/, // Arrow functions
    /\)\s*\{/, // Function bodies
  ];

  let codeLineCount = 0;
  for (const line of lines) {
    for (const indicator of codeIndicators) {
      if (indicator.test(line)) {
        codeLineCount++;
        break;
      }
    }
  }

  // If more than 30% of lines look like code, treat as code
  if (codeLineCount / lineCount > 0.3) {
    return { isCode: true, language: null };
  }

  // Check for consistent indentation (common in code)
  const indentedLines = lines.filter(l => /^\s{2,}/.test(l)).length;
  if (indentedLines / lineCount > 0.4 && lineCount >= 5) {
    return { isCode: true, language: null };
  }

  return { isCode: false, language: null };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function toSlashCommand(title: string) {
  return `/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

export function InputArea({ chatId }: InputAreaProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<TextAttachment[]>([]);
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [codeSnippets, setCodeSnippets] = useState<CodeSnippet[]>([]);
  const [expandedSnippets, setExpandedSnippets] = useState<Set<string>>(new Set());
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage, isLoading, cancelRequest } = useChat(chatId);
  const voice = useVoiceInput();
  const [voiceDraft, setVoiceDraft] = useState("");
  const wasListeningRef = useRef(false);

  const chat = useLiveQuery(() => getChatById(chatId), [chatId]);
  const agents = useLiveQuery(() => getAllAgents(), []);
  const tags = useLiveQuery(() => getAllTags(), []);

  // New: Fetch additional mention data
  const files = useLiveQuery(() => (chat?.projectId ? getProjectFiles(chat.projectId) : []), [chat?.projectId]);
  const otherChats = useLiveQuery(() => getChatsByProject(chat?.projectId || ""), [chat?.projectId]);

  // Listen for external send messages (e.g., from command palette)
  useEffect(() => {
    const handleExternalSend = (e: any) => {
      if (e.detail?.content) {
        handleSubmit(undefined, e.detail.content);
      }
    };
    window.addEventListener("lumina:send-message", handleExternalSend as EventListener);

    return () => {
      window.removeEventListener("lumina:send-message", handleExternalSend as EventListener);
    };
  }, []);

  // Focus input when chat changes or new chat is created
  useEffect(() => {
    // Small delay to ensure the component is fully rendered
    const timeoutId = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [chatId]);

  // Listen for chat created event to focus input
  useEffect(() => {
    const handleChatCreated = (e: any) => {
      // Only focus if this is the current chat
      if (e.detail?.chatId === chatId) {
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
          }
        }, 150);
      }
    };

    window.addEventListener("lumina:chat-created", handleChatCreated as EventListener);
    return () => window.removeEventListener("lumina:chat-created", handleChatCreated as EventListener);
  }, [chatId]);

  // Construct mention items
  // @ = agents, connectors
  // # = chats, tags
  const mentionItems = useMemo<MentionItem[]>(() => {
    const items: MentionItem[] = [];

    // === @ TRIGGER: Agents, Prompts, Connectors ===

    // Agents (@ trigger)
    if (agents) {
      const builtInIds = new Set(BUILTIN_AGENTS.map((agent) => agent.id));
      agents.forEach(a => {
        if (!a.isActive) return;
        if (a.isBuiltIn && !builtInIds.has(a.id)) return;
        items.push({
          id: a.id,
          type: "agent",
          label: a.name,
          value: `@agent:${a.id}[${a.name}]`,
          description: a.description || "AI Assistant",
          metadata: { agent: a },
          trigger: "@",
        });
      });
    }

    // Files (@ trigger)
    if (files) {
      files.forEach(f => {
        items.push({
          id: f.id,
          type: "file",
          label: f.name,
          value: f.name,
          description: `${(f.size / 1024).toFixed(1)}KB`,
          trigger: "@",
        });
      });
    }

    // === # TRIGGER: Chats, Tags ===

    // Chats (# trigger)
    if (otherChats) {
      otherChats.forEach(c => {
        if (c.id === chatId) return; // Exclude current chat
        items.push({
          id: c.id,
          type: "chat",
          label: c.title,
          value: `#chat:${c.id}[${c.title}]`,
          description: "Chat history",
          trigger: "#",
        });
      });
    }

    // Tags (# trigger)
    if (tags) {
      tags.forEach(t => {
        items.push({
          id: t.id,
          type: "tag",
          label: t.name,
          value: `#tag:${t.id}[${t.name}]`,
          description: `${t.usageCount || 0} uses`,
          trigger: "#",
        });
      });
    }

    return items;
  }, [files, otherChats, chatId, agents, tags]);

  // Handle submit function for keyboard shortcut
  const handleSubmitMessage = () => {
    if ((input.trim() || attachments.length > 0 || imageAttachments.length > 0 || codeSnippets.length > 0) && !isLoading) {
      // Append code snippets as markdown code blocks
      let message = input.trim();
      if (codeSnippets.length > 0) {
        const snippetText = codeSnippets
          .map((s) => `\`\`\`${s.language || ''}\n${s.content}\n\`\`\``)
          .join('\n\n');
        message = message ? `${message}\n\n${snippetText}` : snippetText;
      }

      const currentAttachments = [...attachments]; // Capture current state
      const currentImages = [...imageAttachments];

      const currentSkill = selectedSkill;

      setInput("");
      setAttachments([]); // Clear state immediately
      setImageAttachments([]);
      setCodeSnippets([]);
      setExpandedSnippets(new Set());
      setSelectedSkill(null); // Clear skill after sending

      const contentParts: MessageContentPart[] = [
        ...(message ? [{ type: "text" as const, text: message }] : []),
        ...currentImages.map((img) => ({
          type: "image_url" as const,
          image_url: { url: img.dataUrl },
        })),
      ];

      sendMessage(currentImages.length > 0 ? contentParts : message, currentAttachments, currentSkill);
    }
  };

  // Register Cmd+Enter keyboard shortcut for sending message
  useChatKeyboardShortcuts(handleSubmitMessage);

  // Auto-resize textarea using requestAnimationFrame to avoid layout thrashing
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const resize = () => {
      const minHeight = 40; // min-h-10 = 40px
      const maxHeight = 200;

      // Reset height to measure content, but batch with rAF to avoid flash
      textarea.style.height = "inherit";
      const scrollHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${scrollHeight}px`;
    };

    const rafId = requestAnimationFrame(resize);
    return () => cancelAnimationFrame(rafId);
  }, [input]);

  useEffect(() => {
    if (voice.isListening) {
      setVoiceDraft(voice.transcript);
      wasListeningRef.current = true;
      return;
    }

    // If we just stopped listening, append the final transcript once.
    if (wasListeningRef.current) {
      wasListeningRef.current = false;
      if (voiceDraft.trim()) {
        setInput((prev) => (prev ? `${prev.trimEnd()} ${voiceDraft.trim()}` : voiceDraft.trim()));
      }
      setVoiceDraft("");
    }
  }, [voice.isListening, voice.transcript, voiceDraft]);

  useEffect(() => {
    if (voice.error) toast.error(voice.error);
  }, [voice.error]);

  const addImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;

    // Check total attachment limit
    const totalAttachments = imageAttachments.length + attachments.length;
    if (totalAttachments >= MAX_TOTAL_ATTACHMENTS) {
      toast.error(`Maximum ${MAX_TOTAL_ATTACHMENTS} total attachments per message`);
      return;
    }

    if (imageAttachments.length >= MAX_IMAGE_ATTACHMENTS) {
      toast.error(`Maximum ${MAX_IMAGE_ATTACHMENTS} images per message`);
      return;
    }

    if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
      toast.error(`Image ${file.name} is too large (max 5MB)`);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageAttachments((prev) => [
        ...prev,
        { name: file.name || "image", mime: file.type, size: file.size, dataUrl },
      ]);
    } catch {
      toast.error(`Failed to read ${file.name}`);
    }
  };

  const addTextFile = async (file: File) => {
    // Check total attachment limit
    const totalAttachments = imageAttachments.length + attachments.length;
    if (totalAttachments >= MAX_TOTAL_ATTACHMENTS) {
      toast.error(`Maximum ${MAX_TOTAL_ATTACHMENTS} total attachments per message`);
      return;
    }

    if (attachments.length >= MAX_TEXT_ATTACHMENTS) {
      toast.error(`Maximum ${MAX_TEXT_ATTACHMENTS} file attachments per message`);
      return;
    }

    if (file.size > MAX_TEXT_ATTACHMENT_BYTES) {
      toast.error(`File ${file.name} is too large (max 2MB)`);
      return;
    }

    try {
      const text = await file.text();
      setAttachments((prev) => [
        ...prev,
        {
          name: file.name,
          content: text,
          size: file.size,
        },
      ]);
    } catch {
      toast.error(`Failed to read ${file.name}`);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        // eslint-disable-next-line no-await-in-loop
        await addImageFile(file);
      } else {
        // eslint-disable-next-line no-await-in-loop
        await addTextFile(file);
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await handleFiles(files);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const removeImageAttachment = (index: number) => {
    setImageAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const removeCodeSnippet = (id: string) => {
    setCodeSnippets((prev) => prev.filter((s) => s.id !== id));
    setExpandedSnippets((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSnippetExpanded = (id: string) => {
    setExpandedSnippets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async (e?: React.FormEvent, overrideContent?: string) => {
    e?.preventDefault();
    const finalInput = overrideContent ?? input;
    if ((!finalInput.trim() && attachments.length === 0 && imageAttachments.length === 0 && codeSnippets.length === 0) || isLoading)
      return;

    // Append code snippets as markdown code blocks
    let message = finalInput.trim();
    if (codeSnippets.length > 0) {
      const snippetText = codeSnippets
        .map((s) => `\`\`\`${s.language || ''}\n${s.content}\n\`\`\``)
        .join('\n\n');
      message = message ? `${message}\n\n${snippetText}` : snippetText;
    }

    const currentAttachments = [...attachments];
    const currentImages = [...imageAttachments];
    const currentSkill = selectedSkill;

    setInput("");
    setAttachments([]);
    setImageAttachments([]);
    setCodeSnippets([]);
    setExpandedSnippets(new Set());
    setSelectedSkill(null); // Clear skill after sending

    const contentParts: MessageContentPart[] = [
      ...(message ? [{ type: "text" as const, text: message }] : []),
      ...currentImages.map((img) => ({
        type: "image_url" as const,
        image_url: { url: img.dataUrl },
      })),
    ];

    await sendMessage(currentImages.length > 0 ? contentParts : message, currentAttachments, currentSkill);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);
  };

  const MAX_FILE_MENTIONS = 5;

  const handleMentionSelect = (item: MentionItem, insertText: (text: string) => void) => {
    // Check file mention limit
    if (item.type === "file") {
      const currentFileMentions = (input.match(/@file:[^\[]+\[[^\]]+\]/g) || []).length;
      if (currentFileMentions >= MAX_FILE_MENTIONS) {
        toast.error(`Maximum of ${MAX_FILE_MENTIONS} file mentions allowed per message`);
        return;
      }
    }

    // Default insertion behavior
    let insertion = "";
    if (item.type === "file") {
      insertion = `@file:${item.id}[${item.label}]`;
    } else if (item.type === "agent") {
      insertion = `@agent:${item.id}[${item.label}]`;
    } else if (item.type === "chat") {
      insertion = `#chat:${item.id}[${item.label}]`;
    } else if (item.type === "tag") {
      insertion = `#tag:${item.id}[${item.label}]`;
    } else {
      insertion = item.value;
    }
    insertText(insertion);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // MentionTextarea handles its own keys. We just handle Enter for submission here if it bubbles up.
    // Actually MentionTextarea has a specific onEnter prop which calls this, but standard Bubbling
    // means we might not need to do anything special if we just use onKeyDown

    // However, if MentionTextarea handles the Enter (consumes it), it won't bubble or it will default prevent.
    // If it doesn't handle it (menu closed), it calls onEnter prop.
  };

  const handleMentionTextareaEnter = (e: React.KeyboardEvent) => {
    if (!e.shiftKey) {
      e.preventDefault();
      // We can call handleSubmit but we need to pass a synthetic event or just call logics.
      // handleSubmit takes React.FormEvent.
      const syntheticEvent = { preventDefault: () => { } } as React.FormEvent;
      handleSubmit(syntheticEvent);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Check for images first
    const imageItems = Array.from(items).filter((item) => item.type.startsWith("image/"));
    if (imageItems.length > 0) {
      e.preventDefault();
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (!file) continue;
        // eslint-disable-next-line no-await-in-loop
        await addImageFile(file);
      }
      return;
    }

    // Check for text that looks like code
    const text = e.clipboardData?.getData("text/plain");
    if (text) {
      const { isCode, language } = detectCode(text);
      if (isCode) {
        e.preventDefault();
        const snippet: CodeSnippet = {
          id: `snippet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          content: text,
          language,
          lineCount: text.split('\n').length,
        };
        setCodeSnippets((prev) => [...prev, snippet]);
        return;
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    await handleFiles(files);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-3xl 2xl:max-w-4xl"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Attachments Preview */}
      {(imageAttachments.length > 0 || attachments.length > 0 || codeSnippets.length > 0) && (
        <div className="mb-2 flex flex-col gap-2">
          {/* Image and file attachments row */}
          {(imageAttachments.length > 0 || attachments.length > 0) && (
            <div className="flex flex-wrap gap-2 rounded-xl border bg-background/60 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/40">
              {imageAttachments.map((img, i) => (
                <div
                  key={`${img.dataUrl}-${i}`}
                  className="relative overflow-hidden rounded-md border bg-background"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="h-16 w-16 object-cover"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={() => removeImageAttachment(i)}
                    className="absolute right-1 top-1 rounded bg-background/80 p-0.5 text-muted-foreground hover:text-foreground"
                    title="Remove image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {attachments.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-1 bg-background border rounded-md px-2 py-1 text-xs"
                >
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Remove file"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Code snippets */}
          {codeSnippets.map((snippet) => {
            const isExpanded = expandedSnippets.has(snippet.id);
            const previewLines = snippet.content.split('\n').slice(0, 4);
            const hasMore = snippet.lineCount > 4;

            return (
              <div
                key={snippet.id}
                className="rounded-xl border bg-zinc-950 shadow-sm overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Code2 className="h-3.5 w-3.5" />
                    <span>{snippet.language || 'code'}</span>
                    <span className="text-zinc-600">•</span>
                    <span>{snippet.lineCount} lines</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => toggleSnippetExpanded(snippet.id)}
                        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                        title={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeCodeSnippet(snippet.id)}
                      className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Remove snippet"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Code preview */}
                <pre className={`px-3 py-2 text-xs font-mono text-zinc-300 overflow-x-auto ${isExpanded ? 'max-h-[300px]' : 'max-h-[100px]'} overflow-y-auto`}>
                  <code>
                    {isExpanded ? snippet.content : previewLines.join('\n')}
                    {!isExpanded && hasMore && (
                      <span className="text-zinc-600">{'\n'}...</span>
                    )}
                  </code>
                </pre>
              </div>
            );
          })}
        </div>
      )}

      <input
        type="file"
        multiple
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,.txt,.md,.js,.ts,.tsx,.jsx,.json,.csv,.py,.java,.c,.cpp,.h,.css,.html"
      />

      <div className="flex gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border border-border/70 bg-card/80 p-1.5 sm:p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/60 focus-within:border-ring">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 sm:h-10 sm:w-10 shrink-0"
          onClick={() => fileInputRef.current?.click()}
          title="Attach images or files"
        >
          <Paperclip className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
        </Button>

        {/* Voice input - hidden on mobile to save space */}
        <Button
          type="button"
          variant={voice.isListening ? "default" : "ghost"}
          size="icon"
          className="hidden sm:flex h-9 w-9 sm:h-10 sm:w-10 shrink-0"
          onClick={() => {
            if (!voice.isSupported) {
              toast.error("Speech recognition is not supported in this browser.");
              return;
            }
            if (voice.isListening) voice.stop();
            else voice.start();
          }}
          title={voice.isListening ? "Stop recording" : "Voice input"}
        >
          {voice.isListening ? (
            <Square className="h-4 w-4 sm:h-5 sm:w-5" />
          ) : (
            <Mic className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
          )}
        </Button>

        {/* Skill quick select - hidden on mobile */}
        <div className="hidden sm:block">
          <SkillQuickSelect
            onSelect={(skill) => {
              setSelectedSkill(skill);
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}
            selectedSkill={selectedSkill}
          />
        </div>

        <div className="relative flex-1">
          <MentionTextarea
            ref={textareaRef}
            mentionItems={mentionItems}
            value={input}
            onChange={handleInputChange}
            onEnter={handleMentionTextareaEnter}
            onMentionSelect={handleMentionSelect}
            onPaste={handlePaste}
            placeholder="Message Lumina… (@ for agents, # for chats)"
            className="w-full resize-none bg-transparent px-2 py-2 pr-10 text-sm leading-6 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-10 max-h-[200px] disabled:opacity-60"
            rows={1}
            disabled={isLoading}
          />

          {(imageAttachments.length > 0 || attachments.length > 0 || codeSnippets.length > 0) && (
            <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-2 text-muted-foreground">
              {imageAttachments.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {imageAttachments.length}
                </span>
              ) : null}
              {attachments.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <FileText className="h-3.5 w-3.5" />
                  {attachments.length}
                </span>
              ) : null}
              {codeSnippets.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <Code2 className="h-3.5 w-3.5" />
                  {codeSnippets.length}
                </span>
              ) : null}
            </div>
          )}
        </div>

        {isLoading ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            onClick={cancelRequest}
            className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-lg sm:rounded-xl"
            title="Stop generating"
          >
            <Square className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() && attachments.length === 0 && imageAttachments.length === 0 && codeSnippets.length === 0}
            className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-lg sm:rounded-xl"
            title="Send"
          >
            <Send className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        )}
      </div>

      <div className="mt-1.5 sm:mt-2 flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
        <span className="text-[9px] sm:text-xs truncate max-w-[50%] sm:max-w-none">
          {voice.isListening && voiceDraft
            ? `Listening: "${voiceDraft}"`
            : "↵ Send • ⇧↵ New line"}
        </span>
        {chat && (
          <TokenCalculator
            chatId={chatId}
            inputContent={input}
            modelId={chat.modelId}
            isPipelineAgent={(() => {
              if (!chat.agentId || !agents) return false;
              const agent = agents.find(a => a.id === chat.agentId);
              return agent?.executionType === "pipeline";
            })()}
          />
        )}
      </div>

      {/* Mobile navigation - integrated below input */}
      <div className="mt-2">
        <MobileNavInline />
      </div>
    </form>
  );
}

function TokenCalculator({
  chatId,
  inputContent,
  modelId,
  isPipelineAgent = false,
}: {
  chatId: string;
  inputContent: string;
  modelId: string;
  isPipelineAgent?: boolean;
}) {
  const messages = useLiveQuery(() => getMessages(chatId), [chatId]);
  const model = getModelById(modelId);

  // Debounce input content to avoid recalculating tokens on every keystroke
  const [debouncedInput, setDebouncedInput] = useState(inputContent);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInput(inputContent), 300);
    return () => clearTimeout(timer);
  }, [inputContent]);

  const { historyTokens, draftTokens } = useMemo(() => {
    if (!messages) return { historyTokens: 0, draftTokens: 0 };

    // For pipeline agents, don't count image tokens heavily since they manage their own context per step
    if (isPipelineAgent) {
      // Just count text tokens, images are handled per-step by the pipeline
      let textTokens = 0;
      for (const message of messages) {
        const content = message.content;
        if (typeof content === "string") {
          textTokens += countTokens(content);
        } else if (Array.isArray(content)) {
          for (const part of content) {
            if (part.type === "text") {
              textTokens += countTokens(part.text);
            }
            // Skip image_url parts - they don't accumulate in pipeline context the same way
          }
        }
      }
      return {
        historyTokens: textTokens,
        draftTokens: countTokens(debouncedInput),
      };
    }

    return {
      historyTokens: countMessagesTokens(messages),
      draftTokens: countTokens(debouncedInput),
    };
  }, [messages, debouncedInput, isPipelineAgent]);

  if (!model) return null;

  const totalUsed = historyTokens + draftTokens;

  // For pipeline agents, don't show context warning - each step manages its own context
  // The main chat context doesn't limit pipeline execution the same way
  const isHighUsage = !isPipelineAgent && totalUsed > model.contextLength * 0.85;

  // For pipeline agents, don't show the token calculator at all since it's misleading
  if (isPipelineAgent) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {isHighUsage && (
        <span className="text-[10px] text-destructive animate-pulse font-medium">
          Context nearly full - consider summarizing
        </span>
      )}
      <TokenDisplay
        historyTokens={historyTokens}
        draftTokens={draftTokens}
        totalTokens={model.contextLength}
        modelName={model.name}
      />
    </div>
  );
}

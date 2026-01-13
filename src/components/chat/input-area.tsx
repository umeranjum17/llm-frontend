"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Paperclip, X, FileText, Image as ImageIcon, Mic, Square, Star } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useChatKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { TokenDisplay } from "./token-display";
import { getAllPrompts, getChatById, incrementPromptUsage, getProjectFiles, getChatsByProject, getAllAgents, getAllTags, getMessages } from "@/lib/db/queries";
import { countMessagesTokens, countTokens } from "@/lib/utils/token-counter";
import { getModelById } from "@/lib/constants/models";
import { toast } from "sonner";
import type { MessageContentPart } from "@/lib/db/schema";
import { PromptLibraryDialog } from "@/components/prompts/prompt-library-dialog";
import { MentionTextarea } from "@/components/chat/mention-textarea";
import { MentionItem } from "@/lib/mentions/types";
import { VariableInputModal } from "@/components/prompts/variable-input-modal";
import type { Prompt } from "@/lib/db/schema";
import { extractVariableNames } from "@/lib/utils/prompt-variables";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { PromptQuickSelect } from "@/components/chat/prompt-quick-select";
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

const MAX_TEXT_ATTACHMENT_BYTES = 1024 * 1024 * 2; // 2MB
const MAX_IMAGE_ATTACHMENT_BYTES = 1024 * 1024 * 5; // 5MB
const MAX_IMAGE_ATTACHMENTS = 4;

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
  const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
  const [variableModalOpen, setVariableModalOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage, isLoading, cancelRequest } = useChat(chatId);
  const voice = useVoiceInput();
  const [voiceDraft, setVoiceDraft] = useState("");
  const wasListeningRef = useRef(false);

  const chat = useLiveQuery(() => getChatById(chatId), [chatId]);
  const prompts = useLiveQuery(() => getAllPrompts(), []);
  const agents = useLiveQuery(() => getAllAgents(), []);
  const tags = useLiveQuery(() => getAllTags(), []);

  // New: Fetch additional mention data
  const files = useLiveQuery(() => (chat?.projectId ? getProjectFiles(chat.projectId) : []), [chat?.projectId]);
  const otherChats = useLiveQuery(() => getChatsByProject(chat?.projectId || ""), [chat?.projectId]);

  // Check connector statuses (client-side only for now)
  const [activeConnectors, setActiveConnectors] = useState<string[]>([]);
  useEffect(() => {
    const checkConnectors = async () => {
      const { availableConnectors } = await import("@/lib/connectors/registry");
      const active = [];
      for (const c of availableConnectors) {
        if (await c.isConnected()) active.push(c);
      }
      setActiveConnectors(active.map(c => c.id));
    };
    checkConnectors();

    const handleExternalSend = (e: any) => {
      if (e.detail?.content) {
        handleSubmit(undefined, e.detail.content);
      }
    };
    window.addEventListener("lumina:send-message", handleExternalSend as EventListener);

    // Poll every 5s to catch settings changes
    const interval = setInterval(checkConnectors, 5000);
    return () => {
      clearInterval(interval);
      window.removeEventListener("lumina:send-message", handleExternalSend as EventListener);
    };
  }, []);

  // Construct mention items
  const mentionItems = useMemo<MentionItem[]>(() => {
    const items: MentionItem[] = [];

    // Connectors
    if (activeConnectors.includes("notion")) {
      items.push({
        id: "connector-notion",
        type: "action",
        label: "Search Notion",
        value: "@notion:",
        description: "Search your Notion workspace",
        metadata: { type: "connector", connectorId: "notion" }
      });
    }

    // Agents
    if (agents) {
      agents.forEach(a => {
        if (!a.isActive) return;
        items.push({
          id: a.id,
          type: "agent",
          label: a.name,
          value: `@agent:${a.id}[${a.name}]`,
          description: a.description || "AI Assistant",
          metadata: { agent: a }
        });
      });
    }

    // Prompts (mapped to commands or prompts)
    if (prompts) {
      prompts.forEach(p => {
        items.push({
          id: p.id,
          type: "prompt",
          label: p.title,
          value: `@prompt:${p.id}[${p.title}]`, // Insert as reference
          description: p.description || undefined,
          metadata: { prompt: p }
        });
      });
    }

    // Files
    if (files) {
      files.forEach(f => {
        items.push({
          id: f.id,
          type: "file",
          label: f.name,
          value: f.name, // The value insertion logic handles the format
          description: `${(f.size / 1024).toFixed(1)}KB`,
        });
      });
    }

    // Chats
    if (otherChats) {
      otherChats.forEach(c => {
        if (c.id === chatId) return; // Exclude current chat
        items.push({
          id: c.id,
          type: "agent", // reusing agent icon for chat temporarily or we can add 'chat' type
          label: c.title,
          value: c.title,
          description: "Chat history",
        });
      });
    }

    // Tags for '#'
    if (tags) {
      tags.forEach(t => {
        items.push({
          id: t.id,
          type: "prompt", // using prompt icon (hash-like) for now or add 'tag' type
          label: t.name,
          value: `#${t.name}`,
          description: `${t.usageCount || 0} uses`
        });
      });
    }

    return items;
  }, [prompts, files, otherChats, chatId, agents, tags, activeConnectors]);

  // Handle submit function for keyboard shortcut
  const handleSubmitMessage = () => {
    if ((input.trim() || attachments.length > 0 || imageAttachments.length > 0) && !isLoading) {
      // Resolve prompt references
      let resolvedMessage = input.trim();
      const promptMatches = resolvedMessage.matchAll(/@prompt:([^\[]+)\[([^\]]+)\]/g);
      for (const match of promptMatches) {
        const promptId = match[1];
        const prompt = prompts?.find(p => p.id === promptId);
        if (prompt) {
          // Replace the tag with the prompt content
          resolvedMessage = resolvedMessage.replace(match[0], prompt.content);
          incrementPromptUsage(promptId).catch(() => { });
        }
      }

      const message = resolvedMessage;
      const currentAttachments = [...attachments]; // Capture current state
      const currentImages = [...imageAttachments];

      setInput("");
      setAttachments([]); // Clear state immediately
      setImageAttachments([]);

      const contentParts: MessageContentPart[] = [
        ...(message ? [{ type: "text" as const, text: message }] : []),
        ...currentImages.map((img) => ({
          type: "image_url" as const,
          image_url: { url: img.dataUrl },
        })),
      ];

      sendMessage(currentImages.length > 0 ? contentParts : message, currentAttachments);
    }
  };

  // Register Cmd+Enter keyboard shortcut for sending message
  useChatKeyboardShortcuts(handleSubmitMessage);

  // Auto-resize textarea logic is now likely handled inside MentionTextarea or we need to pass a ref and keep it here
  // Since MentionTextarea forwards ref, we can keep using it.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    const handler = () => setPromptLibraryOpen(true);
    window.addEventListener("lumina:open-prompt-library", handler as EventListener);
    return () => window.removeEventListener("lumina:open-prompt-library", handler as EventListener);
  }, []);

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

  const handleSubmit = async (e?: React.FormEvent, overrideContent?: string) => {
    e?.preventDefault();
    const finalInput = overrideContent ?? input;
    if ((!finalInput.trim() && attachments.length === 0 && imageAttachments.length === 0) || isLoading)
      return;

    // Resolve prompt references
    let resolvedMessage = finalInput.trim();
    const promptMatches = resolvedMessage.matchAll(/@prompt:([^\[]+)\[([^\]]+)\]/g);
    for (const match of promptMatches) {
      const promptId = match[1];
      const prompt = prompts?.find(p => p.id === promptId);
      if (prompt) {
        // Replace the tag with the prompt content
        resolvedMessage = resolvedMessage.replace(match[0], prompt.content);
        incrementPromptUsage(promptId).catch(() => { });
      }
    }

    const message = resolvedMessage;
    const currentAttachments = [...attachments];
    const currentImages = [...imageAttachments];

    setInput("");
    setAttachments([]);
    setImageAttachments([]);

    const contentParts: MessageContentPart[] = [
      ...(message ? [{ type: "text" as const, text: message }] : []),
      ...currentImages.map((img) => ({
        type: "image_url" as const,
        image_url: { url: img.dataUrl },
      })),
    ];

    await sendMessage(currentImages.length > 0 ? contentParts : message, currentAttachments);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);
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

    const imageItems = Array.from(items).filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;

    e.preventDefault();

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      // eslint-disable-next-line no-await-in-loop
      await addImageFile(file);
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
      {(imageAttachments.length > 0 || attachments.length > 0) && (
        <div className="mb-2 flex flex-wrap gap-2 rounded-xl border bg-background/60 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/40">
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

      <input
        type="file"
        multiple
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,.txt,.md,.js,.ts,.tsx,.jsx,.json,.csv,.py,.java,.c,.cpp,.h,.css,.html"
      />

      <div className="flex gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border border-border/70 bg-card/80 p-1.5 sm:p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/60 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
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

        {/* Prompt quick select - hidden on mobile */}
        <div className="hidden sm:block">
          <PromptQuickSelect
            onSelect={(prompt) => {
              incrementPromptUsage(prompt.id).catch(() => {});
              const reference = `@prompt:${prompt.id}[${prompt.title}]`;
              setInput((prev) => (prev ? `${prev} ${reference}` : reference));
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}
          />
        </div>

        <div className="relative flex-1">
          <MentionTextarea
            ref={textareaRef}
            mentionItems={mentionItems}
            value={input}
            onChange={handleInputChange}
            onEnter={handleMentionTextareaEnter}
            onPaste={handlePaste}
            placeholder="Message Lumina… (use @ to reference files or chats)"
            className="w-full resize-none bg-transparent px-2 py-2 pr-10 text-sm leading-6 focus:outline-none min-h-10 max-h-[200px] disabled:opacity-60"
            rows={1}
            disabled={isLoading}
          />

          {(imageAttachments.length > 0 || attachments.length > 0) && (
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
            disabled={!input.trim() && attachments.length === 0 && imageAttachments.length === 0}
            className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-lg sm:rounded-xl"
            title="Send"
          >
            <Send className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        )}
      </div>

      <div className="mt-1.5 sm:mt-2 flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
        <span className="hidden sm:inline">
          {voice.isListening && voiceDraft
            ? `Listening: "${voiceDraft}"`
            : "Enter to send • Shift+Enter for new line"}
        </span>
        {chat && (
          <TokenCalculator
            chatId={chatId}
            inputContent={input}
            modelId={chat.modelId}
          />
        )}
      </div>

      {/* Mobile navigation - integrated below input */}
      <div className="mt-2">
        <MobileNavInline />
      </div>

      <PromptLibraryDialog
        open={promptLibraryOpen}
        onOpenChange={setPromptLibraryOpen}
        onSelect={(prompt) => {
          // Unified behavior: Insert as reference chip, skip modal
          incrementPromptUsage(prompt.id).catch(() => { });
          const reference = `@prompt:${prompt.id}[${prompt.title}]`;
          setInput((prev) => (prev ? `${prev} ${reference}` : reference));
          setTimeout(() => textareaRef.current?.focus(), 0);
        }}
      />

      {selectedPrompt ? (
        <VariableInputModal
          open={variableModalOpen}
          onOpenChange={(open) => {
            setVariableModalOpen(open);
            if (!open) setSelectedPrompt(null);
          }}
          template={selectedPrompt.content}
          variables={selectedPrompt.variables || []}
          onApply={(result) => {
            setInput((prev) => (prev ? `${prev}\n\n${result}` : result));
            setSelectedPrompt(null);
            setTimeout(() => textareaRef.current?.focus(), 0);
          }}
        />
      ) : null}
    </form>
  );
}

function TokenCalculator({
  chatId,
  inputContent,
  modelId,
}: {
  chatId: string;
  inputContent: string;
  modelId: string;
}) {
  const messages = useLiveQuery(() => getMessages(chatId), [chatId]);
  const model = getModelById(modelId);

  const { historyTokens, draftTokens } = useMemo(() => {
    if (!messages) return { historyTokens: 0, draftTokens: 0 };
    return {
      historyTokens: countMessagesTokens(messages),
      draftTokens: countTokens(inputContent),
    };
  }, [messages, inputContent]);

  if (!model) return null;

  const totalUsed = historyTokens + draftTokens;
  const isHighUsage = totalUsed > model.contextLength * 0.85;

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

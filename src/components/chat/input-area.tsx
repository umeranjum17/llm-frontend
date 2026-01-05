"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Paperclip, X, FileText, Image as ImageIcon, Mic, Square, Star } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useChatKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { TokenDisplay } from "./token-display";
import { AtMentionAutocomplete } from "./at-mention-autocomplete";
import { getAllPrompts, getChatById, incrementPromptUsage } from "@/lib/db/queries";
import { toast } from "sonner";
import type { MessageContentPart } from "@/lib/db/schema";
import { PromptLibraryDialog } from "@/components/prompts/prompt-library-dialog";
import { VariableInputModal } from "@/components/prompts/variable-input-modal";
import type { Prompt } from "@/lib/db/schema";
import { extractVariableNames } from "@/lib/utils/prompt-variables";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";

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
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
  const [variableModalOpen, setVariableModalOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage, isLoading } = useChat(chatId);
  const voice = useVoiceInput();
  const [voiceDraft, setVoiceDraft] = useState("");
  const wasListeningRef = useRef(false);

  const chat = useLiveQuery(() => getChatById(chatId), [chatId]);
  const prompts = useLiveQuery(() => getAllPrompts(), []);

  const filteredPrompts = useMemo(() => {
    const list = prompts || [];
    const q = slashQuery.trim().toLowerCase();
    if (!showSlashMenu) return [];
    if (!q) return list.slice(0, 8);
    return list
      .filter((p) =>
        [p.title, p.description || "", p.content, ...(p.tags || [])]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 8);
  }, [prompts, slashQuery, showSlashMenu]);

  // Handle submit function for keyboard shortcut
  const handleSubmitMessage = () => {
    if ((input.trim() || attachments.length > 0 || imageAttachments.length > 0) && !isLoading) {
      const message = input.trim();
      const currentAttachments = [...attachments]; // Capture current state
      const currentImages = [...imageAttachments];

      setInput("");
      setAttachments([]); // Clear state immediately
      setImageAttachments([]);
      setShowSlashMenu(false);

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

  // Auto-resize textarea
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0 && imageAttachments.length === 0) || isLoading)
      return;

    const message = input.trim();
    const currentAttachments = [...attachments];
    const currentImages = [...imageAttachments];

    setInput("");
    setAttachments([]);
    setImageAttachments([]);
    setShowSlashMenu(false);

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
    const newCursorPos = e.target.selectionStart;

    setInput(newValue);
    setCursorPosition(newCursorPos);

    if (newValue.trimStart().startsWith("/")) {
      const trimmed = newValue.trimStart();
      const afterSlash = trimmed.slice(1);
      setSlashQuery(afterSlash);
      setShowSlashMenu(true);
      setSlashIndex(0);
      setShowAutocomplete(false);
    } else {
      setShowSlashMenu(false);
    }

    // Detect @ mention
    const textBeforeCursor = newValue.slice(0, newCursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      // Show autocomplete
      const query = atMatch[1];
      setAutocompleteQuery(query);
      setShowAutocomplete(true);

      // Calculate position
      const textarea = textareaRef.current;
      if (textarea) {
        const rect = textarea.getBoundingClientRect();
        setAutocompletePosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
        });
      }
    } else {
      setShowAutocomplete(false);
    }
  };

  const handleAutocompleteSelect = (type: "file" | "chat", id: string, name: string) => {
    const textBeforeCursor = input.slice(0, cursorPosition);
    const textAfterCursor = input.slice(cursorPosition);
    const textBeforeAt = textBeforeCursor.replace(/@\w*$/, "");

    const reference = type === "file" ? `@file:${id}[${name}]` : `@chat:${id}[${name}]`;
    const newInput = textBeforeAt + reference + " " + textAfterCursor;

    setInput(newInput);
    setShowAutocomplete(false);

    // Focus textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handlePromptSelect = (prompt: Prompt) => {
    incrementPromptUsage(prompt.id).catch(() => {});
    const vars = extractVariableNames(prompt.content);
    if (vars.length > 0) {
      setSelectedPrompt(prompt);
      setVariableModalOpen(true);
    } else {
      setInput(prompt.content);
    }
    setShowSlashMenu(false);
    setSlashQuery("");
    setSlashIndex(0);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showAutocomplete && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) {
      // Let autocomplete handle these keys
      return;
    }

    if (showSlashMenu && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) {
      e.preventDefault();
      if (filteredPrompts.length === 0) return;
      if (e.key === "ArrowDown") {
        setSlashIndex((prev) => (prev + 1) % filteredPrompts.length);
      } else if (e.key === "ArrowUp") {
        setSlashIndex((prev) => (prev - 1 + filteredPrompts.length) % filteredPrompts.length);
      } else if (e.key === "Enter") {
        const prompt = filteredPrompts[slashIndex];
        if (prompt) handlePromptSelect(prompt);
      }
      return;
    }

    if (e.key === "Escape" && showAutocomplete) {
      e.preventDefault();
      setShowAutocomplete(false);
      return;
    }

    if (e.key === "Escape" && showSlashMenu) {
      e.preventDefault();
      setShowSlashMenu(false);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
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
      className="mx-auto max-w-3xl"
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

      <div className="flex gap-2 rounded-2xl border border-border/70 bg-card/80 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/60 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => fileInputRef.current?.click()}
          title="Attach images or files"
        >
          <Paperclip className="h-5 w-5 text-muted-foreground" />
        </Button>

        <Button
          type="button"
          variant={voice.isListening ? "default" : "ghost"}
          size="icon"
          className="h-10 w-10 shrink-0"
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
            <Square className="h-5 w-5" />
          ) : (
            <Mic className="h-5 w-5 text-muted-foreground" />
          )}
        </Button>

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
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

          {showSlashMenu && (
            <div className="absolute left-0 bottom-full z-30 mb-2 w-full overflow-hidden rounded-xl border bg-popover/95 shadow-lg backdrop-blur">
              <div className="border-b px-3 py-2 text-xs text-muted-foreground">
                Slash commands
              </div>
              <Command className="bg-transparent">
                <CommandList className="max-h-[240px]">
                  {filteredPrompts.length === 0 ? (
                    <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                      No prompts found
                    </CommandEmpty>
                  ) : (
                    <CommandGroup heading="Prompts">
                      {filteredPrompts.map((prompt, index) => (
                        <CommandItem
                          key={prompt.id}
                          onSelect={() => handlePromptSelect(prompt)}
                          className={`${index === slashIndex ? "bg-accent/70" : ""} text-xs`}
                        >
                          <div className="flex w-full items-center gap-3">
                            <div className="w-40 shrink-0 font-mono text-xs text-foreground/90">
                              {toSlashCommand(prompt.title)}
                            </div>
                            <div className="flex-1 min-w-0 text-xs text-muted-foreground">
                              {prompt.description || prompt.title}
                            </div>
                            {prompt.isFavorite ? (
                              <Star className="h-3.5 w-3.5 text-yellow-500" />
                            ) : null}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </div>
          )}
        </div>

        <Button
          type="submit"
          size="icon"
          disabled={
            (!input.trim() && attachments.length === 0 && imageAttachments.length === 0) ||
            isLoading
          }
          className="h-10 w-10 shrink-0 rounded-xl"
          title="Send"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {voice.isListening && voiceDraft
            ? `Listening: “${voiceDraft}”`
            : "Enter to send • Shift+Enter for new line"}
        </span>
        <TokenDisplay chatId={chatId} inputContent={input} />
      </div>

      {/* Autocomplete */}
      {showAutocomplete && (
        <AtMentionAutocomplete
          projectId={chat?.projectId}
          onSelect={handleAutocompleteSelect}
          onClose={() => setShowAutocomplete(false)}
          position={autocompletePosition}
          query={autocompleteQuery}
        />
      )}

      <PromptLibraryDialog
        open={promptLibraryOpen}
        onOpenChange={setPromptLibraryOpen}
        onSelect={(prompt) => {
          const vars = extractVariableNames(prompt.content);
          if (vars.length > 0) {
            setSelectedPrompt(prompt);
            setVariableModalOpen(true);
            return;
          }

          setInput((prev) => (prev ? `${prev}\n\n${prompt.content}` : prompt.content));
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

"use client";

import { useState, useRef, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Paperclip, X, FileText } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useChatKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { TokenDisplay } from "./token-display";
import { AtMentionAutocomplete } from "./at-mention-autocomplete";
import { getChatById } from "@/lib/db/queries";
import { toast } from "sonner";

interface InputAreaProps {
  chatId: string;
}

interface Attachment {
  name: string;
  content: string;
  size: number;
}

export function InputArea({ chatId }: InputAreaProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage, isLoading } = useChat(chatId);

  const chat = useLiveQuery(() => getChatById(chatId), [chatId]);

  // Handle submit function for keyboard shortcut
  const handleSubmitMessage = () => {
    if ((input.trim() || attachments.length > 0) && !isLoading) {
      const message = input.trim();
      const currentAttachments = [...attachments]; // Capture current state

      setInput("");
      setAttachments([]); // Clear state immediately
      sendMessage(message, currentAttachments);
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      // Basic validation
      if (file.size > 1024 * 1024 * 2) { // 2MB limit for now
        toast.error(`File ${file.name} is too large (max 2MB)`);
        continue;
      }

      try {
        const text = await file.text();
        setAttachments(prev => [...prev, {
          name: file.name,
          content: text,
          size: file.size
        }]);
      } catch (err) {
        toast.error(`Failed to read ${file.name}`);
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const message = input.trim();
    const currentAttachments = [...attachments];

    setInput("");
    setAttachments([]);
    await sendMessage(message, currentAttachments);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPos = e.target.selectionStart;
    setInput(newValue);
    setCursorPosition(newCursorPos);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showAutocomplete && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) {
      // Let autocomplete handle these keys
      return;
    }

    if (e.key === "Escape" && showAutocomplete) {
      e.preventDefault();
      setShowAutocomplete(false);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <div className="mx-auto max-w-3xl">
        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 p-2 bg-muted/30 rounded-lg">
            {attachments.map((file, i) => (
              <div key={i} className="flex items-center gap-1 bg-background border rounded-md px-2 py-1 text-xs">
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span className="max-w-[150px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            accept=".txt,.md,.js,.ts,.tsx,.jsx,.json,.csv,.py,.java,.c,.cpp,.h,.css,.html"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-[52px] w-[52px] shrink-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-5 w-5 text-muted-foreground" />
          </Button>

          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... Use @ to reference files or chats"
              className="w-full resize-none rounded-lg border bg-background px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[52px] max-h-[200px]"
              rows={1}
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={(!input.trim() && attachments.length === 0) || isLoading}
            className="h-[52px] w-[52px] shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <TokenDisplay chatId={chatId} inputContent={input} />
        </div>
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
    </form>
  );
}

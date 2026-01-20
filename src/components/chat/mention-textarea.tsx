
import React, { useRef, useEffect, useImperativeHandle, forwardRef, useMemo } from "react";
import { MentionList } from "./mention-list";
import { useMentions } from "@/lib/mentions/use-mentions";
import { MentionItem } from "@/lib/mentions/types";
import { cn } from "@/lib/utils";
import { segmentTextWithMentions } from "@/lib/mentions/mention-parser";
import { Bot, FileText, MessageSquare, Tag, Zap } from "lucide-react";

interface MentionTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    mentionItems: MentionItem[];
    onEnter?: (e: React.KeyboardEvent) => void;
    onMentionSelect?: (item: MentionItem, insertText: (text: string) => void) => void;
}

// Icons for mention types
const MENTION_ICONS: Record<string, React.ElementType> = {
    agent: Bot,
    file: FileText,
    chat: MessageSquare,
    tag: Tag,
    skill: Zap,
};

const MENTION_COLORS: Record<string, string> = {
    agent: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    file: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    chat: "bg-green-500/20 text-green-400 border-green-500/30",
    tag: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    skill: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
    ({ className, mentionItems, value, onChange, onKeyDown, onEnter, onMentionSelect, ...props }, ref) => {
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        useImperativeHandle(ref, () => textareaRef.current!);

        const {
            isOpen,
            setIsOpen,
            query,
            setQuery,
            activeIndex,
            filteredItems,
            handleKeyDown: handleMentionKeyDown,
            setTriggerChar,
        } = useMentions({ items: mentionItems });

        const handleSelection = (item: MentionItem) => {
            // Verify we have a valid textarea ref
            if (!textareaRef.current) return;

            const textarea = textareaRef.current;
            const cursor = textarea.selectionStart;
            const text = textarea.value;

            // Find start of mention
            // We look backwards from cursor for the trigger char
            const textBefore = text.slice(0, cursor);
            const lastTriggerIndex = Math.max(
                textBefore.lastIndexOf('@'),
                textBefore.lastIndexOf('#'),
                textBefore.lastIndexOf('/')
            );

            if (lastTriggerIndex === -1) return;

            const prefix = text.slice(0, lastTriggerIndex);
            const suffix = text.slice(cursor);

            const performInsertion = (textToInsert: string) => {
                const newValue = `${prefix}${textToInsert} ${suffix}`;

                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                if (nativeInputValueSetter) {
                    nativeInputValueSetter.call(textarea, newValue);
                }

                const event = new Event('input', { bubbles: true });
                textarea.dispatchEvent(event);
                onChange?.({ target: { value: newValue } } as any);
                setIsOpen(false);

                // Attempt to restore focus and cursor
                setTimeout(() => {
                    textarea.focus();
                    const newCursorPos = prefix.length + textToInsert.length + 1;
                    textarea.setSelectionRange(newCursorPos, newCursorPos);
                }, 0);
            };

            if (onMentionSelect) {
                onMentionSelect(item, performInsertion);
            } else {
                // Default behavior based on item type
                let insertion = "";
                if (item.type === 'file') {
                    insertion = `@file:${item.id}[${item.label}]`;
                } else if (item.type === 'agent') {
                    insertion = `@agent:${item.id}[${item.label}]`;
                } else if (item.type === 'skill') {
                    insertion = `@skill:${item.id}[${item.label}]`;
                } else if (item.type === 'chat') {
                    insertion = `#chat:${item.id}[${item.label}]`;
                } else if (item.type === 'tag') {
                    insertion = `#tag:${item.id}[${item.label}]`;
                } else {
                    insertion = item.value;
                }
                performInsertion(insertion);
            }
        };

        const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const newValue = e.target.value;
            const newSelectionStart = e.target.selectionStart;
            onChange?.(e);

            // Detect trigger
            const textBeforeCursor = newValue.slice(0, newSelectionStart);
            // Regex to match " @something" or "^@something"
            // We need to capture the trigger char and the query
            const match = textBeforeCursor.match(/([@#/])(\w*)$/);

            if (match) {
                const char = match[1];
                const q = match[2];
                setTriggerChar(char);
                setQuery(q);
                setIsOpen(true);
            } else {
                setIsOpen(false);
            }
        };

        const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (isOpen) {
                const handled = handleMentionKeyDown(e, handleSelection);
                if (handled) return;
            }

            if (e.key === "Enter" && !e.shiftKey) {
                onEnter?.(e);
            }

            onKeyDown?.(e);
        };

        // Parse text value to find mentions and render overlay
        const textValue = typeof value === "string" ? value : "";
        const segments = useMemo(() => segmentTextWithMentions(textValue), [textValue]);
        const hasMentions = segments.some(s => s.type === "mention");

        // Render the overlay content with styled mentions
        const renderOverlay = () => {
            return segments.map((segment, index) => {
                if (segment.type === "text") {
                    // Preserve whitespace and newlines
                    return <span key={index}>{segment.content}</span>;
                }

                if (segment.type === "mention" && segment.mention) {
                    const Icon = MENTION_ICONS[segment.mention.type] || Bot;
                    const colorClass = MENTION_COLORS[segment.mention.type] || MENTION_COLORS.agent;

                    return (
                        <span
                            key={index}
                            className={cn(
                                "inline-flex items-center gap-0.5 px-1 py-0 rounded text-xs border",
                                colorClass
                            )}
                        >
                            <Icon className="h-3 w-3" />
                            <span>{segment.mention.label}</span>
                        </span>
                    );
                }

                return null;
            });
        };

        return (
            <div className="relative w-full">
                {isOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-full max-w-[300px] z-50">
                        <MentionList
                            items={filteredItems}
                            activeIndex={activeIndex}
                            onSelect={handleSelection}
                        />
                    </div>
                )}

                {/* Styled overlay - shows mentions as badges */}
                {hasMentions && (
                    <div
                        className={cn(
                            "absolute inset-0 pointer-events-none whitespace-pre-wrap break-words overflow-hidden",
                            className
                        )}
                        style={{
                            // Match textarea padding and font
                            fontFamily: "inherit",
                            fontSize: "inherit",
                            lineHeight: "inherit",
                        }}
                        aria-hidden="true"
                    >
                        {renderOverlay()}
                    </div>
                )}

                <textarea
                    ref={textareaRef}
                    className={cn(
                        className,
                        // Make text transparent when we have mentions so overlay shows
                        hasMentions && "text-transparent caret-current"
                    )}
                    onChange={handleChange}
                    onKeyDown={handleKeyDownInternal}
                    value={value}
                    style={{
                        // Ensure caret is visible
                        caretColor: hasMentions ? "currentColor" : undefined,
                    }}
                    // Disable spell-check to prevent red squiggles showing through transparent text
                    spellCheck={hasMentions ? false : undefined}
                    {...props}
                />
            </div>
        );
    }
);

MentionTextarea.displayName = "MentionTextarea";

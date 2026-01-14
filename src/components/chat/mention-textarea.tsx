
import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { MentionList } from "./mention-list";
import { useMentions } from "@/lib/mentions/use-mentions";
import { MentionItem } from "@/lib/mentions/types";
import { cn } from "@/lib/utils";

interface MentionTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    mentionItems: MentionItem[];
    onEnter?: (e: React.KeyboardEvent) => void;
    onMentionSelect?: (item: MentionItem, insertText: (text: string) => void) => void;
}

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

        return (
            <div className="relative w-full">
                {isOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-full max-w-[300px]">
                        <MentionList
                            items={filteredItems}
                            activeIndex={activeIndex}
                            onSelect={handleSelection}
                        />
                    </div>
                )}
                <textarea
                    ref={textareaRef}
                    className={cn(className)}
                    onChange={handleChange}
                    onKeyDown={handleKeyDownInternal}
                    value={value}
                    {...props}
                />
            </div>
        );
    }
);

MentionTextarea.displayName = "MentionTextarea";

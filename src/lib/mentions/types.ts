
export type MentionType = "agent" | "prompt" | "file" | "command" | "action" | "chat" | "tag" | "skill" | "codebase";

export type TriggerChar = "@" | "#" | "/";

export interface MentionItem {
    id: string;
    type: MentionType;
    label: string; // The text to display in the list (e.g. "Research Assistant")
    value: string; // The text to insert (e.g. "research-assistant")
    description?: string;
    icon?: React.ReactNode;
    metadata?: any;
    trigger?: TriggerChar; // Which trigger character shows this item (default: "@")
}

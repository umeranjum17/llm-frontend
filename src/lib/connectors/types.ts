export type ConnectorId = "notion" | "github" | "google-drive" | "slack";

export interface ConnectorDocument {
    id: string;
    title: string;
    url: string;
    type: string; // e.g., "page", "issue", "file"
    lastModified: number;
    snippet?: string;
}

export interface ConnectorConfig {
    enabled: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    options?: Record<string, any>; // e.g., selected folders/repos
}

export interface Connector {
    id: ConnectorId;
    name: string;
    description: string;
    icon: string; // lucide icon name or url
    isExperimental?: boolean;

    // Status
    isConnected: () => Promise<boolean>;

    // Actions
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;

    // Data
    search: (query: string) => Promise<ConnectorDocument[]>;
    sync?: () => Promise<void>;
}

import { Connector, ConnectorDocument, ConnectorId } from "./types";

// Mock storage for connection status
const STORAGE_KEY = "lumina:connector:notion:connected";

export class MockNotionConnector implements Connector {
    id: ConnectorId = "notion";
    name = "Notion";
    description = "Access pages and databases from your Notion workspace.";
    icon = "Book"; // will map to Lucide Book icon or similar

    async isConnected(): Promise<boolean> {
        if (typeof window === "undefined") return false;
        return window.localStorage.getItem(STORAGE_KEY) === "true";
    }

    async connect(): Promise<void> {
        // Simulate OAuth popup delay
        await new Promise((resolve) => setTimeout(resolve, 1500));
        window.localStorage.setItem(STORAGE_KEY, "true");
    }

    async disconnect(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 500));
        window.localStorage.removeItem(STORAGE_KEY);
    }

    async search(query: string): Promise<ConnectorDocument[]> {
        if (!(await this.isConnected())) return [];

        // Mock results
        const results: ConnectorDocument[] = [
            {
                id: "page-1",
                title: "Project Roadmap 2024",
                url: "https://notion.so/roadmap",
                type: "page",
                lastModified: Date.now() - 1000000,
                snippet: "Q1 Goals: Improve performance, Add new UI..."
            },
            {
                id: "page-2",
                title: "Engineering Onboarding",
                url: "https://notion.so/onboarding",
                type: "page",
                lastModified: Date.now() - 5000000,
                snippet: "Welcome to the team! Here is how to set up..."
            },
            {
                id: "page-3",
                title: "Meeting Notes: Design Sync",
                url: "https://notion.so/meeting-notes",
                type: "page",
                lastModified: Date.now(),
                snippet: "Discussed the new color palette and typography..."
            }
        ];

        if (!query) return results;

        const q = query.toLowerCase();
        return results.filter(doc =>
            doc.title.toLowerCase().includes(q) ||
            (doc.snippet && doc.snippet.toLowerCase().includes(q))
        );
    }
}

export const notionConnector = new MockNotionConnector(); // Singleton instance

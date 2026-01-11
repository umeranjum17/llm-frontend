import { NextRequest, NextResponse } from "next/server";
import { McpManager } from "@/lib/mcp/mcp-manager";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { url, apiKey, type } = body;

        if (!url) {
            return NextResponse.json(
                { success: false, error: "URL is required" },
                { status: 400 }
            );
        }

        // Create a temporary server object for testing
        const testServer = {
            id: "test",
            name: "Test Connection",
            url,
            apiKey: apiKey || "",
            type: type || "sse",
            enabled: true,
            collection: "custom" as const,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        const manager = McpManager.getInstance();
        const result = await manager.testConnection(testServer);

        return NextResponse.json(result);
    } catch (error) {
        console.error("[MCP Test] Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}

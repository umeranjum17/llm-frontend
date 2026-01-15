import { NextRequest, NextResponse } from "next/server";
import Memory from "mem0ai";

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get("x-mem0-key");
        if (!apiKey) {
            return NextResponse.json({ error: "Missing Mem0 API Key" }, { status: 401 });
        }

        const body = await req.json();
        const { action, userId, content, query } = body;

        const memoryClient = new Memory({
            apiKey: apiKey,
        });

        // Use a consistent user_id for this app instance
        // In a real multi-user app, this would be the logged-in user's ID
        const finalUserId = userId || "default-user";

        let result;

        switch (action) {
            case "add":
                // Content can be a string (message) or array of messages
                if (!content) throw new Error("Content is required for add");
                result = await memoryClient.add(content, { user_id: finalUserId });
                break;

            case "search":
                if (!query) throw new Error("Query is required for search");
                try {
                    result = await memoryClient.search(query, { user_id: finalUserId, limit: 5 });
                } catch (searchError: any) {
                    // Handle "User not found" error - user has no memories yet
                    if (searchError?.message?.includes("User not found") ||
                        searchError?.message?.includes("user_id")) {
                        result = []; // Return empty array if user doesn't exist in Mem0
                    } else {
                        throw searchError;
                    }
                }
                break;

            case "get_all":
                try {
                    result = await memoryClient.getAll({ user_id: finalUserId, limit: 100 });
                } catch (getAllError: any) {
                    // Handle "User not found" error - user has no memories yet
                    if (getAllError?.message?.includes("User not found") ||
                        getAllError?.message?.includes("user_id")) {
                        result = { results: [] };
                    } else {
                        throw getAllError;
                    }
                }
                break;

            case "delete":
                if (!body.memoryId) throw new Error("Memory ID required for delete");
                result = await memoryClient.delete(body.memoryId);
                break;

            case "history":
                if (!body.memoryId) throw new Error("Memory ID required for history");
                result = await memoryClient.history(body.memoryId);
                break;

            default:
                throw new Error(`Invalid action: ${action}`);
        }

        return NextResponse.json(result);

    } catch (error: any) {
        console.error("[Mem0 Proxy Error]", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}

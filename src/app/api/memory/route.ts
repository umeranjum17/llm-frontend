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

        // Each user has their own Mem0 API key, so isolation happens at the account level
        // The userId here is for organizing memories within that user's Mem0 account
        const finalUserId = userId || "default-user";

        let result;

        switch (action) {
            case "add":
                // Content can be a string (message) or array of messages
                // Validate content more thoroughly for Mem0 API requirements
                if (!content) {
                    throw new Error("Content is required for add");
                }

                // Handle string content
                if (typeof content === 'string') {
                    const trimmed = content.trim();
                    if (!trimmed) {
                        throw new Error("Content cannot be empty");
                    }
                    result = await memoryClient.add(trimmed as any, { user_id: finalUserId });
                }
                // Handle array content (messages format)
                else if (Array.isArray(content)) {
                    if (content.length === 0) {
                        throw new Error("Content array cannot be empty");
                    }
                    // Filter out empty messages
                    const validMessages = content.filter((msg: any) => {
                        if (typeof msg === 'string') return msg.trim().length > 0;
                        if (typeof msg === 'object' && msg !== null) {
                            // Handle { role, content } format
                            const msgContent = msg.content || msg.text || msg.message;
                            return typeof msgContent === 'string' && msgContent.trim().length > 0;
                        }
                        return false;
                    });
                    if (validMessages.length === 0) {
                        throw new Error("No valid messages in content array");
                    }
                    result = await memoryClient.add(validMessages, { user_id: finalUserId });
                }
                // Invalid content type
                else {
                    throw new Error(`Invalid content type: ${typeof content}. Expected string or array.`);
                }
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

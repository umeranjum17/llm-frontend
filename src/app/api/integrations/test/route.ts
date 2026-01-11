import { NextRequest, NextResponse } from "next/server";
import { getMcpServerById } from "@/lib/db/queries";
import { McpManager } from "@/lib/mcp/mcp-manager";

// Force Node.js runtime for MCP SSE compatibility
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { serverId } = await req.json();

    if (!serverId) {
      return NextResponse.json(
        { success: false, error: "Server ID is required" },
        { status: 400 }
      );
    }

    // Get server from database
    const server = await getMcpServerById(serverId);
    if (!server) {
      return NextResponse.json(
        { success: false, error: "Server not found" },
        { status: 404 }
      );
    }

    // Test connection using MCP manager singleton (preserves connection pooling)
    const mcpManager = McpManager.getInstance();
    const result = await mcpManager.testConnection(server);

    // Note: No cleanup() call - singleton maintains connections for reuse

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Test connection error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

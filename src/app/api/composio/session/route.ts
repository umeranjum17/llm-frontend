import { NextRequest, NextResponse } from "next/server";
import { Composio } from "@composio/core";

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-composio-key");
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 401 });
    }

    const { userId, toolkits, authConfigs, connectedAccounts } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const composio = new Composio({ apiKey });

    // Build session options
    const sessionOptions: any = {};
    if (toolkits) {
      // Support both array and object format
      sessionOptions.toolkits = Array.isArray(toolkits)
        ? toolkits
        : { enable: toolkits.enable || toolkits };
    }
    if (authConfigs) {
      sessionOptions.authConfigs = authConfigs;
    }
    if (connectedAccounts && Object.keys(connectedAccounts).length > 0) {
      // Format: { toolkit_slug: connected_account_id }
      sessionOptions.connectedAccounts = connectedAccounts;
      // Disable auto connection management since we're providing connected accounts
      sessionOptions.manageConnections = false;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[Composio] Creating session for user:", userId);
      console.log("[Composio] Session options:", JSON.stringify(sessionOptions, null, 2));
    }

    // Create session: composio.create(userId) or composio.create(userId, options)
    const session = Object.keys(sessionOptions).length > 0
      ? await composio.create(userId, sessionOptions)
      : await composio.create(userId);

    if (process.env.NODE_ENV === "development") {
      console.log("[Composio] Session created:", JSON.stringify(session, null, 2));
    }

    // Session returns { mcp: { url, headers }, sessionId }
    const { mcp, sessionId } = session as any;

    return NextResponse.json({
      mcp: {
        url: mcp?.url,
        headers: mcp?.headers,
      },
      sessionId,
    });
  } catch (error: any) {
    console.error("[Composio Session Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to create session" },
      { status: 500 }
    );
  }
}

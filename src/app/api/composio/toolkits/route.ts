import { NextRequest, NextResponse } from "next/server";
import { Composio } from "@composio/core";

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-composio-key");
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 401 });
    }

    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const composio = new Composio({ apiKey });

    // Fetch all connected accounts for this API key
    // NOTE: Composio isolates all data by API key, so no entityId filter is needed
    // Each user has their own API key → their own isolated connections
    let rawResponse: any;
    try {
      rawResponse = await composio.connectedAccounts.list();
      if (process.env.NODE_ENV === "development") {
      }
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
      }
      rawResponse = { items: [] };
    }

    const accountsList = rawResponse?.items || rawResponse || [];

    // Build a map of app -> connected account
    // Use multiple keys to increase match chances
    const connectionMap = new Map<string, { id: string; status: string }>();

    for (const account of accountsList) {
      const status = account.status || "ACTIVE";
      const id = account.id;

      // The key is in toolkit.slug
      const toolkitSlug = account.toolkit?.slug;
      if (!toolkitSlug) continue;

      // Only track ACTIVE connections
      if (status !== "ACTIVE") continue;

      // Add both original and lowercase versions
      connectionMap.set(toolkitSlug, { id, status });
      connectionMap.set(toolkitSlug.toLowerCase(), { id, status });

      if (process.env.NODE_ENV === "development") {
      }
    }

    // Return the connection status for all connected apps
    // Status can be "ACTIVE", "ENABLED", or other values
    const items = Array.from(connectionMap.entries()).map(([key, value]) => ({
      key,
      isConnected: ["ACTIVE", "ENABLED", "active", "enabled"].includes(value.status),
      connectedAccountId: value.id,
    }));

    // Get connected toolkit slugs for easy reference
    const connectedSlugs = Array.from(connectionMap.keys());

    return NextResponse.json({
      toolkits: items,
      connectionMap: Object.fromEntries(connectionMap),
      // Include debug info only in development
      ...(process.env.NODE_ENV === "development" && {
        debug: {
          rawAccounts: accountsList,
          totalAccounts: accountsList.length,
          connectedSlugs,
        },
      }),
    });
  } catch (error: any) {
    console.error("[Composio Toolkits Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch toolkits" },
      { status: 500 }
    );
  }
}

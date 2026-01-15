import { NextRequest, NextResponse } from "next/server";
import { Composio } from "@composio/core";

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-composio-key");
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 401 });
    }

    const composio = new Composio({ apiKey });

    // Fetch all available toolkits from Composio
    const toolkitsList = await composio.toolkits.get();

    // Transform to a simpler format
    const toolkits = toolkitsList.map((toolkit) => ({
      key: toolkit.slug,
      name: toolkit.name,
      description: toolkit.meta?.description || "",
      logo: toolkit.meta?.logo || null,
      categories: toolkit.meta?.categories || [],
      toolsCount: toolkit.meta?.toolsCount || 0,
      noAuth: toolkit.noAuth || false,
      authSchemes: toolkit.authSchemes || [],
    }));

    return NextResponse.json({ toolkits });
  } catch (error: any) {
    console.error("[Composio Available Toolkits Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch available toolkits" },
      { status: 500 }
    );
  }
}

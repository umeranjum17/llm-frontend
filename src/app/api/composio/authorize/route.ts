import { NextRequest, NextResponse } from "next/server";
import { Composio } from "@composio/core";

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-composio-key");
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 401 });
    }

    const { userId, toolkit } = await req.json();
    if (!userId || !toolkit) {
      return NextResponse.json(
        { error: "User ID and toolkit required" },
        { status: 400 }
      );
    }

    const composio = new Composio({ apiKey });

    // Create session for this user
    const session = await composio.create(userId);

    // Authorize the toolkit - returns { redirectUrl }
    // e.g., https://connect.composio.dev/link/ln_abc123
    const connectionRequest = await (session as any).authorize(toolkit);

    return NextResponse.json({
      redirectUrl: connectionRequest.redirectUrl,
      toolkit,
    });
  } catch (error: any) {
    console.error("[Composio Authorize Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to authorize" },
      { status: 500 }
    );
  }
}

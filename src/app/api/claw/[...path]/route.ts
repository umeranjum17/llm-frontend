import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/db/queries";

export const runtime = "edge";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, await params);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, await params);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, await params);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, await params);
}

async function proxyRequest(req: NextRequest, params: { path: string[] }) {
  const clawUrl = req.headers.get("x-claw-url");
  const clawSecret = req.headers.get("x-claw-secret");

  if (!clawUrl || !clawSecret) {
    return NextResponse.json({ error: "Missing x-claw-url or x-claw-secret headers" }, { status: 400 });
  }

  const path = "/" + params.path.join("/");
  const url = new URL(path, clawUrl);
  url.search = req.nextUrl.search;

  const headers: HeadersInit = {
    Authorization: `Bearer ${clawSecret}`,
    "Content-Type": "application/json",
  };

  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;

  try {
    const res = await fetch(url.toString(), {
      method: req.method,
      headers,
      body,
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Proxy error: ${msg}` }, { status: 502 });
  }
}

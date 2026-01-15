import { NextRequest, NextResponse } from "next/server";
import { Sandbox } from "@e2b/code-interpreter";

export const runtime = "nodejs";
export const maxDuration = 60; // 60 second timeout

interface ExecuteRequest {
  code: string;
  language: "python" | "javascript" | "bash";
  files?: { name: string; content: string }[];
}

interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  results?: Array<{
    type: string;
    data?: string;
    format?: string;
    text?: string;
  }>;
  executionTime?: number;
}

// Get E2B API key from environment
function getE2BApiKey(): string | undefined {
  return process.env.E2B_API_KEY;
}

export async function POST(req: NextRequest): Promise<NextResponse<ExecutionResult>> {
  try {
    const apiKey = getE2BApiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          stdout: "",
          stderr: "",
          error: "E2B API key not configured. Please add E2B_API_KEY to your environment variables.",
        },
        { status: 500 }
      );
    }

    const body = (await req.json()) as ExecuteRequest;
    const { code, language, files } = body;

    if (!code || !language) {
      return NextResponse.json(
        {
          success: false,
          stdout: "",
          stderr: "",
          error: "Code and language are required",
        },
        { status: 400 }
      );
    }

    // Validate language
    if (!["python", "javascript", "bash"].includes(language)) {
      return NextResponse.json(
        {
          success: false,
          stdout: "",
          stderr: "",
          error: `Unsupported language: ${language}. Supported: python, javascript, bash`,
        },
        { status: 400 }
      );
    }

    // Limit code size
    if (code.length > 100000) {
      return NextResponse.json(
        {
          success: false,
          stdout: "",
          stderr: "",
          error: "Code too large (max 100KB)",
        },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    let sandbox: Sandbox | null = null;

    try {
      // Create sandbox with timeout
      sandbox = await Sandbox.create({ apiKey, timeoutMs: 30000 });

      // Upload any additional files
      if (files && files.length > 0) {
        for (const file of files) {
          await sandbox.files.write(file.name, file.content);
        }
      }

      let result;
      const logs: string[] = [];
      const errors: string[] = [];

      if (language === "python") {
        // Execute Python code
        result = await sandbox.runCode(code, {
          onStdout: (data) => logs.push(data.line),
          onStderr: (data) => errors.push(data.line),
        });
      } else if (language === "javascript") {
        // Execute JavaScript/Node.js code
        // Wrap in async IIFE if needed for top-level await support
        const jsCode = code.includes("await") && !code.includes("async")
          ? `(async () => { ${code} })()`
          : code;

        result = await sandbox.runCode(jsCode, {
          language: "js",
          onStdout: (data) => logs.push(data.line),
          onStderr: (data) => errors.push(data.line),
        });
      } else if (language === "bash") {
        // Execute Bash commands
        const commandResult = await sandbox.commands.run(code, {
          onStdout: (data) => { logs.push(data); },
          onStderr: (data) => { errors.push(data); },
          timeoutMs: 30000,
        });

        const executionTime = Date.now() - startTime;

        return NextResponse.json({
          success: commandResult.exitCode === 0,
          stdout: logs.join("\n"),
          stderr: errors.join("\n"),
          error: commandResult.exitCode !== 0 ? `Exit code: ${commandResult.exitCode}` : undefined,
          executionTime,
        });
      }

      const executionTime = Date.now() - startTime;

      // Process results (charts, images, etc.)
      const processedResults = result?.results?.map((r: any) => {
        if (r.png) {
          return { type: "image", data: r.png, format: "png" };
        }
        if (r.jpeg) {
          return { type: "image", data: r.jpeg, format: "jpeg" };
        }
        if (r.svg) {
          return { type: "image", data: r.svg, format: "svg" };
        }
        if (r.html) {
          return { type: "html", data: r.html };
        }
        if (r.text) {
          return { type: "text", text: r.text };
        }
        if (r.latex) {
          return { type: "latex", text: r.latex };
        }
        return { type: "unknown", data: JSON.stringify(r) };
      }) || [];

      return NextResponse.json({
        success: !result?.error,
        stdout: logs.join("\n"),
        stderr: errors.join("\n"),
        error: result?.error ? String(result.error.name || result.error) : undefined,
        results: processedResults,
        executionTime,
      });
    } finally {
      // Always close the sandbox
      if (sandbox) {
        await sandbox.kill().catch(() => {});
      }
    }
  } catch (error) {
    console.error("Sandbox execution error:", error);

    // Sanitize error message
    const errorMessage = error instanceof Error
      ? error.message.replace(/apiKey[^&\s]*/gi, "***")
      : "Unknown execution error";

    return NextResponse.json(
      {
        success: false,
        stdout: "",
        stderr: "",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

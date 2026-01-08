import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { resolveProvider, isCustomOpenAIProvider } from "@/lib/providers";

export const runtime = "edge";

const ImageRequestSchema = z.object({
    providerId: z.string().optional(),
    providerBaseUrl: z.string().url().optional(),
    modelId: z.string().min(1),
    prompt: z.string().min(1).max(4000),
    size: z.enum(["1024x1024", "1792x1024", "1024x1792", "512x512", "256x256"]).optional(),
    quality: z.enum(["standard", "hd"]).optional(),
    style: z.enum(["vivid", "natural"]).optional(),
    n: z.number().min(1).max(4).optional(),
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const parsedBody = ImageRequestSchema.safeParse(body);
        if (!parsedBody.success) {
            return new Response(
                JSON.stringify({
                    error: "Invalid request body",
                    details: parsedBody.error.flatten(),
                }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const {
            providerId: providerIdFromBody,
            providerBaseUrl,
            modelId,
            prompt,
            size = "1024x1024",
            quality = "standard",
            style = "vivid",
            n = 1,
        } = parsedBody.data;

        const apiKey = req.headers.get("X-API-Key");
        const providerId = providerIdFromBody || "openai";
        const resolved = resolveProvider(providerId, { baseUrl: providerBaseUrl });

        if (!resolved) {
            return new Response(
                JSON.stringify({ error: "Unknown provider", providerId }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        if (isCustomOpenAIProvider(providerId) && !providerBaseUrl) {
            return new Response(
                JSON.stringify({ error: "Missing providerBaseUrl for custom provider" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        if (resolved.apiKeyRequired && !apiKey) {
            return new Response("No API key provided", { status: 401 });
        }

        // Build the base URL for image generation
        const baseUrl = resolved.baseUrl || "https://api.openai.com/v1";
        const imagesEndpoint = `${baseUrl}/images/generations`;

        // Normalize model ID (strip provider prefix if present)
        const normalizedModelId = modelId.includes("/")
            ? modelId.split("/").pop()!
            : modelId;

        // Make the image generation request
        const response = await fetch(imagesEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
                ...(providerId === "openrouter" ? { "HTTP-Referer": "https://lumina.ai" } : {}),
            },
            body: JSON.stringify({
                model: normalizedModelId,
                prompt,
                size,
                quality,
                style,
                n,
                response_format: "url", // Get URL instead of base64 for faster response
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = (errorData as any)?.error?.message || response.statusText;
            return new Response(
                JSON.stringify({ error: `Image generation failed: ${errorMessage}` }),
                { status: response.status, headers: { "Content-Type": "application/json" } }
            );
        }

        const data = await response.json();
        const images = (data as any).data || [];

        // Return the generated images
        return new Response(
            JSON.stringify({
                images: images.map((img: any) => ({
                    url: img.url || img.b64_json,
                    revisedPrompt: img.revised_prompt,
                })),
                model: normalizedModelId,
            }),
            { headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Image API error:", error);
        return new Response(
            JSON.stringify({ error: "Failed to process image request" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

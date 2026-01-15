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

        // Normalize model ID (strip provider prefix if present)
        const normalizedModelId = modelId.includes("/")
            ? modelId.split("/").pop()!
            : modelId;

        // Check if this is a DALL-E model (requires OpenAI direct API, not OpenRouter)
        const isDalleModel = normalizedModelId.toLowerCase().includes("dall-e") ||
            normalizedModelId.toLowerCase().includes("dalle");

        // DALL-E models need OpenAI's dedicated /images/generations endpoint
        // They cannot be used via OpenRouter's chat/completions
        if (isDalleModel && providerId === "openrouter") {
            return new Response(
                JSON.stringify({
                    error: "DALL-E models require an OpenAI API key. Please add your OpenAI key in Settings and select 'OpenAI' as the provider."
                }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // OpenRouter uses chat/completions endpoint with modalities for image generation
        // This works for OpenRouter-native image models (GPT-5 Image, Gemini Flash Image, etc.)
        if (providerId === "openrouter" && !isDalleModel) {
            // Some models need explicit image generation instructions
            const isGeminiImageModel = modelId.toLowerCase().includes('gemini') &&
                (modelId.toLowerCase().includes('image') || modelId.toLowerCase().includes('flash'));

            // Format prompt for image generation - some models need explicit instruction
            const formattedPrompt = isGeminiImageModel
                ? `Generate an image: ${prompt}`
                : prompt;

            const requestBody: Record<string, unknown> = {
                model: modelId, // OpenRouter needs full model ID
                messages: [
                    {
                        role: "user",
                        content: formattedPrompt,
                    }
                ],
            };

            // Add modalities for models that support it
            // Note: Some models use this, others use provider-specific params
            requestBody.modalities = ["text", "image"];

            // For Gemini models, try adding provider-specific params
            if (isGeminiImageModel) {
                requestBody.provider = {
                    allow_fallbacks: false,
                };
            }

            console.log("OpenRouter image request:", JSON.stringify(requestBody, null, 2));

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                    "HTTP-Referer": "https://lumina.ai",
                    "X-Title": "Lumina",
                },
                body: JSON.stringify(requestBody),
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
            console.log("OpenRouter image response:", JSON.stringify(data, null, 2));

            const choice = (data as any).choices?.[0];
            const content = choice?.message?.content;

            console.log("Content type:", typeof content, "Array?:", Array.isArray(content));
            console.log("Content value:", JSON.stringify(content)?.slice(0, 200));

            // Extract images from the response
            const images: Array<{ url: string; revisedPrompt?: string }> = [];

            // Helper function to recursively find all b64_json values in an object
            const MAX_DEPTH = 20; // Prevent stack overflow with deeply nested objects
            function findBase64Images(obj: any, found: string[] = [], depth: number = 0): string[] {
                // Depth limit to prevent stack overflow
                if (depth > MAX_DEPTH) {
                    console.warn('[Images API] Max traversal depth reached');
                    return found;
                }
                if (!obj || typeof obj !== 'object') return found;

                if (obj.b64_json && typeof obj.b64_json === 'string') {
                    found.push(obj.b64_json);
                }
                if (obj.url && typeof obj.url === 'string' && (obj.url.startsWith('http') || obj.url.startsWith('data:'))) {
                    found.push(obj.url);
                }

                if (Array.isArray(obj)) {
                    for (const item of obj) {
                        findBase64Images(item, found, depth + 1);
                    }
                } else {
                    for (const key of Object.keys(obj)) {
                        findBase64Images(obj[key], found, depth + 1);
                    }
                }
                return found;
            }

            // First, try to find images anywhere in the response
            const foundImages = findBase64Images(data);
            console.log("Found images via recursive search:", foundImages.length);

            for (const img of foundImages) {
                if (img.startsWith('data:') || img.startsWith('http')) {
                    images.push({ url: img });
                } else {
                    // It's a base64 string without the data URL prefix
                    images.push({ url: `data:image/png;base64,${img}` });
                }
            }

            if (Array.isArray(content)) {
                // Content is an array of parts (text, image_url, etc.)
                for (const part of content) {
                    if (part.type === "image_url" && part.image_url?.url) {
                        images.push({ url: part.image_url.url });
                    } else if (part.type === "image" && part.image?.url) {
                        // Alternative format: { type: "image", image: { url: "..." } }
                        images.push({ url: part.image.url });
                    } else if (part.type === "image" && part.image?.base64) {
                        // Base64 format: { type: "image", image: { base64: "...", media_type: "..." } }
                        const mediaType = part.image.media_type || "image/png";
                        images.push({ url: `data:${mediaType};base64,${part.image.base64}` });
                    } else if (part.type === "image" && typeof part.data === "string") {
                        // Gemini format: { type: "image", data: "base64..." }
                        images.push({ url: `data:image/png;base64,${part.data}` });
                    } else if (part.type === "image_url" && typeof part.url === "string") {
                        // Direct URL format
                        images.push({ url: part.url });
                    } else if (part.b64_json && typeof part.b64_json === "string") {
                        // OpenRouter b64_json format: { b64_json: "...", index: 0 }
                        images.push({ url: `data:image/png;base64,${part.b64_json}` });
                    } else if (part.url && typeof part.url === "string") {
                        // Direct URL in content array: { url: "https://..." }
                        images.push({ url: part.url });
                    }
                }
            } else if (typeof content === "string" && content.startsWith("data:image")) {
                // Content is a base64 data URL
                images.push({ url: content });
            }

            // Check for images in alternative locations
            if (images.length === 0) {
                // Check for inline_data (Gemini format)
                const parts = choice?.message?.parts;
                if (Array.isArray(parts)) {
                    for (const part of parts) {
                        if (part.inline_data?.data) {
                            const mimeType = part.inline_data.mime_type || "image/png";
                            images.push({ url: `data:${mimeType};base64,${part.inline_data.data}` });
                        }
                    }
                }
            }

            if (images.length === 0) {
                console.error("No images found in response. Full data:", JSON.stringify(data, null, 2));

                // Check if the model didn't generate any content at all
                const usage = (data as any).usage;
                if (usage?.completion_tokens === 0) {
                    return new Response(
                        JSON.stringify({
                            error: "The model did not generate any image. This model may not support image generation via this method, or the prompt may need to be more specific. Try a different image model like 'openai/gpt-4o' or 'google/gemini-2.0-flash-exp:free'.",
                        }),
                        { status: 400, headers: { "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({
                        error: "No images found in response. The model may have returned text instead of an image.",
                        debug: { contentType: typeof content, isArray: Array.isArray(content), contentPreview: typeof content === 'string' ? content?.slice?.(0, 200) : JSON.stringify(content)?.slice(0, 200) }
                    }),
                    { status: 500, headers: { "Content-Type": "application/json" } }
                );
            }

            return new Response(
                JSON.stringify({ images, model: modelId }),
                { headers: { "Content-Type": "application/json" } }
            );
        }

        // OpenAI and compatible providers use /images/generations endpoint
        const baseUrl = resolved.baseUrl || "https://api.openai.com/v1";
        const imagesEndpoint = `${baseUrl}/images/generations`;

        const response = await fetch(imagesEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: normalizedModelId,
                prompt,
                size,
                quality,
                style,
                n,
                response_format: "url",
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

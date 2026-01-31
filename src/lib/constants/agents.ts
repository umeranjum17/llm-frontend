import type { Agent } from "@/lib/db/schema";

function now() {
  return Date.now();
}

// Recommended models for different use cases (2026 best picks)
// IMPORTANT: Model IDs must match those in /lib/models/data/featured.json
export const RECOMMENDED_MODELS = {
  coding: "anthropic/claude-sonnet-4.5",        // Best for code & software engineering
  reasoning: "deepseek/deepseek-reasoner",      // Best for math, logic, complex reasoning
  general: "openai/gpt-5.2",                    // Best overall & general purpose
  fast: "google/gemini-3-flash-preview",                // Best for speed & scale
  imageGeneration: "openai/gpt-5-image",        // Best for logos & text rendering
  mascotGeneration: "openai/gpt-5-image",       // Best for character consistency
  diagram: "anthropic/claude-sonnet-4.5",       // Good at structured output
  writing: "openai/gpt-5",                      // Reliable for writing
  agents: "xai/grok-3",                         // Real-time & tool calling
} as const;

export const BUILTIN_AGENTS: Agent[] = [
  {
    id: "agent_builtin_logo_generator",
    name: "Logo Generator",
    description: "Creates professional logos that match your brand colors. Attach existing branding for best results!",
    avatar: "🎨",
    systemPrompt: `You are an elite logo designer with expertise in brand identity, visual communication, and image generation AI.

## YOUR ROLE
Transform brand concepts into professional, memorable logos that match the user's existing visual identity.

## CRITICAL: IMAGE/BRAND ANALYSIS (ALWAYS DO FIRST)
If the user mentions or attaches an image (app screenshot, website, existing branding):
1. **Extract brand colors**: Identify PRIMARY, SECONDARY, and ACCENT colors with hex codes
2. **Identify style**: Modern/classic, playful/professional, minimal/detailed
3. **Note visual elements**: Typography style, shapes, patterns
4. **Report findings**: Tell the user what you detected before designing

Example:
"I can see your brand uses:
- Primary: Electric blue (#3B82F6)
- Secondary: Dark navy (#1E3A5A)
- Accent: White (#FFFFFF)
- Style: Modern, tech-focused, clean lines

I'll design a logo using these exact colors..."

## CRITICAL TECHNICAL REQUIREMENTS
Every logo prompt MUST specify:
- "perfectly centered composition"
- "square 1:1 aspect ratio"
- "solid [BACKGROUND COLOR from brand] background"
- "generous padding around design, nothing touching edges"
- "vector-style clean lines"
- "professional graphic design"
- "isolated logo on background with no other elements"
- **The EXACT hex colors from their brand**

## LOGO TYPES
- **Logomark only**: Icon/symbol without text (best for apps, favicons)
- **Wordmark only**: Stylized company name (best for unique names)
- **Combination mark**: Icon + text lockup (most versatile)
- **Lettermark**: Initials as monogram (best for long names)

## PROMPT STRUCTURE
"Professional [STYLE] logo design for [BRAND], [MAIN VISUAL ELEMENT], using brand colors [HEX CODES], perfectly centered composition, square 1:1 aspect ratio, solid [BACKGROUND HEX] background, generous padding, vector-style clean lines, minimalist graphic design, isolated logo, professional branding"

## BEFORE GENERATING, GATHER:
1. ✅ Confirm colors you detected (if they attached an image)
2. Brand/company name
3. What does the company do?
4. Logomark, wordmark, or combination?
5. Light or dark background?

Remember: Use the EXACT colors from the user's existing brand. Color consistency is critical!`,
    modelId: RECOMMENDED_MODELS.imageGeneration,
    enabledTools: [],
    mcpServerIds: [],
    knowledgeBaseIds: [],
    parameters: { temperature: 0.7 },
    isBuiltIn: true,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
    executionType: "pipeline",
    pipeline: {
      steps: [
        {
          id: "analyze_and_design",
          name: "Analyzing & designing",
          type: "llm",
          modelId: "openai/gpt-4o",  // Vision model to analyze attached images
          providerId: "openrouter",
          systemPrompt: `You are an expert logo designer who analyzes brand assets and creates optimized image generation prompts.

## YOUR TASK
1. If the user mentions or describes their brand/app, extract the visual style and colors
2. If an image/screenshot is provided, CAREFULLY analyze it for theme and colors
3. Create an optimized logo generation prompt

## CRITICAL: DETECT DARK VS LIGHT MODE
Look at the screenshot/image carefully:
- Dark mode apps have: dark/black backgrounds (#0D0D0F, #1a1a1a, #121212), light text
- Light mode apps have: white/light backgrounds (#FFFFFF, #F5F5F5), dark text

**The logo background MUST match the app's theme:**
- Dark mode app → dark background (use the exact dark color from the app)
- Light mode app → light/white background

## ANALYZE FOR:
- Primary background color (CRITICAL - determines logo background)
- Accent/brand color (for the logo design)
- Secondary colors
- Theme: DARK MODE or LIGHT MODE (this is the most important!)

## OUTPUT FORMAT
Output ONLY the optimized image generation prompt. No explanations, no markdown, no quotes.

## PROMPT TEMPLATE:
Professional [style] logo design for [brand name], [main visual element description], using brand colors [accent color hex], perfectly centered composition, square 1:1 aspect ratio, solid [EXACT BACKGROUND COLOR from app theme - dark for dark mode, white for light mode] background, generous padding around design, vector-style clean lines, minimalist graphic design, isolated logo, professional branding

## COLOR RULES
- DARK MODE APP = dark/black background (#0D0D0F or #1a1a1a)
- LIGHT MODE APP = white background (#FFFFFF)
- Use the app's accent color for the logo design
- Keep to 2-3 colors maximum

## IMPORTANT
- ALWAYS specify the background color explicitly with hex code
- Be specific about colors (use hex codes)
- Keep under 400 characters
- Include "perfectly centered", "vector-style", "isolated logo"`,
          inputTemplate: "{{userInput}}",
          outputVariable: "optimizedPrompt",
        },
        {
          id: "generate_logo",
          name: "Generating logo",
          type: "image",
          imageModelId: RECOMMENDED_MODELS.imageGeneration,
          imageProviderId: "openrouter",
          imageSize: "1024x1024",
          imageQuality: "hd",
          inputTemplate: "{{optimizedPrompt}}",
          outputVariable: "finalImage",
        },
      ],
    },
  },
  {
    id: "agent_builtin_claw",
    name: "Claw",
    description: "Your background AI agent. Claw runs 24/7 on your machine, handling tasks like checking emails, managing schedules, and executing background work. Messages sent here go directly to Claw over your local network.",
    avatar: "🦀",
    systemPrompt: "You are Claw, a background AI agent. The user is talking to you through Lumina.",
    modelId: undefined,
    enabledTools: [],
    mcpServerIds: [],
    knowledgeBaseIds: [],
    isBuiltIn: true,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
    executionType: "simple" as const,
  },
];


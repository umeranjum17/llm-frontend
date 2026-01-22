/**
 * Provider configurations for testing reasoning streaming and cache metrics.
 */

export interface ProviderConfig {
  id: string;
  name: string;
  envVar: string;
  reasoningModel?: string;  // Model that supports extended thinking
  standardModel: string;    // Fast/cheap model for basic tests
  baseUrl?: string;         // For custom endpoints
}

/**
 * Provider configurations with reasoning and standard models.
 * Reasoning models are used to test thinking/reasoning streaming.
 * Standard models are used for basic streaming and cache tests.
 */
export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    envVar: 'OPENROUTER_API_KEY',
    reasoningModel: 'deepseek/deepseek-r1',  // Use native reasoning model
    standardModel: 'openai/gpt-4o-mini',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    reasoningModel: 'o4-mini',
    standardModel: 'openai/gpt-4o-mini',  // Prefixed ID for capability lookup
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    reasoningModel: 'anthropic/claude-sonnet-4.5',
    standardModel: 'anthropic/claude-3-haiku',
  },
  {
    id: 'google',
    name: 'Google',
    envVar: 'GOOGLE_API_KEY',
    reasoningModel: 'gemini-2.5-flash-preview-05-20',
    standardModel: 'gemini-2.0-flash',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    envVar: 'DEEPSEEK_API_KEY',
    reasoningModel: 'deepseek-reasoner',
    standardModel: 'deepseek-chat',
  },
  {
    id: 'xai',
    name: 'xAI',
    envVar: 'XAI_API_KEY',
    reasoningModel: 'x-ai/grok-3',  // Has supportsThinking
    standardModel: 'x-ai/grok-code-fast-1',  // Fast model for basic tests
  },
];

/**
 * Test prompt that encourages reasoning/thinking.
 * Should be complex enough to trigger extended thinking on capable models.
 */
export const REASONING_TEST_PROMPT = `Solve this step by step: A farmer has 17 sheep. All but 9 run away. How many are left? Think through each part carefully before answering.`;

/**
 * Simple prompt for basic streaming tests.
 */
export const BASIC_TEST_PROMPT = `Say "Hello, World!" and nothing else.`;

/**
 * System prompt used to encourage caching (repeated across requests).
 * Must be at least 1024 tokens for OpenAI/Anthropic prompt caching.
 */
export const CACHEABLE_SYSTEM_PROMPT = `You are a helpful AI assistant. Your role is to provide accurate, thoughtful, and well-structured responses to user queries.

## Guidelines

1. **Accuracy**: Always strive for factual accuracy. If you're unsure about something, acknowledge it rather than making up information.

2. **Clarity**: Write in clear, simple language. Avoid jargon unless the context requires it.

3. **Structure**: Organize your responses logically with appropriate formatting when helpful.

4. **Conciseness**: Be thorough but avoid unnecessary verbosity.

5. **Helpfulness**: Focus on what the user actually needs, not just what they asked for literally.

## Response Format

When answering questions:
- Start with a direct answer when possible
- Provide context and explanation as needed
- Use bullet points or numbered lists for multiple items
- Include code blocks for technical content

## Limitations

You should be transparent about your limitations:
- You have a knowledge cutoff date
- You cannot browse the internet or access real-time information
- You cannot execute code or interact with external systems
- You may make mistakes and users should verify important information

## Ethics

Always:
- Respect user privacy
- Avoid harmful content
- Be inclusive and respectful
- Acknowledge different perspectives on complex topics

This system prompt is designed to be reused across multiple requests to test prompt caching functionality. The repeated content allows providers that support prompt caching (OpenAI, Anthropic, Google, DeepSeek, etc.) to cache this prefix and reduce costs on subsequent requests.

Additional context to ensure this prompt exceeds the minimum token threshold for caching:

The field of artificial intelligence has evolved dramatically over the past decade. From early rule-based systems to modern large language models, the technology has progressed through several key phases:

1. Symbolic AI (1950s-1980s): Rule-based systems that relied on explicitly programmed knowledge
2. Expert Systems (1970s-1990s): Specialized systems for specific domains
3. Machine Learning (1990s-2010s): Statistical approaches that learn from data
4. Deep Learning (2010s-present): Neural networks with many layers
5. Large Language Models (2020s): Transformer-based models trained on vast text corpora

Each phase built upon the previous, with current LLMs combining insights from all these approaches. The ability to understand and generate human language represents a significant milestone in AI development.

## Technical Foundations

Understanding the technical foundations of modern AI systems helps provide better context for how these systems work:

### Neural Networks
Neural networks are computing systems inspired by biological neural networks. They consist of:
- Input layers that receive data
- Hidden layers that process information through weighted connections
- Output layers that produce results
- Activation functions that introduce non-linearity

### Transformers
The transformer architecture, introduced in "Attention Is All You Need" (2017), revolutionized NLP:
- Self-attention mechanisms allow models to weigh the importance of different parts of the input
- Positional encodings help the model understand sequence order
- Multi-head attention enables parallel processing of different representation subspaces
- Feed-forward networks process the attended information

### Training Processes
Modern LLMs are trained using several techniques:
- Pre-training on large text corpora to learn general language patterns
- Fine-tuning on specific tasks or domains
- Reinforcement Learning from Human Feedback (RLHF) to align with human preferences
- Constitutional AI methods to improve safety and helpfulness

## Prompt Engineering Best Practices

When working with AI assistants, consider these strategies:
- Be specific and clear in your requests
- Provide relevant context and examples
- Break complex tasks into smaller steps
- Iterate and refine based on results
- Use appropriate formatting (markdown, code blocks, etc.)

This extended system prompt now exceeds the 1024 token minimum required for Anthropic prompt caching to activate.

## Additional Context for Token Threshold

The following additional context ensures we meet the minimum token requirements across all providers:

### Model Selection Guidelines
When choosing between different AI models, consider:
- Task complexity and required reasoning depth
- Response latency requirements
- Cost constraints and budget limitations
- Context window needs based on input length
- Specific capability requirements (vision, code, etc.)

### Response Quality Metrics
Evaluate AI responses based on:
- Factual accuracy and correctness
- Relevance to the original query
- Clarity and readability of explanations
- Appropriate level of detail
- Proper formatting and structure

### Error Handling Approaches
When AI responses are inadequate:
- Rephrase the question with more specificity
- Provide additional context or examples
- Break complex requests into smaller parts
- Try alternative models better suited to the task
- Review and iterate on the prompt structure`;

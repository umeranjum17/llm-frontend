import { describe, it, expect, beforeEach } from 'vitest';
import { useStreamingStore } from '../streaming-store';

describe('streaming-store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useStreamingStore.getState().clearStreaming();
  });

  describe('streaming message', () => {
    it('sets streaming message ID and resets content', () => {
      const store = useStreamingStore.getState();

      // First set some content
      store.setStreamingContent('existing content');

      // Now set new streaming message
      store.setStreamingMessage('msg-123');

      const state = useStreamingStore.getState();
      expect(state.streamingMessageId).toBe('msg-123');
      expect(state.streamingContent).toBe('');
      expect(state.streamingReasoning).toBe('');
      expect(state.streamingToolCalls).toEqual([]);
      expect(state.streamingToolResults).toEqual([]);
    });

    it('sets streaming message to null', () => {
      const store = useStreamingStore.getState();
      store.setStreamingMessage('msg-123');
      store.setStreamingMessage(null);

      expect(useStreamingStore.getState().streamingMessageId).toBeNull();
    });
  });

  describe('streaming content', () => {
    it('appends streaming content correctly', () => {
      const store = useStreamingStore.getState();
      store.setStreamingMessage('msg-1');

      store.appendStreamingContent('Hello ');
      store.appendStreamingContent('World');
      store.appendStreamingContent('!');

      expect(useStreamingStore.getState().streamingContent).toBe('Hello World!');
    });

    it('sets streaming content directly', () => {
      const store = useStreamingStore.getState();
      store.setStreamingContent('Direct content');

      expect(useStreamingStore.getState().streamingContent).toBe('Direct content');
    });

    it('increments version on each content append', () => {
      const store = useStreamingStore.getState();
      const initialVersion = useStreamingStore.getState().streamingVersion;

      store.appendStreamingContent('a');
      expect(useStreamingStore.getState().streamingVersion).toBe(initialVersion + 1);

      store.appendStreamingContent('b');
      expect(useStreamingStore.getState().streamingVersion).toBe(initialVersion + 2);
    });
  });

  describe('streaming reasoning', () => {
    it('appends streaming reasoning correctly', () => {
      const store = useStreamingStore.getState();

      store.appendStreamingReasoning('Thinking ');
      store.appendStreamingReasoning('about this...');

      expect(useStreamingStore.getState().streamingReasoning).toBe('Thinking about this...');
    });

    it('sets streaming reasoning directly', () => {
      const store = useStreamingStore.getState();
      store.setStreamingReasoning('Full reasoning');

      expect(useStreamingStore.getState().streamingReasoning).toBe('Full reasoning');
    });
  });

  describe('tool calls and results', () => {
    it('sets streaming tool calls', () => {
      const store = useStreamingStore.getState();
      const toolCalls = [
        { id: 'call-1', name: 'search', args: { query: 'test' } },
        { id: 'call-2', name: 'read', args: { file: 'test.txt' } },
      ];

      store.setStreamingToolCalls(toolCalls);

      expect(useStreamingStore.getState().streamingToolCalls).toEqual(toolCalls);
    });

    it('sets streaming tool results', () => {
      const store = useStreamingStore.getState();
      const toolResults = [
        { id: 'call-1', name: 'search', result: 'Found 5 results' },
      ];

      store.setStreamingToolResults(toolResults);

      expect(useStreamingStore.getState().streamingToolResults).toEqual(toolResults);
    });
  });

  describe('clearStreaming', () => {
    it('resets all streaming state', () => {
      const store = useStreamingStore.getState();

      // Set up various state
      store.setStreamingMessage('msg-1');
      store.appendStreamingContent('content');
      store.appendStreamingReasoning('reasoning');
      store.setStreamingToolCalls([{ id: '1', name: 'test', args: {} }]);
      store.setStreamingToolResults([{ id: '1', name: 'test', result: 'done' }]);
      store.startPipeline([{ id: 'step-1', name: 'Step 1', type: 'llm' }]);
      store.setOptimisticMessage({
        id: 'opt-1',
        content: 'test',
        role: 'user',
        createdAt: Date.now(),
      });

      // Clear everything
      store.clearStreaming();

      const state = useStreamingStore.getState();
      expect(state.streamingMessageId).toBeNull();
      expect(state.streamingContent).toBe('');
      expect(state.streamingReasoning).toBe('');
      expect(state.streamingToolCalls).toEqual([]);
      expect(state.streamingToolResults).toEqual([]);
      expect(state.streamingVersion).toBe(0);
      expect(state.pipelineExecution).toBeNull();
      expect(state.optimisticMessage).toBeNull();
    });
  });

  describe('optimistic messages', () => {
    it('sets optimistic message', () => {
      const store = useStreamingStore.getState();
      const message = {
        id: 'opt-1',
        content: 'Hello',
        role: 'user' as const,
        createdAt: 1234567890,
        status: 'sending' as const,
      };

      store.setOptimisticMessage(message);

      expect(useStreamingStore.getState().optimisticMessage).toEqual(message);
    });

    it('clears optimistic message', () => {
      const store = useStreamingStore.getState();
      store.setOptimisticMessage({
        id: 'opt-1',
        content: 'test',
        role: 'user',
        createdAt: Date.now(),
      });

      store.clearOptimisticMessage();

      expect(useStreamingStore.getState().optimisticMessage).toBeNull();
    });

    it('supports switching-agent status', () => {
      const store = useStreamingStore.getState();
      const message = {
        id: 'opt-1',
        content: '@agent:test[Test Agent]',
        role: 'user' as const,
        createdAt: Date.now(),
        status: 'switching-agent' as const,
        agentName: 'Test Agent',
      };

      store.setOptimisticMessage(message);

      const state = useStreamingStore.getState();
      expect(state.optimisticMessage?.status).toBe('switching-agent');
      expect(state.optimisticMessage?.agentName).toBe('Test Agent');
    });
  });

  describe('pipeline execution', () => {
    it('starts pipeline with steps', () => {
      const store = useStreamingStore.getState();
      const steps = [
        { id: '1', name: 'Analyze', type: 'llm' as const },
        { id: '2', name: 'Generate Image', type: 'image' as const },
        { id: '3', name: 'Use Tool', type: 'tool' as const },
      ];

      store.startPipeline(steps);

      const state = useStreamingStore.getState();
      expect(state.pipelineExecution).not.toBeNull();
      expect(state.pipelineExecution?.isActive).toBe(true);
      expect(state.pipelineExecution?.currentStepIndex).toBe(0);
      expect(state.pipelineExecution?.totalSteps).toBe(3);
      expect(state.pipelineExecution?.steps).toHaveLength(3);
      expect(state.pipelineExecution?.steps[0].status).toBe('pending');
      expect(state.pipelineExecution?.steps[1].status).toBe('pending');
      expect(state.pipelineExecution?.steps[2].status).toBe('pending');
    });

    it('sets step to running', () => {
      const store = useStreamingStore.getState();
      store.startPipeline([
        { id: '1', name: 'Step 1', type: 'llm' },
        { id: '2', name: 'Step 2', type: 'tool' },
      ]);

      store.setStepRunning(0, 'User input');

      const state = useStreamingStore.getState();
      expect(state.pipelineExecution?.currentStepIndex).toBe(0);
      expect(state.pipelineExecution?.steps[0].status).toBe('running');
      expect(state.pipelineExecution?.steps[0].input).toBe('User input');
    });

    it('sets step to complete with output', () => {
      const store = useStreamingStore.getState();
      store.startPipeline([
        { id: '1', name: 'Step 1', type: 'llm' },
      ]);
      store.setStepRunning(0);

      store.setStepComplete(0, 'Generated response');

      const state = useStreamingStore.getState();
      expect(state.pipelineExecution?.steps[0].status).toBe('complete');
      expect(state.pipelineExecution?.steps[0].output).toBe('Generated response');
    });

    it('sets step to complete with tool calls', () => {
      const store = useStreamingStore.getState();
      store.startPipeline([
        { id: '1', name: 'Tool Step', type: 'tool' },
      ]);
      store.setStepRunning(0);

      const toolCalls = [
        { toolName: 'search', args: { q: 'test' }, result: 'results' },
      ];
      store.setStepComplete(0, 'Done', toolCalls);

      const state = useStreamingStore.getState();
      expect(state.pipelineExecution?.steps[0].toolCalls).toEqual(toolCalls);
    });

    it('sets step error', () => {
      const store = useStreamingStore.getState();
      store.startPipeline([
        { id: '1', name: 'Step 1', type: 'llm' },
      ]);
      store.setStepRunning(0);

      store.setStepError(0, 'API rate limited');

      const state = useStreamingStore.getState();
      expect(state.pipelineExecution?.steps[0].status).toBe('error');
      expect(state.pipelineExecution?.steps[0].error).toBe('API rate limited');
    });

    it('completes pipeline with final result', () => {
      const store = useStreamingStore.getState();
      store.startPipeline([
        { id: '1', name: 'Step 1', type: 'llm' },
      ]);
      store.setStepRunning(0);
      store.setStepComplete(0, 'Step output');

      store.completePipeline('Final pipeline result');

      const state = useStreamingStore.getState();
      expect(state.pipelineExecution?.isActive).toBe(false);
      expect(state.pipelineExecution?.finalResult).toBe('Final pipeline result');
    });

    it('fails pipeline with error', () => {
      const store = useStreamingStore.getState();
      store.startPipeline([
        { id: '1', name: 'Step 1', type: 'llm' },
      ]);

      store.failPipeline('Pipeline failed due to error');

      const state = useStreamingStore.getState();
      expect(state.pipelineExecution?.isActive).toBe(false);
      expect(state.pipelineExecution?.error).toBe('Pipeline failed due to error');
    });

    it('clears pipeline', () => {
      const store = useStreamingStore.getState();
      store.startPipeline([
        { id: '1', name: 'Step 1', type: 'llm' },
      ]);

      store.clearPipeline();

      expect(useStreamingStore.getState().pipelineExecution).toBeNull();
    });

    it('handles step actions when no pipeline exists', () => {
      const store = useStreamingStore.getState();

      // These should not throw when pipeline is null
      store.setStepRunning(0);
      store.setStepComplete(0, 'output');
      store.setStepError(0, 'error');

      expect(useStreamingStore.getState().pipelineExecution).toBeNull();
    });

    it('tracks multi-step pipeline progression', () => {
      const store = useStreamingStore.getState();
      store.startPipeline([
        { id: '1', name: 'Analyze', type: 'llm' },
        { id: '2', name: 'Transform', type: 'tool' },
        { id: '3', name: 'Generate', type: 'image' },
      ]);

      // Step 1: Running -> Complete
      store.setStepRunning(0, 'Input text');
      expect(useStreamingStore.getState().pipelineExecution?.currentStepIndex).toBe(0);

      store.setStepComplete(0, 'Analysis result');
      expect(useStreamingStore.getState().pipelineExecution?.steps[0].status).toBe('complete');

      // Step 2: Running -> Complete
      store.setStepRunning(1, 'Analysis result');
      expect(useStreamingStore.getState().pipelineExecution?.currentStepIndex).toBe(1);

      store.setStepComplete(1, 'Transformed data');
      expect(useStreamingStore.getState().pipelineExecution?.steps[1].status).toBe('complete');

      // Step 3: Running -> Complete
      store.setStepRunning(2, 'Transformed data');
      store.setStepComplete(2, { type: 'image', url: 'https://example.com/image.png' });

      // Complete pipeline
      store.completePipeline({ type: 'image', url: 'https://example.com/image.png' });

      const finalState = useStreamingStore.getState();
      expect(finalState.pipelineExecution?.isActive).toBe(false);
      expect(finalState.pipelineExecution?.steps.every(s => s.status === 'complete')).toBe(true);
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { useStreamingStore } from '../streaming-store';

const CHAT_ID = 'test-chat-1';

describe('streaming-store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useStreamingStore.getState().clearStreaming(CHAT_ID);
  });

  describe('streaming message', () => {
    it('sets streaming message ID and resets content', () => {
      const store = useStreamingStore.getState();

      // First set some content
      store.setStreamingContent(CHAT_ID, 'existing content');

      // Now set new streaming message
      store.setStreamingMessage(CHAT_ID, 'msg-123');

      const stream = useStreamingStore.getState().getChatStream(CHAT_ID);
      expect(stream.streamingMessageId).toBe('msg-123');
      expect(stream.streamingContent).toBe('');
      expect(stream.streamingReasoning).toBe('');
      expect(stream.streamingToolCalls).toEqual([]);
      expect(stream.streamingToolResults).toEqual([]);
      expect(stream.streamingApprovals).toEqual([]);
    });

    it('sets streaming message to null', () => {
      const store = useStreamingStore.getState();
      store.setStreamingMessage(CHAT_ID, 'msg-123');
      store.setStreamingMessage(CHAT_ID, null);

      expect(useStreamingStore.getState().getChatStream(CHAT_ID).streamingMessageId).toBeNull();
    });
  });

  describe('streaming content', () => {
    it('appends streaming content correctly', () => {
      const store = useStreamingStore.getState();
      store.setStreamingMessage(CHAT_ID, 'msg-1');

      store.appendStreamingContent(CHAT_ID, 'Hello ');
      store.appendStreamingContent(CHAT_ID, 'World');
      store.appendStreamingContent(CHAT_ID, '!');

      expect(useStreamingStore.getState().getChatStream(CHAT_ID).streamingContent).toBe('Hello World!');
    });

    it('sets streaming content directly', () => {
      const store = useStreamingStore.getState();
      store.setStreamingContent(CHAT_ID, 'Direct content');

      expect(useStreamingStore.getState().getChatStream(CHAT_ID).streamingContent).toBe('Direct content');
    });

    it('increments version on each content append', () => {
      const store = useStreamingStore.getState();
      store.setStreamingMessage(CHAT_ID, 'msg-1');
      const initialVersion = useStreamingStore.getState().getChatStream(CHAT_ID).streamingVersion;

      store.appendStreamingContent(CHAT_ID, 'a');
      expect(useStreamingStore.getState().getChatStream(CHAT_ID).streamingVersion).toBe(initialVersion + 1);

      store.appendStreamingContent(CHAT_ID, 'b');
      expect(useStreamingStore.getState().getChatStream(CHAT_ID).streamingVersion).toBe(initialVersion + 2);
    });
  });

  describe('streaming reasoning', () => {
    it('appends streaming reasoning correctly', () => {
      const store = useStreamingStore.getState();

      store.appendStreamingReasoning(CHAT_ID, 'Thinking ');
      store.appendStreamingReasoning(CHAT_ID, 'about this...');

      expect(useStreamingStore.getState().getChatStream(CHAT_ID).streamingReasoning).toBe('Thinking about this...');
    });

    it('sets streaming reasoning directly', () => {
      const store = useStreamingStore.getState();
      store.setStreamingReasoning(CHAT_ID, 'Full reasoning');

      expect(useStreamingStore.getState().getChatStream(CHAT_ID).streamingReasoning).toBe('Full reasoning');
    });
  });

  describe('tool calls and results', () => {
    it('sets streaming tool calls', () => {
      const store = useStreamingStore.getState();
      const toolCalls = [
        { id: 'call-1', name: 'search', args: { query: 'test' } },
        { id: 'call-2', name: 'read', args: { file: 'test.txt' } },
      ];

      store.setStreamingToolCalls(CHAT_ID, toolCalls);

      expect(useStreamingStore.getState().getChatStream(CHAT_ID).streamingToolCalls).toEqual(toolCalls);
    });

    it('sets streaming tool results', () => {
      const store = useStreamingStore.getState();
      const toolResults = [
        { id: 'call-1', name: 'search', result: 'Found 5 results' },
      ];

      store.setStreamingToolResults(CHAT_ID, toolResults);

      expect(useStreamingStore.getState().getChatStream(CHAT_ID).streamingToolResults).toEqual(toolResults);
    });
  });

  describe('streaming approvals', () => {
    const approval = {
      id: 'approval-1',
      toolName: 'run_shell',
      args: { command: 'rm -rf /tmp/test' },
      source: 'chat',
      taskId: 'task-1',
      reason: 'Need to clean temporary files',
      createdAt: Date.now(),
      timeoutMs: 300000,
    };

    it('sets streaming approvals', () => {
      const store = useStreamingStore.getState();
      store.setStreamingApprovals(CHAT_ID, [approval]);
      expect(useStreamingStore.getState().getChatStream(CHAT_ID).streamingApprovals).toEqual([approval]);
    });

    it('upserts streaming approval by id', () => {
      const store = useStreamingStore.getState();
      store.upsertStreamingApproval(CHAT_ID, approval);
      store.upsertStreamingApproval(CHAT_ID, { ...approval, reason: 'Updated reason' });
      const approvals = useStreamingStore.getState().getChatStream(CHAT_ID).streamingApprovals;
      expect(approvals).toHaveLength(1);
      expect(approvals[0].reason).toBe('Updated reason');
    });

    it('removes streaming approval by id', () => {
      const store = useStreamingStore.getState();
      store.upsertStreamingApproval(CHAT_ID, approval);
      store.removeStreamingApproval(CHAT_ID, approval.id);
      expect(useStreamingStore.getState().getChatStream(CHAT_ID).streamingApprovals).toEqual([]);
    });

    it('removes streaming approval across all chats', () => {
      const store = useStreamingStore.getState();
      store.upsertStreamingApproval(CHAT_ID, approval);
      store.upsertStreamingApproval('test-chat-2', { ...approval, id: 'approval-2', taskId: 'task-2' });
      store.removeStreamingApprovalEverywhere('approval-2');
      expect(useStreamingStore.getState().getChatStream(CHAT_ID).streamingApprovals).toHaveLength(1);
      expect(useStreamingStore.getState().getChatStream('test-chat-2').streamingApprovals).toEqual([]);
    });
  });

  describe('clearStreaming', () => {
    it('resets all streaming state', () => {
      const store = useStreamingStore.getState();

      // Set up various state
      store.setStreamingMessage(CHAT_ID, 'msg-1');
      store.appendStreamingContent(CHAT_ID, 'content');
      store.appendStreamingReasoning(CHAT_ID, 'reasoning');
      store.setStreamingToolCalls(CHAT_ID, [{ id: '1', name: 'test', args: {} }]);
      store.setStreamingToolResults(CHAT_ID, [{ id: '1', name: 'test', result: 'done' }]);
      store.startPipeline(CHAT_ID, [{ id: 'step-1', name: 'Step 1', type: 'llm' }]);
      store.setOptimisticMessage(CHAT_ID, {
        id: 'opt-1',
        content: 'test',
        role: 'user',
        createdAt: Date.now(),
      });

      // Clear everything
      store.clearStreaming(CHAT_ID);

      // After clearing with no queue/skill, the chat entry is removed entirely
      // getChatStream returns the frozen default state
      const stream = useStreamingStore.getState().getChatStream(CHAT_ID);
      expect(stream.streamingMessageId).toBeNull();
      expect(stream.streamingContent).toBe('');
      expect(stream.streamingReasoning).toBe('');
      expect(stream.streamingToolCalls).toEqual([]);
      expect(stream.streamingToolResults).toEqual([]);
      expect(stream.streamingApprovals).toEqual([]);
      expect(stream.streamingVersion).toBe(0);
      expect(stream.pipelineExecution).toBeNull();
      expect(stream.optimisticMessage).toBeNull();
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

      store.setOptimisticMessage(CHAT_ID, message);

      expect(useStreamingStore.getState().getChatStream(CHAT_ID).optimisticMessage).toEqual(message);
    });

    it('clears optimistic message', () => {
      const store = useStreamingStore.getState();
      store.setOptimisticMessage(CHAT_ID, {
        id: 'opt-1',
        content: 'test',
        role: 'user',
        createdAt: Date.now(),
      });

      store.clearOptimisticMessage(CHAT_ID);

      expect(useStreamingStore.getState().getChatStream(CHAT_ID).optimisticMessage).toBeNull();
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

      store.setOptimisticMessage(CHAT_ID, message);

      const stream = useStreamingStore.getState().getChatStream(CHAT_ID);
      expect(stream.optimisticMessage?.status).toBe('switching-agent');
      expect(stream.optimisticMessage?.agentName).toBe('Test Agent');
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

      store.startPipeline(CHAT_ID, steps);

      const stream = useStreamingStore.getState().getChatStream(CHAT_ID);
      expect(stream.pipelineExecution).not.toBeNull();
      expect(stream.pipelineExecution?.isActive).toBe(true);
      expect(stream.pipelineExecution?.currentStepIndex).toBe(0);
      expect(stream.pipelineExecution?.totalSteps).toBe(3);
      expect(stream.pipelineExecution?.steps).toHaveLength(3);
      expect(stream.pipelineExecution?.steps[0].status).toBe('pending');
      expect(stream.pipelineExecution?.steps[1].status).toBe('pending');
      expect(stream.pipelineExecution?.steps[2].status).toBe('pending');
    });

    it('sets step to running', () => {
      const store = useStreamingStore.getState();
      store.startPipeline(CHAT_ID, [
        { id: '1', name: 'Step 1', type: 'llm' },
        { id: '2', name: 'Step 2', type: 'tool' },
      ]);

      store.setStepRunning(CHAT_ID, 0, 'User input');

      const stream = useStreamingStore.getState().getChatStream(CHAT_ID);
      expect(stream.pipelineExecution?.currentStepIndex).toBe(0);
      expect(stream.pipelineExecution?.steps[0].status).toBe('running');
      expect(stream.pipelineExecution?.steps[0].input).toBe('User input');
    });

    it('sets step to complete with output', () => {
      const store = useStreamingStore.getState();
      store.startPipeline(CHAT_ID, [
        { id: '1', name: 'Step 1', type: 'llm' },
      ]);
      store.setStepRunning(CHAT_ID, 0);

      store.setStepComplete(CHAT_ID, 0, 'Generated response');

      const stream = useStreamingStore.getState().getChatStream(CHAT_ID);
      expect(stream.pipelineExecution?.steps[0].status).toBe('complete');
      expect(stream.pipelineExecution?.steps[0].output).toBe('Generated response');
    });

    it('sets step to complete with tool calls', () => {
      const store = useStreamingStore.getState();
      store.startPipeline(CHAT_ID, [
        { id: '1', name: 'Tool Step', type: 'tool' },
      ]);
      store.setStepRunning(CHAT_ID, 0);

      const toolCalls = [
        { toolName: 'search', args: { q: 'test' }, result: 'results' },
      ];
      store.setStepComplete(CHAT_ID, 0, 'Done', toolCalls);

      const stream = useStreamingStore.getState().getChatStream(CHAT_ID);
      expect(stream.pipelineExecution?.steps[0].toolCalls).toEqual(toolCalls);
    });

    it('sets step error', () => {
      const store = useStreamingStore.getState();
      store.startPipeline(CHAT_ID, [
        { id: '1', name: 'Step 1', type: 'llm' },
      ]);
      store.setStepRunning(CHAT_ID, 0);

      store.setStepError(CHAT_ID, 0, 'API rate limited');

      const stream = useStreamingStore.getState().getChatStream(CHAT_ID);
      expect(stream.pipelineExecution?.steps[0].status).toBe('error');
      expect(stream.pipelineExecution?.steps[0].error).toBe('API rate limited');
    });

    it('completes pipeline with final result', () => {
      const store = useStreamingStore.getState();
      store.startPipeline(CHAT_ID, [
        { id: '1', name: 'Step 1', type: 'llm' },
      ]);
      store.setStepRunning(CHAT_ID, 0);
      store.setStepComplete(CHAT_ID, 0, 'Step output');

      store.completePipeline(CHAT_ID, 'Final pipeline result');

      const stream = useStreamingStore.getState().getChatStream(CHAT_ID);
      expect(stream.pipelineExecution?.isActive).toBe(false);
      expect(stream.pipelineExecution?.finalResult).toBe('Final pipeline result');
    });

    it('fails pipeline with error', () => {
      const store = useStreamingStore.getState();
      store.startPipeline(CHAT_ID, [
        { id: '1', name: 'Step 1', type: 'llm' },
      ]);

      store.failPipeline(CHAT_ID, 'Pipeline failed due to error');

      const stream = useStreamingStore.getState().getChatStream(CHAT_ID);
      expect(stream.pipelineExecution?.isActive).toBe(false);
      expect(stream.pipelineExecution?.error).toBe('Pipeline failed due to error');
    });

    it('clears pipeline', () => {
      const store = useStreamingStore.getState();
      store.startPipeline(CHAT_ID, [
        { id: '1', name: 'Step 1', type: 'llm' },
      ]);

      store.clearPipeline(CHAT_ID);

      expect(useStreamingStore.getState().getChatStream(CHAT_ID).pipelineExecution).toBeNull();
    });

    it('handles step actions when no pipeline exists', () => {
      const store = useStreamingStore.getState();

      // These should not throw when pipeline is null
      store.setStepRunning(CHAT_ID, 0);
      store.setStepComplete(CHAT_ID, 0, 'output');
      store.setStepError(CHAT_ID, 0, 'error');

      expect(useStreamingStore.getState().getChatStream(CHAT_ID).pipelineExecution).toBeNull();
    });

    it('tracks multi-step pipeline progression', () => {
      const store = useStreamingStore.getState();
      store.startPipeline(CHAT_ID, [
        { id: '1', name: 'Analyze', type: 'llm' },
        { id: '2', name: 'Transform', type: 'tool' },
        { id: '3', name: 'Generate', type: 'image' },
      ]);

      // Step 1: Running -> Complete
      store.setStepRunning(CHAT_ID, 0, 'Input text');
      expect(useStreamingStore.getState().getChatStream(CHAT_ID).pipelineExecution?.currentStepIndex).toBe(0);

      store.setStepComplete(CHAT_ID, 0, 'Analysis result');
      expect(useStreamingStore.getState().getChatStream(CHAT_ID).pipelineExecution?.steps[0].status).toBe('complete');

      // Step 2: Running -> Complete
      store.setStepRunning(CHAT_ID, 1, 'Analysis result');
      expect(useStreamingStore.getState().getChatStream(CHAT_ID).pipelineExecution?.currentStepIndex).toBe(1);

      store.setStepComplete(CHAT_ID, 1, 'Transformed data');
      expect(useStreamingStore.getState().getChatStream(CHAT_ID).pipelineExecution?.steps[1].status).toBe('complete');

      // Step 3: Running -> Complete
      store.setStepRunning(CHAT_ID, 2, 'Transformed data');
      store.setStepComplete(CHAT_ID, 2, { type: 'image', url: 'https://example.com/image.png' });

      // Complete pipeline
      store.completePipeline(CHAT_ID, { type: 'image', url: 'https://example.com/image.png' });

      const finalStream = useStreamingStore.getState().getChatStream(CHAT_ID);
      expect(finalStream.pipelineExecution?.isActive).toBe(false);
      expect(finalStream.pipelineExecution?.steps.every(s => s.status === 'complete')).toBe(true);
    });
  });
});

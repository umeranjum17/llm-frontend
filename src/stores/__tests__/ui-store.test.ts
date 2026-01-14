import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore, type Artifact } from '../ui-store';

describe('ui-store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useUIStore.setState({
      sidebarCollapsed: false,
      activeChatId: null,
      secondaryChatId: null,
      isSplitView: false,
      commandPaletteOpen: false,
      modelPickerOpen: false,
      toolSelectorOpen: false,
      showArtifacts: false,
      activeArtifact: null,
      artifactTabs: [],
      isArenaMode: false,
      arenaModelIds: [],
      isFocusMode: false,
      artifactsFullscreen: false,
    });
  });

  describe('sidebar state', () => {
    it('toggles sidebar collapsed state', () => {
      const store = useUIStore.getState();

      expect(store.sidebarCollapsed).toBe(false);

      store.setSidebarCollapsed(true);
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);

      store.setSidebarCollapsed(false);
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('active chat', () => {
    it('sets active chat ID', () => {
      const store = useUIStore.getState();

      store.setActiveChatId('chat-123');
      expect(useUIStore.getState().activeChatId).toBe('chat-123');
    });

    it('clears active chat ID', () => {
      const store = useUIStore.getState();
      store.setActiveChatId('chat-123');

      store.setActiveChatId(null);
      expect(useUIStore.getState().activeChatId).toBeNull();
    });
  });

  describe('split view', () => {
    it('enables split view', () => {
      const store = useUIStore.getState();

      store.setIsSplitView(true);
      expect(useUIStore.getState().isSplitView).toBe(true);
    });

    it('sets secondary chat ID for split view', () => {
      const store = useUIStore.getState();
      store.setIsSplitView(true);
      store.setActiveChatId('chat-1');

      store.setSecondaryChatId('chat-2');

      const state = useUIStore.getState();
      expect(state.isSplitView).toBe(true);
      expect(state.activeChatId).toBe('chat-1');
      expect(state.secondaryChatId).toBe('chat-2');
    });

    it('clears secondary chat when disabling split view', () => {
      const store = useUIStore.getState();
      store.setIsSplitView(true);
      store.setSecondaryChatId('chat-2');

      store.setIsSplitView(false);
      store.setSecondaryChatId(null);

      expect(useUIStore.getState().secondaryChatId).toBeNull();
    });
  });

  describe('dialog states', () => {
    it('toggles command palette', () => {
      const store = useUIStore.getState();

      store.setCommandPaletteOpen(true);
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);

      store.setCommandPaletteOpen(false);
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });

    it('toggles model picker', () => {
      const store = useUIStore.getState();

      store.setModelPickerOpen(true);
      expect(useUIStore.getState().modelPickerOpen).toBe(true);

      store.setModelPickerOpen(false);
      expect(useUIStore.getState().modelPickerOpen).toBe(false);
    });

    it('toggles tool selector', () => {
      const store = useUIStore.getState();

      store.setToolSelectorOpen(true);
      expect(useUIStore.getState().toolSelectorOpen).toBe(true);

      store.setToolSelectorOpen(false);
      expect(useUIStore.getState().toolSelectorOpen).toBe(false);
    });
  });

  describe('artifacts', () => {
    const sampleArtifact: Artifact = {
      id: 'artifact-1',
      title: 'Test Code',
      code: 'console.log("hello")',
      language: 'javascript',
      type: 'code',
    };

    it('shows artifacts panel', () => {
      const store = useUIStore.getState();

      store.setShowArtifacts(true);
      expect(useUIStore.getState().showArtifacts).toBe(true);
    });

    it('sets active artifact and adds to tabs', () => {
      const store = useUIStore.getState();

      store.setActiveArtifact(sampleArtifact);

      const state = useUIStore.getState();
      expect(state.activeArtifact).toEqual(sampleArtifact);
      expect(state.artifactTabs).toHaveLength(1);
      expect(state.artifactTabs[0]).toEqual(sampleArtifact);
      expect(state.showArtifacts).toBe(true);
    });

    it('does not duplicate artifact in tabs', () => {
      const store = useUIStore.getState();

      store.setActiveArtifact(sampleArtifact);
      store.setActiveArtifact(sampleArtifact); // Set same artifact again

      const state = useUIStore.getState();
      expect(state.artifactTabs).toHaveLength(1);
    });

    it('adds multiple artifacts to tabs', () => {
      const store = useUIStore.getState();
      const artifact2: Artifact = {
        id: 'artifact-2',
        title: 'Another Code',
        code: 'print("hi")',
        language: 'python',
        type: 'code',
      };

      store.setActiveArtifact(sampleArtifact);
      store.addArtifactTab(artifact2);

      const state = useUIStore.getState();
      expect(state.artifactTabs).toHaveLength(2);
      expect(state.activeArtifact).toEqual(artifact2);
    });

    it('removes artifact tab and switches to last tab', () => {
      const store = useUIStore.getState();
      const artifact2: Artifact = {
        id: 'artifact-2',
        title: 'Second',
        code: 'code2',
        language: 'text',
        type: 'code',
      };

      store.addArtifactTab(sampleArtifact);
      store.addArtifactTab(artifact2);

      store.removeArtifactTab('artifact-2');

      const state = useUIStore.getState();
      expect(state.artifactTabs).toHaveLength(1);
      expect(state.activeArtifact).toEqual(sampleArtifact);
    });

    it('hides artifacts when last tab is removed', () => {
      const store = useUIStore.getState();

      store.addArtifactTab(sampleArtifact);
      expect(useUIStore.getState().showArtifacts).toBe(true);

      store.removeArtifactTab('artifact-1');

      const state = useUIStore.getState();
      expect(state.artifactTabs).toHaveLength(0);
      expect(state.activeArtifact).toBeNull();
      expect(state.showArtifacts).toBe(false);
    });

    it('clears all artifact tabs', () => {
      const store = useUIStore.getState();

      store.addArtifactTab(sampleArtifact);
      store.addArtifactTab({
        id: 'artifact-2',
        title: 'Second',
        code: 'code',
        language: 'text',
        type: 'code',
      });

      store.clearArtifactTabs();

      const state = useUIStore.getState();
      expect(state.artifactTabs).toHaveLength(0);
      expect(state.activeArtifact).toBeNull();
      expect(state.showArtifacts).toBe(false);
    });

    it('sets artifacts fullscreen mode', () => {
      const store = useUIStore.getState();

      store.setArtifactsFullscreen(true);
      expect(useUIStore.getState().artifactsFullscreen).toBe(true);

      store.setArtifactsFullscreen(false);
      expect(useUIStore.getState().artifactsFullscreen).toBe(false);
    });

    it('handles different artifact types', () => {
      const store = useUIStore.getState();

      const types: Artifact['type'][] = ['code', 'image', 'video', 'html', 'markdown', 'csv', 'sheet', 'chart', 'docx', 'project'];

      types.forEach((type, index) => {
        const artifact: Artifact = {
          id: `artifact-${index}`,
          title: `${type} artifact`,
          code: 'content',
          language: 'text',
          type,
        };
        store.addArtifactTab(artifact);
      });

      expect(useUIStore.getState().artifactTabs).toHaveLength(types.length);
    });
  });

  describe('arena mode', () => {
    it('enables arena mode', () => {
      const store = useUIStore.getState();

      store.setIsArenaMode(true);
      expect(useUIStore.getState().isArenaMode).toBe(true);
    });

    it('sets arena model IDs', () => {
      const store = useUIStore.getState();
      const modelIds = ['gpt-4', 'claude-3-sonnet'];

      store.setArenaModelIds(modelIds);

      expect(useUIStore.getState().arenaModelIds).toEqual(modelIds);
    });

    it('clears arena model IDs when disabling', () => {
      const store = useUIStore.getState();

      store.setIsArenaMode(true);
      store.setArenaModelIds(['gpt-4', 'claude-3-sonnet']);

      store.setIsArenaMode(false);
      store.setArenaModelIds([]);

      expect(useUIStore.getState().arenaModelIds).toEqual([]);
    });
  });

  describe('focus mode', () => {
    it('toggles focus mode', () => {
      const store = useUIStore.getState();

      store.setIsFocusMode(true);
      expect(useUIStore.getState().isFocusMode).toBe(true);

      store.setIsFocusMode(false);
      expect(useUIStore.getState().isFocusMode).toBe(false);
    });
  });

  describe('state persistence', () => {
    it('maintains independent state for different features', () => {
      const store = useUIStore.getState();

      // Set multiple states
      store.setActiveChatId('chat-1');
      store.setIsSplitView(true);
      store.setSecondaryChatId('chat-2');
      store.setIsArenaMode(false);
      store.setSidebarCollapsed(true);
      store.setShowArtifacts(false);
      store.setIsFocusMode(true);

      const state = useUIStore.getState();
      expect(state.activeChatId).toBe('chat-1');
      expect(state.isSplitView).toBe(true);
      expect(state.secondaryChatId).toBe('chat-2');
      expect(state.isArenaMode).toBe(false);
      expect(state.sidebarCollapsed).toBe(true);
      expect(state.showArtifacts).toBe(false);
      expect(state.isFocusMode).toBe(true);
    });
  });
});

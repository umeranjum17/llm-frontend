import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useClawNotificationStore } from '../claw-notification-store';

describe('claw-notification-store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset store state before each test
    useClawNotificationStore.getState().clearAll();
    // Reset deduplication and batching state
    useClawNotificationStore.getState()._resetDedupState?.();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic functionality', () => {
    it('adds a notification', () => {
      const store = useClawNotificationStore.getState();
      store.addNotification({
        type: 'task:completed',
        title: 'Task Done',
        message: 'Your task completed successfully',
      });

      const notifications = useClawNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Task Done');
      expect(notifications[0].read).toBe(false);
    });

    it('marks notification as read', () => {
      const store = useClawNotificationStore.getState();
      store.addNotification({
        type: 'task:completed',
        title: 'Task Done',
        message: 'Your task completed successfully',
      });

      const id = useClawNotificationStore.getState().notifications[0].id;
      store.markAsRead(id);

      expect(useClawNotificationStore.getState().notifications[0].read).toBe(true);
    });

    it('marks all notifications as read', () => {
      const store = useClawNotificationStore.getState();
      store.addNotification({
        type: 'task:completed',
        title: 'Task 1',
        message: 'Message 1',
      });
      store.addNotification({
        type: 'task:failed',
        title: 'Task 2',
        message: 'Message 2',
      });

      store.markAllAsRead();

      const notifications = useClawNotificationStore.getState().notifications;
      expect(notifications.every(n => n.read)).toBe(true);
    });

    it('clears all notifications', () => {
      const store = useClawNotificationStore.getState();
      store.addNotification({
        type: 'task:completed',
        title: 'Task 1',
        message: 'Message 1',
      });

      store.clearAll();

      expect(useClawNotificationStore.getState().notifications).toHaveLength(0);
    });
  });

  describe('deduplication', () => {
    it('deduplicates keys:synced notifications within 60 second window', () => {
      const store = useClawNotificationStore.getState();

      // First notification should be added
      store.addNotification({
        type: 'keys:synced',
        title: 'Keys Synced',
        message: 'API keys have been synced',
      });

      expect(useClawNotificationStore.getState().notifications).toHaveLength(1);

      // Second notification within window should be skipped
      vi.advanceTimersByTime(30_000); // 30 seconds
      store.addNotification({
        type: 'keys:synced',
        title: 'Keys Synced',
        message: 'API keys have been synced again',
      });

      expect(useClawNotificationStore.getState().notifications).toHaveLength(1);

      // Third notification within window should also be skipped
      vi.advanceTimersByTime(20_000); // 50 seconds total
      store.addNotification({
        type: 'keys:synced',
        title: 'Keys Synced',
        message: 'API keys have been synced third time',
      });

      // 3 rapid keys:synced calls should result in 1 notification
      expect(useClawNotificationStore.getState().notifications).toHaveLength(1);
    });

    it('allows keys:synced notification after 60 second window expires', () => {
      const store = useClawNotificationStore.getState();

      // First notification
      store.addNotification({
        type: 'keys:synced',
        title: 'Keys Synced',
        message: 'API keys have been synced',
      });

      expect(useClawNotificationStore.getState().notifications).toHaveLength(1);

      // Wait for window to expire
      vi.advanceTimersByTime(61_000); // 61 seconds

      // Second notification after window should be added
      store.addNotification({
        type: 'keys:synced',
        title: 'Keys Synced',
        message: 'API keys have been synced again',
      });

      expect(useClawNotificationStore.getState().notifications).toHaveLength(2);
    });

    it('deduplicates schedule:triggered notifications within 60 second window', () => {
      const store = useClawNotificationStore.getState();

      store.addNotification({
        type: 'schedule:triggered',
        title: 'Schedule Triggered',
        message: 'Daily backup started',
      });

      expect(useClawNotificationStore.getState().notifications).toHaveLength(1);

      vi.advanceTimersByTime(30_000);
      store.addNotification({
        type: 'schedule:triggered',
        title: 'Schedule Triggered',
        message: 'Another trigger',
      });

      expect(useClawNotificationStore.getState().notifications).toHaveLength(1);
    });

    it('does not deduplicate different notification types', () => {
      const store = useClawNotificationStore.getState();

      store.addNotification({
        type: 'keys:synced',
        title: 'Keys Synced',
        message: 'API keys synced',
      });

      store.addNotification({
        type: 'task:completed',
        title: 'Task Done',
        message: 'Task completed',
      });

      expect(useClawNotificationStore.getState().notifications).toHaveLength(2);
    });
  });

  describe('batching', () => {
    it('batches rapid activity:new notifications within 2 second window', () => {
      const store = useClawNotificationStore.getState();

      // Add 5 activity notifications rapidly
      store.addNotification({
        type: 'activity:new',
        title: 'New Activity',
        message: 'User logged in',
      });

      store.addNotification({
        type: 'activity:new',
        title: 'New Activity',
        message: 'User created document',
      });

      store.addNotification({
        type: 'activity:new',
        title: 'New Activity',
        message: 'User shared file',
      });

      store.addNotification({
        type: 'activity:new',
        title: 'New Activity',
        message: 'User updated settings',
      });

      store.addNotification({
        type: 'activity:new',
        title: 'New Activity',
        message: 'User sent message',
      });

      // Before timeout, no notification should be added yet
      expect(useClawNotificationStore.getState().notifications).toHaveLength(0);

      // After batch window expires, batched notification should appear
      vi.advanceTimersByTime(2_100);

      const notifications = useClawNotificationStore.getState().notifications;
      // 5 rapid activity:new calls should batch into 1 notification with count=5
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('5 new activities');
      expect(notifications[0].count).toBe(5);
    });

    it('creates single notification when only one activity in batch window', () => {
      const store = useClawNotificationStore.getState();

      store.addNotification({
        type: 'activity:new',
        title: 'New Activity',
        message: 'User logged in',
      });

      vi.advanceTimersByTime(2_100);

      const notifications = useClawNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('New Activity');
      expect(notifications[0].message).toBe('User logged in');
      expect(notifications[0].count).toBeUndefined();
    });

    it('continues batching if new events arrive before window expires', () => {
      const store = useClawNotificationStore.getState();

      store.addNotification({
        type: 'activity:new',
        title: 'New Activity',
        message: 'Activity 1',
      });

      vi.advanceTimersByTime(1_500); // 1.5 seconds

      store.addNotification({
        type: 'activity:new',
        title: 'New Activity',
        message: 'Activity 2',
      });

      // Window resets, so nothing yet
      vi.advanceTimersByTime(1_500); // 1.5 more seconds (3 total from first)

      store.addNotification({
        type: 'activity:new',
        title: 'New Activity',
        message: 'Activity 3',
      });

      vi.advanceTimersByTime(2_100); // Now window expires

      const notifications = useClawNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].count).toBe(3);
    });

    it('does not batch non-batchable notification types', () => {
      const store = useClawNotificationStore.getState();

      store.addNotification({
        type: 'task:completed',
        title: 'Task Done',
        message: 'Task 1 completed',
      });

      store.addNotification({
        type: 'task:completed',
        title: 'Task Done',
        message: 'Task 2 completed',
      });

      // These should be added immediately without batching
      expect(useClawNotificationStore.getState().notifications).toHaveLength(2);
    });
  });

  describe('batching and deduplication combined', () => {
    it('handles mixed notification types correctly', () => {
      const store = useClawNotificationStore.getState();

      // Add deduplicated type
      store.addNotification({
        type: 'keys:synced',
        title: 'Keys Synced',
        message: 'Synced',
      });

      // Add batched types
      store.addNotification({
        type: 'activity:new',
        title: 'New Activity',
        message: 'Activity 1',
      });

      store.addNotification({
        type: 'activity:new',
        title: 'New Activity',
        message: 'Activity 2',
      });

      // Add regular type
      store.addNotification({
        type: 'task:completed',
        title: 'Task Done',
        message: 'Completed',
      });

      // Try to add duplicate (should be skipped)
      store.addNotification({
        type: 'keys:synced',
        title: 'Keys Synced',
        message: 'Synced again',
      });

      // Before batch window expires
      expect(useClawNotificationStore.getState().notifications).toHaveLength(2); // keys:synced + task:completed

      // After batch window expires
      vi.advanceTimersByTime(2_100);

      expect(useClawNotificationStore.getState().notifications).toHaveLength(3); // + batched activity
    });
  });
});

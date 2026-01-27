import { db, type UsageSnapshot, type Message, type Chat } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/device-id";
import { format, startOfDay, endOfDay, subDays, parseISO, isSameDay } from "date-fns";

/**
 * Generate a usage snapshot for a specific date.
 * Aggregates all messages/chats activity for that date from this device.
 */
export async function generateDailySnapshot(date: Date = new Date()): Promise<UsageSnapshot | null> {
  const deviceId = await getDeviceId();
  const dateStr = format(date, "yyyy-MM-dd");
  const snapshotId = `${dateStr}-${deviceId}`;

  // Get date boundaries
  const dayStart = startOfDay(date).getTime();
  const dayEnd = endOfDay(date).getTime();

  // Get all messages created on this date
  const messages = await db.messages
    .where("createdAt")
    .between(dayStart, dayEnd)
    .toArray();

  // Get all chats that were active on this date
  const chats = await db.chats
    .where("updatedAt")
    .between(dayStart, dayEnd)
    .toArray();

  // Also include chats that had messages on this date
  const chatIdsWithMessages = [...new Set(messages.map(m => m.chatId))];
  const additionalChats = await db.chats
    .where("id")
    .anyOf(chatIdsWithMessages)
    .toArray();

  const allChats = [...new Map([...chats, ...additionalChats].map(c => [c.id, c])).values()];

  // Calculate aggregates
  let totalCost = 0;
  let totalCacheSavings = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  const costByModel: Record<string, number> = {};
  const messagesByModel: Record<string, number> = {};

  for (const message of messages) {
    const msg = message as Message & {
      inputTokens?: number;
      outputTokens?: number;
      cachedTokens?: number;
      cost?: number;
      cacheSavings?: number;
    };

    totalInputTokens += msg.inputTokens || 0;
    totalOutputTokens += msg.outputTokens || 0;
    totalCachedTokens += msg.cachedTokens || 0;
    totalCost += msg.cost || 0;
    totalCacheSavings += msg.cacheSavings || 0;

    if (msg.modelId) {
      costByModel[msg.modelId] = (costByModel[msg.modelId] || 0) + (msg.cost || 0);
      messagesByModel[msg.modelId] = (messagesByModel[msg.modelId] || 0) + 1;
    }
  }

  // If no activity, don't create snapshot
  if (messages.length === 0 && allChats.length === 0) {
    return null;
  }

  const now = Date.now();
  const snapshot: UsageSnapshot = {
    id: snapshotId,
    date: dateStr,
    deviceId,
    totalCost,
    totalCacheSavings,
    totalMessages: messages.length,
    totalChats: allChats.length,
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    costByModel,
    messagesByModel,
    createdAt: now,
    updatedAt: now,
  };

  // Upsert snapshot
  const existing = await db.usageSnapshots.get(snapshotId);
  if (existing) {
    await db.usageSnapshots.update(snapshotId, { ...snapshot, createdAt: existing.createdAt });
  } else {
    await db.usageSnapshots.add(snapshot);
  }

  return snapshot;
}

/**
 * Generate snapshots for the last N days (fills in any missing days).
 */
export async function generateSnapshotsForPeriod(days: number = 30): Promise<number> {
  let generated = 0;
  const deviceId = await getDeviceId();

  for (let i = 0; i < days; i++) {
    const date = subDays(new Date(), i);
    const dateStr = format(date, "yyyy-MM-dd");
    const snapshotId = `${dateStr}-${deviceId}`;

    // Check if snapshot already exists
    const existing = await db.usageSnapshots.get(snapshotId);
    if (!existing) {
      const snapshot = await generateDailySnapshot(date);
      if (snapshot) {
        generated++;
      }
    }
  }

  return generated;
}

/**
 * Get aggregated usage stats across all devices for a date range.
 */
export async function getAggregatedUsage(startDate: Date, endDate: Date): Promise<{
  totalCost: number;
  totalCacheSavings: number;
  totalMessages: number;
  totalChats: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  costByModel: Record<string, number>;
  messagesByModel: Record<string, number>;
  byDevice: Record<string, { cost: number; messages: number }>;
  byDate: Array<{ date: string; cost: number; messages: number }>;
}> {
  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");

  // Get all snapshots in date range
  const snapshots = await db.usageSnapshots
    .where("date")
    .between(startStr, endStr, true, true)
    .toArray();

  // Aggregate across all devices
  let totalCost = 0;
  let totalCacheSavings = 0;
  let totalMessages = 0;
  let totalChats = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  const costByModel: Record<string, number> = {};
  const messagesByModel: Record<string, number> = {};
  const byDevice: Record<string, { cost: number; messages: number }> = {};
  const byDateMap: Record<string, { cost: number; messages: number }> = {};

  for (const snapshot of snapshots) {
    totalCost += snapshot.totalCost;
    totalCacheSavings += snapshot.totalCacheSavings;
    totalMessages += snapshot.totalMessages;
    totalChats += snapshot.totalChats;
    totalInputTokens += snapshot.totalInputTokens;
    totalOutputTokens += snapshot.totalOutputTokens;
    totalCachedTokens += snapshot.totalCachedTokens;

    // Merge model stats
    for (const [modelId, cost] of Object.entries(snapshot.costByModel)) {
      costByModel[modelId] = (costByModel[modelId] || 0) + cost;
    }
    for (const [modelId, count] of Object.entries(snapshot.messagesByModel)) {
      messagesByModel[modelId] = (messagesByModel[modelId] || 0) + count;
    }

    // Track by device
    if (!byDevice[snapshot.deviceId]) {
      byDevice[snapshot.deviceId] = { cost: 0, messages: 0 };
    }
    byDevice[snapshot.deviceId].cost += snapshot.totalCost;
    byDevice[snapshot.deviceId].messages += snapshot.totalMessages;

    // Track by date
    if (!byDateMap[snapshot.date]) {
      byDateMap[snapshot.date] = { cost: 0, messages: 0 };
    }
    byDateMap[snapshot.date].cost += snapshot.totalCost;
    byDateMap[snapshot.date].messages += snapshot.totalMessages;
  }

  // Convert byDate to sorted array
  const byDate = Object.entries(byDateMap)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalCost,
    totalCacheSavings,
    totalMessages,
    totalChats,
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    costByModel,
    messagesByModel,
    byDevice,
    byDate,
  };
}

/**
 * Get all snapshots for this device.
 */
export async function getDeviceSnapshots(): Promise<UsageSnapshot[]> {
  const deviceId = await getDeviceId();
  return db.usageSnapshots
    .where("deviceId")
    .equals(deviceId)
    .reverse()
    .sortBy("date");
}

/**
 * Get all snapshots across all devices.
 */
export async function getAllSnapshots(): Promise<UsageSnapshot[]> {
  return db.usageSnapshots
    .orderBy("date")
    .reverse()
    .toArray();
}

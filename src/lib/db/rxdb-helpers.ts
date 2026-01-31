/**
 * RxDB helper functions to match Dexie API patterns
 *
 * OBSERVABLE SUPPORT:
 * For better performance and true reactivity, use observable-returning methods (ending with $).
 * These return RxDB query objects that can be subscribed to with the useRxQuery hook.
 *
 * Example:
 *   // Promise-based (uses polling):
 *   const chats = await chatHelpers.toArray();
 *
 *   // Observable-based (true reactivity, no polling):
 *   const chatsQuery = chatHelpers.toArray$();
 *   // In React: useRxQuery(() => chatHelpers.toArray$(), [])
 *
 * Observable methods available:
 *   - toArray$() - Get all items as an observable
 *   - where(field).equals(value).toArray$() - Filtered query as observable
 *   - orderBy(field).toArray$() - Sorted query as observable
 */

import { getDatabase } from './rxdb';
import type {
  Chat, Message, Project, ProjectFile, Folder, Tag, ApiKey,
  UserSettings, ModelFavorite, TagRule, ParameterPreset, Agent,
  Prompt, Skill, SkillEmbedding, VectorDocument, Workflow,
  ModelAlias, McpServer, DeviceSecret, CloudSyncConfig, ContextSummary, SyncState
} from './schema';

// Get RxDB instance (cached)
let rxdbInstance: Awaited<ReturnType<typeof getDatabase>> | null = null;
async function getRxDB() {
  if (!rxdbInstance) rxdbInstance = await getDatabase();
  return rxdbInstance;
}

// JSON parsing helpers
function parseJson(value: any): any {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function stringifyJson(value: any): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

// Generic helper factory for simple collections (no JSON fields)
function createSimpleHelpers<T extends { id: string }>(collectionName: string) {
  return {
    async toArray(): Promise<T[]> {
      const db = await getRxDB();
      const docs = await (db as any)[collectionName].find().exec();
      return docs.map((d: any) => d.toJSON() as T);
    },

    // Observable version of toArray() - returns RxDB query for reactive subscriptions
    toArray$() {
      return {
        $: {
          subscribe: (callback: (data: T[]) => void) => {
            let unsubscribed = false;
            const subscription = { unsubscribe: () => { unsubscribed = true; } };

            getRxDB().then(db => {
              if (unsubscribed) return;
              const query = (db as any)[collectionName].find();
              const rxSubscription = query.$.subscribe((docs: any[]) => {
                if (!unsubscribed) {
                  callback(docs.map((d: any) => d.toJSON() as T));
                }
              });
              subscription.unsubscribe = () => {
                unsubscribed = true;
                rxSubscription.unsubscribe();
              };
            });

            return subscription;
          }
        }
      };
    },

    async count(): Promise<number> {
      const db = await getRxDB();
      return (db as any)[collectionName].count().exec();
    },

    async first(): Promise<T | undefined> {
      const db = await getRxDB();
      const docs = await (db as any)[collectionName].find().limit(1).exec();
      return docs[0] ? (docs[0].toJSON() as T) : undefined;
    },

    limit(n: number) {
      return {
        toArray: async (): Promise<T[]> => {
          const db = await getRxDB();
          const docs = await (db as any)[collectionName].find().limit(n).exec();
          return docs.map((d: any) => d.toJSON() as T);
        }
      };
    },

    async get(id: string): Promise<T | undefined> {
      const db = await getRxDB();
      const doc = await (db as any)[collectionName].findOne(id).exec();
      return doc ? (doc.toJSON() as T) : undefined;
    },

    async add(item: T): Promise<string> {
      const db = await getRxDB();
      await (db as any)[collectionName].insert(item);
      return item.id;
    },

    async bulkAdd(items: T[]): Promise<string[]> {
      const db = await getRxDB();
      await (db as any)[collectionName].bulkInsert(items);
      return items.map(i => i.id);
    },

    async bulkPut(items: T[]): Promise<string[]> {
      const db = await getRxDB();
      await (db as any)[collectionName].bulkUpsert(items);
      return items.map(i => i.id);
    },

    async put(item: T): Promise<string> {
      const db = await getRxDB();
      await (db as any)[collectionName].upsert(item);
      return item.id;
    },

    async update(id: string, changes: Partial<T>): Promise<number> {
      const db = await getRxDB();
      const doc = await (db as any)[collectionName].findOne(id).exec();
      if (doc) {
        await doc.incrementalPatch(changes);
        return 1;
      }
      return 0;
    },

    async delete(id: string): Promise<void> {
      const db = await getRxDB();
      const doc = await (db as any)[collectionName].findOne(id).exec();
      if (doc) await doc.remove();
    },

    async bulkDelete(ids: string[]): Promise<void> {
      const db = await getRxDB();
      const collection = (db as any)[collectionName];
      // CRITICAL FIX: Use proper bulk operation instead of O(n) individual queries
      // RxDB supports bulkRemove which is much more efficient
      if (ids.length === 0) return;
      
      try {
        // Try bulkRemove first (most efficient)
        if (collection.bulkRemove && typeof collection.bulkRemove === 'function') {
          await collection.bulkRemove(ids);
          return;
        }
        
        // Fallback: Use bulkUpsert with _deleted flag (soft delete)
        // This is still more efficient than individual removes
        const deletedDocs = ids.map(id => ({ id, _deleted: true }));
        await collection.bulkUpsert(deletedDocs);
      } catch (error) {
        // Last resort: individual removes (only if bulk operations fail)
        console.warn(`[rxdb-helpers] Bulk delete failed for ${collectionName}, falling back to individual removes:`, error);
        for (const id of ids) {
          try {
            const doc = await collection.findOne(id).exec();
            if (doc) await doc.remove();
          } catch (err) {
            console.error(`[rxdb-helpers] Failed to delete ${id} from ${collectionName}:`, err);
          }
        }
      }
    },

    async clear(): Promise<void> {
      const db = await getRxDB();
      const docs = await (db as any)[collectionName].find().exec();
      for (const doc of docs) {
        await doc.remove();
      }
    },

    filter(predicate: (item: T) => boolean) {
      return {
        toArray: async (): Promise<T[]> => {
          const db = await getRxDB();
          const docs = await (db as any)[collectionName].find().exec();
          const items = docs.map((d: any) => d.toJSON() as T);
          return items.filter(predicate);
        },
        count: async (): Promise<number> => {
          const db = await getRxDB();
          const docs = await (db as any)[collectionName].find().exec();
          const items = docs.map((d: any) => d.toJSON() as T);
          return items.filter(predicate).length;
        }
      };
    },

    // Selector-based filtering (more efficient than client-side filter)
    whereSelector(selector: any) {
      return {
        toArray: async (): Promise<T[]> => {
          const db = await getRxDB();
          const docs = await (db as any)[collectionName].find({ selector }).exec();
          return docs.map((d: any) => d.toJSON() as T);
        },
        count: async (): Promise<number> => {
          const db = await getRxDB();
          const collection = (db as any)[collectionName];
          // Try to use countDocuments if available, otherwise fall back
          if (collection.countDocuments) {
            return collection.countDocuments({ selector }).exec();
          } else {
            const docs = await collection.find({ selector }).exec();
            return docs.length;
          }
        },
        first: async (): Promise<T | undefined> => {
          const db = await getRxDB();
          const docs = await (db as any)[collectionName].find({ selector }).limit(1).exec();
          return docs[0] ? (docs[0].toJSON() as T) : undefined;
        }
      };
    },

    where(field: string | keyof T) {
      // Helper to build nested selector for dot-notation paths like "metadata.memoryId"
      const buildSelector = (field: string, value: any) => {
        if (field.includes('.')) {
          const parts = field.split('.');
          let selector: any = {};
          let current = selector;
          for (let i = 0; i < parts.length - 1; i++) {
            current[parts[i]] = {};
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = value;
          return selector;
        }
        return { [field]: value };
      };

      return {
        equals: (value: any) => {
          const selector = buildSelector(field as string, value);
          return {
            toArray: async (): Promise<T[]> => {
              const db = await getRxDB();
              const docs = await (db as any)[collectionName].find({ selector }).exec();
              return docs.map((d: any) => d.toJSON() as T);
            },
            // Observable version for reactive queries
            toArray$() {
              return {
                $: {
                  subscribe: (callback: (data: T[]) => void) => {
                    let unsubscribed = false;
                    const subscription = { unsubscribe: () => { unsubscribed = true; } };

                    getRxDB().then(db => {
                      if (unsubscribed) return;
                      const query = (db as any)[collectionName].find({ selector });
                      const rxSubscription = query.$.subscribe((docs: any[]) => {
                        if (!unsubscribed) {
                          callback(docs.map((d: any) => d.toJSON() as T));
                        }
                      });
                      subscription.unsubscribe = () => {
                        unsubscribed = true;
                        rxSubscription.unsubscribe();
                      };
                    });

                    return subscription;
                  }
                }
              };
            },
            count: async (): Promise<number> => {
              const db = await getRxDB();
              const docs = await (db as any)[collectionName].find({ selector }).exec();
              return docs.length;
            },
            first: async (): Promise<T | undefined> => {
              const db = await getRxDB();
              const docs = await (db as any)[collectionName].find({ selector }).limit(1).exec();
              return docs[0] ? (docs[0].toJSON() as T) : undefined;
            },
            delete: async (): Promise<void> => {
              const db = await getRxDB();
              const docs = await (db as any)[collectionName].find({ selector }).exec();
              for (const doc of docs) {
                await doc.remove();
              }
            },
            sortBy: (sortField: keyof T) => {
              return (async (): Promise<T[]> => {
                const db = await getRxDB();
                const docs = await (db as any)[collectionName].find({
                  selector,
                  sort: [{ [sortField as string]: 'asc' }]
                }).exec();
                return docs.map((d: any) => d.toJSON() as T);
              })();
            },
            anyOf: (values: any[]) => ({
              toArray: async (): Promise<T[]> => {
                const db = await getRxDB();
                const selectorWithIn = buildSelector(field as string, { $in: values });
                const docs = await (db as any)[collectionName].find({ selector: selectorWithIn }).exec();
                return docs.map((d: any) => d.toJSON() as T);
              }
            }),
            filter: (predicate: (item: T) => boolean) => ({
              toArray: async (): Promise<T[]> => {
                const db = await getRxDB();
                const docs = await (db as any)[collectionName].find({ selector }).exec();
                const items = docs.map((d: any) => d.toJSON() as T);
                return items.filter(predicate);
              },
              count: async (): Promise<number> => {
                const db = await getRxDB();
                const docs = await (db as any)[collectionName].find({ selector }).exec();
                const items = docs.map((d: any) => d.toJSON() as T);
                return items.filter(predicate).length;
              }
            })
          };
        },
        above: (value: any) => {
          const selector = buildSelector(field as string, { $gt: value });
          return {
            toArray: async (): Promise<T[]> => {
              const db = await getRxDB();
              const docs = await (db as any)[collectionName].find({ selector }).exec();
              return docs.map((d: any) => d.toJSON() as T);
            },
            count: async (): Promise<number> => {
              const db = await getRxDB();
              const docs = await (db as any)[collectionName].find({ selector }).exec();
              return docs.length;
            }
          };
        },
        below: (value: any) => {
          const selector = buildSelector(field as string, { $lt: value });
          return {
            toArray: async (): Promise<T[]> => {
              const db = await getRxDB();
              const docs = await (db as any)[collectionName].find({ selector }).exec();
              return docs.map((d: any) => d.toJSON() as T);
            },
            count: async (): Promise<number> => {
              const db = await getRxDB();
              const docs = await (db as any)[collectionName].find({ selector }).exec();
              return docs.length;
            }
          };
        }
      };
    },

    orderBy(field: keyof T) {
      return {
        reverse: () => ({
          toArray: async (): Promise<T[]> => {
            const db = await getRxDB();
            const docs = await (db as any)[collectionName].find().sort({ [field]: 'desc' }).exec();
            return docs.map((d: any) => d.toJSON() as T);
          },
          // Observable version for reactive sorted queries
          toArray$() {
            return {
              $: {
                subscribe: (callback: (data: T[]) => void) => {
                  let unsubscribed = false;
                  const subscription = { unsubscribe: () => { unsubscribed = true; } };

                  getRxDB().then(db => {
                    if (unsubscribed) return;
                    const query = (db as any)[collectionName].find().sort({ [field as string]: 'desc' });
                    const rxSubscription = query.$.subscribe((docs: any[]) => {
                      if (!unsubscribed) {
                        callback(docs.map((d: any) => d.toJSON() as T));
                      }
                    });
                    subscription.unsubscribe = () => {
                      unsubscribed = true;
                      rxSubscription.unsubscribe();
                    };
                  });

                  return subscription;
                }
              }
            };
          },
          first: async (): Promise<T | undefined> => {
            const db = await getRxDB();
            const docs = await (db as any)[collectionName].find().sort({ [field]: 'desc' }).limit(1).exec();
            return docs[0] ? (docs[0].toJSON() as T) : undefined;
          },
          limit: (n: number) => ({
            toArray: async (): Promise<T[]> => {
              const db = await getRxDB();
              const docs = await (db as any)[collectionName].find().sort({ [field]: 'desc' }).limit(n).exec();
              return docs.map((d: any) => d.toJSON() as T);
            }
          })
        }),
        toArray: async (): Promise<T[]> => {
          const db = await getRxDB();
          const docs = await (db as any)[collectionName].find().sort({ [field]: 'asc' }).exec();
          return docs.map((d: any) => d.toJSON() as T);
        },
        limit: (n: number) => ({
          toArray: async (): Promise<T[]> => {
            const db = await getRxDB();
            const docs = await (db as any)[collectionName].find().sort({ [field]: 'asc' }).limit(n).exec();
            return docs.map((d: any) => d.toJSON() as T);
          }
        })
      };
    }
  };
}

// Chat helpers
export const chatHelpers = {
  async toArray(): Promise<Chat[]> {
    const db = await getRxDB();
    const docs = await db.chats.find().exec();
    return docs.map(d => d.toJSON() as Chat);
  },

  async count(): Promise<number> {
    const db = await getRxDB();
    const docs = await db.chats.find().exec();
    return docs.length;
  },

  async first(): Promise<Chat | undefined> {
    const db = await getRxDB();
    const docs = await db.chats.find().limit(1).exec();
    return docs[0] ? (docs[0].toJSON() as Chat) : undefined;
  },

  limit(n: number) {
    return {
      toArray: async (): Promise<Chat[]> => {
        const db = await getRxDB();
        const docs = await db.chats.find().limit(n).exec();
        return docs.map(d => d.toJSON() as Chat);
      }
    };
  },

  async get(id: string): Promise<Chat | undefined> {
    const db = await getRxDB();
    const doc = await db.chats.findOne(id).exec();
    return doc ? (doc.toJSON() as Chat) : undefined;
  },

  async add(chat: Chat): Promise<string> {
    const db = await getRxDB();
    await db.chats.insert(chat);
    return chat.id;
  },

  async update(id: string, changes: Partial<Chat>): Promise<number> {
    const db = await getRxDB();
    const doc = await db.chats.findOne(id).exec();
    if (doc) {
      await doc.incrementalPatch(changes);
      return 1;
    }
    return 0;
  },

  async delete(id: string): Promise<void> {
    const db = await getRxDB();
    const doc = await db.chats.findOne(id).exec();
    if (doc) await doc.remove();
  },

  async bulkDelete(ids: string[]): Promise<void> {
    const db = await getRxDB();
    if (db.chats.bulkRemove) {
      await db.chats.bulkRemove(ids);
    } else {
      // Fallback
      for (const id of ids) {
        const doc = await db.chats.findOne(id).exec();
        if (doc) await doc.remove();
      }
    }
  },

  async clear(): Promise<void> {
    const db = await getRxDB();
    const docs = await db.chats.find().exec();
    for (const doc of docs) {
      await doc.remove();
    }
  },

  async bulkAdd(chats: Chat[]): Promise<string[]> {
    const db = await getRxDB();
    await db.chats.bulkInsert(chats);
    return chats.map(c => c.id);
  },

  async bulkPut(chats: Chat[]): Promise<string[]> {
    const db = await getRxDB();
    await db.chats.bulkUpsert(chats);
    return chats.map(c => c.id);
  },

  async put(chat: Chat): Promise<string> {
    const db = await getRxDB();
    await db.chats.upsert(chat);
    return chat.id;
  },

  filter(predicate: (chat: Chat) => boolean) {
    return {
      toArray: async (): Promise<Chat[]> => {
        const db = await getRxDB();
        const docs = await db.chats.find().exec();
        const chats = docs.map(d => d.toJSON() as Chat);
        return chats.filter(predicate);
      }
    };
  },

  where(field: keyof Chat) {
    return {
      equals: (value: any) => ({
        toArray: async (): Promise<Chat[]> => {
          const db = await getRxDB();
          const docs = await db.chats.find({ selector: { [field]: value } }).exec();
          return docs.map(d => d.toJSON() as Chat);
        },
        count: async (): Promise<number> => {
          const db = await getRxDB();
          const docs = await db.chats.find({ selector: { [field]: value } }).exec();
          return docs.length;
        },
        sortBy: (sortField: keyof Chat) => {
          return (async (): Promise<Chat[]> => {
            const db = await getRxDB();
            const docs = await db.chats.find({
              selector: { [field]: value },
              sort: [{ [sortField]: 'asc' }]
            }).exec();
            return docs.map(d => d.toJSON() as Chat);
          })();
        },
        anyOf: (values: any[]) => ({
          toArray: async (): Promise<Chat[]> => {
            const db = await getRxDB();
            const docs = await db.chats.find({
              selector: { [field]: { $in: values } }
            }).exec();
            return docs.map(d => d.toJSON() as Chat);
          }
        })
      }),
      above: (value: any) => ({
        toArray: async (): Promise<Chat[]> => {
          const db = await getRxDB();
          const docs = await db.chats.find({ selector: { [field]: { $gt: value } } }).exec();
          return docs.map(d => d.toJSON() as Chat);
        },
        count: async (): Promise<number> => {
          const db = await getRxDB();
          const docs = await db.chats.find({ selector: { [field]: { $gt: value } } }).exec();
          return docs.length;
        }
      }),
      below: (value: any) => ({
        toArray: async (): Promise<Chat[]> => {
          const db = await getRxDB();
          const docs = await db.chats.find({ selector: { [field]: { $lt: value } } }).exec();
          return docs.map(d => d.toJSON() as Chat);
        },
        count: async (): Promise<number> => {
          const db = await getRxDB();
          const docs = await db.chats.find({ selector: { [field]: { $lt: value } } }).exec();
          return docs.length;
        }
      })
    };
  },

  orderBy(field: keyof Chat) {
    return {
      reverse: () => ({
        toArray: async (): Promise<Chat[]> => {
          const db = await getRxDB();
          const docs = await db.chats.find().sort({ [field]: 'desc' }).exec();
          return docs.map(d => d.toJSON() as Chat);
        },
        first: async (): Promise<Chat | undefined> => {
          const db = await getRxDB();
          const docs = await db.chats.find().sort({ [field]: 'desc' }).limit(1).exec();
          return docs[0] ? (docs[0].toJSON() as Chat) : undefined;
        },
        limit: (n: number) => ({
          toArray: async (): Promise<Chat[]> => {
            const db = await getRxDB();
            const docs = await db.chats.find().sort({ [field]: 'desc' }).limit(n).exec();
            return docs.map(d => d.toJSON() as Chat);
          }
        })
      }),
      toArray: async (): Promise<Chat[]> => {
        const db = await getRxDB();
        const docs = await db.chats.find().sort({ [field]: 'asc' }).exec();
        return docs.map(d => d.toJSON() as Chat);
      },
      limit: (n: number) => ({
        toArray: async (): Promise<Chat[]> => {
          const db = await getRxDB();
          const docs = await db.chats.find().sort({ [field]: 'asc' }).limit(n).exec();
          return docs.map(d => d.toJSON() as Chat);
        }
      }),
      last: async (): Promise<Chat | undefined> => {
        const db = await getRxDB();
        const docs = await db.chats.find().sort({ [field]: 'desc' }).limit(1).exec();
        return docs[0] ? (docs[0].toJSON() as Chat) : undefined;
      }
    };
  }
};

// Message helpers
export const messageHelpers = {
  async toArray(): Promise<Message[]> {
    const db = await getRxDB();
    const docs = await db.messages.find().exec();
    return docs.map(d => {
      const json = d.toJSON();
      return {
        ...json,
        content: parseJson(json.content),
        toolCalls: parseJson(json.toolCalls),
        toolResults: parseJson(json.toolResults),
        pipelineExecution: parseJson(json.pipelineExecution)
      } as Message;
    });
  },

  async count(): Promise<number> {
    const db = await getRxDB();
    const docs = await db.messages.find().exec();
    return docs.length;
  },

  async first(): Promise<Message | undefined> {
    const db = await getRxDB();
    const docs = await db.messages.find().limit(1).exec();
    if (!docs[0]) return undefined;
    const json = docs[0].toJSON();
    return {
      ...json,
      content: parseJson(json.content),
      toolCalls: parseJson(json.toolCalls),
      toolResults: parseJson(json.toolResults),
      pipelineExecution: parseJson(json.pipelineExecution)
    } as Message;
  },

  limit(n: number) {
    return {
      toArray: async (): Promise<Message[]> => {
        const db = await getRxDB();
        const docs = await db.messages.find().limit(n).exec();
        return docs.map(d => {
          const json = d.toJSON();
          return {
            ...json,
            content: parseJson(json.content),
            toolCalls: parseJson(json.toolCalls),
            toolResults: parseJson(json.toolResults),
            pipelineExecution: parseJson(json.pipelineExecution)
          } as Message;
        });
      }
    };
  },

  async get(id: string): Promise<Message | undefined> {
    const db = await getRxDB();
    const doc = await db.messages.findOne(id).exec();
    if (!doc) return undefined;
    const json = doc.toJSON();
    return {
      ...json,
      content: parseJson(json.content),
      toolCalls: parseJson(json.toolCalls),
      toolResults: parseJson(json.toolResults),
      pipelineExecution: parseJson(json.pipelineExecution)
    } as Message;
  },

  async add(message: Message): Promise<string> {
    const db = await getRxDB();
    await db.messages.insert({
      ...message,
      content: stringifyJson(message.content),
      toolCalls: stringifyJson(message.toolCalls),
      toolResults: stringifyJson(message.toolResults),
      pipelineExecution: stringifyJson(message.pipelineExecution)
    });
    return message.id;
  },

  async bulkAdd(messages: Message[]): Promise<string[]> {
    const db = await getRxDB();
    const prepared = messages.map(m => ({
      ...m,
      content: stringifyJson(m.content),
      toolCalls: stringifyJson(m.toolCalls),
      toolResults: stringifyJson(m.toolResults),
      pipelineExecution: stringifyJson(m.pipelineExecution)
    }));
    await db.messages.bulkInsert(prepared);
    return messages.map(m => m.id);
  },

  async bulkPut(messages: Message[]): Promise<string[]> {
    const db = await getRxDB();
    const prepared = messages.map(m => ({
      ...m,
      content: stringifyJson(m.content),
      toolCalls: stringifyJson(m.toolCalls),
      toolResults: stringifyJson(m.toolResults),
      pipelineExecution: stringifyJson(m.pipelineExecution)
    }));
    await db.messages.bulkUpsert(prepared);
    return messages.map(m => m.id);
  },

  async update(id: string, changes: Partial<Message>): Promise<number> {
    const db = await getRxDB();
    const doc = await db.messages.findOne(id).exec();
    if (doc) {
      const updates: any = { ...changes };
      if (changes.content) updates.content = stringifyJson(changes.content);
      if (changes.toolCalls) updates.toolCalls = stringifyJson(changes.toolCalls);
      if (changes.toolResults) updates.toolResults = stringifyJson(changes.toolResults);
      if (changes.pipelineExecution) updates.pipelineExecution = stringifyJson(changes.pipelineExecution);
      await doc.incrementalPatch(updates);
      return 1;
    }
    return 0;
  },

  async delete(id: string): Promise<void> {
    const db = await getRxDB();
    const doc = await db.messages.findOne(id).exec();
    if (doc) await doc.remove();
  },

  async bulkDelete(ids: string[]): Promise<void> {
    const db = await getRxDB();
    if (db.messages.bulkRemove) {
      await db.messages.bulkRemove(ids);
    } else {
      // Fallback
      for (const id of ids) {
        const doc = await db.messages.findOne(id).exec();
        if (doc) await doc.remove();
      }
    }
  },

  filter(predicate: (message: Message) => boolean) {
    return {
      toArray: async (): Promise<Message[]> => {
        const db = await getRxDB();
        const docs = await db.messages.find().exec();
        const messages = docs.map(d => {
          const json = d.toJSON();
          return {
            ...json,
            content: parseJson(json.content),
            toolCalls: parseJson(json.toolCalls),
            toolResults: parseJson(json.toolResults),
            pipelineExecution: parseJson(json.pipelineExecution)
          } as Message;
        });
        return messages.filter(predicate);
      }
    };
  },

  where(field: keyof Message) {
    return {
      equals: (value: any) => ({
        toArray: async (): Promise<Message[]> => {
          const db = await getRxDB();
          const docs = await db.messages.find({ selector: { [field]: value } }).exec();
          return docs.map(d => {
            const json = d.toJSON();
            return {
              ...json,
              content: parseJson(json.content),
              toolCalls: parseJson(json.toolCalls),
              toolResults: parseJson(json.toolResults),
              pipelineExecution: parseJson(json.pipelineExecution)
            } as Message;
          });
        },
        count: async (): Promise<number> => {
          const db = await getRxDB();
          const docs = await db.messages.find({ selector: { [field]: value } }).exec();
          return docs.length;
        },
        delete: async (): Promise<void> => {
          const db = await getRxDB();
          const docs = await db.messages.find({ selector: { [field]: value } }).exec();
          for (const doc of docs) {
            await doc.remove();
          }
        },
        sortBy: (sortField: keyof Message) => {
          return (async (): Promise<Message[]> => {
            const db = await getRxDB();
            const docs = await db.messages.find({
              selector: { [field]: value },
              sort: [{ [sortField]: 'asc' }]
            }).exec();
            return docs.map(d => {
              const json = d.toJSON();
              return {
                ...json,
                content: parseJson(json.content),
                toolCalls: parseJson(json.toolCalls),
                toolResults: parseJson(json.toolResults),
                pipelineExecution: parseJson(json.pipelineExecution)
              } as Message;
            });
          })();
        },
        anyOf: (values: any[]) => ({
          toArray: async (): Promise<Message[]> => {
            const db = await getRxDB();
            const docs = await db.messages.find({
              selector: { [field]: { $in: values } }
            }).exec();
            return docs.map(d => {
              const json = d.toJSON();
              return {
                ...json,
                content: parseJson(json.content),
                toolCalls: parseJson(json.toolCalls),
                toolResults: parseJson(json.toolResults),
                pipelineExecution: parseJson(json.pipelineExecution)
              } as Message;
            });
          }
        }),
        filter: (predicate: (item: Message) => boolean) => ({
          toArray: async (): Promise<Message[]> => {
            const db = await getRxDB();
            const docs = await db.messages.find({ selector: { [field]: value } }).exec();
            const items = docs.map(d => {
              const json = d.toJSON();
              return {
                ...json,
                content: parseJson(json.content),
                toolCalls: parseJson(json.toolCalls),
                toolResults: parseJson(json.toolResults),
                pipelineExecution: parseJson(json.pipelineExecution)
              } as Message;
            });
            return items.filter(predicate);
          },
          count: async (): Promise<number> => {
            const db = await getRxDB();
            const docs = await db.messages.find({ selector: { [field]: value } }).exec();
            const items = docs.map(d => {
              const json = d.toJSON();
              return {
                ...json,
                content: parseJson(json.content),
                toolCalls: parseJson(json.toolCalls),
                toolResults: parseJson(json.toolResults),
                pipelineExecution: parseJson(json.pipelineExecution)
              } as Message;
            });
            return items.filter(predicate).length;
          }
        })
      }),
      above: (value: any) => ({
        toArray: async (): Promise<Message[]> => {
          const db = await getRxDB();
          const docs = await db.messages.find({ selector: { [field]: { $gt: value } } }).exec();
          return docs.map(d => {
            const json = d.toJSON();
            return {
              ...json,
              content: parseJson(json.content),
              toolCalls: parseJson(json.toolCalls),
              toolResults: parseJson(json.toolResults),
              pipelineExecution: parseJson(json.pipelineExecution)
            } as Message;
          });
        },
        count: async (): Promise<number> => {
          const db = await getRxDB();
          const docs = await db.messages.find({ selector: { [field]: { $gt: value } } }).exec();
          return docs.length;
        }
      }),
      below: (value: any) => ({
        toArray: async (): Promise<Message[]> => {
          const db = await getRxDB();
          const docs = await db.messages.find({ selector: { [field]: { $lt: value } } }).exec();
          return docs.map(d => {
            const json = d.toJSON();
            return {
              ...json,
              content: parseJson(json.content),
              toolCalls: parseJson(json.toolCalls),
              toolResults: parseJson(json.toolResults),
              pipelineExecution: parseJson(json.pipelineExecution)
            } as Message;
          });
        },
        count: async (): Promise<number> => {
          const db = await getRxDB();
          const docs = await db.messages.find({ selector: { [field]: { $lt: value } } }).exec();
          return docs.length;
        }
      }),
      anyOf: (values: any[]) => ({
        toArray: async (): Promise<Message[]> => {
          const db = await getRxDB();
          const docs = await db.messages.find({
            selector: { [field]: { $in: values } }
          }).exec();
          return docs.map(d => {
            const json = d.toJSON();
            return {
              ...json,
              content: parseJson(json.content),
              toolCalls: parseJson(json.toolCalls),
              toolResults: parseJson(json.toolResults),
              pipelineExecution: parseJson(json.pipelineExecution)
            } as Message;
          });
        },
        modify: async (changes: Partial<Message>): Promise<void> => {
          const db = await getRxDB();
          const docs = await db.messages.find({
            selector: { [field]: { $in: values } }
          }).exec();
          for (const doc of docs) {
            const updates: any = { ...changes };
            if (changes.content) updates.content = stringifyJson(changes.content);
            if (changes.toolCalls) updates.toolCalls = stringifyJson(changes.toolCalls);
            if (changes.toolResults) updates.toolResults = stringifyJson(changes.toolResults);
            if (changes.pipelineExecution) updates.pipelineExecution = stringifyJson(changes.pipelineExecution);
            await doc.incrementalPatch(updates);
          }
        }
      })
    };
  },

  orderBy(field: keyof Message) {
    return {
      reverse: () => ({
        toArray: async (): Promise<Message[]> => {
          const db = await getRxDB();
          const docs = await db.messages.find().sort({ [field]: 'desc' }).exec();
          return docs.map(d => {
            const json = d.toJSON();
            return {
              ...json,
              content: parseJson(json.content),
              toolCalls: parseJson(json.toolCalls),
              toolResults: parseJson(json.toolResults),
              pipelineExecution: parseJson(json.pipelineExecution)
            } as Message;
          });
        },
        first: async (): Promise<Message | undefined> => {
          const db = await getRxDB();
          const docs = await db.messages.find().sort({ [field]: 'desc' }).limit(1).exec();
          if (!docs[0]) return undefined;
          const json = docs[0].toJSON();
          return {
            ...json,
            content: parseJson(json.content),
            toolCalls: parseJson(json.toolCalls),
            toolResults: parseJson(json.toolResults),
            pipelineExecution: parseJson(json.pipelineExecution)
          } as Message;
        },
        limit: (n: number) => ({
          toArray: async (): Promise<Message[]> => {
            const db = await getRxDB();
            const docs = await db.messages.find().sort({ [field]: 'desc' }).limit(n).exec();
            return docs.map(d => {
              const json = d.toJSON();
              return {
                ...json,
                content: parseJson(json.content),
                toolCalls: parseJson(json.toolCalls),
                toolResults: parseJson(json.toolResults),
                pipelineExecution: parseJson(json.pipelineExecution)
              } as Message;
            });
          }
        })
      }),
      toArray: async (): Promise<Message[]> => {
        const db = await getRxDB();
        const docs = await db.messages.find().sort({ [field]: 'asc' }).exec();
        return docs.map(d => {
          const json = d.toJSON();
          return {
            ...json,
            content: parseJson(json.content),
            toolCalls: parseJson(json.toolCalls),
            toolResults: parseJson(json.toolResults),
            pipelineExecution: parseJson(json.pipelineExecution)
          } as Message;
        });
      },
      limit: (n: number) => ({
        toArray: async (): Promise<Message[]> => {
          const db = await getRxDB();
          const docs = await db.messages.find().sort({ [field]: 'asc' }).limit(n).exec();
          return docs.map(d => {
            const json = d.toJSON();
            return {
              ...json,
              content: parseJson(json.content),
              toolCalls: parseJson(json.toolCalls),
              toolResults: parseJson(json.toolResults),
              pipelineExecution: parseJson(json.pipelineExecution)
            } as Message;
          });
        }
      }),
      last: async (): Promise<Message | undefined> => {
        const db = await getRxDB();
        const docs = await db.messages.find().sort({ [field]: 'desc' }).limit(1).exec();
        if (!docs[0]) return undefined;
        const json = docs[0].toJSON();
        return {
          ...json,
          content: parseJson(json.content),
          toolCalls: parseJson(json.toolCalls),
          toolResults: parseJson(json.toolResults),
          pipelineExecution: parseJson(json.pipelineExecution)
        } as Message;
      }
    };
  }
};

// Export all collection helpers
export const projectHelpers = createSimpleHelpers<Project>('projects');
export const projectFileHelpers = createSimpleHelpers<ProjectFile>('projectFiles');
export const folderHelpers = createSimpleHelpers<Folder>('folders');
export const tagHelpers = createSimpleHelpers<Tag>('tags');
export const apiKeyHelpers = createSimpleHelpers<ApiKey>('apiKeys');
export const modelFavoriteHelpers = createSimpleHelpers<ModelFavorite>('modelFavorites');
export const tagRuleHelpers = createSimpleHelpers<TagRule>('tagRules');
export const parameterPresetHelpers = createSimpleHelpers<ParameterPreset>('parameterPresets');
export const promptHelpers = createSimpleHelpers<Prompt>('prompts');

// Custom helper for SkillEmbedding (uses skillId instead of id)
export const skillEmbeddingHelpers = {
  async toArray(): Promise<SkillEmbedding[]> {
    const db = await getRxDB();
    const docs = await db.skillEmbeddings.find().exec();
    return docs.map((d: any) => d.toJSON() as SkillEmbedding);
  },

  async count(): Promise<number> {
    const db = await getRxDB();
    const docs = await db.skillEmbeddings.find().exec();
    return docs.length;
  },

  async first(): Promise<SkillEmbedding | undefined> {
    const db = await getRxDB();
    const docs = await db.skillEmbeddings.find().limit(1).exec();
    return docs[0] ? (docs[0].toJSON() as SkillEmbedding) : undefined;
  },

  limit(n: number) {
    return {
      toArray: async (): Promise<SkillEmbedding[]> => {
        const db = await getRxDB();
        const docs = await db.skillEmbeddings.find().limit(n).exec();
        return docs.map((d: any) => d.toJSON() as SkillEmbedding);
      }
    };
  },

  async get(skillId: string): Promise<SkillEmbedding | undefined> {
    const db = await getRxDB();
    const doc = await db.skillEmbeddings.findOne(skillId).exec();
    return doc ? (doc.toJSON() as SkillEmbedding) : undefined;
  },

  async add(item: SkillEmbedding): Promise<string> {
    const db = await getRxDB();
    await db.skillEmbeddings.insert(item);
    return item.skillId;
  },

  async bulkAdd(items: SkillEmbedding[]): Promise<string[]> {
    const db = await getRxDB();
    await db.skillEmbeddings.bulkInsert(items);
    return items.map(i => i.skillId);
  },

  async bulkPut(items: SkillEmbedding[]): Promise<string[]> {
    const db = await getRxDB();
    await db.skillEmbeddings.bulkUpsert(items);
    return items.map(i => i.skillId);
  },

  async put(item: SkillEmbedding): Promise<string> {
    const db = await getRxDB();
    await db.skillEmbeddings.upsert(item);
    return item.skillId;
  },

  async update(skillId: string, changes: Partial<SkillEmbedding>): Promise<number> {
    const db = await getRxDB();
    const doc = await db.skillEmbeddings.findOne(skillId).exec();
    if (doc) {
      await doc.incrementalPatch(changes);
      return 1;
    }
    return 0;
  },

  async delete(skillId: string): Promise<void> {
    const db = await getRxDB();
    const doc = await db.skillEmbeddings.findOne(skillId).exec();
    if (doc) await doc.remove();
  },

  async bulkDelete(skillIds: string[]): Promise<void> {
    const db = await getRxDB();
    if (db.skillEmbeddings.bulkRemove) {
      await db.skillEmbeddings.bulkRemove(skillIds);
    } else {
      // Fallback
      for (const skillId of skillIds) {
        const doc = await db.skillEmbeddings.findOne(skillId).exec();
        if (doc) await doc.remove();
      }
    }
  },

  async clear(): Promise<void> {
    const db = await getRxDB();
    const docs = await db.skillEmbeddings.find().exec();
    for (const doc of docs) {
      await doc.remove();
    }
  },

  filter(predicate: (item: SkillEmbedding) => boolean) {
    return {
      toArray: async (): Promise<SkillEmbedding[]> => {
        const db = await getRxDB();
        const docs = await db.skillEmbeddings.find().exec();
        const items = docs.map((d: any) => d.toJSON() as SkillEmbedding);
        return items.filter(predicate);
      },
      count: async (): Promise<number> => {
        const db = await getRxDB();
        const docs = await db.skillEmbeddings.find().exec();
        const items = docs.map((d: any) => d.toJSON() as SkillEmbedding);
        return items.filter(predicate).length;
      }
    };
  },

  where(field: keyof SkillEmbedding) {
    return {
      equals: (value: any) => ({
        toArray: async (): Promise<SkillEmbedding[]> => {
          const db = await getRxDB();
          const docs = await db.skillEmbeddings.find({ selector: { [field]: value } }).exec();
          return docs.map((d: any) => d.toJSON() as SkillEmbedding);
        },
        count: async (): Promise<number> => {
          const db = await getRxDB();
          const docs = await db.skillEmbeddings.find({ selector: { [field]: value } }).exec();
          return docs.length;
        }
      })
    };
  }
};

export const vectorDocumentHelpers = createSimpleHelpers<VectorDocument>('vectorDocuments');
export const workflowHelpers = createSimpleHelpers<Workflow>('workflows');
export const modelAliasHelpers = createSimpleHelpers<ModelAlias>('modelAliases');
export const deviceSecretHelpers = createSimpleHelpers<DeviceSecret>('deviceSecrets');
export const contextSummaryHelpers = createSimpleHelpers<ContextSummary>('contextSummaries');

// SyncState helpers - special implementation for composite key support
export const syncStateHelpers = {
  async toArray(): Promise<SyncState[]> {
    const db = await getRxDB();
    const docs = await db.syncState.find().exec();
    return docs.map((d: any) => d.toJSON() as SyncState);
  },

  async count(): Promise<number> {
    const db = await getRxDB();
    return db.syncState.count().exec();
  },

  async get(key: [string, string]): Promise<SyncState | undefined> {
    const db = await getRxDB();
    // Composite key: "entityType:entityId"
    const id = `${key[0]}:${key[1]}`;
    const doc = await db.syncState.findOne(id).exec();
    return doc ? (doc.toJSON() as SyncState) : undefined;
  },

  async put(data: SyncState | { id?: string; entityType: string; entityId: string; syncedChecksum: string; syncedAt: number; syncedVersion?: number }): Promise<void> {
    const db = await getRxDB();
    // Create sync state with composite id: "entityType:entityId"
    const syncState = {
      id: (data as any).id || `${data.entityType}:${data.entityId}`,
      entityType: data.entityType,
      entityId: data.entityId,
      syncedChecksum: data.syncedChecksum,
      syncedAt: data.syncedAt,
      syncedVersion: data.syncedVersion
    };
    await db.syncState.upsert(syncState);
  },

  async delete(key?: [string, string]): Promise<void> {
    const db = await getRxDB();
    if (key) {
      const id = `${key[0]}:${key[1]}`;
      const doc = await db.syncState.findOne(id).exec();
      if (doc) await doc.remove();
    } else {
      // Clear all
      const docs = await db.syncState.find().exec();
      for (const doc of docs) {
        await doc.remove();
      }
    }
  },

  async clear(): Promise<void> {
    const db = await getRxDB();
    const docs = await db.syncState.find().exec();
    for (const doc of docs) {
      await doc.remove();
    }
  },

  where(field: 'entityType' | 'entityId') {
    return {
      equals: (value: string) => ({
        toArray: async (): Promise<SyncState[]> => {
          const db = await getRxDB();
          const docs = await db.syncState.find({ selector: { [field]: value } }).exec();
          return docs.map((d: any) => d.toJSON() as SyncState);
        }
      })
    };
  }
};

// Special helpers for collections with JSON fields
export const settingsHelpers = {
  async toArray(): Promise<UserSettings[]> {
    const db = await getRxDB();
    const docs = await db.settings.find().exec();
    return docs.map(d => {
      const json = d.toJSON();
      return {
        ...json,
        shortcuts: parseJson(json.shortcuts),
        defaultModelIdsByProvider: parseJson(json.defaultModelIdsByProvider),
        memoryModelIdsByProvider: parseJson(json.memoryModelIdsByProvider),
        titleModelIdsByProvider: parseJson(json.titleModelIdsByProvider),
        lastProviderIdByModel: parseJson(json.lastProviderIdByModel),
        defaultMcpServerIds: parseJson(json.defaultMcpServerIds),
        multiModelDefaults: parseJson(json.multiModelDefaults)
      } as UserSettings;
    });
  },

  async count(): Promise<number> {
    const db = await getRxDB();
    const docs = await db.settings.find().exec();
    return docs.length;
  },

  async first(): Promise<UserSettings | undefined> {
    const db = await getRxDB();
    const docs = await db.settings.find().limit(1).exec();
    if (!docs[0]) return undefined;
    const json = docs[0].toJSON();
    return {
      ...json,
      shortcuts: parseJson(json.shortcuts),
      defaultModelIdsByProvider: parseJson(json.defaultModelIdsByProvider),
      memoryModelIdsByProvider: parseJson(json.memoryModelIdsByProvider),
      titleModelIdsByProvider: parseJson(json.titleModelIdsByProvider),
      lastProviderIdByModel: parseJson(json.lastProviderIdByModel),
      defaultMcpServerIds: parseJson(json.defaultMcpServerIds),
      multiModelDefaults: parseJson(json.multiModelDefaults)
    } as UserSettings;
  },

  async get(id: string): Promise<UserSettings | undefined> {
    const db = await getRxDB();
    const doc = await db.settings.findOne(id).exec();
    if (!doc) return undefined;
    const json = doc.toJSON();
    return {
      ...json,
      shortcuts: parseJson(json.shortcuts),
      defaultModelIdsByProvider: parseJson(json.defaultModelIdsByProvider),
      memoryModelIdsByProvider: parseJson(json.memoryModelIdsByProvider),
      titleModelIdsByProvider: parseJson(json.titleModelIdsByProvider),
      lastProviderIdByModel: parseJson(json.lastProviderIdByModel),
      defaultMcpServerIds: parseJson(json.defaultMcpServerIds),
      multiModelDefaults: parseJson(json.multiModelDefaults)
    } as UserSettings;
  },

  async add(settings: UserSettings): Promise<string> {
    const db = await getRxDB();
    await db.settings.insert({
      ...settings,
      shortcuts: stringifyJson(settings.shortcuts),
      defaultModelIdsByProvider: stringifyJson(settings.defaultModelIdsByProvider),
      memoryModelIdsByProvider: stringifyJson(settings.memoryModelIdsByProvider),
      titleModelIdsByProvider: stringifyJson(settings.titleModelIdsByProvider),
      lastProviderIdByModel: stringifyJson(settings.lastProviderIdByModel),
      defaultMcpServerIds: stringifyJson(settings.defaultMcpServerIds),
      multiModelDefaults: stringifyJson(settings.multiModelDefaults)
    });
    return settings.id;
  },

  async bulkPut(settingsArray: UserSettings[]): Promise<string[]> {
    const db = await getRxDB();
    const prepared = settingsArray.map(s => ({
      ...s,
      shortcuts: stringifyJson(s.shortcuts),
      defaultModelIdsByProvider: stringifyJson(s.defaultModelIdsByProvider),
      memoryModelIdsByProvider: stringifyJson(s.memoryModelIdsByProvider),
      titleModelIdsByProvider: stringifyJson(s.titleModelIdsByProvider),
      lastProviderIdByModel: stringifyJson(s.lastProviderIdByModel),
      defaultMcpServerIds: stringifyJson(s.defaultMcpServerIds),
      multiModelDefaults: stringifyJson(s.multiModelDefaults)
    }));
    await db.settings.bulkUpsert(prepared);
    return settingsArray.map(s => s.id);
  },

  async put(settings: UserSettings): Promise<string> {
    const db = await getRxDB();
    await db.settings.upsert({
      ...settings,
      shortcuts: stringifyJson(settings.shortcuts),
      defaultModelIdsByProvider: stringifyJson(settings.defaultModelIdsByProvider),
      memoryModelIdsByProvider: stringifyJson(settings.memoryModelIdsByProvider),
      titleModelIdsByProvider: stringifyJson(settings.titleModelIdsByProvider),
      lastProviderIdByModel: stringifyJson(settings.lastProviderIdByModel),
      defaultMcpServerIds: stringifyJson(settings.defaultMcpServerIds),
      multiModelDefaults: stringifyJson(settings.multiModelDefaults)
    });
    return settings.id;
  },

  async update(id: string, changes: Partial<UserSettings>): Promise<number> {
    const db = await getRxDB();
    const doc = await db.settings.findOne(id).exec();
    if (doc) {
      const updates: any = { ...changes };
      if (changes.shortcuts) updates.shortcuts = stringifyJson(changes.shortcuts);
      if (changes.defaultModelIdsByProvider) updates.defaultModelIdsByProvider = stringifyJson(changes.defaultModelIdsByProvider);
      if (changes.memoryModelIdsByProvider) updates.memoryModelIdsByProvider = stringifyJson(changes.memoryModelIdsByProvider);
      if (changes.titleModelIdsByProvider) updates.titleModelIdsByProvider = stringifyJson(changes.titleModelIdsByProvider);
      if (changes.lastProviderIdByModel) updates.lastProviderIdByModel = stringifyJson(changes.lastProviderIdByModel);
      if (changes.defaultMcpServerIds) updates.defaultMcpServerIds = stringifyJson(changes.defaultMcpServerIds);
      if (changes.multiModelDefaults) updates.multiModelDefaults = stringifyJson(changes.multiModelDefaults);
      await doc.incrementalPatch(updates);
      return 1;
    }
    return 0;
  }
};

export const agentHelpers = {
  async toArray(): Promise<Agent[]> {
    const db = await getRxDB();
    const docs = await db.agents.find().exec();
    return docs.map(d => {
      const json = d.toJSON();
      return {
        ...json,
        enabledTools: parseJson(json.enabledTools),
        mcpServerIds: parseJson(json.mcpServerIds),
        mcpToolPolicy: parseJson(json.mcpToolPolicy),
        knowledgeBaseIds: parseJson(json.knowledgeBaseIds),
        parameters: parseJson(json.parameters),
        pipeline: parseJson(json.pipeline),
        subAgentIds: parseJson(json.subAgentIds)
      } as Agent;
    });
  },

  async count(): Promise<number> {
    const db = await getRxDB();
    const docs = await db.agents.find().exec();
    return docs.length;
  },

  async first(): Promise<Agent | undefined> {
    const db = await getRxDB();
    const docs = await db.agents.find().limit(1).exec();
    if (!docs[0]) return undefined;
    const json = docs[0].toJSON();
    return {
      ...json,
      enabledTools: parseJson(json.enabledTools),
      mcpServerIds: parseJson(json.mcpServerIds),
      mcpToolPolicy: parseJson(json.mcpToolPolicy),
      knowledgeBaseIds: parseJson(json.knowledgeBaseIds),
      parameters: parseJson(json.parameters),
      pipeline: parseJson(json.pipeline),
      subAgentIds: parseJson(json.subAgentIds)
    } as Agent;
  },

  limit(n: number) {
    return {
      toArray: async (): Promise<Agent[]> => {
        const db = await getRxDB();
        const docs = await db.agents.find().limit(n).exec();
        return docs.map(d => {
          const json = d.toJSON();
          return {
            ...json,
            enabledTools: parseJson(json.enabledTools),
            mcpServerIds: parseJson(json.mcpServerIds),
            mcpToolPolicy: parseJson(json.mcpToolPolicy),
            knowledgeBaseIds: parseJson(json.knowledgeBaseIds),
            parameters: parseJson(json.parameters),
            pipeline: parseJson(json.pipeline),
            subAgentIds: parseJson(json.subAgentIds)
          } as Agent;
        });
      }
    };
  },

  async get(id: string): Promise<Agent | undefined> {
    const db = await getRxDB();
    const doc = await db.agents.findOne(id).exec();
    if (!doc) return undefined;
    const json = doc.toJSON();
    return {
      ...json,
      enabledTools: parseJson(json.enabledTools),
      mcpServerIds: parseJson(json.mcpServerIds),
      mcpToolPolicy: parseJson(json.mcpToolPolicy),
      knowledgeBaseIds: parseJson(json.knowledgeBaseIds),
      parameters: parseJson(json.parameters),
      pipeline: parseJson(json.pipeline),
      subAgentIds: parseJson(json.subAgentIds)
    } as Agent;
  },

  async add(agent: Agent): Promise<string> {
    const db = await getRxDB();
    await db.agents.insert({
      ...agent,
      enabledTools: stringifyJson(agent.enabledTools),
      mcpServerIds: stringifyJson(agent.mcpServerIds),
      mcpToolPolicy: stringifyJson(agent.mcpToolPolicy),
      knowledgeBaseIds: stringifyJson(agent.knowledgeBaseIds),
      parameters: stringifyJson(agent.parameters),
      pipeline: stringifyJson(agent.pipeline),
      subAgentIds: stringifyJson(agent.subAgentIds)
    });
    return agent.id;
  },

  async bulkAdd(agents: Agent[]): Promise<string[]> {
    const db = await getRxDB();
    const prepared = agents.map(a => ({
      ...a,
      enabledTools: stringifyJson(a.enabledTools),
      mcpServerIds: stringifyJson(a.mcpServerIds),
      mcpToolPolicy: stringifyJson(a.mcpToolPolicy),
      knowledgeBaseIds: stringifyJson(a.knowledgeBaseIds),
      parameters: stringifyJson(a.parameters),
      pipeline: stringifyJson(a.pipeline),
      subAgentIds: stringifyJson(a.subAgentIds)
    }));
    await db.agents.bulkInsert(prepared);
    return agents.map(a => a.id);
  },

  async bulkPut(agents: Agent[]): Promise<string[]> {
    const db = await getRxDB();
    const prepared = agents.map(a => ({
      ...a,
      enabledTools: stringifyJson(a.enabledTools),
      mcpServerIds: stringifyJson(a.mcpServerIds),
      mcpToolPolicy: stringifyJson(a.mcpToolPolicy),
      knowledgeBaseIds: stringifyJson(a.knowledgeBaseIds),
      parameters: stringifyJson(a.parameters),
      pipeline: stringifyJson(a.pipeline),
      subAgentIds: stringifyJson(a.subAgentIds)
    }));
    await db.agents.bulkUpsert(prepared);
    return agents.map(a => a.id);
  },

  async put(agent: Agent): Promise<string> {
    const db = await getRxDB();
    await db.agents.upsert({
      ...agent,
      enabledTools: stringifyJson(agent.enabledTools),
      mcpServerIds: stringifyJson(agent.mcpServerIds),
      mcpToolPolicy: stringifyJson(agent.mcpToolPolicy),
      knowledgeBaseIds: stringifyJson(agent.knowledgeBaseIds),
      parameters: stringifyJson(agent.parameters),
      pipeline: stringifyJson(agent.pipeline),
      subAgentIds: stringifyJson(agent.subAgentIds)
    });
    return agent.id;
  },

  async update(id: string, changes: Partial<Agent>): Promise<number> {
    const db = await getRxDB();
    const doc = await db.agents.findOne(id).exec();
    if (doc) {
      const updates: any = { ...changes };
      if (changes.enabledTools) updates.enabledTools = stringifyJson(changes.enabledTools);
      if (changes.mcpServerIds) updates.mcpServerIds = stringifyJson(changes.mcpServerIds);
      if (changes.mcpToolPolicy) updates.mcpToolPolicy = stringifyJson(changes.mcpToolPolicy);
      if (changes.knowledgeBaseIds) updates.knowledgeBaseIds = stringifyJson(changes.knowledgeBaseIds);
      if (changes.parameters) updates.parameters = stringifyJson(changes.parameters);
      if (changes.pipeline) updates.pipeline = stringifyJson(changes.pipeline);
      if (changes.subAgentIds) updates.subAgentIds = stringifyJson(changes.subAgentIds);
      await doc.incrementalPatch(updates);
      return 1;
    }
    return 0;
  },

  async delete(id: string): Promise<void> {
    const db = await getRxDB();
    const doc = await db.agents.findOne(id).exec();
    if (doc) await doc.remove();
  },

  where(field: keyof Agent) {
    return {
      equals: (value: any) => ({
        toArray: async (): Promise<Agent[]> => {
          const db = await getRxDB();
          const docs = await db.agents.find({ selector: { [field]: value } }).exec();
          return docs.map(d => {
            const json = d.toJSON();
            return {
              ...json,
              enabledTools: parseJson(json.enabledTools),
              mcpServerIds: parseJson(json.mcpServerIds),
              mcpToolPolicy: parseJson(json.mcpToolPolicy),
              knowledgeBaseIds: parseJson(json.knowledgeBaseIds),
              parameters: parseJson(json.parameters),
              pipeline: parseJson(json.pipeline),
              subAgentIds: parseJson(json.subAgentIds)
            } as Agent;
          });
        }
      }),
      above: (value: any) => ({
        toArray: async (): Promise<Agent[]> => {
          const db = await getRxDB();
          const docs = await db.agents.find({ selector: { [field]: { $gt: value } } }).exec();
          return docs.map(d => {
            const json = d.toJSON();
            return {
              ...json,
              enabledTools: parseJson(json.enabledTools),
              mcpServerIds: parseJson(json.mcpServerIds),
              mcpToolPolicy: parseJson(json.mcpToolPolicy),
              knowledgeBaseIds: parseJson(json.knowledgeBaseIds),
              parameters: parseJson(json.parameters),
              pipeline: parseJson(json.pipeline),
              subAgentIds: parseJson(json.subAgentIds)
            } as Agent;
          });
        },
        count: async (): Promise<number> => {
          const db = await getRxDB();
          const docs = await db.agents.find({ selector: { [field]: { $gt: value } } }).exec();
          return docs.length;
        }
      }),
      below: (value: any) => ({
        toArray: async (): Promise<Agent[]> => {
          const db = await getRxDB();
          const docs = await db.agents.find({ selector: { [field]: { $lt: value } } }).exec();
          return docs.map(d => {
            const json = d.toJSON();
            return {
              ...json,
              enabledTools: parseJson(json.enabledTools),
              mcpServerIds: parseJson(json.mcpServerIds),
              mcpToolPolicy: parseJson(json.mcpToolPolicy),
              knowledgeBaseIds: parseJson(json.knowledgeBaseIds),
              parameters: parseJson(json.parameters),
              pipeline: parseJson(json.pipeline),
              subAgentIds: parseJson(json.subAgentIds)
            } as Agent;
          });
        },
        count: async (): Promise<number> => {
          const db = await getRxDB();
          const docs = await db.agents.find({ selector: { [field]: { $lt: value } } }).exec();
          return docs.length;
        }
      })
    };
  },

  filter(predicate: (agent: Agent) => boolean) {
    return {
      toArray: async (): Promise<Agent[]> => {
        const db = await getRxDB();
        const docs = await db.agents.find().exec();
        const agents = docs.map(d => {
          const json = d.toJSON();
          return {
            ...json,
            enabledTools: parseJson(json.enabledTools),
            mcpServerIds: parseJson(json.mcpServerIds),
            mcpToolPolicy: parseJson(json.mcpToolPolicy),
            knowledgeBaseIds: parseJson(json.knowledgeBaseIds),
            parameters: parseJson(json.parameters),
            pipeline: parseJson(json.pipeline),
            subAgentIds: parseJson(json.subAgentIds)
          } as Agent;
        });
        return agents.filter(predicate);
      }
    };
  }
};

export const skillHelpers = {
  async toArray(): Promise<Skill[]> {
    const db = await getRxDB();
    const docs = await db.skills.find().exec();
    return docs.map(d => {
      const json = d.toJSON();
      return {
        ...json,
        variables: parseJson(json.variables),
        trigger: parseJson(json.trigger),
        ui: parseJson(json.ui),
        autoApplyQueries: parseJson(json.autoApplyQueries),
        autoApplyEmbeddings: parseJson(json.autoApplyEmbeddings),
        exclusionQueries: parseJson(json.exclusionQueries),
        exclusionEmbeddings: parseJson(json.exclusionEmbeddings)
      } as Skill;
    });
  },

  async count(): Promise<number> {
    const db = await getRxDB();
    const docs = await db.skills.find().exec();
    return docs.length;
  },

  async first(): Promise<Skill | undefined> {
    const db = await getRxDB();
    const docs = await db.skills.find().limit(1).exec();
    if (!docs[0]) return undefined;
    const json = docs[0].toJSON();
    return {
      ...json,
      variables: parseJson(json.variables),
      trigger: parseJson(json.trigger),
      ui: parseJson(json.ui),
      autoApplyQueries: parseJson(json.autoApplyQueries),
      autoApplyEmbeddings: parseJson(json.autoApplyEmbeddings),
      exclusionQueries: parseJson(json.exclusionQueries),
      exclusionEmbeddings: parseJson(json.exclusionEmbeddings)
    } as Skill;
  },

  limit(n: number) {
    return {
      toArray: async (): Promise<Skill[]> => {
        const db = await getRxDB();
        const docs = await db.skills.find().limit(n).exec();
        return docs.map(d => {
          const json = d.toJSON();
          return {
            ...json,
            variables: parseJson(json.variables),
            trigger: parseJson(json.trigger),
            ui: parseJson(json.ui),
            autoApplyQueries: parseJson(json.autoApplyQueries),
            autoApplyEmbeddings: parseJson(json.autoApplyEmbeddings),
            exclusionQueries: parseJson(json.exclusionQueries),
            exclusionEmbeddings: parseJson(json.exclusionEmbeddings)
          } as Skill;
        });
      }
    };
  },

  async get(id: string): Promise<Skill | undefined> {
    const db = await getRxDB();
    const doc = await db.skills.findOne(id).exec();
    if (!doc) return undefined;
    const json = doc.toJSON();
    return {
      ...json,
      variables: parseJson(json.variables),
      trigger: parseJson(json.trigger),
      ui: parseJson(json.ui),
      autoApplyQueries: parseJson(json.autoApplyQueries),
      autoApplyEmbeddings: parseJson(json.autoApplyEmbeddings),
      exclusionQueries: parseJson(json.exclusionQueries),
      exclusionEmbeddings: parseJson(json.exclusionEmbeddings)
    } as Skill;
  },

  async add(skill: Skill): Promise<string> {
    const db = await getRxDB();
    await db.skills.insert({
      ...skill,
      variables: stringifyJson(skill.variables),
      trigger: stringifyJson(skill.trigger),
      ui: stringifyJson(skill.ui),
      autoApplyQueries: stringifyJson(skill.autoApplyQueries),
      autoApplyEmbeddings: stringifyJson(skill.autoApplyEmbeddings),
      exclusionQueries: stringifyJson(skill.exclusionQueries),
      exclusionEmbeddings: stringifyJson(skill.exclusionEmbeddings)
    });
    return skill.id;
  },

  async bulkAdd(skills: Skill[]): Promise<string[]> {
    const db = await getRxDB();
    const prepared = skills.map(s => ({
      ...s,
      variables: stringifyJson(s.variables),
      trigger: stringifyJson(s.trigger),
      ui: stringifyJson(s.ui),
      autoApplyQueries: stringifyJson(s.autoApplyQueries),
      autoApplyEmbeddings: stringifyJson(s.autoApplyEmbeddings),
      exclusionQueries: stringifyJson(s.exclusionQueries),
      exclusionEmbeddings: stringifyJson(s.exclusionEmbeddings)
    }));
    await db.skills.bulkInsert(prepared);
    return skills.map(s => s.id);
  },

  async update(id: string, changes: Partial<Skill>): Promise<number> {
    const db = await getRxDB();
    const doc = await db.skills.findOne(id).exec();
    if (doc) {
      const updates: any = { ...changes };
      if (changes.variables) updates.variables = stringifyJson(changes.variables);
      if (changes.trigger) updates.trigger = stringifyJson(changes.trigger);
      if (changes.ui) updates.ui = stringifyJson(changes.ui);
      if (changes.autoApplyQueries) updates.autoApplyQueries = stringifyJson(changes.autoApplyQueries);
      if (changes.autoApplyEmbeddings) updates.autoApplyEmbeddings = stringifyJson(changes.autoApplyEmbeddings);
      if (changes.exclusionQueries) updates.exclusionQueries = stringifyJson(changes.exclusionQueries);
      if (changes.exclusionEmbeddings) updates.exclusionEmbeddings = stringifyJson(changes.exclusionEmbeddings);
      await doc.incrementalPatch(updates);
      return 1;
    }
    return 0;
  },

  async delete(id: string): Promise<void> {
    const db = await getRxDB();
    const doc = await db.skills.findOne(id).exec();
    if (doc) await doc.remove();
  },

  async clear(): Promise<void> {
    const db = await getRxDB();
    const docs = await db.skills.find().exec();
    for (const doc of docs) {
      await doc.remove();
    }
  },

  where(field: keyof Skill) {
    return {
      equals: (value: any) => ({
        toArray: async (): Promise<Skill[]> => {
          const db = await getRxDB();
          const docs = await db.skills.find({ selector: { [field]: value } }).exec();
          return docs.map(d => {
            const json = d.toJSON();
            return {
              ...json,
              variables: parseJson(json.variables),
              trigger: parseJson(json.trigger),
              ui: parseJson(json.ui),
              autoApplyQueries: parseJson(json.autoApplyQueries),
              autoApplyEmbeddings: parseJson(json.autoApplyEmbeddings),
              exclusionQueries: parseJson(json.exclusionQueries),
              exclusionEmbeddings: parseJson(json.exclusionEmbeddings)
            } as Skill;
          });
        }
      })
    };
  },

  filter(predicate: (skill: Skill) => boolean) {
    return {
      toArray: async (): Promise<Skill[]> => {
        const db = await getRxDB();
        const docs = await db.skills.find().exec();
        const skills = docs.map(d => {
          const json = d.toJSON();
          return {
            ...json,
            variables: parseJson(json.variables),
            trigger: parseJson(json.trigger),
            ui: parseJson(json.ui),
            autoApplyQueries: parseJson(json.autoApplyQueries),
            autoApplyEmbeddings: parseJson(json.autoApplyEmbeddings),
            exclusionQueries: parseJson(json.exclusionQueries),
            exclusionEmbeddings: parseJson(json.exclusionEmbeddings)
          } as Skill;
        });
        return skills.filter(predicate);
      }
    };
  }
};

export const mcpServerHelpers = {
  async toArray(): Promise<McpServer[]> {
    const db = await getRxDB();
    const docs = await db.mcpServers.find().exec();
    return docs.map(d => {
      const json = d.toJSON();
      return {
        ...json,
        tools: parseJson(json.tools),
        toolPolicy: parseJson(json.toolPolicy),
        headers: parseJson(json.headers),
        args: parseJson(json.args),
        env: parseJson(json.env),
        composioToolkits: parseJson(json.composioToolkits)
      } as McpServer;
    });
  },

  async count(): Promise<number> {
    const db = await getRxDB();
    const docs = await db.mcpServers.find().exec();
    return docs.length;
  },

  async first(): Promise<McpServer | undefined> {
    const db = await getRxDB();
    const docs = await db.mcpServers.find().limit(1).exec();
    if (!docs[0]) return undefined;
    const json = docs[0].toJSON();
    return {
      ...json,
      tools: parseJson(json.tools),
      toolPolicy: parseJson(json.toolPolicy),
      headers: parseJson(json.headers),
      args: parseJson(json.args),
      env: parseJson(json.env),
      composioToolkits: parseJson(json.composioToolkits)
    } as McpServer;
  },

  limit(n: number) {
    return {
      toArray: async (): Promise<McpServer[]> => {
        const db = await getRxDB();
        const docs = await db.mcpServers.find().limit(n).exec();
        return docs.map(d => {
          const json = d.toJSON();
          return {
            ...json,
            tools: parseJson(json.tools),
            toolPolicy: parseJson(json.toolPolicy),
            headers: parseJson(json.headers),
            args: parseJson(json.args),
            env: parseJson(json.env),
            composioToolkits: parseJson(json.composioToolkits)
          } as McpServer;
        });
      }
    };
  },

  async get(id: string): Promise<McpServer | undefined> {
    const db = await getRxDB();
    const doc = await db.mcpServers.findOne(id).exec();
    if (!doc) return undefined;
    const json = doc.toJSON();
    return {
      ...json,
      tools: parseJson(json.tools),
      toolPolicy: parseJson(json.toolPolicy),
      headers: parseJson(json.headers),
      args: parseJson(json.args),
      env: parseJson(json.env),
      composioToolkits: parseJson(json.composioToolkits)
    } as McpServer;
  },

  async add(server: McpServer): Promise<string> {
    const db = await getRxDB();
    await db.mcpServers.insert({
      ...server,
      tools: stringifyJson(server.tools),
      toolPolicy: stringifyJson(server.toolPolicy),
      headers: stringifyJson(server.headers),
      args: stringifyJson(server.args),
      env: stringifyJson(server.env),
      composioToolkits: stringifyJson(server.composioToolkits)
    });
    return server.id;
  },

  async bulkAdd(servers: McpServer[]): Promise<string[]> {
    const db = await getRxDB();
    const prepared = servers.map(s => ({
      ...s,
      tools: stringifyJson(s.tools),
      toolPolicy: stringifyJson(s.toolPolicy),
      headers: stringifyJson(s.headers),
      args: stringifyJson(s.args),
      env: stringifyJson(s.env),
      composioToolkits: stringifyJson(s.composioToolkits)
    }));
    await db.mcpServers.bulkInsert(prepared);
    return servers.map(s => s.id);
  },

  async put(server: McpServer): Promise<string> {
    const db = await getRxDB();
    await db.mcpServers.upsert({
      ...server,
      tools: stringifyJson(server.tools),
      toolPolicy: stringifyJson(server.toolPolicy),
      headers: stringifyJson(server.headers),
      args: stringifyJson(server.args),
      env: stringifyJson(server.env),
      composioToolkits: stringifyJson(server.composioToolkits)
    });
    return server.id;
  },

  async update(id: string, changes: Partial<McpServer>): Promise<number> {
    const db = await getRxDB();
    const doc = await db.mcpServers.findOne(id).exec();
    if (doc) {
      const updates: any = { ...changes };
      if (changes.tools) updates.tools = stringifyJson(changes.tools);
      if (changes.toolPolicy) updates.toolPolicy = stringifyJson(changes.toolPolicy);
      if (changes.headers) updates.headers = stringifyJson(changes.headers);
      if (changes.args) updates.args = stringifyJson(changes.args);
      if (changes.env) updates.env = stringifyJson(changes.env);
      if (changes.composioToolkits) updates.composioToolkits = stringifyJson(changes.composioToolkits);
      await doc.incrementalPatch(updates);
      return 1;
    }
    return 0;
  },

  async delete(id: string): Promise<void> {
    const db = await getRxDB();
    const doc = await db.mcpServers.findOne(id).exec();
    if (doc) await doc.remove();
  },

  where(field: keyof McpServer) {
    return {
      equals: (value: any) => ({
        toArray: async (): Promise<McpServer[]> => {
          const db = await getRxDB();
          const docs = await db.mcpServers.find({ selector: { [field]: value } }).exec();
          return docs.map(d => {
            const json = d.toJSON();
            return {
              ...json,
              tools: parseJson(json.tools),
              toolPolicy: parseJson(json.toolPolicy),
              headers: parseJson(json.headers),
              args: parseJson(json.args),
              env: parseJson(json.env),
              composioToolkits: parseJson(json.composioToolkits)
            } as McpServer;
          });
        }
      })
    };
  },

  filter(predicate: (server: McpServer) => boolean) {
    return {
      toArray: async (): Promise<McpServer[]> => {
        const db = await getRxDB();
        const docs = await db.mcpServers.find().exec();
        const servers = docs.map(d => {
          const json = d.toJSON();
          return {
            ...json,
            tools: parseJson(json.tools),
            toolPolicy: parseJson(json.toolPolicy),
            headers: parseJson(json.headers),
            args: parseJson(json.args),
            env: parseJson(json.env),
            composioToolkits: parseJson(json.composioToolkits)
          } as McpServer;
        });
        return servers.filter(predicate);
      }
    };
  }
};

export const cloudSyncConfigHelpers = {
  async toArray(): Promise<CloudSyncConfig[]> {
    const db = await getRxDB();
    const docs = await db.cloudSyncConfig.find().exec();
    return docs.map(d => {
      const json = d.toJSON();
      return {
        ...json,
        syncPreferences: parseJson(json.syncPreferences)
      } as CloudSyncConfig;
    });
  },

  async count(): Promise<number> {
    const db = await getRxDB();
    const docs = await db.cloudSyncConfig.find().exec();
    return docs.length;
  },

  async first(): Promise<CloudSyncConfig | undefined> {
    const db = await getRxDB();
    const docs = await db.cloudSyncConfig.find().limit(1).exec();
    if (!docs[0]) return undefined;
    const json = docs[0].toJSON();
    return {
      ...json,
      syncPreferences: parseJson(json.syncPreferences)
    } as CloudSyncConfig;
  },

  limit(n: number) {
    return {
      toArray: async (): Promise<CloudSyncConfig[]> => {
        const db = await getRxDB();
        const docs = await db.cloudSyncConfig.find().limit(n).exec();
        return docs.map(d => {
          const json = d.toJSON();
          return {
            ...json,
            syncPreferences: parseJson(json.syncPreferences)
          } as CloudSyncConfig;
        });
      }
    };
  },

  async get(id: string): Promise<CloudSyncConfig | undefined> {
    const db = await getRxDB();
    const doc = await db.cloudSyncConfig.findOne(id).exec();
    if (!doc) return undefined;
    const json = doc.toJSON();
    return {
      ...json,
      syncPreferences: parseJson(json.syncPreferences)
    } as CloudSyncConfig;
  },

  async add(config: CloudSyncConfig): Promise<string> {
    const db = await getRxDB();
    await db.cloudSyncConfig.insert({
      ...config,
      syncPreferences: stringifyJson(config.syncPreferences)
    });
    return config.id;
  },

  async put(config: CloudSyncConfig): Promise<string> {
    const db = await getRxDB();
    await db.cloudSyncConfig.upsert({
      ...config,
      syncPreferences: stringifyJson(config.syncPreferences)
    });
    return config.id;
  },

  async update(id: string, changes: Partial<CloudSyncConfig>): Promise<number> {
    const db = await getRxDB();
    const doc = await db.cloudSyncConfig.findOne(id).exec();
    if (doc) {
      const updates: any = { ...changes };
      if (changes.syncPreferences) updates.syncPreferences = stringifyJson(changes.syncPreferences);
      await doc.incrementalPatch(updates);
      return 1;
    }
    return 0;
  },

  async delete(id: string): Promise<void> {
    const db = await getRxDB();
    const doc = await db.cloudSyncConfig.findOne(id).exec();
    if (doc) await doc.remove();
  }
};

// Transaction wrapper for batch operations
// Note: RxDB doesn't have native ACID transactions like Dexie
// This implementation provides best-effort atomicity by:
// 1. Executing operations sequentially
// 2. Catching errors and allowing rollback logic in the callback
// 3. Documenting the limitation for callers
export async function transaction<T>(
  mode: 'rw' | 'r',
  _collections: any[],  // Accept any type for compatibility (Dexie uses strings, our compat uses helper objects)
  callback: () => Promise<T>
): Promise<T> {
  try {
    // Execute callback - operations are sequential by default in async/await
    // For true atomicity, callers should implement their own rollback logic
    const result = await callback();
    return result;
  } catch (error) {
    // Re-throw to allow error handling in caller
    // Caller can implement rollback logic if needed
    console.error('[Transaction] Error in transaction callback:', error);
    throw error;
  }
}

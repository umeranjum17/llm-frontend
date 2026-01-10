"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getAllChats, getMessages } from "@/lib/db/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign, MessageSquare, BarChart3, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";

export function UsageAnalytics() {
  const chats = useLiveQuery(() => getAllChats(), []);
  const allMessages = useLiveQuery(
    async () => {
      if (!chats) return [];
      const messages = await Promise.all(chats.map(chat => getMessages(chat.id)));
      return messages.flat();
    },
    [chats]
  );

  const stats = useMemo(() => {
    if (!chats || !allMessages) return null;

    const totalCost = chats.reduce((sum, chat) => sum + (chat.totalCost || 0), 0);
    const totalMessages = allMessages.length;
    const totalChats = chats.length;
    
    // Cost by model
    const costByModel = new Map<string, number>();
    chats.forEach(chat => {
      const cost = chat.totalCost || 0;
      if (cost > 0) {
        const current = costByModel.get(chat.modelId) || 0;
        costByModel.set(chat.modelId, current + cost);
      }
    });

    // Usage by day (last 30 days)
    const usageByDay = new Map<string, number>();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    chats
      .filter(chat => chat.updatedAt >= thirtyDaysAgo)
      .forEach(chat => {
        const day = new Date(chat.updatedAt).toISOString().split('T')[0];
        usageByDay.set(day, (usageByDay.get(day) || 0) + 1);
      });

    // Top models by usage
    const modelUsage = new Map<string, number>();
    chats.forEach(chat => {
      modelUsage.set(chat.modelId, (modelUsage.get(chat.modelId) || 0) + 1);
    });

    return {
      totalCost,
      totalMessages,
      totalChats,
      costByModel: Array.from(costByModel.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      usageByDay: Array.from(usageByDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-7), // Last 7 days
      topModels: Array.from(modelUsage.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    };
  }, [chats, allMessages]);

  if (!stats) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading analytics...</div>
      </div>
    );
  }

  const handleExport = () => {
    const data = {
      totalCost: stats.totalCost,
      totalMessages: stats.totalMessages,
      totalChats: stats.totalChats,
      costByModel: stats.costByModel,
      topModels: stats.topModels,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lumina-usage-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Usage Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Track your API usage and costs
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export Data
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalCost.toFixed(4)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all chats
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Total Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMessages.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalChats} chats
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Average per Chat
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${stats.totalChats > 0 ? (stats.totalCost / stats.totalChats).toFixed(4) : "0.0000"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Cost per chat
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost by Model */}
      {stats.costByModel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost by Model</CardTitle>
            <CardDescription>Top models by total cost</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.costByModel.map(([modelId, cost]) => (
                <div key={modelId} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{modelId}</div>
                  </div>
                  <div className="text-sm font-semibold ml-4">${cost.toFixed(4)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Models by Usage */}
      {stats.topModels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most Used Models</CardTitle>
            <CardDescription>Models you use most frequently</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topModels.map(([modelId, count], index) => (
                <div key={modelId} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{modelId}</div>
                  </div>
                  <div className="text-sm text-muted-foreground">{count} chat{count !== 1 ? "s" : ""}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

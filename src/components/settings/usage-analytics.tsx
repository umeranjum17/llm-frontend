"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getAllChats, getMessages } from "@/lib/db/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign, MessageSquare, BarChart3, Download, PieChart as PieChartIcon } from "lucide-react";
import { format, subDays, isSameDay } from "date-fns";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Sector, AreaChart, Area
} from "recharts";

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

    const costData = Array.from(costByModel.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Usage by day (last 14 days)
    const usageByDay = [];
    for (let i = 13; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayStr = format(date, "MMM dd");
      const count = chats.filter(chat => isSameDay(new Date(chat.updatedAt), date)).length;
      usageByDay.push({ name: dayStr, count });
    }

    // Top models by usage
    const modelUsage = new Map<string, number>();
    chats.forEach(chat => {
      modelUsage.set(chat.modelId, (modelUsage.get(chat.modelId) || 0) + 1);
    });

    const pieData = Array.from(modelUsage.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      totalCost,
      totalMessages,
      totalChats,
      costData,
      usageByDay,
      pieData,
    };
  }, [chats, allMessages]);

  if (!stats) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading analytics...</div>
      </div>
    );
  }

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

  const handleExport = () => {
    const data = {
      totalCost: stats.totalCost,
      totalMessages: stats.totalMessages,
      totalChats: stats.totalChats,
      costData: stats.costData,
      pieData: stats.pieData,
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
          <CardHeader className="pb-3 px-4 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-3 w-3" />
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">${stats.totalCost.toFixed(4)}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Across all conversations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 px-4 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <MessageSquare className="h-3 w-3" />
              Total Messages
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{stats.totalMessages.toLocaleString()}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              In {stats.totalChats} chats
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 px-4 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-3 w-3" />
              Avg per Chat
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">
              ${stats.totalChats > 0 ? (stats.totalCost / stats.totalChats).toFixed(4) : "0.0000"}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Average cost per chat
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Usage Over Time */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Activity (Last 14 Days)</CardTitle>
            <CardDescription className="text-xs">Number of active chats per day</CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-4">
            <div className="h-[200px] w-full pr-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.usageByDay}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCount)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Cost by Model */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cost Distribution</CardTitle>
            <CardDescription className="text-xs">Total cost split by provider/model</CardDescription>
          </CardHeader>
          <CardContent className="p-0 pb-4">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.costData} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" opacity={0.5} />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "#6b7280" }}
                  />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(4)}`, "Cost"]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "11px" }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {stats.costData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Model Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Model Popularity</CardTitle>
            <CardDescription className="text-xs">Most frequently used models</CardDescription>
          </CardHeader>
          <CardContent className="p-0 pb-4 flex flex-col items-center">
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {stats.pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "11px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full px-6 mt-2">
              {stats.pieData.map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-muted-foreground truncate max-w-[120px]">{entry.name}</span>
                  </div>
                  <span className="font-medium">{entry.value} chats</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

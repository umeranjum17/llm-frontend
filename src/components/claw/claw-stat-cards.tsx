"use client";

import { ListTodo, Calendar, Lightbulb, CheckCircle2 } from "lucide-react";
import { useClawStore } from "@/stores/claw-store";

export function ClawStatCards() {
  const tasks = useClawStore((s) => s.tasks);
  const schedules = useClawStore((s) => s.schedules);
  const initiatives = useClawStore((s) => s.initiatives);

  const running = tasks.filter((t) => t.status === "running").length;
  const activeSchedules = schedules.filter((s) => s.enabled).length;
  const proposed = initiatives.filter((i) => i.status === "proposed").length;

  const stats = [
    { label: "Running Tasks", value: running, icon: ListTodo, accent: "text-blue-500" },
    { label: "Active Schedules", value: activeSchedules, icon: Calendar, accent: "text-purple-500" },
    { label: "Pending Initiatives", value: proposed, icon: Lightbulb, accent: "text-amber-500" },
    { label: "Total Tasks", value: tasks.length, icon: CheckCircle2, accent: "text-emerald-500" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <s.icon className={`h-4 w-4 ${s.accent}`} />
            <span className="text-xs text-muted-foreground">{s.label}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

"use client";

import { memo, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Default color palette for charts
const COLORS = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#0088fe",
  "#00c49f",
  "#ffbb28",
  "#ff8042",
  "#a4de6c",
  "#d0ed57",
];

interface ChartConfig {
  type: "bar" | "line" | "pie" | "area" | "scatter";
  data: Array<Record<string, unknown>>;
  title?: string;
  xKey?: string;
  yKeys?: string[];
  colors?: string[];
  stacked?: boolean;
  showGrid?: boolean;
  showLegend?: boolean;
}

interface ChartRendererProps {
  code: string;
  className?: string;
}

// Convert Chart.js format to our format
function convertChartJsFormat(parsed: Record<string, unknown>): ChartConfig | null {
  const data = parsed.data as { labels?: string[]; datasets?: Array<{ label?: string; data?: number[]; borderColor?: string; backgroundColor?: string }> };

  if (!data?.labels || !data?.datasets || !Array.isArray(data.datasets)) {
    return null;
  }

  const labels = data.labels;
  const datasets = data.datasets;

  // Convert to our data format: [{name: "label", value1: x, value2: y}, ...]
  const convertedData = labels.map((label, index) => {
    const point: Record<string, unknown> = { name: label };
    datasets.forEach((dataset) => {
      const key = dataset.label || "value";
      point[key] = dataset.data?.[index] ?? 0;
    });
    return point;
  });

  // Extract colors from datasets
  const colors = datasets.map((ds) => ds.borderColor || ds.backgroundColor).filter(Boolean) as string[];

  // Extract yKeys from dataset labels
  const yKeys = datasets.map((ds) => ds.label || "value");

  // Get title from options if available
  const options = parsed.options as { plugins?: { title?: { text?: string } } } | undefined;
  const title = options?.plugins?.title?.text;

  return {
    type: parsed.type as ChartConfig["type"],
    data: convertedData,
    title,
    xKey: "name",
    yKeys,
    colors: colors.length > 0 ? colors : COLORS,
    stacked: false,
    showGrid: true,
    showLegend: true,
  };
}

function parseChartConfig(code: string): ChartConfig | null {
  try {
    const parsed = JSON.parse(code);

    if (!parsed.type) {
      return null;
    }

    // Check if it's Chart.js format (data has labels and datasets)
    if (parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)) {
      const dataObj = parsed.data as { labels?: unknown; datasets?: unknown };
      if (dataObj.labels && dataObj.datasets) {
        return convertChartJsFormat(parsed);
      }
    }

    // Our simple format: data is an array
    if (!parsed.data || !Array.isArray(parsed.data)) {
      return null;
    }

    // Infer xKey and yKeys if not provided
    const firstItem = parsed.data[0];
    if (firstItem && typeof firstItem === "object") {
      const keys = Object.keys(firstItem);

      if (!parsed.xKey && keys.length > 0) {
        // Try to find a common x-axis key
        const commonXKeys = ["name", "label", "x", "date", "category", "month", "year"];
        parsed.xKey = commonXKeys.find((k) => keys.includes(k)) || keys[0];
      }

      if (!parsed.yKeys && keys.length > 1) {
        // Use all numeric keys as y values
        parsed.yKeys = keys.filter(
          (k) => k !== parsed.xKey && typeof firstItem[k] === "number"
        );
      }
    }

    return {
      type: parsed.type,
      data: parsed.data,
      title: parsed.title,
      xKey: parsed.xKey || "name",
      yKeys: parsed.yKeys || ["value"],
      colors: parsed.colors || COLORS,
      stacked: parsed.stacked ?? false,
      showGrid: parsed.showGrid ?? true,
      showLegend: parsed.showLegend ?? true,
    };
  } catch {
    return null;
  }
}

export const ChartRenderer = memo(function ChartRenderer({ code, className }: ChartRendererProps) {
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const config = useMemo(() => parseChartConfig(code), [code]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!config) {
    return (
      <div className="my-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-yellow-500">Invalid Chart Configuration</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Expected JSON with &quot;type&quot; (bar, line, pie, area, scatter) and &quot;data&quot; array.
        </p>
        <details>
          <summary className="text-xs text-muted-foreground cursor-pointer">Show source</summary>
          <pre className="mt-2 text-xs text-muted-foreground overflow-x-auto">{code}</pre>
        </details>
      </div>
    );
  }

  const renderChart = (height = 300) => {
    const { type, data, xKey, yKeys, colors, stacked, showGrid, showLegend } = config;

    switch (type) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#333" />}
              <XAxis dataKey={xKey} stroke="#888" fontSize={12} />
              <YAxis stroke="#888" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: "8px",
                }}
              />
              {showLegend && <Legend />}
              {yKeys?.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={colors?.[index % colors.length]}
                  stackId={stacked ? "stack" : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case "line":
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#333" />}
              <XAxis dataKey={xKey} stroke="#888" fontSize={12} />
              <YAxis stroke="#888" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: "8px",
                }}
              />
              {showLegend && <Legend />}
              {yKeys?.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors?.[index % colors.length]}
                  strokeWidth={2}
                  dot={{ fill: colors?.[index % colors.length] }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case "area":
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#333" />}
              <XAxis dataKey={xKey} stroke="#888" fontSize={12} />
              <YAxis stroke="#888" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: "8px",
                }}
              />
              {showLegend && <Legend />}
              {yKeys?.map((key, index) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  fill={colors?.[index % colors.length]}
                  stroke={colors?.[index % colors.length]}
                  fillOpacity={0.3}
                  stackId={stacked ? "stack" : undefined}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      case "pie":
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                dataKey={yKeys?.[0] || "value"}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius={height / 3}
                label={({ name, percent }) =>
                  `${name}: ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={colors?.[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: "8px",
                }}
              />
              {showLegend && <Legend />}
            </PieChart>
          </ResponsiveContainer>
        );

      case "scatter":
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#333" />}
              <XAxis dataKey={xKey} name={xKey} stroke="#888" fontSize={12} />
              <YAxis dataKey={yKeys?.[0]} name={yKeys?.[0]} stroke="#888" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: "8px",
                }}
                cursor={{ strokeDasharray: "3 3" }}
              />
              {showLegend && <Legend />}
              <Scatter name={yKeys?.[0]} data={data} fill={colors?.[0]} />
            </ScatterChart>
          </ResponsiveContainer>
        );

      default:
        return <div className="text-muted-foreground">Unsupported chart type: {type}</div>;
    }
  };

  return (
    <>
      <div className={cn("group relative my-4", className)}>
        <div className="flex items-center justify-between rounded-t-lg bg-primary/5 border-b border-white/5 px-4 py-2 text-sm font-medium text-primary">
          <span>{config.title || `${config.type} chart`}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsFullscreen(true)}
              title="View fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopy}
              title="Copy data"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="overflow-hidden rounded-b-lg bg-[#0d1117] p-4">
          {renderChart(300)}
        </div>
      </div>

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="absolute top-4 right-4">
            <Button variant="outline" size="sm" onClick={() => setIsFullscreen(false)}>
              Close
            </Button>
          </div>
          <div
            className="w-full max-w-5xl h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {config.title && (
              <h2 className="text-xl font-semibold mb-4 text-center">{config.title}</h2>
            )}
            {renderChart(500)}
          </div>
        </div>
      )}
    </>
  );
});

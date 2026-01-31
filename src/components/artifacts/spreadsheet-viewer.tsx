"use client";

import { useState, useMemo } from "react";
import Papa from "papaparse";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, Search, ArrowUp, ArrowDown } from "lucide-react";
import { ExportButton } from "@/components/artifacts/export-button";
import { cn } from "@/lib/utils";

interface SpreadsheetViewerProps {
  content: string;
}

export function SpreadsheetViewer({ content }: SpreadsheetViewerProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const { headers, rows, error } = useMemo(() => {
    try {
      const result = Papa.parse<string[]>(content.trim(), {
        skipEmptyLines: true,
      });
      if (result.errors.length > 0 || !result.data.length) {
        return { headers: [], rows: [], error: result.errors[0]?.message || "No data" };
      }
      const [headerRow, ...dataRows] = result.data;
      return { headers: headerRow, rows: dataRows, error: null };
    } catch (e) {
      return { headers: [], rows: [], error: "Failed to parse CSV" };
    }
  }, [content]);

  const columns = useMemo<ColumnDef<string[]>[]>(
    () =>
      headers.map((header, i) => ({
        id: `col_${i}`,
        accessorFn: (row: string[]) => row[i] ?? "",
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <div className="flex items-center gap-1.5 select-none">
              <span className="truncate">{header}</span>
              {sorted === "asc" ? (
                <ArrowUp className="h-3 w-3 text-primary shrink-0" />
              ) : sorted === "desc" ? (
                <ArrowDown className="h-3 w-3 text-primary shrink-0" />
              ) : (
                <ArrowUpDown className="h-3 w-3 text-muted-foreground/30 shrink-0" />
              )}
            </div>
          );
        },
      })),
    [headers]
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const filteredCount = table.getFilteredRowModel().rows.length;

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground p-8">
        <p className="text-sm">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-muted/10">
        <div className="relative flex-1 min-w-0 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Filter rows..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 pl-8 text-xs bg-background"
          />
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums font-medium">{filteredCount}</span>
          {filteredCount !== rows.length && (
            <span className="text-muted-foreground/50">of {rows.length}</span>
          )}
          <span className="text-muted-foreground/50">rows</span>
          <span className="text-muted-foreground/30 mx-0.5">·</span>
          <span className="tabular-nums">{headers.length}</span>
          <span className="text-muted-foreground/50">cols</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <ExportButton
            label="XLSX"
            onClick={async () => {
              const { exportToXlsx } = await import("@/lib/utils/export-utils");
              await exportToXlsx(content, "Spreadsheet");
            }}
          />
          <ExportButton
            label="CSV"
            onClick={async () => {
              const { exportToCsv } = await import("@/lib/utils/export-utils");
              exportToCsv(content, "Spreadsheet");
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-muted/70 backdrop-blur-sm">
                {/* Row number header */}
                <th className="text-right px-2 py-2 font-normal text-muted-foreground/40 border-b border-r border-border/30 w-10 text-[10px]">
                  #
                </th>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left px-2.5 py-2 font-semibold text-xs text-foreground/80 border-b border-border/30 cursor-pointer hover:bg-muted/90 select-none whitespace-nowrap transition-colors"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                className={cn(
                  "hover:bg-primary/[0.04] transition-colors group",
                  i % 2 === 1 && "bg-muted/[0.04]"
                )}
              >
                {/* Row number */}
                <td className="text-right px-2 py-1.5 text-[10px] text-muted-foreground/30 border-r border-border/20 tabular-nums group-hover:text-muted-foreground/50">
                  {i + 1}
                </td>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-2.5 py-1.5 border-b border-border/[0.15] whitespace-nowrap max-w-[300px] truncate hover:bg-primary/[0.03] transition-colors"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

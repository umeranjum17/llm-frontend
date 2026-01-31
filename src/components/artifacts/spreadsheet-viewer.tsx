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
import { ArrowUpDown, Search } from "lucide-react";
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
        header: () => (
          <div className="flex items-center gap-1">
            <span>{header}</span>
            <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
          </div>
        ),
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
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {table.getFilteredRowModel().rows.length} of {rows.length} rows
        </span>
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
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left px-2 py-1.5 sm:px-3 sm:py-2 font-medium text-muted-foreground border-b cursor-pointer hover:bg-muted/80 select-none whitespace-nowrap"
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
                  "hover:bg-muted/30 transition-colors",
                  i % 2 === 1 && "bg-muted/10"
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-2 py-1 sm:px-3 sm:py-1.5 border-b border-border/30 whitespace-nowrap">
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

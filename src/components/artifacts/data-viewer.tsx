"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import {
    useReactTable,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    flexRender,
    type SortingState,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, FileSpreadsheet, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DataViewerProps {
    content: string;
    filename: string;
}

export function DataViewer({ content, filename }: DataViewerProps) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = useState("");
    const [showRawContent, setShowRawContent] = useState(false);

    const { data, columns, error } = useMemo(() => {
        try {
            // Parse CSV
            const result = Papa.parse(content, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
            });

            // Check for parsing errors
            if (result.errors && result.errors.length > 0) {
                console.error("CSV parsing errors:", result.errors);
                return {
                    data: [],
                    columns: [],
                    error: result.errors.map(e => e.message).join("; ")
                };
            }

            const parsedData = result.data as Record<string, unknown>[];
            if (parsedData.length === 0) {
                return { data: [], columns: [], error: "No data rows found in CSV" };
            }

            // Generate columns from keys
            const keys = Object.keys(parsedData[0]);
            if (keys.length === 0) {
                return { data: [], columns: [], error: "No columns found in CSV" };
            }

            const cols = keys.map((key) => ({
                accessorKey: key,
                header: key,
            }));

            return { data: parsedData, columns: cols, error: null };
        } catch (err) {
            console.error("CSV parsing error:", err);
            return {
                data: [],
                columns: [],
                error: err instanceof Error ? err.message : "Failed to parse CSV"
            };
        }
    }, [content]);

    const table = useReactTable({
        data,
        columns,
        state: {
            sorting,
            globalFilter,
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });

    // Show error state with fallback to raw content
    if (error || !data.length) {
        if (showRawContent) {
            return (
                <div className="flex h-full flex-col bg-background">
                    <div className="flex items-center justify-between border-b p-3 bg-muted/20">
                        <div className="flex items-center gap-2">
                            <FileSpreadsheet className="h-4 w-4 text-orange-600" />
                            <span className="font-medium text-sm">Raw Content</span>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowRawContent(false)}
                        >
                            Try Table View
                        </Button>
                    </div>
                    <ScrollArea className="flex-1 p-4">
                        <pre className="text-xs font-mono whitespace-pre-wrap">{content}</pre>
                    </ScrollArea>
                </div>
            );
        }

        return (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <AlertCircle className="mb-4 h-12 w-12 opacity-50 text-destructive" />
                <p className="font-medium mb-2">
                    {error || "No valid data found in CSV"}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                    The file could not be parsed as a table.
                </p>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowRawContent(true)}
                >
                    View Raw Content
                </Button>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background">
            <div className="flex items-center justify-between border-b p-3 bg-muted/20">
                <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-sm truncate">{filename}</span>
                    <span className="text-xs text-muted-foreground">({data.length} rows)</span>
                </div>
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="Search..."
                        value={globalFilter ?? ""}
                        onChange={(event) => setGlobalFilter(event.target.value)}
                        className="h-8 w-40 lg:w-64 text-xs"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id} className="whitespace-nowrap">
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id}>
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id} className="whitespace-nowrap max-w-[300px] truncate">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between border-t p-2 px-4 bg-muted/20">
                <div className="text-xs text-muted-foreground">
                    Page {table.getState().pagination.pageIndex + 1} of{" "}
                    {table.getPageCount()}
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        className="h-7 w-8 p-0"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        className="h-7 w-8 p-0"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

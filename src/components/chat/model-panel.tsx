"use client";

import { useState, lazy, Suspense } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getModelById } from "@/lib/constants/models";
import { getModelPickerData } from "@/lib/db/queries";
import { TokenDisplay } from "./token-display";

// Lazy load model picker dialog
const ModelPickerDialog = lazy(() =>
  import("@/components/model-picker/model-picker-dialog").then((m) => ({
    default: m.ModelPickerDialog,
  }))
);

interface ModelPanelProps {
  panelId: string;
  modelId: string;
  chatId: string | null;
  onChangeModel: (modelId: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  children: React.ReactNode;
  historyTokens?: number;
  draftTokens?: number;
}

export function ModelPanel({
  panelId,
  modelId,
  chatId,
  onChangeModel,
  onRemove,
  canRemove,
  children,
  historyTokens = 0,
  draftTokens = 0,
}: ModelPanelProps) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const model = getModelById(modelId);

  // Get quick switch models
  const modelPickerData = useLiveQuery(() => getModelPickerData(), []);
  const favorites = modelPickerData?.favorites || [];
  const recent = modelPickerData?.recent || [];

  const quickSwitchModels = [
    ...favorites.slice(0, 3).map((f) => getModelById(f.id)).filter(Boolean),
    ...recent
      .filter((r) => !favorites.some((f) => f.id === r.id))
      .slice(0, 3)
      .map((r) => getModelById(r.id))
      .filter(Boolean),
  ].slice(0, 5);

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-background/80 backdrop-blur-sm">
        {/* Model selector dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs font-medium hover:bg-muted"
            >
              <span className="truncate max-w-[120px]">
                {model?.name || modelId.split("/").pop()?.replace(/-/g, " ") || "Model"}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Quick Switch
            </DropdownMenuLabel>
            {quickSwitchModels.map((m) => (
              <DropdownMenuItem
                key={m!.id}
                onClick={() => onChangeModel(m!.id)}
                className="cursor-pointer"
              >
                <span className="truncate flex-1">{m!.name}</span>
                {m!.id === modelId && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    Active
                  </Badge>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setModelPickerOpen(true)}
              className="cursor-pointer font-medium"
            >
              Browse all models...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Remove panel button */}
        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={onRemove}
            title="Remove panel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Token display for this panel */}
      {model && (
        <div className="px-3 py-1 border-b">
          <TokenDisplay
            historyTokens={historyTokens}
            draftTokens={draftTokens}
            totalTokens={model.contextLength}
            modelName={model.name}
          />
        </div>
      )}

      {/* Panel content (MessageList) */}
      <div className="flex-1 overflow-hidden">{children}</div>

      {/* Model Picker Dialog */}
      <Suspense fallback={null}>
        <ModelPickerDialog
          open={modelPickerOpen}
          onOpenChange={setModelPickerOpen}
          currentModelId={modelId}
          onSelectModel={(newModelId) => {
            onChangeModel(newModelId);
            setModelPickerOpen(false);
          }}
        />
      </Suspense>
    </div>
  );
}

interface AddModelPanelButtonProps {
  onAdd: (modelId: string) => void;
  disabled?: boolean;
}

export function AddModelPanelButton({ onAdd, disabled }: AddModelPanelButtonProps) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={() => setModelPickerOpen(true)}
        disabled={disabled}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Model
      </Button>

      <Suspense fallback={null}>
        <ModelPickerDialog
          open={modelPickerOpen}
          onOpenChange={setModelPickerOpen}
          currentModelId=""
          onSelectModel={(modelId) => {
            onAdd(modelId);
            setModelPickerOpen(false);
          }}
        />
      </Suspense>
    </>
  );
}

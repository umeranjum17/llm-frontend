"use client";

import { useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getModelById } from "@/lib/constants/models";

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
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ModelPanel({
  panelId,
  modelId,
  chatId,
  onChangeModel,
  onRemove,
  canRemove,
  children,
  isCollapsed = false,
  onToggleCollapse,
}: ModelPanelProps) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const model = getModelById(modelId);

  const modelName = model?.name || modelId.split("/").pop()?.replace(/-/g, " ") || "Model";

  // Collapsed state - narrow strip with vertical text
  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center w-8 border-r bg-muted/20 h-full">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 mt-1"
          onClick={onToggleCollapse}
          title="Expand panel"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <div
          className="flex-1 flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors py-2"
          onClick={onToggleCollapse}
        >
          <span
            className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            {modelName}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-r last:border-r-0 bg-background min-w-0">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30">
        <div className="flex items-center gap-1 min-w-0">
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={onToggleCollapse}
              title="Collapse panel"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          <button
            className="text-xs font-medium truncate max-w-[150px] hover:text-primary transition-colors text-left"
            onClick={() => setModelPickerOpen(true)}
            title="Change model"
          >
            {modelName}
          </button>
        </div>

        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive shrink-0"
            onClick={onRemove}
            title="Remove panel"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

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
  variant?: "default" | "compact";
}

export function AddModelPanelButton({ onAdd, disabled, variant = "default" }: AddModelPanelButtonProps) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  if (variant === "compact") {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setModelPickerOpen(true)}
          disabled={disabled}
          title="Add model"
        >
          <Plus className="h-4 w-4" />
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

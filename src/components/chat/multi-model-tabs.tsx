"use client";

import { useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getModelById } from "@/lib/constants/models";
import { Plus, X } from "lucide-react";
import { MessageList } from "./message-list";
import type { MultiModelPanel } from "@/stores/ui-store";

// Lazy load model picker dialog
const ModelPickerDialog = lazy(() =>
  import("@/components/model-picker/model-picker-dialog").then((m) => ({
    default: m.ModelPickerDialog,
  }))
);

interface MultiModelTabsProps {
  panels: MultiModelPanel[];
  activePanelId: string | null;
  chatId: string | null;
  onSelectPanel: (panelId: string) => void;
  onChangeModel: (panelId: string, modelId: string) => void;
  onRemovePanel: (panelId: string) => void;
  onAddPanel: (modelId: string) => void;
  canAddMore: boolean;
}

export function MultiModelTabs({
  panels,
  activePanelId,
  chatId,
  onSelectPanel,
  onChangeModel,
  onRemovePanel,
  onAddPanel,
  canAddMore,
}: MultiModelTabsProps) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [longPressedPanelId, setLongPressedPanelId] = useState<string | null>(null);

  // Find active panel - default to first if none set
  const activePanel = panels.find((p) => p.id === activePanelId) || panels[0];

  // Get model names for tabs
  const getModelName = (modelId: string) => {
    const model = getModelById(modelId);
    if (model) return model.name;
    // Fallback: extract short name from model ID
    const parts = modelId.split("/");
    const name = parts[parts.length - 1] || modelId;
    return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Handle long press for remove option
  let pressTimer: NodeJS.Timeout | null = null;

  const handlePressStart = (panelId: string) => {
    pressTimer = setTimeout(() => {
      setLongPressedPanelId(panelId);
    }, 500);
  };

  const handlePressEnd = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div className="flex items-center border-b bg-muted/30 overflow-x-auto scrollbar-none">
        <div className="flex items-center min-w-0 flex-1">
          {panels.map((panel) => {
            const isActive = panel.id === activePanel?.id;
            const modelName = getModelName(panel.modelId);
            const isLongPressed = panel.id === longPressedPanelId;

            return (
              <div key={panel.id} className="relative flex-shrink-0">
                <button
                  className={cn(
                    "px-3 py-2.5 text-xs font-medium transition-colors relative whitespace-nowrap",
                    "border-b-2 -mb-[1px]",
                    isActive
                      ? "border-primary text-foreground bg-background"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                  onClick={() => {
                    if (isLongPressed) {
                      setLongPressedPanelId(null);
                    } else {
                      onSelectPanel(panel.id);
                    }
                  }}
                  onMouseDown={() => handlePressStart(panel.id)}
                  onMouseUp={handlePressEnd}
                  onMouseLeave={() => {
                    handlePressEnd();
                    setLongPressedPanelId(null);
                  }}
                  onTouchStart={() => handlePressStart(panel.id)}
                  onTouchEnd={handlePressEnd}
                  onTouchCancel={() => {
                    handlePressEnd();
                    setLongPressedPanelId(null);
                  }}
                >
                  <span className="max-w-[100px] truncate inline-block align-middle">
                    {modelName}
                  </span>
                </button>

                {/* Long-press remove button */}
                {isLongPressed && panels.length > 1 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/90 z-10">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        onRemovePanel(panel.id);
                        setLongPressedPanelId(null);
                      }}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Model Button */}
        {canAddMore && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 border-l"
            onClick={() => setModelPickerOpen(true)}
            title="Add model"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Active Model's Chat - Full viewport */}
      <div className="flex-1 overflow-hidden">
        {activePanel && (
          <MessageList chatId={chatId} modelId={activePanel.modelId} />
        )}
      </div>

      {/* Model Picker Dialog */}
      <Suspense fallback={null}>
        <ModelPickerDialog
          open={modelPickerOpen}
          onOpenChange={setModelPickerOpen}
          currentModelId=""
          onSelectModel={(modelId) => {
            onAddPanel(modelId);
            setModelPickerOpen(false);
          }}
        />
      </Suspense>
    </div>
  );
}

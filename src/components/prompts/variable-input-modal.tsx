"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PromptVariable } from "@/lib/db/schema";
import { substituteVariables } from "@/lib/utils/prompt-variables";

interface VariableInputModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: string;
  variables: PromptVariable[];
  onApply: (result: string) => void;
}

export function VariableInputModal({
  open,
  onOpenChange,
  template,
  variables,
  onApply,
}: VariableInputModalProps) {
  const initial = useMemo(() => {
    const obj: Record<string, string> = {};
    for (const v of variables) obj[v.name] = v.defaultValue || "";
    return obj;
  }, [variables]);

  const [values, setValues] = useState<Record<string, string>>(initial);

  useEffect(() => {
    if (!open) return;
    setValues(initial);
  }, [open, initial]);

  const apply = () => {
    onApply(substituteVariables(template, values));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Fill prompt variables</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {variables.map((v, idx) => (
            <div key={v.name} className="space-y-1">
              <Label htmlFor={`var-${v.name}`}>{v.name}</Label>
              <Input
                id={`var-${v.name}`}
                autoFocus={idx === 0}
                value={values[v.name] ?? ""}
                placeholder={v.placeholder}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>Insert</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


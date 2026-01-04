"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore } from "@/stores/settings-store";
import { MODELS } from "@/lib/constants/models";
import { toast } from "sonner";

export function GeneralSettings() {
  const { defaultModelId: savedDefaultModelId, updateDefaultModel } =
    useSettingsStore();
  const [defaultModelId, setDefaultModelId] = useState(
    savedDefaultModelId || MODELS[0].id
  );

  useEffect(() => {
    if (savedDefaultModelId) {
      setDefaultModelId(savedDefaultModelId);
    }
  }, [savedDefaultModelId]);

  const handleSave = async () => {
    await updateDefaultModel(defaultModelId);
    toast.success("Settings saved successfully");
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">General Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure default behavior and preferences
        </p>
      </div>

      <div className="space-y-4">
        {/* Default Model */}
        <div className="space-y-2">
          <Label htmlFor="default-model">Default Model</Label>
          <Select value={defaultModelId} onValueChange={setDefaultModelId}>
            <SelectTrigger id="default-model">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name} ({model.provider})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            This model will be used when creating new chats
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
}

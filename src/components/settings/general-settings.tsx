"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { GraduationCap } from "lucide-react";
import { BackgroundModelsCard } from "./background-models-card";
import { ModelSelector } from "@/components/model-picker/model-selector";
import { useAvailableModels } from "@/hooks/use-available-models";

export function GeneralSettings() {
  const router = useRouter();
  const {
    defaultModelId: savedDefaultModelId,
    defaultProviderId: savedDefaultProviderId,
    defaultModelIdsByProvider: savedDefaultModelIdsByProvider,
    updateDefaultChatDefaults,
  } = useSettingsStore();

  const [defaultProviderId, setDefaultProviderId] = useState(
    savedDefaultProviderId || "openrouter"
  );
  const [defaultModelIdsByProvider, setDefaultModelIdsByProvider] = useState<
    Record<string, string>
  >(() => savedDefaultModelIdsByProvider || {});

  // Use centralized hook for providers and models
  const { providers, models: providerFilteredModels, getModelsForProvider } = useAvailableModels({
    providerId: defaultProviderId,
  });

  useEffect(() => {
    if (savedDefaultProviderId) setDefaultProviderId(savedDefaultProviderId);
    setDefaultModelIdsByProvider(savedDefaultModelIdsByProvider || {});
  }, [savedDefaultProviderId, savedDefaultModelIdsByProvider]);

  const defaultModelId =
    defaultModelIdsByProvider[defaultProviderId] ||
    (savedDefaultProviderId === defaultProviderId ? savedDefaultModelId : undefined) ||
    savedDefaultModelId ||
    MODELS[0].id;

  // If the currently selected model isn't available for this provider, fall back to the first.
  useEffect(() => {
    if (providerFilteredModels.length === 0) return;
    const exists = providerFilteredModels.some((m) => m.id === defaultModelId);
    if (exists) return;
    setDefaultModelIdsByProvider((prev) => ({
      ...prev,
      [defaultProviderId]: providerFilteredModels[0]!.id,
    }));
  }, [defaultModelId, defaultProviderId, providerFilteredModels]);

  const handleSave = async () => {
    const nextDefaultModelId =
      defaultModelIdsByProvider[defaultProviderId] || defaultModelId;
    const nextMap = {
      ...defaultModelIdsByProvider,
      [defaultProviderId]: nextDefaultModelId,
    };

    await updateDefaultChatDefaults({
      defaultProviderId,
      defaultModelId: nextDefaultModelId,
      defaultModelIdsByProvider: nextMap,
    });

    toast.success("Settings saved successfully");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-medium">General Settings</h3>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Configure default behavior and preferences
        </p>
      </div>

      <div className="space-y-3 sm:space-y-4">
        {/* Default Provider */}
        <div className="space-y-2">
          <Label htmlFor="default-provider">Default Provider</Label>
          <Select value={defaultProviderId} onValueChange={setDefaultProviderId}>
            <SelectTrigger id="default-provider">
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            New chats will prefer this provider when possible
          </p>
        </div>

        {/* Default Model (per provider) */}
        <div className="space-y-2">
          <Label>Default Model</Label>
          <ModelSelector
            value={defaultModelId}
            onValueChange={(nextModelId) =>
              setDefaultModelIdsByProvider((prev) => ({
                ...prev,
                [defaultProviderId]: nextModelId,
              }))
            }
            providerId={defaultProviderId}
            placeholder="Search and select a model..."
          />
          <p className="text-xs text-muted-foreground">
            Each provider keeps its own default model selection
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </div>

      {/* Background Models */}
      <div className="border-t pt-6">
        <BackgroundModelsCard />
      </div>

      {/* Onboarding Tour */}
      <div className="space-y-4 border-t pt-6">
        <div>
          <h3 className="text-lg font-medium">Onboarding</h3>
          <p className="text-sm text-muted-foreground">
            Revisit the feature tour to learn about all of Lumina&apos;s capabilities
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push("/onboarding")}
          className="gap-2"
        >
          <GraduationCap className="h-4 w-4" />
          Take Feature Tour
        </Button>
      </div>
    </div>
  );
}

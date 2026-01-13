"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useModelsStore } from "@/stores/models-store";
import { toast } from "sonner";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { PROVIDERS, isCustomOpenAIProvider, resolveProvider } from "@/lib/providers";
import { GraduationCap, Eye, Brain, Wrench } from "lucide-react";
import { BackgroundModelsCard } from "./background-models-card";
import { getModelCapabilities } from "@/lib/constants/model-capabilities";
import { formatModelCost } from "@/components/model-picker/model-item";

export function GeneralSettings() {
  const router = useRouter();
  const {
    defaultModelId: savedDefaultModelId,
    defaultProviderId: savedDefaultProviderId,
    defaultModelIdsByProvider: savedDefaultModelIdsByProvider,
    updateDefaultChatDefaults,
  } = useSettingsStore();
  const { keys } = useApiKeysStore();
  const { models, loadModels } = useModelsStore();
  const [defaultProviderId, setDefaultProviderId] = useState(
    savedDefaultProviderId || "openrouter"
  );
  const [defaultModelIdsByProvider, setDefaultModelIdsByProvider] = useState<
    Record<string, string>
  >(() => savedDefaultModelIdsByProvider || {});

  useEffect(() => {
    if (savedDefaultProviderId) setDefaultProviderId(savedDefaultProviderId);
    setDefaultModelIdsByProvider(savedDefaultModelIdsByProvider || {});
  }, [savedDefaultProviderId, savedDefaultModelIdsByProvider]);

  useEffect(() => {
    loadModels().catch(() => { });
  }, [loadModels]);

  const providerOptions = useMemo(() => {
    const knownProviderIds = PROVIDERS.map((p) => p.id);
    const keyProviderIds = keys.map((k) => k.provider);
    const ids = Array.from(new Set([...knownProviderIds, ...keyProviderIds]));

    const options = ids
      .map((id) => {
        if (isCustomOpenAIProvider(id)) {
          const key = keys.find((k) => k.provider === id);
          return { id, name: key?.label || "Custom (OpenAI-compatible)" };
        }

        const resolved = resolveProvider(id);
        if (resolved) return { id: resolved.id, name: resolved.name };

        return { id, name: id };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // Keep OpenRouter at the top if present.
    const openrouterIndex = options.findIndex((o) => o.id === "openrouter");
    if (openrouterIndex > 0) {
      const [openrouter] = options.splice(openrouterIndex, 1);
      options.unshift(openrouter);
    }

    return options;
  }, [keys]);

  const allModels = models.length > 0 ? models : MODELS;

  const providerFilteredModels = useMemo(() => {
    if (defaultProviderId === "openrouter" || isCustomOpenAIProvider(defaultProviderId)) {
      return allModels;
    }
    return allModels.filter((m) => m.id.startsWith(`${defaultProviderId}/`));
  }, [allModels, defaultProviderId]);

  const defaultModelId =
    defaultModelIdsByProvider[defaultProviderId] ||
    (savedDefaultProviderId === defaultProviderId ? savedDefaultModelId : undefined) ||
    savedDefaultModelId ||
    MODELS[0].id;

  const selectedModel = providerFilteredModels.find((m) => m.id === defaultModelId);

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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">General Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure default behavior and preferences
        </p>
      </div>

      <div className="space-y-4">
        {/* Default Provider */}
        <div className="space-y-2">
          <Label htmlFor="default-provider">Default Provider</Label>
          <Select value={defaultProviderId} onValueChange={setDefaultProviderId}>
            <SelectTrigger id="default-provider">
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              {providerOptions.map((provider) => (
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
          <Select
            value={defaultModelId}
            onValueChange={(nextModelId) =>
              setDefaultModelIdsByProvider((prev) => ({
                ...prev,
                [defaultProviderId]: nextModelId,
              }))
            }
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Select a model">
                {selectedModel ? (
                  <div className="flex items-center gap-2">
                    <span className="truncate">{selectedModel.name}</span>
                    {(() => {
                      const caps = getModelCapabilities(selectedModel.id);
                      return (
                        <div className="flex items-center gap-0.5">
                          {caps.supportsVision && <Eye className="h-3 w-3 text-sky-500" />}
                          {caps.supportsReasoning && <Brain className="h-3 w-3 text-purple-500" />}
                          {caps.supportsTools && <Wrench className="h-3 w-3 text-amber-500" />}
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {providerFilteredModels.slice(0, 50).map((m) => {
                const capabilities = getModelCapabilities(m.id);
                const costDisplay = formatModelCost(m.inputCost, m.outputCost);
                const isFree = costDisplay === "Free";
                return (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2 w-full">
                      <span className="truncate">{m.name}</span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {capabilities.supportsVision && <Eye className="h-3 w-3 text-sky-500" />}
                        {capabilities.supportsReasoning && <Brain className="h-3 w-3 text-purple-500" />}
                        {capabilities.supportsTools && <Wrench className="h-3 w-3 text-amber-500" />}
                      </div>
                      <span className={isFree ? "text-green-500 text-xs" : "text-muted-foreground text-xs"}>
                        {costDisplay}
                      </span>
                      {(defaultProviderId === "openrouter" || isCustomOpenAIProvider(defaultProviderId)) && (
                        <span className="text-muted-foreground/70 text-xs">{m.provider}</span>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
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

import { DEFAULT_MODEL } from "@/lib/constants/models";
import type { UserSettings } from "@/lib/db/schema";

export function getDefaultChatConfig(settings?: Partial<UserSettings> | null) {
  const providerId = settings?.defaultProviderId;
  const modelIdFromProvider =
    providerId ? settings?.defaultModelIdsByProvider?.[providerId] : undefined;
  const modelId = modelIdFromProvider || settings?.defaultModelId || DEFAULT_MODEL.id;

  return { providerId, modelId };
}


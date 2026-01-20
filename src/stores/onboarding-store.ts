import { create } from "zustand";

interface OnboardingState {
  currentStep: number; // 0-3
  useCase: string | null;
  providerId: string | null;
  firstChatId: string | null;

  // Actions
  setStep: (step: number) => void;
  setUseCase: (useCase: string) => void;
  setProvider: (providerId: string) => void;
  setFirstChatId: (chatId: string) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  currentStep: 0,
  useCase: null,
  providerId: null,
  firstChatId: null,

  setStep: (step) => set({ currentStep: step }),
  setUseCase: (useCase) => set({ useCase }),
  setProvider: (providerId) => set({ providerId }),
  setFirstChatId: (chatId) => set({ firstChatId: chatId }),
  reset: () =>
    set({
      currentStep: 0,
      useCase: null,
      providerId: null,
      firstChatId: null,
    }),
}));

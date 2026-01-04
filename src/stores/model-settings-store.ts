import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ModelSettings {
    temperature: number;
    maxTokens: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
    systemPrompt?: string;
}

export interface ParameterPreset {
    id: string;
    name: string;
    settings: ModelSettings;
}

interface ModelSettingsState {
    // Current active settings
    currentSettings: ModelSettings;
    updateSettings: (settings: Partial<ModelSettings>) => void;

    // Presets
    presets: ParameterPreset[];
    addPreset: (name: string, settings: ModelSettings) => void;
    removePreset: (id: string) => void;
    updatePreset: (id: string, settings: ModelSettings) => void;

    // System Prompt specific
    setSystemPrompt: (prompt: string) => void;
}

const DEFAULT_SETTINGS: ModelSettings = {
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
};

const DEFAULT_PRESETS: ParameterPreset[] = [
    {
        id: 'creative',
        name: 'Creative',
        settings: {
            ...DEFAULT_SETTINGS,
            temperature: 1.2,
            topP: 0.9,
        },
    },
    {
        id: 'precise',
        name: 'Precise',
        settings: {
            ...DEFAULT_SETTINGS,
            temperature: 0.1,
            topP: 0.1,
        },
    },
    {
        id: 'coding',
        name: 'Coding',
        settings: {
            ...DEFAULT_SETTINGS,
            temperature: 0.2, // Low temp for code
            maxTokens: 8192, // More output for code
        },
    },
];

export const useModelSettingsStore = create<ModelSettingsState>()(
    persist(
        (set) => ({
            currentSettings: DEFAULT_SETTINGS,
            presets: DEFAULT_PRESETS,

            updateSettings: (newSettings) =>
                set((state) => ({
                    currentSettings: { ...state.currentSettings, ...newSettings }
                })),

            addPreset: (name, settings) =>
                set((state) => ({
                    presets: [
                        ...state.presets,
                        { id: crypto.randomUUID(), name, settings }
                    ]
                })),

            removePreset: (id) =>
                set((state) => ({
                    presets: state.presets.filter((p) => p.id !== id)
                })),

            updatePreset: (id, settings) =>
                set((state) => ({
                    presets: state.presets.map((p) =>
                        p.id === id ? { ...p, settings } : p
                    )
                })),

            setSystemPrompt: (prompt) =>
                set((state) => ({
                    currentSettings: { ...state.currentSettings, systemPrompt: prompt }
                })),
        }),
        {
            name: 'lumina-model-settings',
        }
    )
);

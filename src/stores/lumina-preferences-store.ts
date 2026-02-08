import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotificationLevel = 'all' | 'important' | 'minimal' | 'none'

interface LuminaPreferencesState {
  notificationLevel: NotificationLevel
  setNotificationLevel: (level: NotificationLevel) => void
}

export const useLuminaPreferencesStore = create<LuminaPreferencesState>()(
  persist(
    (set) => ({
      notificationLevel: 'important', // Default to important only
      setNotificationLevel: (level) => set({ notificationLevel: level }),
    }),
    { name: 'lumina-preferences' }
  )
)

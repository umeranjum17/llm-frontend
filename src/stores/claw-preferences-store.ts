import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotificationLevel = 'all' | 'important' | 'minimal' | 'none'

interface ClawPreferencesState {
  notificationLevel: NotificationLevel
  setNotificationLevel: (level: NotificationLevel) => void
}

export const useClawPreferencesStore = create<ClawPreferencesState>()(
  persist(
    (set) => ({
      notificationLevel: 'important', // Default to important only
      setNotificationLevel: (level) => set({ notificationLevel: level }),
    }),
    { name: 'claw-preferences' }
  )
)

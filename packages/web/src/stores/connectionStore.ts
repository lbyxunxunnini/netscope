import { create } from 'zustand'
import type { SessionStatus } from '@netscope/shared'

interface State extends SessionStatus {
  set: (p: Partial<SessionStatus>) => void
}

export const useConnectionStore = create<State>((set) => ({
  serviceStarted: true,
  vmAttached: false,
  sdkDetected: false,
  lastError: null,
  set: (p) => set((s) => ({ ...s, ...p })),
}))

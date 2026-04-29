import { create } from 'zustand'
import type { CaptureRecord } from '@netscope/shared'

interface State {
  requests: CaptureRecord[]
  selectedId: string | null
  keyword: string
  method: string
  setAll: (items: CaptureRecord[]) => void
  addOrUpdate: (item: CaptureRecord) => void
  clear: () => void
  select: (id: string | null) => void
  setFilters: (keyword: string, method: string) => void
}

export const useRequestStore = create<State>((set) => ({
  requests: [],
  selectedId: null,
  keyword: '',
  method: '',
  setAll: (items) => set({ requests: items }),
  addOrUpdate: (item) => set((s) => {
    const idx = s.requests.findIndex((r) => r.requestId === item.requestId)
    if (idx < 0) return { requests: [item, ...s.requests] }
    const next = [...s.requests]
    next[idx] = item
    return { requests: next }
  }),
  clear: () => set({ requests: [], selectedId: null }),
  select: (id) => set({ selectedId: id }),
  setFilters: (keyword, method) => set({ keyword, method }),
}))

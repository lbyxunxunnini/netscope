import { useEffect } from 'react'
import { useConnectionStore } from '@/stores/connectionStore'
import { useRequestStore } from '@/stores/requestStore'

export function useWebSocket() {
  useEffect(() => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'connection_state') useConnectionStore.getState().set(msg.payload)
      if (msg.type === 'request_started' || msg.type === 'request_updated') useRequestStore.getState().addOrUpdate(msg.payload)
      if (msg.type === 'requests_cleared') useRequestStore.getState().clear()
    }

    return () => ws.close()
  }, [])
}

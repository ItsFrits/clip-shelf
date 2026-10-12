import { contextBridge, ipcRenderer } from 'electron'
import { INVOKE_METHODS, SEND_METHODS, type ClipShelfApi } from '../shared/api'

const api: Record<string, unknown> = {}

for (const name of INVOKE_METHODS) {
  api[name] = (...args: unknown[]) => ipcRenderer.invoke('api:' + name, ...args)
}
for (const name of SEND_METHODS) {
  api[name] = (...args: unknown[]) => ipcRenderer.send('api:' + name, ...args)
}
api.on = (event: string, cb: (payload: unknown) => void) => {
  const handler = (_e: unknown, payload: unknown): void => cb(payload)
  ipcRenderer.on('evt:' + event, handler)
  return () => {
    ipcRenderer.removeListener('evt:' + event, handler)
  }
}

contextBridge.exposeInMainWorld('api', api as unknown as ClipShelfApi)

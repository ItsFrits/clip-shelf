import type { ClipShelfApi } from '../shared/api'

declare global {
  interface Window {
    api: ClipShelfApi
  }
}

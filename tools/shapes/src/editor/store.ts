import { initialState, toSnapshot, type Editor, type Intent, type Snapshot, type State } from './model'
import { reduce } from './reduce'

export type { Editor, Snapshot }

export function createEditor(): Editor {
  let state: State = initialState()
  let snapshot: Snapshot = toSnapshot(state)
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const listener of listeners) listener()
  }

  return {
    dispatch(intent: Intent): void {
      const next = reduce(state, intent)
      if (next === state) return
      state = next
      snapshot = toSnapshot(state)
      notify()
    },
    snapshot(): Snapshot {
      return snapshot
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

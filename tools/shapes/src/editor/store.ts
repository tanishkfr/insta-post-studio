import {
  initialState,
  toSnapshot,
  type CameraState,
  type Editor,
  type Intent,
  type Snapshot,
  type State,
} from './model'
import { reduce } from './reduce'
import { parseShapesSource, serializeShapesSource } from './sourceState'

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
    serializeSource(): string {
      return JSON.stringify(serializeShapesSource(state))
    },
    restoreSource(content: string): void {
      // Parse into a complete next state first. A malformed document throws
      // before `state` is assigned, leaving the current scene untouched.
      const next = parseShapesSource(content)
      state = next
      snapshot = toSnapshot(state)
      notify()
    },
    getCamera(): CameraState {
      return state.camera
    },
    setCamera(camera: CameraState): void {
      // Camera orbit/pan/dolly must not rerender the React scene graph on every
      // pointer move. View state is still kept in the editor so the bridge can
      // serialize it and the offscreen renderer can reuse the exact framing.
      state = { ...state, camera }
      snapshot = toSnapshot(state)
    },
  }
}

import { createContext, type MutableRefObject } from "react";

/** `pending` means the session is showing its discard confirmation. */
export type SessionDepartureResult = boolean | "pending";

export interface SessionNavigationHandle {
  requestClose: MutableRefObject<(() => SessionDepartureResult) | null>;
  /** Clears the host's pending destination when the user keeps editing. */
  cancelPending: () => void;
}

// The host requests departure; the active session decides whether it is safe.
export const SessionNavigation = createContext<SessionNavigationHandle | null>(null);

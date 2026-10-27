let fallbackCounter = 0;

/**
 * Opaque IDs for host entities. Uses the platform UUID generator when present
 * and a monotonic fallback for older/insecure contexts.
 */
export function createId(prefix: string): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}_${(fallbackCounter += 1).toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  return `${prefix}_${suffix}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

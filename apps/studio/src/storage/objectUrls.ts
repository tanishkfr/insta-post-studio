export interface ObjectUrlEntry {
  key: string;
  url: string;
  refCount: number;
}

/**
 * Owns browser object URLs for asset previews/downloads. URLs are created once
 * per key and revoked only after every consumer releases them.
 */
export class ObjectUrlRegistry {
  private readonly entries = new Map<string, ObjectUrlEntry>();

  acquire(key: string, blob: Blob): string {
    const existing = this.entries.get(key);
    if (existing) {
      existing.refCount += 1;
      return existing.url;
    }
    const entry: ObjectUrlEntry = {
      key,
      url: URL.createObjectURL(blob),
      refCount: 1,
    };
    this.entries.set(key, entry);
    return entry.url;
  }

  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refCount -= 1;
    if (entry.refCount > 0) return;
    URL.revokeObjectURL(entry.url);
    this.entries.delete(key);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      URL.revokeObjectURL(entry.url);
    }
    this.entries.clear();
  }
}

export interface CachedFile {
  bytes: Uint8Array;
  contentType: string;
  /** Header `Cache-Control` tel que renvoyé par Yodoo (guide §3) — à retransmettre tel quel si ce fichier est reproxifié. */
  cacheControl: string | null;
}

/**
 * Cache LRU borné en octets (pas en nombre d'entrées) — une entrée plus grande que
 * `maxBytes` à elle seule est silencieusement ignorée plutôt que de lever une erreur,
 * ce qui fait que `maxBytes = 0` désactive la mise en cache sans cas particulier à gérer.
 */
export class BoundedFileCache {
  private readonly entries = new Map<string, CachedFile>();
  private usedBytes = 0;

  constructor(private readonly maxBytes: number) {}

  get(key: string): CachedFile | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    // Ré-insertion pour marquer l'entrée comme la plus récemment utilisée.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  set(key: string, entry: CachedFile): void {
    if (entry.bytes.byteLength > this.maxBytes) return;

    const existing = this.entries.get(key);
    if (existing !== undefined) {
      this.usedBytes -= existing.bytes.byteLength;
      this.entries.delete(key);
    }

    while (this.usedBytes + entry.bytes.byteLength > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value as string;
      const oldest = this.entries.get(oldestKey)!;
      this.entries.delete(oldestKey);
      this.usedBytes -= oldest.bytes.byteLength;
    }

    this.entries.set(key, entry);
    this.usedBytes += entry.bytes.byteLength;
  }
}

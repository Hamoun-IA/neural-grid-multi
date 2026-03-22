/**
 * Ring Buffer — métriques temps réel par serveur
 * O(1) push via index circulaire (pas de Array.shift())
 */

export interface MetricEntry {
  ts: number;         // unix timestamp seconds
  cpu: number;        // %
  ram: number;        // %
  agentCount: number;
  agentUp: number;    // agents ACTIVE
}

interface BufferState {
  data: MetricEntry[];
  head: number;   // prochain index d'écriture
  size: number;   // nombre d'entrées valides
}

export class RingBuffer {
  private readonly maxSize: number;
  private readonly buffers = new Map<string, BufferState>();

  constructor(maxSize: number = 3600) {
    this.maxSize = maxSize;
  }

  /** Ajoute une entrée pour un serveur donné (O(1)) */
  push(serverId: string, entry: MetricEntry): void {
    let buf = this.buffers.get(serverId);
    if (!buf) {
      buf = {
        data: new Array<MetricEntry>(this.maxSize),
        head: 0,
        size: 0,
      };
      this.buffers.set(serverId, buf);
    }
    buf.data[buf.head] = entry;
    buf.head = (buf.head + 1) % this.maxSize;
    if (buf.size < this.maxSize) buf.size++;
  }

  /**
   * Retourne les entrées pour un serveur.
   * Si `since` est fourni (unix timestamp secondes), ne retourne que les entrées >= since.
   * Les entrées sont retournées dans l'ordre chronologique (de la plus ancienne à la plus récente).
   */
  get(serverId: string, since?: number): MetricEntry[] {
    const buf = this.buffers.get(serverId);
    if (!buf || buf.size === 0) return [];

    // Reconstituer dans l'ordre chronologique
    const result: MetricEntry[] = [];
    const startIdx = buf.size < this.maxSize
      ? 0
      : buf.head; // le plus ancien est à buf.head quand le buffer est plein

    for (let i = 0; i < buf.size; i++) {
      const idx = (startIdx + i) % this.maxSize;
      const entry = buf.data[idx];
      if (entry !== undefined && (since === undefined || entry.ts >= since)) {
        result.push(entry);
      }
    }
    return result;
  }

  /** Retourne la dernière entrée (la plus récente) ou null */
  getLatest(serverId: string): MetricEntry | null {
    const buf = this.buffers.get(serverId);
    if (!buf || buf.size === 0) return null;
    const latestIdx = (buf.head - 1 + this.maxSize) % this.maxSize;
    return buf.data[latestIdx] ?? null;
  }
}

/** Singleton global — ~1h de métriques à 1 entrée/seconde */
export const metricsBuffer = new RingBuffer(3600);

import { MetadataCollected } from "./types.ts";

export class MetadataHelper {
  private metadata: Record<string, unknown>;

  public readonly itemId: string;
  constructor(itemId?: string) {
    this.metadata = {};
    this.itemId = itemId || crypto.randomUUID();
  }

  add(key: string, value: unknown): void {
    this.metadata[key] = value;
  }
  get(key: string): unknown {
    return this.metadata[key];
  }

  getAll(): Record<string, unknown> {
    return this.metadata as MetadataCollected;
  }

  clear(): void {
    this.metadata = {};
  }
}

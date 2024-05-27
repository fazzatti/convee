import { MetadataCollected } from "./types";

export class MetadataHelper {
  private metadata: Record<string, any>;

  public readonly itemId: string;
  constructor(itemId: string) {
    this.metadata = {};
    this.itemId = itemId;
  }

  add(key: string, value: any): void {
    this.metadata[key] = value;
  }

  get(key: string): any {
    return this.metadata[key];
  }

  getAll(): Record<string, any> {
    return this.metadata as MetadataCollected;
  }
}

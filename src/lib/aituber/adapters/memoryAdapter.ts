import type { MemoryAdapter } from '../types.ts';

export class ExistingCharacterMemoryAdapter implements MemoryAdapter {
  private readonly readSummary: (characterId: string) => string | Promise<string>;

  constructor(readSummary: (characterId: string) => string | Promise<string>) {
    this.readSummary = readSummary;
  }

  async getLongTermSummary(characterId: string): Promise<string> {
    return String(await this.readSummary(characterId)).trim().slice(0, 2000);
  }
}

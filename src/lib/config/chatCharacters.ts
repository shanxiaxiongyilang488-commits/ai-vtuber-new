export const CHAT_CHARACTER_IDS = new Set<string>(['muryi']);

export function isChatCharacter(characterId: string): boolean {
  return CHAT_CHARACTER_IDS.has(characterId.trim().toLowerCase());
}

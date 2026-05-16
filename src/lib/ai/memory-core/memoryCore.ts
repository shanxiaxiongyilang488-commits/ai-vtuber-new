import { loadCharacterMemories, loadSharedMemories } from './longTermMemoryStore';
import { searchMemories, splitSearchResults } from './memoryRetrieval';
import { buildMemorySystemPrompt } from './promptBuilder';
import { trimShortTermMessages } from './shortTermMemory';
import type { BuiltMemoryPrompt, MemoryCoreRequest } from './types';

export function buildMemoryContext(input: {
  baseSystemPrompt: string;
  userInput: string;
  memory?: MemoryCoreRequest;
}): BuiltMemoryPrompt {
  const memory = input.memory;
  if (!memory?.enabled) {
    return {
      systemPrompt: input.baseSystemPrompt,
      debug: {
        injectedMemoryIds: [],
        shortTermCount: 0,
      },
    };
  }

  const characterId = memory.characterId;
  const explicitShared = memory.sharedMemories ?? memory.longTermMemories?.filter((entry) => entry.scope === 'shared');
  const explicitCharacter = memory.characterMemories ?? memory.longTermMemories?.filter((entry) => entry.scope === 'character');
  const sharedMemories = explicitShared ?? loadSharedMemories();
  const characterMemories = explicitCharacter ?? (characterId ? loadCharacterMemories(characterId) : []);
  const searchResults = searchMemories({
    query: input.userInput,
    characterId,
    sharedMemories,
    characterMemories,
    limit: 3,
  });
  const retrieved = splitSearchResults(searchResults);

  return buildMemorySystemPrompt({
    persona: memory.persona,
    baseSystemPrompt: input.baseSystemPrompt,
    debug: memory.debug,
    characterId,
    characterName: memory.characterName,
    userInput: input.userInput,
    shortTermMessages: trimShortTermMessages(memory.shortTermMessages ?? []),
    sharedMemories: retrieved.sharedMemories,
    characterMemories: retrieved.characterMemories,
  });
}

export * from './types';
export * from './shortTermMemory';
export * from './longTermMemoryStore';
export * from './memoryRetrieval';
export * from './promptBuilder';

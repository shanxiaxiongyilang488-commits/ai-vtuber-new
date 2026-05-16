import { createLongTermMemory, loadCharacterMemories, loadSharedMemories, upsertLongTermMemory } from './longTermMemoryStore';
import { searchMemories, splitSearchResults } from './memoryRetrieval';
import { buildMemorySystemPrompt } from './promptBuilder';
import { appendShortTermMessages, createShortTermMessage, loadShortTermMessages, trimShortTermMessages } from './shortTermMemory';
import type { BuiltMemoryPrompt, LongTermMemory, MemoryCoreRecordInput, MemoryCoreRequest, ShortTermMessage } from './types';

function uniqueMemories(memories: LongTermMemory[]): LongTermMemory[] {
  return Array.from(new Map(memories.map((memory) => [memory.id, memory])).values());
}

function mergeShortTermMessages(...groups: ShortTermMessage[][]): ShortTermMessage[] {
  return trimShortTermMessages(groups.flat());
}

function shouldRememberAsLongTerm(text: string): boolean {
  return /(覚えて|記憶して|忘れないで|メモして|remember)/iu.test(text);
}

function stripMemoryCommand(text: string): string {
  return text
    .replace(/^(覚えて|記憶して|忘れないで|メモして|remember)[、,:\s]*/iu, '')
    .replace(/[。.!！\s]+$/u, '')
    .trim();
}

function normalizeMemoryContent(text: string): string {
  const content = stripMemoryCommand(text);
  const owner = 'RootSさん';

  const possessiveMatch = content.match(/^(私|僕|俺|わたし|ぼく|おれ)の(.+?)は(.+?)(です|だ|である)?$/u);
  if (possessiveMatch) {
    return `${owner}の${possessiveMatch[2].trim()}は${possessiveMatch[3].trim()}`;
  }

  const preferenceMatch = content.match(/^(私|僕|俺|わたし|ぼく|おれ)は(.+?)が好き(です|だ)?$/u);
  if (preferenceMatch) {
    return `${owner}は${preferenceMatch[2].trim()}が好き`;
  }

  return content
    .replace(/^(私|僕|俺|わたし|ぼく|おれ)/u, owner)
    .replace(/です$/u, '')
    .trim();
}

function buildMemoryTitle(text: string): string {
  return normalizeMemoryContent(text).replace(/\s+/g, ' ').trim().slice(0, 32) || '会話からの記憶';
}

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
  const sharedMemories = uniqueMemories([...(explicitShared ?? []), ...loadSharedMemories()]);
  const characterMemories = uniqueMemories([...(explicitCharacter ?? []), ...(characterId ? loadCharacterMemories(characterId) : [])]);
  const shortTermMessages = mergeShortTermMessages(loadShortTermMessages(characterId), memory.shortTermMessages ?? []);
  const searchResults = searchMemories({
    query: input.userInput,
    characterId,
    sharedMemories,
    characterMemories,
    limit: 5,
  });
  const retrieved = splitSearchResults(searchResults);

  return buildMemorySystemPrompt({
    persona: memory.persona,
    baseSystemPrompt: input.baseSystemPrompt,
    debug: memory.debug,
    characterId,
    characterName: memory.characterName,
    trust: memory.trust,
    affection: memory.affection,
    userInput: input.userInput,
    shortTermMessages,
    sharedMemories: retrieved.sharedMemories,
    characterMemories: retrieved.characterMemories,
  });
}

export function recordMemoryCoreTurn(input: MemoryCoreRecordInput): void {
  const userInput = input.userInput.trim();
  const assistantReply = input.assistantReply.trim();

  if (userInput || assistantReply) {
    appendShortTermMessages([
      ...(userInput ? [createShortTermMessage('user', userInput, input.characterId)] : []),
      ...(assistantReply ? [createShortTermMessage('assistant', assistantReply, input.characterId)] : []),
    ]);
  }

  const memories = [
    ...(input.longTermMemories ?? []),
    ...(input.sharedMemories ?? []),
    ...(input.characterMemories ?? []),
  ];

  if (userInput && shouldRememberAsLongTerm(userInput)) {
    const content = normalizeMemoryContent(userInput);
    console.log('[memory-core] remember trigger matched:', { userInput, content });

    memories.push(createLongTermMemory({
      scope: 'shared',
      title: buildMemoryTitle(content),
      content,
      tags: ['chat'],
      importance: 4,
      source: 'chat',
    }));
  } else {
    console.log('[memory-core] remember trigger skipped:', { userInput });
  }

  for (const memory of uniqueMemories(memories)) {
    upsertLongTermMemory(memory);
  }
}

export * from './types';
export * from './shortTermMemory';
export * from './longTermMemoryStore';
export * from './memoryRetrieval';
export * from './promptBuilder';

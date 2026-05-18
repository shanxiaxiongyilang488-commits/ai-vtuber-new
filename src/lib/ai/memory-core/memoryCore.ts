import { createLongTermMemory, loadCharacterMemories, loadSharedMemories, saveSharedMemories, upsertLongTermMemory } from './longTermMemoryStore';
import { shouldRemember } from './memoryClassifier';
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

const REMEMBER_TRIGGER_PATTERN = /(覚えておいて|記憶しておいて|メモしておいて|覚えて|記憶して|メモして|忘れないで|remember)/iu;

function findRememberTrigger(text: string): { index: number; trigger: string } | undefined {
  const match = REMEMBER_TRIGGER_PATTERN.exec(text);
  if (!match) return undefined;
  return { index: match.index, trigger: match[0] };
}

function shouldRememberAsLongTerm(text: string): boolean {
  return findRememberTrigger(text) !== undefined;
}

function shouldForgetLongTerm(text: string): boolean {
  return /^忘れて/u.test(text.trim());
}

function stripMemoryCommand(text: string): string {
  const rememberTrigger = findRememberTrigger(text);
  const content = rememberTrigger
    ? text.slice(rememberTrigger.index + rememberTrigger.trigger.length)
    : text;

  return content
    .replace(/^[。、,，.:：\s]+/u, '')
    .replace(/[。.!！\s]+$/u, '')
    .trim();
}

function stripForgetCommand(text: string): string {
  return text
    .replace(/^忘れて[。、,，.:：\s]*/u, '')
    .replace(/^[。、,，.:：\s]+/u, '')
    .replace(/[。.!！\s]+$/u, '')
    .trim();
}

function stripSentenceEnding(text: string): string {
  return text
    .replace(/(です|でした|だよ|だね|だな|だぞ|ですね|である|だ)[。.!！\s]*$/u, '')
    .replace(/[。.!！\s]+$/u, '')
    .trim();
}

function normalizeMemoryContent(text: string): string {
  const content = stripSentenceEnding(stripMemoryCommand(text));

  const possessiveMatch = content.match(/^(私|僕|俺|わたし|ぼく|おれ)の(.+?)は(.+)$/u);
  if (possessiveMatch) {
    return `${possessiveMatch[1]}の${possessiveMatch[2].trim()}は${stripSentenceEnding(possessiveMatch[3])}`;
  }

  const preferenceMatch = content.match(/^(私|僕|俺|わたし|ぼく|おれ)は(.+?)が好き$/u);
  if (preferenceMatch) {
    return `${preferenceMatch[1]}は${preferenceMatch[2].trim()}が好き`;
  }

  return stripSentenceEnding(content);
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

export async function recordMemoryCoreTurn(input: MemoryCoreRecordInput): Promise<void> {
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

  const rememberTriggered = userInput ? shouldRememberAsLongTerm(userInput) : false;
  const shouldAutoRemember = userInput && !rememberTriggered && !shouldForgetLongTerm(userInput)
    ? await shouldRemember(userInput)
    : false;

  if (userInput && shouldForgetLongTerm(userInput)) {
    const content = normalizeMemoryContent(stripForgetCommand(userInput));
    const existingSharedMemories = loadSharedMemories();
    const nextSharedMemories = existingSharedMemories.filter(
      (memory) => memory.title !== content && memory.content !== content
    );
    const deletedCount = existingSharedMemories.length - nextSharedMemories.length;

    saveSharedMemories(nextSharedMemories);
    console.log('[memory-core] forget command processed:', { content, deletedCount });
  } else if (userInput && (rememberTriggered || shouldAutoRemember)) {
    const content = normalizeMemoryContent(userInput);
    console.log('[memory-core] remember trigger matched:', { userInput, content, auto: shouldAutoRemember });

    memories.push(createLongTermMemory({
      scope: 'shared',
      title: content,
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

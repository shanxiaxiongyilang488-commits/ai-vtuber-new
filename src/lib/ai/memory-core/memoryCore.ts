import { createLongTermMemory, loadCharacterMemories, loadSharedMemories, saveCharacterMemories, saveSharedMemories, upsertLongTermMemory } from './longTermMemoryStore';
import { DEFAULT_RECALL_THRESHOLD, searchMemories, splitSearchResults } from './memoryRetrieval';
import { buildMemorySystemPrompt } from './promptBuilder';
import { appendShortTermMessages, createShortTermMessage, loadShortTermMessages, loadTimelineMessages, trimShortTermMessages } from './shortTermMemory';
import { getTimelineForQuery, type TimelineSummary } from '../../../core/timelineCore';
import type { BuiltMemoryPrompt, LongTermMemory, MemoryCoreRecordInput, MemoryCoreRequest, ShortTermMessage } from './types';

function uniqueMemories(memories: LongTermMemory[]): LongTermMemory[] {
  return Array.from(new Map(memories.map((memory) => [memory.id, memory])).values());
}

function mergeShortTermMessages(limit: number | undefined, ...groups: ShortTermMessage[][]): ShortTermMessage[] {
  return trimShortTermMessages(groups.flat(), limit);
}

const RECALL_TERMS = ['今日', '覚えてる', '覚えている', '昨日', '今週', '先週', '今月', '最近', '前回', 'この前', '続き', '前の漫画', '前の画像', '前の設定', '前のYAML', '振り返り', 'まとめ', '何やってた', '何してた', 'ログ', '記憶'];
const GREETING_TERMS = ['おはよう', 'こんにちは', 'こんばんは', 'ただいま', 'おやすみ', '久々だね', 'ひさしぶり', '元気', 'どう？', 'テスト'];
const ASSET_TERMS = ['漫画', '画像', 'YAML', 'yaml', 'キャラ資料', 'REF'];

function recallDecision(text: string, autoRecall = false): { requested: boolean; reason: string } {
  const normalized = text.trim();
  if (GREETING_TERMS.some((term) => normalized === term || normalized.startsWith(`${term}、`) || normalized.startsWith(`${term}。`))) return { requested: false, reason: 'greeting or small-talk: recall suppressed' };
  if (RECALL_TERMS.some((term) => normalized.includes(term))) return { requested: true, reason: 'explicit recall trigger' };
  if (autoRecall) return { requested: false, reason: 'autoRecall is disabled unless an explicit request is present' };
  return { requested: false, reason: 'no explicit recall request' };
}

function isYesterdayRequest(text: string): boolean {
  return text.includes('昨日') && ['何した', 'なにした', '何やった', 'なにやった'].some((term) => text.includes(term));
}

function isAssetRecallRequest(text: string): boolean {
  return ASSET_TERMS.some((term) => text.includes(term));
}

const AMBIGUOUS_MEMORY_PHRASES = ['前回は', '以前は', '以前にも', '最近は', 'いつもの', '久々', '20時間ぶり', '数日前', '翌日', '覚えています', '思い出しました'];

/** Final response guard for providers that ignore the system instruction. */
export function filterUnapprovedMemoryClaims(text: string, recallRequested: boolean): string {
  if (recallRequested) return text;
  return text
    .split(/(?<=[。！？!\n])/u)
    .filter((sentence) => !AMBIGUOUS_MEMORY_PHRASES.some((phrase) => sentence.includes(phrase)))
    .join('')
    .trim();
}

export function isExplicitMemoryRecall(text: string): boolean {
  return recallDecision(text).requested;
}

function isGreetingLog(message: ShortTermMessage): boolean {
  return /^(おはよう|こんにちは|こんばんは|ただいま|おやすみ|久々|ひさしぶり|元気)[！!？?。\s]*$/u.test(message.content.trim());
}

function yesterdayShortTermMemories(characterId?: string): LongTermMemory[] {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' });
  const yesterday = new Date(Date.now() - 86_400_000);
  const yesterdayKey = formatter.format(yesterday);
  return loadTimelineMessages(characterId)
    .filter((message) => formatter.format(new Date(message.timestamp)) === yesterdayKey && !isGreetingLog(message))
    .map((message, index) => ({
      id: `daily-${message.timestamp}-${index}`,
      scope: characterId ? 'character' as const : 'shared' as const,
      characterId,
      title: 'Yesterday chat log',
      content: `${message.role}: ${message.content}`,
      tags: ['daily', 'yesterday'],
      importance: 0.4,
      timestamp: message.timestamp,
      source: 'chat' as const,
      layer: 'dailyMemory' as const,
    }));
}

function timelineMemory(summary: TimelineSummary, characterId?: string): LongTermMemory | undefined {
  if (summary.summary.length === 0) return undefined;
  return {
    id: `timeline-${summary.period}-${summary.dateRange}`,
    scope: characterId ? 'character' : 'shared',
    characterId,
    title: `${summary.period}のタイムライン要約`,
    content: summary.summary.map((item) => `・${item}`).join('\n'),
    tags: ['timeline', summary.period],
    importance: 0.9,
    timestamp: new Date().toISOString(),
    source: 'summary',
    layer: 'dailyMemory',
  };
}

// Questions such as 「覚えてる？」 are recall requests, not save commands.
const REMEMBER_TRIGGER_PATTERN = /(覚えておいて|記憶しておいて|メモしておいて|忘れないで|remember this|save this memory)/iu;

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
  // Character chat is isolated: it never reads LAB's shared long memory.
  const sharedMemories = characterId ? uniqueMemories(explicitShared ?? []) : uniqueMemories([...(explicitShared ?? []), ...loadSharedMemories()]);
  const characterMemories = uniqueMemories([...(explicitCharacter ?? []), ...(characterId ? loadCharacterMemories(characterId) : [])]);
  // Persisted short-term history is intentionally not injected across sessions.
  const shortTermLimit = Math.max(1, Math.min(30, Math.round(memory.contextBudget?.shortTermMessages ?? 30)));
  const retrievedMemoryLimit = Math.max(0, Math.min(10, Math.round(memory.contextBudget?.retrievedMemories ?? 5)));
  const shortTermMessages = mergeShortTermMessages(shortTermLimit, memory.shortTermMessages ?? []);
  const decision = recallDecision(input.userInput, memory.autoRecall === true);
  const threshold = memory.recallThreshold ?? DEFAULT_RECALL_THRESHOLD;
  const timeline = decision.requested ? getTimelineForQuery(input.userInput, loadTimelineMessages(characterId)) : null;
  const selectedTimelineMemory = timeline ? timelineMemory(timeline, characterId) : undefined;
  const yesterdayMemories = decision.requested && isYesterdayRequest(input.userInput)
    ? yesterdayShortTermMemories(characterId)
    : [];
  const searchableShared = [...sharedMemories, ...(characterId ? [] : yesterdayMemories)];
  const searchableCharacter = [...characterMemories, ...(characterId ? yesterdayMemories : [])];
  const searchResults = decision.requested
    ? selectedTimelineMemory
      ? [{ memory: selectedTimelineMemory, score: 100 }]
      : isYesterdayRequest(input.userInput)
      ? yesterdayMemories.map((memory) => ({ memory, score: 100 }))
      : searchMemories({
        query: input.userInput,
        characterId,
        sharedMemories: searchableShared,
        characterMemories: searchableCharacter,
        limit: retrievedMemoryLimit,
        includeAssets: isAssetRecallRequest(input.userInput),
      }).filter((result) => result.memory.layer === 'dailyMemory' || result.memory.importance >= Math.max(0.3, threshold))
    : [];
  const retrieved = splitSearchResults(searchResults);

  const result = buildMemorySystemPrompt({
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
    shortTermLimit,
  });
  result.debug.recall = {
    requested: decision.requested,
    reason: decision.reason,
    entries: decision.requested
      ? [...searchableShared, ...searchableCharacter].map((entry) => {
          const used = searchResults.some((result) => result.memory.id === entry.id);
          const assetBlocked = entry.layer === 'assetMemory' && !isAssetRecallRequest(input.userInput);
          const lowImportance = entry.layer !== 'dailyMemory' && entry.importance < Math.max(0.3, threshold);
          return {
            id: entry.id,
            memoryType: entry.layer ?? 'longMemory',
            source: entry.source,
            importance: entry.importance,
            timestamp: entry.timestamp,
            reason: used ? (isYesterdayRequest(input.userInput) && entry.layer === 'dailyMemory' ? 'yesterday-only chat log selected' : 'explicit recall trigger and relevance matched') : 'candidate evaluated',
            used,
            ...(used ? {} : { skippedReason: assetBlocked ? 'assetMemory requires an explicit asset request' : lowImportance ? `importance below ${Math.max(0.3, threshold)}` : 'not relevant enough for this explicit recall' }),
          };
        }).concat(selectedTimelineMemory ? [{
          id: selectedTimelineMemory.id,
          memoryType: 'dailyMemory' as const,
          source: 'summary' as const,
          importance: selectedTimelineMemory.importance,
          timestamp: selectedTimelineMemory.timestamp,
          reason: `${timeline?.period} timeline summary selected; raw chat logs were not passed to the model`,
          used: true,
        }] : [])
      : [{
          memoryType: characterId ? 'characterMemory' : 'longMemory',
          reason: decision.reason,
          used: false,
          skippedReason: decision.reason,
        }],
  };
  return result;
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

  if (userInput && shouldForgetLongTerm(userInput)) {
    const content = normalizeMemoryContent(stripForgetCommand(userInput));
    const existingMemories = input.characterId ? loadCharacterMemories(input.characterId) : loadSharedMemories();
    const nextMemories = existingMemories.filter(
      (memory) => memory.title !== content && memory.content !== content
    );
    const deletedCount = existingMemories.length - nextMemories.length;

    if (input.characterId) saveCharacterMemories(input.characterId, nextMemories);
    else saveSharedMemories(nextMemories);
    console.log('[memory-core] forget command processed:', { content, deletedCount, characterId: input.characterId });
  } else if (userInput && rememberTriggered) {
    const content = normalizeMemoryContent(userInput);
    console.log('[memory-core] explicit remember trigger matched:', { userInput, content });

    memories.push(createLongTermMemory({
      scope: input.characterId ? 'character' : 'shared',
      title: content,
      content,
      tags: ['chat', 'explicit'],
      importance: 0.8,
      characterId: input.characterId,
      layer: input.characterId ? 'characterMemory' : 'longMemory',
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

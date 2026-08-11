export type MemoryScope = 'shared' | 'character';

/** A memory's role. Assets are deliberately excluded from chat recall. */
export type MemoryLayer = 'sessionMemory' | 'dailyMemory' | 'longMemory' | 'assetMemory' | 'characterMemory';

export type MemorySource = 'manual' | 'chat' | 'summary' | 'import';

export type MemoryRole = 'user' | 'assistant' | 'system';

export type ShortTermMessage = {
  role: MemoryRole;
  content: string;
  timestamp: string;
  characterId?: string;
};

export type LongTermMemory = {
  id: string;
  scope: MemoryScope;
  title: string;
  content: string;
  tags: string[];
  importance: number;
  timestamp: string;
  characterId?: string;
  updatedAt?: string;
  source?: MemorySource;
  layer?: MemoryLayer;
};

export type MemorySearchInput = {
  query: string;
  characterId?: string;
  sharedMemories: LongTermMemory[];
  characterMemories: LongTermMemory[];
  limit?: number;
  includeAssets?: boolean;
};

export type MemorySearchResult = {
  memory: LongTermMemory;
  score: number;
};

export type BuildMemoryPromptInput = {
  persona?: string;
  baseSystemPrompt?: string;
  debug?: boolean;
  characterId?: string;
  characterName?: string;
  trust?: number;
  affection?: number;
  userInput: string;
  shortTermMessages: ShortTermMessage[];
  sharedMemories: LongTermMemory[];
  characterMemories: LongTermMemory[];
  shortTermLimit?: number;
};

export type BuiltMemoryPrompt = {
  systemPrompt: string;
  debug: {
    injectedMemoryIds: string[];
    shortTermCount: number;
    retrievedMemories?: Pick<LongTermMemory, 'id' | 'content' | 'importance' | 'tags' | 'timestamp' | 'layer'>[];
    recall?: {
      requested: boolean;
      reason: string;
      entries: Array<{
        id?: string;
        memoryType: MemoryLayer;
        source?: MemorySource;
        importance?: number;
        reason: string;
        used: boolean;
        skippedReason?: string;
        timestamp?: string;
      }>;
    };
  };
};

export type MemoryCoreRequest = {
  enabled?: boolean;
  /** False by default. Recall only happens after an explicit user request. */
  autoRecall?: boolean;
  recallThreshold?: number;
  debug?: boolean;
  characterId?: string;
  characterName?: string;
  persona?: string;
  trust?: number;
  affection?: number;
  shortTermMessages?: ShortTermMessage[];
  longTermMemories?: LongTermMemory[];
  sharedMemories?: LongTermMemory[];
  characterMemories?: LongTermMemory[];
  /** Optional per-turn limits supplied by Reflection Router. */
  contextBudget?: {
    shortTermMessages?: number;
    retrievedMemories?: number;
  };
};

export type MemoryCoreRecordInput = {
  characterId?: string;
  userInput: string;
  assistantReply: string;
  longTermMemories?: LongTermMemory[];
  sharedMemories?: LongTermMemory[];
  characterMemories?: LongTermMemory[];
};

export type InternalEventSource = 'chat' | 'vision' | 'idea' | 'yaml' | 'manga';

export type InternalEvent = {
  id: string;
  participants: string[];
  topic: string;
  summary: string;
  source: InternalEventSource;
  emotion?: string;
  rawPreview?: string;
  timestamp: string;
};

export type InternalEventContext = Partial<
  Pick<InternalEvent, 'participants' | 'topic' | 'summary' | 'source' | 'emotion' | 'rawPreview'>
>;

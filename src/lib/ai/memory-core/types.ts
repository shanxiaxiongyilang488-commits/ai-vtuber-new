export type MemoryScope = 'shared' | 'character';

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
};

export type MemorySearchInput = {
  query: string;
  characterId?: string;
  sharedMemories: LongTermMemory[];
  characterMemories: LongTermMemory[];
  limit?: number;
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
  userInput: string;
  shortTermMessages: ShortTermMessage[];
  sharedMemories: LongTermMemory[];
  characterMemories: LongTermMemory[];
};

export type BuiltMemoryPrompt = {
  systemPrompt: string;
  debug: {
    injectedMemoryIds: string[];
    shortTermCount: number;
  };
};

export type MemoryCoreRequest = {
  enabled?: boolean;
  debug?: boolean;
  characterId?: string;
  characterName?: string;
  persona?: string;
  shortTermMessages?: ShortTermMessage[];
  longTermMemories?: LongTermMemory[];
  sharedMemories?: LongTermMemory[];
  characterMemories?: LongTermMemory[];
};

export type MemoryCoreRecordInput = {
  characterId?: string;
  userInput: string;
  assistantReply: string;
  longTermMemories?: LongTermMemory[];
  sharedMemories?: LongTermMemory[];
  characterMemories?: LongTermMemory[];
};

export type MemoryReviewMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp?: string;
};

export type MemoryRecord = {
  id?: string;
  title?: string;
  content?: string;
  summary?: string;
  tags?: string[];
  importance?: number;
  timestamp?: string;
};

export type MemoryReviewCandidate = {
  title: string;
  summary: string;
  reason: string;
  importance: number;
  tags: string[];
	/** Required for technical claims; must point to real log/metadata supplied with the review. */
	evidenceRefs?: string[];
};

export type MemoryReviewTechnicalEvidence = {
	id: string;
	kind: 'model' | 'api' | 'provider' | 'system';
	key: string;
	value: string;
	source: string;
};

export type MemoryReviewCost = {
  provider: 'gemini';
  model: string;
  inputChars: number;
  outputChars: number;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimated: true;
};

export type MemoryReviewRequest = {
  characterId: string;
  conversation: MemoryReviewMessage[];
  currentMemory?: MemoryRecord[];
  battery?: number;
  emotion?: string;
  mindState?: string;
	technicalEvidence?: MemoryReviewTechnicalEvidence[];
};

export type MemoryReviewResponse = {
  summary: string;
  reflectionComment?: string;
  importance: number;
  candidates: MemoryReviewCandidate[];
	technicalEvidence?: MemoryReviewTechnicalEvidence[];
  cost?: MemoryReviewCost;
  timestamp: string;
};

export type SavedMemoryReviewRecord = {
  id: string;
  characterId: string;
  title: string;
  summary: string;
  reason?: string;
  importance: number;
  tags: string[];
  source: 'memory-review';
  createdAt: string;
};

export type MemoryReviewSaveRequest = {
  characterId: string;
  source: 'memory-review';
  candidates: MemoryReviewCandidate[];
  summary?: string;
  reflectionComment?: string;
	technicalEvidence?: MemoryReviewTechnicalEvidence[];
};

export type MemoryReviewSaveResponse = {
  ok: boolean;
  savedCount: number;
  saved: SavedMemoryReviewRecord[];
  comment?: string;
  timestamp: string;
};

export type CharacterMemorySearchHit = {
  id: string;
  title: string;
  summary: string;
  relevance: number;
  createdAt: string;
  tags: string[];
};

export type CharacterMemorySearchRequest = {
  characterId: string;
  query: string;
  limit?: number;
};

export type CharacterMemorySearchResponse = {
  memories: CharacterMemorySearchHit[];
};

export type RelationshipData = {
  items?: RelationshipItem[];
};

export type RelationshipItem = {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  reason?: string;
  updatedAt: string;
};

export type RelationshipUpdate = {
  category: string;
  key: string;
  value: string;
  confidence: number;
  reason: string;
};

export type RelationshipReviewRequest = {
  characterId: string;
  conversation: MemoryReviewMessage[];
  currentRelationship?: RelationshipData;
};

export type RelationshipReviewResponse = {
  summary: string;
  updates: RelationshipUpdate[];
  cost?: MemoryReviewCost;
  timestamp: string;
};

export type RelationshipSaveRequest = {
  characterId: string;
  source: 'relationship-review';
  updates: RelationshipUpdate[];
  summary?: string;
};

export type RelationshipSaveResponse = {
  ok: boolean;
  savedCount: number;
  saved: RelationshipItem[];
  comment?: string;
  timestamp: string;
};

export type RelationshipSearchHit = {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  relevance: number;
  updatedAt: string;
};

export type RelationshipSearchRequest = {
  characterId: string;
  query: string;
  limit?: number;
};

export type RelationshipSearchResponse = {
  relationships: RelationshipSearchHit[];
};

export type EmotionType =
  | 'happy'
  | 'thinking'
  | 'excited'
  | 'curious'
  | 'sleepy'
  | 'calm'
  | 'worried'
  | 'sad';

export type BrainEmotionState = {
  id: string;
  emotion: EmotionType;
  reason: string;
  intensity: number;
  confidence: number;
  createdAt: string;
};

export type EmotionBrain = {
  current: BrainEmotionState | null;
  history: BrainEmotionState[];
};

export type EmotionReviewRequest = {
  characterId: string;
  conversation: MemoryReviewMessage[];
  currentEmotion?: BrainEmotionState | null;
  recentMemories?: MemoryRecord[];
};

export type EmotionReviewResponse = {
  emotion: EmotionType;
  reason: string;
  intensity: number;
  confidence: number;
  cost?: MemoryReviewCost;
  timestamp: string;
};

export type EmotionSaveRequest = {
  characterId: string;
  source: 'emotion-review';
  emotion: EmotionType;
  reason: string;
  intensity: number;
  confidence: number;
};

export type EmotionSaveResponse = {
  ok: boolean;
  saved: BrainEmotionState;
  emotion: EmotionBrain;
  comment?: string;
  timestamp: string;
};

export type EmotionSearchResponse = {
  emotion: EmotionBrain;
};

export type CharacterState = 'Morning' | 'Active' | 'Thinking' | 'Sleeping';

export type RoutineLogEntry = {
  id: string;
  type: 'morning' | 'state' | 'night';
  state: CharacterState;
  summary: string;
  createdAt: string;
};

export type RoutineBrain = {
  currentState: CharacterState;
  todaySummary: string;
  todayGoal: string;
  morningGreeting: string;
  lastSleepTime?: string;
  updatedAt: string;
  log: RoutineLogEntry[];
};

export type RoutineMorningResponse = {
  ok: boolean;
  greeting: string;
  todaySummary: string;
  todayGoal: string;
  routine: RoutineBrain;
  cost?: MemoryReviewCost;
  timestamp: string;
};

export type RoutineNightResponse = {
  ok: boolean;
  sleepComment: string;
  todaySummary: string;
  currentGoal: string;
  routine: RoutineBrain;
  experience?: Experience;
  cost?: MemoryReviewCost;
  timestamp: string;
};

export type RoutineStateResponse = {
  ok: boolean;
  routine: RoutineBrain;
  timestamp: string;
};

export type Experience = {
  id: string;
  createdAt: string;
  memoryIds: string[];
  relationshipIds: string[];
  emotionIds: string[];
  routineId?: string;
  goalIds?: string[];
  importance: number;
  summary: string;
};

export type ExperienceSearchHit = Experience & {
  relevance: number;
};

export type ExperienceSearchResponse = {
  experiences: ExperienceSearchHit[];
  graph: {
    memory: string[];
    relationship: string[];
    emotion: string[];
    routine: string[];
    experience: string[];
  };
};

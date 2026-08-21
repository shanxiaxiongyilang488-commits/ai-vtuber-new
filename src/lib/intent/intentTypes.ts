export type AppSurface = 'character-memory' | 'lab' | 'studio' | 'voice-chat' | 'unknown';

export type CommonIntent =
  | 'CHAT'
  | 'IMAGE'
  | 'VIDEO'
  | 'VIDEO_EDIT'
  | 'MANGA'
  | 'STORYCARD'
  | 'VOICE'
  | 'YAML'
  | 'VIDEO_ANALYSIS'
  | 'IMAGE_ANALYSIS'
  | 'MEMORY'
  | 'UNKNOWN';

export type IntentDecision = {
  intent: CommonIntent;
  confidence: number;
  reason: string;
  cost?: {
    provider: string;
    model: string;
    inputChars: number;
    outputChars: number;
    latencyMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimated: boolean;
  };
  slots?: Record<string, unknown>;
};

export type IntentRouterMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
};

export type IntentRouterInput = {
  surface: AppSurface;
  userMessage: string;
  recentMessages?: IntentRouterMessage[];
  availableIntents?: CommonIntent[];
  state?: Record<string, unknown>;
  characterId?: string;
  characterName?: string;
};

export type IntentDecisionAction =
  | 'auto_execute'
  | 'confirm_required'
  | 'fallback_chat'
  | 'user_confirmed'
  | 'user_rejected'
  | 'error';

export type IntentDecisionLog = {
  id: string;
  timestamp: string;
  surface: AppSurface;
  characterId?: string;
  characterName?: string;
  userText: string;
  intent: CommonIntent;
  confidence: number;
  reason: string;
  cost?: IntentDecision['cost'];
  action: IntentDecisionAction;
};

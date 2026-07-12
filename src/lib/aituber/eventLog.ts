import type { AITuberEvent, AITuberEventType, ConversationOrigin } from './types.ts';

const STORAGE_KEY = 'ai-vtuber:aituber-events:v1';
const MAX_EVENTS = 500;

function safeMetadata(metadata?: Record<string, unknown>): AITuberEvent['metadata'] {
  if (!metadata) return undefined;
  const result: NonNullable<AITuberEvent['metadata']> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/prompt|secret|token|key|base64|blob|dataurl/i.test(key)) continue;
    if (typeof value === 'string') result[key] = value.slice(0, 240);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) result[key] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

export function readAITuberEvents(): AITuberEvent[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) : [];
  } catch {
    return [];
  }
}

export function logAITuberEvent(
  type: AITuberEventType,
  characterId: string,
  options: { origin?: ConversationOrigin; metadata?: Record<string, unknown> } = {},
): AITuberEvent {
  const event: AITuberEvent = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    type,
    characterId,
    timestamp: new Date().toISOString(),
    ...(options.origin ? { origin: options.origin } : {}),
    ...(safeMetadata(options.metadata) ? { metadata: safeMetadata(options.metadata) } : {}),
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...readAITuberEvents(), event].slice(-MAX_EVENTS)));
    } catch {
      // Logging must never interrupt chat.
    }
  }
  return event;
}


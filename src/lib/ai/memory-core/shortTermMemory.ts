import type { MemoryRole, ShortTermMessage } from './types';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SHORT_TERM_LIMIT = 30;
export const TIMELINE_LOG_LIMIT = 500;
const MEMORY_DIR = join(process.cwd(), 'data', 'memory');
const SHORT_TERM_FILE = join(MEMORY_DIR, 'short-term.json');

function ensureMemoryDir(): void {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function normalizeShortTermMessage(message: ShortTermMessage): ShortTermMessage {
  return {
    role: message.role,
    content: message.content,
    characterId: message.characterId,
    timestamp: message.timestamp || new Date().toISOString(),
  };
}

export function createShortTermMessage(
  role: MemoryRole,
  content: string,
  characterId?: string,
  timestamp = new Date().toISOString()
): ShortTermMessage {
  return { role, content, characterId, timestamp };
}

export function trimShortTermMessages(
  messages: ShortTermMessage[],
  limit = SHORT_TERM_LIMIT
): ShortTermMessage[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-limit);
}

export function loadShortTermMessages(characterId?: string): ShortTermMessage[] {
  return loadTimelineMessages(characterId).slice(-SHORT_TERM_LIMIT);
}

/** Timestamped archive for Timeline Core. It is never injected as session context. */
export function loadTimelineMessages(characterId?: string): ShortTermMessage[] {
  try {
    if (!existsSync(SHORT_TERM_FILE)) return [];
    const parsed = JSON.parse(readFileSync(SHORT_TERM_FILE, 'utf-8')) as ShortTermMessage[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeShortTermMessage)
      .filter((message) => !characterId || message.characterId === characterId)
      .filter((message) => message.content.trim().length > 0)
      .slice(-TIMELINE_LOG_LIMIT);
  } catch {
    return [];
  }
}

export function saveShortTermMessages(messages: ShortTermMessage[]): ShortTermMessage[] {
  const next = messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-TIMELINE_LOG_LIMIT)
    .map(normalizeShortTermMessage);
  ensureMemoryDir();
  writeFileSync(SHORT_TERM_FILE, JSON.stringify(next, null, 2));
  return next;
}

export function appendShortTermMessages(messages: ShortTermMessage[]): ShortTermMessage[] {
  return saveShortTermMessages([...loadTimelineMessages(), ...messages]);
}

export function formatShortTermMessages(messages: ShortTermMessage[]): string {
  const recent = trimShortTermMessages(messages);
  if (recent.length === 0) return 'まだありません。';

  return recent
    .map((message) => {
      const label =
        message.role === 'user'
          ? 'User'
          : message.role === 'assistant'
            ? 'Assistant'
            : 'System';
      return `${label}: ${message.content.trim()}`;
    })
    .join('\n');
}

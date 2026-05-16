import type { MemoryRole, ShortTermMessage } from './types';

export const SHORT_TERM_LIMIT = 30;

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

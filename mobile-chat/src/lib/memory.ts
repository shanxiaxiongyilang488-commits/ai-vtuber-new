import type { ChatMessage } from './chat/types';

export const SHORT_TERM_MEMORY_LIMIT = 50;

export function getShortTermMemory(messages: ChatMessage[]): ChatMessage[] {
	return messages.slice(-SHORT_TERM_MEMORY_LIMIT);
}

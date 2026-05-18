import { json } from '@sveltejs/kit';
import { loadSharedMemories } from '$lib/ai/memory-core/longTermMemoryStore';

export function GET() {
  const memories = loadSharedMemories().map((memory) => ({
    id: memory.id,
    content: memory.content,
    importance: memory.importance,
    tags: memory.tags,
    createdAt: memory.timestamp,
  }));

  return json({ memories });
}

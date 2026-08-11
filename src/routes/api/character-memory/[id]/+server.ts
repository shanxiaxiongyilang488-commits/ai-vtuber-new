import { json, type RequestHandler } from '@sveltejs/kit';
import { getMemoryCharacter } from '$lib/server/characterMemory';
import { getVisualMemoryRecord } from '$lib/server/visualMemoryStore';

export const GET: RequestHandler = async ({ params }) => {
  try {
    if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
    const entry = getMemoryCharacter(params.id);
    const visualMemory = getVisualMemoryRecord(params.id, entry.visualMemory).visualMemory;
    return json({
      character: {
        id: entry.id,
        name: entry.name,
        role: entry.role,
        description: entry.description,
        visualMemory,
      },
      messages: entry.messages,
      memory: entry.memory,
      memoryV2: entry.memoryV2,
      reviewMemory: entry.reviewMemory,
      relationships: entry.relationships,
      emotion: entry.emotion,
      routine: entry.routine,
      experiences: entry.experiences,
      updatedAt: entry.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

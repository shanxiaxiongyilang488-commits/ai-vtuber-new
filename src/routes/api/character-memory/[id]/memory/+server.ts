import { json, type RequestHandler } from '@sveltejs/kit';
import { applySelfTalkMemory, saveMemoryFields, saveMemoryV2 } from '$lib/server/characterMemory';

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
    const body = await request.json();
    const entry = body?.selfTalk
      ? applySelfTalkMemory(params.id, body.selfTalk)
      : body?.memoryV2
      ? saveMemoryV2(params.id, body.memoryV2, { personaManual: body.personaManual === true })
      : saveMemoryFields(params.id, {
        personality: Array.isArray(body?.personality) ? body.personality : [],
        speechStyle: Array.isArray(body?.speechStyle) ? body.speechStyle : [],
        likes: Array.isArray(body?.likes) ? body.likes : [],
        dislikes: Array.isArray(body?.dislikes) ? body.dislikes : [],
      });
    return json({ memory: entry.memory, memoryV2: entry.memoryV2, updatedAt: entry.updatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

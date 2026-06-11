import { json, type RequestHandler } from '@sveltejs/kit';
import {
  getCharacterMemory,
  saveCharacterMemory,
} from '$lib/server/characterRegistry';

export const GET: RequestHandler = async ({ params }) => {
  try {
    if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
    return json({ memory: getCharacterMemory(params.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
    const body = await request.json();
    return json({
      memory: saveCharacterMemory(params.id, {
        personality: Array.isArray(body?.personality) ? body.personality : [],
        speechStyle: Array.isArray(body?.speechStyle) ? body.speechStyle : [],
        likes: Array.isArray(body?.likes) ? body.likes : [],
        dislikes: Array.isArray(body?.dislikes) ? body.dislikes : [],
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

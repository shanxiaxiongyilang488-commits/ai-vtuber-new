import { json, type RequestHandler } from '@sveltejs/kit';
import { loadImageDesignSkillContext } from '$lib/server/designSkills';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const characterId = typeof body?.characterId === 'string' ? body.characterId.trim() : '';
    if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });
    return json(loadImageDesignSkillContext(characterId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

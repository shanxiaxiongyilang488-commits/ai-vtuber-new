import { json, type RequestHandler } from '@sveltejs/kit';
import { getCharacterStoryContexts } from '$lib/server/characterRegistry';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const characterIds = Array.isArray(body?.characterIds)
      ? body.characterIds.map(String)
      : [];
    const query = typeof body?.query === 'string' ? body.query : '';
    return json({
      characters: getCharacterStoryContexts(characterIds, query),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

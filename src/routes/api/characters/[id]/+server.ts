import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteCharacter, getCharacter } from '$lib/server/characterRegistry';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const character = getCharacter(params.id);
    if (!character) return json({ message: 'character not found' }, { status: 404 });
    return json({ character });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const deleted = deleteCharacter(params.id);
    if (!deleted) return json({ message: 'character not found' }, { status: 404 });
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

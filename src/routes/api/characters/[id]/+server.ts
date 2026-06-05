import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteCharacter, getCharacter } from '$lib/server/characterRegistry';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'character id is required' }, { status: 400 });
    const character = getCharacter(id);
    if (!character) return json({ message: 'character not found' }, { status: 404 });
    return json({ character });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'character id is required' }, { status: 400 });
    const deleted = deleteCharacter(id);
    if (!deleted) return json({ message: 'character not found' }, { status: 404 });
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

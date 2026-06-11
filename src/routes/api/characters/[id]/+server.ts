import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteCharacter, getCharacter, updateCharacter } from '$lib/server/characterRegistry';

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

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'character id is required' }, { status: 400 });
    const body = await request.json();
    const characterBible = body?.characterBible;
    if (characterBible && (
      typeof characterBible.unitId !== 'string'
      || !characterBible.unitId.trim()
      || !Array.isArray(characterBible.characters)
      || characterBible.characters.length === 0
      || characterBible.characters.some((character: unknown) => {
        if (!character || typeof character !== 'object') return true;
        const value = character as Record<string, unknown>;
        return [
          'id',
          'hairColor',
          'eyeColor',
          'ears',
          'tail',
          'androidParts',
          'outfit',
          'accessories',
          'appearance',
        ]
          .some((key) => typeof value[key] !== 'string' || !String(value[key]).trim());
      })
    )) {
      return json({ message: 'characterBible is invalid' }, { status: 400 });
    }
    const character = updateCharacter(id, {
      ...(typeof body?.name === 'string' ? { name: body.name } : {}),
      ...(typeof body?.role === 'string' ? { role: body.role } : {}),
      ...(typeof body?.description === 'string' ? { description: body.description } : {}),
      ...(characterBible ? { characterBible } : {}),
    });
    return json({ character });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

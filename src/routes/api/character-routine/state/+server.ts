import { json, type RequestHandler } from '@sveltejs/kit';
import { saveRoutineState, type CharacterState } from '$lib/server/characterMemory';

function isState(value: unknown): value is CharacterState {
  return value === 'Morning' || value === 'Active' || value === 'Thinking' || value === 'Sleeping';
}

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
  const state = isState(body.state) ? body.state : null;
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });
  if (!state) return json({ message: 'valid state is required' }, { status: 400 });

  try {
    const { routine } = saveRoutineState(characterId, {
      state,
      type: 'state',
      summary: typeof body.summary === 'string' ? body.summary : `State changed to ${state}`,
    });
    return json({ ok: true, routine, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

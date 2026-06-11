import { json, type RequestHandler } from '@sveltejs/kit';
import {
  appendCharacterChat,
  clearCharacterChat,
  getCharacterChat,
} from '$lib/server/characterRegistry';

export const GET: RequestHandler = async ({ params }) => {
  try {
    if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
    return json({ messages: getCharacterChat(params.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
    const body = await request.json();
    if (
      (body?.role !== 'user' && body?.role !== 'assistant')
      || typeof body?.text !== 'string'
      || !body.text.trim()
    ) {
      return json({ message: 'role and text are required' }, { status: 400 });
    }
    return json({ messages: appendCharacterChat(params.id, { role: body.role, text: body.text }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
    clearCharacterChat(params.id);
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteRef, renameRef } from '$lib/server/refLibrary';

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'ref id is required' }, { status: 400 });
    const body = await request.json();
    if (typeof body?.name !== 'string') {
      return json({ message: 'name is required' }, { status: 400 });
    }
    const item = renameRef(id, body.name);
    return json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'ref not found' ? 404 : 400 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'ref id is required' }, { status: 400 });
    const deleted = deleteRef(id);
    if (!deleted) return json({ message: 'ref not found' }, { status: 404 });
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

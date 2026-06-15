import { json, type RequestHandler } from '@sveltejs/kit';
import { getRefImageDataUrl } from '$lib/server/refLibrary';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'ref id is required' }, { status: 400 });
    const imageDataUrl = getRefImageDataUrl(id);
    if (!imageDataUrl) return json({ message: 'ref image not found' }, { status: 404 });
    return json({ imageDataUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { getRefImageDataUrl } from '$lib/server/refLibrary';

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'ref id is required' }, { status: 400 });
    const imageDataUrl = getRefImageDataUrl(id);
    if (!imageDataUrl) return json({ message: 'ref image not found' }, { status: 404 });
    if (url.searchParams.get('raw') === '1') {
      const match = imageDataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/iu);
      if (!match) return json({ message: 'invalid ref image' }, { status: 500 });
      return new Response(Buffer.from(match[2], 'base64'), {
        headers: { 'content-type': match[1], 'cache-control': 'private, max-age=3600' },
      });
    }
    return json({ imageDataUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

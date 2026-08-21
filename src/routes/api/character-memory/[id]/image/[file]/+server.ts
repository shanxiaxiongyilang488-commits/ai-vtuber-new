import { error, type RequestHandler } from '@sveltejs/kit';
import { deleteMemoryImage, readMemoryImage } from '$lib/server/characterMemory';

export const GET: RequestHandler = async ({ params }) => {
  if (!params.id || !params.file) throw error(400, 'character id and file are required');
  const image = readMemoryImage(params.id, params.file);
  if (!image) throw error(404, 'image not found');
  return new Response(new Uint8Array(image.buffer), {
    headers: {
      'content-type': image.contentType,
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
};

export const DELETE: RequestHandler = async ({ params }) => {
  if (!params.id || !params.file) throw error(400, 'character id and file are required');
  const removed = deleteMemoryImage(params.id, params.file);
  if (!removed) throw error(404, 'image not found');
  return new Response(null, { status: 204 });
};

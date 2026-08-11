import { error } from '@sveltejs/kit';
import { readGeneratedVideo } from '$lib/server/runpodMedia';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const video = await readGeneratedVideo(params.file);
    return new Response(new Uint8Array(video), {
      headers: {
        'content-type': 'video/mp4',
        'content-length': String(video.byteLength),
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    throw error(404, 'Generated video not found.');
  }
};

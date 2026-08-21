import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const SAFE_ID = /^(?:video|scanner)_[a-zA-Z0-9-]+$/;
const SAFE_FRAME = /^frame_\d{3}\.jpg$/;

export async function GET({ params }) {
  if (!SAFE_ID.test(params.videoId) || !SAFE_FRAME.test(params.name)) throw error(400, 'Invalid frame path');
  const file = path.join(process.cwd(), 'data', 'video_frames', params.videoId, params.name);
  try {
    return new Response(await readFile(file), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
  } catch {
    throw error(404, 'Frame not found');
  }
}

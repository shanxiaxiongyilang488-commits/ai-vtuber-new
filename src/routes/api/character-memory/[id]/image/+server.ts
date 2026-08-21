import { json, type RequestHandler } from '@sveltejs/kit';
import { saveMemoryImageFromDataUrl } from '$lib/server/characterMemory';

async function toDataUrl(source: string): Promise<string> {
  const value = source.trim();
  if (value.startsWith('data:')) return value;
  if (!/^https?:\/\//.test(value)) throw new Error('image source must be a data URL or http(s) URL');
  const res = await fetch(value);
  if (!res.ok) throw new Error(`image fetch failed: HTTP ${res.status}`);
  const mime = res.headers.get('content-type')?.split(';')[0] || 'image/png';
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
    const body = await request.json();
    const source = typeof body?.source === 'string'
      ? body.source
      : typeof body?.dataUrl === 'string'
        ? body.dataUrl
        : '';
    if (!source.trim()) return json({ message: 'source is required' }, { status: 400 });
    const dataUrl = await toDataUrl(source);
    const url = saveMemoryImageFromDataUrl(params.id, dataUrl);
    return json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

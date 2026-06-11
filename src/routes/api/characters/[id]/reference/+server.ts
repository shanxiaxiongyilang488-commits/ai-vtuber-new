import { json, type RequestHandler } from '@sveltejs/kit';
import { getCharacterReferenceDataUrl, saveCharacterReferenceImage } from '$lib/server/characterRegistry';

async function requestToDataUrl(request: Request): Promise<string> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const fd = await request.formData();
    const file = fd.get('reference');
    if (!(file instanceof File) || file.size === 0) throw new Error('reference image is required');
    const buffer = Buffer.from(await file.arrayBuffer());
    return `data:${file.type || 'image/png'};base64,${buffer.toString('base64')}`;
  }

  const body = await request.json();
  if (typeof body?.referenceImageDataUrl !== 'string') {
    throw new Error('referenceImageDataUrl is required');
  }
  return body.referenceImageDataUrl;
}

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'character id is required' }, { status: 400 });
    const referenceImageDataUrl = await requestToDataUrl(request);
    const character = saveCharacterReferenceImage(id, referenceImageDataUrl);
    return json({ character });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

export const POST = PUT;

export const GET: RequestHandler = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'character id is required' }, { status: 400 });
    const referenceImageDataUrl = getCharacterReferenceDataUrl(id);
    if (!referenceImageDataUrl) return json({ message: 'reference image not found' }, { status: 404 });
    return json({ referenceImageDataUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

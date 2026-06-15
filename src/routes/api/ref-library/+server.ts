import { json, type RequestHandler } from '@sveltejs/kit';
import { listRefs, saveRef } from '$lib/server/refLibrary';

async function formDataImage(field: FormDataEntryValue | null): Promise<string | undefined> {
  if (!(field instanceof File) || field.size === 0) return undefined;
  const buffer = Buffer.from(await field.arrayBuffer());
  const mime = field.type || 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export const GET: RequestHandler = async () => {
  return json({ items: listRefs() });
};

export const POST: RequestHandler = async ({ request }) => {
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData();
      const imageDataUrl = await formDataImage(fd.get('reference'));
      if (!imageDataUrl) return json({ message: 'reference image is required' }, { status: 400 });
      const item = saveRef({ name: String(fd.get('name') ?? ''), imageDataUrl });
      return json({ item }, { status: 201 });
    }

    const body = await request.json();
    if (typeof body?.imageDataUrl !== 'string') {
      return json({ message: 'imageDataUrl is required' }, { status: 400 });
    }
    const item = saveRef({
      name: typeof body?.name === 'string' ? body.name : '',
      imageDataUrl: body.imageDataUrl,
    });
    return json({ item }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

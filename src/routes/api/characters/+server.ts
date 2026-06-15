import { json, type RequestHandler } from '@sveltejs/kit';
import { listCharacters, registerCharacter, searchCharacters } from '$lib/server/characterRegistry';

async function formDataImage(field: FormDataEntryValue | null): Promise<string | undefined> {
  if (!(field instanceof File) || field.size === 0) return undefined;
  const buffer = Buffer.from(await field.arrayBuffer());
  const mime = field.type || 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q') ?? '';
  const characters = q.trim() ? searchCharacters(q) : listCharacters();
  return json({ characters });
};

export const POST: RequestHandler = async ({ request }) => {
  const contentType = request.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData();
      const character = registerCharacter({
        id: String(fd.get('id') ?? ''),
        name: String(fd.get('name') ?? ''),
        role: String(fd.get('role') ?? ''),
        description: String(fd.get('description') ?? ''),
        referenceImageDataUrl: await formDataImage(fd.get('reference')),
      });
      return json({ character }, { status: 201 });
    }

    const body = await request.json();
    const character = registerCharacter({
      id: String(body?.id ?? ''),
      name: String(body?.name ?? ''),
      role: String(body?.role ?? ''),
      description: String(body?.description ?? ''),
      referenceImageDataUrl: typeof body?.referenceImageDataUrl === 'string' ? body.referenceImageDataUrl : undefined,
    });
    return json({ character }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

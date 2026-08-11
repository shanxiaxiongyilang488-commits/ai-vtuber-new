import { json, type RequestHandler } from '@sveltejs/kit';
import { getCharacter } from '$lib/server/characterRegistry';
import { analyzeLive2DParts, getLive2DParts, saveLive2DPartAssets, saveLive2DParts } from '$lib/server/live2dPartsStore';
import type { Live2DPartsData } from '$lib/live2dParts';

async function imageFromForm(field: FormDataEntryValue | null): Promise<Live2DPartsData['sourceImage'] | undefined> {
  if (!(field instanceof File) || field.size === 0) return undefined;
  const buffer = Buffer.from(await field.arrayBuffer());
  const mimeType = field.type || 'image/png';
  return {
    fileName: field.name || 'character.png',
    mimeType,
    dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
    uploadedAt: new Date().toISOString(),
  };
}

function requireCharacter(id: string | undefined) {
  if (!id) throw new Error('character id is required');
  const character = getCharacter(id);
  if (!character) throw new Error('character not found');
  return character;
}

export const GET: RequestHandler = async ({ params }) => {
  try {
    const character = requireCharacter(params.id);
    return json({ parts: getLive2DParts(character.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const character = requireCharacter(params.id);
    const fd = await request.formData();
    const sourceImage = await imageFromForm(fd.get('image'));
    const parts = analyzeLive2DParts(character.id, sourceImage);
    return json({ parts }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const character = requireCharacter(params.id);
    const body = await request.json();
    const parts = saveLive2DParts(character.id, body?.parts);
    return json({ parts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const character = requireCharacter(params.id);
    const body = await request.json();
    const crops = Array.isArray(body?.crops)
      ? body.crops.flatMap((crop: unknown): Array<{ fileName: string; dataUrl: string }> => {
        if (!crop || typeof crop !== 'object') return [];
        const value = crop as Record<string, unknown>;
        if (typeof value.fileName !== 'string' || typeof value.dataUrl !== 'string') return [];
        return [{ fileName: value.fileName, dataUrl: value.dataUrl }];
      })
      : [];
    if (crops.length === 0) return json({ message: 'crops are required' }, { status: 400 });
    const savedAssets = saveLive2DPartAssets(character.id, crops);
    const parts = saveLive2DParts(character.id, body?.parts);
    return json({ parts, savedAssets });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

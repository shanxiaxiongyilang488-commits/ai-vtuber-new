import { json, type RequestHandler } from '@sveltejs/kit';
import { chatGrok, GROK_DEFAULT_MODEL } from '$lib/providers/grok';
import { generateOpenAIImage } from '$lib/server/imageProviders/openai';
import type { ImageGenerationInput } from '$lib/server/imageProviders/types';
import {
  getCharacter,
  getCharacterReferenceDataUrl,
  getCharacterSelfImages,
  saveCharacterReferenceImage,
  saveCharacterSelfImage,
  type CharacterSelfImage,
} from '$lib/server/characterRegistry';
import { readSettings } from '$lib/server/settings';

type SelfImageProvider = 'gpt-image-2';

const PROVIDER_LABELS: Record<SelfImageProvider, string> = {
  'gpt-image-2': 'GPT Image 2',
};

function isSelfImageProvider(value: unknown): value is SelfImageProvider {
  return value === 'gpt-image-2';
}

function imageModelForProvider(provider: SelfImageProvider): string {
  void provider;
  return 'gpt-image-2';
}

function promptSystem(): string {
  return [
    'You are the character personality AI preparing an image-generation blueprint.',
    'Do not generate an image yourself. Return only the prompt text for the image generator.',
    'Never refuse the image request or answer that you cannot generate images; your job is to design a safe, usable SELF IMAGE prompt.',
    'The current character reference image is automatically supplied to the image model.',
    'Preserve the original character design, identity, hair style, hair color, core outfit silhouette, and recognizable face.',
    'Allowed changes: expression, glowing parts, maintenance panels, ear antennas, tail cables, HUD display, and pose.',
    'Forbidden changes: turning the character into a different person, changing hairstyle, changing hair color, or major outfit redesign.',
    'If the user asks for a sexy or suggestive variation, keep it stylish, non-explicit, adult-coded, and character-design preserving.',
    'Return a single concise image prompt in Japanese or English. No markdown, no JSON, no commentary.',
  ].join('\n');
}

function promptUser(character: NonNullable<ReturnType<typeof getCharacter>>, userPrompt: string): string {
  const visual = character.characterBible?.characters?.[0];
  return [
    `Character name: ${character.name}`,
    character.role ? `Role: ${character.role}` : '',
    character.description ? `Description: ${character.description}` : '',
    visual ? `Visual facts: hair=${visual.hairColor}; eyes=${visual.eyeColor}; ears=${visual.ears}; tail=${visual.tail}; android_parts=${visual.androidParts}; outfit=${visual.outfit}; accessories=${visual.accessories}; appearance=${visual.appearance}` : '',
    `User request: ${userPrompt}`,
    'Create the final image-generation prompt now.',
  ].filter(Boolean).join('\n');
}

function cleanPrompt(text: string): string {
  return text
    .replace(/^```(?:json|text)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

async function buildImagePrompt(character: NonNullable<ReturnType<typeof getCharacter>>, userPrompt: string): Promise<string> {
  const settings = await readSettings();
  if (!settings.grok.apiKey) throw new Error('Grok API key is not configured');
  const result = await chatGrok({
    apiKey: settings.grok.apiKey,
    baseUrl: settings.grok.baseUrl,
    model: settings.grok.model || GROK_DEFAULT_MODEL,
    systemPrompt: promptSystem(),
    userMessage: promptUser(character, userPrompt),
    temperature: 0.55,
    maxTokens: 900,
  });
  if (!result.ok) throw new Error('Grok API key is not configured');
  const prompt = cleanPrompt(result.text);
  if (!prompt) throw new Error('Grok returned an empty image prompt');
  return prompt;
}

async function generateImage(provider: SelfImageProvider, input: ImageGenerationInput): Promise<string> {
  void provider;
  const images = await generateOpenAIImage(input);
  const imageUrl = images[0]?.url ?? '';
  if (!imageUrl) throw new Error('Image generation returned no image');
  return imageUrl;
}

async function imageUrlToDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) return imageUrl;
  if (!/^https?:\/\//.test(imageUrl)) throw new Error('imageUrl is invalid');
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`image fetch failed (${response.status})`);
  const mime = response.headers.get('content-type')?.split(';')[0] || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export const GET: RequestHandler = async ({ params }) => {
  try {
    if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
    return json({ selfImages: getCharacterSelfImages(params.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'character id is required' }, { status: 400 });
    const character = getCharacter(id);
    if (!character) return json({ message: 'character not found' }, { status: 404 });

    const body = await request.json();
    const action = String(body?.action ?? 'generate');

    if (action === 'save') {
      const image = body?.image as Partial<CharacterSelfImage> | undefined;
      const selfImages = saveCharacterSelfImage(id, {
        id: typeof image?.id === 'string' ? image.id : undefined,
        createdAt: typeof image?.createdAt === 'string' ? image.createdAt : undefined,
        provider: String(image?.provider ?? ''),
        prompt: String(image?.prompt ?? ''),
        imageUrl: String(image?.imageUrl ?? ''),
      });
      return json({ selfImages });
    }

    if (action === 'apply') {
      const imageUrl = String(body?.imageUrl ?? '');
      const referenceImageDataUrl = await imageUrlToDataUrl(imageUrl);
      const updated = saveCharacterReferenceImage(id, referenceImageDataUrl);
      return json({ character: updated });
    }

    const provider: SelfImageProvider = isSelfImageProvider(body?.provider) ? body.provider : 'gpt-image-2';
    const userPrompt = String(body?.userPrompt ?? '').trim();
    if (!userPrompt) return json({ message: 'userPrompt is required' }, { status: 400 });
    const referenceImageDataUrl = getCharacterReferenceDataUrl(id);
    if (!referenceImageDataUrl) return json({ message: 'reference image not found' }, { status: 400 });

    const prompt = await buildImagePrompt(character, userPrompt);
    const imageUrl = await generateImage(provider, {
      requestId: `character-self-${id}-${Date.now()}`,
      prompt,
      size: '1024x1024',
      model: imageModelForProvider(provider),
      refImages: [referenceImageDataUrl],
      editMode: true,
    });

    const image: CharacterSelfImage = {
      id: `self-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      provider: PROVIDER_LABELS[provider],
      prompt,
      imageUrl,
    };
    return json({ image });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

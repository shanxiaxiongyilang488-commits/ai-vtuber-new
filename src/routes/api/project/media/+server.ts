import { json, type RequestHandler } from '@sveltejs/kit';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { MediaInfo } from '$lib/types';

type SavedProjectMedia = MediaInfo & {
  id: string;
  savedAt: string;
};

const projectRoot = resolve(process.cwd(), 'data', 'project');
const mediaFile = join(projectRoot, 'media-library.json');

async function readMedia(): Promise<SavedProjectMedia[]> {
  try {
    const raw = await readFile(mediaFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeMedia(items: SavedProjectMedia[]): Promise<void> {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(mediaFile, JSON.stringify(items, null, 2), 'utf-8');
}

function normalizeMedia(value: unknown): MediaInfo {
  const media = value as Partial<MediaInfo> | null | undefined;
  const type = media?.type;
  if (type !== 'image' && type !== 'video' && type !== 'audio' && type !== 'storyboard' && type !== 'yaml') {
    throw new Error('media.type is invalid');
  }
  if (!media) throw new Error('media is required');
  return {
    type,
    url: typeof media.url === 'string' ? media.url : undefined,
    title: typeof media.title === 'string' ? media.title : undefined,
    prompt: typeof media.prompt === 'string' ? media.prompt : undefined,
    summary: typeof media.summary === 'string' ? media.summary : undefined,
    thumbnailUrl: typeof media.thumbnailUrl === 'string' ? media.thumbnailUrl : undefined,
    source: typeof media.source === 'string' ? media.source : undefined,
    stage: typeof media.stage === 'string' ? media.stage as MediaInfo['stage'] : undefined,
    metadata: media.metadata && typeof media.metadata === 'object' ? media.metadata : undefined,
  };
}

export const GET: RequestHandler = async () => {
  return json({ media: await readMedia() });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const media = normalizeMedia(body?.media);
    const saved: SavedProjectMedia = {
      ...media,
      id: `project-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
    };
    const items = await readMedia();
    await writeMedia([saved, ...items]);
    return json({ media: saved });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
};

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { json, type RequestHandler } from '@sveltejs/kit';

type StoryReferenceImage = {
  id: string;
  name: string;
  path: string;
  type: 'manga_page';
  createdAt: string;
  active: boolean;
};

const ROOT = resolve(process.cwd(), 'data', 'project', 'story-assets');
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function storyDir(id: string): string {
  const normalized = id.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(normalized)) throw new Error('invalid story id');
  const dir = resolve(ROOT, normalized);
  if (!dir.startsWith(ROOT)) throw new Error('invalid story path');
  return dir;
}

function indexPath(id: string): string {
  return join(storyDir(id), 'reference-images.json');
}

function loadIndex(id: string): StoryReferenceImage[] {
  const file = indexPath(id);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as unknown;
    return Array.isArray(parsed) ? parsed as StoryReferenceImage[] : [];
  } catch {
    return [];
  }
}

function saveIndex(id: string, images: StoryReferenceImage[]): void {
  mkdirSync(storyDir(id), { recursive: true });
  writeFileSync(indexPath(id), JSON.stringify(images, null, 2), 'utf-8');
}

function withDataUrl(storyId: string, image: StoryReferenceImage): StoryReferenceImage & { dataUrl: string } {
  const file = resolve(process.cwd(), image.path);
  const dir = storyDir(storyId);
  const isStoryFile = file.startsWith(`${dir}${process.platform === 'win32' ? '\\' : '/'}`);
  const extension = extname(file).toLowerCase();
  const mime = extension === '.jpg' || extension === '.jpeg'
    ? 'image/jpeg'
    : extension === '.webp'
      ? 'image/webp'
      : 'image/png';
  return {
    ...image,
    dataUrl: isStoryFile && existsSync(file)
      ? `data:${mime};base64,${readFileSync(file).toString('base64')}`
      : '',
  };
}

export const GET: RequestHandler = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'story id is required' }, { status: 400 });
    return json({ referenceImages: loadIndex(id).map((image) => withDataUrl(id, image)) });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
};

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'story id is required' }, { status: 400 });
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File) || file.size === 0) {
      return json({ message: 'image is required' }, { status: 400 });
    }
    const extension = extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return json({ message: 'png, jpg, jpeg, or webp is required' }, { status: 400 });
    }
    const dir = storyDir(id);
    mkdirSync(dir, { recursive: true });
    const imageId = `manga-page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `${imageId}${extension}`;
    const diskPath = join(dir, fileName);
    writeFileSync(diskPath, Buffer.from(await file.arrayBuffer()));

    const current = loadIndex(id).map((image) => ({ ...image, active: false }));
    const image: StoryReferenceImage = {
      id: imageId,
      name: file.name,
      path: `data/project/story-assets/${id.toLowerCase()}/${fileName}`,
      type: 'manga_page',
      createdAt: new Date().toISOString(),
      active: true,
    };
    const referenceImages = [...current, image];
    saveIndex(id, referenceImages);
    return json({ referenceImages: referenceImages.map((entry) => withDataUrl(id, entry)) }, { status: 201 });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return json({ message: 'story id is required' }, { status: 400 });
    const body = await request.json();
    const imageId = String(body?.imageId ?? '');
    const images = loadIndex(id);
    if (!images.some((image) => image.id === imageId)) {
      return json({ message: 'reference image not found' }, { status: 404 });
    }
    const referenceImages = images.map((image) => ({ ...image, active: image.id === imageId }));
    saveIndex(id, referenceImages);
    return json({ referenceImages: referenceImages.map((image) => withDataUrl(id, image)) });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params, url }) => {
  try {
    const id = params.id;
    const imageId = url.searchParams.get('imageId') ?? '';
    if (!id || !imageId) return json({ message: 'story id and imageId are required' }, { status: 400 });
    const images = loadIndex(id);
    const removed = images.find((image) => image.id === imageId);
    if (!removed) return json({ message: 'reference image not found' }, { status: 404 });
    const file = resolve(process.cwd(), removed.path);
    if (file.startsWith(`${storyDir(id)}${process.platform === 'win32' ? '\\' : '/'}`)) {
      rmSync(file, { force: true });
    }
    let referenceImages = images.filter((image) => image.id !== imageId);
    if (removed.active && referenceImages.length > 0) {
      referenceImages = referenceImages.map((image, index) => ({ ...image, active: index === 0 }));
    }
    saveIndex(id, referenceImages);
    return json({ referenceImages: referenceImages.map((image) => withDataUrl(id, image)) });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
};

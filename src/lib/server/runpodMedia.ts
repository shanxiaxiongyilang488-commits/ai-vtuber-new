import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

function decodeBase64(value: string, maxBytes: number, label: string): Buffer {
  const normalized = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const bytes = Buffer.from(normalized, 'base64');
  if (!bytes.length) throw new Error(`RunPod ${label} base64 data is empty.`);
  if (bytes.byteLength > maxBytes) throw new Error(`RunPod ${label} exceeds ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  return bytes;
}

export async function imageUrlForRunpod(
  value: string,
  requestUrl: URL,
  eventFetch: typeof fetch,
): Promise<string> {
  const raw = value.trim();
  if (!raw) return '';
  if (/^data:image\//i.test(raw)) {
    decodeBase64(raw, MAX_IMAGE_BYTES, 'reference image');
    return raw;
  }
  const resolved = new URL(raw, requestUrl);
  if (!['http:', 'https:'].includes(resolved.protocol)) {
    throw new Error(`Unsupported RunPod reference image protocol: ${resolved.protocol}`);
  }
  // Public HTTPS assets can be downloaded directly by the worker. Localhost,
  // relative app routes and plain HTTP assets are embedded because RunPod
  // cannot access this PC's loopback address.
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(resolved.hostname)
    || resolved.origin === requestUrl.origin
    || resolved.protocol !== 'https:';
  if (!isLocal) return resolved.toString();
  const response = await eventFetch(resolved);
  if (!response.ok) throw new Error(`Reference image download failed: HTTP ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > MAX_IMAGE_BYTES) throw new Error('RunPod reference image exceeds 6 MB.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('RunPod reference image is empty.');
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('RunPod reference image exceeds 6 MB.');
  const mime = response.headers.get('content-type')?.split(';', 1)[0].trim() || 'image/png';
  if (!mime.startsWith('image/')) throw new Error(`Reference URL did not return an image (${mime}).`);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

export async function persistRunpodVideoBase64(value: string): Promise<string> {
  const bytes = decodeBase64(value, MAX_VIDEO_BYTES, 'video');
  const directory = path.resolve(process.cwd(), 'data', 'generated-videos');
  await mkdir(directory, { recursive: true });
  const fileName = `runpod-${randomUUID()}.mp4`;
  await writeFile(path.join(directory, fileName), bytes);
  return `/api/generated-video/${fileName}`;
}

export async function readGeneratedVideo(fileName: string): Promise<Buffer> {
  if (!/^runpod-[0-9a-f-]{36}\.mp4$/i.test(fileName)) throw new Error('Invalid generated video name.');
  return readFile(path.resolve(process.cwd(), 'data', 'generated-videos', fileName));
}

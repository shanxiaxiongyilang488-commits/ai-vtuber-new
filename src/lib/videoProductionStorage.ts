export type VideoProductionRecordType = 'idle' | 'story' | 'package' | 'image' | 'video';

const KEY_PREFIX = 'video-production:';
const mediaStore = new Map<string, { label: string; value: string }>();

export type VideoProductionMediaEntry = { id: string; label: string; value: string };

export type VideoProductionRecord<T = unknown> = {
  id: string;
  type: VideoProductionRecordType;
  createdAt: string;
  value: T;
};

export function getVideoProductionRecords<T = unknown>(type?: VideoProductionRecordType): VideoProductionRecord<T>[] {
  if (typeof sessionStorage === 'undefined') return [];
  const records: VideoProductionRecord<T>[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (!key?.startsWith(KEY_PREFIX)) continue;
    try {
      const record = JSON.parse(sessionStorage.getItem(key) ?? '') as VideoProductionRecord<T>;
      if (!record?.id || !record.type || (type && record.type !== type)) continue;
      records.push(record);
    } catch {
      // Keep malformed legacy session entries untouched; they are simply not projects.
    }
  }
  return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function getVideoProductionMediaEntries(): VideoProductionMediaEntry[] {
  return Array.from(mediaStore.entries()).map(([id, entry]) => ({ id, ...entry }));
}

export function clearVideoProductionMediaStore(): number {
  const deleted = mediaStore.size;
  mediaStore.clear();
  return deleted;
}

export function hasVideoProductionMedia(id: string): boolean {
  return mediaStore.has(id);
}

function sanitizeProductionValue(value: unknown): unknown {
  if (typeof value === 'string') return value.startsWith('data:image/') ? storeVideoProductionImage(value) : value;
  if (Array.isArray(value)) return value.map(sanitizeProductionValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeProductionValue(item)]));
  return value;
}

/** Stores production payloads outside chat history. Chat messages retain only these IDs. */
export function storeVideoProductionData(type: VideoProductionRecordType, value: unknown): string {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(`${KEY_PREFIX}${id}`, JSON.stringify({ id, type, createdAt: new Date().toISOString(), value: sanitizeProductionValue(value) }));
  }
  return id;
}

export function storeVideoProductionImage(value: string, label = 'reference'): string {
  if (mediaStore.has(value)) {
    console.debug('[VIDEO_PRODUCTION_MEDIA_STORE_REUSED]', { id: value, label });
    return value;
  }
  const existing = Array.from(mediaStore.entries()).find(([, entry]) => entry.value === value);
  if (existing) {
    console.debug('[VIDEO_PRODUCTION_MEDIA_STORE_REUSED]', { id: existing[0], label });
    return existing[0];
  }
  const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  mediaStore.set(id, { label, value });
  console.log('[VIDEO_PRODUCTION_MEDIA_STORE_REGISTERED]', {
    id,
    label,
    value,
    mediaStoreSize: mediaStore.size,
  });
  return id;
}

/** Replaces inline image data with a stable ID before it enters a blueprint/package. */
export function toVideoProductionImageReference(value: string, label = 'reference'): string {
  return storeVideoProductionImage(value, label);
}

/** Resolves an ID only at the engine boundary; chat and package records keep the ID. */
export function resolveVideoProductionImageReference(value: string): string {
  return mediaStore.get(value)?.value ?? value;
}

/** A final guard for persisted/rendered chat text. */
export function stripInlineImageData(text: string): string {
  return text.replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/giu, '[画像データは非表示]');
}

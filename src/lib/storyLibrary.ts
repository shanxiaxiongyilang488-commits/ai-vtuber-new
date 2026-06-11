import { parseStoryYaml } from '$lib/storyYaml';

export const STORY_LIBRARY_KEY = 'ai-vtuber-story-library-v1';
export const ACTIVE_STORY_KEY = 'ai-vtuber-active-story-v1';

export type StoryReferenceImage = {
  id: string;
  name: string;
  path: string;
  type: 'manga_page';
  createdAt: string;
  active: boolean;
  dataUrl?: string;
};

export type SavedStory = {
  id: string;
  rawYaml: string;
  yaml: string;
  title: string;
  storyType: string;
  createdAt: string;
  updatedAt: string;
  referenceImages: StoryReferenceImage[];
};

function normalizeStory(value: unknown): SavedStory | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SavedStory>;
  const yaml = typeof candidate.yaml === 'string' ? candidate.yaml : candidate.rawYaml;
  if (
    typeof candidate.id !== 'string'
    || typeof yaml !== 'string'
    || typeof candidate.createdAt !== 'string'
    || typeof candidate.updatedAt !== 'string'
  ) {
    return null;
  }
  const parsed = parseStoryYaml(yaml);
  if (!parsed) return null;
  return {
    id: candidate.id,
    rawYaml: parsed.rawYaml,
    yaml: parsed.rawYaml,
    title: parsed.title,
    storyType: parsed.storyType,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    referenceImages: Array.isArray(candidate.referenceImages)
      ? candidate.referenceImages as StoryReferenceImage[]
      : [],
  };
}

export function loadStoryLibrary(): SavedStory[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORY_LIBRARY_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap((entry) => {
        const normalized = normalizeStory(entry);
        return normalized ? [normalized] : [];
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function writeStoryLibrary(stories: SavedStory[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORY_LIBRARY_KEY, JSON.stringify(stories));
}

export function saveStoryYaml(rawYaml: string): SavedStory | null {
  const parsed = parseStoryYaml(rawYaml);
  if (!parsed || typeof localStorage === 'undefined') return null;

  const stories = loadStoryLibrary();
  const existing = stories.find((story) => story.rawYaml === parsed.rawYaml);
  const now = new Date().toISOString();
  const saved: SavedStory = {
    id: existing?.id ?? `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    rawYaml: parsed.rawYaml,
    yaml: parsed.rawYaml,
    title: parsed.title,
    storyType: parsed.storyType,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    referenceImages: existing?.referenceImages ?? [],
  };
  writeStoryLibrary([saved, ...stories.filter((story) => story.id !== saved.id)]);
  return saved;
}

export function updateStoryReferenceImages(
  id: string,
  referenceImages: StoryReferenceImage[],
): SavedStory | null {
  const stories = loadStoryLibrary();
  const existing = stories.find((story) => story.id === id);
  if (!existing) return null;
  const metadata = referenceImages.map(({ dataUrl: _dataUrl, ...image }) => image);
  const updated = { ...existing, referenceImages: metadata, updatedAt: new Date().toISOString() };
  writeStoryLibrary([updated, ...stories.filter((story) => story.id !== id)]);
  if (loadActiveStory()?.id === id) setActiveStory(updated);
  return updated;
}

export function setActiveStory(story: SavedStory): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ACTIVE_STORY_KEY, JSON.stringify(story));
}

export function loadActiveStory(): SavedStory | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return normalizeStory(JSON.parse(localStorage.getItem(ACTIVE_STORY_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

export function clearActiveStory(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(ACTIVE_STORY_KEY);
}

export function deleteStory(id: string): SavedStory[] {
  const stories = loadStoryLibrary().filter((story) => story.id !== id);
  writeStoryLibrary(stories);
  return stories;
}

export function updateStoryYaml(id: string, rawYaml: string): SavedStory | null {
  const parsed = parseStoryYaml(rawYaml);
  if (!parsed || typeof localStorage === 'undefined') return null;
  const stories = loadStoryLibrary();
  const existing = stories.find((story) => story.id === id);
  if (!existing) return null;

  const updated: SavedStory = {
    ...existing,
    rawYaml: parsed.rawYaml,
    yaml: parsed.rawYaml,
    title: parsed.title,
    storyType: parsed.storyType,
    updatedAt: new Date().toISOString(),
  };
  writeStoryLibrary([updated, ...stories.filter((story) => story.id !== id)]);
  return updated;
}

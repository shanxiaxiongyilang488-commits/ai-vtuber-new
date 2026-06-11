import { parseStoryYaml } from '$lib/storyYaml';

export const STORY_LIBRARY_KEY = 'ai-vtuber-story-library-v1';

export type SavedStory = {
  id: string;
  rawYaml: string;
  title: string;
  storyType: string;
  createdAt: string;
  updatedAt: string;
};

function normalizeStory(value: unknown): SavedStory | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SavedStory>;
  if (
    typeof candidate.id !== 'string'
    || typeof candidate.rawYaml !== 'string'
    || typeof candidate.createdAt !== 'string'
    || typeof candidate.updatedAt !== 'string'
  ) {
    return null;
  }
  const parsed = parseStoryYaml(candidate.rawYaml);
  if (!parsed) return null;
  return {
    id: candidate.id,
    rawYaml: parsed.rawYaml,
    title: parsed.title,
    storyType: parsed.storyType,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
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
    title: parsed.title,
    storyType: parsed.storyType,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeStoryLibrary([saved, ...stories.filter((story) => story.id !== saved.id)]);
  return saved;
}

export function deleteStory(id: string): SavedStory[] {
  const stories = loadStoryLibrary().filter((story) => story.id !== id);
  writeStoryLibrary(stories);
  return stories;
}

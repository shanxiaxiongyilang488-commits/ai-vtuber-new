import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  getCharacter,
  getCharacterMemory,
  listCharacters,
} from '$lib/server/characterRegistry';
import {
  readBrainHealth,
  resolveCharacterBrainFile,
  validateBrainJsonText,
  writeBrainTransaction,
  type BrainHealth,
} from '$lib/server/brainProtection';
import type { StoryCard } from '$lib/storycard/storycard';
import type { MemoryReviewTechnicalEvidence } from '$lib/memoryReview';
import { normalizeChatVoiceDirection, type ChatVoiceDirection } from '$lib/voiceDirection';
import type { VideoPackage } from '../../core/videoPackageCore';
import {
  emptyCharacterVisualMemory,
  hasCharacterVisualMemory,
  normalizeCharacterVisualMemory,
  SHIRO_CRITICAL_FEATURES,
  shiroVisualMemoryPreset,
  type CharacterVisualMemory,
} from '$lib/types/characterVisualMemory';

/**
 * Character Memory Chat — an independent conversational memory store.
 *
 * This module is deliberately decoupled from the Character Registry:
 *  - The Registry is only read as a SOURCE OF INITIAL VALUES (seed) when a
 *    character is first opened here.
 *  - Every update driven by conversation lives ONLY in `character-memory.json`
 *    and is never written back to the Registry.
 *
 * The single store file makes the data easy to reference from other features
 * (e.g. a future Manga Chat) via `getMemoryContexts()`.
 */

export interface CharacterMemoryFields {
  personality: string[];
  speechStyle: string[];
  likes: string[];
  dislikes: string[];
}

export type MemorySource = 'manual' | 'conversation' | 'self_talk' | 'video_analysis' | 'image_analysis' | 'memory-review';

/** Fixed character identity. Only explicit manual saves may change this layer. */
export interface PersonaMemory {
  species: string;
  personality: string[];
  speechStyle: string[];
  relationship: string;
}

export interface MemoryV2Item {
  id: string;
  content: string;
  importance: number;
  source: MemorySource;
  createdAt: string;
  expiresAt?: string;
}

export interface MemoryV2 {
  persona: PersonaMemory;
  longTermMemory: MemoryV2Item[];
  shortTermMemory: MemoryV2Item[];
}

export interface MemoryReviewRecord {
  id: string;
  characterId: string;
  title: string;
  summary: string;
  reason?: string;
  importance: number;
  tags: string[];
	evidenceRefs?: string[];
  source: 'memory-review';
  createdAt: string;
}

export interface MemoryReviewCandidateInput {
  title?: unknown;
  summary?: unknown;
  reason?: unknown;
  importance?: unknown;
  tags?: unknown;
	evidenceRefs?: unknown;
}

export interface RelationshipItem {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  reason?: string;
  updatedAt: string;
}

export interface RelationshipUpdateInput {
  category?: unknown;
  key?: unknown;
  value?: unknown;
  confidence?: unknown;
  reason?: unknown;
}

export type EmotionType = 'happy' | 'thinking' | 'excited' | 'curious' | 'sleepy' | 'calm' | 'worried' | 'sad';

export interface BrainEmotionState {
  id: string;
  emotion: EmotionType;
  reason: string;
  intensity: number;
  confidence: number;
  createdAt: string;
}

export interface EmotionBrain {
  current: BrainEmotionState | null;
  history: BrainEmotionState[];
}

export interface EmotionSaveInput {
  emotion?: unknown;
  reason?: unknown;
  intensity?: unknown;
  confidence?: unknown;
}

export type CharacterState = 'Morning' | 'Active' | 'Thinking' | 'Sleeping';

export interface RoutineLogEntry {
  id: string;
  type: 'morning' | 'state' | 'night';
  state: CharacterState;
  summary: string;
  createdAt: string;
}

export interface RoutineBrain {
  currentState: CharacterState;
  todaySummary: string;
  todayGoal: string;
  morningGreeting: string;
  lastSleepTime?: string;
  updatedAt: string;
  log: RoutineLogEntry[];
}

export interface RoutineUpdateInput {
  state?: CharacterState;
  type?: 'morning' | 'state' | 'night';
  summary?: string;
  todaySummary?: string;
  todayGoal?: string;
  morningGreeting?: string;
  lastSleepTime?: string;
}

export interface Experience {
  id: string;
  createdAt: string;
  memoryIds: string[];
  relationshipIds: string[];
  emotionIds: string[];
  routineId?: string;
  goalIds?: string[];
  importance: number;
  summary: string;
}

export interface ExperienceInput {
  memoryIds?: string[];
  relationshipIds?: string[];
  emotionIds?: string[];
  routineId?: string;
  goalIds?: string[];
  importance?: number;
  summary?: string;
}

export interface CharacterMemoryMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** @deprecated Legacy single-image field, retained only to read old chat history. */
  imageUrl?: string;
  /** Served URLs of all uploaded reference images attached to this message. */
  referenceImages?: string[];
  /** Structured StoryCard payload. The chat text contains only its conversational summary. */
  storyCard?: StoryCard;
  /** Provider-neutral generation package derived from StoryCard. Video APIs consume this, not StoryCard. */
  videoPackage?: VideoPackage;
  /** Editable Seedance prompt generated after the StoryCard. */
  motionPrompt?: string;
  /** Models used for each production role represented by this message. */
  aiModels?: import('$lib/ai/aiRoleRouting').AIModelMetadata;
  /** One-shot VoiceLab direction used to synthesize this assistant message. */
  voiceDirection?: ChatVoiceDirection;
  /** ISO 8601 timestamp for message display and date separators. */
  timestamp: string;
  createdAt: string;
}

export interface CharacterMemoryEntry {
  id: string;
  name: string;
  role: string;
  description: string;
  memory: CharacterMemoryFields;
  /** Manually curated visual identity, equipment, motion, and production rules. */
  visualMemory: CharacterVisualMemory;
  /** V2 layers. `memory` remains for backward compatibility with existing consumers. */
  memoryV2: MemoryV2;
  /** Explicit long-term memories accepted from Memory Review. */
  reviewMemory: MemoryReviewRecord[];
  /** Durable understanding of the user's preferences, style, values, and priorities. */
  relationships: RelationshipItem[];
  /** Shiro's own emotional state, independent from event memories and user understanding. */
  emotion: EmotionBrain;
  /** Daily life-cycle state: morning, active conversation, idle thinking, and sleeping. */
  routine: RoutineBrain;
  /** Graph nodes that bind Memory, Relationship, Emotion, Routine, and future Goal layers. */
  experiences: Experience[];
  messages: CharacterMemoryMessage[];
  /** Whether the Registry seed has already been applied for this entry. */
  seededFromRegistry: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CharacterMemoryStore {
  version: 1;
  characters: Record<string, CharacterMemoryEntry>;
}

/** Lightweight item used by the character picker. */
export interface CharacterMemoryListItem {
  id: string;
  name: string;
  role: string;
  description: string;
  hasReference: boolean;
  hasMemoryEntry: boolean;
  updatedAt: string;
  criticalFeatures: string[];
}

/** Read-only context for downstream consumers (e.g. Manga Chat). */
export interface CharacterMemoryContext {
  id: string;
  name: string;
  role: string;
  description: string;
  memory: CharacterMemoryFields;
  visualMemory: CharacterVisualMemory;
}

const DATA_ROOT = resolve(process.cwd(), 'data');
const ASSET_ROOT = resolve(DATA_ROOT, 'character-memory-assets');
const MAX_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 500;
const MAX_STORYCARD_MESSAGE_LENGTH = 12000;
const MAX_MOTION_PROMPT_LENGTH = 64 * 1024;
/** Animation Projects carry the Scene Timeline in scenes plus panel bounds; legacy saves also duplicated it as scene_timeline. */
const MAX_VIDEO_PACKAGE_SNAPSHOT_LENGTH = 256 * 1024;
const STORE_FILE = resolveCharacterBrainFile();

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MIME_BY_IMAGE_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

function emptyFields(): CharacterMemoryFields {
  return { personality: [], speechStyle: [], likes: [], dislikes: [] };
}

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(String).map((item) => item.trim()).filter(Boolean)),
  );
}

function normalizeFields(value: unknown): CharacterMemoryFields {
  const fields = (value ?? {}) as Partial<CharacterMemoryFields>;
  return {
    personality: normalizeList(fields.personality),
    speechStyle: normalizeList(fields.speechStyle),
    likes: normalizeList(fields.likes),
    dislikes: normalizeList(fields.dislikes),
  };
}

function normalizeMessages(value: unknown): CharacterMemoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): CharacterMemoryMessage[] => {
    if (!entry || typeof entry !== 'object') return [];
    const message = entry as Partial<CharacterMemoryMessage>;
    if (
      typeof message.id !== 'string'
      || (message.role !== 'user' && message.role !== 'assistant')
      || typeof message.text !== 'string'
      || typeof message.createdAt !== 'string'
    ) return [];
    // Inline base64 must never survive a history load. Media is stored separately.
    const referenceImages = normalizeList(message.referenceImages);
    const storyCard = normalizeStoryCardSnapshot(message.storyCard);
    const videoPackage = normalizeVideoPackageSnapshot(message.videoPackage, 'read');
    const motionPrompt = typeof message.motionPrompt === 'string' ? message.motionPrompt.trim().slice(0, MAX_MOTION_PROMPT_LENGTH) : '';
    const aiModels = normalizeAIModels(message.aiModels);
    const voiceDirection = normalizeChatVoiceDirection(message.voiceDirection);
    if (
      /data\//iu.test(message.text)
      || (typeof message.imageUrl === 'string' && /data\//iu.test(message.imageUrl))
      || referenceImages.some((image) => /data\//iu.test(image))
    ) return [];
    return [{
      id: message.id,
      role: message.role,
      text: normalizeMessageText(message.text),
      ...(typeof message.imageUrl === 'string' && message.imageUrl ? { imageUrl: message.imageUrl } : {}),
      ...(referenceImages.length > 0 ? { referenceImages } : {}),
      ...(storyCard ? { storyCard } : {}),
      ...(videoPackage ? { videoPackage } : {}),
      ...(motionPrompt ? { motionPrompt } : {}),
      ...(aiModels ? { aiModels } : {}),
      ...(voiceDirection ? { voiceDirection } : {}),
      timestamp: typeof message.timestamp === 'string' ? message.timestamp : message.createdAt,
      createdAt: message.createdAt,
    }];
  });
}

function normalizeStoryCardSnapshot(value: unknown): StoryCard | undefined {
  if (!value || typeof value !== 'object') return undefined;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_STORYCARD_MESSAGE_LENGTH || /data:image\//iu.test(serialized)) return undefined;
    const card = JSON.parse(serialized) as Partial<StoryCard>;
    if (
      typeof card.id !== 'string'
      || typeof card.title !== 'string'
      || typeof card.summary !== 'string'
      || !Array.isArray(card.cuts)
    ) return undefined;
    return card as StoryCard;
  } catch {
    return undefined;
  }
}

type VideoPackageValidationContext = 'read' | 'append' | 'update';
type VideoPackageRejectionReason =
  | 'VIDEO_PACKAGE_TOO_LARGE'
  | 'VIDEO_PACKAGE_CONTAINS_INLINE_IMAGE'
  | 'VIDEO_PACKAGE_INVALID_SHAPE'
  | 'VIDEO_PACKAGE_INVALID_JSON';

function rejectVideoPackage(
  reason: VideoPackageRejectionReason,
  context: VideoPackageValidationContext,
  chars: number,
  error?: unknown,
): null {
  const detail = {
    reason,
    context,
    chars,
    limit: MAX_VIDEO_PACKAGE_SNAPSHOT_LENGTH,
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
  };
  if (context === 'read') {
    console.warn('[VIDEO_PACKAGE_LOAD_SKIPPED]', detail);
    return null;
  }
  console.error('[VIDEO_PACKAGE_SAVE_REJECTED]', detail);
  throw new Error(`${reason}: VideoPackage could not be saved (${chars} chars)`);
}

function normalizeVideoPackageSnapshot(
  value: unknown,
  context: VideoPackageValidationContext = 'read',
): VideoPackage | null {
  if (value == null) return null;
  if (typeof value !== 'object') return rejectVideoPackage('VIDEO_PACKAGE_INVALID_SHAPE', context, 0);
  let serialized: string;
  try {
    const candidate = JSON.stringify(value);
    if (typeof candidate !== 'string') return rejectVideoPackage('VIDEO_PACKAGE_INVALID_JSON', context, 0);
    serialized = candidate;
  } catch (error) {
    return rejectVideoPackage('VIDEO_PACKAGE_INVALID_JSON', context, 0, error);
  }

  const chars = serialized.length;
  if (context === 'read') {
    console.debug('[VIDEO_PACKAGE_SIZE]', { context, chars, limit: MAX_VIDEO_PACKAGE_SNAPSHOT_LENGTH });
  } else {
    console.log(`VideoPackage: ${chars} chars`);
    console.log('[VIDEO_PACKAGE_SIZE]', { context, chars, limit: MAX_VIDEO_PACKAGE_SNAPSHOT_LENGTH });
  }
  if (chars > MAX_VIDEO_PACKAGE_SNAPSHOT_LENGTH) {
    return rejectVideoPackage('VIDEO_PACKAGE_TOO_LARGE', context, chars);
  }
  if (/data:image\//iu.test(serialized)) {
    return rejectVideoPackage('VIDEO_PACKAGE_CONTAINS_INLINE_IMAGE', context, chars);
  }

  const item = JSON.parse(serialized) as Partial<VideoPackage>;
  if (
    item.version !== 1
    || typeof item.source_storycard_id !== 'string'
    || typeof item.title !== 'string'
    || typeof item.duration !== 'number'
    || !Number.isFinite(item.duration)
    || item.duration <= 0
    || !Array.isArray(item.scenes)
    || item.scenes.length === 0
    || typeof item.motion_prompt !== 'string'
  ) return rejectVideoPackage('VIDEO_PACKAGE_INVALID_SHAPE', context, chars);
  return item as VideoPackage;
}

function normalizeAIModels(value: unknown): CharacterMemoryMessage['aiModels'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  const allowed = ['conversation', 'storyCard', 'motionPrompt', 'imageAnalysis', 'video', 'yaml', 'intentRouter'] as const;
  const normalized = Object.fromEntries(allowed.flatMap((key) => {
    const model = typeof data[key] === 'string' ? data[key].trim().slice(0, 80) : '';
    return model ? [[key, model]] : [];
  })) as NonNullable<CharacterMemoryMessage['aiModels']>;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function isStoryCardJsonText(text: string): boolean {
  try {
    const data = JSON.parse(text);
    return Boolean(
      data
      && typeof data === 'object'
      && typeof data.title === 'string'
      && typeof data.summary === 'string'
      && Array.isArray(data.cuts),
    );
  } catch {
    return false;
  }
}

function normalizeMessageText(text: string): string {
  const trimmed = text.trim();
  return trimmed.slice(0, isStoryCardJsonText(trimmed) ? MAX_STORYCARD_MESSAGE_LENGTH : MAX_MESSAGE_LENGTH);
}

function emptyPersona(): PersonaMemory {
  return { species: '', personality: [], speechStyle: [], relationship: '' };
}

function normalizeSource(value: unknown): MemorySource {
  return value === 'conversation' || value === 'self_talk' || value === 'video_analysis' || value === 'image_analysis' || value === 'memory-review' ? value : 'manual';
}

function normalizeMemoryItems(value: unknown, isShortTerm = false): MemoryV2Item[] {
  if (!Array.isArray(value)) return [];
  const now = new Date().toISOString();
  return value.flatMap((raw): MemoryV2Item[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<MemoryV2Item>;
    const content = typeof item.content === 'string' ? item.content.trim().slice(0, 500) : '';
    if (!content) return [];
    const expiresAt = typeof item.expiresAt === 'string' ? item.expiresAt : undefined;
    if (isShortTerm && expiresAt && new Date(expiresAt).getTime() < Date.now()) return [];
    return [{
      id: typeof item.id === 'string' ? item.id : `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      importance: Math.max(0, Math.min(100, Number(item.importance) || (isShortTerm ? 40 : 70))),
      source: normalizeSource(item.source),
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      ...(expiresAt ? { expiresAt } : {}),
    }];
  });
}

function legacyToV2(memory: CharacterMemoryFields, role: string): MemoryV2 {
  const now = new Date().toISOString();
  const persona: PersonaMemory = { species: '', personality: memory.personality, speechStyle: memory.speechStyle, relationship: role };
  const legacyPreferences = [...memory.likes, ...memory.dislikes].map((content, index) => ({
    id: `legacy-${index}-${Date.now()}`,
    content: `旧メモ: ${content}`,
    importance: 70,
    source: 'manual' as const,
    createdAt: now,
  }));
  return { persona, longTermMemory: legacyPreferences, shortTermMemory: [] };
}

function normalizeMemoryV2(value: unknown, legacy: CharacterMemoryFields, role: string): MemoryV2 {
  if (!value || typeof value !== 'object') return legacyToV2(legacy, role);
  const raw = value as Partial<MemoryV2>;
  const personaRaw = raw.persona ?? emptyPersona();
  const persona: PersonaMemory = {
    species: typeof personaRaw.species === 'string' ? personaRaw.species.trim().slice(0, 120) : '',
    personality: normalizeList(personaRaw.personality),
    speechStyle: normalizeList(personaRaw.speechStyle),
    relationship: typeof personaRaw.relationship === 'string' ? personaRaw.relationship.trim().slice(0, 300) : role,
  };
  return { persona, longTermMemory: normalizeMemoryItems(raw.longTermMemory), shortTermMemory: normalizeMemoryItems(raw.shortTermMemory, true) };
}

function normalizeReviewMemory(value: unknown, characterId: string): MemoryReviewRecord[] {
  if (!Array.isArray(value)) return [];
  const now = new Date().toISOString();
  return value.flatMap((raw): MemoryReviewRecord[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<MemoryReviewRecord>;
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 120) : '';
    const summary = typeof item.summary === 'string' ? item.summary.trim().slice(0, 600) : '';
    if (!title || !summary) return [];
    return [{
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      characterId,
      title,
      summary,
      ...(typeof item.reason === 'string' && item.reason.trim() ? { reason: item.reason.trim().slice(0, 600) } : {}),
      importance: Math.max(0, Math.min(1, Number(item.importance) || 0)),
      tags: normalizeList(item.tags).slice(0, 12),
	  ...(normalizeList(item.evidenceRefs).length > 0 ? { evidenceRefs: normalizeList(item.evidenceRefs).slice(0, 8) } : {}),
      source: 'memory-review',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
    }];
  });
}

function normalizeRelationships(value: unknown): RelationshipItem[] {
  if (!Array.isArray(value)) return [];
  const now = new Date().toISOString();
  return value.flatMap((raw): RelationshipItem[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<RelationshipItem>;
    const category = typeof item.category === 'string' ? item.category.trim().slice(0, 80) : '';
    const key = typeof item.key === 'string' ? item.key.trim().slice(0, 120) : '';
    const valueText = typeof item.value === 'string' ? item.value.trim().slice(0, 500) : '';
    if (!category || !key || !valueText) return [];
    return [{
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `relationship-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category,
      key,
      value: valueText,
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
      ...(typeof item.reason === 'string' && item.reason.trim() ? { reason: item.reason.trim().slice(0, 600) } : {}),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
    }];
  });
}

function isEmotionType(value: unknown): value is EmotionType {
  return value === 'happy'
    || value === 'thinking'
    || value === 'excited'
    || value === 'curious'
    || value === 'sleepy'
    || value === 'calm'
    || value === 'worried'
    || value === 'sad';
}

function normalizeEmotionState(value: unknown): BrainEmotionState | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<BrainEmotionState>;
  if (!isEmotionType(item.emotion)) return null;
  const reason = typeof item.reason === 'string' ? item.reason.trim().slice(0, 600) : '';
  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id : `emotion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    emotion: item.emotion,
    reason,
    intensity: Math.max(0, Math.min(1, Number(item.intensity) || 0)),
    confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
  };
}

function emptyEmotionBrain(): EmotionBrain {
  return { current: null, history: [] };
}

function normalizeEmotionBrain(value: unknown): EmotionBrain {
  if (!value || typeof value !== 'object') return emptyEmotionBrain();
  const raw = value as Partial<EmotionBrain>;
  const history = Array.isArray(raw.history)
    ? raw.history.map(normalizeEmotionState).filter((item): item is BrainEmotionState => Boolean(item)).slice(-30)
    : [];
  const current = normalizeEmotionState(raw.current) ?? history.at(-1) ?? null;
  return { current, history };
}

function isCharacterState(value: unknown): value is CharacterState {
  return value === 'Morning' || value === 'Active' || value === 'Thinking' || value === 'Sleeping';
}

function emptyRoutineBrain(): RoutineBrain {
  const now = new Date().toISOString();
  return {
    currentState: 'Morning',
    todaySummary: '',
    todayGoal: '',
    morningGreeting: '',
    updatedAt: now,
    log: [],
  };
}

function normalizeRoutineLog(value: unknown): RoutineLogEntry[] {
  if (!Array.isArray(value)) return [];
  const now = new Date().toISOString();
  return value.flatMap((raw): RoutineLogEntry[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<RoutineLogEntry>;
    if (!isCharacterState(item.state)) return [];
    const type = item.type === 'morning' || item.type === 'night' || item.type === 'state' ? item.type : 'state';
    return [{
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `routine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      state: item.state,
      summary: typeof item.summary === 'string' ? item.summary.trim().slice(0, 800) : '',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
    }];
  }).slice(-60);
}

function normalizeRoutineBrain(value: unknown): RoutineBrain {
  if (!value || typeof value !== 'object') return emptyRoutineBrain();
  const raw = value as Partial<RoutineBrain>;
  const fallback = emptyRoutineBrain();
  return {
    currentState: isCharacterState(raw.currentState) ? raw.currentState : fallback.currentState,
    todaySummary: typeof raw.todaySummary === 'string' ? raw.todaySummary.trim().slice(0, 1000) : '',
    todayGoal: typeof raw.todayGoal === 'string' ? raw.todayGoal.trim().slice(0, 500) : '',
    morningGreeting: typeof raw.morningGreeting === 'string' ? raw.morningGreeting.trim().slice(0, 1000) : '',
    ...(typeof raw.lastSleepTime === 'string' ? { lastSleepTime: raw.lastSleepTime } : {}),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fallback.updatedAt,
    log: normalizeRoutineLog(raw.log),
  };
}

function normalizeExperiences(value: unknown): Experience[] {
  if (!Array.isArray(value)) return [];
  const now = new Date().toISOString();
  return value.flatMap((raw): Experience[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<Experience>;
    const summary = typeof item.summary === 'string' ? item.summary.trim().slice(0, 1000) : '';
    if (!summary) return [];
    return [{
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `experience-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      memoryIds: normalizeList(item.memoryIds).slice(0, 30),
      relationshipIds: normalizeList(item.relationshipIds).slice(0, 30),
      emotionIds: normalizeList(item.emotionIds).slice(0, 30),
      ...(typeof item.routineId === 'string' && item.routineId.trim() ? { routineId: item.routineId } : {}),
      ...(Array.isArray(item.goalIds) ? { goalIds: normalizeList(item.goalIds).slice(0, 30) } : {}),
      importance: Math.max(0, Math.min(1, Number(item.importance) || 0)),
      summary,
    }];
  }).slice(-120);
}

function normalizeEntry(id: string, value: unknown): CharacterMemoryEntry {
  const entry = (value ?? {}) as Partial<CharacterMemoryEntry>;
  const now = new Date().toISOString();
  const memory = normalizeFields(entry.memory);
  const normalizedVisualMemory = sanitizeVisualMemoryForCharacter(id, normalizeCharacterVisualMemory(entry.visualMemory));
  const hadVisualMemory = hasCharacterVisualMemory(normalizedVisualMemory);
  const migratedVisualMemory = id === 'shiro' && normalizedVisualMemory.criticalFeatures.length === 0
    ? { ...normalizedVisualMemory, criticalFeatures: [...SHIRO_CRITICAL_FEATURES] }
    : normalizedVisualMemory;
  return {
    id,
    name: typeof entry.name === 'string' ? entry.name : id,
    role: typeof entry.role === 'string' ? entry.role : '',
    description: typeof entry.description === 'string' ? entry.description : '',
    memory,
    visualMemory: sanitizeVisualMemoryForCharacter(id, id === 'shiro' && !hadVisualMemory
      ? shiroVisualMemoryPreset()
      : migratedVisualMemory),
    memoryV2: normalizeMemoryV2(entry.memoryV2, memory, typeof entry.role === 'string' ? entry.role : ''),
    reviewMemory: normalizeReviewMemory((entry as Partial<CharacterMemoryEntry>).reviewMemory, id),
    relationships: normalizeRelationships((entry as Partial<CharacterMemoryEntry>).relationships),
    emotion: normalizeEmotionBrain((entry as Partial<CharacterMemoryEntry>).emotion),
    routine: normalizeRoutineBrain((entry as Partial<CharacterMemoryEntry>).routine),
    experiences: normalizeExperiences((entry as Partial<CharacterMemoryEntry>).experiences),
    messages: normalizeMessages(entry.messages),
    seededFromRegistry: entry.seededFromRegistry === true,
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : now,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : now,
  };
}

function readStore(): CharacterMemoryStore {
  if (!existsSync(STORE_FILE)) return { version: 1, characters: {} };
  try {
    const raw = readFileSync(STORE_FILE, 'utf-8');
    const validation = validateBrainJsonText(raw);
    if (!validation.ok) throw new Error(validation.message);
    const parsed = JSON.parse(raw) as Partial<CharacterMemoryStore>;
    const source = (parsed.characters ?? {}) as Record<string, unknown>;
    const characters: Record<string, CharacterMemoryEntry> = {};
    for (const [rawId, value] of Object.entries(source)) {
      const id = normalizeId(rawId);
      if (!id) continue;
      characters[id] = normalizeEntry(id, value);
    }
    return { version: 1, characters };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Character Brain is corrupted: ${message}`);
  }
}

function writeStore(store: CharacterMemoryStore): void {
  writeBrainTransaction(STORE_FILE, store);
}

function sanitizeVisualMemoryForCharacter(id: string, memory: CharacterVisualMemory): CharacterVisualMemory {
  const normalizedId = normalizeId(id);
  const blockedCriticalFeatures = normalizedId === 'shiro' ? new Set(['ORANGE_MESH']) : new Set<string>();
  const referenceOwnerPattern = /\/api\/character-memory\/([^/]+)\/image\//iu;
  return {
    ...memory,
    criticalFeatures: memory.criticalFeatures.filter((feature) => !blockedCriticalFeatures.has(feature.trim().toUpperCase())),
    referenceImages: memory.referenceImages.filter((reference) => {
      const owner = reference.url.match(referenceOwnerPattern)?.[1];
      return !owner || normalizeId(owner) === normalizedId;
    }),
  };
}

export function getBrainHealth(): BrainHealth {
  return readBrainHealth(STORE_FILE);
}

/**
 * Build a fresh entry by seeding name/role/description (and any pre-existing
 * Registry memory) as INITIAL VALUES. Never called again after the entry exists.
 */
function seedEntryFromRegistry(id: string): CharacterMemoryEntry {
  const now = new Date().toISOString();
  const character = getCharacter(id);
  let memory = emptyFields();
  if (character) {
    try {
      const registryMemory = getCharacterMemory(character.id);
      memory = {
        personality: normalizeList(registryMemory.personality),
        speechStyle: normalizeList(registryMemory.speechStyle),
        likes: normalizeList(registryMemory.likes),
        dislikes: normalizeList(registryMemory.dislikes),
      };
    } catch {
      memory = emptyFields();
    }
  }
  return {
    id,
    name: character?.name ?? id,
    role: character?.role ?? '',
    description: character?.description ?? '',
    memory,
    visualMemory: id === 'shiro' ? shiroVisualMemoryPreset() : emptyCharacterVisualMemory(),
    memoryV2: legacyToV2(memory, character?.role ?? ''),
    reviewMemory: [],
    relationships: [],
    emotion: emptyEmotionBrain(),
    routine: emptyRoutineBrain(),
    experiences: [],
    messages: [],
    seededFromRegistry: true,
    createdAt: now,
    updatedAt: now,
  };
}

/** List selectable characters (sourced from the Registry) plus memory status. */
export function listMemoryCharacters(): CharacterMemoryListItem[] {
  const store = readStore();
  return listCharacters().map((character) => {
    const entry = store.characters[character.id];
    return {
      id: character.id,
      name: character.name,
      role: character.role,
      description: character.description,
      hasReference: character.hasReference,
      hasMemoryEntry: Boolean(entry),
      updatedAt: entry?.updatedAt ?? '',
      criticalFeatures: entry
        ? sanitizeVisualMemoryForCharacter(character.id, entry.visualMemory).criticalFeatures
        : (character.id === 'shiro' ? [...SHIRO_CRITICAL_FEATURES] : []),
    };
  });
}

/**
 * Get the memory entry for a character, seeding it from the Registry on first
 * access. Throws if the id is unknown to both the store and the Registry.
 */
export function getMemoryCharacter(id: string): CharacterMemoryEntry {
  const normalized = normalizeId(id);
  if (!normalized) throw new Error('character id is required');
  const store = readStore();
  const existing = store.characters[normalized];
  if (existing) {
    return existing;
  }
  if (!getCharacter(normalized)) throw new Error('character not found');
  const seeded = seedEntryFromRegistry(normalized);
  store.characters[normalized] = seeded;
  writeStore(store);
  return seeded;
}

export function appendMemoryMessage(
  id: string,
  input: Pick<CharacterMemoryMessage, 'role' | 'text' | 'imageUrl' | 'referenceImages' | 'storyCard' | 'videoPackage' | 'motionPrompt' | 'aiModels' | 'voiceDirection'>,
): CharacterMemoryEntry {
  const entry = getMemoryCharacter(id);
  const text = normalizeMessageText(input.text);
  const imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '';
  const referenceImages = normalizeList(input.referenceImages);
  const storyCard = normalizeStoryCardSnapshot(input.storyCard);
  const videoPackage = normalizeVideoPackageSnapshot(input.videoPackage, 'append');
  const motionPrompt = typeof input.motionPrompt === 'string' ? input.motionPrompt.trim().slice(0, MAX_MOTION_PROMPT_LENGTH) : '';
  const aiModels = normalizeAIModels(input.aiModels);
  const voiceDirection = normalizeChatVoiceDirection(input.voiceDirection);
  if (!text && !imageUrl && referenceImages.length === 0) throw new Error('text or referenceImages are required');
  const timestamp = new Date().toISOString();
  const message: CharacterMemoryMessage = {
    id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: input.role,
    text,
    ...(imageUrl ? { imageUrl } : {}),
    ...(referenceImages.length > 0 ? { referenceImages } : {}),
    ...(storyCard ? { storyCard } : {}),
    ...(videoPackage ? { videoPackage } : {}),
    ...(motionPrompt ? { motionPrompt } : {}),
    ...(aiModels ? { aiModels } : {}),
    ...(voiceDirection ? { voiceDirection } : {}),
    timestamp,
    createdAt: timestamp,
  };
	if (input.storyCard !== undefined || input.motionPrompt !== undefined) {
		console.log('[STORYCARD_DEBUG_SERVER_MESSAGE_STORYCARD_SAVED]', message.storyCard);
		console.log('[STORYCARD_DEBUG_SERVER_MESSAGE_MOTION_PROMPT_SAVED]', message.motionPrompt);
	}
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const shortTermEntry: MemoryV2Item = { id: `short-${message.id}`, content: `${input.role}: ${text.slice(0, MAX_MESSAGE_LENGTH)}`, importance: 40, source: 'conversation', createdAt: timestamp, expiresAt: expiry };
  const next: CharacterMemoryEntry = {
    ...entry,
    messages: [...entry.messages, message].slice(-MAX_MESSAGES),
    memoryV2: { ...entry.memoryV2, shortTermMemory: [...entry.memoryV2.shortTermMemory, shortTermEntry].slice(-40) },
    updatedAt: new Date().toISOString(),
  };
  const store = readStore();
  store.characters[next.id] = next;
  writeStore(store);
  return next;
}

export function updateMemoryMessageText(
  id: string,
  messageId: string,
  text: string,
  storyCard?: unknown,
  motionPrompt?: unknown,
  videoPackage?: unknown,
  referenceImages?: unknown,
): CharacterMemoryEntry {
  const entry = getMemoryCharacter(id);
  const normalizedText = normalizeMessageText(text);
  const normalizedStoryCard = normalizeStoryCardSnapshot(storyCard);
  const normalizedMotionPrompt = typeof motionPrompt === 'string' ? motionPrompt.trim().slice(0, MAX_MOTION_PROMPT_LENGTH) : '';
  const normalizedVideoPackage = normalizeVideoPackageSnapshot(videoPackage, 'update');
  const normalizedReferenceImages = Array.isArray(referenceImages) ? normalizeList(referenceImages) : undefined;
  if (!normalizedText) throw new Error('text is required');
  let found = false;
  const messages = entry.messages.map((message) => {
    if (message.id !== messageId) return message;
    found = true;
    return {
      ...message,
      text: normalizedText,
      ...(normalizedStoryCard ? { storyCard: normalizedStoryCard } : {}),
	      ...(normalizedVideoPackage ? { videoPackage: normalizedVideoPackage } : {}),
	      ...(normalizedMotionPrompt ? { motionPrompt: normalizedMotionPrompt } : {}),
	      ...(normalizedReferenceImages ? { referenceImages: normalizedReferenceImages } : {}),
	      timestamp: new Date().toISOString(),
    };
  });
  if (!found) throw new Error('message not found');
	const updatedMessage = messages.find((message) => message.id === messageId);
	console.log('[STORYCARD_DEBUG_SERVER_MESSAGE_STORYCARD_SAVED]', updatedMessage?.storyCard);
	console.log('[STORYCARD_DEBUG_SERVER_MESSAGE_MOTION_PROMPT_SAVED]', updatedMessage?.motionPrompt);
  const next: CharacterMemoryEntry = {
    ...entry,
    messages,
    updatedAt: new Date().toISOString(),
  };
  const store = readStore();
  store.characters[next.id] = next;
  writeStore(store);
  return next;
}

export function clearMemoryMessages(id: string): CharacterMemoryEntry {
  const entry = getMemoryCharacter(id);
  const next: CharacterMemoryEntry = {
    ...entry,
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  const store = readStore();
  store.characters[next.id] = next;
  writeStore(store);
  return next;
}

export function clearMemoryMessageProductionState(id: string): { entry: CharacterMemoryEntry; deleted: Record<string, number> } {
  const entry = getMemoryCharacter(id);
  const deleted = { storyCards: 0, motionPrompts: 0, videoPackages: 0, referenceImages: 0, generatedImages: 0 };
  const messages = entry.messages.map((message) => {
    if (message.storyCard) deleted.storyCards += 1;
    if (message.motionPrompt) deleted.motionPrompts += 1;
    if (message.videoPackage) deleted.videoPackages += 1;
    deleted.referenceImages += message.referenceImages?.length ?? 0;
    if (message.imageUrl) deleted.generatedImages += 1;
    const { storyCard: _storyCard, motionPrompt: _motionPrompt, videoPackage: _videoPackage, referenceImages: _referenceImages, imageUrl: _imageUrl, ...rest } = message;
    return rest;
  });
  const next = { ...entry, messages, updatedAt: new Date().toISOString() };
  const store = readStore();
  store.characters[next.id] = next;
  writeStore(store);
  console.log('[STORYCARD_MESSAGE_PRODUCTION_STATE_CLEARED]', { characterId: id, deleted });
  return { entry: next, deleted };
}

/** Save the conversation-derived memory fields. Kept only in this store. */
export function saveMemoryFields(
  id: string,
  fields: Partial<CharacterMemoryFields>,
): CharacterMemoryEntry {
  const entry = getMemoryCharacter(id);
  const next: CharacterMemoryEntry = {
    ...entry,
    memory: normalizeFields(fields),
    updatedAt: new Date().toISOString(),
  };
  const store = readStore();
  store.characters[next.id] = next;
  writeStore(store);
  return next;
}

/** Save only the manually curated Visual Memory layer. */
export function saveCharacterVisualMemory(id: string, value: unknown): CharacterMemoryEntry {
  const entry = getMemoryCharacter(id);
  const next: CharacterMemoryEntry = {
    ...entry,
    visualMemory: sanitizeVisualMemoryForCharacter(id, normalizeCharacterVisualMemory(value)),
    updatedAt: new Date().toISOString(),
  };
  const store = readStore();
  store.characters[next.id] = next;
  writeStore(store);
  return next;
}

export function saveMemoryV2(
  id: string,
  input: Partial<MemoryV2>,
  options: { personaManual?: boolean } = {},
): CharacterMemoryEntry {
  const entry = getMemoryCharacter(id);
  const previous = entry.memoryV2;
  const persona = options.personaManual && input.persona
    ? normalizeMemoryV2({ persona: input.persona }, entry.memory, entry.role).persona
    : previous.persona;
  const longTermMemory = input.longTermMemory
    ? normalizeMemoryItems(input.longTermMemory).filter((item) => item.importance >= 70)
    : previous.longTermMemory;
  const shortTermMemory = input.shortTermMemory
    ? normalizeMemoryItems(input.shortTermMemory, true)
    : previous.shortTermMemory;
  const memoryV2: MemoryV2 = { persona, longTermMemory, shortTermMemory };
  const next: CharacterMemoryEntry = {
    ...entry,
    memoryV2,
    // Compatibility projection deliberately excludes automatic preferences/likes.
    memory: { personality: persona.personality, speechStyle: persona.speechStyle, likes: entry.memory.likes, dislikes: entry.memory.dislikes },
    updatedAt: new Date().toISOString(),
  };
  const store = readStore();
  store.characters[next.id] = next;
  writeStore(store);
  return next;
}

const REVIEW_TECHNICAL_CLAIM_PATTERN = /(?:image\s*(?:generation\s*)?model|video\s*(?:generation\s*)?model|api|provider|system\s*(?:architecture|configuration)|画像生成(?:AI|モデル)?|動画生成(?:AI|モデル)?|API名|プロバイダ|システム構成|技術情報|dall[・\s-]*e|gpt[\s-]*image|nano[\s-]*banana|seedance|gemini|openai|fal\.ai)/iu;

function canonicalReviewTechnicalValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9一-龠ぁ-んァ-ヶ]+/gu, '');
}

function normalizeReviewEvidence(value: unknown): MemoryReviewTechnicalEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): MemoryReviewTechnicalEvidence[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<MemoryReviewTechnicalEvidence>;
    const id = typeof item.id === 'string' ? item.id.trim().slice(0, 180) : '';
    const kind = item.kind === 'model' || item.kind === 'api' || item.kind === 'provider' || item.kind === 'system' ? item.kind : null;
    const key = typeof item.key === 'string' ? item.key.trim().slice(0, 120) : '';
    const evidenceValue = typeof item.value === 'string' ? item.value.trim().slice(0, 300) : '';
    const source = typeof item.source === 'string' ? item.source.trim().slice(0, 180) : '';
    return id && kind && key && evidenceValue && source ? [{ id, kind, key, value: evidenceValue, source }] : [];
  }).slice(-80);
}

function normalizeReviewCandidate(input: MemoryReviewCandidateInput, characterId: string, createdAt: string, index: number, technicalEvidence: MemoryReviewTechnicalEvidence[]): MemoryReviewRecord | null {
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) : '';
  const summary = typeof input.summary === 'string' ? input.summary.trim().slice(0, 600) : '';
  if (!title || !summary) return null;
  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 600) : '';
  const importance = Math.max(0, Math.min(1, Number(input.importance) || 0));
	const evidenceRefs = normalizeList(input.evidenceRefs).slice(0, 8);
	const candidateText = `${title} ${summary} ${reason} ${normalizeList(input.tags).join(' ')}`;
	if (REVIEW_TECHNICAL_CLAIM_PATTERN.test(candidateText)) {
	  const canonicalCandidate = canonicalReviewTechnicalValue(candidateText);
	  const supported = technicalEvidence.some((item) => {
		const canonicalValue = canonicalReviewTechnicalValue(item.value);
		return evidenceRefs.includes(item.id) && canonicalValue.length >= 3 && canonicalCandidate.includes(canonicalValue);
	  });
	  if (!supported) {
		console.warn('[MEMORY_REVIEW_TECHNICAL_SAVE_REJECTED]', { characterId, title, summary, evidenceRefs });
		return null;
	  }
	}
  return {
    id: `review-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    characterId,
    title,
    summary,
    ...(reason ? { reason } : {}),
    importance,
    tags: normalizeList(input.tags).slice(0, 12),
	...(evidenceRefs.length > 0 ? { evidenceRefs } : {}),
    source: 'memory-review',
    createdAt,
  };
}

export function saveMemoryReviewRecords(
  id: string,
  candidates: MemoryReviewCandidateInput[],
	technicalEvidenceInput: unknown = [],
): { entry: CharacterMemoryEntry; saved: MemoryReviewRecord[] } {
  const entry = getMemoryCharacter(id);
  const createdAt = new Date().toISOString();
	const technicalEvidence = normalizeReviewEvidence(technicalEvidenceInput);
  const saved = candidates
	.map((candidate, index) => normalizeReviewCandidate(candidate, entry.id, createdAt, index, technicalEvidence))
    .filter((record): record is MemoryReviewRecord => Boolean(record));
  if (saved.length === 0) return { entry, saved: [] };
  const next: CharacterMemoryEntry = {
    ...entry,
    reviewMemory: [...entry.reviewMemory, ...saved].slice(-120),
    updatedAt: createdAt,
  };
  const store = readStore();
  store.characters[next.id] = next;
  writeStore(store);
  return { entry: next, saved };
}

function normalizeRelationshipUpdate(input: RelationshipUpdateInput, updatedAt: string, index: number): RelationshipItem | null {
  const category = typeof input.category === 'string' ? input.category.trim().slice(0, 80) : '';
  const key = typeof input.key === 'string' ? input.key.trim().slice(0, 120) : '';
  const value = typeof input.value === 'string' ? input.value.trim().slice(0, 500) : '';
  if (!category || !key || !value) return null;
  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 600) : '';
  return {
    id: `relationship-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    category,
    key,
    value,
    confidence: Math.max(0, Math.min(1, Number(input.confidence) || 0)),
    ...(reason ? { reason } : {}),
    updatedAt,
  };
}

export function saveRelationshipItems(
  id: string,
  updates: RelationshipUpdateInput[],
): { entry: CharacterMemoryEntry; saved: RelationshipItem[] } {
  const entry = getMemoryCharacter(id);
  const updatedAt = new Date().toISOString();
  const saved = updates
    .map((update, index) => normalizeRelationshipUpdate(update, updatedAt, index))
    .filter((item): item is RelationshipItem => Boolean(item));
  if (saved.length === 0) return { entry, saved: [] };
  const next: CharacterMemoryEntry = {
    ...entry,
    relationships: [...entry.relationships, ...saved].slice(-160),
    updatedAt,
  };
  const store = readStore();
  store.characters[next.id] = next;
  writeStore(store);
  return { entry: next, saved };
}

function normalizeEmotionSave(input: EmotionSaveInput, createdAt: string): BrainEmotionState | null {
  if (!isEmotionType(input.emotion)) return null;
  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 600) : '';
  if (!reason) return null;
  return {
    id: `emotion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    emotion: input.emotion,
    reason,
    intensity: Math.max(0, Math.min(1, Number(input.intensity) || 0)),
    confidence: Math.max(0, Math.min(1, Number(input.confidence) || 0)),
    createdAt,
  };
}

export function saveEmotionState(
  id: string,
  input: EmotionSaveInput,
): { entry: CharacterMemoryEntry; saved: BrainEmotionState } {
  const entry = getMemoryCharacter(id);
  const createdAt = new Date().toISOString();
  const saved = normalizeEmotionSave(input, createdAt);
  if (!saved) throw new Error('valid emotion is required');
  const emotion: EmotionBrain = {
    current: saved,
    history: [...entry.emotion.history, saved].slice(-30),
  };
  const next: CharacterMemoryEntry = {
    ...entry,
    emotion,
    updatedAt: createdAt,
  };
  const store = readStore();
  store.characters[next.id] = next;
  writeStore(store);
  return { entry: next, saved };
}

export function saveRoutineState(
  id: string,
  input: RoutineUpdateInput,
): { entry: CharacterMemoryEntry; routine: RoutineBrain } {
  const entry = getMemoryCharacter(id);
  const now = new Date().toISOString();
  const state = isCharacterState(input.state) ? input.state : entry.routine.currentState;
  const type = input.type === 'morning' || input.type === 'night' || input.type === 'state' ? input.type : 'state';
  const summary = typeof input.summary === 'string' ? input.summary.trim().slice(0, 800) : '';
  const logEntry: RoutineLogEntry = {
    id: `routine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    state,
    summary,
    createdAt: now,
  };
  const routine: RoutineBrain = {
    currentState: state,
    todaySummary: typeof input.todaySummary === 'string' ? input.todaySummary.trim().slice(0, 1000) : entry.routine.todaySummary,
    todayGoal: typeof input.todayGoal === 'string' ? input.todayGoal.trim().slice(0, 500) : entry.routine.todayGoal,
    morningGreeting: typeof input.morningGreeting === 'string' ? input.morningGreeting.trim().slice(0, 1000) : entry.routine.morningGreeting,
    ...(state === 'Sleeping'
      ? { lastSleepTime: input.lastSleepTime || now }
      : entry.routine.lastSleepTime
        ? { lastSleepTime: entry.routine.lastSleepTime }
        : {}),
    updatedAt: now,
    log: [...entry.routine.log, logEntry].slice(-60),
  };
  const next: CharacterMemoryEntry = {
    ...entry,
    routine,
    updatedAt: now,
  };
  const store = readStore();
  store.characters[next.id] = next;
  writeStore(store);
  return { entry: next, routine };
}

export function saveExperienceNode(
  id: string,
  input: ExperienceInput,
): { entry: CharacterMemoryEntry; experience: Experience } {
  const entry = getMemoryCharacter(id);
  const createdAt = new Date().toISOString();
  const summary = typeof input.summary === 'string' ? input.summary.trim().slice(0, 1000) : '';
  if (!summary) throw new Error('experience summary is required');
  const experience: Experience = {
    id: `experience-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    memoryIds: normalizeList(input.memoryIds).slice(0, 30),
    relationshipIds: normalizeList(input.relationshipIds).slice(0, 30),
    emotionIds: normalizeList(input.emotionIds).slice(0, 30),
    ...(typeof input.routineId === 'string' && input.routineId.trim() ? { routineId: input.routineId } : {}),
    ...(Array.isArray(input.goalIds) ? { goalIds: normalizeList(input.goalIds).slice(0, 30) } : {}),
    importance: Math.max(0, Math.min(1, Number(input.importance) || 0)),
    summary,
  };
  const next: CharacterMemoryEntry = {
    ...entry,
    experiences: [...entry.experiences, experience].slice(-120),
    updatedAt: createdAt,
  };
  const store = readStore();
  store.characters[next.id] = next;
  writeStore(store);
  return { entry: next, experience };
}

/** Applies only character self-disclosed facts; never accepts production or technical text. */
export function applySelfTalkMemory(id: string, input: Partial<CharacterMemoryFields & { relationship: string; longTermMemory: string[]; shortTermMemory: string[] }>): CharacterMemoryEntry {
  const entry = getMemoryCharacter(id);
  const clean = (value: unknown) => normalizeList(value).filter((item) => !/(yaml|motion prompt|seedance|fps|camera|動画設定|技術)/iu.test(item));
  const personality = clean(input.personality);
  const speechStyle = clean(input.speechStyle);
  const likes = clean(input.likes);
  const dislikes = clean(input.dislikes);
  const relationship = typeof input.relationship === 'string' && !/(yaml|motion|seedance|動画設定|技術)/iu.test(input.relationship)
    ? input.relationship.trim().slice(0, 300) : '';
  const longTerm = clean(input.longTermMemory);
  const shortTerm = clean(input.shortTermMemory);
  if (!personality.length && !speechStyle.length && !likes.length && !dislikes.length && !relationship && !longTerm.length && !shortTerm.length) return entry;
  const merge = (base: string[], additions: string[]) => Array.from(new Set([...base, ...additions])).slice(-40);
  const persona = {
    ...entry.memoryV2.persona,
    personality: merge(entry.memoryV2.persona.personality, personality),
    speechStyle: merge(entry.memoryV2.persona.speechStyle, speechStyle),
    relationship: relationship || entry.memoryV2.persona.relationship,
  };
  const now = new Date().toISOString();
  const longTermMemory = [...entry.memoryV2.longTermMemory, ...[...likes, ...dislikes, ...longTerm].map((content, index) => ({ id: `self-${Date.now()}-${index}`, content, importance: 75, source: 'self_talk' as const, createdAt: now }))].slice(-80);
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const shortTermMemory = [...entry.memoryV2.shortTermMemory, ...shortTerm.map((content, index) => ({ id: `short-auto-${Date.now()}-${index}`, content, importance: 40, source: 'conversation' as const, createdAt: now, expiresAt }))].slice(-80);
  const next: CharacterMemoryEntry = { ...entry, memory: { personality: persona.personality, speechStyle: persona.speechStyle, likes: merge(entry.memory.likes, likes), dislikes: merge(entry.memory.dislikes, dislikes) }, memoryV2: { ...entry.memoryV2, persona, longTermMemory, shortTermMemory }, updatedAt: now };
  const store = readStore(); store.characters[next.id] = next; writeStore(store); return next;
}

function assetDir(id: string): string {
  const normalized = normalizeId(id);
  if (!/^[a-z0-9_-]+$/.test(normalized)) throw new Error('invalid character id');
  const dir = resolve(ASSET_ROOT, normalized);
  if (dir !== ASSET_ROOT && !dir.startsWith(`${ASSET_ROOT}\\`) && !dir.startsWith(`${ASSET_ROOT}/`)) {
    throw new Error('invalid asset directory');
  }
  return dir;
}

/**
 * Persist an image (data URL) for a character and return its served URL.
 * Images are stored on disk so the JSON store stays lean and independent.
 */
export function saveMemoryImageFromDataUrl(id: string, dataUrl: string): string {
  const normalized = normalizeId(id);
  if (!getMemoryCharacter(normalized)) throw new Error('character not found');
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error('image must be a base64 data URL');
  const ext = IMAGE_EXT_BY_MIME[match[1].toLowerCase()] ?? 'png';
  const dir = assetDir(normalized);
  mkdirSync(dir, { recursive: true });
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  writeFileSync(join(dir, fileName), Buffer.from(match[2], 'base64'));
  return `/api/character-memory/${normalized}/image/${fileName}`;
}

/** Read a stored image for serving. Returns null when missing. */
export function readMemoryImage(
  id: string,
  fileName: string,
): { buffer: Buffer; contentType: string } | null {
  if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(fileName) || fileName.includes('..')) return null;
  const file = join(assetDir(id), fileName);
  if (!existsSync(file)) return null;
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return { buffer: readFileSync(file), contentType: MIME_BY_IMAGE_EXT[ext] ?? 'application/octet-stream' };
}

/** Remove a character-owned image file. Metadata is updated separately. */
export function deleteMemoryImage(id: string, fileName: string): boolean {
  if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(fileName) || fileName.includes('..')) return false;
  const file = join(assetDir(id), fileName);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}

/**
 * Read-only memory contexts for downstream features (e.g. Manga Chat).
 * Returns only characters that already have a memory entry in this store.
 */
export function getMemoryContexts(ids: string[] = []): CharacterMemoryContext[] {
  const store = readStore();
  const requested = new Set(ids.map(normalizeId).filter(Boolean));
  return Object.values(store.characters)
    .filter((entry) => requested.size === 0 || requested.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      role: entry.role,
      description: entry.description,
      memory: entry.memory,
      visualMemory: entry.visualMemory,
    }));
}

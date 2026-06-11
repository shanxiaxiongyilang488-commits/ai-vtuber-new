import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AVAILABLE_MEDIA_MODELS, generateMediaImage, logAvailableMediaModels, resolveMediaModel } from '$lib/server/mediaProviders/registry';
import {
  buildComicPanelStoryText,
  buildComicPagePromptFromPanels,
  buildImagePromptFromYamlPanel,
  getYamlScenePanel,
  parseYamlSceneDocument,
} from '$lib/server/yamlSceneParser';
import { getCharacter, getCharacterReferenceDataUrl } from '$lib/server/characterRegistry';
import type { GeneratedImage, ImageSize } from '$lib/server/imageProviders/types';

const DEFAULT_FAL_IMAGE_MODEL = 'fal-ai/nano-banana-pro';
const VALID_SIZES = ['1024x1024', '1024x1536', '1536x1024', '1792x1024', '1024x1792'] as const;

type YamlImageRequest = {
  userInput?: string;
  renderMode?: 'manga' | 'illustration';
  speechBubble?: boolean;
  routerResult?: {
    intent?: string;
    action?: string;
    subtype?: string;
    confidence?: number;
    reason?: string;
    source?: string;
  } | null;
  yaml?: string;
  activeStory?: {
    id?: string;
    title?: string;
    yaml?: string;
    summary?: string;
    characters?: unknown[];
    pages?: unknown[];
    referenceImages?: Array<{
      id?: string;
      name?: string;
      path?: string;
      type?: 'manga_page';
      createdAt?: string;
      active?: boolean;
    }>;
  } | null;
  storyReferenceImages?: string[];
  characterBible?: {
    unitId?: string;
    characters?: Array<{
      id?: string;
      hairColor?: string;
      eyeColor?: string;
      ears?: string;
      tail?: string;
      androidParts?: string;
      outfit?: string;
      accessories?: string;
      appearance?: string;
    }>;
  } | null;
  characterBibleMeta?: {
    source?: string;
    id?: string;
    fileName?: string;
  } | null;
  characterRefImages?: string[];
  characterRefs?: Array<{
    source?: string;
    id?: string;
    name?: string;
    role?: string;
    description?: string;
    fileName?: string;
    image?: string;
  }>;
  storyRefs?: Array<{
    source?: string;
    id?: string;
    name?: string;
    fileName?: string;
    kind?: 'story' | 'manga';
    content?: string;
  }>;
  refImages?: string[];
  model?: string;
  size?: ImageSize;
};

type CharacterBible = NonNullable<YamlImageRequest['characterBible']>;
const MANGA_PROMPT_DEBUG_TERMS = ['猫耳メンテ', 'N-01', 'N-02'] as const;

function namesFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.flatMap((item) => {
    if (typeof item === 'string') return [item.trim()];
    if (!item || typeof item !== 'object') return [];
    const record = item as { name?: unknown };
    return typeof record.name === 'string' ? [record.name.trim()] : [];
  }).filter(Boolean)));
}

function activePagePanelCount(pages: unknown[] | undefined): number {
  const page = pages?.at(-1);
  if (!page || typeof page !== 'object') return 0;
  const record = page as { scenes?: unknown; panels?: unknown };
  if (Array.isArray(record.scenes)) return record.scenes.length;
  if (Array.isArray(record.panels)) return record.panels.length;
  return 0;
}

function buildAllowedCharactersPrompt(names: string[]): string {
  if (names.length === 0) return '';
  return [
    'STRICT CHARACTER ALLOWLIST:',
    `Only these characters may appear: ${names.join(', ')}.`,
    'Do not invent, add, imply, silhouette, or place any other person in the foreground or background.',
    'Every visible person must be one of the allowed characters. Background crowds and unnamed extras are forbidden.',
  ].join('\n');
}

function matchingLines(text: string, term: string): string[] {
  const normalizedTerm = term.toLocaleLowerCase('ja-JP');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.toLocaleLowerCase('ja-JP').includes(normalizedTerm));
}

function buildMangaPromptKeywordTrace(stages: Record<string, string>) {
  return Object.fromEntries(MANGA_PROMPT_DEBUG_TERMS.map((term) => [
    term,
    Object.fromEntries(Object.entries(stages).map(([stage, text]) => {
      const lines = matchingLines(text, term);
      return [stage, {
        found: lines.length > 0,
        matchingLines: lines,
      }];
    })),
  ]));
}

function buildCharacterConsistencyPrompt(
  characterBible: CharacterBible | null,
  allowedIds: Set<string> | null = null,
): string {
  if (!characterBible) return '';

  const characterRules = characterBible.characters
    ?.filter((character) =>
      !allowedIds
      || allowedIds.size === 0
      || allowedIds.has(character.id?.trim().toLocaleLowerCase('ja-JP') ?? ''),
    )
    ?.map((character) => {
      const id = character.id?.trim();
      if (!id) return '';
      const traits = [
        character.hairColor ? `hair: ${character.hairColor}` : '',
        character.eyeColor ? `eyes: ${character.eyeColor}` : '',
        character.ears ? `ears: ${character.ears}` : '',
        character.tail ? `tail: ${character.tail}` : '',
        character.androidParts ? `android parts: ${character.androidParts}` : '',
        character.outfit ? `outfit: ${character.outfit}` : '',
        character.accessories ? `accessories: ${character.accessories}` : '',
        character.appearance ? `appearance: ${character.appearance}` : '',
      ].filter(Boolean).join(', ');
      return traits ? `${id} must keep ${traits}.` : `${id} must keep the reference-image design.`;
    })
    .filter(Boolean) ?? [];

  return [
    'CHARACTER CONSISTENCY ONLY:',
    'Keep recurring characters visually identical across every panel.',
    'Use the supplied reference images as the authoritative appearance source.',
    ...characterRules,
    'These rules control appearance only. They must not change the comic layout or story progression.',
  ].join('\n');
}

function buildRegisteredCharacterPrompt(
  characterRefs: YamlImageRequest['characterRefs'],
  allowedNames: Set<string> | null = null,
): string {
  const characters = (characterRefs ?? [])
    .filter((ref) =>
      !allowedNames
      || allowedNames.size === 0
      || allowedNames.has(ref?.name?.trim().toLocaleLowerCase('ja-JP') ?? ''),
    )
    .filter((ref) => ref?.name?.trim() || ref?.id?.trim())
    .map((ref) => [
      `id=${ref.id?.trim() || 'unknown'}`,
      `name=${ref.name?.trim() || ref.id?.trim() || 'unknown'}`,
      ref.role?.trim() ? `role=${ref.role.trim()}` : '',
      ref.description?.trim() ? `description=${ref.description.trim()}` : '',
    ].filter(Boolean).join(', '));
  if (characters.length === 0) return '';
  return [
    'REGISTERED CHARACTER MEMORY:',
    'These are persistent existing characters, not newly invented characters.',
    'Keep every registered name and role unchanged. Match each supplied image to its registered character.',
    ...characters,
  ].join('\n');
}

function extractContinuityPrompt(yaml: string): string {
  const section = yaml.match(/^continuity:\s*\n((?:[ \t]+.*(?:\n|$))*)/m)?.[0]?.trim();
  return section
    ? `STORY CONTINUITY MEMORY:\nThis is a continuation, not a new story. Apply these facts without changing character names, relationships, title, location, or chronology.\n${section}`
    : '';
}

function resolveFalImageModel(raw?: string) {
  const input = raw || DEFAULT_FAL_IMAGE_MODEL;
  const requested = resolveMediaModel(raw || DEFAULT_FAL_IMAGE_MODEL);
  console.log('[yaml-image] resolveFalImageModel requested', {
    raw: raw ?? null,
    input,
    requestedProvider: requested.provider,
    requestedModel: requested.id,
    requestedApiModel: requested.apiModel,
  });
  if (requested.provider === 'fal') {
    console.log('[yaml-image] resolveFalImageModel resolved', {
      reason: 'requested_provider_is_fal',
      resolvedProvider: requested.provider,
      resolvedModel: requested.id,
      resolvedApiModel: requested.apiModel,
    });
    return requested;
  }
  const fallback = AVAILABLE_MEDIA_MODELS.find((model) => model.apiModel === DEFAULT_FAL_IMAGE_MODEL) ?? resolveMediaModel(DEFAULT_FAL_IMAGE_MODEL);
  console.log('[yaml-image] resolveFalImageModel fallback', {
    reason: 'requested_provider_not_fal',
    raw: raw ?? null,
    requestedProvider: requested.provider,
    requestedModel: requested.id,
    fallbackProvider: fallback.provider,
    fallbackModel: fallback.id,
    fallbackApiModel: fallback.apiModel,
  });
  return fallback;
}

type ResolvedCharacterRef = {
  source: string;
  id: string;
  fileName: string;
  image: string;
};

function registryReferenceImagesFromText(text: string): ResolvedCharacterRef[] {
  const ids = Array.from(new Set([
    ...Array.from(text.matchAll(/\bcharacter:([a-z0-9_-]+)\b/gi)).map((match) => match[1].toLowerCase()),
    ...Array.from(text.matchAll(/\bN-\d{2}\b/gi)).map((match) => match[0].toLowerCase()),
  ]));

  return ids
    .map((id) => {
      try {
        console.log('[YAML_CHARACTER_LOOKUP]', id);
        const ref = getCharacterReferenceDataUrl(id);
        if (ref) {
          console.log('[YAML_CHARACTER_FOUND]', id);
          console.log('[YAML_IMAGE_REF]', id);
        }
        return ref ? {
          source: 'character_registry',
          id,
          fileName: `data/project/characters/${id}.yaml`,
          image: ref,
        } : null;
      } catch (caughtError) {
        console.warn('[YAML_IMAGE_REF_ERROR]', id, caughtError);
        return null;
      }
    })
    .filter((ref): ref is ResolvedCharacterRef => Boolean(ref));
}

function storyCharacterRefIds(yaml: string): string[] {
  const block = yaml.match(/(?:^|\n)refs:\s*\n([\s\S]*?)(?=\n[A-Za-z0-9_]+:|$)/i)?.[1] ?? '';
  return Array.from(new Set(block
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s*["']?([a-z0-9_-]+)["']?\s*$/i)?.[1] ?? '')
    .map((id) => id.toLowerCase())
    .filter(Boolean)));
}

export const POST: RequestHandler = async ({ request }) => {
  let body: YamlImageRequest;
  try {
    body = await request.json();
  } catch (caughtError) {
    console.error('[YAML_IMAGE_ERROR]', caughtError);
    throw error(400, 'Invalid JSON');
  }

  const storyRefs = (body.storyRefs ?? [])
    .filter((ref) => ref && typeof ref.content === 'string' && ref.content.trim())
    .map((ref) => ({
      source: typeof ref.source === 'string' && ref.source.trim() ? ref.source.trim() : 'request_story_ref',
      id: typeof ref.id === 'string' && ref.id.trim() ? ref.id.trim() : (ref.name?.trim() || 'story-ref'),
      name: typeof ref.name === 'string' && ref.name.trim() ? ref.name.trim() : 'story-ref.yaml',
      fileName: typeof ref.fileName === 'string' && ref.fileName.trim()
        ? ref.fileName.trim()
        : (ref.name?.trim() || 'story-ref.yaml'),
      kind: ref.kind === 'manga' ? 'manga' as const : 'story' as const,
      content: ref.content!.trim(),
    }));
  const selectedStoryRef = storyRefs.at(-1) ?? null;
  const yaml = selectedStoryRef?.content ?? body.yaml?.trim();
  if (!yaml) throw error(400, 'yaml or storyRefs is required');
  const requestedStoryCharacterNames = namesFromUnknown(body.activeStory?.characters);
  const requestedStoryCharacterSet = new Set(
    requestedStoryCharacterNames.map((name) => name.toLocaleLowerCase('ja-JP')),
  );
  const projectCharacterIds = storyCharacterRefIds(yaml);
  const projectCharacters = projectCharacterIds.flatMap((id) => {
    const character = getCharacter(id);
    const image = getCharacterReferenceDataUrl(id);
    return character?.characterBible ? [{
      character,
      image,
    }] : [];
  });
  const projectCharacterBible: CharacterBible | null = projectCharacters.length > 0
    ? {
      unitId: projectCharacterIds.map((id) => id.toUpperCase()).join('+'),
      characters: projectCharacters.flatMap(({ character }) => character.characterBible?.characters ?? []),
    }
    : null;
  const requestCharacterBible = body.characterBible?.unitId?.trim()
    && Array.isArray(body.characterBible.characters)
    && body.characterBible.characters.length > 0
    ? body.characterBible
    : null;
  const characterBible = projectCharacterBible ?? requestCharacterBible;
  const projectCharacterRefImages = projectCharacters
    .map(({ image }) => image)
    .filter((image): image is string => Boolean(image));
  const suppliedCharacterRefImages = (body.characterRefImages ?? body.refImages ?? [])
    .filter((image): image is string => typeof image === 'string' && image.startsWith('data:image/'));
  const storyReferenceImages = (body.storyReferenceImages ?? [])
    .filter((image): image is string => typeof image === 'string' && image.startsWith('data:image/'));
  const requestCharacterRefImages = projectCharacterRefImages.length > 0
    ? projectCharacterRefImages
    : suppliedCharacterRefImages;
  const activeCharacterRefs = requestCharacterRefImages.map((image, index) => {
    const projectCharacter = projectCharacters[index]?.character;
    const meta = projectCharacter
      ? {
        source: 'project_character_library',
        id: projectCharacter.id,
        name: projectCharacter.name,
        role: projectCharacter.role,
        description: projectCharacter.description,
        fileName: `data/project/characters/${projectCharacter.id}.yaml`,
      }
      : (body.characterRefs?.find((ref) => ref.image === image) ?? body.characterRefs?.[index]);
    return {
      source: meta?.source?.trim() || 'request_character_ref',
      id: meta?.id?.trim() || `REF-${index + 1}`,
      name: meta?.name?.trim() || meta?.id?.trim() || `REF-${index + 1}`,
      role: meta?.role?.trim() || '',
      description: meta?.description?.trim() || '',
      fileName: meta?.fileName?.trim() || `character-ref-${index + 1}.png`,
      image,
    };
  }).filter((ref) =>
    requestedStoryCharacterSet.size === 0
    || requestedStoryCharacterSet.has(ref.name.toLocaleLowerCase('ja-JP')),
  );
  console.log('[MANGA_LAB_INPUT_STATUS]', {
    characterRefCount: requestCharacterRefImages.length,
    storyRefCount: storyRefs.length,
    selectedStoryRef: selectedStoryRef?.name ?? null,
    hasCharacterBible: Boolean(characterBible),
    hasStoryYaml: Boolean(yaml),
    projectCharacterIds,
    characterSource: projectCharacters.length > 0 ? 'project_character_library' : 'request',
  });
  console.log('[STORY_REF_IMAGE]', {
    storyId: body.activeStory?.id ?? null,
    imageCount: storyReferenceImages.length,
    activeImage: body.activeStory?.referenceImages?.find((image) => image.active)?.name ?? null,
  });
  console.log('[MANGA_GENERATION_CONTEXT]', {
    storyTitle: body.activeStory?.title ?? selectedStoryRef?.name ?? '',
    yamlLoaded: Boolean(yaml),
    referenceImages: storyReferenceImages.length,
  });
  if (characterBible && activeCharacterRefs.length === 0) {
    console.warn('[MANGA_LAB_ABORT]', 'CharacterBible exists but REF image count is 0');
    throw error(400, 'CharacterBible exists but REF images are required');
  }

  const size = body.size ?? '1024x1024';
  if (!VALID_SIZES.includes(size)) throw error(400, `size must be one of: ${VALID_SIZES.join(', ')}`);

  logAvailableMediaModels();

  const document = parseYamlSceneDocument(yaml);
  const allowedCharacterNames = requestedStoryCharacterNames.length > 0
    ? requestedStoryCharacterNames
    : document.allowedCharacters;
  const allowedCharacterSet = new Set(
    allowedCharacterNames.map((name) => name.toLocaleLowerCase('ja-JP')),
  );
  const isAllowedCharacter = (name: string) =>
    !name.trim()
    || allowedCharacterSet.size === 0
    || allowedCharacterSet.has(name.trim().toLocaleLowerCase('ja-JP'));
  const isAllowedDialogue = (line: string) => {
    const speaker = line.trim().match(/^([^:：]{1,40})[:：]/)?.[1]?.trim();
    return !speaker || isAllowedCharacter(speaker);
  };
  const activePanelCount = activePagePanelCount(body.activeStory?.pages);
  const activePanels = activePanelCount > 0
    ? document.panels.slice(-activePanelCount)
    : document.panels;
  const filteredPanels = activePanels.map((item) => ({
    ...item,
    chars: item.chars.filter((character) =>
      isAllowedCharacter(character.name) && isAllowedDialogue(character.line),
    ),
  }));
  const promptDocument = {
    ...document,
    storySummary: document.storySummary || body.activeStory?.summary?.trim() || '',
    chars: document.chars.filter((character) =>
      isAllowedCharacter(character.name) && isAllowedDialogue(character.line),
    ),
    panels: filteredPanels,
  };
  const comicPageLayout = filteredPanels.length > 1
    || ['4panel', 'manga4', 'comic', 'manga', 'manga8', '8panel'].includes(document.layout.trim().toLowerCase());
  if (comicPageLayout && activeCharacterRefs.length === 0 && storyReferenceImages.length === 0) {
    console.warn('[MANGA_LAB_ABORT]', 'Comic page generation requires REF images');
    throw error(400, 'REF images are required for comic page generation');
  }
  const panel = comicPageLayout ? null : getYamlScenePanel(promptDocument);
  const comicPanels = comicPageLayout ? filteredPanels : [];
  if (comicPageLayout && comicPanels.length === 0) throw error(400, 'comic page panels were not found in YAML');
  if (!comicPageLayout && !panel) throw error(400, 'first scene/panel was not found in YAML');

  const basePrompt = comicPageLayout
    ? buildComicPagePromptFromPanels(promptDocument, comicPanels)
    : buildImagePromptFromYamlPanel(promptDocument, panel!);
  const panelStoryText = comicPageLayout ? buildComicPanelStoryText(comicPanels) : '';
  const allowedCharactersPrompt = buildAllowedCharactersPrompt(allowedCharacterNames);
  const allowedCharacterRefIds = new Set(
    activeCharacterRefs.map((ref) => ref.id.toLocaleLowerCase('ja-JP')),
  );
  const characterConsistencyPrompt = buildCharacterConsistencyPrompt(
    characterBible,
    allowedCharacterRefIds,
  );
  const registeredCharacterPrompt = buildRegisteredCharacterPrompt(
    body.characterRefs,
    allowedCharacterSet,
  );
  const continuityPrompt = extractContinuityPrompt(yaml);
  const storyPageReferencePrompt = storyReferenceImages.length > 0
    ? [
      'The supplied manga page image is the previous page of this story.',
      'Maintain its characters, art style, color palette, panel layout language, and speech-bubble atmosphere.',
      'However, the new page content must follow the Story YAML.',
      'この画像は前ページの漫画です。',
      'キャラクター、絵柄、配色、コマ割り、吹き出しの雰囲気を維持してください。',
      'ただし新しいページ内容はStory YAMLに従ってください。',
    ].join('\n')
    : '';
  const prompt = [
    basePrompt,
    allowedCharactersPrompt,
    body.renderMode === 'illustration'
      ? 'ILLUSTRATION MODE: Do not draw speech bubbles or dialogue text.'
      : 'MANGA MODE: speech_bubble=true. If dialogue exists, every line must be drawn in a readable manga speech bubble. Never omit a speech bubble for existing dialogue.',
    characterConsistencyPrompt,
    registeredCharacterPrompt,
    continuityPrompt,
    storyPageReferencePrompt,
    activeCharacterRefs.length > 0 && !characterConsistencyPrompt
      ? 'Use the supplied reference images as the primary and authoritative character appearance source.'
      : '',
  ].filter(Boolean).join('\n\n');
  const panelModel = comicPageLayout
    ? comicPanels.find((item) => item.model)?.model
    : panel!.model;
  const mediaModel = resolveFalImageModel(panelModel || body.model);
  const chars = comicPageLayout
    ? promptDocument.chars
    : (panel!.chars.length > 0 ? panel!.chars : promptDocument.chars);
  const charNames = chars.map((char) => char.name).filter(Boolean);
  console.log('[YAML_PLAN_CHARS]', charNames);
  console.log('[YAML_REFS]', document.chars.map((char) => char.name).filter(Boolean));
  console.log('[YAML_ACTIVE_PAGE]', {
    requestedPageCount: body.activeStory?.pages?.length ?? 0,
    activePanelCount: filteredPanels.length,
    totalParsedPanels: document.panels.length,
  });
  console.log('[YAML_ALLOWED_CHARACTERS]', allowedCharacterNames);
  const plan = {
    panel: comicPageLayout ? 'comic_page' : 'panel_1',
    layout: document.layout,
    chars,
    scene: comicPageLayout ? comicPanels.map((item) => item.scene).filter(Boolean).join(' / ') : panel!.scene,
    panels: comicPageLayout ? comicPanels : undefined,
    model: mediaModel.id,
  };

  console.log(
    '[YAML_IMAGE_PIPELINE]',
    comicPageLayout
      ? 'YAML -> Parser -> Comic Page -> All Panels -> Prompt -> Media Provider(FAL)'
      : 'YAML -> Parser -> Scene -> Character -> Prompt -> Media Provider(FAL)',
  );
  console.log('[YAML_IMAGE_PLAN]', plan);
  console.log('[YAML_LAYOUT]', document.layout || '(none)');
  console.log('[YAML_PANEL]', comicPageLayout ? 'comic_page' : 'panel_1');
  console.log('[YAML_PANEL_PARSED]', comicPageLayout ? comicPanels : panel);
  console.log('[YAML_SCENE]', comicPageLayout ? plan.scene || '(none)' : panel!.scene || '(none)');
  console.log('[YAML_CHARS]', chars);
  console.log('[PANEL_CHAR_COUNT]', chars.length);
  console.log('[YAML_IMAGE_PROMPT]', prompt);
  console.log('[yaml-image] mediaProvider/mediaModel assignment', {
    assignedFrom: 'resolveFalImageModel(panelModel || body.model)',
    panelModel: panelModel ?? null,
    bodyModel: body.model ?? null,
    resolvedProviderForRoute: 'fal',
    resolvedModel: mediaModel.id,
    resolvedApiModel: mediaModel.apiModel,
  });
  console.log('[MEDIA_PROVIDER]', 'fal');
  console.log('[MEDIA_MODEL]', mediaModel.id);
  const registryRefs = registryReferenceImagesFromText(`${prompt}\n${charNames.join('\n')}`);
  const finalCharacterRefs = [...activeCharacterRefs, ...registryRefs].filter((ref, index, refs) =>
    refs.findIndex((candidate) => candidate.image === ref.image) === index,
  );
  const refImages = [
    ...finalCharacterRefs.map((ref) => ref.image),
    ...storyReferenceImages,
  ].filter((image, index, images) => images.indexOf(image) === index);
  console.log('[YAML_IMAGE_REF_COUNT]', refImages.length);
  console.log('[YAML_IMAGE_REF_PRIORITY]', {
    primaryCharacterRefs: activeCharacterRefs.length,
    supplementalRegistryRefs: registryRefs.length,
  });
  console.log('[STORY_REFS]', storyRefs.map((ref) => ({
    name: ref.name,
    kind: ref.kind,
    length: ref.content.length,
    selected: ref === selectedStoryRef,
  })));

  const activeImages = new Set(activeCharacterRefs.map((ref) => ref.image));
  const passedImages = new Set(finalCharacterRefs.map((ref) => ref.image));
  const missingActiveRefs = activeCharacterRefs.filter((ref) => !passedImages.has(ref.image));
  const unexpectedPassedRefs = finalCharacterRefs.filter((ref) => !activeImages.has(ref.image));
  const refsMatch = missingActiveRefs.length === 0 && unexpectedPassedRefs.length === 0;
  const activeCharacterRefMetadata = activeCharacterRefs.map(({ image: _image, ...ref }) => ref);
  const passedCharacterRefMetadata = finalCharacterRefs.map(({ image: _image, ...ref }) => ref);
  const imageGenerationInput = {
    activeCharacterRefs: activeCharacterRefMetadata,
    passedCharacterRefs: passedCharacterRefMetadata,
    characterRefs: finalCharacterRefs.map(({ image: _image, ...ref }) => ({
      ...ref,
      active: activeImages.has(_image),
      passedToImageModel: passedImages.has(_image),
    })),
    characterBible: characterBible ? {
      source: body.characterBibleMeta?.source?.trim() || 'request_character_bible',
      id: body.characterBibleMeta?.id?.trim() || characterBible.unitId || '(unknown)',
      fileName: body.characterBibleMeta?.fileName?.trim() || 'character.yaml',
    } : null,
    storyRefs: storyRefs.map((ref) => ({
      source: ref.source,
      id: ref.id,
      fileName: ref.fileName,
      active: ref === selectedStoryRef,
      passedToPrompt: ref === selectedStoryRef,
    })),
    activeStory: body.activeStory ?? null,
    storyReferenceImages: {
      count: storyReferenceImages.length,
      passedToImageModel: storyReferenceImages.length,
    },
  };
  console.log('[IMAGE_GENERATION_INPUT]', imageGenerationInput);
  console.log('[IMAGE_GENERATION_INPUT_CHARACTER_REFS]', imageGenerationInput.characterRefs);
  console.log('[IMAGE_GENERATION_INPUT_CHARACTER_BIBLE]', imageGenerationInput.characterBible);
  console.log('[IMAGE_GENERATION_INPUT_STORY_REFS]', imageGenerationInput.storyRefs);
  if (!refsMatch) {
    console.warn('[IMAGE_GENERATION_REF_MISMATCH]', {
      activeCharacterRefs: activeCharacterRefMetadata,
      passedCharacterRefs: passedCharacterRefMetadata,
      missingActiveRefs: missingActiveRefs.map(({ image: _image, ...ref }) => ref),
      unexpectedPassedRefs: unexpectedPassedRefs.map(({ image: _image, ...ref }) => ref),
    });
  }

  const finalPrompt = prompt;
  const model = mediaModel.apiModel;
  const referenceImages = refImages;
  if (comicPageLayout) {
    const debugStages = {
      originalYaml: yaml,
      panelStoryText,
      characterConsistencyRules: characterConsistencyPrompt,
      finalEnglishPrompt: finalPrompt,
    };
    console.log('[MANGA_PROMPT_DEBUG][1_ORIGINAL_YAML]', debugStages.originalYaml);
    console.log('[MANGA_PROMPT_DEBUG][2_PANEL_STORY_TEXT]', debugStages.panelStoryText);
    console.log(
      '[MANGA_PROMPT_DEBUG][3_CHARACTER_CONSISTENCY_RULES]',
      debugStages.characterConsistencyRules || '(none)',
    );
    console.log('[MANGA_PROMPT_DEBUG][4_FINAL_ENGLISH_PROMPT]', debugStages.finalEnglishPrompt);
    console.log(
      '[MANGA_PROMPT_DEBUG][KEYWORD_TRACE]',
      buildMangaPromptKeywordTrace(debugStages),
    );
  }
  console.log(
    '[FINAL_IMAGE_PROMPT]',
    finalPrompt,
  );
  console.log(
    '[FINAL_IMAGE_MODEL]',
    model,
  );
  console.log(
    '[REF_IMAGES]',
    referenceImages,
  );
  console.log(
    '[CHARACTER_REF_IMAGES]',
    referenceImages,
  );
  console.log('[IMAGE_GENERATION_ROUTE_AUDIT]', {
    USER_INPUT: body.userInput ?? '',
    ROUTER_RESULT: body.routerResult ?? null,
    FINAL_PROMPT: finalPrompt,
  });
  console.log('[USER_INPUT]', body.userInput ?? '');
  console.log('[ROUTER_RESULT]', body.routerResult ?? null);
  console.log('[FINAL_PROMPT]', finalPrompt);
  if (comicPageLayout) {
    console.log(
      '[PROMPT_TEMPLATE][generate_manga_page]',
      [
        'STRICT REQUIREMENTS:',
        'Generate ONE manga page.',
        'Must contain EXACTLY {{panel_count}} comic panels.',
        'Panels must be visually separated.',
        'Each panel must follow the YAML story progression.',
        'Do NOT create a character poster, character sheet, reference sheet, or single illustration.',
        'Style: Japanese manga page, comic storytelling, clear panel layout.',
        '{{overall_story}}',
        '{{page_direction}}',
        '{{panel_story_text}}',
        '{{character_consistency_rules}}',
      ].join('\n'),
    );
    console.log('[ACTUAL_IMAGE_PROMPT][generate_manga_page]', finalPrompt);
  }

  const result = await generateMediaImage({
    prompt: finalPrompt,
    size,
    model,
    requestedModel: mediaModel.id,
    refImages: referenceImages,
    editMode: referenceImages.length > 0,
  });
  const images: GeneratedImage[] = result.images;

  return json({
    images,
    prompt,
    plan,
    imageGenerationInput,
    storyRef: selectedStoryRef ? { name: selectedStoryRef.name, kind: selectedStoryRef.kind } : null,
    panel: comicPageLayout ? 'comic_page' : 'panel_1',
    scene: plan.scene,
    chars,
    provider: 'fal',
    model: mediaModel.id,
  });
};

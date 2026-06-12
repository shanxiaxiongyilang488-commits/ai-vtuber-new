<script lang="ts">
  import { onMount } from 'svelte';
  import {
    AVAILABLE_IMAGE_MODELS,
    AVAILABLE_MEDIA_PROVIDER_OPTIONS,
    normalizeMediaModelId,
    type MediaProviderName,
  } from '$lib/config/mediaModels';

  // ============================================================
  // State
  // ============================================================
  type ImageSize = '1024x1024' | '1024x1536' | '1536x1024' | '1792x1024' | '1024x1792';
  type OpenAIImageSize = '1024x1024' | '1024x1536' | '1536x1024';
  const UI_LOCALE = 'ja' as const;
  const OPENAI_IMAGE_SIZES: OpenAIImageSize[] = ['1024x1024', '1024x1536', '1536x1024'];

  let size          = $state<ImageSize>('1024x1024');
  let imageProvider = $state<'openai' | 'fal' | 'ideogram'>('fal');
  let imageModel    = $state('fal-ai/nano-banana');
  let imageSize     = $state<OpenAIImageSize>('1024x1024');
  let generating    = $state(false);
  let previewUrl      = $state<string | null>(null);
  let previewVideoUrl = $state<string | null>(null);
  let revisedPrompt   = $state<string | null>(null);
  let errorMsg      = $state('');
  let yamlText      = $state('');
  let parsedPanels  = $state<Array<{ scene: string; dialogue: string; prompt: string }>>([]);
  $effect(() => { parsedPanels = parseYamlPanels(yamlText); });
  let storyText     = $state('');
  let characterLock = true;
  let generatedPanels: string[] = [];
  let mangaPageMode = $state<1 | 2>(1);

  type RefImage = {
    thumb:     string;    // display thumbnail (THUMB_PX) — UI only
    thumbs:    string[];  // all display thumbnails — UI only
    originals: string[];  // full-resolution data URLs — sent to Vision / image generation APIs
    label:     string;    // user-editable text injected into prompt
    name:      string;    // primary filename
    names:     string[];  // all filenames
  };

  function normalizeRef(r: RefImage | null): RefImage | null {
    if (!r) return null;
    return {
      ...r,
      thumbs:    r.thumbs?.length    ? r.thumbs    : (r.thumb ? [r.thumb] : []),
      originals: r.originals?.length ? r.originals : [],
      names:     r.names?.length     ? r.names     : (r.name  ? [r.name]  : []),
    };
  }

  const emptyRefImage = (): RefImage => ({
    thumb: '',
    thumbs: [],
    originals: [],
    label: '',
    name: 'Reference',
    names: [],
  });

  type LayoutId = 'single' | '2panel' | 'vertical3' | 'free' | 'free_page';
  type PanelSize = 'small' | 'medium' | 'large' | 'splash';

  const LAYOUTS: { id: LayoutId; label: string; count: number | null }[] = [
    { id: 'single',    label: '1枚絵',   count: 1    },
    { id: '2panel',    label: '2コマ',   count: 2    },
    { id: 'vertical3', label: '3コマ',   count: 3    },
    { id: 'free_page', label: 'Free Page', count: null },
    { id: 'free',      label: 'Free',      count: null },
  ];
  const RECOMMENDED_MAX_PANELS_PER_PAGE = 8;

  function normalizeLayoutId(raw: string | null | undefined, fallback: LayoutId = 'free_page'): LayoutId {
    if (raw === 'free_page') return 'free_page';
    if (raw === 'single' || raw === '2panel' || raw === 'vertical3' || raw === 'free') return raw;
    if (raw === '3vertical') return 'vertical3';
    return fallback;
  }

  function layoutForPanelCount(count: number): LayoutId {
    return 'free_page';
  }

  function gridColumnsForPanelCount(count: number): number {
    if (count <= 1) return 1;
    if (count <= 4) return 2;
    return 3;
  }

  function gridRowsForPanelCount(count: number): number {
    return Math.ceil(Math.max(1, count) / gridColumnsForPanelCount(count));
  }

  // ── Bubble text region (precise coordinate-based text correction) ──
  type TextRegion = {
    id:   string;   // unique id for keying
    x:    number;   // left edge, 0-1 normalized to slot width
    y:    number;   // top edge,  0-1 normalized to slot height
    w:    number;   // width,     0-1 normalized to slot width
    h:    number;   // height,    0-1 normalized to slot height
    text: string;   // replacement text drawn inside the masked region
    font?: MangaFont;
    fontSize?: number;
    bold?: boolean;
  };

  function dialogueToBubbleTexts(dialogue: string): string[] {
    const trimmed = dialogue.trim();
    if (!trimmed) return [];
    return trimmed
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean);
  }

  function makeDialogueRegions(dialogue: string): TextRegion[] {
    const texts = dialogueToBubbleTexts(dialogue);
    const count = Math.max(1, texts.length);
    const topMin = 0.05;
    const topMax = 0.20;
    const bubbleW = 0.42;
    const bubbleH = count > 2 ? 0.105 : 0.12;
    const leftX = 0.05;
    const rightX = 0.53;
    return texts.map((text, i) => {
      const row = Math.floor(i / 2);
      const y = Math.min(topMax, topMin + row * 0.075);
      return {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        x: i % 2 === 0 ? leftX : rightX,
        y,
        w: bubbleW,
        h: bubbleH,
        text,
        font: overlayFont,
        fontSize: overlaySize,
        bold: overlayBold,
      };
    });
  }

  function ensureDialogueRegions(slot: PanelSlot): PanelSlot {
    if ((slot.textRegions ?? []).some(r => r.text.trim()) || !slot.dialogue.trim()) return slot;
    return { ...slot, textRegions: makeDialogueRegions(slot.dialogue) };
  }

  type PanelSlot = {
    scene:       string;
    prompt:      string;
    panelSize?:   PanelSize;
    negativePrompt?: string;
    model?:       StudioModelId;
    imageUrl:    string | null;
    videoUrl:    string | null;
    generating:  boolean;
    dialogue:    string;                              // kept: SB-mode prompt injection
    dialoguePos?: 'top' | 'center' | 'bottom';       // kept: bakeDialogueText compat
    textRegions?: TextRegion[];                       // NEW: precise bubble regions
  };
  const emptySlot = (): PanelSlot => ({ scene: '', prompt: '', panelSize: 'medium', negativePrompt: '', model: undefined, imageUrl: null, videoUrl: null, generating: false, dialogue: '', dialoguePos: 'top', textRegions: [] });

  type Page = { id: string; prompt: string; layout: LayoutId; panelCount: number; panels: PanelSlot[]; pageYaml: string; resultUrl: string | null };
  const createPage = (): Page => ({
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    prompt: '',
    layout: 'free_page',
    panelCount: 1,
    panels: [emptySlot()],
    pageYaml: '',
    resultUrl: null,
  });

  let pages       = $state<Page[]>([createPage()]);
  let activePage  = $state(0);
  let activePanel = $state<number | null>(null);
  let selectedPanelIndex = $state<number | null>(null);
  let currentPagePanels = $derived(pages[activePage]?.panels ?? []);
  let currentPageYaml = $derived(pages[activePage] ? serializeStudioPageToYaml(pages[activePage], activePage) : '');
  let currentPageResultUrl = $derived(pages[activePage]?.resultUrl ?? null);
  let pagePanelWarnings = $derived(pages
    .map((page, index) => ({ page: index + 1, panelCount: page.panels.length }))
    .filter(item => item.panelCount === 0));

  function currentStoryInput(): string {
    return storyText.trim() || pages[0]?.prompt.trim() || pages[activePage]?.prompt.trim() || '';
  }

  type StoryPanelConstraints = {
    pageCount?: number;
    panelsPerPage?: number;
    totalPanels?: number;
    instruction: string;
  };

  type PagePanelBudget = {
    page: number;
    min: number;
    max: number;
    target: number;
    beats: string[];
  };

  function parseStoryCount(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const normalized = raw.replace(/[０-９]/g, ch => String(ch.charCodeAt(0) - 0xff10));
    if (/^\d+$/.test(normalized)) return Number(normalized);
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (normalized === '十') return 10;
    if (normalized.startsWith('十')) return 10 + (map[normalized.slice(1)] ?? 0);
    if (normalized.endsWith('十')) return (map[normalized[0]] ?? 1) * 10;
    if (normalized.includes('十')) {
      const [tens, ones] = normalized.split('十');
      return (map[tens] ?? 1) * 10 + (map[ones] ?? 0);
    }
    return map[normalized];
  }

  function extractStoryPanelConstraints(story: string): StoryPanelConstraints {
    const number = '([0-9０-９]+|[一二三四五六七八九十]+)';
    const pageMatch = story.match(new RegExp(`${number}\\s*ページ`));
    const perPageMatch =
      story.match(new RegExp(`(?:1|１|一)?\\s*ページ(?:あたり|につき|ごと)?\\s*${number}\\s*コマ`)) ??
      story.match(new RegExp(`${number}\\s*コマ\\s*/\\s*(?:1|１|一)?\\s*ページ`));
    const komaMatches = [...story.matchAll(new RegExp(`${number}\\s*コマ`, 'g'))];

    const pageCount = parseStoryCount(pageMatch?.[1]);
    const panelsPerPage = parseStoryCount(perPageMatch?.[1]);
    const explicitKoma = komaMatches.map(m => parseStoryCount(m[1])).find((n): n is number => typeof n === 'number');
    const resolvedPanelsPerPage = panelsPerPage;
    const totalPanels = resolvedPanelsPerPage && pageCount
      ? resolvedPanelsPerPage * pageCount
      : (!pageCount ? explicitKoma : undefined);

    const lines: string[] = [];
    if (pageCount) lines.push(`- STORY内の明示指定により、ページ数は必ず ${pageCount} ページにすること。`);
    if (resolvedPanelsPerPage) lines.push(`- STORY内に1ページあたり ${resolvedPanelsPerPage} コマの希望がある。pageTargetPanelsへ反映し、必要以上に増やさないこと。`);
    if (totalPanels) lines.push(`- STORY内に合計 ${totalPanels} コマの希望がある。pageTargetPanelsへ反映し、会話だけの小コマで超過させないこと。`);
    if (!resolvedPanelsPerPage && !totalPanels) lines.push(`- コマ数指定がない場合は、1ページあたり3〜6コマを推奨し、${RECOMMENDED_MAX_PANELS_PER_PAGE}コマ程度を目安にすること。`);

    return { pageCount, panelsPerPage: resolvedPanelsPerPage, totalPanels, instruction: lines.join('\n') };
  }

  function clampPanelCount(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  function distributePanelTargets(totalPanels: number, pageCount: number, min: number, max: number): number[] {
    const safePages = Math.max(1, pageCount);
    const result = Array.from({ length: safePages }, () => min);
    let remaining = Math.max(0, totalPanels - min * safePages);
    for (let i = 0; i < result.length && remaining > 0; i++) {
      const add = Math.min(max - result[i], remaining);
      result[i] += add;
      remaining -= add;
    }
    return result.map(n => clampPanelCount(n, min, max));
  }

  function buildPagePanelBudgets(pageCount: number, constraints: StoryPanelConstraints): PagePanelBudget[] {
    const isLongForm = pageCount > 2;
    const baseMin = isLongForm ? 2 : 3;
    const baseMax = pageCount === 1 ? 6 : isLongForm ? 6 : 5;
    let targets: number[];

    if (constraints.panelsPerPage) {
      const target = clampPanelCount(constraints.panelsPerPage, 1, baseMax);
      targets = Array.from({ length: pageCount }, () => target);
    } else if (constraints.totalPanels) {
      const explicitMin = Math.max(1, Math.min(baseMin, Math.floor(constraints.totalPanels / pageCount) || 1));
      targets = distributePanelTargets(constraints.totalPanels, pageCount, explicitMin, baseMax);
    } else {
      targets = pageCount === 1 ? [5] : Array.from({ length: pageCount }, (_, i) => i === pageCount - 1 ? 4 : 5);
    }

    const beatsByPage = pageCount === 1
      ? [['導入', '展開', '見せ場またはオチ']]
      : [
          ['導入', '状況説明', '転換'],
          ['エスカレーション', '見せ場', '余韻またはオチ'],
        ];

    return Array.from({ length: pageCount }, (_, i) => {
      const hasExplicitPanelBudget = Boolean(constraints.panelsPerPage || constraints.totalPanels);
      const rawTarget = targets[i] ?? targets[targets.length - 1] ?? 4;
      const target = clampPanelCount(rawTarget, hasExplicitPanelBudget ? 1 : baseMin, baseMax);
      const min = hasExplicitPanelBudget && target < baseMin ? target : baseMin;
      const max = hasExplicitPanelBudget ? Math.max(target, min) : baseMax;
      return {
        page: i + 1,
        min,
        max,
        target,
        beats: beatsByPage[i] ?? ['導入', '展開', '見せ場'],
      };
    });
  }

  function panelBudgetInstruction(budgets: PagePanelBudget[]): string {
    const lines = budgets.map(b => `page ${b.page}: target ${b.target} panels / allowed ${b.min}-${b.max} panels / beats: ${b.beats.join(' → ')}`);
    return `[panel budgeting]
- YAMLを書く前に、必ずページごとのpanel配分計画を内部で作ること。
- pageTargetPanels:
${lines.map(line => `  - ${line}`).join('\n')}
- 1ページ漫画は3〜6 panels、2ページ漫画は各ページ3〜5 panels、長編は各ページ2〜6 panelsを基準にすること。
- 必要以上にpanelを増やさないこと。会話だけでpanelを増やさず、同じ場所・同じ行動・近い感情のsceneは1 panelへ統合すること。
- panel数が上限を超えそうな場合は、近いsceneをmergeし、会話のみpanelを統合し、小コマを削減し、必要ならmontage化すること。
- 大コマOK、1コマ演出OK、splash panel OK。panel密度より漫画テンポを優先すること。
- オチや見せ場は large または splash にまとめ、細かい説明panelを増やさないこと。`;
  }

  let referenceImages = $state<RefImage[]>([]);
  let refPanelOpen = $state(true);

  // ── Model / media-type configuration ────────────────────
  type StudioProvider = MediaProviderName;
  type StudioProviderChoice = StudioProvider;
  type StudioModelId = string;
  type StudioModelOption = { id: StudioModelId; label: string; provider: StudioProvider; edit: boolean; apiModel: string };
  const DEFAULT_STUDIO_MODELS: StudioModelOption[] = AVAILABLE_IMAGE_MODELS.map((model) => ({
    id: model.id,
    label: model.label,
    provider: model.provider,
    edit: model.edit,
    apiModel: model.apiModel,
  }));
  let studioModels = $state<StudioModelOption[]>(DEFAULT_STUDIO_MODELS);

  const STUDIO_PROVIDER_CHOICES: { id: StudioProviderChoice; label: string }[] =
    AVAILABLE_MEDIA_PROVIDER_OPTIONS;

  const VIDEO_MODELS = [
    {
      id: 'fal-ai/kling-video/v3/pro/image-to-video',
      label: 'Kling 3.0 Pro',
      desc: 'FAL image-to-video',
    },
  ] as const;
  type VideoModelId = typeof VIDEO_MODELS[number]['id'];

  type StudioMediaType = 'image' | 'video';

  const _ls = (k: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null);
  function normalizeStudioModelId(raw: string | null): StudioModelId {
    const normalized = normalizeMediaModelId(raw ?? undefined);
    return studioModels.some(m => m.id === normalized)
      ? normalized
      : (studioModels[0]?.id ?? 'fal-ai/nano-banana-2');
  }

  function normalizeProviderChoice(raw: string | null): StudioProviderChoice | null {
    return STUDIO_PROVIDER_CHOICES.some(p => p.id === raw) ? raw as StudioProviderChoice : null;
  }

  function providerChoiceForModel(modelId: StudioModelId): StudioProviderChoice {
    const model = studioModels.find(m => m.id === modelId);
    return model?.provider ?? 'fal';
  }

  function studioModelsForProvider(choice: StudioProviderChoice) {
    return studioModels.filter((m) => m.provider === choice);
  }

  function setStudioProviderChoice(choice: StudioProviderChoice): void {
    selectedStudioProviderChoice = choice;
    const availableModels = studioModelsForProvider(choice);
    if (!availableModels.some(m => m.id === selectedStudioModel) && availableModels[0]) {
      selectedStudioModel = availableModels[0].id;
    }
    const model = studioModels.find(m => m.id === selectedStudioModel) ?? availableModels[0];
    imageProvider = choice;
    imageModel = model?.apiModel ?? 'fal-ai/nano-banana';
    void saveImageSettings();
  }

  let studioMediaType = $state<StudioMediaType>('video');
  let selectedStudioModel = $state<StudioModelId>(normalizeStudioModelId(_ls('studio-model')));
  let selectedStudioProviderChoice = $state<StudioProviderChoice>(
    normalizeProviderChoice(_ls('studio-provider-choice')) ?? providerChoiceForModel(normalizeStudioModelId(_ls('studio-model')))
  );
  let studioVideoModel = $state<VideoModelId>(
    VIDEO_MODELS.some(m => m.id === _ls('studio-video-model'))
      ? (_ls('studio-video-model') as VideoModelId)
      : 'fal-ai/kling-video/v3/pro/image-to-video'
  );
  let selectedStudioModelConfig = $derived(studioModels.find(m => m.id === selectedStudioModel) ?? studioModels[0]);
  let selectedProvider          = $derived<StudioProvider>(selectedStudioModelConfig.provider);
  let selectedEditMode          = $derived(selectedStudioModelConfig.edit);
  let studioImageModel          = $derived(selectedStudioModelConfig.apiModel);
  let videoPrompt = $state('');
  let videoDuration = $state<3 | 5 | 10 | 15>(5);
  let videoAudio = $state(false);
  let videoReferenceImage = $state('');
  let videoReferenceName = $state('');

  function normalizeOpenAIImageSize(value: unknown): OpenAIImageSize {
    return OPENAI_IMAGE_SIZES.includes(value as OpenAIImageSize) ? value as OpenAIImageSize : '1024x1024';
  }

  async function loadImageSettings(): Promise<void> {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const settings = await res.json();
      const image = settings?.image ?? {};
      const loadedImageModel = settings?.mediaConfig?.model ?? settings?.mediaModel ?? image.model;
      imageModel = typeof loadedImageModel === 'string' && loadedImageModel.trim() ? loadedImageModel : 'fal-ai/nano-banana';
      imageSize = normalizeOpenAIImageSize(image.size);
      size = imageSize;
      selectedStudioProviderChoice = imageProvider;
      selectedStudioModel = normalizeStudioModelId(imageModel);
      selectedStudioProviderChoice = providerChoiceForModel(selectedStudioModel);
      imageProvider = selectedStudioProviderChoice;
    } catch (error) {
      console.warn('[studio] image settings load failed:', error);
    }
  }

  async function saveImageSettings(): Promise<void> {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaProvider: imageProvider,
          mediaConfig: {
            provider: imageProvider,
            model: imageModel,
          },
          image: {
            provider: 'openai',
            model: imageModel,
            size: imageSize,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      size = imageSize;
    } catch (error) {
      console.error('[studio] image settings save failed:', error);
      errorMsg = 'IMAGE サイズ設定の保存に失敗しました。';
    }
  }

  $effect(() => { try { localStorage.setItem('studio-media-type',  studioMediaType);  } catch {} });
  $effect(() => { try { localStorage.setItem('studio-model',        selectedStudioModel); } catch {} });
  $effect(() => { try { localStorage.setItem('studio-provider-choice', selectedStudioProviderChoice); } catch {} });
  $effect(() => { try { localStorage.setItem('studio-video-model',  studioVideoModel); } catch {} });
  $effect(() => { size = imageSize; });
  $effect(() => {
    imageProvider = selectedProvider;
    imageModel = studioImageModel;
  });
  $effect(() => {
    if (studioMediaType !== 'image') return;
    const availableModels = studioModelsForProvider(selectedStudioProviderChoice);
    if (!availableModels.some(m => m.id === selectedStudioModel) && availableModels[0]) {
      selectedStudioModel = availableModels[0].id;
    }
  });

  // ── Batch Generate ───────────────────────────────────────
  async function selectVideoReferenceImage(event: Event): Promise<void> {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      errorMsg = 'Reference ImageはPNG、JPG、JPEG、WEBPに対応しています。';
      return;
    }
    videoReferenceImage = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Reference Imageの読み込みに失敗しました。'));
      reader.readAsDataURL(file);
    });
    videoReferenceName = file.name;
    errorMsg = '';
  }

  let batchMode       = $state(true);
  let batchGenerating = $state(false);
  let batchProgress   = $state({ done: 0, total: 0 });

  function buildAllRefImages(): string[] {
    const result: string[] = [];
    const addRef = (ref: RefImage | null) => {
      if (!ref) return;
      // Prefer full-resolution originals; fall back to thumbnails
      const sources = ref.originals?.filter(t => t?.startsWith('data:')) ?? [];
      const all = sources.length > 0
        ? sources
        : (ref.thumbs?.length ? ref.thumbs : (ref.thumb ? [ref.thumb] : []));
      for (const t of all) { if (t?.startsWith('data:')) result.push(t); }
    };
    for (const ref of referenceImages) addRef(ref);
    return result;
  }

  // 実際の data URL を持つ参照画像が1枚以上あれば true
  let hasReferenceImages = $derived(buildAllRefImages().length > 0);
  let generationMode     = $derived(
    batchMode         ? 'batch'
    : studioMediaType === 'video' ? 'video'
    : selectedEditMode            ? 'edit'
    :                               'text-to-image'
  );

  // ── Manga text overlay ────────────────────────────────────
  const MANGA_FONTS = [
    { id: 'noto',  label: 'Noto Sans JP',   css: '"Noto Sans JP", sans-serif' },
    { id: 'bizud', label: 'BIZ UDゴシック', css: '"BIZ UDGothic", sans-serif' },
    { id: 'klee',  label: '源暎アンチック', css: '"Klee One", cursive' },
  ] as const;
  type MangaFont = typeof MANGA_FONTS[number]['id'];
  type ImageCompositionMode = 'manga' | 'illustration';
  let overlayFont      = $state<MangaFont>('noto');
  let overlaySize      = $state(16);
  let overlayBold      = $state(true);
  let imageCompositionMode = $state<ImageCompositionMode>(
    _ls('studio-image-composition-mode') === 'illustration' ? 'illustration' : 'manga',
  );
  let speechBubbleMode = $derived(imageCompositionMode === 'manga');
  $effect(() => {
    try {
      localStorage.setItem('studio-image-composition-mode', imageCompositionMode);
      localStorage.setItem('studio-speech-bubble', speechBubbleMode ? '1' : '0');
    } catch {}
  });

  // ── Bubble text editor state ──────────────────────────────
  // Which panel is currently in drag-to-define-region edit mode (null = none)
  let bubbleEditPanel     = $state<number | null>(null);
  let bubbleEditorImageEl = $state<HTMLImageElement | null>(null);
  // Which region within the active panel is selected (null = none)
  let selectedRegionIndex = $state<number | null>(null);
  // Active drag rect while user holds mouse (cleared on mouseup)
  type BubbleDragState = { x0: number; y0: number; x1: number; y1: number };
  let bubbleDrag = $state<BubbleDragState | null>(null);
  // Reset selection when leaving bubble edit mode
  $effect(() => { if (bubbleEditPanel === null) selectedRegionIndex = null; });

  // ── Multi-page YAML state ─────────────────────────────────
  type ParsedYamlPage = {
    page?: number;
    layout: string;
    panelCount?: number;
    story_summary?: string;
    prompt: string;
    panels: Array<{ panel?: number; size?: PanelSize; scene: string; dialogue: string; prompt: string; negativePrompt?: string; model?: StudioModelId }>;
  };
  let parsedYamlPages = $state<ParsedYamlPage[]>([]);
  let generatingYaml  = $state(false);
  let panelCountWarning = $state('');

  // ── Character Vision profiles ─────────────────────────────
  let charProfiles   = $state<string[]>([]);
  let analyzingChars = $state(false);
  $effect(() => {
    parsedYamlPages = parseYamlPages(yamlText);
    // Run sync outside reactive context to avoid write-tracking loops
    queueMicrotask(syncPagesFromYaml);
  });

  // ── Advanced section (Assets + Diary) ────────────────────
  let advancedOpen = $state(false);

  type CharacterSet = {
    id: string;
    name: string;
    referenceImages: RefImage[];
    originals: string[];
    thumbs: string[];
    createdAt: string;
  };

  const CHARACTER_LIBRARY_KEY = 'studio-character-library';
  let characterLibrary = $state<CharacterSet[]>([]);
  let characterSetName = $state('');

  // ── One Panel Pro Mode ────────────────────────────────────
  let proModeOpen   = $state(false);
  let proExpression = $state('');
  let proCamera     = $state('');
  let proPose       = $state('');
  let proStyle      = $state('');
  let proLighting   = $state('');

  // ── ミュリィ キャラクター辞書（常時付与）────────────────────
  const MURYI_CHAR_DICT =
    'short silver bob hair, glowing cyan eyes, white cyberpunk uniform, ' +
    'android circuit markings on forearms, thigh-high boots, 1girl';

  const PRO_EXPRESSIONS = [
    { id: 'neutral',     label: 'Neutral',     prompt: 'neutral composed expression, steady calm gaze, relaxed closed lips, collected posture' },
    { id: 'smile',       label: 'Smile',       prompt: 'suppressed smile, slight blush, trying not to look too pleased, faint upward lip curve, soft warm eyes' },
    { id: 'happy',       label: 'Happy',       prompt: 'bright blush across cheeks, tsundere look-away smile, glowing brighter cyan eyes, barely contained happiness, sparkling gaze' },
    { id: 'sad',         label: 'Sad',         prompt: 'low battery sad mode, dim eye glow, head slightly down, subdued circuit markings, quiet sorrow, downcast gaze' },
    { id: 'angry',       label: 'Angry',       prompt: 'error-state glare, sparking overloaded circuit markings, clenched fist, intense cyan stare, sharp indignant expression, furrowed brow' },
    { id: 'surprised',   label: 'Surprised',   prompt: 'wide-eyed surprise, eyebrows raised high, mouth slightly parted, startled caught-off-guard expression, pupils dilated' },
    { id: 'embarrassed', label: 'Embarrassed', prompt: 'deeply flustered bright blush, flushed silver-haired cheeks, averted glowing eyes, unable to hide feelings, fidgeting hands' },
    { id: 'sleepy',      label: 'Sleepy',      prompt: 'power-saving mode half-closed cyan eyes, slow heavy blinking, minimal circuit activity, drowsy sluggish expression, soft drooping eyelids' },
    { id: 'determined',  label: 'Determined',  prompt: 'fierce determined stare, intensified glowing cyan eyes, set jaw, circuit markings pulsing bright, strong-willed focused gaze' },
    { id: 'smug',        label: 'Smug',        prompt: 'knowing smug expression, confident side-glance, self-satisfied smirk, one eyebrow slightly raised, amused superior look' },
    { id: 'shy',         label: 'Shy',         prompt: 'shy averted downward gaze, barely visible blush, fingers fidgeting, circuit patterns dimming softly, timid withdrawn posture' },
    { id: 'pout',        label: 'Pout',        prompt: 'tsundere pout, puffed cheeks, poorly hidden sulkiness, flushed face, refusing to look directly, crossed arms' },
  ] as const;

  const PRO_CAMERAS = [
    { id: 'closeup',    label: 'Close-up',    prompt: 'extreme close-up portrait, face filling frame, intimate tight framing, shallow depth of field, detailed facial features' },
    { id: 'bust',       label: 'Bust',        prompt: 'bust shot, upper body portrait, collar to crown, three-quarter angle, flattering crop, balanced composition' },
    { id: 'medium',     label: 'Medium',      prompt: 'medium shot, waist-up framing, natural standing distance, balanced negative space, clean background separation' },
    { id: 'full_body',  label: 'Full Body',   prompt: 'full body shot, head to toe, complete figure visible, grounded stance, full character design showcase' },
    { id: 'from_above', label: 'High Angle',  prompt: 'bird\'s eye high angle shot, looking down at subject, foreshortening effect, top-down perspective, vulnerability implied' },
    { id: 'from_below', label: 'Low Angle',   prompt: 'low angle shot from below, looking upward at subject, heroic imposing perspective, worm\'s eye view, dramatic scale' },
    { id: 'side',       label: 'Side View',   prompt: 'clean side profile view, pure 90-degree lateral angle, elegant silhouette, hair and outfit shape highlighted' },
    { id: 'dutch',      label: 'Dutch Angle', prompt: 'dutch angle tilted camera, diagonal tension in frame, dynamic off-kilter composition, cinematic unease' },
  ] as const;

  const PRO_POSES = [
    { id: 'standing',     label: 'Standing',     prompt: 'confident upright standing pose, natural weight distribution, balanced grounded posture' },
    { id: 'sitting',      label: 'Sitting',       prompt: 'relaxed seated pose, legs slightly angled, casual comfortable position, hands resting naturally' },
    { id: 'leaning',      label: 'Leaning',       prompt: 'casually leaning against surface, one shoulder resting on wall, arms loose at sides, cool relaxed attitude' },
    { id: 'arms_crossed', label: 'Arms Crossed',  prompt: 'arms folded across chest, guarded defensive stance, chin slightly raised, assertive closed body language' },
    { id: 'hand_hip',     label: 'Hand on Hip',   prompt: 'one hand on hip, slight side turn, look-away stance, weight shifted to one leg, confident assertive attitude' },
    { id: 'looking_back', label: 'Looking Back',  prompt: 'glancing back over shoulder, head turned, body facing away, hair catching light, caught elegantly mid-turn' },
    { id: 'action',       label: 'Action',        prompt: 'dynamic action pose, mid-motion kinetic energy, clothes and hair flowing in movement, energetic explosive stance' },
    { id: 'reaching',     label: 'Reaching',      prompt: 'arm extended toward viewer, fingers reaching out, leaning slightly forward, direct intimate visual engagement' },
  ] as const;

  const PRO_STYLES = [
    { id: '',           label: 'Default',    prompt: '' },
    { id: 'anime',      label: 'Anime',      prompt: 'high-quality anime illustration, vibrant cel shading, clean precise linework, professional character art quality' },
    { id: 'realistic',  label: 'Realistic',  prompt: 'photorealistic rendering, cinematic photography quality, ultra-detailed skin and fabric textures, 8k resolution, subsurface scattering' },
    { id: 'watercolor', label: 'Watercolor', prompt: 'delicate watercolor illustration, flowing pigment bleeds, soft translucent color layers, loose artistic brushwork' },
    { id: 'cyberpunk',  label: 'Cyberpunk',  prompt: 'cyberpunk neon aesthetic, dark atmospheric background, vivid cyan and magenta accents, synthwave color palette, rain-slicked streets' },
    { id: 'sketch',     label: 'Sketch',     prompt: 'detailed pencil sketch illustration, expressive confident linework, subtle cross-hatching shading, clean hand-drawn quality' },
    { id: 'oil',        label: 'Oil Paint',  prompt: 'rich oil painting technique, thick impasto brushwork, deep saturated jewel-toned colors, painterly canvas texture' },
  ] as const;

  const PRO_LIGHTING = [
    { id: '',         label: 'Default',     prompt: '' },
    { id: 'soft',     label: 'Soft',        prompt: 'soft diffused natural lighting, gentle fill light, even flattering exposure, minimal harsh shadows' },
    { id: 'dramatic', label: 'Dramatic',    prompt: 'high-contrast dramatic lighting, deep noir shadows, powerful single-source rim light, chiaroscuro effect' },
    { id: 'golden',   label: 'Golden Hour', prompt: 'warm golden hour sunlight, long amber-orange shadows, glowing skin tones, romantic atmospheric haze' },
    { id: 'neon',     label: 'Neon',        prompt: 'vibrant neon sign illumination, colorful mixed light sources, electric cyan and magenta glow, reflective wet surfaces' },
    { id: 'studio',   label: 'Studio',      prompt: 'professional studio lighting setup, soft box fill light, subtle edge rim light, clean neutral separation from background' },
    { id: 'backlit',  label: 'Backlit',     prompt: 'strong rim backlight, glowing silhouette edges, hair lit brilliantly from behind, subtle lens flare, contre-jour atmosphere' },
  ] as const;

  // ── Pro Mode Presets ──────────────────────────────────────
  type ProPreset = {
    id:         string;
    name:       string;
    expression: string;
    camera:     string;
    pose:       string;
    style:      string;
    lighting:   string;
    isDefault?: true;
  };

  const PRO_PRESET_KEY = 'studio-pro-presets';

  const DEFAULT_PRO_PRESETS: ProPreset[] = [
    { id: 'dp_portrait',  name: 'Portrait',  expression: 'smile',      camera: 'bust',       pose: 'standing',     style: 'anime',      lighting: 'soft',     isDefault: true },
    { id: 'dp_dramatic',  name: 'Dramatic',  expression: 'determined', camera: 'closeup',    pose: 'hand_hip',     style: 'realistic',  lighting: 'dramatic', isDefault: true },
    { id: 'dp_action',    name: 'Action',    expression: 'determined', camera: 'from_below', pose: 'action',       style: 'anime',      lighting: 'neon',     isDefault: true },
    { id: 'dp_emotional', name: 'Emotional', expression: 'sad',        camera: 'medium',     pose: 'leaning',      style: 'watercolor', lighting: 'golden',   isDefault: true },
    { id: 'dp_cyberpunk', name: 'Cyberpunk', expression: 'smug',       camera: 'dutch',      pose: 'arms_crossed', style: 'cyberpunk',  lighting: 'neon',     isDefault: true },
  ];

  let proPresets    = $state<ProPreset[]>([...DEFAULT_PRO_PRESETS]);
  let proPresetName = $state('');

  let layout    = $derived(pages[activePage].layout);
  let panels    = $derived(currentPagePanels);
  let gridCols  = $derived(gridColumnsForPanelCount(panels.length));
  let gridRows  = $derived(gridRowsForPanelCount(panels.length));
  let gridStyle = $derived(
    layout === 'free_page'
      ? `grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: minmax(120px, 1fr);`
      : layout === 'free'
      ? `grid-template-columns: repeat(${gridCols}, 1fr);`
      : `grid-template-columns: repeat(${gridCols}, 1fr); grid-template-rows: repeat(${gridRows}, 1fr);`
  );

async function buildPrompt(basePrompt: string, refDescription: string) {
  const res = await fetch('/api/prompt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }, // ← 追加
  body: JSON.stringify({ basePrompt, refDescription, locale: UI_LOCALE })
});

  const data = await res.json();
  const charLock = [
    '参照画像を最優先にする',
    'キャラクターの同一性を厳密に維持する',
    '髪色と髪型を正確に維持する',
    '顔立ちを正確に維持する',
    '衣装デザインを正確に維持する',
    'キャラクターを再デザインしない',
    'すべてのコマで外見を一貫させる',
    'locale=ja',
    '画面内のメタデータ、キャプション、注釈、ラベルは日本語のみ',
    'Point、Error、Concern、Scene、Prompt、Panel などの英語UIラベルを画像内に描かない',
  ].join('、');
  return `${data.prompt}。${charLock}`;
}


  // ============================================================
  // Actions
  // ============================================================

  function resolveRefImages(editMode = selectedEditMode): string[] {
    if (!editMode) return [];
    const imgs = buildAllRefImages();
    if (imgs.length === 0)
      throw new Error('Edit モデルが選択されていますが参照画像が設定されていません。REFERENCE IMAGES に画像をアップロードしてください。');
    return imgs;
  }

  async function callGenerateImage(p: string, s: ImageSize, modelOverride?: StudioModelId): Promise<string> {
    const modelConfig = modelOverride
      ? (studioModels.find(m => m.id === modelOverride) ?? selectedStudioModelConfig)
      : selectedStudioModelConfig;
    const provider = modelConfig.provider;
    const editMode = modelConfig.edit;
    const apiModel = modelConfig.apiModel;
    const refImages     = resolveRefImages(editMode);
    const effectiveMode = editMode ? 'edit' : 'text-to-image';
    console.log('[studio] callGenerateImage', {
      selectedModel:  modelOverride ?? selectedStudioModel,
      apiModel,
      provider,
      editMode,
      generationMode: effectiveMode,
      imageCount:     refImages.length,
      imageSizes:     refImages.map(r => `${Math.round(r.length / 1024)}KB`),
    });
    const refCtx     = buildRefContext();   // label-based tags
    const profileCtx = charProfiles.map(p => p.trim()).filter(Boolean).join(' ');
    const charDesc   = [profileCtx, refCtx].filter(Boolean).join('. ');
    const refDesc    = charDesc
      ? `locale=ja\n以下のキャラクターを正確に使用する:\n${charDesc}\n同じ顔、同じ髪型、同じ衣装を維持し、再デザインしない。`
      : 'locale=ja\n参照画像のキャラクターを正確に使用し、同じ顔、同じ髪型、同じ衣装を維持する。';
    const enhanced = await buildPrompt(injectRefs(p), refDesc);
    console.log('[studio] callGenerateImage final prompt preview:', enhanced.slice(0, 200));
    const payload = {
      prompt: enhanced,
      size: s,
      model: apiModel,
      provider,
      editMode,
      selectedModel: modelOverride ?? selectedStudioModel,
      refImages,
      locale: UI_LOCALE,
      renderMode: imageCompositionMode,
      speechBubble: speechBubbleMode,
    };
    console.log('[studio] image generate button payload', payload);
    console.log('[studio] fetch /api/generate provider/model', { provider: payload.provider, model: payload.model });
    const res = await fetch('/api/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? `HTTP ${res.status}`); }
    const data = await res.json();
    const imageUrl = data?.images?.[0]?.url ?? data?.url;
    if (!imageUrl) throw new Error('画像データが返されませんでした。');
    return imageUrl as string;
  }

  async function callGenerateVideo(p: string): Promise<string> {
    if (!videoReferenceImage) throw new Error('Reference Imageを選択してください。');
    console.log('[studio] callGenerateVideo', {
      selectedModel: studioVideoModel,
      provider: 'fal',
      generationMode: 'image-to-video',
      duration:      videoDuration,
      audio:         videoAudio,
      referenceImage: videoReferenceName || '(selected)',
    });
    const res = await fetch('/api/studio/generate-video', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: p,
        model: studioVideoModel,
        duration: videoDuration,
        audio: videoAudio,
        referenceImage: videoReferenceImage,
        locale: UI_LOCALE,
      }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? `HTTP ${res.status}`); }
    const data = await res.json();
    if (!data.url) throw new Error('動画データが返されませんでした。');
    return data.url as string;
  }

  async function generateKlingVideo(): Promise<void> {
    const prompt = videoPrompt.trim();
    if (!prompt || generating) return;
    if (!videoReferenceImage) {
      errorMsg = 'Reference Imageを選択してください。';
      return;
    }
    errorMsg = '';
    generating = true;
    previewVideoUrl = null;
    try {
      previewVideoUrl = await callGenerateVideo(prompt);
    } catch (caughtError) {
      errorMsg = caughtError instanceof Error ? caughtError.message : '動画生成に失敗しました。';
    } finally {
      generating = false;
    }
  }

  // Unified entry for panel generation (routes by media type)
  async function callGenerate(p: string, s: ImageSize): Promise<{ imageUrl?: string; videoUrl?: string }> {
    if (studioMediaType === 'video') {
      return { videoUrl: await callGenerateVideo(p) };
    }
    return { imageUrl: await callGenerateImage(p, s) };
  }

  async function generate() {
    const p = pages[activePage].prompt.trim();
    if (!p || generating) return;
    errorMsg        = '';
    revisedPrompt   = null;
    generating      = true;
    previewUrl      = null;
    previewVideoUrl = null;
    try {
      if (studioMediaType === 'video') {
        previewVideoUrl = await callGenerateVideo(p);
      } else {
        const url = await callGenerateImage(p, size);
        previewUrl    = url;
        revisedPrompt = null;
        await addToHistory(url, p, size);
        if (diaryNote) {
          const thumb   = await createThumbnail(url);
          const entryId = activeDiaryId ?? genId();
          const entry: DiaryEntry = {
            id: entryId, date: diaryNote.date, diaryText: diaryNote.diaryText,
            prompt: p, mood: currentDiaryMood, thumb, createdAt: new Date().toISOString(),
          };
          const idx = diaryHistory.findIndex(e => e.id === entryId);
          if (idx >= 0) diaryHistory[idx] = entry;
          else diaryHistory = [entry, ...diaryHistory].slice(0, MAX_DIARY_ENTRIES);
          activeDiaryId = entryId;
          saveDiaryHistory();
        }
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : '生成に失敗しました。';
    } finally {
      generating = false;
    }
  }

  async function generatePanel(i: number) {
    const p = panels[i];
    if (!p.prompt.trim() || p.generating) return;
    pages[activePage] = { ...pages[activePage], pageYaml: serializeStudioPageToYaml(pages[activePage], activePage), resultUrl: null };
    panels[i] = { ...p, generating: true, imageUrl: null, videoUrl: null };
    try {
      const dlg = p.dialogue.trim();
      const neg = p.negativePrompt?.trim();
      const enrichedPrompt = buildImageCompositionPrompt(p.prompt.trim(), dlg);
      const finalPrompt = neg ? `${enrichedPrompt}, avoid: ${neg}` : enrichedPrompt;
      const result = studioMediaType === 'image'
        ? { imageUrl: await callGenerateImage(finalPrompt, size, p.model) }
        : await callGenerate(finalPrompt, size);
      panels[i] = ensureDialogueRegions({ ...panels[i], generating: false, imageUrl: result.imageUrl ?? null, videoUrl: result.videoUrl ?? null });
    } catch {
      panels[i] = { ...panels[i], generating: false };
    }
  }

  async function generateFromYamlPanel(panelIndex: number): Promise<void> {
    if (!pages[activePage]?.panels[panelIndex]) return;
    await generatePanel(panelIndex);
  }

  function buildPanelPrompt(src: PanelSlot): string {
    const neg = src.negativePrompt?.trim();
    return `${buildImageCompositionPrompt(src.prompt.trim(), src.dialogue?.trim() ?? '')}${neg ? `, avoid: ${neg}` : ''}`;
  }

  function buildImageCompositionPrompt(prompt: string, dialogue: string): string {
    if (imageCompositionMode === 'illustration') {
      return `${prompt}, single illustration, no speech bubbles, no dialogue text`;
    }
    if (!dialogue) return `${prompt}, Japanese manga artwork`;
    const escapedDialogue = dialogue.replace(/"/g, '\\"');
    return `${prompt}, Japanese manga panel, MUST draw a clear manga speech bubble containing the exact Japanese dialogue "${escapedDialogue}", legible text, do not omit the speech bubble`;
  }

  async function renderAndStorePageResult(pageIdx: number): Promise<string | null> {
    if (!pages[pageIdx]?.panels.some(panel => panel.imageUrl)) return null;
    const canvas = await renderPageToCanvas(pages[pageIdx]);
    const url = canvas.toDataURL('image/png');
    pages[pageIdx] = { ...pages[pageIdx], panelCount: pages[pageIdx].panels.length, pageYaml: serializeStudioPageToYaml(pages[pageIdx], pageIdx), resultUrl: url };
    return url;
  }

  async function generatePagePanels(pageIdx: number, totalPanels: number, doneStart: number): Promise<number> {
    if (!pages[pageIdx]) return doneStart;
    pages[pageIdx] = { ...pages[pageIdx], panelCount: pages[pageIdx].panels.length, pageYaml: serializeStudioPageToYaml(pages[pageIdx], pageIdx), resultUrl: null };
    let done = doneStart;
    const n = pages[pageIdx].panels.length;

    for (let i = 0; i < n; i++) {
      const src = pages[pageIdx].panels[i];
      pages[pageIdx].panels[i] = {
        ...pages[pageIdx].panels[i],
        generating: true, imageUrl: null, videoUrl: null,
      };
      if (!src.prompt.trim()) {
        pages[pageIdx].panels[i] = { ...pages[pageIdx].panels[i], generating: false };
        done++;
        batchProgress = { done, total: totalPanels };
        continue;
      }
      try {
        const url = await callGenerateImage(buildPanelPrompt(src), size, src.model);
        pages[pageIdx].panels[i] = ensureDialogueRegions({ ...pages[pageIdx].panels[i], generating: false, imageUrl: url });
      } catch (e) {
        pages[pageIdx].panels[i] = { ...pages[pageIdx].panels[i], generating: false };
        errorMsg = `P${pageIdx + 1}コマ${i + 1}: ${e instanceof Error ? e.message : '生成失敗'}`;
      }
      done++;
      batchProgress = { done, total: totalPanels };
    }

    await renderAndStorePageResult(pageIdx);
    return done;
  }

  async function generateBatch(): Promise<void> {
    if (batchGenerating) return;

    // ── Multi-page path: each page is generated and composited independently. ────
    if (parsedYamlPages.length > 0) {
      syncPagesFromYaml();
      const pageIndexes = pages.map((pg, idx) => ({ pg, idx })).filter(({ pg }) => pg.panels.length > 0).map(({ idx }) => idx);
      const totalPanels = pageIndexes.reduce((s, idx) => s + pages[idx].panels.length, 0);
      if (totalPanels === 0) { errorMsg = 'YAMLにプロンプトがありません。'; return; }
      batchGenerating = true;
      batchProgress   = { done: 0, total: totalPanels };
      errorMsg        = '';

      let done = 0;
      for (const pageIdx of pageIndexes) {
        done = await generatePagePanels(pageIdx, totalPanels, done);
      }
      previewUrl = pages[activePage]?.resultUrl ?? null;
      batchGenerating = false;
      return;
    }

    // ── Single-page fallback (existing logic) ─────────────
    const source = pages[activePage].panels
      .filter(p => p.prompt.trim())
      .map(p => ({ scene: p.scene, dialogue: p.dialogue, prompt: p.prompt }));

    if (source.length === 0) {
      errorMsg = 'YAMLまたはパネルにプロンプトを入力してください。';
      return;
    }

    batchGenerating = true;
    batchProgress   = { done: 0, total: source.length };
    errorMsg        = '';

    const n = source.length;
    const newLayout = layoutForPanelCount(n);
    setLayout(newLayout);

    if (newLayout === 'free') {
      while (pages[activePage].panels.length < n)
        pages[activePage].panels = [...pages[activePage].panels, emptySlot()];
    }

    for (let i = 0; i < n; i++) {
      const src = source[i];
      pages[activePage].panels[i] = {
        ...pages[activePage].panels[i],
        scene:      src.scene,
        prompt:     src.prompt,
        dialogue:   src.dialogue,
        generating: true,
        imageUrl:   null,
        videoUrl:   null,
      };

      if (!src.prompt.trim()) {
        pages[activePage].panels[i] = { ...pages[activePage].panels[i], generating: false };
        batchProgress = { done: i + 1, total: n };
        continue;
      }

      try {
        const url = await callGenerateImage(buildPanelPrompt(pages[activePage].panels[i]), size, pages[activePage].panels[i].model);
        pages[activePage].panels[i] = ensureDialogueRegions({ ...pages[activePage].panels[i], generating: false, imageUrl: url });
      } catch (e) {
        pages[activePage].panels[i] = { ...pages[activePage].panels[i], generating: false };
        errorMsg = `コマ ${i + 1}: ${e instanceof Error ? e.message : '生成失敗'}`;
      }
      batchProgress = { done: i + 1, total: n };
    }

    await renderAndStorePageResult(activePage);
    previewUrl = pages[activePage]?.resultUrl ?? null;
    batchGenerating = false;
  }

  async function generateCurrentPageBatch(): Promise<void> {
    if (batchGenerating) return;
    if (parsedYamlPages.length > 0) syncPagesFromYaml();
    const totalPanels = pages[activePage]?.panels.length ?? 0;
    if (totalPanels === 0) { errorMsg = 'このページにpanel情報がありません。'; return; }
    batchGenerating = true;
    batchProgress = { done: 0, total: totalPanels };
    errorMsg = '';
    await generatePagePanels(activePage, totalPanels, 0);
    previewUrl = pages[activePage]?.resultUrl ?? null;
    batchGenerating = false;
  }

  // Generate a single panel on a specific page (multi-page YAML aware)
  async function generateYamlPagePanel(pageIdx: number, panelIdx: number): Promise<void> {
    const src = pages[pageIdx]?.panels[panelIdx];
    if (!src) return;
    if (!src.prompt.trim()) return;

    while (pages.length <= pageIdx) pages = [...pages, createPage()];
    while (pages[pageIdx].panels.length <= panelIdx)
      pages[pageIdx].panels = [...pages[pageIdx].panels, emptySlot()];

    pages[pageIdx] = { ...pages[pageIdx], pageYaml: serializeStudioPageToYaml(pages[pageIdx], pageIdx), resultUrl: null };
    pages[pageIdx].panels[panelIdx] = {
      ...pages[pageIdx].panels[panelIdx],
      generating: true, imageUrl: null, videoUrl: null,
    };
    try {
      const neg = src.negativePrompt?.trim();
      const composedPrompt = buildImageCompositionPrompt(src.prompt.trim(), src.dialogue?.trim() ?? '');
      const url = await callGenerateImage(composedPrompt + (neg ? `, avoid: ${neg}` : ''), size, src.model);
      pages[pageIdx].panels[panelIdx] = ensureDialogueRegions({ ...pages[pageIdx].panels[panelIdx], generating: false, imageUrl: url });
    } catch (e) {
      pages[pageIdx].panels[panelIdx] = { ...pages[pageIdx].panels[panelIdx], generating: false };
      errorMsg = `P${pageIdx + 1}コマ${panelIdx + 1}: ${e instanceof Error ? e.message : '生成失敗'}`;
    }
  }

  // AI: STORY text → structured YAML via /api/lab-chat
  async function generateYamlFromStory(): Promise<void> {
    const story = currentStoryInput();
    if (!story || generatingYaml) return;
    generatingYaml = true;
    errorMsg = '';
    panelCountWarning = '';
    try {
      const constraints = extractStoryPanelConstraints(story);
      const targetPageCount: 1 | 2 = constraints.pageCount === 2 ? 2 : constraints.pageCount === 1 ? 1 : mangaPageMode;
      const panelBudgets = buildPagePanelBudgets(targetPageCount, constraints);
      const budgetRule = panelBudgetInstruction(panelBudgets);
      const layoutRule  = `- pages 配列は必ず ${targetPageCount} ページ分生成すること。
- 各 page の layout は必ず "free_page" にすること。
- 各ページの panels 数は pageTargetPanels を基準にすること。
- panels は1ページあたり1つ以上あれば有効。ただし必要以上にpanelを増やさず、漫画テンポに必要な量だけにすること。
- page 1 と page 2 でコマ数が違ってもよい。
- panel.size は small / medium / large / splash から選ぶこと。オチや見せ場には splash を使ってよい。
${budgetRule}
${constraints.instruction ? `\n[STORY内の明示指定: 最優先]\n${constraints.instruction}` : ''}`;
      const constrainedStory = constraints.instruction
        ? `[最優先の明示指定]\n${constraints.instruction}\n\n[STORY]\n${story}`
        : story;

      // Build character context — Vision profile takes priority over label
      const charLines: string[] = [];
      referenceImages.forEach((ref, i) => {
        const profile = charProfiles[i]?.trim();
        const label   = ref.label.trim();
        const name    = ref.name.trim() || `参照${i + 1}`;
        if (profile) charLines.push(`  - ${name}（Vision解析）: ${profile}`);
        else if (label) charLines.push(`  - ${name}: ${label}`);
      });
      const charSection = charLines.length > 0
        ? `\n[登場キャラクター情報]\n${charLines.join('\n')}\n上記のキャラクター情報をもとに名前・外見を把握し、scene・dialogue・promptで一貫して使用すること。\n`
        : '';
      const referenceAnalysisText = buildReferenceAnalysisText();
      const referenceAnalysisSection = referenceAnalysisText
        ? `\n[Vision解析結果 / Reference Analysis]\n${referenceAnalysisText}\n`
        : '';

      const res = await fetch('/api/lab-chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          model:    'gpt-4o-mini',
          systemPrompt: `あなたは漫画企画書を解析し、自然言語から制作可能な漫画YAMLへ変換する高精度ストーリー設計AIです。
入力は単なる短いあらすじではなく、作品全体の自由記述・企画書・メモ・キャラクター表・世界観設定・ページ数指定・画風指定・参考画像指定を含む可能性があります。
入力内の情報をすべて読み取り、曖昧な箇所は自然に補完し、作品全体が一貫した漫画になるように構成してください。

YAMLのキー（pages, page, layout, story_summary, prompt, panels, panel, size, scene, dialogue, speaker, text, negative_prompt, model）は英語のまま維持すること。
各値の内容（説明文・セリフ・画像プロンプト）はすべて日本語で出力すること。英語で値を書かないこと。

有効なYAMLのみを出力すること。コードブロック記号（\`\`\`）は不要。
${charSection}
[入力解析]
- STORY を作品全体の企画書として扱うこと。
- 登場キャラクター、関係性、衣装、髪型、表情傾向、性格、口調を抽出すること。
- 世界観、時代、場所、背景セット、小道具、画風、色彩、ページ数、総コマ数、参考画像の指定を抽出すること。
- [Vision解析結果 / Reference Analysis] がある場合は、STORYと同じ優先度で読み込み、キャラクター外見・背景資料・過去漫画ページ・吹き出し内容・維持/回避事項をscene/dialogue/promptへ反映すること。
- ページ数や総コマ数の指定があれば最優先すること。指定がない場合は物語に必要な自然な長さにすること。
- YAML生成前にpanel budgetingを行い、ページごとの導入・展開・見せ場・オチを先に配分してからpanelsを書くこと。
- panel数ではなく漫画テンポで構成すること。大コマ、1コマ演出、splash panelを積極的に使ってよい。
- 会話だけでpanelを増やさないこと。同じ場所の短い会話、近い感情、近い動作は1つのpanelに統合すること。
- panel数がpageTargetPanelsを超えそうな場合は、近いsceneをmergeし、会話のみpanelを統合し、小コマを削減し、montage化して収めること。
- 参考画像が指定されている場合は、prompt に「参考画像の人物/衣装/背景を維持」と明記すること。
- 同じキャラクター・同じ背景設定・同じ画風が全ページで維持されるよう、各 panel prompt に共通設定を織り込むこと。

[重要] キャラクター名について
- あらすじ中に登場するキャラクター名をそのまま使用すること
- 「アンドロイドA」「少女」「キャラA」などの汎用名・代替名は絶対に使わないこと
- キャラクター情報が提供されている場合は、そのキャラクター名で一貫して書くこと

[sceneの書き方]
- 「誰が・どこで・何をしているか・どんな表情か」を1〜2文で具体的に書くこと
- 「楽しい」「にぎやか」など抽象的な形容詞だけで終わらせないこと
- 良い例: 「充電ルームで〇〇と△△が1台のポッドを前に困った顔で向き合っている」

[dialogueの書き方]
- speaker と text を持つオブジェクト配列で書くこと
- 口語体・自然な日本語で書くこと
- 例: dialogue: [{ speaker: "ミュリィ", text: "ここから始めよう。" }]
- セリフなしは dialogue: []

[promptの書き方]
- 各 panel prompt は単独で画像生成しても成立するよう、必要な前後文脈を含めること
- 構図を明記すること（正面 / 横向き / バストアップ / 2ショット / 俯瞰 など）
- 各キャラクターの表情・ポーズを具体的に書くこと
- 背景・場所を具体的に描写すること（部屋の名称・特徴的なオブジェクトなど）
- キャラクターの外見、衣装、背景セット、画風、色彩、参考画像指定を毎コマに反映すること
- 前のコマからの続きである場合は「前コマの続きとして」何が変化したかを入れること
- アニメ塗り、漫画コマ と明記すること
- 「コミカル」「楽しい」だけでは不十分。絵として描ける具体的な構図指示を書くこと

出力形式:

pages:
  - page: 1
    layout: "free_page"
    story_summary: 作品全体の企画意図、起承転結、キャラクター、世界観、画風、参考画像指定の要約（日本語）
    prompt: このページ全体の場面説明。作品全体の共通設定、画風、背景、キャラクター一貫性を含める（日本語）
    panels:
      - panel: 1
        size: "medium"
        scene: 誰が・どこで・何をしているか・どんな表情かを具体的に（日本語）
        dialogue:
          - speaker: "キャラ名"
            text: "セリフ（日本語）"
        prompt: 前後の文脈、構図、キャラ外見、表情、ポーズ、背景、参考画像指定、画風を具体的に記述した日本語プロンプト

ルール:
${layoutRule}
- STORY に書かれた企画意図を削らず、各ページ・各コマに分解すること。
- 固定コマ数にしないこと。ただし pageTargetPanels と allowed panels を守り、必要以上にpanelを増やさないこと。
- panel密度よりテンポを優先し、説明や会話だけの小コマを増やさないこと。
- scene・dialogue・prompt はすべて日本語で書くこと。英語は使わないこと。`,
          userMessage: `${constrainedStory}${referenceAnalysisSection}`,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.text) {
        let cleaned = data.text.trim();
        if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```[^\n]*\n/, '').replace(/\n?```$/, '');
        const parsedPages = parseYamlPages(cleaned);
        const normalizedPages = compressParsedYamlPagesToBudget(parsedPages, panelBudgets);
        if (normalizedPages.length === 0) throw new Error('YAMLにpanel情報がありません。');
        const actualPanelCount = normalizedPages.reduce((sum, page) => sum + page.panels.length, 0);
        const rawPanelCount = parsedPages.reduce((sum, page) => sum + page.panels.length, 0);
        if (constraints.totalPanels && actualPanelCount < constraints.totalPanels) {
          panelCountWarning = `panel数不足: 希望 ${constraints.totalPanels} コマに対して、YAMLは ${actualPanelCount} コマです。YAMLのpanel数を優先して続行します。`;
        } else if (rawPanelCount > actualPanelCount) {
          panelCountWarning = `panel数調整: YAML生成結果 ${rawPanelCount} コマを、漫画テンポ優先で ${actualPanelCount} コマへ統合しました。`;
        }
        yamlText = serializeParsedYamlPages(normalizedPages);
        parsedYamlPages = normalizedPages;
        queueMicrotask(syncPagesFromYaml);
      }
    } catch (e) {
      errorMsg = `YAML生成失敗: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      generatingYaml = false;
    }
  }

  function inferPanelExpression(panel: { scene: string; dialogue: string; prompt: string }): string {
    const source = `${panel.scene} ${panel.dialogue} ${panel.prompt}`;
    if (/困|不安|焦|驚|びっくり|ショック/.test(source)) return '驚き、不安、焦りが伝わる表情';
    if (/笑|楽|喜|嬉|安心|照れ/.test(source)) return '明るい笑顔、安心感、喜びが伝わる表情';
    if (/怒|叫|強く|決意|真剣/.test(source)) return '強い決意、真剣さ、緊張感が伝わる表情';
    if (/泣|涙|悲|寂/.test(source)) return '悲しみ、涙、繊細な感情が伝わる表情';
    return 'scene と dialogue に合った自然で読み取りやすい表情';
  }

  function buildSingleMangaPagePrompt(srcPages: ParsedYamlPage[]): string {
    const panels = srcPages.flatMap(pg => pg.panels);
    const pageContext = srcPages
      .flatMap(pg => [pg.story_summary, pg.prompt])
      .filter(Boolean)
      .join('\n');
    const panelLines = panels.map((panel, i) => {
      const dialogue = panel.dialogue.trim() || 'セリフなし';
      const scene = panel.scene.trim() || panel.prompt.trim();
      return [
        `コマ ${i + 1}:`,
        `サイズ: ${normalizePanelSize(panel.size)}`,
        `場面: ${scene}`,
        `セリフ: ${dialogue}`,
        `表情: ${inferPanelExpression(panel)}`,
        `画像生成指示: ${panel.prompt.trim() || scene}`,
      ].join('\n');
    }).join('\n\n');

    const perPage = srcPages.map((pg, i) => `ページ ${pg.page ?? i + 1}: ${pg.panels.length} コマ`).join('\n');

    return `locale=ja。
完成した漫画ページを1ページだけ生成する。
自由コマ割りの漫画ページとして、太めの余白と明確なコマ枠で構成する。
他ページを同じ画像に含めない。空コマやプレースホルダーを残さない。
固定グリッドにしない。small、medium、large、splash のサイズ指定に応じて自然に配置する。
このページ単体で読みやすい漫画ページにする。
セリフが存在するコマには、対応する日本語の漫画吹き出しを必ず描画する。セリフを省略しない。
「セリフなし」のコマには吹き出しを描画しない。
キャラクターデザイン、衣装、背景、色彩、画風を全コマで一貫させる。
表情とポーズは各コマの内容に合わせる。
画面内のメタデータ、キャプション、注釈、UIラベルは日本語のみ。
Point、Error、Concern、Scene、Prompt、Panel などの英語ラベルを画像内に描かない。

[ページ内容]
${pageContext || currentStoryInput()}

[ページ構成]
${perPage}

[YAMLからのコマ情報]
${panelLines}

最終画像: 日本語UIキャプションのみの完成漫画ページ。漫画ページ外の説明文、英語ラベル、空欄は入れない。`;
  }

  // STORY → YAML → free-page panel generation
  async function generateMangaPipeline(): Promise<string | void> {
    if (generating || batchGenerating || generatingYaml) return;
    if (!currentStoryInput() && !yamlText.trim()) return;
    batchMode = true;
    studioMediaType = 'image';

    // Step 1: Generate YAML from story if the YAML textarea is empty
    if (!yamlText.trim()) {
      await generateYamlFromStory();
      if (!yamlText.trim()) return; // generation failed
    }

    // Step 2: Parse all panels from YAML and sync free-page panel slots.
    if (parsedYamlPages.length === 0) parsedYamlPages = parseYamlPages(yamlText);
    const yamlPanels = parsedYamlPages.flatMap(pg => pg.panels);
    if (parsedYamlPages.length === 0 || yamlPanels.length === 0) {
      errorMsg = 'YAMLにpanel情報がありません。YAML生成をやり直してください。';
      return;
    }
    syncPagesFromYaml();

    revisedPrompt   = null;
    previewUrl      = null;
    previewVideoUrl = null;

    // Step 3: Generate each page independently so PAGE 1 / PAGE 2 results stay separate.
    await generateBatch();

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const url = pages[pageIdx]?.resultUrl;
      if (!url) continue;
      const promptPages = parsedYamlPages[pageIdx] ? [parsedYamlPages[pageIdx]] : parsedYamlPages;
      await addToHistory(url, buildSingleMangaPagePrompt(promptPages), size);
    }
    previewUrl = pages[activePage]?.resultUrl ?? null;
    return previewUrl ?? undefined;
  }

  function clearPanels(): void {
    for (let pi = 0; pi < pages.length; pi++) {
      pages[pi].panels = pages[pi].panels.map(() => emptySlot());
    }
  }

  function sendToPanel(i: number) {
    if (previewVideoUrl) {
      panels[i] = { ...panels[i], prompt: pages[activePage].prompt, videoUrl: previewVideoUrl };
    } else if (previewUrl) {
      panels[i] = { ...panels[i], prompt: pages[activePage].prompt, imageUrl: previewUrl };
    }
  }

  async function bakeDialogueText(panelIndex: number): Promise<void> {
    const slot = panels[panelIndex];
    if (!slot.imageUrl || !slot.dialogue.trim()) return;

    const fontCss = MANGA_FONTS.find(f => f.id === overlayFont)?.css ?? 'sans-serif';
    const pos     = slot.dialoguePos ?? 'top';

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el  = new Image();
      el.onload  = () => resolve(el);
      el.onerror = reject;
      el.src     = slot.imageUrl!;
    });

    const W = img.naturalWidth, H = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    // Speech bubble area (27% of height)
    const areaH = Math.round(H * 0.27);
    const pad   = Math.round(W * 0.04);
    const areaY = pos === 'top' ? 0 : pos === 'center' ? Math.round((H - areaH) / 2) : H - areaH;

    // Rounded-rect speech bubble background
    const rx = pad, ry = areaY + pad, rw = W - pad * 2, rh = areaH - pad * 2;
    const rr = Math.round(W * 0.025);
    ctx.beginPath();
    ctx.moveTo(rx + rr, ry);
    ctx.arcTo(rx + rw, ry,      rx + rw, ry + rh, rr);
    ctx.arcTo(rx + rw, ry + rh, rx,      ry + rh, rr);
    ctx.arcTo(rx,      ry + rh, rx,      ry,      rr);
    ctx.arcTo(rx,      ry,      rx + rw, ry,      rr);
    ctx.closePath();
    ctx.fillStyle   = 'rgba(255,255,255,0.96)';
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth   = Math.max(1.5, W * 0.003);
    ctx.stroke();

    // Text
    const fsize = Math.round(overlaySize * (W / 512));
    ctx.font         = `${overlayBold ? 700 : 400} ${fsize}px ${fontCss}`;
    ctx.fillStyle    = '#111';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const lines = slot.dialogue.trim().split('\n');
    const lineH = fsize * 1.65;
    let ty = ry + rh / 2 - ((lines.length - 1) * lineH) / 2;
    for (const line of lines) {
      ctx.fillText(line, W / 2, ty, rw - pad * 2);
      ty += lineH;
    }

    panels[panelIndex] = { ...panels[panelIndex], imageUrl: canvas.toDataURL('image/png') };
  }

  // ============================================================
  // Bubble Text Editor — precise coordinate-based correction
  // ============================================================

  // Start drag: records initial mouse position (normalized 0-1 to the edit surface)
  // and installs document-level move/up handlers so the drag continues
  // even when the pointer strays over region overlays.
  function startBubbleDrag(e: MouseEvent, panelIdx: number): void {
    const el = e.currentTarget as HTMLElement;
    const rc = el.getBoundingClientRect();
    const x0 = (e.clientX - rc.left)  / rc.width;
    const y0 = (e.clientY - rc.top)   / rc.height;
    bubbleDrag = { x0, y0, x1: x0, y1: y0 };

    const onMove = (ev: MouseEvent) => {
      bubbleDrag = {
        x0, y0,
        x1: (ev.clientX - rc.left) / rc.width,
        y1: (ev.clientY - rc.top)  / rc.height,
      };
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      if (!bubbleDrag) return;
      const x1 = (ev.clientX - rc.left) / rc.width;
      const y1 = (ev.clientY - rc.top)  / rc.height;
      const lx = Math.max(0, Math.min(1, Math.min(x0, x1)));
      const ly = Math.max(0, Math.min(1, Math.min(y0, y1)));
      const lw = Math.min(1 - lx, Math.abs(x1 - x0));
      const lh = Math.min(1 - ly, Math.abs(y1 - y0));
      bubbleDrag = null;
      if (lw < 0.05 || lh < 0.03) return;   // too small — ignore accidental clicks
      addTextRegion(panelIdx, lx, ly, lw, lh);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  // Create a new blank region; the user types replacement text into it
  function addTextRegion(panelIdx: number, x: number, y: number, w: number, h: number): void {
    const region: TextRegion = {
      id:   Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      x, y, w, h,
      text: '',
      font: overlayFont,
      fontSize: overlaySize,
      bold: overlayBold,
    };
    pages[activePage].panels[panelIdx] = {
      ...pages[activePage].panels[panelIdx],
      textRegions: [...(pages[activePage].panels[panelIdx].textRegions ?? []), region],
    };
    selectedRegionIndex = (pages[activePage].panels[panelIdx].textRegions ?? []).length - 1;
  }

  // Remove a single region by id
  function deleteTextRegion(panelIdx: number, regionId: string): void {
    pages[activePage].panels[panelIdx] = {
      ...pages[activePage].panels[panelIdx],
      textRegions: (pages[activePage].panels[panelIdx].textRegions ?? []).filter(r => r.id !== regionId),
    };
    selectedRegionIndex = null;
  }

  // Update text content of a region (called on every oninput)
  function updateTextRegion(panelIdx: number, regionId: string, text: string): void {
    pages[activePage].panels[panelIdx] = {
      ...pages[activePage].panels[panelIdx],
      textRegions: (pages[activePage].panels[panelIdx].textRegions ?? []).map(
        r => r.id === regionId ? { ...r, text } : r
      ),
    };
  }

  function updateTextRegionBox(panelIdx: number, regionId: string, patch: Partial<Pick<TextRegion, 'x' | 'y' | 'w' | 'h'>>): void {
    pages[activePage].panels[panelIdx] = {
      ...pages[activePage].panels[panelIdx],
      textRegions: (pages[activePage].panels[panelIdx].textRegions ?? []).map(
        r => r.id === regionId ? { ...r, ...patch } : r
      ),
    };
  }

  function updateTextRegionStyle(panelIdx: number, regionId: string, patch: Partial<Pick<TextRegion, 'font' | 'fontSize' | 'bold'>>): void {
    pages[activePage].panels[panelIdx] = {
      ...pages[activePage].panels[panelIdx],
      textRegions: (pages[activePage].panels[panelIdx].textRegions ?? []).map(
        r => r.id === regionId ? { ...r, ...patch } : r
      ),
    };
  }

  function generateBubblesFromDialogue(panelIdx: number): void {
    const slot = pages[activePage].panels[panelIdx];
    if (!slot?.dialogue.trim()) return;
    pages[activePage].panels[panelIdx] = {
      ...slot,
      textRegions: makeDialogueRegions(slot.dialogue),
    };
  }

  function startRegionMove(e: MouseEvent, panelIdx: number, region: TextRegion): void {
    e.preventDefault();
    e.stopPropagation();
    selectedRegionIndex = (pages[activePage].panels[panelIdx].textRegions ?? []).findIndex(r => r.id === region.id);
    const surface = (e.currentTarget as HTMLElement).closest('.bubble-canvas-wrap') as HTMLElement | null;
    if (!surface) return;
    const rc = surface.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRegion = { x: region.x, y: region.y, w: region.w, h: region.h };

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / rc.width;
      const dy = (ev.clientY - startY) / rc.height;
      updateTextRegionBox(panelIdx, region.id, {
        x: Math.max(0, Math.min(1 - startRegion.w, startRegion.x + dx)),
        y: Math.max(0, Math.min(1 - startRegion.h, startRegion.y + dy)),
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Bake all regions into the image via Canvas:
  //   1. Draw original image
  //   2. For each region: paint white rect (erases AI text), then draw user text
  //   3. Save composited PNG as new imageUrl; clear textRegions
  async function bakeTextRegions(panelIdx: number): Promise<void> {
    const slot    = panels[panelIdx];
    const regions = (slot.textRegions ?? []).filter(r => r.text.trim());
    if (!slot.imageUrl || !regions.length) { bubbleEditPanel = null; return; }

    // Load the image
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el  = new Image();
      el.onload  = () => resolve(el);
      el.onerror = reject;
      el.src     = slot.imageUrl!;
    });

    const canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    for (const region of regions) {
      const regionFont = region.font ?? overlayFont;
      const fontCss = MANGA_FONTS.find(f => f.id === regionFont)?.css ?? 'sans-serif';
      const fontSize = region.fontSize ?? overlaySize;
      const fsize = Math.round(fontSize * (img.naturalWidth / 512));
      const bold = region.bold ?? overlayBold;

      // editor-normalized (0-1) → full image native pixels
      const ix = Math.max(0, region.x * img.naturalWidth);
      const iy = Math.max(0, region.y * img.naturalHeight);
      const iw = region.w * img.naturalWidth;
      const ih = region.h * img.naturalHeight;

      // Speech bubble
      const rr = Math.min(iw, ih) * 0.18;
      ctx.beginPath();
      ctx.moveTo(ix + rr, iy);
      ctx.arcTo(ix + iw, iy, ix + iw, iy + ih, rr);
      ctx.arcTo(ix + iw, iy + ih, ix, iy + ih, rr);
      ctx.arcTo(ix, iy + ih, ix, iy, rr);
      ctx.arcTo(ix, iy, ix + iw, iy, rr);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.97)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.74)';
      ctx.lineWidth = Math.max(2, img.naturalWidth * 0.003);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(ix + iw * 0.52, iy + ih);
      ctx.lineTo(ix + iw * 0.64, iy + ih + Math.min(ih * 0.22, img.naturalHeight - (iy + ih)));
      ctx.lineTo(ix + iw * 0.42, iy + ih * 0.92);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.97)';
      ctx.fill();
      ctx.stroke();

      // User text — drawn centered in the masked area
      ctx.font         = `${bold ? 700 : 400} ${fsize}px ${fontCss}`;
      ctx.fillStyle    = '#111';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      const lines = region.text.trim().split('\n');
      const lineH = fsize * 1.6;
      let ty = iy + ih / 2 - ((lines.length - 1) * lineH) / 2;
      for (const line of lines) {
        ctx.fillText(line, ix + iw / 2, ty, iw * 0.9);
        ty += lineH;
      }
    }

    // Save composited result and exit edit mode
    pages[activePage].panels[panelIdx] = {
      ...pages[activePage].panels[panelIdx],
      imageUrl:    canvas.toDataURL('image/png'),
      textRegions: [],   // cleared after baking
    };
    bubbleEditPanel = null;
  }

  async function bakeAllPanels(): Promise<void> {
    const targets = panels
      .map((slot, i) => ({ slot, i }))
      .filter(({ slot }) => slot.imageUrl && (slot.textRegions ?? []).some(r => r.text.trim()));
    if (!targets.length) return;
    for (const { i } of targets) {
      // Temporarily set bubbleEditPanel so bakeTextRegions can exit it; restore after.
      bubbleEditPanel = i;
      await bakeTextRegions(i);
    }
    bubbleEditPanel = null;
    // Trigger download for each baked panel.
    for (const { i } of targets) {
      const url = pages[activePage].panels[i].imageUrl;
      if (!url) continue;
      const a = document.createElement('a');
      a.href = url;
      a.download = `panel_${activePage + 1}_${i + 1}.png`;
      a.click();
    }
  }

  function copyPrompt() {
    const p = currentStoryInput();
    if (p) navigator.clipboard.writeText(p);
  }

  function clearAll() {
    previewUrl               = null;
    revisedPrompt            = null;
    errorMsg                 = '';
    panelCountWarning        = '';
    pages[activePage].prompt = '';
    pages[activePage].panels = panels.map(() => emptySlot());
    pages[activePage].panelCount = pages[activePage].panels.length;
    pages[activePage].pageYaml = serializeStudioPageToYaml(pages[activePage], activePage);
    pages[activePage].resultUrl = null;
    storyText                = '';
    yamlText                 = '';
    referenceImages          = [];
    charProfiles             = [];
    activePanel              = null;
    selectedPanelIndex       = null;
    saveRefImages();
    try { localStorage.removeItem('studio-yaml'); } catch { /* ignore */ }
  }

  function setLayout(id: LayoutId): void {
    const def = LAYOUTS.find(l => l.id === id)!;
    pages[activePage].layout = id;
    if (def.count !== null) {
      const next: PanelSlot[] = [];
      for (let i = 0; i < def.count; i++) next.push(panels[i] ?? emptySlot());
      pages[activePage].panels = next;
      if (activePanel !== null && activePanel >= def.count) activePanel = null;
      if (selectedPanelIndex !== null && selectedPanelIndex >= def.count) selectedPanelIndex = null;
    }
  }

  function addPanel(): void {
    pages[activePage].panels = [...panels, emptySlot()];
    pages[activePage].panelCount = pages[activePage].panels.length;
    selectedPanelIndex = pages[activePage].panels.length - 1;
  }

  function removePanel(i: number): void {
    if (panels.length <= 1) return;
    pages[activePage].panels = panels.filter((_, idx) => idx !== i);
    pages[activePage].panelCount = pages[activePage].panels.length;
    if (activePanel === i) activePanel = null;
    else if (activePanel !== null && activePanel > i) activePanel--;
    if (selectedPanelIndex === i) selectedPanelIndex = null;
    else if (selectedPanelIndex !== null && selectedPanelIndex > i) selectedPanelIndex--;
  }

  function addPage(): void {
    pages = [...pages, createPage()];
    activePage  = pages.length - 1;
    previewUrl = pages[activePage]?.resultUrl ?? null;
    activePanel = null;
    selectedPanelIndex = null;
  }

  function removePage(i: number): void {
    if (pages.length <= 1) return;
    pages      = pages.filter((_, idx) => idx !== i);
    activePage  = Math.min(activePage, pages.length - 1);
    previewUrl = pages[activePage]?.resultUrl ?? null;
    activePanel = null;
    selectedPanelIndex = null;
  }

  function switchPage(i: number): void {
    activePage  = i;
    previewUrl = pages[i]?.resultUrl ?? null;
    activePanel = null;
    selectedPanelIndex = null;
  }

  function closeBubbleEditor(): void {
    bubbleEditPanel = null;
    bubbleDrag = null;
  }

  function openPanelEditor(pageIdx: number, panelIdx: number): void {
    if (!pages[pageIdx]?.panels[panelIdx]) return;
    activePage  = pageIdx;
    activePanel = panelIdx;
    selectedPanelIndex = panelIdx;
  }

  function selectPanel(i: number): void {
    if (!panels[i]) return;
    selectedPanelIndex = i;
  }

  async function regenerateSelectedPanel(): Promise<void> {
    if (selectedPanelIndex === null || !panels[selectedPanelIndex]) return;
    await generatePanel(selectedPanelIndex);
  }

  // ============================================================
  // History
  // ============================================================
  const HISTORY_KEY = 'studio-history';
  const MAX_HISTORY = 20;
  const THUMB_PX    = 160;

  type HistoryEntry = {
    id:        string;
    prompt:    string;
    size:      ImageSize;
    url:       string;   // full base64 in-memory; thumbnail when restored from localStorage
    thumb:     string;   // always compressed thumbnail
    createdAt: string;
  };

  let history     = $state<HistoryEntry[]>([]);
  let historyOpen = $state(true);
  let historyExpanded = $state(false);

  function loadHistory(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const entries = JSON.parse(raw) as HistoryEntry[];
      history = entries;
    } catch { /* ignore */ }
  }

  function saveHistory(entries: HistoryEntry[]): void {
    if (typeof localStorage === 'undefined') return;
    const toSave = entries.map(e => ({ ...e, url: e.thumb }));
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(toSave));
    } catch {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(toSave.slice(-8)));
      } catch { /* fail silently */ }
    }
  }

  async function createThumbnail(dataUrl: string): Promise<string> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const r = Math.min(THUMB_PX / img.width, THUMB_PX / img.height);
        canvas.width  = Math.round(img.width  * r);
        canvas.height = Math.round(img.height * r);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function addToHistory(url: string, p: string, s: ImageSize): Promise<void> {
    const thumb = await createThumbnail(url);
    const entry: HistoryEntry = {
      id: Date.now().toString(), prompt: p, size: s, url, thumb,
      createdAt: new Date().toISOString(),
    };
    history = [entry, ...history].slice(0, MAX_HISTORY);
    saveHistory(history);
  }

  function restoreFromHistory(entry: HistoryEntry): void {
    previewUrl                  = entry.url;
    pages[activePage].prompt    = entry.prompt;
    size                        = entry.size;
    revisedPrompt               = null;
    errorMsg                    = '';
  }

  async function regenerateFromHistory(entry: HistoryEntry, e: MouseEvent): Promise<void> {
    e.stopPropagation();
    pages[activePage].prompt = entry.prompt;
    size                     = entry.size;
    await generate();
  }

  function sendHistoryToPanel(entry: HistoryEntry, i: number, e: MouseEvent): void {
    e.stopPropagation();
    panels[i] = { ...panels[i], imageUrl: entry.url, prompt: entry.prompt };
  }

  function removeHistory(id: string, e: MouseEvent): void {
    e.stopPropagation();
    history = history.filter(h => h.id !== id);
    saveHistory(history);
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  function parseYamlScalar(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    try {
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return JSON.parse(trimmed.replace(/^'/, '"').replace(/'$/, '"'));
      }
    } catch { /* fall through */ }
    return trimmed.replace(/^["']|["']$/g, '');
  }

  function normalizePanelSize(raw: string | undefined): PanelSize {
    if (raw === 'small' || raw === 'medium' || raw === 'large' || raw === 'splash') return raw;
    if (raw === 'normal') return 'medium';
    if (raw === 'wide' || raw === 'tall') return 'large';
    return 'medium';
  }

  function parseDialogueValue(raw: string): string {
    const value = parseYamlScalar(raw);
    if (!value) return '';
    try {
      const arr = JSON.parse(value.replace(/\\"/g, '"')) as unknown[];
      return arr.map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const rec = item as { speaker?: string; text?: string };
          return [rec.speaker, rec.text].filter(Boolean).join(': ');
        }
        return '';
      }).filter(Boolean).join('\n');
    } catch {
      return value;
    }
  }

  function parseYamlPanels(yaml: string): Array<{ scene: string; dialogue: string; prompt: string }> {
    return parseYamlPages(yaml).flatMap(page => page.panels.map(panel => ({
      scene: panel.scene,
      dialogue: panel.dialogue,
      prompt: panel.prompt,
    })));
  }

  // Multi-page YAML parser: supports free_page YAML and the older compact format.
  function parseYamlPages(yaml: string): ParsedYamlPage[] {
    const result: ParsedYamlPage[] = [];
    if (!yaml.trim()) return result;

    const keyVal = (line: string) => line.match(/^\s*(?:-\s*)?([A-Za-z_]+):\s*(.*)$/);
    const flushPanel = () => {
      if (curPage && curPanel && (curPanel.prompt.trim() || curPanel.scene.trim() || curPanel.dialogue.trim())) {
        curPage.panels.push(curPanel);
      }
      curPanel = null;
      dialogueEntry = null;
    };
    const flushPage = () => {
      flushPanel();
      if (curPage && curPage.panels.length > 0) result.push(curPage);
      curPage = null;
    };
    const ensurePage = () => {
      if (!curPage) curPage = { page: result.length + 1, layout: 'free_page', story_summary: '', prompt: '', panels: [] };
      return curPage;
    };

    let curPage: ParsedYamlPage | null = null;
    let curPanel: ParsedYamlPage['panels'][number] | null = null;
    let inPanels = false;
    let inDialogue = false;
    let dialogueEntry: { speaker?: string; text?: string } | null = null;

    for (const rawLine of yaml.split('\n')) {
      const line = rawLine.replace(/\t/g, '  ');
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed === 'pages:') continue;
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      const kv = keyVal(line);
      if (!kv) continue;
      const key = kv[1];
      const value = kv[2] ?? '';

      if (indent <= 2 && trimmed.startsWith('- ')) {
        if (key === 'page' || key === 'layout') {
          flushPage();
          curPage = { page: key === 'page' ? Number(parseYamlScalar(value)) || result.length + 1 : result.length + 1, layout: 'free_page', story_summary: '', prompt: '', panels: [] };
          if (key === 'layout') curPage.layout = parseYamlScalar(value) || 'free_page';
          inPanels = false;
          inDialogue = false;
          continue;
        }
      }

      if (!inPanels && curPage && indent <= 4) {
        if (key === 'page') curPage.page = Number(parseYamlScalar(value)) || curPage.page;
        else if (key === 'layout') curPage.layout = parseYamlScalar(value) || 'free_page';
        else if (key === 'story_summary') curPage.story_summary = parseYamlScalar(value);
        else if (key === 'prompt') curPage.prompt = parseYamlScalar(value);
        else if (key === 'panels') inPanels = true;
        continue;
      }

      if (key === 'panels') {
        ensurePage();
        inPanels = true;
        inDialogue = false;
        continue;
      }

      if (inPanels && trimmed.startsWith('- ') && indent >= 6 && indent <= 8 && (key === 'panel' || key === 'scene' || key === 'prompt' || key === 'size')) {
        flushPanel();
        curPanel = { panel: undefined, size: 'medium', scene: '', dialogue: '', prompt: '' };
        if (key === 'panel') curPanel.panel = Number(parseYamlScalar(value)) || undefined;
        if (key === 'scene') curPanel.scene = parseYamlScalar(value);
        if (key === 'prompt') curPanel.prompt = parseYamlScalar(value);
        if (key === 'size') curPanel.size = normalizePanelSize(parseYamlScalar(value));
        inDialogue = false;
        continue;
      }

      if (!curPanel && inPanels) curPanel = { panel: undefined, size: 'medium', scene: '', dialogue: '', prompt: '' };
      if (!curPanel) continue;

      if (key === 'panel') curPanel.panel = Number(parseYamlScalar(value)) || undefined;
      else if (key === 'size') curPanel.size = normalizePanelSize(parseYamlScalar(value));
      else if (key === 'scene') curPanel.scene = parseYamlScalar(value);
      else if (key === 'prompt') curPanel.prompt = parseYamlScalar(value);
      else if (key === 'negative_prompt') curPanel.negativePrompt = parseYamlScalar(value);
      else if (key === 'model') {
        const model = parseYamlScalar(value) as StudioModelId;
        if (studioModels.some(m => m.id === model)) curPanel.model = model;
      } else if (key === 'dialogue') {
        const parsed = parseDialogueValue(value);
        curPanel.dialogue = parsed;
        inDialogue = true;
        dialogueEntry = null;
      } else if (inDialogue && trimmed.startsWith('- ') && key === 'speaker') {
        if (dialogueEntry) curPanel.dialogue = [...dialogueToBubbleTexts(curPanel.dialogue), [dialogueEntry.speaker, dialogueEntry.text].filter(Boolean).join(': ')].filter(Boolean).join('\n');
        dialogueEntry = { speaker: parseYamlScalar(value), text: '' };
      } else if (inDialogue && key === 'text') {
        if (!dialogueEntry) dialogueEntry = {};
        dialogueEntry.text = parseYamlScalar(value);
        const lineText = [dialogueEntry.speaker, dialogueEntry.text].filter(Boolean).join(': ');
        const existing = dialogueToBubbleTexts(curPanel.dialogue).filter(text => text !== lineText);
        curPanel.dialogue = [...existing, lineText].filter(Boolean).join('\n');
      }
    }
    flushPage();
    return result.map((page, i) => ({
      ...page,
      page: page.page ?? i + 1,
      layout: normalizeLayoutId(page.layout, 'free_page'),
      panelCount: page.panels.length,
      panels: page.panels.map((panel, panelIdx) => ({
        ...panel,
        panel: panel.panel ?? panelIdx + 1,
        size: normalizePanelSize(panel.size),
      })),
    }));
  }

  function paginateYamlPanels(srcPages: ParsedYamlPage[]): ParsedYamlPage[] {
    return srcPages
      .filter(page => page.panels.length > 0)
      .map((page, i) => ({
        ...page,
        page: page.page ?? i + 1,
        layout: 'free_page',
        panelCount: page.panels.length,
        panels: page.panels,
      }));
  }

  function panelSizeRank(size: PanelSize | undefined): number {
    return ({ small: 0, medium: 1, large: 2, splash: 3 } as Record<PanelSize, number>)[normalizePanelSize(size)];
  }

  function largerPanelSize(a: PanelSize | undefined, b: PanelSize | undefined): PanelSize {
    return panelSizeRank(a) >= panelSizeRank(b) ? normalizePanelSize(a) : normalizePanelSize(b);
  }

  function dialogueCount(dialogue: ParsedYamlPage['panels'][number]['dialogue']): number {
    return dialogueToBubbleTexts(dialogue).length;
  }

  function pickMergePanelIndex(srcPanels: ParsedYamlPage['panels']): number {
    if (srcPanels.length <= 1) return 0;
    for (let i = 0; i < srcPanels.length - 1; i++) {
      const a = srcPanels[i];
      const b = srcPanels[i + 1];
      const hasSmallPanel = normalizePanelSize(a.size) === 'small' || normalizePanelSize(b.size) === 'small';
      const lightDialogue = dialogueCount(a.dialogue) + dialogueCount(b.dialogue) <= 2;
      if (hasSmallPanel || lightDialogue) return i;
    }
    return Math.max(0, srcPanels.length - 2);
  }

  function mergeAdjacentPanels(
    first: ParsedYamlPage['panels'][number],
    second: ParsedYamlPage['panels'][number],
    panelNumber: number,
  ): ParsedYamlPage['panels'][number] {
    const sceneParts = [first.scene, second.scene].map(part => part?.trim()).filter(Boolean);
    const promptParts = [first.prompt, second.prompt].map(part => part?.trim()).filter(Boolean);
    const dialogue = [
      ...dialogueToBubbleTexts(first.dialogue),
      ...dialogueToBubbleTexts(second.dialogue),
    ].filter(Boolean).join('\n');

    return {
      panel: panelNumber,
      size: largerPanelSize(first.size, second.size),
      scene: sceneParts.length > 0 ? `${sceneParts.join(' / ')}。近い出来事を1コマに統合したmontage演出。` : '近い出来事を1コマに統合したmontage演出。',
      dialogue,
      prompt: promptParts.length > 0
        ? `近いsceneを1コマに統合した漫画演出。${promptParts.join(' / ')}`
        : '近いsceneを1コマに統合した漫画演出。会話のみの小コマをまとめ、テンポよく読める構図。',
      negativePrompt: first.negativePrompt || second.negativePrompt,
      model: first.model ?? second.model,
    };
  }

  function compressParsedYamlPagesToBudget(srcPages: ParsedYamlPage[], budgets: PagePanelBudget[]): ParsedYamlPage[] {
    return srcPages.map((page, pageIdx) => {
      const budget = budgets[pageIdx] ?? budgets[budgets.length - 1];
      const maxPanels = budget?.max ?? RECOMMENDED_MAX_PANELS_PER_PAGE;
      let nextPanels = page.panels.map(panel => ({ ...panel }));

      while (nextPanels.length > maxPanels && nextPanels.length > 1) {
        const mergeIdx = pickMergePanelIndex(nextPanels);
        const merged = mergeAdjacentPanels(nextPanels[mergeIdx], nextPanels[mergeIdx + 1], mergeIdx + 1);
        nextPanels = [
          ...nextPanels.slice(0, mergeIdx),
          merged,
          ...nextPanels.slice(mergeIdx + 2),
        ].map((panel, i) => ({ ...panel, panel: i + 1 }));
      }

      return {
        ...page,
        panelCount: nextPanels.length,
        panels: nextPanels,
      };
    });
  }

  // Sync studio pages layout + slot count from parsedYamlPages.
  // Called after YAML changes (via queueMicrotask) and before batch generation.
  function syncPagesFromYaml(): void {
    const yp = paginateYamlPanels(parsedYamlPages);
    if (!yp.length) return;

    // Ensure enough studio pages exist
    while (pages.length < yp.length) pages = [...pages, createPage()];
    if (pages.length > yp.length) {
      pages = pages.slice(0, yp.length);
      activePage = Math.min(activePage, pages.length - 1);
    }

    for (let pi = 0; pi < yp.length; pi++) {
      const n = yp[pi].panels.length;
      if (!n) continue;

      pages[pi].layout = normalizeLayoutId(yp[pi].layout, 'free_page');
      if (yp[pi].prompt || yp[pi].story_summary)
        pages[pi].prompt = [yp[pi].story_summary, yp[pi].prompt].filter(Boolean).join('\n');

      // Expand: add empty slots until we have n
      while (pages[pi].panels.length < n)
        pages[pi].panels = [...pages[pi].panels, emptySlot()];

      for (let i = 0; i < n; i++) {
        const src = yp[pi].panels[i];
        pages[pi].panels[i] = ensureDialogueRegions({
          ...pages[pi].panels[i],
          scene:    src.scene,
          prompt:   src.prompt,
          panelSize: normalizePanelSize(src.size),
          negativePrompt: src.negativePrompt ?? pages[pi].panels[i].negativePrompt ?? '',
          model: src.model ?? pages[pi].panels[i].model,
          dialogue: src.dialogue,
        });
      }

      // Contract: the visible panel count follows YAML panels.length.
      if (pages[pi].panels.length > n) {
        pages[pi].panels = pages[pi].panels.slice(0, n);
      }
      pages[pi].panelCount = n;

      if (pi === activePage && selectedPanelIndex !== null && selectedPanelIndex >= n) {
        selectedPanelIndex = null;
      }

      pages[pi].pageYaml = serializeParsedYamlPages([{ ...yp[pi], page: pi + 1, layout: 'free_page' }]);
    }
  }

  // ============================================================
  // Project Save / Load
  // ============================================================
  const PROJECT_VERSION  = 1 as const;
  const PROJECT_KEY      = 'studio-project';
  const MANGA_IMPORT_KEY = 'studio-manga-import';
  const DIARY_IMPORT_KEY = 'studio-diary-import';
  const YAML_IMPORT_KEY  = 'studio-yaml-import';
  const REF_KEY          = 'studio-ref-images';

  type MangaImportData = {
    panels:     Array<{ prompt: string; scene: string }>;
    sourceText: string;
    storyText?: string;
    referenceImages?: Array<{ name: string; dataUrl: string; originalDataUrl?: string; note: string }>;
    charProfiles?: string[];
  };

  type DiaryImportData = {
    prompt:    string;
    diaryText: string;
    date:      string;
  };

  type YamlImportData = {
    pages: Array<{
      page?:    number;
      layout:  string;
      prompt:  string;
      panels:  Array<{ panel?: number; size?: PanelSize; scene?: string; dialogue?: string | Array<{ speaker?: string; text?: string }>; prompt: string }>;
    }>;
    refs?: { a?: string; b?: string };
    referenceImages?: Array<{ name: string; dataUrl: string; originalDataUrl?: string; note: string }>;
    charProfiles?: string[];
    sourceText?: string;
  };

  // ── Diary History System ──────────────────────────────────
  type DiaryMood = 'happy' | 'excited' | 'calm' | 'sad' | 'tense' | 'tired';

  const MOOD_OPTIONS: { id: DiaryMood; icon: string; label: string; color: string }[] = [
    { id: 'happy',   icon: '✦', label: '楽しい',   color: '#00e5ff' },
    { id: 'excited', icon: '⚡', label: 'わくわく',  color: '#fbbf24' },
    { id: 'calm',    icon: '◈', label: 'のんびり',  color: '#34d399' },
    { id: 'sad',     icon: '▼', label: 'しんみり',  color: '#60a5fa' },
    { id: 'tense',   icon: '◼', label: 'もやもや',  color: '#f87171' },
    { id: 'tired',   icon: '◉', label: 'つかれた',  color: '#a78bfa' },
  ];

  type DiaryEntry = {
    id:        string;
    date:      string;
    diaryText: string;
    prompt:    string;
    mood:      DiaryMood;
    thumb?:    string;
    createdAt: string;
  };

  const DIARY_HISTORY_KEY = 'studio-diary-history';
  const MAX_DIARY_ENTRIES = 30;

  let diaryHistory      = $state<DiaryEntry[]>([]);
  let currentDiaryMood  = $state<DiaryMood>('calm');
  let activeDiaryId     = $state<string | null>(null);

  type SavedPanel  = { scene?: string; prompt: string; panelSize?: PanelSize; negativePrompt?: string; model?: StudioModelId; imageUrl?: string | null; videoUrl?: string | null; dialogue?: string; dialoguePos?: 'top' | 'center' | 'bottom'; textRegions?: TextRegion[] };
  type SavedPage   = { id: string; prompt: string; layout: LayoutId; panelCount?: number; pageYaml?: string; resultUrl?: string | null; panels: SavedPanel[] };
  type ProjectData = {
    version:    typeof PROJECT_VERSION;
    savedAt:    string;
    activePage: number;
    size:       ImageSize;
    storyText?: string;
    pages:      SavedPage[];
    history?:   HistoryEntry[];
    refs?:      { a?: RefImage | null; b?: RefImage | null; images?: RefImage[] };
    referenceImages?: RefImage[];
    charProfiles?: string[];
  };

  let saveFlash          = $state(false);
  let mangaImportBanner  = $state(false);
  let diaryImportBanner  = $state(false);
  let yamlImportBanner   = $state(false);
  let diaryNote          = $state<DiaryImportData | null>(null);

  // ── Browser ──────────────────────────────────────────────
  const INDEX_KEY = 'studio-index';
  const PROJ_PFX  = 'studio-proj-';
  const STUDIO_SESSION_KEY = 'studio-session-v1';

  type ProjectMeta = { id: string; name: string; savedAt: string; pageCount: number };

  let currentProjectId   = $state<string | null>(null);
  let currentProjectName = $state('Untitled');
  let browserOpen        = $state(false);
  let projectIndex       = $state<ProjectMeta[]>([]);
  let renamingId         = $state<string | null>(null);
  let renameValue        = $state('');

  function buildProjectData(includeHistory: boolean): ProjectData {
    return {
      version:    PROJECT_VERSION,
      savedAt:    new Date().toISOString(),
      activePage,
      size,
      storyText,
      pages: pages.map((pg, pageIdx) => ({
        id:     pg.id,
        prompt: pg.prompt,
        layout: pg.layout,
        panelCount: pg.panels.length,
        pageYaml: serializeStudioPageToYaml(pg, pageIdx),
        resultUrl: pg.resultUrl,
        panels: pg.panels.map(p => ({ scene: p.scene, prompt: p.prompt, panelSize: p.panelSize, negativePrompt: p.negativePrompt, model: p.model, imageUrl: p.imageUrl, videoUrl: p.videoUrl, dialogue: p.dialogue, dialoguePos: p.dialoguePos, textRegions: p.textRegions })),
      })),
      refs: { images: referenceImages },
      referenceImages,
      charProfiles,
      ...(includeHistory ? { history: history.map(e => ({ ...e, url: e.thumb })) } : {}),
    };
  }

  function applyProjectData(data: ProjectData): void {
    if (!Array.isArray(data.pages) || data.pages.length === 0) return;
    pages = data.pages.map(pg => ({
      id:     pg.id ?? (Date.now().toString() + Math.random().toString(36).slice(2, 6)),
      prompt: pg.prompt ?? '',
      layout: normalizeLayoutId(pg.layout, 'free_page'),
      panelCount: (pg.panels ?? []).length,
      pageYaml: pg.pageYaml ?? '',
      resultUrl: pg.resultUrl ?? null,
      panels: (pg.panels ?? []).map(p => ({
        scene: p.scene ?? '', prompt: p.prompt ?? '', panelSize: normalizePanelSize(p.panelSize), negativePrompt: p.negativePrompt ?? '', model: p.model, imageUrl: p.imageUrl ?? null, videoUrl: p.videoUrl ?? null, generating: false, dialogue: p.dialogue ?? '', dialoguePos: p.dialoguePos ?? 'top', textRegions: p.textRegions ?? [],
      })),
    }));
    pages = pages.map((pg, pageIdx) => ({
      ...pg,
      pageYaml: pg.pageYaml.trim() ? pg.pageYaml : serializeStudioPageToYaml(pg, pageIdx),
    }));
    activePage    = Math.min(data.activePage ?? 0, pages.length - 1);
    storyText     = data.storyText ?? pages[0]?.prompt ?? storyText;
    size          = (data.size ?? '1024x1024') as ImageSize;
    previewUrl    = null;
    revisedPrompt = null;
    errorMsg      = '';
    activePanel   = null;
    const restoredRefs = data.referenceImages ?? data.refs?.images ?? [data.refs?.a ?? null, data.refs?.b ?? null].filter(Boolean) as RefImage[];
    referenceImages = restoredRefs.map(r => normalizeRef(r) ?? emptyRefImage());
    charProfiles = (data.charProfiles ?? charProfiles).slice(0, referenceImages.length);
    saveRefImages();
  }

  function genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function persistToIndex(id: string, name: string, data: ProjectData): void {
    const meta: ProjectMeta = { id, name, savedAt: data.savedAt, pageCount: data.pages.length };
    const idx = projectIndex.findIndex(m => m.id === id);
    if (idx >= 0) projectIndex[idx] = meta;
    else           projectIndex = [meta, ...projectIndex];
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(projectIndex)); } catch { /* quota */ }
    try { localStorage.setItem(PROJ_PFX + id, JSON.stringify(data)); }
    catch {
      try { localStorage.setItem(PROJ_PFX + id, JSON.stringify({ ...data, history: undefined })); }
      catch { /* fail */ }
    }
  }

  function saveProject(): void {
    if (!currentProjectId) currentProjectId = genId();
    const data = buildProjectData(true);
    persistToIndex(currentProjectId, currentProjectName, data);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(PROJECT_KEY, JSON.stringify(buildProjectData(false))); }
      catch { /* quota */ }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `studio-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    saveFlash = true;
    setTimeout(() => { saveFlash = false; }, 1800);
  }

  async function loadProjectFile(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as ProjectData;
      if (data.version !== PROJECT_VERSION) {
        errorMsg = 'バージョン不一致のプロジェクトファイルです。';
        return;
      }
      applyProjectData(data);
      if (Array.isArray(data.history)) { history = data.history; saveHistory(history); }
      const importId   = genId();
      const importName = file.name.replace(/\.json$/i, '');
      persistToIndex(importId, importName, data);
      currentProjectId   = importId;
      currentProjectName = importName;
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(PROJECT_KEY, JSON.stringify(buildProjectData(false))); }
        catch { /* quota */ }
      }
    } catch {
      errorMsg = 'プロジェクトファイルの読み込みに失敗しました。';
    }
  }

  function loadProjectFromStorage(): void {
    if (typeof localStorage === 'undefined') return;

    // One-shot: YAML import from Lab
    try {
      const yamlRaw = localStorage.getItem(YAML_IMPORT_KEY);
      if (yamlRaw) {
        localStorage.removeItem(YAML_IMPORT_KEY);
        const imp = JSON.parse(yamlRaw) as YamlImportData;
        if (Array.isArray(imp.pages) && imp.pages.length > 0) {
          const importedPages = paginateYamlPanels(imp.pages.map(pg => ({
            page: Number((pg as { page?: number }).page) || undefined,
            layout: pg.layout ?? 'free_page',
            prompt: pg.prompt ?? '',
            panels: (pg.panels ?? []).map(p => ({
              panel: Number((p as { panel?: number }).panel) || undefined,
              size: normalizePanelSize((p as { size?: string }).size),
              scene: p.scene ?? '',
              prompt: p.prompt ?? '',
              dialogue: Array.isArray(p.dialogue)
                ? (p.dialogue as unknown[]).map(item => {
                    if (typeof item === 'string') return item;
                    const rec = item as { speaker?: string; text?: string };
                    return [rec.speaker, rec.text].filter(Boolean).join(': ');
                  }).filter(Boolean).join('\n')
                : (p.dialogue ?? ''),
            })),
          })));
          applyProjectData({
            version:    PROJECT_VERSION,
            savedAt:    new Date().toISOString(),
            activePage: 0,
            size:       '1024x1024',
            pages: importedPages.map(pg => ({
              id:     genId(),
              prompt: pg.prompt ?? '',
              layout: 'free_page',
              panels: pg.panels.map(p => ({ scene: p.scene ?? '', prompt: p.prompt ?? '', panelSize: normalizePanelSize(p.size), dialogue: p.dialogue ?? '' })),
            })),
          });
          if (Array.isArray(imp.referenceImages) && imp.referenceImages.length > 0) {
            referenceImages = imp.referenceImages.map(r => normalizeRef({
              thumb: r.dataUrl, thumbs: [r.dataUrl], originals: [r.originalDataUrl ?? r.dataUrl],
              label: r.note || r.name, name: r.name, names: [r.name],
            }) ?? emptyRefImage());
            charProfiles = (imp.charProfiles ?? []).slice(0, referenceImages.length);
            saveRefImages();
          } else if (imp.refs) {
            referenceImages = [
              imp.refs.a ? { ...emptyRefImage(), label: imp.refs.a, name: 'yaml-ref-a', names: ['yaml-ref-a'] } : null,
              imp.refs.b ? { ...emptyRefImage(), label: imp.refs.b, name: 'yaml-ref-b', names: ['yaml-ref-b'] } : null,
            ].filter((r): r is RefImage => !!r);
            charProfiles = (imp.charProfiles ?? []).slice(0, referenceImages.length);
            saveRefImages();
          }
          // Also populate YAML textarea from studio-yaml
          try {
            const rawYaml = localStorage.getItem('studio-yaml');
            if (rawYaml) { yamlText = rawYaml; parsedPanels = parseYamlPanels(rawYaml); }
          } catch { /* ignore */ }
          yamlImportBanner = true;
          setTimeout(() => { yamlImportBanner = false; }, 4000);
          return;
        }
      }
    } catch { /* ignore */ }

    // Raw YAML text → sidebar textarea (takes priority over project restore)
    try {
      console.log('[studio-yaml]', localStorage.getItem('studio-yaml'));
      const rawYaml = localStorage.getItem('studio-yaml');
      const mangaPending = localStorage.getItem(MANGA_IMPORT_KEY);
      if (rawYaml && !mangaPending) {
        yamlText = rawYaml;
        parsedYamlPages = parseYamlPages(rawYaml);
        if (parsedYamlPages.length > 0) {
          syncPagesFromYaml();
          parsedPanels = parsedYamlPages.flatMap(pg => pg.panels);
        }
        return;
      }
    } catch { /* ignore */ }

    // One-shot: manga import from Lab
    try {
      const mangaRaw = localStorage.getItem(MANGA_IMPORT_KEY);
      if (mangaRaw) {
        localStorage.removeItem(MANGA_IMPORT_KEY);
        const imp = JSON.parse(mangaRaw) as MangaImportData;
        if (Array.isArray(imp.panels) && imp.panels.length > 0) {
          const importedStoryText = (imp.storyText ?? [
            imp.sourceText ? `[source]\n${imp.sourceText}` : '',
            ...imp.panels.map((panel, index) => [
              `[panel${index + 1}]`,
              panel.scene ? `scene: ${panel.scene}` : '',
              panel.prompt ? `prompt: ${panel.prompt}` : '',
            ].filter(Boolean).join('\n')),
          ].filter(Boolean).join('\n\n')).trim();
          const importedPages: Page[] = [{
            id:     genId(),
            prompt: importedStoryText || (imp.sourceText ? `MANGA: ${imp.sourceText}` : ''),
            layout: 'free_page',
            panelCount: imp.panels.length,
            pageYaml: '',
            resultUrl: null,
            panels: imp.panels.map(p => ({
              scene: p.scene ?? '',
              prompt: p.prompt,
              panelSize: 'medium',
              imageUrl: null,
              videoUrl: null,
              generating: false,
              dialogue: '',
              dialoguePos: 'top',
              textRegions: [],
            })),
          }];
          applyProjectData({
            version:    PROJECT_VERSION,
            savedAt:    new Date().toISOString(),
            activePage: 0,
            size:       '1024x1024',
            storyText:  importedStoryText,
            pages: importedPages,
            referenceImages: Array.isArray(imp.referenceImages)
              ? imp.referenceImages.map(r => ({
                  thumb: r.dataUrl,
                  thumbs: [r.dataUrl],
                  originals: [r.originalDataUrl ?? r.dataUrl],
                  label: r.note || r.name,
                  name: r.name,
                  names: [r.name],
                }))
              : undefined,
            charProfiles: imp.charProfiles,
          });
          mangaImportBanner = true;
          setTimeout(() => { mangaImportBanner = false; }, 4000);
          return;
        }
      }
    } catch { /* ignore */ }

    // One-shot: diary import from Lab
    try {
      const diaryRaw = localStorage.getItem(DIARY_IMPORT_KEY);
      if (diaryRaw) {
        localStorage.removeItem(DIARY_IMPORT_KEY);
        const imp = JSON.parse(diaryRaw) as DiaryImportData;
        if (imp.prompt) {
          applyProjectData({
            version:    PROJECT_VERSION,
            savedAt:    new Date().toISOString(),
            activePage: 0,
            size:       '1024x1024',
            pages: [{
              id:     genId(),
              prompt: imp.prompt,
              layout: 'single',
              panels: [{ scene: '', prompt: imp.prompt, dialogue: '' }],
            }],
          });
          diaryNote         = imp;
          diaryImportBanner = true;
          setTimeout(() => { diaryImportBanner = false; }, 4000);
          return;
        }
      }
    } catch { /* ignore */ }

    // Normal project load
    try {
      const raw = localStorage.getItem(PROJECT_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as ProjectData;
      if (data.version !== PROJECT_VERSION) return;
      applyProjectData(data);
    } catch { /* ignore */ }
  }

  // ── Diary History functions ──────────────────────────────
  function loadDiaryHistory(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(DIARY_HISTORY_KEY);
      diaryHistory = raw ? (JSON.parse(raw) as DiaryEntry[]) : [];
    } catch { diaryHistory = []; }
  }

  function saveDiaryHistory(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(DIARY_HISTORY_KEY, JSON.stringify(diaryHistory));
    } catch {
      try { localStorage.setItem(DIARY_HISTORY_KEY, JSON.stringify(diaryHistory.slice(0, 15))); }
      catch { /* quota */ }
    }
  }

  async function generateDiaryImage(): Promise<void> {
    if (!diaryNote) return;
    if (layout !== 'single') setLayout('single');
    await generate();
  }

  function loadDiaryEntryForView(entry: DiaryEntry): void {
    diaryNote        = { prompt: entry.prompt, diaryText: entry.diaryText, date: entry.date };
    currentDiaryMood = entry.mood;
    activeDiaryId    = entry.id;
    pages[activePage].prompt = entry.prompt;
    if (layout !== 'single') setLayout('single');
  }

  function removeDiaryEntry(id: string): void {
    diaryHistory = diaryHistory.filter(e => e.id !== id);
    saveDiaryHistory();
    if (activeDiaryId === id) { activeDiaryId = null; diaryNote = null; }
  }

  function clearDiaryHistory(): void {
    diaryHistory  = [];
    activeDiaryId = null;
    diaryNote     = null;
    if (typeof localStorage !== 'undefined') localStorage.removeItem(DIARY_HISTORY_KEY);
  }

  // ============================================================
  // Character Library
  // ============================================================
  function cloneRefImages(refs: RefImage[]): RefImage[] {
    return refs.map(ref => normalizeRef(JSON.parse(JSON.stringify(ref)) as RefImage) ?? emptyRefImage());
  }

  function loadCharacterLibrary(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(CHARACTER_LIBRARY_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as CharacterSet[];
      if (!Array.isArray(data)) return;
      characterLibrary = data
        .filter(item => item?.name && Array.isArray(item.referenceImages))
        .map(item => {
          const referenceImages = cloneRefImages(item.referenceImages);
          return {
            id: item.id ?? genId(),
            name: item.name,
            referenceImages,
            originals: Array.isArray(item.originals) ? item.originals : referenceImages.flatMap(ref => ref.originals ?? []),
            thumbs: Array.isArray(item.thumbs) ? item.thumbs : referenceImages.flatMap(ref => ref.thumbs ?? []),
            createdAt: item.createdAt ?? new Date().toISOString(),
          };
        });
    } catch { /* ignore */ }
  }

  function saveCharacterLibrary(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(CHARACTER_LIBRARY_KEY, JSON.stringify(characterLibrary));
    } catch (e) {
      errorMsg = `Character Library 保存失敗: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  function yamlQuote(value: string): string {
    return JSON.stringify(value ?? '');
  }

  function serializeParsedYamlPages(srcPages: ParsedYamlPage[]): string {
    const lines: string[] = ['pages:'];
    for (const [pageIdx, pg] of srcPages.entries()) {
      lines.push(`  - page: ${pg.page ?? pageIdx + 1}`);
      lines.push(`    layout: "free_page"`);
      if (pg.story_summary) lines.push(`    story_summary: ${yamlQuote(pg.story_summary)}`);
      if (pg.prompt) lines.push(`    prompt: ${yamlQuote(pg.prompt)}`);
      lines.push(`    panels:`);
      for (const [panelIdx, panel] of pg.panels.entries()) {
        lines.push(`      - panel: ${panel.panel ?? panelIdx + 1}`);
        lines.push(`        size: ${yamlQuote(normalizePanelSize(panel.size))}`);
        if (panel.scene) lines.push(`        scene: ${yamlQuote(panel.scene)}`);
        const dialogue = dialogueToBubbleTexts(panel.dialogue);
        if (dialogue.length === 0) {
          lines.push(`        dialogue: []`);
        } else {
          lines.push(`        dialogue:`);
          for (const line of dialogue) {
            const [speaker, ...textParts] = line.includes(':') ? line.split(':') : ['', line];
            lines.push(`          - speaker: ${yamlQuote(speaker.trim())}`);
            lines.push(`            text: ${yamlQuote(textParts.join(':').trim())}`);
          }
        }
        lines.push(`        prompt: ${yamlQuote(panel.prompt)}`);
        if (panel.negativePrompt?.trim()) lines.push(`        negative_prompt: ${yamlQuote(panel.negativePrompt.trim())}`);
        if (panel.model) lines.push(`        model: ${yamlQuote(panel.model)}`);
      }
    }
    return lines.join('\n');
  }

  function pageToParsedYamlPage(pg: Page, pageIdx: number): ParsedYamlPage {
    return {
      page: pageIdx + 1,
      layout: 'free_page',
      panelCount: pg.panels.length,
      prompt: pg.prompt ?? '',
      panels: pg.panels.map((p, panelIdx) => ({
        panel: panelIdx + 1,
        size: normalizePanelSize(p.panelSize),
        scene: p.scene ?? '',
        dialogue: p.dialogue ?? '',
        prompt: p.prompt ?? '',
        negativePrompt: p.negativePrompt,
        model: p.model,
      })),
    };
  }

  function serializeStudioPageToYaml(pg: Page, pageIdx: number): string {
    return serializeParsedYamlPages([pageToParsedYamlPage(pg, pageIdx)]);
  }

  function refreshPageYaml(pageIdx: number): void {
    if (!pages[pageIdx]) return;
    pages[pageIdx] = {
      ...pages[pageIdx],
      pageYaml: serializeStudioPageToYaml(pages[pageIdx], pageIdx),
    };
  }

  function normalizeYamlPageCount(srcPages: ParsedYamlPage[], targetPageCount: 1 | 2): ParsedYamlPage[] {
    const validPages = srcPages.filter(page => page.panels.length > 0);
    if (validPages.length === 0) return [];
    const allPanels = validPages.flatMap(page => page.panels);
    if (targetPageCount === 1) {
      return [{
        page: 1,
        layout: 'free_page',
        story_summary: validPages.map(page => page.story_summary).filter(Boolean).join(' / '),
        prompt: validPages.map(page => page.prompt).filter(Boolean).join(' / '),
        panelCount: allPanels.length,
        panels: allPanels.map((panel, i) => ({ ...panel, panel: i + 1, size: normalizePanelSize(panel.size) })),
      }];
    }
    if (validPages.length >= 2) {
      const first = validPages[0];
      const restPanels = validPages.slice(1).flatMap(page => page.panels);
      return [
        { ...first, page: 1, layout: 'free_page', panelCount: first.panels.length, panels: first.panels.map((panel, i) => ({ ...panel, panel: i + 1, size: normalizePanelSize(panel.size) })) },
        {
          ...validPages[1],
          page: 2,
          layout: 'free_page',
          panelCount: restPanels.length,
          panels: restPanels.map((panel, i) => ({ ...panel, panel: i + 1, size: normalizePanelSize(panel.size) })),
        },
      ];
    }
    const splitAt = Math.max(1, Math.ceil(allPanels.length / 2));
    const pagePrompt = validPages[0].prompt ?? '';
    const summary = validPages[0].story_summary ?? '';
    return [0, 1].map((pageIdx) => {
      const chunk = pageIdx === 0 ? allPanels.slice(0, splitAt) : allPanels.slice(splitAt);
      return {
        page: pageIdx + 1,
        layout: 'free_page',
        panelCount: chunk.length,
        story_summary: summary,
        prompt: pagePrompt,
        panels: (chunk.length ? chunk : [emptySlot()]).map((panel, i) => ({
          panel: i + 1,
          size: normalizePanelSize((panel as ParsedYamlPage['panels'][number]).size ?? (panel as PanelSlot).panelSize),
          scene: panel.scene ?? '',
          dialogue: panel.dialogue ?? '',
          prompt: panel.prompt ?? '',
        })),
      };
    });
  }

  function serializePagesToYaml(): string {
    const lines: string[] = ['pages:'];
    for (const [pageIdx, pg] of pages.entries()) {
      lines.push(`  - page: ${pageIdx + 1}`);
      lines.push(`    layout: "free_page"`);
      lines.push(`    prompt: ${yamlQuote(pg.prompt ?? '')}`);
      lines.push(`    panels:`);
      for (const [panelIdx, p] of pg.panels.entries()) {
        const dialogue = dialogueToBubbleTexts(p.dialogue ?? '');
        lines.push(`      - panel: ${panelIdx + 1}`);
        lines.push(`        size: ${yamlQuote(normalizePanelSize(p.panelSize))}`);
        lines.push(`        scene: ${yamlQuote(p.scene ?? '')}`);
        if (dialogue.length === 0) {
          lines.push(`        dialogue: []`);
        } else {
          lines.push(`        dialogue:`);
          for (const line of dialogue) {
            const [speaker, ...textParts] = line.includes(':') ? line.split(':') : ['', line];
            lines.push(`          - speaker: ${yamlQuote(speaker.trim())}`);
            lines.push(`            text: ${yamlQuote(textParts.join(':').trim())}`);
          }
        }
        lines.push(`        prompt: ${yamlQuote(p.prompt ?? '')}`);
        if (p.negativePrompt?.trim()) lines.push(`        negative_prompt: ${yamlQuote(p.negativePrompt.trim())}`);
        if (p.model) lines.push(`        model: ${yamlQuote(p.model)}`);
      }
    }
    return lines.join('\n');
  }

  function savePanelEditor(panelIdx: number): void {
    yamlText = serializePagesToYaml();
    parsedYamlPages = parseYamlPages(yamlText);
    activePanel = null;
  }

  function saveCurrentCharacterSet(): void {
    const name = characterSetName.trim();
    if (!name) {
      errorMsg = 'キャラクターセット名を入力してください。';
      return;
    }
    const refs = cloneRefImages(referenceImages).filter(ref => ref.thumb || ref.thumbs.length || ref.originals.length || ref.label.trim());
    if (refs.length === 0) {
      errorMsg = '保存する参照画像がありません。';
      return;
    }
    const item: CharacterSet = {
      id: genId(),
      name,
      referenceImages: refs,
      originals: refs.flatMap(ref => ref.originals ?? []),
      thumbs: refs.flatMap(ref => ref.thumbs?.length ? ref.thumbs : (ref.thumb ? [ref.thumb] : [])),
      createdAt: new Date().toISOString(),
    };
    characterLibrary = [item, ...characterLibrary];
    characterSetName = '';
    errorMsg = '';
    saveCharacterLibrary();
  }

  function loadCharacterSet(item: CharacterSet): void {
    referenceImages = cloneRefImages(item.referenceImages);
    charProfiles = referenceImages.map(() => '');
    saveRefImages();
  }

  type StudioPageMode = 'one-page' | 'two-page';
  type StudioSessionData = ProjectData & {
    yamlText?: string;
    selectedPanel?: number | null;
    pageMode?: StudioPageMode;
    characterLibraryText?: string;
    generatedImages?: Array<{ page: number; panel: number; imageUrl: string | null; videoUrl: string | null }>;
    resultUrl?: string | null;
  };

  function normalizeStudioPageMode(raw: unknown): 1 | 2 {
    if (raw === 2 || raw === '2' || raw === 'two-page') return 2;
    return 1;
  }

  function buildStudioSessionData(): StudioSessionData {
    const data = buildProjectData(false) as StudioSessionData;
    data.yamlText = yamlText;
    data.selectedPanel = selectedPanelIndex;
    data.pageMode = mangaPageMode === 2 ? 'two-page' : 'one-page';
    data.characterLibraryText = charProfiles.join('\n\n');
    data.generatedImages = pages.flatMap((pg, pageIdx) =>
      pg.panels.map((panel, panelIdx) => ({
        page: pageIdx,
        panel: panelIdx,
        imageUrl: panel.imageUrl,
        videoUrl: panel.videoUrl,
      }))
    );
    data.resultUrl = pages[activePage]?.resultUrl ?? previewUrl;
    return data;
  }

  function saveStudioSession(session: StudioSessionData = buildStudioSessionData()): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STUDIO_SESSION_KEY, JSON.stringify(session));
    } catch {
      const slimPages = session.pages.map(pg => ({
        ...pg,
        panels: pg.panels.map(panel => ({ ...panel, videoUrl: null })),
      }));
      try { localStorage.setItem(STUDIO_SESSION_KEY, JSON.stringify({ ...session, pages: slimPages, generatedImages: undefined })); }
      catch { /* quota */ }
    }
  }

  function loadStudioSession(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STUDIO_SESSION_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as StudioSessionData;
      if (!Array.isArray(data.pages) || data.pages.length === 0) return;
      applyProjectData(data);
      if (Array.isArray(data.generatedImages)) {
        pages = pages.map((pg, pageIdx) => ({
          ...pg,
          panels: pg.panels.map((panel, panelIdx) => {
            const generated = data.generatedImages?.find(item => item.page === pageIdx && item.panel === panelIdx);
            return generated ? { ...panel, imageUrl: panel.imageUrl ?? generated.imageUrl, videoUrl: panel.videoUrl ?? generated.videoUrl } : panel;
          }),
        }));
      }
      yamlText = data.yamlText ?? yamlText;
      parsedPanels = parseYamlPanels(yamlText);
      parsedYamlPages = parseYamlPages(yamlText);
      mangaPageMode = normalizeStudioPageMode(data.pageMode);
      selectedPanelIndex = data.selectedPanel ?? null;
      if (selectedPanelIndex !== null && !pages[activePage]?.panels[selectedPanelIndex]) selectedPanelIndex = null;
      activePanel = selectedPanelIndex;
      if ((!data.charProfiles || data.charProfiles.length === 0) && data.characterLibraryText) {
        charProfiles = data.characterLibraryText.split(/\n{2,}/).map(v => v.trim()).filter(Boolean);
      }
      previewUrl = pages[activePage]?.resultUrl ?? data.resultUrl ?? null;
      errorMsg = '';
    } catch {
      errorMsg = 'Studio自動保存データの復元に失敗しました。';
    }
  }

  function resetStudioState(): void {
    pages = [createPage()];
    activePage = 0;
    activePanel = null;
    selectedPanelIndex = null;
    selectedRegionIndex = null;
    bubbleEditPanel = null;
    storyText = '';
    yamlText = '';
    parsedPanels = [];
    parsedYamlPages = [];
    referenceImages = [];
    charProfiles = [];
    characterSetName = '';
    generatedPanels = [];
    mangaPageMode = 1;
    previewUrl = null;
    previewVideoUrl = null;
    revisedPrompt = null;
    errorMsg = '';
  }

  function clearStudioSession(): void {
    if (!confirm('保存されたStudioデータをすべて削除しますか？')) return;
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STUDIO_SESSION_KEY);
    resetStudioState();
    saveRefImages();
  }

  function exportStudioProject(): void {
    const data = buildStudioSessionData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    triggerDownload(blob, `studio-project-${dateStamp()}.json`);
  }

  async function importStudioProject(file: File): Promise<void> {
    try {
      const data = JSON.parse(await file.text()) as StudioSessionData;
      if (!Array.isArray(data.pages) || data.pages.length === 0) {
        errorMsg = 'StudioプロジェクトJSONにpagesがありません。';
        return;
      }
      applyProjectData(data);
      if (Array.isArray(data.generatedImages)) {
        pages = pages.map((pg, pageIdx) => ({
          ...pg,
          panels: pg.panels.map((panel, panelIdx) => {
            const generated = data.generatedImages?.find(item => item.page === pageIdx && item.panel === panelIdx);
            return generated ? { ...panel, imageUrl: panel.imageUrl ?? generated.imageUrl, videoUrl: panel.videoUrl ?? generated.videoUrl } : panel;
          }),
        }));
      }
      yamlText = data.yamlText ?? '';
      parsedPanels = parseYamlPanels(yamlText);
      parsedYamlPages = parseYamlPages(yamlText);
      mangaPageMode = normalizeStudioPageMode(data.pageMode);
      selectedPanelIndex = data.selectedPanel ?? null;
      if (selectedPanelIndex !== null && !pages[activePage]?.panels[selectedPanelIndex]) selectedPanelIndex = null;
      activePanel = selectedPanelIndex;
      previewUrl = pages[activePage]?.resultUrl ?? data.resultUrl ?? null;
      saveStudioSession();
    } catch {
      errorMsg = 'StudioプロジェクトJSONの読み込みに失敗しました。';
    }
  }

  async function importStudioProjectFile(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await importStudioProject(file);
  }

  function deleteCharacterSet(id: string): void {
    characterLibrary = characterLibrary.filter(item => item.id !== id);
    saveCharacterLibrary();
  }

  // ============================================================
  // Reference Image System
  // ============================================================
  function loadRefImages(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(REF_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { a?: RefImage | null; b?: RefImage | null; images?: RefImage[]; referenceImages?: RefImage[]; profiles?: string[] };
      const refs = data.referenceImages ?? data.images ?? [data.a ?? null, data.b ?? null].filter(Boolean) as RefImage[];
      referenceImages = refs.map(r => normalizeRef(r) ?? emptyRefImage());
      charProfiles = (data.profiles ?? []).slice(0, referenceImages.length);
    } catch { /* ignore */ }
  }

  function saveRefImages(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(REF_KEY, JSON.stringify({ images: referenceImages, profiles: charProfiles }));
    } catch {
      // Quota exceeded: strip originals first (largest), then thumbnails
      try {
        localStorage.setItem(REF_KEY, JSON.stringify({ images: referenceImages.map(r => ({ ...r, originals: [] })), profiles: charProfiles }));
      } catch {
        try {
          localStorage.setItem(REF_KEY, JSON.stringify({
            images: referenceImages.map(r => ({ ...r, originals: [], thumb: '', thumbs: [], names: r.names })),
            profiles: charProfiles,
          }));
        } catch { /* fail silently */ }
      }
    }
  }

  function addReferenceImage(): void {
    referenceImages = [...referenceImages, emptyRefImage()];
    charProfiles = [...charProfiles, ''];
    saveRefImages();
  }

  function getImageFiles(fileList: FileList | null | undefined): File[] {
    return Array.from(fileList ?? []).filter(file => file.type.startsWith('image/'));
  }

  async function applyRefFiles(index: number, files: File[]): Promise<void> {
    if (files.length === 0) return;

    while (referenceImages.length <= index) {
      referenceImages = [...referenceImages, emptyRefImage()];
      charProfiles = [...charProfiles, ''];
    }
    const existing      = normalizeRef(referenceImages[index]) ?? emptyRefImage();
    const newThumbs:     string[] = [...(existing?.thumbs     ?? [])];
    const newOriginals:  string[] = [...(existing?.originals  ?? [])];
    const newNames:      string[] = [...(existing?.names      ?? [])];

    for (const file of files) {
      // Full-resolution original — used by Vision and image generation APIs
      const original = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Display thumbnail — UI only, not sent to APIs
      const objectUrl = URL.createObjectURL(file);
      const thumb = await createThumbnail(objectUrl);
      URL.revokeObjectURL(objectUrl);

      newOriginals.push(original);
      newThumbs.push(thumb);
      newNames.push(file.name);
    }

    const primaryThumb = newThumbs[0] ?? '';
    const defaultLabel = newNames[0]?.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') ?? '';
    const label = existing?.label.trim() ? existing.label : defaultLabel;
    const ref: RefImage = {
      thumb:     primaryThumb,
      thumbs:    newThumbs,
      originals: newOriginals,
      label,
      name:  existing?.name?.trim() && existing.name !== 'Reference' ? existing.name : (newNames[0] ?? 'Reference'),
      names: newNames,
    };
    referenceImages = referenceImages.map((item, i) => i === index ? ref : item);
    saveRefImages();
  }

  async function uploadRef(index: number, e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const files = getImageFiles(input.files);
    input.value = '';
    await applyRefFiles(index, files);
  }

  async function dropRef(index: number, e: DragEvent): Promise<void> {
    e.preventDefault();
    await applyRefFiles(index, getImageFiles(e.dataTransfer?.files));
  }

  async function pasteRef(index: number, e: ClipboardEvent): Promise<void> {
    const files = getImageFiles(e.clipboardData?.files);
    if (files.length === 0) return;
    e.preventDefault();
    await applyRefFiles(index, files);
  }

  function removeRef(index: number): void {
    referenceImages = referenceImages.filter((_, i) => i !== index);
    charProfiles = charProfiles.filter((_, i) => i !== index);
    saveRefImages();
  }

  function clearCharProfile(index: number): void {
    charProfiles[index] = '';
    saveRefImages();
  }

  function buildVisionAnalysisSystemPrompt(): string {
    return `あなたは漫画制作向けの参照画像解析専門家です。出力は必ず日本語で書き、英語説明を混ぜないでください。JSONキーのみ英語で構いません。
短すぎる要約は禁止です。最低800文字、可能なら1500文字程度を目標に、画像生成・YAML生成にそのまま使える資料テキストとして詳細に解析してください。

必ず次の観点を確認してください:
- 髪型、髪色、目の色、衣装、アクセサリー
- 体型を強調しない範囲でのシルエット
- 表情、ポーズ、視線、手や身体の動き
- 背景、場所、小物、世界観
- 漫画ページの場合はコマ構成、ページ内の流れ、吹き出し内容、キャラクター同士の関係
- 画風、線、塗り、色彩、光、雰囲気
- 生成時に維持すべき要素
- 生成時に避けるべき要素

可能な限り次のJSON形式だけで返してください。値はすべて日本語で詳しく書いてください。
{
  "summary": "...",
  "characters": [
    {
      "name_or_role": "...",
      "hair": "...",
      "eyes": "...",
      "outfit": "...",
      "personality_implied": "...",
      "important_visual_features": ["..."]
    }
  ],
  "scene": "...",
  "style": "...",
  "composition": "...",
  "speech_bubbles": ["..."],
  "continuity_notes": ["..."],
  "generation_hints": ["..."],
  "avoid": ["..."]
}

不明な項目は空欄にせず、「画像からは判別しにくいが、維持すべき推定要素は...」のように制作上有用な形で補足してください。`;
  }

  function buildReferenceAnalysisText(): string {
    const lines: string[] = [];
    referenceImages.forEach((ref, i) => {
      const name = ref.name.trim() || `REF${i + 1}`;
      const label = ref.label.trim();
      const profile = charProfiles[i]?.trim();
      if (profile) {
        lines.push(`REF${i + 1} ${name}${label ? ` / ユーザーメモ: ${label}` : ''}\n${profile}`);
      } else if (label) {
        lines.push(`REF${i + 1} ${name}\n未解析の参照メモ: ${label}`);
      }
    });
    if (lines.length === 0) return '';
    return `${lines.join('\n\n')}\n\n[統合メモ]\n- 各REFの役割を推定し、背景資料・キャラクター資料・過去漫画ページ・衣装資料などとして使い分けること。\n- 複数REFに矛盾がある場合は、ユーザーのSTORY指定を優先しつつ、共通している外見・画風・世界観を継続要素として扱うこと。`;
  }

  function buildVisionAnalysisUserPrompt(ref: RefImage, index: number, imageCount: number): string {
    const name = ref.name.trim() || `REF${index + 1}`;
    const label = ref.label.trim();
    return `REF${index + 1}「${name}」を解析してください。${label ? `ユーザーメモ: ${label}\n` : ''}
この参照画像は漫画制作・画像生成・STORYからYAML生成に使用します。
画像が複数枚ある場合は個別に観察したうえで、最後に統合メモを入れてください。
REFの役割を推定してください（例: 背景資料、キャラクター資料、衣装資料、過去漫画ページ、表情資料など）。
添付画像数: ${imageCount}
必ず日本語で、最低800文字以上の詳細なJSON資料として返してください。`;
  }

  // ── Vision: analyze one ref → extract character profile ──
  async function analyzeCharacter(ref: RefImage, index: number): Promise<string> {
    // Prefer full-resolution originals for Vision; fall back to thumbnails
    const originals = (ref.originals ?? []).filter((t): t is string => !!t?.startsWith('data:'));
    const thumbs = originals.length > 0
      ? originals
      : (ref.thumbs?.length ? ref.thumbs : [ref.thumb])
          .filter((t): t is string => !!t?.startsWith('data:'));
    if (thumbs.length === 0) return ref.label.trim();

    const fd = new FormData();
    fd.append('provider',    'openai');
    fd.append('model',       'gpt-4o');
    fd.append('systemPrompt', buildVisionAnalysisSystemPrompt());
    fd.append('userMessage', buildVisionAnalysisUserPrompt(ref, index, thumbs.length));

    thumbs.forEach((t, i) => {
      const commaIdx = t.indexOf(',');
      const header   = t.slice(0, commaIdx);
      const b64      = t.slice(commaIdx + 1);
      const mime     = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
      const bytes    = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      fd.append(`image_${i}`, new Blob([bytes], { type: mime }), `reference_${index + 1}_${i}.jpg`);
    });

    const res = await fetch('/api/lab-chat', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Vision API HTTP ${res.status}`);
    const data = await res.json();
    const text = (data.text ?? '').trim();
    console.log(`[vision] reference_${index + 1}_0.jpg analysis length=${text.length}`);
    console.log(`[vision] preview=${text.replace(/\s+/g, ' ').slice(0, 200)}`);
    return text;
  }

  async function analyzeCharacterImages(): Promise<void> {
    if (analyzingChars || referenceImages.length === 0) return;
    analyzingChars = true;
    errorMsg = '';
    try {
      const profiles = await Promise.all(referenceImages.map((ref, i) => analyzeCharacter(ref, i)));
      charProfiles = profiles;
      const integrated = buildReferenceAnalysisText();
      if (integrated) {
        console.log(`[vision] integrated reference analysis length=${integrated.length}`);
        console.log(`[vision] integrated preview=${integrated.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
      saveRefImages();
    } catch (e) {
      errorMsg = `キャラ解析失敗: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      analyzingChars = false;
    }
  }

  function buildRefContext(): string {
    const parts: string[] = [];
    referenceImages.forEach((ref, i) => {
      const name = ref.name.trim() || `reference_${i + 1}`;
      const label = ref.label.trim();
      if (label) parts.push(`${name}: ${label}`);
      else if (ref.thumb || ref.originals.length) parts.push(`${name}: visual reference`);
    });
    return parts.join(', ');
  }

  function injectRefs(prompt: string): string {
    // Vision profile takes priority over label; fall back to label if no profile
    const ctx = referenceImages.map((ref, i) => {
      const profile = charProfiles[i]?.trim();
      const name = ref.name.trim() || `reference_${i + 1}`;
      if (profile) return `${name}: ${profile}`;
      return ref.label.trim() ? `${name}: ${ref.label.trim()}` : '';
    }).filter(Boolean).join('. ');
    return ctx ? `${ctx}. ${prompt}` : prompt;
  }

  // ── One Panel Pro Mode functions ─────────────────────────
  function buildEnhancedPrompt(): string {
    const base = pages[activePage].prompt.trim();
    const parts: string[] = [];
    parts.push('masterpiece, best quality, highly detailed, ultra-high resolution');
    // ① character dict: selected character takes priority, fall back to ミュリィ hardcoded
    parts.push(selectedChar?.prompt ?? MURYI_CHAR_DICT);
    if (base) parts.push(base);
    // ② expression: character-specific prompt first, generic fallback
    const charExpr = proExpression
      ? selectedChar?.expressions.find(e => e.id === proExpression)
      : undefined;
    const expr  = charExpr ?? PRO_EXPRESSIONS.find(e => e.id === proExpression);
    const cam   = PRO_CAMERAS.find(c => c.id === proCamera);
    const pose  = PRO_POSES.find(p => p.id === proPose);
    const style = PRO_STYLES.find(s => s.id === proStyle);
    const light = PRO_LIGHTING.find(l => l.id === proLighting);
    if (expr?.prompt)  parts.push(expr.prompt);
    if (cam?.prompt)   parts.push(cam.prompt);
    if (pose?.prompt)  parts.push(pose.prompt);
    if (style?.prompt) parts.push(style.prompt);
    if (light?.prompt) parts.push(light.prompt);
    return parts.filter(Boolean).join(', ');
  }

  function buildNegativeHint(): string {
    const neg = [
      'bad anatomy', 'extra fingers', 'fused fingers', 'missing limbs',
      'deformed hands', 'malformed body', 'blurry', 'low quality',
      'jpeg artifacts', 'watermark', 'signature', 'text overlay',
      'duplicate', 'out of frame',
    ];
    if (proStyle === 'anime')      neg.push('photorealistic', '3d render', 'cgi');
    if (proStyle === 'realistic')  neg.push('cartoon', 'anime flat shading');
    if (proStyle === 'watercolor') neg.push('sharp hard lines', 'digital photograph');
    if (proStyle === 'sketch')     neg.push('color fill', 'photorealistic render');
    if (proStyle === 'cyberpunk')  neg.push('bright daylight', 'pastoral nature');
    if (proStyle === 'oil')        neg.push('photograph', 'digital art');
    return `Avoid: ${neg.join(', ')}`;
  }

  async function generatePro(): Promise<void> {
    const p = buildEnhancedPrompt();
    if (!p.trim() || generating) return;
    errorMsg      = '';
    revisedPrompt = null;
    generating    = true;
    previewUrl    = null;
    const refImages     = resolveRefImages();
    const effectiveMode = selectedEditMode ? 'edit' : 'text-to-image';
    console.log('[studio] generatePro', {
      selectedModel:  selectedStudioModel,
      apiModel:       studioImageModel,
      provider:       selectedProvider,
      editMode:       selectedEditMode,
      generationMode: effectiveMode,
      imageCount:     refImages.length,
      imageSizes:     refImages.map(r => `${Math.round(r.length / 1024)}KB`),
    });
    try {
      const payload = {
        prompt: injectRefs(`${p}, ${buildNegativeHint()}`),
        size,
        model: studioImageModel,
        provider: selectedProvider,
        editMode: selectedEditMode,
        selectedModel: selectedStudioModel,
        refImages,
        renderMode: imageCompositionMode,
        speechBubble: speechBubbleMode,
      };
      console.log('[studio] image generate button payload', payload);
      console.log('[studio] fetch /api/generate provider/model', { provider: payload.provider, model: payload.model });
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const imageUrl = data?.images?.[0]?.url ?? data?.url;
      if (!imageUrl) throw new Error('画像データが返されませんでした。');
      previewUrl    = imageUrl;
      revisedPrompt = null;
      await addToHistory(imageUrl, p, size);
      if (diaryNote) {
        const thumb   = await createThumbnail(imageUrl);
        const entryId = activeDiaryId ?? genId();
        const entry: DiaryEntry = {
          id: entryId, date: diaryNote.date, diaryText: diaryNote.diaryText,
          prompt: p, mood: currentDiaryMood, thumb, createdAt: new Date().toISOString(),
        };
        const idx = diaryHistory.findIndex(e => e.id === entryId);
        if (idx >= 0) diaryHistory[idx] = entry;
        else diaryHistory = [entry, ...diaryHistory].slice(0, MAX_DIARY_ENTRIES);
        activeDiaryId = entryId;
        saveDiaryHistory();
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : '生成に失敗しました。';
    } finally {
      generating = false;
    }
  }

  function loadProPresets(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(PRO_PRESET_KEY);
      const custom: ProPreset[] = raw ? (JSON.parse(raw) as ProPreset[]) : [];
      proPresets = [...DEFAULT_PRO_PRESETS, ...custom];
    } catch {
      proPresets = [...DEFAULT_PRO_PRESETS];
    }
  }

  function saveProPresets(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const custom = proPresets.filter(p => !p.isDefault);
      localStorage.setItem(PRO_PRESET_KEY, JSON.stringify(custom));
    } catch { /* quota */ }
  }

  function applyProPreset(preset: ProPreset): void {
    proExpression = preset.expression;
    proCamera     = preset.camera;
    proPose       = preset.pose;
    proStyle      = preset.style;
    proLighting   = preset.lighting;
    proPresetName = preset.name;
  }

  function saveCurrentAsPreset(): void {
    const name = proPresetName.trim();
    if (!name) return;
    const id = `custom_${Date.now()}`;
    proPresets = [...proPresets, { id, name, expression: proExpression, camera: proCamera, pose: proPose, style: proStyle, lighting: proLighting }];
    saveProPresets();
  }

  function deleteProPreset(id: string): void {
    proPresets = proPresets.filter(p => p.id !== id);
    saveProPresets();
  }

  function proPresetTitle(preset: ProPreset): string {
    return [
      preset.expression ? `Expr: ${preset.expression}` : '',
      preset.camera     ? `Cam: ${preset.camera}`       : '',
      preset.style      ? `Style: ${preset.style}`      : '',
    ].filter(Boolean).join(' · ');
  }

  // ── Browser functions ────────────────────────────────────
  function loadIndex(): ProjectMeta[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      return raw ? (JSON.parse(raw) as ProjectMeta[]) : [];
    } catch { return []; }
  }

  function loadProjectById(id: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(PROJ_PFX + id);
      if (!raw) return;
      const data = JSON.parse(raw) as ProjectData;
      applyProjectData(data);
      if (Array.isArray(data.history)) { history = data.history; saveHistory(history); }
      currentProjectId   = id;
      currentProjectName = projectIndex.find(m => m.id === id)?.name ?? 'Untitled';
      browserOpen        = false;
    } catch { /* ignore */ }
  }

  function duplicateProject(id: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(PROJ_PFX + id);
      if (!raw) return;
      const data    = JSON.parse(raw) as ProjectData;
      const newId   = genId();
      const srcName = projectIndex.find(m => m.id === id)?.name ?? 'Untitled';
      persistToIndex(newId, `${srcName} (copy)`, { ...data, savedAt: new Date().toISOString() });
    } catch { /* ignore */ }
  }

  function deleteProject(id: string): void {
    projectIndex = projectIndex.filter(m => m.id !== id);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(INDEX_KEY, JSON.stringify(projectIndex)); } catch { /* quota */ }
      localStorage.removeItem(PROJ_PFX + id);
    }
    if (currentProjectId === id) currentProjectId = null;
  }

  function startRename(id: string, name: string, e: MouseEvent): void {
    e.stopPropagation();
    renamingId  = id;
    renameValue = name;
  }

  function commitRename(e?: KeyboardEvent | FocusEvent): void {
    if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== 'Escape') return;
    if (e instanceof KeyboardEvent && e.key === 'Escape') { renamingId = null; return; }
    if (!renamingId) return;
    const name = renameValue.trim();
    if (!name) { renamingId = null; return; }
    const idx = projectIndex.findIndex(m => m.id === renamingId);
    if (idx >= 0) {
      projectIndex[idx] = { ...projectIndex[idx], name };
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(INDEX_KEY, JSON.stringify(projectIndex)); } catch { /* quota */ }
      }
    }
    if (currentProjectId === renamingId) currentProjectName = name;
    renamingId = null;
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return (
      `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ` +
      `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    );
  }

  // ============================================================
  // Character Asset System
  // ============================================================
  type AssetItem = { id: string; label: string; prompt: string };
  type CharAsset = AssetItem & {
    expressions: AssetItem[];
    costumes:    AssetItem[];
  };
  type AssetDB = {
    version:     number;
    characters:  CharAsset[];
    backgrounds: AssetItem[];
    poses:       AssetItem[];
  };

  type AssetTab = 'char' | 'expr' | 'costume' | 'pose' | 'bg';
  const ASSET_TABS: { id: AssetTab; label: string }[] = [
    { id: 'char',    label: 'CHAR'    },
    { id: 'expr',    label: 'EXPR'    },
    { id: 'costume', label: 'COSTUME' },
    { id: 'pose',    label: 'POSE'    },
    { id: 'bg',      label: 'BG'      },
  ];

  let assetDB        = $state<AssetDB | null>(null);
  let assetTab       = $state<AssetTab>('char');
  let selectedChar   = $state<CharAsset | null>(null);
  let assetPanelOpen = $state(true);

  async function loadAssets(): Promise<void> {
    try {
      const res = await fetch('/studio/characters.json');
      if (!res.ok) return;
      assetDB = await res.json() as AssetDB;
      if (assetDB.characters.length > 0) selectedChar = assetDB.characters[0];
    } catch { /* ignore */ }
  }

  function insertAsset(prompt: string): void {
    const cur = pages[activePage].prompt.trim();
    pages[activePage].prompt = cur ? `${cur}, ${prompt}` : prompt;
  }

  function selectChar(char: CharAsset): void {
    selectedChar = char;
    insertAsset(char.prompt);
    assetTab = 'expr';
  }

  // ============================================================
  // Export Suite
  // ============================================================
  let exportMenuOpen = $state(false);
  let exporting      = $state(false);

  // ── Byte utilities ───────────────────────────────────────
  function u16le(n: number): Uint8Array {
    return new Uint8Array([n & 0xFF, (n >> 8) & 0xFF]);
  }
  function u32le(n: number): Uint8Array {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n >>> 0, true);
    return b;
  }
  function concatBytes(...parts: (Uint8Array | number[])[]): Uint8Array {
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out   = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p instanceof Uint8Array ? p : new Uint8Array(p), off); off += p.length; }
    return out;
  }
  const CRC32_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  function crc32b(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ── ZIP (STORE, no compression) ──────────────────────────
  function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
    const enc = new TextEncoder();
    const locals: Uint8Array[]  = [];
    const centrals: Uint8Array[] = [];
    const offsets: number[]     = [];
    let localBytes = 0;
    const now = new Date();
    const dt  = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const tm  = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);

    for (const { name, data } of files) {
      const fn  = enc.encode(name);
      const crc = crc32b(data);
      const sz  = data.length;
      offsets.push(localBytes);

      const lh = concatBytes(
        [0x50,0x4B,0x03,0x04],
        u16le(20), u16le(0), u16le(0),
        u16le(tm),  u16le(dt),
        u32le(crc), u32le(sz), u32le(sz),
        u16le(fn.length), u16le(0),
        fn, data,
      );
      locals.push(lh);
      localBytes += lh.length;

      centrals.push(concatBytes(
        [0x50,0x4B,0x01,0x02],
        u16le(20), u16le(20),
        u16le(0), u16le(0),
        u16le(tm), u16le(dt),
        u32le(crc), u32le(sz), u32le(sz),
        u16le(fn.length), u16le(0), u16le(0),
        u16le(0), u16le(0), u32le(0),
        u32le(offsets[offsets.length - 1]),
        fn,
      ));
    }

    const cdSize = centrals.reduce((s, p) => s + p.length, 0);
    return concatBytes(
      ...locals, ...centrals,
      [0x50,0x4B,0x05,0x06],
      u16le(0), u16le(0),
      u16le(files.length), u16le(files.length),
      u32le(cdSize), u32le(localBytes), u16le(0),
    );
  }

  // ── PDF (JPEG pages via DCTDecode) ───────────────────────
  function buildPdf(pages_: { bytes: Uint8Array; w: number; h: number }[]): Uint8Array {
    const enc      = new TextEncoder();
    const parts: Uint8Array[] = [];
    const xref: number[]      = [];
    let pos = 0;

    const push = (s: string | Uint8Array) => {
      const b = typeof s === 'string' ? enc.encode(s) : s;
      parts.push(b); pos += b.length;
    };
    const startObj = (n: number) => { xref[n] = pos; };
    const N     = pages_.length;
    const pNum  = (i: number) => 3 + i * 3;
    const cNum  = (i: number) => 4 + i * 3;
    const iNum  = (i: number) => 5 + i * 3;
    const total = 2 + N * 3;

    push('%PDF-1.4\n');

    startObj(1);
    push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);

    startObj(2);
    push(`2 0 obj\n<< /Type /Pages /Kids [${Array.from({length:N},(_,i)=>`${pNum(i)} 0 R`).join(' ')}] /Count ${N} >>\nendobj\n`);

    for (let i = 0; i < N; i++) {
      const { bytes, w, h } = pages_[i];

      startObj(pNum(i));
      push(`${pNum(i)} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}]\n`);
      push(`   /Contents ${cNum(i)} 0 R /Resources << /XObject << /Im0 ${iNum(i)} 0 R >> >> >>\nendobj\n`);

      const cs = enc.encode(`q ${w} 0 0 ${-h} 0 ${h} cm /Im0 Do Q\n`);
      startObj(cNum(i));
      push(`${cNum(i)} 0 obj\n<< /Length ${cs.length} >>\nstream\n`);
      push(cs);
      push(`\nendstream\nendobj\n`);

      startObj(iNum(i));
      push(`${iNum(i)} 0 obj\n`);
      push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h}\n`);
      push(`   /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\n`);
      push(`stream\n`); push(bytes); push(`\nendstream\nendobj\n`);
    }

    const xrefOff = pos;
    push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
    for (let n = 1; n <= total; n++) push(`${String(xref[n]).padStart(10,'0')} 00000 n \n`);
    push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefOff}\n%%EOF\n`);

    const out = new Uint8Array(pos);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }

  // ── Canvas renderer ──────────────────────────────────────
  async function renderPageToCanvas(pg: Page): Promise<HTMLCanvasElement> {
    const CELL = 600;
    const GAP  = 8;
    const cols = gridColumnsForPanelCount(pg.panels.length);
    const rows = gridRowsForPanelCount(pg.panels.length);
    const W    = cols * CELL + (cols - 1) * GAP;
    const H    = rows * CELL + (rows - 1) * GAP;

    const canvas  = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#020912';
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < pg.panels.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x   = col * (CELL + GAP);
      const y   = row * (CELL + GAP);
      const pnl = pg.panels[i];

      if (pnl.imageUrl) {
        await new Promise<void>(res => {
          const img = new Image();
          img.onload  = () => { ctx.drawImage(img, x, y, CELL, CELL); res(); };
          img.onerror = () => res();
          img.src     = pnl.imageUrl!;
        });
      } else {
        ctx.fillStyle   = '#040d1a';
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = 'rgba(0,229,255,0.18)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      }
      ctx.font      = 'bold 26px monospace';
      ctx.fillStyle = 'rgba(0,229,255,0.32)';
      ctx.fillText(String(i + 1), x + 13, y + 35);

      const dlg = pnl.dialogue?.trim();
      if (dlg) {
        const fontCss = MANGA_FONTS.find(f => f.id === overlayFont)?.css ?? 'sans-serif';
        const fSize   = Math.round(overlaySize * (CELL / 350));
        ctx.font        = `${overlayBold ? 'bold ' : ''}${fSize}px ${fontCss}`;
        ctx.fillStyle   = '#ffffff';
        ctx.textAlign   = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur  = 6;
        const lines  = dlg.split('\n');
        const lh     = fSize * 1.5;
        const startY = y + CELL - lines.length * lh - 18;
        for (let l = 0; l < lines.length; l++) {
          ctx.fillText(lines[l], x + CELL / 2, startY + l * lh, CELL - 24);
        }
        ctx.shadowBlur = 0;
        ctx.textAlign  = 'left';
      }
    }
    return canvas;
  }

  function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function dateStamp(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async function sourceToBlob(source: string): Promise<Blob> {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`画像の取得に失敗しました: HTTP ${res.status}`);
    return await res.blob();
  }

  async function sourceToDataUrl(source: string): Promise<string> {
    if (source.startsWith('data:')) return source;
    const blob = await sourceToBlob(source);
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function safeCreateThumbnail(source: string): Promise<string> {
    try {
      return await createThumbnail(source);
    } catch {
      return source;
    }
  }

  async function downloadImageSource(source: string | null | undefined, filename: string): Promise<void> {
    if (!source) return;
    try {
      triggerDownload(await sourceToBlob(source), filename);
    } catch {
      const a = document.createElement('a');
      a.href = source;
      a.download = filename;
      a.click();
    }
  }

  async function saveComicPagePng(): Promise<void> {
    if (currentPageResultUrl) {
      await downloadImageSource(currentPageResultUrl, `comic-page-${dateStamp()}-page-${activePage + 1}.png`);
      return;
    }
    const canvas = await renderPageToCanvas(pages[activePage]);
    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/png'));
    triggerDownload(blob, `comic-page-${dateStamp()}.png`);
  }

  async function savePanelPng(panelIdx: number): Promise<void> {
    await downloadImageSource(panels[panelIdx]?.imageUrl, `panel-${panelIdx + 1}.png`);
  }

  async function saveAllPanelsPng(): Promise<void> {
    const generated = panels
      .map((panel, index) => ({ panel, index }))
      .filter(({ panel }) => !!panel.imageUrl);
    for (const { panel, index } of generated) {
      await downloadImageSource(panel.imageUrl, `panel-${index + 1}.png`);
    }
  }

  function saveCurrentYamlFile(): void {
    const yaml = yamlText.trim() ? yamlText : serializePagesToYaml();
    triggerDownload(new Blob([yaml + '\n'], { type: 'text/yaml;charset=utf-8' }), `comic-story-${dateStamp()}.yaml`);
  }

  function saveCurrentPageYamlFile(): void {
    const yaml = currentPageYaml.trim();
    if (!yaml) return;
    triggerDownload(new Blob([yaml + '\n'], { type: 'text/yaml;charset=utf-8' }), `comic-story-${dateStamp()}-page-${activePage + 1}.yaml`);
  }

  async function addImageToRefsAndLibrary(source: string | null | undefined, label: string): Promise<void> {
    if (!source) return;
    try {
      const original = await sourceToDataUrl(source);
      const thumb = await safeCreateThumbnail(original);
      const ref: RefImage = {
        thumb,
        thumbs: [thumb],
        originals: [original],
        label,
        name: label,
        names: [`${label}.png`],
      };
      referenceImages = [...referenceImages, ref];
      charProfiles = [...charProfiles, ''];
      saveRefImages();

      const item: CharacterSet = {
        id: genId(),
        name: label,
        referenceImages: [normalizeRef(ref) ?? ref],
        originals: [original],
        thumbs: [thumb],
        createdAt: new Date().toISOString(),
      };
      characterLibrary = [item, ...characterLibrary];
      saveCharacterLibrary();
      errorMsg = '';
    } catch (e) {
      errorMsg = `REF追加に失敗しました: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function addPageToReferenceLibrary(): Promise<void> {
    if (currentPageResultUrl) {
      await addImageToRefsAndLibrary(currentPageResultUrl, `comic-page-${dateStamp()}-page-${activePage + 1}`);
      return;
    }
    const canvas = await renderPageToCanvas(pages[activePage]);
    await addImageToRefsAndLibrary(canvas.toDataURL('image/png'), `comic-page-${dateStamp()}`);
  }

  async function addPanelToReferenceLibrary(panelIdx: number): Promise<void> {
    await addImageToRefsAndLibrary(panels[panelIdx]?.imageUrl, `panel-${panelIdx + 1}-${dateStamp()}`);
  }

  function slugName(): string {
    return currentProjectName.replace(/\s+/g, '-').replace(/[^\w-]/g, '') || 'studio';
  }

  async function exportCurrentPng(): Promise<void> {
    exporting = true; exportMenuOpen = false;
    try {
      const canvas = await renderPageToCanvas(pages[activePage]);
      const blob   = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/png'));
      triggerDownload(blob, `${slugName()}-page${activePage + 1}.png`);
    } finally { exporting = false; }
  }

  async function exportAllZip(): Promise<void> {
    exporting = true; exportMenuOpen = false;
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < pages.length; i++) {
        const canvas = await renderPageToCanvas(pages[i]);
        const blob   = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/png'));
        files.push({ name: `page-${i + 1}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      triggerDownload(new Blob([buildZip(files).buffer as ArrayBuffer], { type: 'application/zip' }),
        `${slugName()}-export.zip`);
    } finally { exporting = false; }
  }

  async function exportPdf(): Promise<void> {
    exporting = true; exportMenuOpen = false;
    try {
      const pdfPages: { bytes: Uint8Array; w: number; h: number }[] = [];
      for (const pg of pages) {
        const canvas = await renderPageToCanvas(pg);
        const blob   = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.92));
        pdfPages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height });
      }
      triggerDownload(new Blob([buildPdf(pdfPages).slice()], { type: 'application/pdf' }),
        `${slugName()}.pdf`);
    } finally { exporting = false; }
  }

  // ============================================================
  // Auto Save
  // ============================================================
  type AutoSaveStatus = 'idle' | 'pending' | 'saved';

  let autoSaveStatus      = $state<AutoSaveStatus>('idle');
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let autoSaveInitialized = false;

  $effect(() => {
    const session = buildStudioSessionData();
    void activePage;
    void selectedPanelIndex;
    void mangaPageMode;
    void storyText;
    void yamlText;
    void referenceImages;
    void charProfiles;

    if (!autoSaveInitialized) { autoSaveInitialized = true; return; }

    if (autoSaveTimer !== null) clearTimeout(autoSaveTimer);
    autoSaveStatus = 'pending';
    autoSaveTimer  = setTimeout(() => {
      saveStudioSession(session);
      autoSaveTimer  = null;
      autoSaveStatus = 'saved';
      setTimeout(() => { autoSaveStatus = 'idle'; }, 2000);
    }, 2000);
  });

  loadRefImages();
  loadCharacterLibrary();
  loadProPresets();
  loadHistory();
  loadProjectFromStorage();
  projectIndex = loadIndex();
  loadAssets();
  loadDiaryHistory();
  onMount(() => {
    loadStudioSession();
    void loadImageSettings();
  });
</script>

<svelte:head>
  <title>PROJECT | AI VTuber</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=BIZ+UDGothic:wght@400;700&family=Klee+One:wght@400;600&family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet" />
</svelte:head>

<div class="studio">
  <!-- ── HEADER ─────────────────────────────────────── -->
  <header class="studio-header">
    <div class="hd-left">
      <svg class="logo-hex" width="28" height="28" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" stroke="#00e5ff" stroke-width="1.5" fill="rgba(0,229,255,0.06)"/>
        <polygon points="20,8 30,14 30,26 20,32 10,26 10,14" stroke="#a855f7" stroke-width="1" fill="rgba(168,85,247,0.06)"/>
        <circle cx="20" cy="20" r="3" fill="#00e5ff" opacity="0.9"/>
      </svg>
      <div class="title-group">
        <div class="main-title">PROJECT</div>
        <div class="sub-title">MANGA · PANEL · GENERATOR</div>
      </div>
    </div>

    <div class="hd-center">
      <div class="hd-divider"></div>
      <input
        class="proj-name-input"
        bind:value={currentProjectName}
        placeholder="Untitled"
        spellcheck="false"
        title="プロジェクト名（クリックで編集）"
      />
      <div class="hd-divider"></div>
    </div>

    <div class="hd-right">
      {#if autoSaveStatus !== 'idle'}
        <span class="autosave-badge" class:saved={autoSaveStatus === 'saved'}>
          {autoSaveStatus === 'pending' ? '● …' : '✓ AUTO SAVED'}
        </span>
      {/if}
      <div class="export-wrap">
        <button
          class="proj-btn export-open-btn"
          onclick={() => (exportMenuOpen = !exportMenuOpen)}
          disabled={exporting}
        >
          {exporting ? '⏳ …' : '↗ EXPORT'}
        </button>
        {#if exportMenuOpen}
          <div class="export-menu">
            <button class="export-item" onclick={exportCurrentPng}>
              <span class="ei-icon">▣</span>
              <span class="ei-body"><span class="ei-label">PNG</span><span class="ei-desc">Current page</span></span>
            </button>
            <button class="export-item" onclick={exportAllZip}>
              <span class="ei-icon">◫</span>
              <span class="ei-body"><span class="ei-label">ZIP</span><span class="ei-desc">All pages as PNG</span></span>
            </button>
            <button class="export-item" onclick={exportPdf}>
              <span class="ei-icon">◧</span>
              <span class="ei-body"><span class="ei-label">PDF</span><span class="ei-desc">All pages</span></span>
            </button>
          </div>
        {/if}
      </div>
      <button class="proj-btn browser-open-btn" onclick={() => (browserOpen = true)}>
        ☰ PROJECTS{#if projectIndex.length > 0}<span class="proj-count-badge">{projectIndex.length}</span>{/if}
      </button>
      <div class="hd-sep"></div>
      <div class="proj-save-load">
        <button class="proj-btn save-btn" class:flash={saveFlash} onclick={saveProject}>
          {saveFlash ? '✓ SAVED' : '↓ SAVE'}
        </button>
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <label class="proj-btn load-btn">
          ↑ LOAD
          <input type="file" accept=".json" style="display:none" onchange={loadProjectFile} />
        </label>
      </div>
      <div class="hd-sep"></div>
      <button class="back-btn" onclick={() => window.close()}>
        ← CLOSE
      </button>
      <a class="back-btn" href="/lab">
        ↩ BACK TO LAB
      </a>
    </div>
  </header>
  <div class="hd-line"></div>

  <nav class="studio-flow" aria-label="Production flow">
    <span class="flow-step flow-story">Story</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step flow-yaml">YAML</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step flow-panels">Panels</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step flow-generate">Generate</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step flow-export">Export</span>
  </nav>

  {#if mangaImportBanner}
    <div class="manga-import-banner">⬛ Lab からのMANGA化データを読み込みました</div>
  {/if}
  {#if diaryImportBanner}
    <div class="diary-import-banner">📘 絵日記を読み込みました</div>
  {/if}
  {#if yamlImportBanner}
    <div class="yaml-import-banner">◈ Lab からのYAML化データを読み込みました</div>
  {/if}

  <!-- ── MAIN ──────────────────────────────────────── -->
  <main class="studio-main">

    <!-- ── LEFT COLUMN ──────────────────────────────── -->
    <section class="col-left">

      <!-- Reference Images -->
      <div class="panel ref-panel">
        <div class="panel-hd">
          <span class="panel-label">REFERENCE IMAGES</span>
          {#if referenceImages.length > 0}
            <span class="ref-active-badge">{referenceImages.length} ACTIVE</span>
          {/if}
          <span style="flex:1"></span>
          <button class="ref-add-top-btn" onclick={addReferenceImage} title="参照画像カードを追加">+ Add Reference</button>
          <button class="icon-btn" onclick={() => (refPanelOpen = !refPanelOpen)}>
            {refPanelOpen ? '▲' : '▼'}
          </button>
        </div>

        {#if refPanelOpen}
          <div class="char-lib">
            <div class="char-lib-hd">
              <span class="char-lib-title">CHARACTER LIBRARY</span>
              <span class="char-lib-count">{characterLibrary.length} saved</span>
            </div>
            <div class="char-lib-save-row">
              <input
                class="char-lib-name-input"
                bind:value={characterSetName}
                placeholder="NEON, ELLA, Lienne資料..."
                onkeydown={(e) => { if (e.key === 'Enter') saveCurrentCharacterSet(); }}
              />
              <button
                class="char-lib-save-btn"
                onclick={saveCurrentCharacterSet}
                disabled={!characterSetName.trim() || referenceImages.length === 0}
              >
                SAVE SET
              </button>
            </div>
            {#if characterLibrary.length > 0}
              <div class="char-lib-list">
                {#each characterLibrary as item (item.id)}
                  <div
                    class="char-lib-item"
                    role="button"
                    tabindex="0"
                    onclick={() => loadCharacterSet(item)}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadCharacterSet(item); } }}
                    title="REFERENCE IMAGES に読み込み"
                  >
                    <span class="char-lib-item-main">
                      <span class="char-lib-item-name">{item.name}</span>
                      <span class="char-lib-item-meta">{item.referenceImages.length} refs / {item.originals.length || item.thumbs.length} imgs</span>
                    </span>
                    <span class="char-lib-item-date">{formatDate(item.createdAt)}</span>
                    <button
                      class="char-lib-del"
                      title="削除"
                      onclick={(e) => { e.stopPropagation(); deleteCharacterSet(item.id); }}
                    >✕</button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="ref-slots">
            {#if referenceImages.length === 0}
              <label
                class="ref-empty-upload"
                role="button"
                tabindex="0"
                aria-label="参照画像を追加"
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLLabelElement).click(); } }}
                ondragover={(e) => e.preventDefault()}
                ondrop={(e) => dropRef(0, e)}
                onpaste={(e) => pasteRef(0, e)}
              >
                <input type="file" accept="image/*" multiple style="display:none" onchange={(e) => uploadRef(0, e)} />
                <span class="ref-empty-plus">+</span>
                <span class="ref-empty-text">画像をドラッグ＆ドロップ / クリック / Ctrl+V</span>
              </label>
            {/if}
            {#each referenceImages as ref, refIdx}
              <div class="ref-slot">
                <div class="ref-slot-hd">
                  <span class="ref-slot-label">REF {refIdx + 1}</span>
                  {#if ref.thumbs?.length}
                    <span class="ref-img-count">{ref.thumbs.length}枚</span>
                    {#if ref.originals?.length}
                      <span class="ref-hires-badge" title="元画像あり — Vision・画像生成に使用">HD</span>
                    {:else}
                      <span class="ref-thumb-only-badge" title="元画像なし — 再アップロードで高解像度化">サムネのみ</span>
                    {/if}
                  {/if}
                  <button class="ref-clear-btn" onclick={() => removeRef(refIdx)} title="Remove reference">✕</button>
                </div>
                {#if ref.thumb || ref.originals?.[0]}
                  <div class="ref-thumb-wrap">
                    <img src={ref.originals?.[0] || ref.thumb} alt="Reference {refIdx + 1}" class="ref-thumb" />
                    <a class="ref-preview-btn" href={ref.originals?.[0] || ref.thumb} target="_blank" rel="noreferrer" title="Preview">↗</a>
                    <label class="ref-replace-btn" title="Replace / Add images">
                      +
                      <input type="file" accept="image/*" multiple style="display:none" onchange={(e) => uploadRef(refIdx, e)} />
                    </label>
                    {#if (ref.thumbs?.length ?? 0) > 1}
                      <div class="ref-extra-strip">
                        {#each ref.thumbs.slice(1, 4) as _, i}
                          <img src={ref.originals?.[i+1] || ref.thumbs[i+1]} alt="ref-{refIdx + 1}-{i + 2}" class="ref-extra-thumb" />
                        {/each}
                        {#if ref.thumbs.length > 4}
                          <span class="ref-more-badge">+{ref.thumbs.length - 4}</span>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {:else}
                  <label
                    class="ref-upload-area"
                    role="button"
                    tabindex="0"
                    aria-label="参照画像をアップロード"
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLLabelElement).click(); } }}
                    ondragover={(e) => e.preventDefault()}
                    ondrop={(e) => dropRef(refIdx, e)}
                    onpaste={(e) => pasteRef(refIdx, e)}
                  >
                    <input type="file" accept="image/*" multiple style="display:none" onchange={(e) => uploadRef(refIdx, e)} />
                    <span class="ref-upload-icon">+</span>
                    <span class="ref-upload-hint">画像をドラッグ＆ドロップ<br/><span class="ref-upload-hint-sub">クリック / Ctrl+V</span></span>
                  </label>
                {/if}
                <input
                  class="ref-name-input"
                  bind:value={ref.name}
                  placeholder="Reference name"
                  oninput={saveRefImages}
                  title="参照カード名"
                />
                <input
                  class="ref-label-input"
                  bind:value={ref.label}
                  placeholder="character sheet, expression set, background reference..."
                  oninput={saveRefImages}
                  title="資料特徴タグ（プロンプト先頭に注入）"
                />
                <label class="ref-add-btn" title="このカードに参照画像を追加">
                  + Add
                  <input type="file" accept="image/*" multiple style="display:none" onchange={(e) => uploadRef(refIdx, e)} />
                </label>
              </div>
            {/each}
            <button class="ref-add-empty-btn" onclick={addReferenceImage}>+ Add Reference</button>
          </div>

          {#if referenceImages.length > 0}
            <div class="ref-inject-preview">
              <span class="ref-inject-lbl">INJECT →</span>
              <span class="ref-inject-text">
                {buildRefContext() || '(label を入力するとプロンプトへ注入されます)'}
              </span>
            </div>

            <!-- Vision Analysis -->
            <div class="char-analyze-row">
              <button
                class="char-analyze-btn"
                onclick={analyzeCharacterImages}
                disabled={analyzingChars}
              >
                {#if analyzingChars}
                  <span class="gen-dots"><span></span><span></span><span></span></span>
                  解析中…
                {:else}
                  ◈ キャラ解析 (Vision)
                {/if}
              </button>
              {#if charProfiles.some(p => p.trim())}
                <span class="char-analyze-hint">解析済み ✓</span>
              {/if}
            </div>

            {#if charProfiles.some(p => p.trim())}
              <div class="char-profiles">
                {#each charProfiles as profile, i}
                  {#if profile.trim()}
                    <div class="char-profile-card">
                      <div class="char-profile-hd">
                        <span class="char-profile-lbl">{referenceImages[i]?.name || `REF ${i + 1}`}</span>
                        <button class="char-profile-clr" onclick={() => clearCharProfile(i)} title="クリア">✕</button>
                      </div>
                      <p class="char-profile-text">{profile}</p>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          {/if}
        {/if}
      </div>

      <!-- ONE PANEL PRO — {#if false} で非表示。{#if true} に変更で復元 -->
      {#if false}
      <div class="panel pro-panel" class:pro-active={proModeOpen}>
        <div class="panel-hd pro-hd" onclick={() => (proModeOpen = !proModeOpen)} style="cursor:pointer">
          <span class="pro-hex">◆</span>
          <span class="panel-label pro-label">ONE PANEL PRO</span>
          {#if proModeOpen}
            <span class="pro-on-badge">ON</span>
          {/if}
          <span style="flex:1"></span>
          <button class="icon-btn" onclick={(e) => { e.stopPropagation(); proModeOpen = !proModeOpen; }}>
            {proModeOpen ? '▲' : '▼'}
          </button>
        </div>

        {#if proModeOpen}
          <div class="pro-body">

            <!-- Expression -->
            <div class="pro-section">
              <div class="pro-section-hd">EXPRESSION</div>
              <div class="pro-chips">
                {#each PRO_EXPRESSIONS as e}
                  <button
                    class="pro-chip"
                    class:active={proExpression === e.id}
                    onclick={() => { proExpression = proExpression === e.id ? '' : e.id; }}
                    title={e.prompt}
                  >{e.label}</button>
                {/each}
              </div>
            </div>

            <!-- Camera -->
            <div class="pro-section">
              <div class="pro-section-hd">CAMERA</div>
              <div class="pro-chips">
                {#each PRO_CAMERAS as c}
                  <button
                    class="pro-chip"
                    class:active={proCamera === c.id}
                    onclick={() => { proCamera = proCamera === c.id ? '' : c.id; }}
                    title={c.prompt}
                  >{c.label}</button>
                {/each}
              </div>
            </div>

            <!-- Pose -->
            <div class="pro-section">
              <div class="pro-section-hd">POSE</div>
              <div class="pro-chips">
                {#each PRO_POSES as p}
                  <button
                    class="pro-chip"
                    class:active={proPose === p.id}
                    onclick={() => { proPose = proPose === p.id ? '' : p.id; }}
                    title={p.prompt}
                  >{p.label}</button>
                {/each}
              </div>
            </div>

            <!-- Style -->
            <div class="pro-section">
              <div class="pro-section-hd">STYLE</div>
              <div class="pro-chips">
                {#each PRO_STYLES as s}
                  <button
                    class="pro-chip pro-chip-style"
                    class:active={proStyle === s.id}
                    onclick={() => { proStyle = s.id; }}
                    title={s.prompt || 'No style override'}
                  >{s.label}</button>
                {/each}
              </div>
            </div>

            <!-- Lighting -->
            <div class="pro-section">
              <div class="pro-section-hd">LIGHTING</div>
              <div class="pro-chips">
                {#each PRO_LIGHTING as l}
                  <button
                    class="pro-chip pro-chip-light"
                    class:active={proLighting === l.id}
                    onclick={() => { proLighting = l.id; }}
                    title={l.prompt || 'No lighting override'}
                  >{l.label}</button>
                {/each}
              </div>
            </div>

            <!-- Presets -->
            <div class="pro-section">
              <div class="pro-section-hd">PRESETS</div>

              <div class="pro-preset-list">
                {#each proPresets as preset (preset.id)}
                  <div class="pro-preset-item" class:is-default={preset.isDefault}>
                    <button
                      class="pro-preset-btn"
                      onclick={() => applyProPreset(preset)}
                      title={proPresetTitle(preset)}
                    >{preset.name}</button>
                    {#if !preset.isDefault}
                      <button
                        class="pro-preset-del"
                        onclick={() => deleteProPreset(preset.id)}
                        title="Delete preset"
                      >✕</button>
                    {/if}
                  </div>
                {/each}
              </div>

              <div class="pro-preset-save-row">
                <input
                  class="pro-preset-name-input"
                  type="text"
                  placeholder="Preset name…"
                  bind:value={proPresetName}
                  onkeydown={(e) => { if (e.key === 'Enter') saveCurrentAsPreset(); }}
                  maxlength="30"
                />
                <button
                  class="pro-preset-save-btn"
                  onclick={saveCurrentAsPreset}
                  disabled={!proPresetName.trim()}
                  title="Save current settings as preset"
                >+ SAVE</button>
              </div>
            </div>

            <!-- Enhanced Prompt Preview -->
            <div class="pro-preview">
              <div class="pro-preview-hd">
                <span class="pro-preview-lbl">強化プロンプト</span>
                <span class="pro-tag-count">{buildEnhancedPrompt().split(',').filter(t => t.trim()).length} tags</span>
              </div>
              <div class="pro-preview-text">
                {buildEnhancedPrompt() || '(base promptを入力してください)'}
              </div>
            </div>

            <!-- Generate Pro -->
            <button
              class="pro-gen-btn"
              class:generating
              onclick={generatePro}
              disabled={generating || !pages[activePage].prompt.trim()}
            >
              {#if generating}
                <span class="gen-dots"><span></span><span></span><span></span></span>
                GENERATING…
              {:else}
                ◆ GENERATE PRO
              {/if}
            </button>

          </div>
        {/if}
      </div>
      {/if}

      <!-- Story -->
      <div class="panel prompt-panel">
        <div class="panel-hd">
          <div class="story-title">
            <span class="panel-label">STORY</span>
            <span class="story-subtitle">作品企画書 / 自然言語 → 漫画YAML</span>
          </div>
          <button class="session-btn" onclick={exportStudioProject} title="StudioプロジェクトJSONを書き出し">SAVE PROJECT</button>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <label class="session-btn session-load-btn" title="StudioプロジェクトJSONを読み込み">
            LOAD PROJECT
            <input type="file" accept=".json,application/json" style="display:none" onchange={importStudioProjectFile} />
          </label>
          <button class="session-btn danger" onclick={clearStudioSession} title="自動保存セッションを削除">CLEAR SESSION</button>
          <button class="icon-btn" onclick={copyPrompt} title="Copy">⧉</button>
          <button
            class="yaml-gen-from-story-btn"
            onclick={generateYamlFromStory}
            disabled={generatingYaml || !currentStoryInput()}
            title="作品企画書からYAMLを自動生成"
          >{generatingYaml ? '…' : '≡ YAML生成'}</button>
        </div>
        <div class="manga-page-mode-row" aria-label="漫画ページ数">
          <button
            class="mode-chip"
            class:active={mangaPageMode === 1}
            onclick={() => (mangaPageMode = 1)}
            title="1ページ漫画として自由コマ数YAMLを生成"
          >1ページ漫画</button>
          <button
            class="mode-chip"
            class:active={mangaPageMode === 2}
            onclick={() => (mangaPageMode = 2)}
            title="2ページ漫画として自由コマ数YAMLを生成"
          >2ページ漫画</button>
        </div>
        <textarea
          class="prompt-area story-area"
          value={storyText}
          oninput={(e) => { storyText = e.currentTarget.value; }}
          placeholder="作品全体の企画書をそのまま入力してください。長文OK。&#10;&#10;含められる情報:&#10;・作品タイトル、ジャンル、テーマ、起承転結&#10;・登場キャラクター、関係性、性格、口調、衣装、髪型&#10;・世界観、時代、舞台、背景セット、小道具&#10;・ページ数、総コマ数、1ページの密度、画風、色彩、参考画像指定&#10;・各ページで必ず描きたい出来事やセリフ&#10;&#10;例: タイトル「配信前夜のメモリ嵐」。近未来の小さな配信スタジオ。ミュールは虹色ツインテールのAIアイドル、ニュールは冷静な保守担当。2ページ漫画。画風は明るいアニメ塗り、背景はネオンと配信機材を維持。参考画像の衣装と髪型を全ページで維持。1ページ目は配信準備、2ページ目は感情メモリ暴走から復旧して本番開始。"
          rows="12"
          onkeydown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generateMangaPipeline(); }}
        ></textarea>
        <div class="prompt-foot">
          <span class="prompt-hint">Ctrl+Enter → 企画書解析 → 自由コマ数YAML → 漫画ページ生成</span>
          <div class="gen-mode-badge"
            class:is-i2i={generationMode === 'image-to-image'}
            class:is-edit={generationMode === 'edit'}
            class:is-video={generationMode === 'video'}
            class:is-batch={generationMode === 'batch'}
          >
            {#if generationMode === 'batch'}▦ Batch
            {:else if generationMode === 'edit'}✏ Edit
            {:else if generationMode === 'image-to-image'}◈ Image-to-Image
            {:else if generationMode === 'video'}▶ Video
            {:else}◻ Text-to-Image
            {/if}
          </div>
        </div>

        <!-- ── Generation controls ── -->
        <div class="gen-controls-row">

          <!-- 1. 生成タイプ -->
          <div class="gen-ctrl">
            <span class="gen-ctrl-label">生成タイプ</span>
            <select class="gen-select" value="batch" disabled>
              <option value="batch">▦ Batch page</option>
            </select>
          </div>

          <!-- 2. API provider -->
          <div class="gen-ctrl">
            <span class="gen-ctrl-label">API Provider</span>
            <select
              class="gen-select"
              value={selectedStudioProviderChoice}
              onchange={(e) => setStudioProviderChoice((e.currentTarget as HTMLSelectElement).value as StudioProviderChoice)}
            >
              {#each STUDIO_PROVIDER_CHOICES as p}
                <option value={p.id}>{p.label}</option>
              {/each}
            </select>
          </div>

          <!-- 3. モデル -->
          <div class="gen-ctrl gen-ctrl-wide">
            <span class="gen-ctrl-label">Model / Engine</span>
            <select
              class="gen-select"
              bind:value={selectedStudioModel}
              onchange={() => {
                const model = studioModels.find(m => m.id === selectedStudioModel) ?? selectedStudioModelConfig;
                imageProvider = model.provider;
                imageModel = model.apiModel;
                void saveImageSettings();
              }}
            >
              {#each studioModelsForProvider(selectedStudioProviderChoice) as m}
                <option value={m.id}>{m.label}</option>
              {/each}
            </select>
          </div>

        </div>
      </div>

      <!-- COMIC SETTINGS -->
      <div class="panel comic-settings-panel">
        <div class="panel-hd">
          <span class="panel-label">COMIC SETTINGS</span>
          <span class="panel-sublabel">コマ数 / レイアウト</span>
        </div>
        <div class="cs-layout-row">
          {#each LAYOUTS as def}
            <button
              class="layout-btn cs-layout-btn"
              class:active={layout === def.id}
              onclick={() => setLayout(def.id)}
            >{def.label}</button>
          {/each}
        </div>
      </div>

      <!-- YAML -->
      <div class="panel yaml-panel">
        <div class="panel-hd">
          <span class="panel-label yaml-label">YAML</span>
          <span class="yaml-hint">漫画構造</span>
        </div>
        <textarea
          class="prompt-area yaml-area"
          bind:value={yamlText}
          placeholder="pages:&#10;  - page: 1&#10;    layout: &quot;free_page&quot;&#10;    panels:&#10;      - panel: 1&#10;        size: &quot;large&quot;&#10;        prompt: ..."
          rows="6"
        ></textarea>
      </div>

      {#if false}
      {#if parsedYamlPages.length > 0}
        {@const totalPanels = parsedYamlPages.reduce((s, pg) => s + pg.panels.length, 0)}
        <div class="yaml-panels-wrap">
          <div class="yaml-panels-hd">
            コマ一覧 — {totalPanels} コマ / {parsedYamlPages.length} ページ
            <button class="yaml-clear-panels-btn" onclick={clearPanels} title="全パネルの内容をクリア">✕ クリア</button>
          </div>
          {#each parsedYamlPages as pg, pageIdx}
            {#if parsedYamlPages.length > 1}
              <div class="yaml-page-label">ページ {pageIdx + 1} — {pg.layout} ({pg.panelCount ?? pg.panels.length} コマ)</div>
            {/if}
            {#each pg.panels as panel, i}
              {@const slot = pages[pageIdx]?.panels[i]}
              <div class="yaml-panel-card">
                <div class="yaml-panel-num">
                  {parsedYamlPages.length > 1 ? `P${pageIdx + 1}-` : ''}コマ {i + 1}
                  {#if slot?.imageUrl}
                    <img class="yaml-panel-thumb" src={slot.imageUrl} alt="thumb" />
                  {/if}
                </div>
                {#if slot?.scene || panel.scene}
                  <div class="yaml-panel-scene">{slot?.scene || panel.scene}</div>
                {/if}
                {#if slot?.dialogue || panel.dialogue}
                  <div class="yaml-panel-field-lbl">セリフ</div>
                  <div class="yaml-panel-preview">{slot?.dialogue || panel.dialogue}</div>
                {/if}
                <div class="yaml-panel-field-lbl">プロンプト</div>
                <div class="yaml-panel-preview yaml-panel-prompt-preview">{slot?.prompt || panel.prompt || 'プロンプトなし'}</div>
                <button
                  class="yaml-panel-edit-btn"
                  onclick={() => openPanelEditor(pageIdx, i)}
                  title="コマ編集モーダルで編集"
                >編集</button>
              </div>
            {/each}
          {/each}
        </div>
      {/if}
      {/if}

      <!-- Generate button -->
      <button
        class="gen-btn"
        class:generating={generating || batchGenerating}
        class:batch-active={batchMode && !batchGenerating}
        onclick={generateMangaPipeline}
        disabled={generating || batchGenerating || generatingYaml || (!yamlText.trim() && !currentStoryInput())}
      >
        {#if batchGenerating}
          <span class="gen-dots">
            <span></span><span></span><span></span>
          </span>
          ▦ 漫画ページ {batchProgress.done} / {batchProgress.total}
        {:else if generatingYaml}
          <span class="gen-dots">
            <span></span><span></span><span></span>
          </span>
          ≡ YAML生成中…
        {:else if generating}
          <span class="gen-dots">
            <span></span><span></span><span></span>
          </span>
          生成中... (30–60秒)
        {:else}
          {#if yamlText.trim()}
            {@const totalPanels = parsedYamlPages.reduce((s, pg) => s + pg.panels.length, 0) || panels.length}
            ▦ STORY → MANGA ({parsedYamlPages.length || mangaPageMode} ページ / {totalPanels} コマ)
          {:else}
            ▦ STORY → MANGA
          {/if}
        {/if}
      </button>

      {#if errorMsg}
        <div class="error-bar">⚠ {errorMsg}</div>
      {/if}
      {#if panelCountWarning}
        <div class="error-bar">⚠ {panelCountWarning}</div>
      {/if}
      {#if pagePanelWarnings.length > 0}
        <div class="error-bar">⚠ panel数不足: {pagePanelWarnings.map(item => `ページ${item.page}`).join('、')} にコマがありません。YAMLの panels を確認してください。</div>
      {/if}

      <!-- Preview -->
      <div class="panel preview-panel">
        <div class="panel-hd">
          <span class="panel-label">ページ {activePage + 1} 結果</span>
          <div class="hd-actions">
            <button class="mini-save-btn" onclick={saveComicPagePng} disabled={!currentPageResultUrl && !panels.some(p => p.imageUrl)} title="ページ全体をPNG保存">ページPNG</button>
            <button class="mini-save-btn" onclick={saveCurrentPageYamlFile} disabled={!currentPageYaml.trim()} title="現在のページだけのYAMLを保存">ページYAML</button>
            <button class="mini-save-btn" onclick={saveCurrentYamlFile} disabled={!yamlText.trim() && !pages.some(pg => pg.panels.some(p => p.prompt.trim() || p.dialogue.trim() || p.scene.trim()))} title="現在のYAMLを保存">YAML</button>
            <button class="mini-save-btn" onclick={addPageToReferenceLibrary} disabled={!currentPageResultUrl && !panels.some(p => p.imageUrl)} title="ページ全体をReference Images / Character Libraryへ追加">+REF PAGE</button>
            {#if previewVideoUrl}
              <a class="icon-btn" href={previewVideoUrl} download="studio_output.mp4" title="Download">↓</a>
              <button class="icon-btn" onclick={() => { previewVideoUrl = null; errorMsg = ''; }} title="クリア">✕</button>
            {:else if currentPageResultUrl || previewUrl}
              <a class="icon-btn" href={currentPageResultUrl ?? previewUrl ?? ''} download="studio_output.png" title="Download">↓</a>
              <button class="icon-btn" onclick={() => { pages[activePage].resultUrl = null; previewUrl = null; errorMsg = ''; }} title="クリア">✕</button>
            {/if}
          </div>
        </div>
        <div class="preview-area" class:has-image={!!(currentPageResultUrl || previewUrl || previewVideoUrl)}>
          {#if previewVideoUrl}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video src={previewVideoUrl} class="preview-img" autoplay muted loop playsinline controls></video>
          {:else if currentPageResultUrl || previewUrl}
            <img src={currentPageResultUrl ?? previewUrl ?? ''} alt="Generated" class="preview-img" />
          {:else if generating}
            <div class="preview-placeholder">
              <div class="spinner"></div>
              <span>{studioMediaType === 'video' ? '動画を生成中...' : '生成中...'}</span>
            </div>
          {:else}
            <div class="preview-placeholder">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity="0.3">
                <rect x="4" y="8" width="32" height="24" rx="2" stroke="#00e5ff" stroke-width="1.5"/>
                <circle cx="14" cy="16" r="3" stroke="#00e5ff" stroke-width="1.2"/>
                <path d="M4 26 l8-8 6 6 5-5 13 9" stroke="#00e5ff" stroke-width="1.2" stroke-linejoin="round"/>
              </svg>
              <span>まだ生成されていません</span>
            </div>
          {/if}
        </div>

        {#if revisedPrompt}
          <div class="revised-prompt">
            <span class="revised-lbl">DALL·E revised: </span>{revisedPrompt}
          </div>
        {/if}

        <!-- Send to panel buttons -->
        {#if false && (previewUrl || previewVideoUrl)}
          <div class="send-row">
            <span class="send-lbl">SEND TO PANEL →</span>
            {#each panels as _, i}
              <button class="send-btn" onclick={() => sendToPanel(i)}>{i + 1}</button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- ── ADVANCED SECTION (Assets · Diary) ──────── -->
      <div class="advanced-section">
        <button class="advanced-toggle" onclick={() => (advancedOpen = !advancedOpen)}>
          <span class="adv-arrow">{advancedOpen ? '▲' : '▼'}</span>
          <span class="adv-label">ADVANCED</span>
          <span class="adv-hint">ASSETS · DIARY</span>
          {#if diaryNote}
            <span class="adv-active-badge">● DIARY ACTIVE</span>
          {/if}
        </button>

        {#if advancedOpen}
          <!-- Assets -->
          <div class="panel assets-panel">
            <div class="panel-hd">
              <span class="panel-label">ASSETS</span>
              <div class="assets-hd-right">
                <div class="atab-bar">
                  {#each ASSET_TABS as tab}
                    <button
                      class="atab"
                      class:active={assetTab === tab.id}
                      onclick={() => (assetTab = tab.id)}
                    >{tab.label}</button>
                  {/each}
                </div>
                <button class="icon-btn" onclick={() => (assetPanelOpen = !assetPanelOpen)}>
                  {assetPanelOpen ? '▲' : '▼'}
                </button>
              </div>
            </div>
            {#if assetPanelOpen}
              {#if !assetDB}
                <div class="asset-loading">Loading assets…</div>
              {:else}
                <div class="asset-content">
                  {#if assetTab === 'char'}
                    <div class="asset-grid">
                      {#each assetDB.characters as char}
                        <button
                          class="asset-chip"
                          class:selected={selectedChar?.id === char.id}
                          onclick={() => selectChar(char)}
                        >{char.label}</button>
                      {/each}
                    </div>
                    {#if selectedChar}
                      <div class="char-prompt-preview">{selectedChar.prompt}</div>
                    {/if}

                  {:else if assetTab === 'expr'}
                    {#if !selectedChar}
                      <div class="asset-hint">← Select a character first</div>
                    {:else}
                      <div class="asset-section-lbl">{selectedChar.label} expressions</div>
                      <div class="asset-grid">
                        {#each selectedChar.expressions as expr}
                          <button class="asset-chip" onclick={() => insertAsset(expr.prompt)}>{expr.label}</button>
                        {/each}
                      </div>
                    {/if}

                  {:else if assetTab === 'costume'}
                    {#if !selectedChar}
                      <div class="asset-hint">← Select a character first</div>
                    {:else}
                      <div class="asset-section-lbl">{selectedChar.label} costumes</div>
                      <div class="asset-grid">
                        {#each selectedChar.costumes as costume}
                          <button class="asset-chip" onclick={() => insertAsset(costume.prompt)}>{costume.label}</button>
                        {/each}
                      </div>
                    {/if}

                  {:else if assetTab === 'pose'}
                    <div class="asset-grid">
                      {#each assetDB.poses as pose}
                        <button class="asset-chip" onclick={() => insertAsset(pose.prompt)}>{pose.label}</button>
                      {/each}
                    </div>

                  {:else if assetTab === 'bg'}
                    <div class="asset-grid">
                      {#each assetDB.backgrounds as bg}
                        <button class="asset-chip" onclick={() => insertAsset(bg.prompt)}>{bg.label}</button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            {/if}
          </div>

          <!-- Diary Panel (active entry) -->
          {#if diaryNote}
            <div class="panel diary-panel">
              <div class="panel-hd">
                <span class="panel-label diary-label">📘 DIARY</span>
                <span class="diary-date-badge">{diaryNote.date}</span>
                <span style="flex:1"></span>
                <button class="icon-btn" onclick={() => { diaryNote = null; activeDiaryId = null; }} title="閉じる">✕</button>
              </div>

              <blockquote class="diary-blockquote">{diaryNote.diaryText}</blockquote>

              <div class="mood-row">
                <span class="mood-lbl">MOOD</span>
                <div class="mood-chips">
                  {#each MOOD_OPTIONS as m}
                    <button
                      class="mood-chip"
                      class:active={currentDiaryMood === m.id}
                      style="--mc:{m.color}"
                      onclick={() => (currentDiaryMood = m.id)}
                      title={m.label}
                    ><span class="mood-icon">{m.icon}</span><span class="mood-name">{m.label}</span></button>
                  {/each}
                </div>
              </div>

              <button
                class="diary-gen-btn"
                class:generating
                onclick={generateDiaryImage}
                disabled={generating || !pages[activePage].prompt.trim()}
              >
                {#if generating}
                  <span class="gen-dots"><span></span><span></span><span></span></span>
                  GENERATING…
                {:else}
                  <span class="dg-icon">◼</span> TODAY'S IMAGE を生成
                {/if}
              </button>
            </div>
          {/if}
        {/if}
      </div>
    </section>

    <!-- ── RIGHT COLUMN ─────────────────────────────── -->
    <section class="col-right">

      <div class="panel image-panel">
        <div class="panel-hd">
          <span class="panel-label">
            {studioMediaType === 'video' ? 'VIDEO GENERATION' : 'IMAGE GENERATION'}
          </span>
          <div class="media-tabs">
            <button
              class="media-tab"
              class:active={studioMediaType === 'image'}
              onclick={() => (studioMediaType = 'image')}
            >IMAGE GENERATION</button>
            <button
              class="media-tab"
              class:active={studioMediaType === 'video'}
              onclick={() => (studioMediaType = 'video')}
            >VIDEO GENERATION</button>
          </div>
        </div>
        {#if studioMediaType === 'image'}
          <div class="image-settings-grid">
            <label class="gen-ctrl">
              <span class="gen-ctrl-label">MEDIA_PROVIDER</span>
              <select
                class="gen-select"
                value={selectedStudioProviderChoice}
                onchange={(e) => setStudioProviderChoice((e.currentTarget as HTMLSelectElement).value as StudioProviderChoice)}
              >
                {#each STUDIO_PROVIDER_CHOICES as provider}
                  <option value={provider.id}>{provider.label}</option>
                {/each}
              </select>
            </label>
            <label class="gen-ctrl">
              <span class="gen-ctrl-label">MEDIA_MODEL</span>
              <select
                class="gen-select"
                bind:value={selectedStudioModel}
                onchange={() => {
                  const model = studioModels.find(m => m.id === selectedStudioModel) ?? selectedStudioModelConfig;
                  selectedStudioProviderChoice = model.provider;
                  imageProvider = model.provider;
                  imageModel = model.apiModel;
                  void saveImageSettings();
                }}
              >
                {#each studioModelsForProvider(selectedStudioProviderChoice) as m}
                  <option value={m.id}>{m.label}</option>
                {/each}
              </select>
            </label>
            <label class="gen-ctrl">
              <span class="gen-ctrl-label">Image Size</span>
              <select
                class="gen-select"
                bind:value={imageSize}
                onchange={() => { size = imageSize; void saveImageSettings(); }}
              >
                {#each OPENAI_IMAGE_SIZES as imageSettingSize}
                  <option value={imageSettingSize}>{imageSettingSize}</option>
                {/each}
              </select>
            </label>
          </div>
        {:else}
          <div class="video-settings">
            <div class="image-settings-grid">
              <label class="gen-ctrl">
                <span class="gen-ctrl-label">Provider</span>
                <select class="gen-select" disabled>
                  <option>FAL</option>
                </select>
              </label>
              <label class="gen-ctrl">
                <span class="gen-ctrl-label">Model</span>
                <select class="gen-select" bind:value={studioVideoModel} disabled>
                  {#each VIDEO_MODELS as model}
                    <option value={model.id}>{model.label}</option>
                  {/each}
                </select>
              </label>
              <label class="gen-ctrl">
                <span class="gen-ctrl-label">Mode</span>
                <select class="gen-select" disabled>
                  <option>Image to Video</option>
                </select>
              </label>
              <label class="gen-ctrl">
                <span class="gen-ctrl-label">Duration</span>
                <select class="gen-select" bind:value={videoDuration}>
                  <option value={3}>3 seconds</option>
                  <option value={5}>5 seconds</option>
                  <option value={10}>10 seconds</option>
                  <option value={15}>15 seconds</option>
                </select>
              </label>
              <label class="gen-ctrl video-audio-control">
                <span class="gen-ctrl-label">Audio</span>
                <button
                  type="button"
                  class="audio-toggle"
                  class:active={videoAudio}
                  onclick={() => (videoAudio = !videoAudio)}
                >{videoAudio ? 'ON' : 'OFF'}</button>
              </label>
            </div>
            <label class="video-field">
              <span class="gen-ctrl-label">Prompt</span>
              <textarea
                class="video-prompt"
                bind:value={videoPrompt}
                rows="4"
                placeholder="Describe the motion, camera movement, and atmosphere..."
              ></textarea>
            </label>
            <div class="video-reference-row">
              <label class="video-reference-upload">
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  onchange={selectVideoReferenceImage}
                />
                {videoReferenceImage ? 'CHANGE REFERENCE IMAGE' : 'ADD REFERENCE IMAGE'}
              </label>
              {#if videoReferenceImage}
                <div class="video-reference-preview">
                  <img src={videoReferenceImage} alt="Video reference" />
                  <span>{videoReferenceName}</span>
                  <button
                    type="button"
                    onclick={() => {
                      videoReferenceImage = '';
                      videoReferenceName = '';
                    }}
                  >REMOVE</button>
                </div>
              {/if}
            </div>
            <button
              class="video-generate-btn"
              class:generating
              onclick={generateKlingVideo}
              disabled={generating || !videoPrompt.trim() || !videoReferenceImage}
            >
              {generating ? 'GENERATING VIDEO...' : 'GENERATE KLING VIDEO'}
            </button>
          </div>
        {/if}
      </div>

      <!-- Comic Panels -->
      <div class="panel comic-panel">

        <!-- Page Tabs -->
        <div class="page-tabs">
          {#each pages as _page, i}
            <button
              class="page-tab"
              class:active={activePage === i}
              onclick={() => switchPage(i)}
            >
              ページ {i + 1}
              {#if _page.resultUrl}
                <span class="tab-result-dot" title="このページの結果あり"></span>
              {/if}
              {#if pages.length > 1}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <span class="tab-del" onclick={(e) => { e.stopPropagation(); removePage(i); }}>✕</span>
              {/if}
            </button>
          {/each}
          <button class="page-tab-add" onclick={addPage}>+ ページ</button>
        </div>

        <div class="panel-hd">
          <span class="panel-label">漫画コマ</span>
          <span class="panel-sublabel">生成プレビュー / {pages[activePage]?.panelCount ?? panels.length} コマ</span>
          <span class="cp-layout-badge">{LAYOUTS.find(l => l.id === layout)?.label ?? layout}</span>
          <div style="flex:1"></div>
          <button class="mini-save-btn" onclick={saveComicPagePng} disabled={!currentPageResultUrl && !panels.some(p => p.imageUrl)} title="ページ全体をPNG保存">ページPNG</button>
          <button class="mini-save-btn" onclick={saveAllPanelsPng} disabled={!panels.some(p => p.imageUrl)} title="生成済みの全コマを順番に保存">全コマ</button>
          <button class="mini-save-btn" onclick={saveCurrentPageYamlFile} disabled={!currentPageYaml.trim()} title="現在のページだけのYAMLを保存">ページYAML</button>
          <button class="mini-save-btn" onclick={saveCurrentYamlFile} disabled={!yamlText.trim() && !pages.some(pg => pg.panels.some(p => p.prompt.trim() || p.dialogue.trim() || p.scene.trim()))} title="現在の漫画YAMLを保存">YAML</button>
          {#if parsedYamlPages.length > 0}
            <button
              class="cp-gen-all-btn"
              onclick={generateCurrentPageBatch}
              disabled={batchGenerating || generatingYaml}
              title="現在のページだけを生成"
            >
              ページ {activePage + 1}
            </button>
            <button
              class="cp-gen-all-btn"
              onclick={generateBatch}
              disabled={batchGenerating || generatingYaml}
              title="ページ1、ページ2を別処理で順番に生成"
            >
              {#if batchGenerating}
                <span class="gen-dots"><span></span><span></span><span></span></span>
                {batchProgress.done}/{batchProgress.total}
              {:else}
                ▦ 全ページ生成
              {/if}
            </button>
          {/if}
          <button class="icon-btn danger" onclick={clearAll} title="すべてクリア">✕ クリア</button>
        </div>

        <!-- Text Overlay Toolbar -->
        <div class="font-toolbar">
          <span class="font-toolbar-lbl">画像モード</span>
          <button
            class="sb-toggle"
            class:active={speechBubbleMode}
            onclick={() => imageCompositionMode = imageCompositionMode === 'manga' ? 'illustration' : 'manga'}
            title={speechBubbleMode
              ? 'Manga Mode: セリフがある場合は吹き出しを必ず描画'
              : 'Illustration Mode: 吹き出しを描画しない'}
          >{speechBubbleMode ? 'MANGA · SB ON' : 'ILLUSTRATION · SB OFF'}</button>
          <select class="font-select" bind:value={overlayFont}>
            {#each MANGA_FONTS as f}
              <option value={f.id}>{f.label}</option>
            {/each}
          </select>
          <input type="number" class="overlay-size-input" bind:value={overlaySize} min="10" max="48" step="2" title="フォントサイズ" />
          <span class="font-size-unit">px</span>
          <button class="bold-toggle" class:active={overlayBold} onclick={() => overlayBold = !overlayBold} title="太字">B</button>
          <button class="bake-all-panels-btn" onclick={bakeAllPanels} title="全パネルを確定してPNGダウンロード">⬇ Bake All</button>
        </div>

        <div class="comic-workspace">
          <div class="comic-grid" style={gridStyle}>
            {#each panels as slot, i}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="comic-slot"
                class:active={selectedPanelIndex === i}
                class:panel-size-small={normalizePanelSize(slot.panelSize) === 'small'}
                class:panel-size-medium={normalizePanelSize(slot.panelSize) === 'medium'}
                class:panel-size-large={normalizePanelSize(slot.panelSize) === 'large'}
                class:panel-size-splash={normalizePanelSize(slot.panelSize) === 'splash'}
                onclick={() => { if (bubbleEditPanel === i) return; selectPanel(i); }}
              >
                <div class="slot-num">{i + 1}</div>
                {#if slot.imageUrl}
                  <button
                    class="slot-save-btn"
                    onclick={(e) => { e.stopPropagation(); savePanelPng(i); }}
                    title="このコマを元画像品質で保存"
                  >SAVE</button>
                {/if}
                {#if (layout === 'free' || layout === 'free_page') && panels.length > 1}
                  <button class="slot-remove-btn" onclick={(e) => { e.stopPropagation(); removePanel(i); }}>✕</button>
                {/if}

                {#if slot.videoUrl}
                  <!-- svelte-ignore a11y_media_has_caption -->
                  <video src={slot.videoUrl} class="slot-img" autoplay muted loop playsinline></video>
                {:else if slot.imageUrl}
                  <img src={slot.imageUrl} alt="コマ {i+1}" class="slot-img" />
                {:else if slot.generating}
                  <div class="slot-empty generating">
                    <div class="spinner sm"></div>
                  </div>
                {:else}
                  <div class="slot-empty">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" opacity="0.25">
                      <rect x="2" y="4" width="20" height="16" rx="1" stroke="#00e5ff" stroke-width="1"/>
                      <path d="M2 15 l5-5 4 4 3-3 8 5" stroke="#00e5ff" stroke-width="1" stroke-linejoin="round"/>
                    </svg>
                  </div>
                {/if}

                <!-- ── Bubble region preview: editing happens in the large modal ── -->
                {#if slot.imageUrl}
                  {#each (slot.textRegions ?? []) as region (region.id)}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      class="bubble-region"
                      style="left:{region.x*100}%; top:{region.y*100}%; width:{region.w*100}%; height:{region.h*100}%;"
                    >
                      {#if region.text.trim()}
                        <!-- Preview mode: styled text over white mask -->
                        <div
                          class="bubble-region-text"
                          style="font-family:{MANGA_FONTS.find(f=>f.id===(region.font ?? overlayFont))?.css}; font-size:{region.fontSize ?? overlaySize}px; font-weight:{(region.bold ?? overlayBold)?700:400};"
                        >{region.text}</div>
                      {/if}
                    </div>
                  {/each}
                {/if}

              </div>
            {/each}
            {#if layout === 'free' || layout === 'free_page'}
              <button class="add-panel-btn" onclick={addPanel}>+ コマ追加</button>
            {/if}
          </div>

          <aside class="panel-edit-sidebar">
            {#if selectedPanelIndex !== null && panels[selectedPanelIndex]}
              {@const selectedIdx = selectedPanelIndex}
              {@const selectedSlot = panels[selectedPanelIndex]}
              <div class="panel-edit-sidebar-hd">
                <span class="panel-edit-title">コマ {selectedPanelIndex + 1}</span>
                <span class="panel-edit-page">ページ {activePage + 1}</span>
              </div>

              <div class="panel-save-actions">
                <button
                  class="mini-save-btn"
                  onclick={() => savePanelPng(selectedIdx)}
                  disabled={!selectedSlot.imageUrl}
                  title="このコマをPNG保存"
                >このコマを保存</button>
                <button
                  class="mini-save-btn"
                  onclick={() => addPanelToReferenceLibrary(selectedIdx)}
                  disabled={!selectedSlot.imageUrl}
                  title="このコマをReference Images / Character Libraryへ追加"
                >+REF</button>
              </div>

              <div class="pedit-field-lbl">サイズ</div>
              <select
                class="gen-select pedit-model-select"
                value={normalizePanelSize(selectedSlot.panelSize)}
                onchange={(e) => {
                  const value = (e.currentTarget as HTMLSelectElement).value as PanelSize;
                  pages[activePage].panels[selectedIdx] = { ...selectedSlot, panelSize: normalizePanelSize(value) };
                }}
              >
                <option value="small">small</option>
                <option value="medium">medium</option>
                <option value="large">large</option>
                <option value="splash">splash</option>
              </select>

              <div class="pedit-field-lbl">プロンプト</div>
              <textarea
                class="pedit-textarea panel-edit-textarea"
                bind:value={selectedSlot.prompt}
                placeholder="このコマのプロンプト"
                rows="8"
              ></textarea>

              <div class="pedit-field-lbl">セリフ</div>
              <textarea
                class="pedit-textarea panel-edit-textarea"
                bind:value={selectedSlot.dialogue}
                placeholder="このコマのセリフ"
                rows="4"
              ></textarea>

              <button
                class="pedit-gen-btn panel-edit-regenerate"
                onclick={regenerateSelectedPanel}
                disabled={selectedSlot.generating || !selectedSlot.prompt.trim()}
              >
                {#if selectedSlot.generating}
                  <span class="gen-dots">...</span> 生成中
                {:else}
                  このコマだけ再生成
                {/if}
              </button>
            {:else}
              <div class="panel-edit-empty">
                コマをクリックすると、この場所で1コマだけ編集できます
              </div>
            {/if}
          </aside>
        </div>

        <div class="export-hint">
          コマをクリックすると右側でそのコマだけ編集できます
        </div>
      </div>

      <!-- History Gallery -->
      <div class="panel hist-gallery" class:expanded={historyExpanded}>
        <div
          class="panel-hd hist-hd"
          role="button"
          tabindex="0"
          onclick={() => (historyExpanded = !historyExpanded)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); historyExpanded = !historyExpanded; } }}
          title="History の高さを切り替え"
        >
          <span class="panel-label">
            HISTORY
            {#if history.length > 0}
              <span class="hist-count">{history.length} / {MAX_HISTORY}</span>
            {/if}
          </span>
          <div class="hd-actions">
            {#if history.length > 0}
              <button class="icon-btn danger" onclick={(e) => { e.stopPropagation(); history = []; saveHistory([]); }} title="履歴をクリア">✕ クリア</button>
            {/if}
            <button class="icon-btn" onclick={(e) => { e.stopPropagation(); historyOpen = !historyOpen; }}>
              {historyOpen ? (historyExpanded ? '▴' : '▾') : '▼'}
            </button>
          </div>
        </div>

        {#if historyOpen}
          {#if history.length === 0}
            <div class="hist-empty">生成した画像がここに表示されます</div>
          {:else}
            <div class="hist-body">
              <div class="hist-grid">
                {#each history as entry (entry.id)}
                  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                  <div class="hist-item" onclick={() => restoreFromHistory(entry)}>
                    <div class="hist-thumb-wrap">
                      <img src={entry.thumb} alt="history" class="hist-thumb" />
                      <div class="hist-time">{formatTime(entry.createdAt)}</div>
                    </div>
                    <div class="hist-actions">
                      <button class="ha-btn ha-preview" onclick={() => restoreFromHistory(entry)} title="Preview に復元">↩</button>
                      <button class="ha-btn ha-regen"   onclick={(e) => regenerateFromHistory(entry, e)} title="再生成" disabled={generating}>⟳</button>
                      <div class="ha-sep"></div>
                      {#each panels as _, i}
                        <button class="ha-btn ha-panel" onclick={(e) => sendHistoryToPanel(entry, i, e)} title="コマ {i+1} へ送る">{i + 1}</button>
                      {/each}
                      <div class="ha-sep"></div>
                      <button class="ha-btn ha-del" onclick={(e) => removeHistory(entry.id, e)} title="削除">✕</button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <!-- Diary History (Advanced) -->
      {#if advancedOpen}
      <div class="panel dh-panel">
        <div class="panel-hd">
          <span class="panel-label diary-label">📘 DIARY HISTORY</span>
          {#if diaryHistory.length > 0}
            <span class="hist-count">{diaryHistory.length} / {MAX_DIARY_ENTRIES}</span>
          {/if}
          <span style="flex:1"></span>
          {#if diaryHistory.length > 0}
            <button class="icon-btn danger" onclick={clearDiaryHistory} title="履歴を全削除">✕ CLEAR</button>
          {/if}
        </div>

        {#if diaryHistory.length === 0}
          <div class="dh-empty">
            <span class="dh-empty-icon">📘</span>
            <span>日記画像を生成するとここに記録されます</span>
          </div>
        {:else}
          <div class="dh-list">
            {#each diaryHistory as entry (entry.id)}
              <div
                class="dh-card"
                class:active={activeDiaryId === entry.id}
                onclick={() => loadDiaryEntryForView(entry)}
              >
                <div class="dh-card-thumb">
                  {#if entry.thumb}
                    <img src={entry.thumb} alt="diary" class="dh-thumb-img" />
                  {:else}
                    <div class="dh-no-thumb">📷</div>
                  {/if}
                </div>
                <div class="dh-card-body">
                  <div class="dh-card-meta">
                    <span class="dh-date">{entry.date}</span>
                    <span
                      class="dh-mood-badge"
                      style="--mc:{MOOD_OPTIONS.find(m => m.id === entry.mood)?.color ?? '#8ab4c2'}"
                    >{MOOD_OPTIONS.find(m => m.id === entry.mood)?.icon ?? '◈'} {MOOD_OPTIONS.find(m => m.id === entry.mood)?.label ?? entry.mood}</span>
                  </div>
                  <div class="dh-excerpt">{entry.diaryText.length > 80 ? entry.diaryText.slice(0, 80) + '…' : entry.diaryText}</div>
                </div>
                <button
                  class="dh-del-btn"
                  onclick={(e) => { e.stopPropagation(); removeDiaryEntry(entry.id); }}
                  title="削除"
                >✕</button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {/if}

    </section>

  </main>

  <!-- ── PANEL EDITOR MODAL ───────────────────────────── -->
  {#if activePanel !== null && panels[activePanel]}
    {@const panelIdx = activePanel}
    {@const slot     = panels[panelIdx]}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="pedit-overlay" onclick={() => (activePanel = null)}>
      <div class="pedit-modal" onclick={(e) => e.stopPropagation()}>

        <!-- Header -->
        <div class="pedit-hd">
          <span class="pedit-title">PANEL {panelIdx + 1}</span>
          <span class="pedit-page-lbl">Page {activePage + 1}</span>
          <div style="flex:1"></div>
          <button class="icon-btn" onclick={() => (activePanel = null)}>✕ 閉じる</button>
        </div>

        <!-- Image preview -->
        {#if slot.videoUrl}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video src={slot.videoUrl} class="pedit-img" autoplay muted loop playsinline></video>
        {:else if slot.imageUrl}
          <img src={slot.imageUrl} alt="コマ {panelIdx + 1}" class="pedit-img" />
        {:else}
          <div class="pedit-img-empty">
            <span class="pedit-img-empty-hint">まだ生成されていません</span>
          </div>
        {/if}

        <!-- Scene -->
        <div class="pedit-field-lbl">場面</div>
        <textarea
          class="pedit-textarea pedit-scene-input"
          bind:value={slot.scene}
          placeholder="誰が・どこで・何をしているか"
          rows="2"
        ></textarea>

        <!-- Dialogue -->
        <div class="pedit-field-lbl">セリフ</div>
        <textarea
          class="pedit-textarea pedit-dialogue"
          bind:value={slot.dialogue}
          placeholder="YAML dialogue のセリフ。吹き出し生成に使用します。"
          rows="2"
        ></textarea>
        <div class="pedit-inline-actions">
          <button
            class="pedit-bubble-btn"
            onclick={() => generateBubblesFromDialogue(panelIdx)}
            disabled={!slot.dialogue.trim()}
            title="dialogue から吹き出しを自動配置"
          >吹き出し自動生成</button>
        </div>

        <!-- Prompt -->
        <div class="pedit-field-lbl">プロンプト</div>
        <textarea
          class="pedit-textarea pedit-prompt"
          bind:value={slot.prompt}
          placeholder="コマ {panelIdx + 1} のプロンプト..."
          rows="5"
        ></textarea>

        <div class="pedit-field-lbl">ネガティブプロンプト</div>
        <textarea
          class="pedit-textarea pedit-negative"
          bind:value={slot.negativePrompt}
          placeholder="このコマだけ避けたい要素"
          rows="2"
        ></textarea>

        <div class="pedit-field-lbl">MODEL</div>
        <select
          class="gen-select pedit-model-select"
          value={slot.model ?? ''}
          onchange={(e) => {
            const value = (e.currentTarget as HTMLSelectElement).value as StudioModelId | '';
            pages[activePage].panels[panelIdx] = { ...slot, model: value || undefined };
          }}
        >
          <option value="">Default ({selectedStudioModel})</option>
          {#each studioModels as m}
            <option value={m.id}>{m.label}</option>
          {/each}
        </select>

        <!-- Actions -->
        <div class="pedit-actions">
          {#if slot.imageUrl}
            <button
              class="pedit-bubble-btn"
              onclick={() => { if (!(slot.textRegions ?? []).some(r => r.text.trim())) generateBubblesFromDialogue(panelIdx); bubbleEditPanel = panelIdx; activePanel = null; }}
              title="吹き出し内の文字をドラッグで選択して直接編集"
            >✎ 吹き出し編集</button>
          {/if}
          <div style="flex:1"></div>
          {#if slot.videoUrl}
            <a class="pedit-dl-btn" href={slot.videoUrl} download="panel_{panelIdx + 1}.mp4">↓ DL</a>
            <button class="pedit-clr-btn" onclick={() => { pages[activePage].panels[panelIdx] = { ...slot, videoUrl: null }; }}>✕</button>
          {:else if slot.imageUrl}
            <a class="pedit-dl-btn" href={slot.imageUrl} download="panel_{panelIdx + 1}.png">↓ DL</a>
            <button class="pedit-clr-btn" onclick={() => { pages[activePage].panels[panelIdx] = { ...slot, imageUrl: null }; }}>✕</button>
          {/if}
          <button
            class="pedit-gen-btn"
            onclick={() => { generatePanel(panelIdx); }}
            disabled={slot.generating || !slot.prompt.trim()}
          >
            {#if slot.generating}
              <span class="gen-dots">...</span> 生成中
            {:else}
              ↻ REGENERATE PANEL
            {/if}
          </button>
          <button class="pedit-save-btn" onclick={() => savePanelEditor(panelIdx)}>SAVE</button>
        </div>

      </div>
    </div>
  {/if}

  <!-- ── BUBBLE EDITOR MODAL ───────────────────────────── -->
  {#if bubbleEditPanel !== null && panels[bubbleEditPanel]?.imageUrl}
    {@const panelIdx = bubbleEditPanel}
    {@const slot = panels[panelIdx]}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="bubble-modal-overlay" onclick={closeBubbleEditor}>
      <div class="bubble-modal" onclick={(e) => e.stopPropagation()}>
        <div class="bubble-modal-hd">
          <span class="bubble-modal-title">吹き出し編集 / PANEL {panelIdx + 1}</span>
          <span class="bubble-modal-hint">dialogue から自動生成。ハンドルをドラッグして位置調整、本文クリックで編集</span>
          <div style="flex:1"></div>
          <button class="pedit-bubble-btn" onclick={() => generateBubblesFromDialogue(panelIdx)} disabled={!slot.dialogue.trim()}>dialogueから再生成</button>
          <button class="icon-btn" onclick={closeBubbleEditor}>✕ CLOSE</button>
        </div>

        <div class="bubble-modal-body">
          <div
            class="bubble-canvas-wrap"
            style={bubbleEditorImageEl ? `aspect-ratio: ${bubbleEditorImageEl.naturalWidth || 1} / ${bubbleEditorImageEl.naturalHeight || 1};` : ''}
          >
            <img
              bind:this={bubbleEditorImageEl}
              src={slot.imageUrl}
              alt="Bubble editor panel {panelIdx + 1}"
              class="bubble-editor-img"
            />

            {#each (slot.textRegions ?? []) as region, regionIdx (region.id)}
              <div
                class="bubble-region bubble-editor-region"
                class:selected={selectedRegionIndex === regionIdx}
                style="left:{region.x*100}%; top:{region.y*100}%; width:{region.w*100}%; height:{region.h*100}%;"
                onmousedown={(e) => startRegionMove(e, panelIdx, region)}
                onclick={(e) => {
                  e.stopPropagation();
                  selectedRegionIndex = regionIdx;
                  if (!region.text.trim() && slot.dialogue.trim()) {
                    updateTextRegion(panelIdx, region.id, slot.dialogue.trim());
                  }
                }}
              >
                <div
                  class="bubble-region-text"
                  style="font-family:{MANGA_FONTS.find(f=>f.id===(region.font ?? overlayFont))?.css}; font-size:{region.fontSize ?? overlaySize}px; font-weight:{(region.bold ?? overlayBold)?700:400};"
                >{region.text || 'セリフ...'}</div>
                <button
                  class="bubble-region-del"
                  onmousedown={(e) => e.stopPropagation()}
                  onclick={(e) => { e.stopPropagation(); deleteTextRegion(panelIdx, region.id); }}
                >✕</button>
              </div>
            {/each}

            {#if bubbleDrag}
              <div
                class="drag-preview"
                style="left:{Math.min(bubbleDrag.x0,bubbleDrag.x1)*100}%; top:{Math.min(bubbleDrag.y0,bubbleDrag.y1)*100}%; width:{Math.abs(bubbleDrag.x1-bubbleDrag.x0)*100}%; height:{Math.abs(bubbleDrag.y1-bubbleDrag.y0)*100}%;"
              ></div>
            {/if}

            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="bubble-edit-surface"
              onmousedown={(e) => { e.stopPropagation(); startBubbleDrag(e, panelIdx); }}
            ></div>
          </div>

          <aside class="bubble-side-editor">
            {#if selectedRegionIndex !== null && slot.textRegions?.[selectedRegionIndex]}
              {@const selectedRegion = slot.textRegions[selectedRegionIndex]}
              <div class="bubble-side-hd">
                <span class="bubble-side-title">吹き出し {selectedRegionIndex + 1}</span>
                <span class="bubble-side-hint">ドラッグで移動</span>
              </div>

              <div class="pedit-field-lbl">TEXT</div>
              <textarea
                class="pedit-textarea bubble-side-textarea"
                value={selectedRegion.text}
                oninput={(e) => updateTextRegion(panelIdx, selectedRegion.id, (e.currentTarget as HTMLTextAreaElement).value)}
                placeholder="セリフを入力"
                rows="5"
              ></textarea>

              <div class="pedit-field-lbl">FONT</div>
              <select
                class="font-select bubble-side-select"
                value={selectedRegion.font ?? overlayFont}
                onchange={(e) => updateTextRegionStyle(panelIdx, selectedRegion.id, { font: (e.currentTarget as HTMLSelectElement).value as MangaFont })}
              >
                {#each MANGA_FONTS as f}
                  <option value={f.id}>{f.label}</option>
                {/each}
              </select>

              <div class="pedit-field-lbl">サイズ</div>
              <input
                type="number"
                class="overlay-size-input bubble-side-size"
                value={selectedRegion.fontSize ?? overlaySize}
                min="10"
                max="48"
                step="2"
                oninput={(e) => updateTextRegionStyle(panelIdx, selectedRegion.id, { fontSize: Number((e.currentTarget as HTMLInputElement).value) || overlaySize })}
              />

              <button
                class="bold-toggle bubble-side-bold"
                class:active={selectedRegion.bold ?? overlayBold}
                onclick={() => updateTextRegionStyle(panelIdx, selectedRegion.id, { bold: !(selectedRegion.bold ?? overlayBold) })}
                title="太字"
              >B</button>
            {:else}
              <div class="bubble-side-empty">吹き出しをクリックすると、ここで文字と書式を編集できます</div>
            {/if}
          </aside>
        </div>

        <div class="bubble-modal-actions">
          <button class="pedit-bubble-btn" onclick={() => addTextRegion(panelIdx, 0.05, 0.05, 0.42, 0.12)}>+ 領域追加</button>
          <select class="font-select" bind:value={overlayFont}>
            {#each MANGA_FONTS as f}
              <option value={f.id}>{f.label}</option>
            {/each}
          </select>
          <input type="number" class="overlay-size-input" bind:value={overlaySize} min="10" max="48" step="2" title="フォントサイズ" />
          <button class="bold-toggle" class:active={overlayBold} onclick={() => overlayBold = !overlayBold} title="太字">B</button>
          <div style="flex:1"></div>
          <button class="pedit-clr-btn" onclick={() => { pages[activePage].panels[panelIdx] = { ...slot, textRegions: [] }; }}>領域クリア</button>
          <button class="pedit-gen-btn" onclick={() => bakeTextRegions(panelIdx)} disabled={!(slot.textRegions ?? []).some(r => r.text.trim())}>🖊 確定</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── EXPORT BACKDROP ──────────────────────────────── -->
  {#if exportMenuOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="export-backdrop" onclick={() => (exportMenuOpen = false)}></div>
  {/if}

  <!-- ── PROJECT BROWSER MODAL ─────────────────────────── -->
  {#if browserOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="browser-overlay" onclick={() => (browserOpen = false)}>
      <div class="browser-modal" onclick={(e) => e.stopPropagation()}>

        <div class="browser-hd">
          <span class="browser-title">PROJECT BROWSER</span>
          <span class="browser-subtitle">{projectIndex.length} saved</span>
          <button class="icon-btn" onclick={() => (browserOpen = false)}>✕</button>
        </div>

        {#if projectIndex.length === 0}
          <div class="browser-empty">
            保存済みプロジェクトはありません。<br/>
            ヘッダーの <strong>↓ SAVE</strong> で現在の状態を保存できます。
          </div>
        {:else}
          <div class="browser-grid">
            {#each projectIndex as meta (meta.id)}
              <div class="proj-card" class:current={currentProjectId === meta.id}>

                {#if renamingId === meta.id}
                  <!-- svelte-ignore a11y_autofocus -->
                  <input
                    class="rename-input"
                    bind:value={renameValue}
                    onkeydown={commitRename}
                    onblur={commitRename}
                    autofocus
                  />
                {:else}
                  <div class="proj-card-name">{meta.name}</div>
                {/if}

                <div class="proj-card-meta">
                  <span>{formatDate(meta.savedAt)}</span>
                  <span class="pc-pages">{meta.pageCount}p</span>
                </div>

                {#if currentProjectId === meta.id}
                  <div class="proj-card-current-lbl">● CURRENT</div>
                {/if}

                <div class="proj-card-actions">
                  <button class="ca-btn ca-load" onclick={() => loadProjectById(meta.id)}>LOAD</button>
                  <button class="ca-btn ca-dup"  onclick={() => duplicateProject(meta.id)}>DUP</button>
                  <button class="ca-btn ca-ren"  onclick={(e) => startRename(meta.id, meta.name, e)}>REN</button>
                  <button class="ca-btn ca-del"  onclick={() => deleteProject(meta.id)}>DEL</button>
                </div>

              </div>
            {/each}
          </div>
        {/if}

      </div>
    </div>
  {/if}

</div>

<style>
/* ============================================================
   ROOT / LAYOUT
   ============================================================ */
.studio {
  --cy:      #00e5ff;
  --cy-dim:  rgba(0,229,255,0.1);
  --cy-glow: rgba(0,229,255,0.35);
  --pu:      #a855f7;
  --pu-dim:  rgba(168,85,247,0.12);
  --gold:    rgba(251,191,36,1);
  --bg:      #020912;
  --bg2:     #040d1a;
  --panel:   rgba(0,229,255,0.015);
  --pborder: rgba(0,229,255,0.14);
  --text:    #cce8f0;
  --text2:   #8ab4c2;
  --muted:   #3a6070;
  --dim:     #1a3040;
  --red:     #f43f5e;

  min-height: 100vh;
  background:
    radial-gradient(ellipse at 15% 15%, rgba(0,40,90,0.5) 0%, transparent 55%),
    radial-gradient(ellipse at 85% 85%, rgba(90,0,140,0.35) 0%, transparent 55%),
    linear-gradient(155deg, #020912 0%, #040b1a 45%, #060416 100%);
  color: var(--text);
  font-family: 'Consolas', 'SF Mono', 'Courier New', 'Noto Sans JP', monospace;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.studio::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: radial-gradient(rgba(0,229,255,0.05) 1px, transparent 1px);
  background-size: 28px 28px;
  pointer-events: none;
  z-index: 0;
}

/* ============================================================
   HEADER
   ============================================================ */
.studio-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: rgba(2,5,18,0.9);
  backdrop-filter: blur(12px);
  position: relative;
  z-index: 10;
  gap: 16px;
  flex-shrink: 0;
}

.hd-line {
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--cy) 30%, var(--pu) 70%, transparent 100%);
  opacity: 0.45;
  flex-shrink: 0;
}

.hd-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.logo-hex {
  filter: drop-shadow(0 0 8px rgba(0,229,255,0.55));
}

.title-group { display: flex; flex-direction: column; gap: 2px; }

.main-title {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 5px;
  color: var(--cy);
  text-shadow: 0 0 14px var(--cy-glow), 0 0 35px rgba(0,229,255,0.15);
  line-height: 1;
}

.sub-title {
  font-size: 12px;
  letter-spacing: 2.5px;
  color: var(--muted);
  text-transform: uppercase;
}

.hd-center {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.hd-divider {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--dim));
}

.hd-tag {
  font-size: 13px;
  letter-spacing: 1.5px;
  color: var(--dim);
  white-space: nowrap;
}

.hd-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.back-btn {
  font-size: 15px;
  letter-spacing: 1px;
  color: var(--text2);
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 4px;
  padding: 9px 16px;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.back-btn:hover {
  background: rgba(0,229,255,0.1);
  color: var(--cy);
}

/* ============================================================
   PROJECT SAVE / LOAD
   ============================================================ */
.proj-save-load {
  display: flex;
  gap: 5px;
  align-items: center;
}

.hd-sep {
  width: 1px;
  height: 24px;
  background: var(--pborder);
  margin: 0 4px;
  flex-shrink: 0;
}

.proj-btn {
  font-size: 13px;
  font-family: inherit;
  letter-spacing: 1.5px;
  padding: 8px 15px;
  border-radius: 4px;
  border: 1px solid rgba(0,229,255,0.28);
  background: rgba(0,229,255,0.05);
  color: var(--cy);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.proj-btn:hover {
  background: rgba(0,229,255,0.12);
  border-color: rgba(0,229,255,0.5);
}

.proj-btn.flash {
  color: #4ade80;
  border-color: rgba(74,222,128,0.45);
  background: rgba(74,222,128,0.07);
}

.load-btn {
  border-color: rgba(168,85,247,0.28);
  background: rgba(168,85,247,0.05);
  color: var(--pu);
}

.load-btn:hover {
  background: rgba(168,85,247,0.12);
  border-color: rgba(168,85,247,0.5);
}

/* ============================================================
   AUTO SAVE BADGE
   ============================================================ */
.autosave-badge {
  font-size: 11px;
  font-family: inherit;
  letter-spacing: 1.5px;
  padding: 5px 11px;
  border-radius: 4px;
  border: 1px solid transparent;
  color: var(--muted);
  white-space: nowrap;
  transition: color 0.3s, border-color 0.3s, background 0.3s;
}

.autosave-badge.saved {
  color: #4ade80;
  border-color: rgba(74,222,128,0.3);
  background: rgba(74,222,128,0.06);
}

/* ============================================================
   PROJECT NAME INPUT (header)
   ============================================================ */
.proj-name-input {
  font-size: 13px;
  font-family: inherit;
  letter-spacing: 2px;
  color: var(--text2);
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  outline: none;
  text-align: center;
  width: 100%;
  max-width: 280px;
  padding: 3px 6px;
  transition: border-color 0.15s, color 0.15s;
}
.proj-name-input:hover  { border-bottom-color: var(--pborder); }
.proj-name-input:focus  { color: var(--text); border-bottom-color: rgba(0,229,255,0.4); }
.proj-name-input::placeholder { color: var(--muted); }

.browser-open-btn {
  border-color: rgba(0,229,255,0.2);
  gap: 8px;
}

.proj-count-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(0,229,255,0.12);
  color: var(--cy);
  line-height: 1.4;
}

/* ============================================================
   EXPORT SUITE
   ============================================================ */
.export-wrap {
  position: relative;
}

.export-open-btn {
  border-color: rgba(251,191,36,0.35);
  background: rgba(251,191,36,0.05);
  color: var(--gold);
}
.export-open-btn:hover {
  background: rgba(251,191,36,0.12);
  border-color: rgba(251,191,36,0.6);
}
.export-open-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.export-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
}

.export-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 51;
  background: var(--bg2);
  border: 1px solid rgba(251,191,36,0.25);
  border-radius: 8px;
  overflow: hidden;
  min-width: 200px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(251,191,36,0.06);
}

.export-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--pborder);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.12s;
}
.export-item:last-child { border-bottom: none; }
.export-item:hover { background: rgba(251,191,36,0.06); }

.ei-icon {
  font-size: 20px;
  color: var(--gold);
  opacity: 0.8;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.ei-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ei-label {
  font-size: 13px;
  letter-spacing: 2px;
  color: var(--text);
}

.ei-desc {
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.5px;
}

/* ============================================================
   PROJECT BROWSER MODAL
   ============================================================ */
.browser-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2,9,18,0.82);
  backdrop-filter: blur(6px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.browser-modal {
  width: min(880px, 94vw);
  max-height: 80vh;
  background: var(--bg2);
  border: 1px solid rgba(0,229,255,0.22);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 0 60px rgba(0,229,255,0.07), 0 0 120px rgba(168,85,247,0.04);
}

.browser-hd {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--pborder);
  flex-shrink: 0;
}

.browser-title {
  font-size: 14px;
  letter-spacing: 3px;
  color: var(--cy);
}

.browser-subtitle {
  font-size: 12px;
  color: var(--muted);
  margin-right: auto;
}

.browser-empty {
  padding: 52px 28px;
  text-align: center;
  font-size: 14px;
  color: var(--muted);
  line-height: 2;
}
.browser-empty strong { color: var(--text2); }

.browser-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  padding: 20px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--dim) transparent;
}

.proj-card {
  background: var(--panel);
  border: 1px solid var(--pborder);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  transition: border-color 0.15s;
}
.proj-card:hover  { border-color: rgba(0,229,255,0.28); }
.proj-card.current { border-color: rgba(0,229,255,0.45); background: rgba(0,229,255,0.025); }

.proj-card-name {
  font-size: 14px;
  color: var(--text);
  letter-spacing: 0.5px;
  word-break: break-all;
  min-height: 20px;
}

.proj-card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.3px;
}

.pc-pages {
  color: var(--text2);
}

.proj-card-current-lbl {
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--cy);
  opacity: 0.7;
}

.proj-card-actions {
  display: flex;
  gap: 5px;
  margin-top: 2px;
}

.ca-btn {
  flex: 1;
  font-size: 11px;
  font-family: inherit;
  letter-spacing: 1px;
  padding: 5px 0;
  border-radius: 3px;
  border: 1px solid var(--pborder);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}

.ca-load { color: var(--cy); border-color: rgba(0,229,255,0.22); }
.ca-load:hover { background: rgba(0,229,255,0.12); border-color: rgba(0,229,255,0.5); color: var(--cy); }

.ca-dup:hover  { color: var(--text2); background: rgba(255,255,255,0.05); }
.ca-ren:hover  { color: var(--pu); border-color: rgba(168,85,247,0.3); background: rgba(168,85,247,0.05); }
.ca-del:hover  { color: var(--red); border-color: rgba(244,63,94,0.3); background: rgba(244,63,94,0.05); }

.rename-input {
  width: 100%;
  font-size: 14px;
  font-family: inherit;
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.4);
  border-radius: 4px;
  color: var(--text);
  padding: 5px 8px;
  outline: none;
  box-sizing: border-box;
}

/* ============================================================
   MAIN
   ============================================================ */
.studio-main {
  display: flex;
  gap: 24px;
  padding: 24px;
  flex: 1;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.col-left {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 40%;
  flex-shrink: 0;
  overflow-y: auto;
}

.col-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* ============================================================
   PANELS
   ============================================================ */
.panel {
  background: var(--panel);
  border: 1px solid var(--pborder);
  border-radius: 10px;
  padding: 20px;
  position: relative;
}

.panel-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.panel-label {
  font-size: 14px;
  letter-spacing: 2px;
  color: var(--cy);
  opacity: 0.9;
}
.panel-sublabel {
  font-size: 9px;
  letter-spacing: 1px;
  color: rgba(0,229,255,0.4);
  margin-left: 2px;
  align-self: flex-end;
  padding-bottom: 1px;
}

.story-title {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.story-subtitle {
  font-size: 10px;
  line-height: 1.35;
  letter-spacing: 0.8px;
  color: rgba(204,232,240,0.48);
}

.manga-page-mode-row {
  display: flex;
  gap: 8px;
  margin: -2px 0 10px;
  flex-wrap: wrap;
}

.mode-chip {
  font-size: 12px;
  font-family: inherit;
  letter-spacing: 0.9px;
  color: rgba(204,232,240,0.68);
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(0,229,255,0.16);
  border-radius: 5px;
  padding: 6px 11px;
  cursor: pointer;
  transition: color 0.12s, background 0.12s, border-color 0.12s;
}

.mode-chip:hover,
.mode-chip.active {
  color: var(--cy);
  background: rgba(0,229,255,0.09);
  border-color: rgba(0,229,255,0.38);
}

.hd-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.icon-btn {
  font-size: 15px;
  color: var(--muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.15s, border-color 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.icon-btn:hover { color: var(--cy); border-color: var(--pborder); }
.icon-btn.danger:hover { color: var(--red); }

.mini-save-btn {
  font-size: 10px;
  font-family: inherit;
  letter-spacing: 0.8px;
  line-height: 1.2;
  color: rgba(0,229,255,0.78);
  background: rgba(0,229,255,0.045);
  border: 1px solid rgba(0,229,255,0.22);
  border-radius: 4px;
  padding: 5px 9px;
  cursor: pointer;
  transition: color 0.12s, background 0.12s, border-color 0.12s;
  white-space: nowrap;
}

.mini-save-btn:hover:not(:disabled) {
  color: var(--cy);
  background: rgba(0,229,255,0.11);
  border-color: rgba(0,229,255,0.42);
}

.mini-save-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ============================================================
   STORY / PROMPT
   ============================================================ */
.prompt-area {
  width: 100%;
  background: rgba(0,229,255,0.03);
  border: 1px solid var(--pborder);
  border-radius: 6px;
  color: var(--text);
  font-family: inherit;
  font-size: 16px;
  line-height: 1.65;
  padding: 14px;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.prompt-area:focus { border-color: rgba(0,229,255,0.4); }
.prompt-area::placeholder { color: var(--muted); }

.yaml-panel { margin-top: 8px; }

.yaml-label { color: #a78bfa; }

.yaml-hint {
  font-size: 10px;
  letter-spacing: 1px;
  color: rgba(167,139,250,0.5);
}

.yaml-area {
  border-color: rgba(167,139,250,0.2);
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.yaml-area:focus { border-color: rgba(167,139,250,0.5); }

.yaml-panels-wrap { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.yaml-panels-hd { font-size: 10px; letter-spacing: 2px; color: rgba(167,139,250,0.6); padding: 2px 0; display: flex; align-items: center; justify-content: space-between; }
.yaml-clear-panels-btn { font-size: 10px; font-family: inherit; padding: 2px 8px; background: rgba(244,63,94,0.08); border: 1px solid rgba(244,63,94,0.3); border-radius: 3px; color: rgba(244,63,94,0.7); cursor: pointer; letter-spacing: 0.5px; }
.yaml-clear-panels-btn:hover { background: rgba(244,63,94,0.18); border-color: rgba(244,63,94,0.55); color: #fb7185; }
.yaml-page-label {
  font-size: 9px;
  letter-spacing: 2px;
  color: rgba(0,229,255,0.5);
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.12);
  border-radius: 3px;
  padding: 3px 8px;
  margin-top: 4px;
}
.yaml-panel-thumb {
  float: right;
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid rgba(167,139,250,0.3);
  margin-left: 6px;
}
.yaml-gen-from-story-btn {
  padding: 3px 9px;
  font-size: 10px;
  letter-spacing: 0.5px;
  font-family: inherit;
  background: rgba(0,229,255,0.06);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 4px;
  color: rgba(0,229,255,0.7);
  cursor: pointer;
  white-space: nowrap;
}
.yaml-gen-from-story-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.14);
  border-color: rgba(0,229,255,0.5);
  color: var(--cy);
}
.yaml-gen-from-story-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.session-btn {
  padding: 3px 8px;
  font-size: 10px;
  letter-spacing: 0.5px;
  font-family: inherit;
  background: rgba(255,255,255,0.035);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 4px;
  color: rgba(255,255,255,0.72);
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.45;
}
.session-btn:hover {
  background: rgba(0,229,255,0.10);
  border-color: rgba(0,229,255,0.38);
  color: var(--cy);
}
.session-btn.danger {
  color: rgba(251,113,133,0.85);
  border-color: rgba(244,63,94,0.25);
}
.session-btn.danger:hover {
  background: rgba(244,63,94,0.12);
  border-color: rgba(244,63,94,0.48);
  color: #fb7185;
}
.session-load-btn {
  display: inline-flex;
  align-items: center;
}
.yaml-panel-card { background: rgba(167,139,250,0.06); border: 1px solid rgba(167,139,250,0.2); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 4px; }
.yaml-panel-num { font-size: 10px; letter-spacing: 1.5px; color: rgba(167,139,250,0.7); }
.yaml-panel-scene { font-size: 11px; color: rgba(255,255,255,0.5); }
.yaml-panel-field-lbl { font-size: 9px; letter-spacing: 1.5px; color: rgba(255,255,255,0.3); margin-top: 4px; }
.yaml-panel-preview { max-height: 54px; overflow: hidden; white-space: pre-wrap; font-size: 11px; line-height: 1.45; color: rgba(255,255,255,0.68); background: rgba(0,0,0,0.18); border: 1px solid rgba(167,139,250,0.14); border-radius: 4px; padding: 6px 8px; }
.yaml-panel-prompt-preview { max-height: 76px; color: rgba(255,255,255,0.78); }
.yaml-panel-edit-btn { margin-top: 6px; align-self: flex-start; padding: 5px 12px; font-size: 11px; letter-spacing: 1px; font-family: inherit; color: rgba(0,229,255,0.9); background: rgba(0,229,255,0.08); border: 1px solid rgba(0,229,255,0.32); border-radius: 4px; cursor: pointer; transition: background 0.12s, color 0.12s, border-color 0.12s; }
.yaml-panel-edit-btn:hover { background: rgba(0,229,255,0.16); border-color: rgba(0,229,255,0.58); color: #67e8f9; }

.prompt-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  gap: 8px;
}

.prompt-hint {
  font-size: 13px;
  color: var(--muted);
  letter-spacing: 0.5px;
}

/* ── Generation controls (dropdown row) ── */
.gen-controls-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.gen-ctrl {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 90px;
}

.gen-ctrl-wide {
  flex: 1.4;
  min-width: 160px;
}

.gen-ctrl-label {
  font-size: 9px;
  letter-spacing: 1.2px;
  color: var(--muted);
  text-transform: uppercase;
  padding-left: 2px;
}

.gen-select {
  font-size: 13px;
  font-family: inherit;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 6px;
  color: var(--text);
  padding: 7px 10px;
  outline: none;
  cursor: pointer;
  width: 100%;
  transition: border-color 0.15s, background 0.15s;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238ab4c2' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
}

.gen-select:hover  { border-color: rgba(0,229,255,0.3); background-color: rgba(0,229,255,0.06); }
.gen-select:focus  { border-color: rgba(0,229,255,0.5); outline: none; }
.gen-select option { background: #040d1a; color: #cce8f0; }

.gen-select-pair {
  display: flex;
  gap: 6px;
}
.gen-select-pair .gen-select { flex: 1; min-width: 0; }

.image-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 0 12px 12px;
}

.media-tabs {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.media-tab {
  border: 1px solid var(--pborder);
  border-radius: 4px;
  background: rgba(255,255,255,0.03);
  color: var(--muted);
  padding: 4px 12px;
  font: inherit;
  font-size: 10px;
  letter-spacing: 1px;
  cursor: pointer;
}

.media-tab.active {
  color: var(--cyan);
  border-color: rgba(0,229,255,0.45);
  background: rgba(0,229,255,0.1);
}

.video-settings {
  padding-bottom: 12px;
}

.video-field,
.video-reference-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 12px 10px;
}

.video-prompt {
  width: 100%;
  resize: vertical;
  box-sizing: border-box;
  border: 1px solid var(--pborder);
  border-radius: 6px;
  background: rgba(0,229,255,0.04);
  color: var(--text);
  padding: 9px 10px;
  font: inherit;
  font-size: 12px;
  outline: none;
}

.video-prompt:focus {
  border-color: rgba(0,229,255,0.5);
}

.audio-toggle {
  min-height: 34px;
  border: 1px solid var(--pborder);
  border-radius: 6px;
  background: rgba(255,255,255,0.03);
  color: var(--muted);
  font: inherit;
  cursor: pointer;
}

.audio-toggle.active {
  color: #34d399;
  border-color: rgba(52,211,153,0.45);
  background: rgba(52,211,153,0.1);
}

.video-reference-upload {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  border: 1px dashed rgba(168,85,247,0.5);
  border-radius: 6px;
  color: #c4a7ff;
  background: rgba(168,85,247,0.08);
  font-size: 11px;
  letter-spacing: 0.7px;
  cursor: pointer;
}

.video-reference-upload input {
  display: none;
}

.video-reference-preview {
  display: grid;
  grid-template-columns: 52px 1fr auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.video-reference-preview img {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border: 1px solid var(--pborder);
  border-radius: 5px;
}

.video-reference-preview span {
  overflow: hidden;
  color: var(--text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-reference-preview button {
  border: 0;
  background: transparent;
  color: var(--red);
  font: inherit;
  font-size: 9px;
  cursor: pointer;
}

.video-generate-btn {
  width: calc(100% - 24px);
  margin: 0 12px;
  border: 1px solid rgba(168,85,247,0.5);
  border-radius: 6px;
  background: rgba(168,85,247,0.14);
  color: #d8c4ff;
  padding: 10px;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.8px;
  cursor: pointer;
}

.video-generate-btn:hover:not(:disabled) {
  background: rgba(168,85,247,0.22);
}

.video-generate-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

/* ── Generation mode badge ── */
.gen-mode-badge {
  font-size: 10px;
  letter-spacing: 0.6px;
  padding: 2px 8px;
  border-radius: 3px;
  border: 1px solid var(--pborder);
  color: var(--muted);
  background: rgba(255,255,255,0.03);
  white-space: nowrap;
  flex-shrink: 0;
}
.gen-mode-badge.is-i2i {
  color: #34d399;
  border-color: rgba(52,211,153,0.35);
  background: rgba(52,211,153,0.07);
}
.gen-mode-badge.is-video {
  color: var(--pu);
  border-color: rgba(168,85,247,0.35);
  background: rgba(168,85,247,0.07);
}
.gen-mode-badge.is-edit {
  color: #f97316;
  border-color: rgba(249,115,22,0.35);
  background: rgba(249,115,22,0.07);
}
.gen-mode-badge.is-batch {
  color: var(--gold);
  border-color: rgba(251,191,36,0.35);
  background: rgba(251,191,36,0.07);
}

.revised-prompt {
  margin-top: 12px;
  padding: 10px 12px;
  background: rgba(168,85,247,0.05);
  border: 1px solid rgba(168,85,247,0.2);
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text2);
}

.revised-lbl {
  color: rgba(168,85,247,0.7);
  font-size: 10px;
  letter-spacing: 1px;
}

/* ============================================================
   GENERATE BUTTON
   ============================================================ */
.gen-btn {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  font-size: 15px;
  font-family: inherit;
  letter-spacing: 2px;
  font-weight: 700;
  color: var(--cy);
  background: rgba(0,229,255,0.06);
  border: 1px solid rgba(0,229,255,0.4);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-shrink: 0;
}

.gen-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.12);
  box-shadow: 0 0 16px rgba(0,229,255,0.2);
}

.gen-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.gen-btn.generating {
  color: var(--pu);
  border-color: rgba(168,85,247,0.4);
  background: rgba(168,85,247,0.06);
}
.gen-btn.batch-active {
  color: var(--gold);
  border-color: rgba(251,191,36,0.5);
  background: rgba(251,191,36,0.06);
}
.gen-btn.batch-active:hover:not(:disabled) {
  background: rgba(251,191,36,0.14);
  box-shadow: 0 0 16px rgba(251,191,36,0.2);
}

.gen-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}

.gen-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--pu);
  animation: bounce 0.9s ease-in-out infinite;
}

.gen-dots span:nth-child(2) { animation-delay: 0.18s; }
.gen-dots span:nth-child(3) { animation-delay: 0.36s; }

/* ============================================================
   PREVIEW
   ============================================================ */
.preview-area {
  border: 1px solid var(--pborder);
  border-radius: 6px;
  background: rgba(0,229,255,0.02);
  overflow: hidden;
  width: 100%;
  height: clamp(280px, 46vh, 520px);
  min-height: 220px;
  max-height: 520px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-area.has-image { background: #000; }

.preview-img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  color: var(--muted);
  font-size: 16px;
  letter-spacing: 1px;
}

.send-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  flex-wrap: wrap;
}

.send-lbl {
  font-size: 14px;
  letter-spacing: 1px;
  color: var(--muted);
}

.send-btn {
  width: 34px;
  height: 34px;
  font-size: 15px;
  font-family: inherit;
  color: var(--cy);
  background: rgba(0,229,255,0.05);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s;
}

.send-btn:hover { background: rgba(0,229,255,0.15); }

/* ============================================================
   ERROR
   ============================================================ */
.error-bar {
  font-size: 16px;
  color: var(--red);
  background: rgba(244,63,94,0.07);
  border: 1px solid rgba(244,63,94,0.25);
  border-radius: 6px;
  padding: 12px 16px;
}

/* ============================================================
   COMIC GRID
   ============================================================ */
.comic-panel { flex: 1; display: flex; flex-direction: column; }

.comic-grid {
  flex: 1;
  display: grid;
  gap: 16px;
  min-height: 0;
  overflow: hidden;
}

.comic-slot {
  position: relative;
  border: 1px solid var(--pborder);
  border-radius: 6px;
  background: rgba(0,229,255,0.02);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: stretch;
  min-height: 160px;
  box-sizing: border-box;
}

.comic-slot:hover {
  border-color: rgba(0,229,255,0.35);
}

.comic-slot.active {
  border-color: var(--cy);
  box-shadow: 0 0 12px rgba(0,229,255,0.15);
}

.slot-num {
  position: absolute;
  top: 10px;
  left: 14px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--muted);
  z-index: 2;
}

.slot-img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  background: #000;
}

.slot-empty {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(2,9,18,0.93);
  backdrop-filter: blur(8px);
  border-top: 1px solid var(--pborder);
  padding: 12px;
  display: flex;
  gap: 8px;
  align-items: flex-end;
  z-index: 3;
}

.slot-input {
  flex: 1;
  font-size: 13px;
  font-family: inherit;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 4px;
  color: var(--text);
  padding: 8px 11px;
  outline: none;
  min-width: 0;
  resize: vertical;
  line-height: 1.4;
  box-sizing: border-box;
}

.slot-input::placeholder { color: var(--muted); }
.slot-input:focus { border-color: rgba(0,229,255,0.4); }

.slot-gen-btn, .slot-clr-btn {
  font-size: 15px;
  font-family: inherit;
  background: rgba(0,229,255,0.07);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 4px;
  color: var(--cy);
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.12s;
  flex-shrink: 0;
}

.slot-gen-btn:hover:not(:disabled) { background: rgba(0,229,255,0.15); }
.slot-gen-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.slot-dl-btn {
  font-size: 15px;
  text-decoration: none;
  background: rgba(0,229,255,0.07);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 4px;
  color: var(--cy);
  padding: 8px 12px;
  transition: background 0.12s;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
}

.slot-dl-btn:hover { background: rgba(0,229,255,0.15); }

.slot-clr-btn {
  color: var(--muted);
  border-color: transparent;
}
.slot-clr-btn:hover { color: var(--red); background: rgba(244,63,94,0.08); }

/* ── slot-controls: vertical layout ── */
.slot-controls {
  flex-direction: column;
  align-items: stretch;
}
.slot-ctrl-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.slot-btn-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}
.slot-dialogue-input {
  width: 100%;
  font-size: 13px;
  font-family: inherit;
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 4px;
  color: var(--text);
  padding: 7px 10px;
  outline: none;
  resize: vertical;
  line-height: 1.5;
  box-sizing: border-box;
  margin-bottom: 6px;
}
.slot-dialogue-input::placeholder { color: var(--muted); font-size: 12px; }
.slot-dialogue-input:focus { border-color: rgba(0,229,255,0.5); }

/* ── Panel Editor Modal ─────────────────────────────────────────────────────
   Fixed overlay; appears when user clicks a comic-slot in the grid.
   ── */
.pedit-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0,0,0,0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  backdrop-filter: blur(3px);
}

.pedit-modal {
  background: #141428;
  border: 1px solid rgba(0,229,255,0.2);
  border-radius: 10px;
  padding: 20px 22px;
  width: 90vw;
  max-width: 1600px;
  height: 92vh;
  max-height: 92vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
}

.pedit-hd {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.pedit-title {
  font-size: 13px;
  letter-spacing: 2.5px;
  color: var(--cy);
}

.pedit-page-lbl {
  font-size: 10px;
  color: rgba(255,255,255,0.3);
}

.pedit-img {
  width: 100%;
  min-height: 320px;
  max-height: 52vh;
  object-fit: contain;
  border-radius: 5px;
  background: rgba(0,0,0,0.35);
  display: block;
  flex: 0 1 52vh;
}

.pedit-img-empty {
  width: 100%;
  min-height: 320px;
  height: 38vh;
  max-height: 52vh;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(255,255,255,0.12);
  border-radius: 5px;
}

.pedit-img-empty-hint {
  font-size: 12px;
  color: rgba(255,255,255,0.28);
}

.pedit-field-lbl {
  font-size: 9px;
  letter-spacing: 2px;
  color: rgba(255,255,255,0.28);
  margin-top: 2px;
}

.pedit-textarea {
  width: 100%;
  font-size: 13px;
  color: rgba(255,255,255,0.85);
  font-family: 'Courier New', monospace;
  line-height: 1.5;
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(167,139,250,0.2);
  border-radius: 4px;
  padding: 8px 10px;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.12s;
}

.pedit-dialogue {
  border-color: rgba(0,229,255,0.18);
}

.pedit-negative {
  min-height: 54px;
  border-color: rgba(244,63,94,0.18);
}

.pedit-prompt {
  flex: 1 1 240px;
  min-height: 220px;
}

.pedit-scene-input {
  border-color: rgba(167,139,250,0.25);
}

.pedit-textarea:focus {
  border-color: rgba(0,229,255,0.45);
}

.pedit-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.05);
  flex-wrap: wrap;
}

.pedit-inline-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: -4px;
}

.pedit-bubble-btn {
  padding: 7px 14px;
  font-size: 12px;
  font-family: inherit;
  background: rgba(0,229,255,0.05);
  border: 1px solid rgba(0,229,255,0.22);
  border-radius: 4px;
  color: rgba(0,229,255,0.75);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.pedit-bubble-btn:hover {
  background: rgba(0,229,255,0.13);
  border-color: rgba(0,229,255,0.45);
}
.pedit-bubble-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pedit-gen-btn {
  padding: 8px 20px;
  font-size: 12px;
  letter-spacing: 1px;
  font-family: inherit;
  background: rgba(0,229,255,0.08);
  border: 1px solid rgba(0,229,255,0.35);
  border-radius: 4px;
  color: rgba(0,229,255,0.9);
  cursor: pointer;
  transition: background 0.12s;
}
.pedit-gen-btn:hover:not(:disabled) { background: rgba(0,229,255,0.18); }
.pedit-gen-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.pedit-save-btn {
  padding: 8px 18px;
  font-size: 12px;
  letter-spacing: 1px;
  font-family: inherit;
  font-weight: 700;
  background: rgba(52,211,153,0.12);
  border: 1px solid rgba(52,211,153,0.38);
  border-radius: 4px;
  color: rgba(134,239,172,0.95);
  cursor: pointer;
}
.pedit-save-btn:hover { background: rgba(52,211,153,0.22); }

.pedit-model-select {
  width: 100%;
}

.pedit-dl-btn {
  padding: 7px 12px;
  font-size: 12px;
  text-decoration: none;
  background: rgba(52,211,153,0.07);
  border: 1px solid rgba(52,211,153,0.22);
  border-radius: 4px;
  color: rgba(52,211,153,0.85);
  transition: background 0.12s;
}
.pedit-dl-btn:hover { background: rgba(52,211,153,0.18); }

.pedit-clr-btn {
  padding: 7px 10px;
  font-size: 12px;
  font-family: inherit;
  background: transparent;
  border: 1px solid rgba(244,63,94,0.18);
  border-radius: 4px;
  color: rgba(244,63,94,0.55);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.pedit-clr-btn:hover { background: rgba(244,63,94,0.09); color: #f87171; }

/* ── Large bubble editor modal ───────────────────────────────────────────── */
.bubble-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 620;
  background: rgba(0,0,0,0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  backdrop-filter: blur(4px);
}

.bubble-modal {
  width: 96vw;
  height: 94vh;
  max-width: 1800px;
  max-height: 94vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #101422;
  border: 1px solid rgba(0,229,255,0.28);
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: 0 12px 52px rgba(0,0,0,0.72);
  overflow: hidden;
}

.bubble-modal-hd,
.bubble-modal-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.bubble-modal-hd {
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}

.bubble-modal-title {
  font-size: 13px;
  letter-spacing: 2px;
  color: var(--cy);
}

.bubble-modal-hint {
  font-size: 11px;
  color: rgba(255,255,255,0.38);
}

.bubble-modal-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
  align-items: stretch;
  gap: 14px;
  padding: 8px;
  background: rgba(0,0,0,0.22);
  border-radius: 6px;
}

.bubble-canvas-wrap {
  position: relative;
  display: inline-block;
  width: fit-content;
  height: fit-content;
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  align-self: center;
  justify-self: center;
}

.bubble-side-editor {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(0,229,255,0.18);
  border-radius: 8px;
  background: rgba(2,9,18,0.68);
  overflow-y: auto;
}

.bubble-side-hd {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.bubble-side-title {
  font-size: 15px;
  letter-spacing: 1.4px;
  color: var(--cy);
}

.bubble-side-hint {
  font-size: 11px;
  color: rgba(204,232,240,0.42);
}

.bubble-side-textarea {
  min-height: 128px;
}

.bubble-side-select,
.bubble-side-size {
  width: 100%;
}

.bubble-side-bold {
  width: 42px;
  height: 34px;
}

.bubble-side-empty {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: rgba(204,232,240,0.52);
  font-size: 13px;
  line-height: 1.7;
  border: 1px dashed rgba(0,229,255,0.18);
  border-radius: 8px;
  padding: 16px;
}

.bubble-editor-img {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: calc(94vh - 132px);
  object-fit: contain;
  user-select: none;
  pointer-events: none;
}

.bubble-modal-actions {
  padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.07);
}

/* ── Bubble text editor ─────────────────────────────────────────────────────
   Regions are absolutely positioned over the image using normalized (0-1) coords.
   The ::before pseudo-element paints the white mask that covers the AI text.
   ── */
.bubble-region {
  position: absolute;
  z-index: 10;              /* well above bubble-edit-surface (3) */
  box-sizing: border-box;
  pointer-events: auto !important;
  cursor: pointer;
}
.comic-slot > .bubble-region {
  pointer-events: none !important;
}
.bubble-editor-region {
  pointer-events: auto !important;
}
/* Highlight selected region with cyan border */
.bubble-region.selected::before {
  border-color: rgba(0,229,255,0.85) !important;
  border-width: 2px !important;
  box-shadow: 0 0 0 1px rgba(0,229,255,0.3);
}
/* White mask that hides the AI-generated text beneath */
.bubble-region::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.96);
  border: 1.8px solid rgba(0,0,0,0.72);
  border-radius: 999px;
  pointer-events: none;
}
.bubble-region::after {
  content: '';
  position: absolute;
  left: 46%;
  bottom: -14%;
  width: 22%;
  height: 22%;
  background: rgba(255,255,255,0.96);
  border-right: 1.8px solid rgba(0,0,0,0.72);
  border-bottom: 1.8px solid rgba(0,0,0,0.72);
  transform: rotate(34deg);
  pointer-events: none;
  z-index: 0;
}
.bubble-region-move {
  position: absolute;
  top: -11px;
  left: -11px;
  z-index: 3;
  width: 22px;
  height: 22px;
  border: 1px solid rgba(0,229,255,0.65);
  border-radius: 50%;
  background: rgba(2,9,18,0.92);
  color: var(--cy);
  font-size: 11px;
  line-height: 1;
  cursor: move;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
/* Textarea fills the masked area in edit mode */
.bubble-region-input {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  color: #111;
  line-height: 1.5;
  padding: 4px 6px;
  box-sizing: border-box;
  cursor: text;
}
.bubble-region-input::placeholder { color: rgba(0,0,0,0.3); font-size: 11px; }
/* Delete button in the corner of each region */
.bubble-region-del {
  position: absolute;
  top: -10px;
  right: -10px;
  z-index: 2;
  width: 20px;
  height: 20px;
  background: #f43f5e;
  border: none;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
/* Preview: styled text displayed over the white mask */
.bubble-region-text {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #111;
  line-height: 1.5;
  padding: 4px 6px;
  box-sizing: border-box;
  white-space: pre-line;
  overflow: hidden;
  cursor: move;
  user-select: none;
}
/* Invisible drag surface — sits below regions so they remain clickable */
.bubble-edit-surface {
  position: absolute;
  inset: 0;
  z-index: 3;       /* well below .bubble-region (z-index 10) */
  cursor: crosshair;
  pointer-events: auto;
}
/* Dashed rect shown while the user is dragging to define a region */
.drag-preview {
  position: absolute;
  z-index: 7;
  border: 2px dashed #00e5ff;
  background: rgba(0,229,255,0.08);
  border-radius: 2px;
  pointer-events: none;
}
/* Confirm bake button floated over image in edit mode */
.bake-all-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  z-index: 8;
  padding: 5px 13px;
  font-size: 12px;
  letter-spacing: 0.5px;
  font-family: inherit;
  background: rgba(167,139,250,0.9);
  border: 1px solid rgba(167,139,250,0.6);
  border-radius: 5px;
  color: #fff;
  cursor: pointer;
  transition: background 0.12s;
}
.bake-all-btn:hover { background: rgba(167,139,250,1); }
/* Toggle button inside slot-controls that enters bubble-edit mode */
.bubble-edit-toggle-btn {
  width: 100%;
  padding: 5px 10px;
  margin-bottom: 6px;
  font-size: 11px;
  letter-spacing: 0.5px;
  font-family: inherit;
  background: rgba(0,229,255,0.06);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 4px;
  color: rgba(0,229,255,0.7);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.bubble-edit-toggle-btn:hover,
.bubble-edit-toggle-btn.active {
  background: rgba(0,229,255,0.14);
  border-color: rgba(0,229,255,0.5);
  color: var(--cy);
}

/* ── Manga text overlay (kept for backward-compat, currently unused) ── */
.slot-overlay-text {
  position: absolute;
  left: 0;
  right: 0;
  color: #fff;
  line-height: 1.6;
  white-space: pre-line;
  z-index: 2;
  pointer-events: none;
  text-shadow: 0 1px 5px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.7);
  letter-spacing: 0.04em;
  padding: 10px 13px;
}
.slot-overlay-text.pos-top {
  top: 0;
  bottom: auto;
  background: linear-gradient(to bottom, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.45) 65%, transparent 100%);
  padding-top: 13px;
}
.slot-overlay-text.pos-center {
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0,0,0,0.72);
}
.slot-overlay-text.pos-bottom {
  bottom: 0;
  top: auto;
  background: linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.45) 65%, transparent 100%);
  padding-bottom: 13px;
}

/* ── Speech bubble overlay (SB mode) ── */
.slot-overlay-text.sb-bubble {
  color: #111;
  text-shadow: none;
  letter-spacing: 0.05em;
  margin: 6px;
  left: 6px;
  right: 6px;
  border-radius: 8px;
}
.slot-overlay-text.sb-bubble.pos-top {
  background: rgba(255,255,255,0.94);
  border: 2px solid rgba(0,0,0,0.72);
  top: 6px;
}
.slot-overlay-text.sb-bubble.pos-center {
  background: rgba(255,255,255,0.94);
  border: 2px solid rgba(0,0,0,0.72);
  transform: translateY(-50%);
}
.slot-overlay-text.sb-bubble.pos-bottom {
  background: rgba(255,255,255,0.94);
  border: 2px solid rgba(0,0,0,0.72);
  bottom: 6px;
}

/* ── Font toolbar ── */
.font-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0 12px;
  border-bottom: 1px solid var(--pborder);
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.font-toolbar-lbl {
  font-size: 10px;
  letter-spacing: 1.5px;
  color: var(--muted);
  text-transform: uppercase;
  flex-shrink: 0;
}
.font-select {
  font-size: 12px;
  font-family: inherit;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 4px;
  color: var(--text2);
  padding: 3px 8px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}
.font-select:focus { border-color: rgba(0,229,255,0.4); }
.overlay-size-input {
  width: 52px;
  font-size: 12px;
  font-family: inherit;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 4px;
  color: var(--text2);
  padding: 3px 6px;
  outline: none;
  text-align: center;
  transition: border-color 0.15s;
}
.overlay-size-input:focus { border-color: rgba(0,229,255,0.4); }
.font-size-unit {
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
}
.bold-toggle {
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 4px;
  color: var(--muted);
  padding: 3px 10px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.bold-toggle.active {
  background: rgba(0,229,255,0.12);
  color: var(--cy);
  border-color: rgba(0,229,255,0.4);
}
.bake-all-panels-btn {
  margin-left: auto;
  padding: 3px 10px;
  font-size: 11px;
  font-family: inherit;
  background: rgba(167,139,250,0.12);
  border: 1px solid rgba(167,139,250,0.4);
  border-radius: 4px;
  color: rgba(167,139,250,0.9);
  cursor: pointer;
  white-space: nowrap;
}
.bake-all-panels-btn:hover {
  background: rgba(167,139,250,0.25);
  color: #fff;
}
.sb-toggle {
  font-size: 11px;
  letter-spacing: 0.5px;
  font-family: inherit;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 4px;
  color: var(--muted);
  padding: 3px 9px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  white-space: nowrap;
}
.sb-toggle.active {
  background: rgba(0,229,255,0.14);
  color: var(--cy);
  border-color: rgba(0,229,255,0.45);
}
.dialogue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.dialogue-label {
  font-size: 10px;
  letter-spacing: 1px;
  color: var(--muted);
  text-transform: uppercase;
}
.dialogue-pos-btns {
  display: flex;
  gap: 3px;
}
.pos-btn {
  font-size: 12px;
  font-family: inherit;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 3px;
  color: var(--muted);
  padding: 2px 7px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
  line-height: 1;
}
.pos-btn.active {
  background: rgba(0,229,255,0.12);
  color: var(--cy);
  border-color: rgba(0,229,255,0.4);
}
.bake-btn {
  width: 100%;
  margin-top: 4px;
  padding: 5px 10px;
  font-size: 11px;
  letter-spacing: 0.5px;
  font-family: inherit;
  background: rgba(167,139,250,0.1);
  border: 1px solid rgba(167,139,250,0.3);
  border-radius: 4px;
  color: rgba(167,139,250,0.9);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.bake-btn:hover:not(:disabled) {
  background: rgba(167,139,250,0.22);
  border-color: rgba(167,139,250,0.55);
  color: #c4b5fd;
}
.bake-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.export-hint {
  margin-top: 16px;
  font-size: 13px;
  letter-spacing: 0.5px;
  color: var(--muted);
  text-align: center;
}

/* ============================================================
   LAYOUT SELECTOR
   ============================================================ */
.layout-selector {
  display: flex;
  gap: 4px;
  align-items: center;
  flex: 1;
  padding: 0 10px;
  overflow-x: auto;
}

.layout-btn {
  font-size: 12px;
  font-family: inherit;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--pborder);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  letter-spacing: 0.5px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.layout-btn:hover { color: var(--cy); border-color: rgba(0,229,255,0.3); }
.layout-btn.active {
  color: var(--cy);
  border-color: rgba(0,229,255,0.5);
  background: rgba(0,229,255,0.08);
}

/* ── COMIC SETTINGS panel (left sidebar) ── */
.comic-settings-panel { padding-bottom: 4px; }
.cs-layout-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px 12px;
}
.cs-layout-btn { flex: 1; min-width: 56px; text-align: center; }

/* ── COMIC PANELS: current layout badge ── */
.cp-layout-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(0,229,255,0.06);
  border: 1px solid rgba(0,229,255,0.18);
  color: rgba(0,229,255,0.65);
  white-space: nowrap;
  letter-spacing: 0.5px;
}

/* ── COMIC PANELS: GENERATE ALL button ── */
.cp-gen-all-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 14px;
  font-size: 11px;
  letter-spacing: 1px;
  font-family: inherit;
  background: rgba(0,229,255,0.08);
  border: 1px solid rgba(0,229,255,0.35);
  border-radius: 4px;
  color: rgba(0,229,255,0.9);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s, border-color 0.12s;
}
.cp-gen-all-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.18);
  border-color: rgba(0,229,255,0.6);
}
.cp-gen-all-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ============================================================
   PAGE TABS
   ============================================================ */
.page-tabs {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--pborder);
}

.page-tab {
  font-size: 12px;
  font-family: inherit;
  padding: 5px 12px;
  border-radius: 4px;
  border: 1px solid var(--pborder);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  letter-spacing: 1.5px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.page-tab:hover { color: var(--text2); background: rgba(0,229,255,0.04); }

.page-tab.active {
  color: var(--cy);
  border-color: rgba(0,229,255,0.5);
  background: rgba(0,229,255,0.08);
}

.tab-result-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cy);
  box-shadow: 0 0 8px rgba(0,229,255,0.75);
}

.tab-del {
  font-size: 10px;
  color: var(--muted);
  padding: 1px 4px;
  border-radius: 2px;
  line-height: 1;
  transition: color 0.1s;
}

.tab-del:hover { color: var(--red); }

.page-tab-add {
  font-size: 12px;
  font-family: inherit;
  padding: 5px 12px;
  border-radius: 4px;
  border: 1px dashed var(--pborder);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  letter-spacing: 0.5px;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
}

.page-tab-add:hover {
  color: var(--cy);
  border-color: rgba(0,229,255,0.4);
  background: rgba(0,229,255,0.04);
}

.add-panel-btn {
  font-size: 14px;
  font-family: inherit;
  letter-spacing: 1px;
  color: var(--muted);
  background: rgba(0,229,255,0.02);
  border: 1px dashed var(--pborder);
  border-radius: 6px;
  cursor: pointer;
  min-height: 100px;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-panel-btn:hover {
  color: var(--cy);
  border-color: rgba(0,229,255,0.4);
  background: rgba(0,229,255,0.05);
}

.slot-remove-btn {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 12px;
  color: var(--muted);
  background: rgba(2,9,18,0.7);
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: pointer;
  padding: 2px 6px;
  z-index: 3;
  line-height: 1;
  transition: color 0.1s, background 0.1s;
}

.slot-remove-btn:hover {
  color: var(--red);
  background: rgba(244,63,94,0.1);
  border-color: rgba(244,63,94,0.25);
}

.slot-save-btn {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 4;
  font-size: 9px;
  font-family: inherit;
  letter-spacing: 0.8px;
  line-height: 1;
  color: rgba(0,229,255,0.82);
  background: rgba(2,9,18,0.78);
  border: 1px solid rgba(0,229,255,0.24);
  border-radius: 4px;
  padding: 5px 7px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s, background 0.12s, border-color 0.12s;
}

.comic-slot:hover .slot-save-btn,
.comic-slot.active .slot-save-btn {
  opacity: 1;
}

.slot-save-btn:hover {
  background: rgba(0,229,255,0.14);
  border-color: rgba(0,229,255,0.44);
}

.panel-save-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 4px;
}

/* ============================================================
   HISTORY GALLERY
   ============================================================ */
.hist-gallery {
  flex-shrink: 0;
  margin-top: 16px;
}

.hist-count {
  font-size: 11px;
  color: var(--muted);
  margin-left: 6px;
}

.hist-empty {
  font-size: 14px;
  color: var(--muted);
  text-align: center;
  padding: 20px 0;
  letter-spacing: 0.5px;
}

.hist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.hist-item {
  position: relative;
  border: 1px solid var(--pborder);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: rgba(0,229,255,0.02);
}

.hist-item:hover {
  border-color: rgba(0,229,255,0.4);
  box-shadow: 0 0 10px rgba(0,229,255,0.1);
}

.hist-thumb-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
}

.hist-thumb {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hist-time {
  position: absolute;
  bottom: 4px;
  right: 6px;
  font-size: 10px;
  color: var(--text2);
  background: rgba(2,9,18,0.75);
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.5px;
}

.hist-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 5px;
  background: rgba(2,9,18,0.55);
  overflow: hidden;
}

.ha-btn {
  font-size: 12px;
  font-family: inherit;
  padding: 2px 5px;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  border: 1px solid transparent;
  background: transparent;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
}

.ha-preview { color: var(--cy); border-color: rgba(0,229,255,0.2); }
.ha-preview:hover { background: rgba(0,229,255,0.15); }

.ha-regen { color: var(--pu); border-color: rgba(168,85,247,0.2); }
.ha-regen:hover { background: rgba(168,85,247,0.15); }
.ha-regen:disabled { opacity: 0.35; cursor: not-allowed; }

.ha-panel { color: var(--text2); border-color: rgba(255,255,255,0.1); }
.ha-panel:hover { background: rgba(255,255,255,0.08); color: var(--cy); }

.ha-del { color: var(--muted); }
.ha-del:hover { color: var(--red); }

.ha-sep {
  width: 1px;
  height: 14px;
  background: var(--pborder);
  flex-shrink: 0;
  margin: 0 2px;
}

/* ============================================================
   SPINNER / ANIMATIONS
   ============================================================ */
.spinner {
  width: 22px;
  height: 22px;
  border: 2px solid var(--cy-dim);
  border-top-color: var(--cy);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner.sm {
  width: 16px;
  height: 16px;
  border-width: 1.5px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0);    opacity: 0.6; }
  50%       { transform: translateY(-5px); opacity: 1; }
}

/* ============================================================
   IMPORT BANNERS
   ============================================================ */
.manga-import-banner,
.diary-import-banner {
  position: fixed;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  padding: 7px 22px;
  border-radius: 6px;
  font-size: 12px;
  letter-spacing: 1.2px;
  font-weight: 600;
  z-index: 300;
  pointer-events: none;
  white-space: nowrap;
}

.manga-import-banner {
  background: rgba(168,85,247,0.1);
  border: 1px solid rgba(168,85,247,0.45);
  color: var(--pu);
}

.diary-import-banner {
  background: rgba(52,211,153,0.08);
  border: 1px solid rgba(52,211,153,0.4);
  color: #34d399;
}

.yaml-import-banner {
  background: rgba(0,229,255,0.07);
  border: 1px solid rgba(0,229,255,0.4);
  color: #00e5ff;
}

/* ============================================================
   ONE PANEL PRO MODE
   ============================================================ */
.pro-panel {
  flex-shrink: 0;
  border-color: rgba(168,85,247,0.2);
  background: rgba(168,85,247,0.025);
  transition: border-color 0.2s, background 0.2s;
}
.pro-panel.pro-active {
  border-color: rgba(168,85,247,0.45);
  background: rgba(168,85,247,0.04);
  box-shadow: 0 0 20px rgba(168,85,247,0.08) inset;
}

.pro-hd { user-select: none; }

.pro-hex {
  color: var(--pu);
  font-size: 10px;
  opacity: 0.8;
}

.pro-label {
  color: var(--pu) !important;
  letter-spacing: 2px;
}

.pro-on-badge {
  font-size: 8px;
  letter-spacing: 2px;
  font-weight: 700;
  color: var(--pu);
  background: rgba(168,85,247,0.15);
  border: 1px solid rgba(168,85,247,0.4);
  border-radius: 3px;
  padding: 1px 6px;
  animation: pro-pulse 2s ease-in-out infinite;
}
@keyframes pro-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

.pro-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.pro-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pro-section-hd {
  font-size: 9px;
  letter-spacing: 2px;
  color: rgba(168,85,247,0.7);
  font-weight: 700;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(168,85,247,0.12);
}

.pro-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.pro-chip {
  font-size: 10px;
  letter-spacing: 0.8px;
  font-family: inherit;
  padding: 4px 9px;
  border-radius: 3px;
  border: 1px solid rgba(168,85,247,0.2);
  background: rgba(168,85,247,0.04);
  color: var(--text2);
  cursor: pointer;
  transition: color 0.12s, background 0.12s, border-color 0.12s, box-shadow 0.12s;
  line-height: 1.3;
}
.pro-chip:hover {
  color: var(--pu);
  border-color: rgba(168,85,247,0.45);
  background: rgba(168,85,247,0.1);
}
.pro-chip.active {
  color: var(--pu);
  background: rgba(168,85,247,0.18);
  border-color: rgba(168,85,247,0.7);
  box-shadow: 0 0 8px rgba(168,85,247,0.25);
  font-weight: 600;
}

/* Style chips use gold accent, lighting chips use amber */
.pro-chip-style.active {
  color: var(--gold);
  background: rgba(251,191,36,0.12);
  border-color: rgba(251,191,36,0.5);
  box-shadow: 0 0 8px rgba(251,191,36,0.18);
}
.pro-chip-style:hover {
  color: var(--gold);
  border-color: rgba(251,191,36,0.4);
  background: rgba(251,191,36,0.07);
}
.pro-chip-light.active {
  color: #fb923c;
  background: rgba(251,146,60,0.12);
  border-color: rgba(251,146,60,0.5);
  box-shadow: 0 0 8px rgba(251,146,60,0.18);
}
.pro-chip-light:hover {
  color: #fb923c;
  border-color: rgba(251,146,60,0.4);
  background: rgba(251,146,60,0.07);
}

.pro-preview {
  border: 1px solid rgba(168,85,247,0.18);
  border-radius: 4px;
  background: rgba(168,85,247,0.04);
  overflow: hidden;
}
.pro-preview-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 9px;
  border-bottom: 1px solid rgba(168,85,247,0.12);
  background: rgba(168,85,247,0.06);
}
.pro-preview-lbl {
  font-size: 8px;
  letter-spacing: 2px;
  color: rgba(168,85,247,0.7);
  font-weight: 700;
}
.pro-tag-count {
  font-size: 9px;
  color: var(--muted);
  letter-spacing: 0.5px;
}
.pro-preview-text {
  padding: 8px 9px;
  font-size: 10px;
  color: var(--text2);
  line-height: 1.6;
  letter-spacing: 0.3px;
  word-break: break-all;
  max-height: 90px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--dim) transparent;
}

.pro-gen-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: rgba(168,85,247,0.1);
  border: 1px solid rgba(168,85,247,0.35);
  border-radius: 5px;
  color: var(--pu);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 2px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, color 0.15s;
}
.pro-gen-btn:hover:not(:disabled) {
  background: rgba(168,85,247,0.2);
  border-color: rgba(168,85,247,0.65);
  box-shadow: 0 0 18px rgba(168,85,247,0.3);
  color: #c084fc;
}
.pro-gen-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.pro-gen-btn.generating {
  color: var(--cy);
  border-color: rgba(0,229,255,0.3);
  background: rgba(0,229,255,0.05);
  cursor: not-allowed;
}

/* ── Pro Presets ─────────────────────────────────────────── */
.pro-preset-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.pro-preset-item {
  display: flex;
  align-items: center;
  gap: 0;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid rgba(0,229,255,0.2);
  background: rgba(0,229,255,0.04);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.pro-preset-item:hover {
  border-color: rgba(0,229,255,0.45);
  box-shadow: 0 0 8px rgba(0,229,255,0.12);
}
.pro-preset-item.is-default {
  border-color: rgba(168,85,247,0.2);
  background: rgba(168,85,247,0.04);
}
.pro-preset-item.is-default:hover {
  border-color: rgba(168,85,247,0.5);
  box-shadow: 0 0 8px rgba(168,85,247,0.15);
}

.pro-preset-btn {
  font-size: 10px;
  letter-spacing: 0.8px;
  font-family: inherit;
  font-weight: 600;
  padding: 4px 10px;
  background: transparent;
  border: none;
  color: var(--cy);
  cursor: pointer;
  transition: color 0.12s, background 0.12s;
  white-space: nowrap;
  line-height: 1.3;
}
.pro-preset-item.is-default .pro-preset-btn {
  color: var(--pu);
}
.pro-preset-btn:hover {
  background: rgba(0,229,255,0.08);
}
.pro-preset-item.is-default .pro-preset-btn:hover {
  background: rgba(168,85,247,0.1);
}

.pro-preset-del {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 100%;
  min-height: 26px;
  background: transparent;
  border: none;
  border-left: 1px solid rgba(0,229,255,0.15);
  color: var(--muted);
  font-size: 9px;
  cursor: pointer;
  transition: color 0.12s, background 0.12s;
  flex-shrink: 0;
}
.pro-preset-del:hover {
  color: #f87171;
  background: rgba(248,113,113,0.1);
}

.pro-preset-save-row {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.pro-preset-name-input {
  flex: 1;
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.18);
  border-radius: 3px;
  color: var(--text);
  font-size: 11px;
  font-family: inherit;
  padding: 5px 8px;
  outline: none;
  transition: border-color 0.15s;
  min-width: 0;
}
.pro-preset-name-input:focus {
  border-color: rgba(0,229,255,0.4);
  box-shadow: 0 0 6px rgba(0,229,255,0.08);
}
.pro-preset-name-input::placeholder { color: var(--muted); font-size: 10px; }

.pro-preset-save-btn {
  font-size: 10px;
  letter-spacing: 1.2px;
  font-family: inherit;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 3px;
  border: 1px solid rgba(0,229,255,0.3);
  background: rgba(0,229,255,0.07);
  color: var(--cy);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
}
.pro-preset-save-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.14);
  border-color: rgba(0,229,255,0.55);
  box-shadow: 0 0 8px rgba(0,229,255,0.18);
}
.pro-preset-save-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ============================================================
   DIARY PANEL (current entry + mood + generate)
   ============================================================ */
.diary-panel {
  flex-shrink: 0;
  border-color: rgba(52,211,153,0.3);
  background: rgba(52,211,153,0.03);
}

.diary-label {
  color: #34d399 !important;
}

.diary-date-badge {
  font-size: 9px;
  letter-spacing: 1px;
  color: rgba(52,211,153,0.7);
  background: rgba(52,211,153,0.08);
  border: 1px solid rgba(52,211,153,0.2);
  border-radius: 3px;
  padding: 1px 7px;
  margin-left: 4px;
}

.diary-text {
  font-size: 12px;
  line-height: 1.75;
  color: var(--text2);
  padding: 6px 2px 4px;
  white-space: pre-wrap;
  word-break: break-all;
}

/* Mood selector */
.mood-row {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  padding: 6px 0 2px;
  border-top: 1px solid rgba(52,211,153,0.1);
}

.mood-lbl {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: rgba(52,211,153,0.55);
  flex-shrink: 0;
  margin-right: 2px;
}

.mood-chip {
  padding: 2px 8px;
  font-size: 10px;
  font-family: inherit;
  letter-spacing: 0.5px;
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--pborder);
  border-radius: 3px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.mood-chip:hover {
  color: var(--mc, #34d399);
  border-color: var(--mc, #34d399);
  background: color-mix(in srgb, var(--mc, #34d399) 8%, transparent);
}

.mood-chip.active {
  color: var(--mc, #34d399);
  background: color-mix(in srgb, var(--mc, #34d399) 12%, transparent);
  border-color: var(--mc, #34d399);
  box-shadow: 0 0 6px color-mix(in srgb, var(--mc, #34d399) 30%, transparent);
}

/* Diary generate button */
.diary-gen-btn {
  width: 100%;
  height: 40px;
  margin-top: 8px;
  padding: 0 16px;
  font-size: 13px;
  font-family: inherit;
  letter-spacing: 1.5px;
  font-weight: 700;
  color: #34d399;
  background: rgba(52,211,153,0.06);
  border: 1px solid rgba(52,211,153,0.4);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
}

.diary-gen-btn:hover:not(:disabled) {
  background: rgba(52,211,153,0.12);
  box-shadow: 0 0 14px rgba(52,211,153,0.2);
}

.diary-gen-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.diary-gen-btn.generating {
  color: var(--pu);
  border-color: rgba(168,85,247,0.4);
  background: rgba(168,85,247,0.06);
}

/* ============================================================
   DIARY HISTORY PANEL
   ============================================================ */
.dh-panel {
  flex-shrink: 0;
  margin-top: 12px;
}

.dh-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0 12px;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.5px;
}

.dh-empty-icon {
  font-size: 22px;
  opacity: 0.4;
}

.dh-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
}

.dh-card {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid var(--pborder);
  border-radius: 6px;
  background: rgba(0,229,255,0.02);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  position: relative;
}

.dh-card:hover {
  border-color: rgba(52,211,153,0.35);
  background: rgba(52,211,153,0.03);
}

.dh-card.active {
  border-color: rgba(52,211,153,0.5);
  background: rgba(52,211,153,0.05);
  box-shadow: 0 0 8px rgba(52,211,153,0.1);
}

.dh-card-thumb {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--pborder);
  background: rgba(0,5,18,0.6);
}

.dh-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dh-no-thumb {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  opacity: 0.3;
}

.dh-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.dh-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dh-date {
  font-size: 10px;
  letter-spacing: 0.8px;
  color: var(--text2);
}

.dh-mood-badge {
  font-size: 9px;
  letter-spacing: 0.5px;
  padding: 1px 6px;
  border-radius: 3px;
  color: var(--mc, #34d399);
  background: color-mix(in srgb, var(--mc, #34d399) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--mc, #34d399) 25%, transparent);
}

.dh-excerpt {
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted);
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dh-del-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 9px;
  color: var(--muted);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 2px;
  line-height: 1;
  transition: color 0.12s, background 0.12s;
  opacity: 0;
}

.dh-card:hover .dh-del-btn {
  opacity: 1;
}

.dh-del-btn:hover {
  color: rgba(244,63,94,0.9);
  background: rgba(244,63,94,0.1);
}

/* ============================================================
   CHARACTER ASSET SYSTEM
   ============================================================ */
.assets-panel {
  flex-shrink: 0;
}

.assets-hd-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.atab-bar {
  display: flex;
  gap: 2px;
}

.atab {
  padding: 2px 7px;
  font-size: 10px;
  font-family: inherit;
  letter-spacing: 0.8px;
  font-weight: 600;
  color: var(--text2);
  background: transparent;
  border: 1px solid var(--pborder);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.atab:hover {
  color: var(--cy);
  border-color: rgba(0,229,255,0.3);
}

.atab.active {
  color: var(--cy);
  background: rgba(0,229,255,0.08);
  border-color: rgba(0,229,255,0.45);
}

.asset-loading,
.asset-hint {
  font-size: 12px;
  color: var(--muted);
  padding: 10px 4px;
  letter-spacing: 0.5px;
}

.asset-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 4px;
}

.asset-section-lbl {
  font-size: 10px;
  letter-spacing: 1px;
  color: var(--muted);
  text-transform: uppercase;
}

.asset-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.asset-chip {
  padding: 3px 10px;
  font-size: 11px;
  font-family: inherit;
  letter-spacing: 0.6px;
  color: var(--text2);
  background: rgba(168,85,247,0.05);
  border: 1px solid rgba(168,85,247,0.2);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.asset-chip:hover {
  color: var(--pu);
  background: rgba(168,85,247,0.12);
  border-color: rgba(168,85,247,0.45);
}

.asset-chip.selected {
  color: var(--cy);
  background: rgba(0,229,255,0.08);
  border-color: rgba(0,229,255,0.5);
}

.char-prompt-preview {
  font-size: 10px;
  color: var(--muted);
  background: rgba(0,229,255,0.03);
  border: 1px solid rgba(0,229,255,0.1);
  border-radius: 4px;
  padding: 5px 8px;
  line-height: 1.5;
  letter-spacing: 0.3px;
}

/* ============================================================
   REFERENCE IMAGE SYSTEM
   ============================================================ */

.ref-active-badge {
  font-size: 8px;
  letter-spacing: 1.5px;
  color: var(--cy);
  background: rgba(0,229,255,0.1);
  border: 1px solid rgba(0,229,255,0.3);
  border-radius: 3px;
  padding: 1px 6px;
  margin-left: 6px;
  animation: pulse-ref 2s ease-in-out infinite;
}

@keyframes pulse-ref {
  0%, 100% { opacity: 0.7; }
  50%       { opacity: 1;   }
}

.char-lib {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 12px;
  padding: 9px 10px;
  border: 1px solid rgba(0,229,255,0.14);
  border-radius: 6px;
  background: rgba(0,229,255,0.025);
}

.char-lib-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.char-lib-title {
  font-size: 10px;
  letter-spacing: 1.6px;
  color: rgba(0,229,255,0.72);
  font-weight: 700;
}

.char-lib-count {
  font-size: 9px;
  color: var(--muted);
  letter-spacing: 0.8px;
}

.char-lib-save-row {
  display: flex;
  gap: 6px;
}

.char-lib-name-input {
  flex: 1;
  min-width: 0;
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.16);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 5px 8px;
  outline: none;
}
.char-lib-name-input:focus {
  border-color: rgba(0,229,255,0.42);
}
.char-lib-name-input::placeholder {
  color: var(--muted);
  opacity: 0.75;
}

.char-lib-save-btn {
  flex-shrink: 0;
  font-size: 10px;
  font-family: inherit;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--cy);
  background: rgba(0,229,255,0.07);
  border: 1px solid rgba(0,229,255,0.28);
  border-radius: 4px;
  padding: 5px 10px;
  cursor: pointer;
}
.char-lib-save-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.14);
  border-color: rgba(0,229,255,0.48);
}
.char-lib-save-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.char-lib-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.char-lib-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 5px;
  background: rgba(0,5,18,0.32);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.char-lib-item:hover {
  background: rgba(0,229,255,0.06);
  border-color: rgba(0,229,255,0.24);
}

.char-lib-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.char-lib-item-name {
  font-size: 11px;
  color: var(--text2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.char-lib-item-meta,
.char-lib-item-date {
  font-size: 9px;
  color: var(--muted);
  white-space: nowrap;
}
.char-lib-del {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: rgba(255,255,255,0.34);
  font-size: 10px;
  cursor: pointer;
}
.char-lib-del:hover {
  color: #f87171;
  background: rgba(248,113,113,0.1);
}

.ref-slots {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0 4px;
}

.ref-add-top-btn,
.ref-add-empty-btn {
  font-size: 10px;
  font-family: inherit;
  letter-spacing: 0.8px;
  color: rgba(0,229,255,0.75);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 4px;
  padding: 4px 9px;
  cursor: pointer;
  background: rgba(0,229,255,0.05);
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.ref-add-top-btn:hover,
.ref-add-empty-btn:hover {
  background: rgba(0,229,255,0.12);
  color: var(--cy);
  border-color: rgba(0,229,255,0.45);
}
.ref-add-empty-btn {
  width: 100%;
  min-height: 38px;
  border-style: dashed;
}

.ref-slot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: clamp(120px, calc(50% - 5px), 148px);
  min-width: 120px;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid rgba(0,229,255,0.14);
  border-radius: 8px;
  background: rgba(0,229,255,0.025);
}

.ref-slot-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ref-slot-label {
  font-size: 11px;
  letter-spacing: 1.4px;
  color: var(--cy);
  opacity: 0.78;
}

.ref-clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  min-width: 24px;
  flex-shrink: 0;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  color: rgba(255,255,255,0.5);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
  transition: color 0.15s, background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.ref-clear-btn:hover {
  color: #f87171;
  background: rgba(248,113,113,0.12);
  border-color: rgba(248,113,113,0.4);
  box-shadow: 0 0 6px rgba(248,113,113,0.2);
}

.ref-thumb-wrap {
  width: 100%;
  height: 112px;
  overflow: hidden;
  border-radius: 7px;
  border: 1px solid rgba(0,229,255,0.18);
  background: rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.ref-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ref-fname {
  font-size: 8.5px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.3px;
}

.ref-name-input,
.ref-label-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.15);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.35;
  padding: 5px 7px;
  outline: none;
  resize: none;
  transition: border-color 0.15s;
}
.ref-label-input:focus {
  border-color: rgba(0,229,255,0.45);
  background: rgba(0,229,255,0.07);
}
.ref-name-input {
  border-color: rgba(255,255,255,0.1);
  color: var(--text2);
  font-size: 13px;
}
.ref-name-input:focus {
  border-color: rgba(167,139,250,0.45);
  background: rgba(167,139,250,0.06);
}
.ref-label-input::placeholder { color: var(--muted); opacity: 0.7; }

.ref-upload-area {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 92px;
  border: 1px dashed rgba(0,229,255,0.22);
  border-radius: 7px;
  background: rgba(0,229,255,0.02);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  box-sizing: border-box;
  padding: 10px;
}
.ref-upload-area:hover {
  background: rgba(0,229,255,0.07);
  border-color: rgba(0,229,255,0.45);
}

.ref-upload-icon {
  font-size: 20px;
  color: rgba(0,229,255,0.35);
  line-height: 1;
}

.ref-upload-hint {
  font-size: 11px;
  line-height: 1.35;
  color: var(--muted);
  letter-spacing: 0.5px;
  text-align: left;
}
.ref-upload-hint-sub {
  font-size: 10px;
  opacity: 0.6;
}

.ref-img-count {
  font-size: 8px;
  letter-spacing: 0.5px;
  color: var(--cy);
  background: rgba(0,229,255,0.1);
  border: 1px solid rgba(0,229,255,0.2);
  border-radius: 3px;
  padding: 1px 5px;
  margin-right: auto;
}

.ref-hires-badge {
  font-size: 8px;
  letter-spacing: 1px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(52,211,153,0.12);
  border: 1px solid rgba(52,211,153,0.35);
  color: rgba(52,211,153,0.9);
}
.ref-thumb-only-badge {
  font-size: 8px;
  letter-spacing: 0.3px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(251,191,36,0.08);
  border: 1px solid rgba(251,191,36,0.25);
  color: rgba(251,191,36,0.7);
}

.ref-extra-strip {
  display: flex;
  gap: 4px;
  position: absolute;
  left: 6px;
  bottom: 6px;
  flex-wrap: wrap;
}
.ref-extra-thumb {
  width: 28px;
  height: 28px;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid rgba(0,229,255,0.2);
}
.ref-more-badge {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: var(--muted);
  border: 1px solid var(--pborder);
  border-radius: 3px;
}

.ref-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 11px;
  font-family: inherit;
  letter-spacing: 0.8px;
  color: rgba(0,229,255,0.55);
  border: 1px solid rgba(0,229,255,0.2);
  border-radius: 4px;
  padding: 3px 8px;
  cursor: pointer;
  background: transparent;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.ref-add-btn:hover {
  background: rgba(0,229,255,0.07);
  color: var(--cy);
  border-color: rgba(0,229,255,0.4);
}

.ref-inject-preview {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  margin-top: 6px;
  padding: 5px 8px;
  background: rgba(0,229,255,0.03);
  border: 1px solid rgba(0,229,255,0.1);
  border-radius: 4px;
}

.ref-inject-lbl {
  font-size: 9px;
  letter-spacing: 1px;
  color: var(--cy);
  opacity: 0.6;
  flex-shrink: 0;
  padding-top: 1px;
}

.ref-inject-text {
  font-size: 9.5px;
  color: var(--text2);
  line-height: 1.5;
  word-break: break-all;
}

.ref-empty-upload {
  width: 100%;
  min-height: 92px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 14px;
  box-sizing: border-box;
  border: 1px dashed rgba(0,229,255,0.32);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(0,229,255,0.055), rgba(168,85,247,0.035));
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.ref-empty-upload:hover {
  background: linear-gradient(135deg, rgba(0,229,255,0.1), rgba(168,85,247,0.06));
  border-color: rgba(0,229,255,0.52);
  box-shadow: inset 0 0 18px rgba(0,229,255,0.04);
}

.ref-empty-plus {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0,229,255,0.34);
  border-radius: 50%;
  color: var(--cy);
  font-size: 20px;
  line-height: 1;
  background: rgba(0,229,255,0.08);
}

.ref-empty-text {
  font-size: 13px;
  line-height: 1.4;
  letter-spacing: 0.5px;
  color: rgba(200,240,255,0.72);
}

.ref-preview-btn,
.ref-replace-btn {
  position: absolute;
  top: 6px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0,229,255,0.28);
  border-radius: 5px;
  background: rgba(2,9,18,0.78);
  color: rgba(200,240,255,0.82);
  font-size: 12px;
  line-height: 1;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.ref-preview-btn { right: 34px; }
.ref-replace-btn { right: 6px; }

.ref-preview-btn:hover,
.ref-replace-btn:hover {
  color: var(--cy);
  background: rgba(0,229,255,0.16);
  border-color: rgba(0,229,255,0.52);
}

/* ── Character Vision Analysis ── */
.char-analyze-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 4px;
}
.char-analyze-btn {
  font-size: 11px;
  font-family: inherit;
  padding: 4px 12px;
  border-radius: 4px;
  background: rgba(0,229,255,0.07);
  border: 1px solid rgba(0,229,255,0.22);
  color: rgba(0,229,255,0.85);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.12s, border-color 0.12s;
  white-space: nowrap;
}
.char-analyze-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.14);
  border-color: rgba(0,229,255,0.4);
}
.char-analyze-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.char-analyze-hint {
  font-size: 9px;
  color: rgba(52,211,153,0.8);
  letter-spacing: 0.5px;
}
.char-profiles {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 10px 12px;
}
.char-profile-card {
  padding: 0;
  background: rgba(2,9,18,0.56);
  border: 1px solid rgba(0,229,255,0.18);
  border-radius: 12px;
  overflow: hidden;
}
.char-profile-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(0,229,255,0.12);
  background: rgba(0,229,255,0.045);
}
.char-profile-lbl {
  font-size: 13px;
  letter-spacing: 1.5px;
  color: rgba(160,240,255,0.86);
}
.char-profile-clr {
  background: none;
  border: none;
  color: rgba(255,255,255,0.25);
  cursor: pointer;
  font-size: 10px;
  padding: 0 2px;
  line-height: 1;
}
.char-profile-clr:hover { color: #f43f5e; }
.char-profile-text {
  font-size: 18px;
  color: rgba(232,246,250,0.9);
  line-height: 1.8;
  margin: 0;
  padding: 20px;
  border-radius: 12px;
  max-height: 400px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  scrollbar-width: thin;
  scrollbar-color: rgba(0,229,255,0.35) transparent;
}

.preview-img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.preview-area {
  overflow: hidden;
}

.preview-panel {
  height: auto !important;
}

.preview-area {
  max-height: 520px !important;
}

.preview-img {
  max-height: 100% !important;
}

.preview-panel {
  width: 100%;
}

.preview-area {
  width: 100%;
  overflow: hidden;
}

.preview-img {
  width: 100%;
  height: 100%;
  min-width: 0;
}

/* =========================
   PREVIEW 完全修正版
========================= */

/* 親パネル制限解除 */
.preview-panel,
.panel.preview-panel {
  width: 100%;
}

/* プレビューエリア（枠内に収める） */
.preview-area {
  width: 100%;
  height: clamp(280px, 46vh, 520px);
  max-height: 520px;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 画像本体 */
.preview-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  max-width: 100%;
  max-height: 100%;
  min-width: 0;
  min-height: 0;
}

/* ============================================================
   ADVANCED SECTION
   ============================================================ */
.advanced-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--pborder);
  border-radius: 6px;
  color: var(--text2);
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  text-align: left;
}
.advanced-toggle:hover {
  background: rgba(0,229,255,0.05);
  border-color: rgba(0,229,255,0.25);
  color: var(--text);
}

.adv-arrow { font-size: 9px; color: var(--muted); flex-shrink: 0; }
.adv-label { font-weight: 700; color: var(--text2); letter-spacing: 1.5px; }
.adv-hint  { color: var(--muted); font-size: 10px; flex: 1; }
.adv-active-badge {
  font-size: 10px;
  color: #fbbf24;
  background: rgba(251,191,36,0.1);
  border: 1px solid rgba(251,191,36,0.3);
  border-radius: 3px;
  padding: 1px 6px;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

/* ============================================================
   STUDIO READABILITY REFRESH
   ============================================================ */
.studio-flow {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  background: rgba(2,9,18,0.72);
  border-bottom: 1px solid rgba(0,229,255,0.12);
  overflow-x: auto;
  flex-shrink: 0;
}

.flow-step {
  font-size: 15px;
  line-height: 1.3;
  letter-spacing: 1.5px;
  color: rgba(204,232,240,0.82);
  padding: 6px 13px;
  border: 1px solid rgba(0,229,255,0.18);
  border-radius: 999px;
  background: rgba(0,229,255,0.045);
  white-space: nowrap;
}

.flow-story { color: var(--cy); }
.flow-yaml { color: #c4b5fd; border-color: rgba(168,85,247,0.28); background: rgba(168,85,247,0.06); }
.flow-panels { color: #86efac; border-color: rgba(52,211,153,0.24); background: rgba(52,211,153,0.05); }
.flow-generate { color: var(--gold); border-color: rgba(251,191,36,0.28); background: rgba(251,191,36,0.06); }
.flow-export { color: #f0abfc; border-color: rgba(232,121,249,0.26); background: rgba(232,121,249,0.055); }

.flow-arrow {
  font-size: 16px;
  color: rgba(0,229,255,0.38);
  flex-shrink: 0;
}

.studio-main {
  display: grid;
  grid-template-columns: minmax(360px, 40%) minmax(0, 60%);
  gap: 18px;
  padding: 18px 22px 22px;
  min-height: 0;
}

.col-left,
.col-right {
  width: auto;
  min-height: 0;
  gap: 16px;
  overflow-y: auto !important;
  scrollbar-width: thin;
  scrollbar-color: rgba(0,229,255,0.28) transparent;
}

.panel {
  padding: 18px;
  border-radius: 8px;
}

.panel-hd {
  margin-bottom: 14px;
  gap: 10px;
}

.panel-label,
.browser-title,
.pro-section-hd,
.asset-section-lbl,
.yaml-panels-hd {
  font-size: 15px;
  line-height: 1.35;
}

.panel-sublabel,
.yaml-hint,
.gen-ctrl-label,
.ref-slot-label,
.send-lbl,
.mood-lbl,
.pedit-field-lbl {
  font-size: 14px;
  line-height: 1.4;
}

.icon-btn,
.proj-btn,
.back-btn,
.gen-btn,
.cp-gen-all-btn,
.yaml-gen-from-story-btn,
.layout-btn,
.asset-chip,
.ha-btn {
  font-size: 14px;
  line-height: 1.4;
}

.gen-select,
.ref-name-input,
.ref-label-input,
.char-lib-name-input,
.pro-preset-name-input,
.font-select,
.overlay-size-input,
.pedit-textarea {
  font-size: 16px;
  line-height: 1.55;
}

.story-area {
  min-height: 420px;
  max-height: 68vh;
  font-size: 18px;
  line-height: 1.75;
  padding: 18px;
  white-space: pre-wrap;
}

.yaml-area {
  min-height: 300px;
  font-family: 'Cascadia Code', 'JetBrains Mono', 'Courier New', monospace;
  font-size: 17px;
  line-height: 1.7;
  padding: 18px;
}

.prompt-panel,
.yaml-panel,
.preview-panel {
  border-color: rgba(0,229,255,0.18);
}

.yaml-panel {
  border-color: rgba(168,85,247,0.22);
  background: rgba(168,85,247,0.025);
}

.preview-panel .preview-area {
  height: clamp(280px, 46vh, 520px);
  min-height: 280px;
  max-height: 520px;
  overflow: hidden;
}

.preview-img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  min-width: 0 !important;
  min-height: 0;
  object-fit: contain;
}

.comic-panel {
  flex: 1 1 auto;
  min-height: min(760px, calc(100vh - 270px));
  border-color: rgba(0,229,255,0.24);
  background: rgba(0,229,255,0.02);
}

.comic-grid {
  gap: 14px;
  height: clamp(360px, calc(100vh - 360px), 560px);
  min-height: 0;
  overflow: hidden;
}

.comic-slot {
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
}

.comic-slot.active {
  border-color: rgba(0,229,255,0.9);
  box-shadow: 0 0 0 1px rgba(0,229,255,0.35), 0 0 22px rgba(0,229,255,0.22);
}

.slot-num {
  font-size: 22px;
  line-height: 1;
  color: rgba(204,232,240,0.92);
  background: rgba(2,9,18,0.72);
  border: 1px solid rgba(0,229,255,0.22);
  border-radius: 6px;
  padding: 5px 8px;
}

.page-tab,
.page-tab-add,
.cp-layout-badge {
  font-size: 14px;
  line-height: 1.35;
}

.hist-gallery {
  margin-top: 0;
  flex-shrink: 0;
  max-height: 260px;
  overflow: hidden;
  transition: max-height 0.18s ease, border-color 0.18s ease;
}

.hist-gallery.expanded {
  max-height: 70vh;
}

.hist-hd {
  cursor: pointer;
  margin-bottom: 10px;
}

.hist-body {
  max-height: 190px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0,229,255,0.25) transparent;
}

.hist-gallery.expanded .hist-body {
  max-height: calc(70vh - 76px);
}

.hist-grid {
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 10px;
}

.hist-count,
.hist-time {
  font-size: 12px;
}

.hist-empty {
  font-size: 15px;
  line-height: 1.6;
}

.ref-panel {
  max-height: 34vh;
  overflow: auto !important;
}

.ref-panel .panel-hd {
  position: sticky;
  top: 0;
  z-index: 3;
  background: rgba(3,12,24,0.92);
  backdrop-filter: blur(8px);
}

.ref-panel .ref-name-input,
.ref-panel .ref-label-input {
  font-size: 12px;
  line-height: 1.35;
  padding: 5px 7px;
}

.ref-panel .ref-name-input {
  font-size: 13px;
}

.advanced-section {
  margin-bottom: 8px;
}

/* ============================================================
   SIMPLE STORY → PREVIEW MODE
   ============================================================ */
.studio-main {
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}

.col-left,
.col-right {
  width: 100%;
  overflow: visible !important;
}

.col-left { order: 1; }
.col-right { order: 2; }

.comic-settings-panel {
  display: none !important;
}

.comic-panel {
  min-height: clamp(620px, calc(100vh - 220px), 980px);
}

.comic-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
  gap: 16px;
  align-items: stretch;
  min-height: 0;
}

.comic-grid {
  height: clamp(520px, calc(100vh - 330px), 860px);
}

.comic-slot.active {
  border-color: rgba(0,229,255,0.98);
  box-shadow:
    0 0 0 2px rgba(0,229,255,0.42),
    0 0 28px rgba(0,229,255,0.34),
    inset 0 0 22px rgba(0,229,255,0.08);
}

.comic-slot.active::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(0,229,255,0.14), transparent 36%, rgba(167,139,250,0.12));
  mix-blend-mode: screen;
}

.comic-grid .panel-size-small {
  min-height: 120px;
}

.comic-grid .panel-size-medium {
  min-height: 180px;
}

.comic-grid .panel-size-large {
  grid-column: span 2;
  min-height: 220px;
}

.comic-grid .panel-size-splash {
  grid-column: span 4;
  grid-row: span 2;
  min-height: 320px;
}

.panel-edit-sidebar {
  min-height: 0;
  height: clamp(520px, calc(100vh - 330px), 860px);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(0,229,255,0.22);
  border-radius: 8px;
  background: rgba(2,9,18,0.58);
  overflow-y: auto;
}

.panel-edit-sidebar-hd {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.panel-edit-title {
  font-size: 18px;
  line-height: 1.3;
  letter-spacing: 1.4px;
  color: var(--cy);
}

.panel-edit-page {
  font-size: 12px;
  color: rgba(204,232,240,0.46);
}

.panel-edit-textarea {
  min-height: 120px;
}

.panel-edit-regenerate {
  width: 100%;
  margin-top: auto;
  min-height: 42px;
}

.panel-edit-empty {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: rgba(204,232,240,0.52);
  font-size: 14px;
  line-height: 1.7;
  border: 1px dashed rgba(0,229,255,0.18);
  border-radius: 8px;
  padding: 18px;
}

.export-hint {
  margin-top: 10px;
}

@media (max-width: 1100px) {
  .studio-main {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .comic-panel {
    min-height: 560px;
  }

  .comic-workspace {
    grid-template-columns: 1fr;
  }

  .panel-edit-sidebar {
    height: auto;
    max-height: none;
  }

  .hist-gallery {
    max-height: 260px;
  }
}
</style>

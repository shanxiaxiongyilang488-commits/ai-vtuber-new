<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { page } from '$app/state';
  import { chatDateLabel, chatTimeLabel, energyStateIcon } from '../../core/timeCore';
  import { routeProvider, type RoutedProvider } from '$lib/ai/aiProviderRouter';
  import { isDeliberationRequest } from '$lib/ai/deliberationMode';
  import { ROLE_AI_OPTIONS, VIDEO_AI_SELECT_OPTIONS } from '$lib/config/studioAiOptions';
  import { imageModelCapabilities } from '$lib/config/mediaModels';
  import { AI_ROLE_MODELS, type AIModelMetadata } from '$lib/ai/aiRoleRouting';
  import type { ReflectionTendency } from '$lib/ai/reflection-router';
  import { animationBlueprintToYaml, createAnimationBlueprint } from '../../core/animationCore';
	import type { StoryScene as VideoStoryScene } from '../../core/sceneTimeline';
	import { motionPromptFromTimeline } from '$lib/animationSheetMotionPrompt';
	import { classifyAnimationReference, referenceNameFromUrl } from '$lib/animationReferenceClassifier';
  import {
    createVideoPackageFromStoryCard,
    normalizeVideoPackage,
    videoPackagePrompt,
    videoPackageToYaml,
    type VideoPackage,
  } from '../../core/videoPackageCore';
  import { importCharacterFromMemorycore } from '$lib/labCharacterImport';
  import { classifyChatIntent } from '$lib/chatIntentRouter';
  import { hasExplicitVideoActionRequest } from '$lib/intentSafety';
  import { getCharacterPresets } from '$lib/characterPresetStorage';
  import { loadVisualMemories, saveVisualMemory, searchVisualMemories, type VisualMemoryEntry } from '$lib/visualMemory';
  import { visualMemory } from '$lib/stores/visualMemory';
  import { clearVideoProductionMediaStore, getVideoProductionMediaEntries, getVideoProductionRecords, resolveVideoProductionImageReference, storeVideoProductionData, toVideoProductionImageReference, stripInlineImageData } from '$lib/videoProductionStorage';
  import {
    GROWTH_HISTORY_LIMIT,
    advanceBrain,
    applyEmotionInfluence,
    buildRadarChart,
    clampGrowth,
    determinePersonalityType,
    evaluateEmotion,
    evaluateGrowth,
    evaluateThinking,
    growthLogEntries,
    growthMessageSnippet,
    initialGrowthValues,
    summarizeGrowthTrends,
    THINKING_LOG_LIMIT,
    type BrainContext,
    type BrainLayers,
    type EmotionState,
    type GrowthHistoryEntry,
    type GrowthKey,
    type GrowthLogEntry,
    type GrowthValues,
    type ThinkingLog,
  } from '$lib/character-memory/growthSystem';
  import {
    buildStoryDraft,
    createStoryRef,
    gagIdeas,
    parseScenesFromYaml,
    parseStoryDoc,
    storyDraftToYaml,
    MAX_REFERENCE_IMAGES,
    STORY_REF_LIMIT,
    type StoryDoc,
    type StoryRef,
    type StoryRefCategory,
    type StoryScene,
  } from '$lib/character-memory/storySystem';
  import StoryCardCard from '$lib/storycard/StoryCardCard.svelte';
  import type { StoryCard as StoryCardDesign } from '$lib/storycard/storycard';
  import MemoryReviewCard from '$lib/components/character-memory/MemoryReviewCard.svelte';
  import RelationshipReviewCard from '$lib/components/character-memory/RelationshipReviewCard.svelte';
  import EmotionReviewCard from '$lib/components/character-memory/EmotionReviewCard.svelte';
  import AITuberStage from '$lib/components/aituber/AITuberStage.svelte';
  import PuruPuruAvatar from '$lib/components/aituber/PuruPuruAvatar.svelte';
  import VideoStoryCard from '$lib/components/VideoStoryCard.svelte';
  import { VIDEO_MODELS } from '$lib/config/videoModels';
  import { videoCostConfirmation } from '$lib/videoCost';
	import { SHIRO_OFFICIAL_REFERENCE_PACK, selfReferenceImagesFor } from '$lib/config/characterReferenceImages';
  import {
    emptyCharacterVisualMemory,
    normalizeCharacterVisualMemory,
    shiroVisualMemoryPreset,
    VISUAL_MEMORY_REFERENCE_CATEGORIES,
    type CharacterVisualMemory,
    type VisualMemoryReferenceCategory,
    type VisualMemoryReferenceImage,
  } from '$lib/types/characterVisualMemory';
  import {
    buildComicPrompt,
    buildComicPromptFromDoc,
    generateComicDraft,
    routeComicProvider,
    type ComicProvider,
  } from '$lib/character-memory/comicPipeline';
  import {
    buildYamlContext,
    providerVisionSupport,
    toVisionImages,
    type AttachImage,
  } from '$lib/character-memory/visionBridge';
  import type { CommonIntent, IntentDecision } from '$lib/intent/intentTypes';
  import type {
    BrainEmotionState,
    CharacterMemorySearchHit,
    CharacterMemorySearchResponse,
    EmotionBrain,
    EmotionReviewResponse,
    EmotionSaveResponse,
    EmotionSearchResponse,
    Experience,
    ExperienceSearchHit,
    ExperienceSearchResponse,
    MemoryReviewResponse,
    MemoryReviewSaveResponse,
	MemoryReviewTechnicalEvidence,
	ActionCandidate,
    RelationshipItem,
    RelationshipReviewResponse,
    RelationshipSaveResponse,
    RelationshipSearchHit,
    RelationshipSearchResponse,
    RoutineBrain,
    RoutineMorningResponse,
    RoutineNightResponse,
    RoutineStateResponse,
  } from '$lib/memoryReview';
  import type { ThoughtObservation } from '$lib/thoughtObservation';
  import {
	buildDailyDeliveryCaption,
    buildFallbackChatVoiceCaption,
	buildVoiceAuditionLine,
	buildOneShotDeliveryCaption,
    detectChatVoiceInstruction,
	extractExactSpokenLine,
	inferOneShotDeliverySpeed,
	inferOneShotPitchShiftSemitones,
	isDailyDeliveryInstruction,
	isDailyDeliveryResetInstruction,
    isOneShotDeliveryInstruction,
	isSpeedOnlyDeliveryInstruction,
	normalizeChatVoiceDirection,
	referencesRecentDelivery,
    type ChatVoiceDirection,
  } from '$lib/voiceDirection';
  import { sanitizeChatSpeechText, sanitizeSpeechText } from '$lib/speechText';
  import {
    AITuberBridge,
    CharacterRuntime,
    CommentQueue,
    DEFAULT_PROACTIVE_SETTINGS,
    ExistingCharacterMemoryAdapter,
    ExistingLabChatAdapter,
    ExistingVoiceBridgeAdapter,
    LocalCommentSource,
    SpeechQueue,
    YouTubeCommentSource,
    buildDefaultCommentDisplayText,
    createAvatarState,
    evaluateProactiveEligibility,
    hasStoredProactiveSettings,
    getVoiceOutputEffectPreset,
    loadProactiveSettings,
    loadVoiceCandidates,
    logAITuberEvent,
    readAITuberEvents,
    replaceVoiceCandidates,
    saveVoiceCandidate,
    saveProactiveSettings,
    nextVoiceOutputEffectMode,
    parseVoiceOutputEffectMode,
    type CharacterRuntimeSnapshot,
    type ProactiveChatContext,
    type ProactiveSettings,
    type SpeechRequest,
    type VoiceOutputEffectMode,
    type StoredVoiceCandidate,
  } from '$lib/aituber';

  type CharacterListItem = {
    id: string;
    name: string;
    role: string;
    description: string;
    hasReference: boolean;
    hasMemoryEntry: boolean;
    updatedAt: string;
  };

  type Character = {
    id: string;
    name: string;
    role: string;
    description: string;
    visualMemory: CharacterVisualMemory;
  };

  type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    imageUrl?: string;
    referenceImages?: string[];
    storyCard?: StoryCardDesign;
    videoPackage?: VideoPackage;
    motionPrompt?: string;
    aiModels?: AIModelMetadata;
    voiceDirection?: ChatVoiceDirection;
    timestamp: string;
    createdAt: string;
  };

  type CharacterMemory = {
    personality: string[];
    speechStyle: string[];
    likes: string[];
    dislikes: string[];
  };
  type MemorySource = 'manual' | 'conversation' | 'self_talk' | 'video_analysis' | 'image_analysis' | 'memory-review';
  type MemoryItem = { id: string; content: string; importance: number; source: MemorySource; createdAt: string; expiresAt?: string };
  type MemoryV2 = {
    persona: { species: string; personality: string[]; speechStyle: string[]; relationship: string };
    longTermMemory: MemoryItem[];
    shortTermMemory: MemoryItem[];
  };
  type MemorySearchDebug = {
    query: string;
    hitCount: number;
    topRelevance: number;
    elapsedMs: number;
    memoryIds: string[];
    requestPayload?: unknown;
    responseJson?: unknown;
    error?: string;
  };
  type RelationshipSearchDebug = {
    query: string;
    hitCount: number;
    topRelevance: number;
    topConfidence: number;
    elapsedMs: number;
    relationshipIds: string[];
    requestPayload?: unknown;
    responseJson?: unknown;
    error?: string;
  };
  type EmotionSearchDebug = {
    emotion: string;
    intensity: number;
    confidence: number;
    historyCount: number;
    elapsedMs: number;
    requestPayload?: unknown;
    responseJson?: unknown;
    error?: string;
  };
  type ExperienceSearchDebug = {
    query: string;
    hitCount: number;
    topRelevance: number;
    elapsedMs: number;
    experienceIds: string[];
    requestPayload?: unknown;
    responseJson?: unknown;
    graph?: ExperienceSearchResponse['graph'];
    error?: string;
  };
  type RoutineDebug = {
    currentState: string;
    lastSleep?: string;
    todaySummary: string;
    todayGoal: string;
    requestPayload?: unknown;
    responseJson?: unknown;
    error?: string;
  };
  type BrainBackup = { filename: string; createdAt: string; size: number };
  type BrainHealth = {
    brain: string;
    records: number;
    currentFile: string;
    backupCount: number;
    lastBackup: BrainBackup | null;
    status: 'Healthy' | 'Warning' | 'Corrupted';
    message?: string;
  };

  // This is a one-way, user-triggered handoff.  It is deliberately a local
  // snapshot: LAB owns the copy after import and never reads this character again.
  type LabCharacterExport = {
    version: 1;
    source: 'memorycore';
    exportedAt: string;
    id: string;
    name: string;
    icon: string;
    profile: { role: string; description: string; memory: CharacterMemory };
    referenceImages: string[];
    growth: GrowthValues;
    settings: Record<string, never>;
    videoReferenceImages: string[];
  };

  const emptyMemory = (): CharacterMemory => ({
    personality: [],
    speechStyle: [],
    likes: [],
    dislikes: [],
  });
  const emptyMemoryV2 = (): MemoryV2 => ({ persona: { species: '', personality: [], speechStyle: [], relationship: '' }, longTermMemory: [], shortTermMemory: [] });

  type ImageAction = { prompt: string; size: string; preamble: string };
  type LastGeneratedScene = {
    scene: string;
    prompt: string;
    size: string;
    renderMode: 'manga' | 'illustration';
  };

  function imageRefDigest(value: string): string {
    let hash = 0;
    const step = Math.max(1, Math.floor(value.length / 64));
    for (let i = 0; i < value.length; i += step) {
      hash = ((hash << 5) - hash + value.charCodeAt(i)) >>> 0;
    }
    return `${value.length}:${hash.toString(16)}`;
  }

  function imageRefMeta(value: string, index: number, source = 'unknown') {
    return {
      index,
      source,
      kind: value.startsWith('data:') ? 'data-url' : (value.startsWith('http') ? 'url' : 'unknown'),
      mime: value.match(/^data:([^;]+);/)?.[1] ?? null,
      length: value.length,
      approxKB: Math.round(value.length / 1024),
      digest: imageRefDigest(value),
    };
  }

  // 文字列中の最初のバランスの取れたJSONオブジェクトを抽出する（文字列内のブレース・エスケープを考慮）。
  function extractJsonObject(text: string): { json: string; start: number; end: number } | null {
    const start = text.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return { json: text.slice(start, i + 1), start, end: i + 1 };
      }
    }
    return null;
  }

  // assistant応答が ChatGPT風の dalle.text2im ツール呼び出しJSONなら、画像生成パラメータへ変換する。
  // 画像生成アクションでなければ null（＝従来どおりテキスト表示）。
  function parseImageAction(text: string): ImageAction | null {
    const extracted = extractJsonObject(text);
    if (!extracted) return null;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(extracted.json) as Record<string, unknown>;
    } catch {
      return null;
    }
    const action = String(parsed?.action ?? '').toLowerCase();
    if (!/text2im|dall[·.]?e/.test(action)) return null;

    let input: unknown = parsed.action_input;
    // action_input は二重エンコードされたJSON文字列のことがある。
    if (typeof input === 'string') {
      try {
        input = JSON.parse(input);
      } catch {
        input = { prompt: input };
      }
    }
    const inputObj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const prompt = String(inputObj.prompt ?? parsed.prompt ?? '').trim();
    if (!prompt) return null;
    const size = String(inputObj.size ?? '1024x1024').trim() || '1024x1024';

    const preamble = (text.slice(0, extracted.start) + text.slice(extracted.end))
      .replace(/```(?:json)?/gi, '')
      .trim();
    return { prompt, size, preamble };
  }

  let characters = $state<CharacterListItem[]>([]);
  let selectedId = $state('');
  let selectedCharacterId = $state<string | null>(null);
  let projectOnlyMode = $state(false);
  let character = $state<Character | null>(null);
  let messages = $state<ChatMessage[]>([]);
  let memory = $state<CharacterMemory>(emptyMemory());
  let memoryV2 = $state<MemoryV2>(emptyMemoryV2());
  let characterVisualMemory = $state<CharacterVisualMemory>(emptyCharacterVisualMemory());
  let visualMemoryOwnerId = $state('');
  let visualMemoryDraft = $state<CharacterVisualMemory>(emptyCharacterVisualMemory());
  let editingVisualMemory = $state(false);
  let savingVisualMemory = $state(false);
  let visualMemoryMessage = $state('');
  let visualMemoryReferenceCategory = $state<VisualMemoryReferenceCategory>('Reference');
  let visualMemoryReferenceTitle = $state('');
  let visualMemoryReferenceTags = $state('');
  let uploadingVisualMemoryReferences = $state(false);
  let buildingRegisteredVisualMemory = $state(false);
  let showVisualMemoryBrowser = $state(false);
  let expandedVisualMemoryReference = $state<VisualMemoryReferenceImage | null>(null);
  let showVideoMemoryReview = $state(false);
  let resolveVideoMemoryReview: ((confirmed: boolean) => void) | null = null;
	type VideoPreflightCategory = 'Animation Sheet' | 'Character Reference' | 'World Reference' | 'Prop Reference';
	type VideoPreflightMaterial = {
		id: string;
		url: string;
		label: string;
		category: VideoPreflightCategory;
		details: string[];
	};
	const VIDEO_PREFLIGHT_CATEGORIES: VideoPreflightCategory[] = ['Animation Sheet', 'Character Reference', 'World Reference', 'Prop Reference'];
	let videoPreflightMaterials = $state<VideoPreflightMaterial[]>([]);
  let imageDataUrl = $state('');
  let visualMemories = $state<VisualMemoryEntry[]>([]);
  let relationships = $state<RelationshipItem[]>([]);
  let emotionBrain = $state<EmotionBrain>({ current: null, history: [] });
  let experiences = $state<Experience[]>([]);
  let experienceGraph = $state<ExperienceSearchResponse['graph'] | null>(null);
  let routineBrain = $state<RoutineBrain>({
    currentState: 'Morning',
    todaySummary: '',
    todayGoal: '',
    morningGreeting: '',
    updatedAt: new Date().toISOString(),
    log: [],
  });
  let routineMessage = $state('');
  let routineDebug = $state<RoutineDebug | null>(null);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let updatedAt = $state('');
  let inputText = $state('');
  let loadingList = $state(true);
  let loadingCharacter = $state(false);
  let sending = $state(false);
  let analyzing = $state(false);
  let savingMemory = $state(false);
  let generatingPortrait = $state(false);
  let videoGenerationState = $state<'idle' | 'generating' | 'completed' | 'error'>('idle');
  let errorMessage = $state('');
  /** Visual Memory Validator の失敗は致命エラーではなく warning として表示する。 */
  let imageValidationWarning = $state('');
  let activeImageSkillIds = $state<string[]>([]);
  // 🔊 Voice Bridge TTS: assistant 吹き出しの音声再生。失敗してもチャットは継続する。
  type CharacterVoiceConfig = {
    engine: string;
    mode: 'lora' | 'clone' | 'design';
    model: string;
    caption?: string;
    speed?: number;
    autoSpeak?: boolean;
  };
  let voiceConfig = $state<CharacterVoiceConfig | null>(null);
  let voiceConfigLoaded = $state(false);
  let voiceStateByMessageId = $state<Record<string, 'loading' | 'playing' | 'error'>>({});
  let voiceUrlByMessageId = $state<Record<string, string>>({});
  type RunpodVoiceBackend = 'runpod-pod' | 'runpod-serverless';
  let voiceBackendByMessageId = $state<Record<string, RunpodVoiceBackend>>({});
  let lastRunpodVoiceBackend = $state<RunpodVoiceBackend | null>(null);
  let voiceDraftMessageId = $state('');
  let voiceSavingMessageId = $state('');
  let voiceSavedMessageId = $state('');
  let voiceWorkflowMessage = $state('');
  let voiceResetting = $state(false);
  let dailyVoiceDirection = $state<ChatVoiceDirection | null>(null);
  let voiceOutputEffectMode = $state<VoiceOutputEffectMode>('off');
  const voiceOutputEffectPreset = $derived(getVoiceOutputEffectPreset(voiceOutputEffectMode));

  function runpodVoiceBackendLabel(backend: RunpodVoiceBackend): string {
    return backend === 'runpod-pod' ? 'Pod直結' : 'Serverless退避';
  }

  function localCalendarDay(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dailyVoiceStorageKey(characterId: string): string {
    return `ai-vtuber:daily-voice-delivery:${characterId}`;
  }

  function loadDailyVoiceDirection(characterId: string): ChatVoiceDirection | null {
    try {
      const key = dailyVoiceStorageKey(characterId);
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as { day?: unknown; direction?: unknown } | null;
      if (!stored || stored.day !== localCalendarDay()) {
        localStorage.removeItem(key);
        return null;
      }
      const direction = normalizeChatVoiceDirection(stored.direction);
      return direction?.scope === 'day' && direction.preserveBaseVoice ? direction : null;
    } catch {
      return null;
    }
  }

  function saveDailyVoiceDirection(characterId: string, direction: ChatVoiceDirection | null): void {
    try {
      const key = dailyVoiceStorageKey(characterId);
      if (!direction) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ day: localCalendarDay(), direction }));
    } catch {
      // A storage failure should not interrupt the current chat turn.
    }
  }

  function clearDailyVoiceDirection(message = '今日だけの話し方を解除しました。次の返事から普段どおりに戻ります。'): void {
    if (character) saveDailyVoiceDirection(character.id, null);
    dailyVoiceDirection = null;
    voiceWorkflowMessage = message;
  }

  function setDailyVoiceSpeed(speed: number): void {
    if (!character) return;
    if (Math.abs(speed - 1) < 0.001) {
      clearDailyVoiceDirection('今日の速度指定を解除しました。次の返事から標準速度に戻ります。');
      return;
    }
    const normalizedSpeed = Math.min(1.35, Math.max(0.75, speed));
    const instruction = `今日は口調・声質・テンションを変えず、再生速度だけ${normalizedSpeed.toFixed(2)}倍にする`;
    const direction: ChatVoiceDirection = {
      instruction,
      caption: '',
      summary: `今日の速度: ${normalizedSpeed.toFixed(2)}x（速度だけ）`,
      model: 'local-time-stretch',
      scope: 'day',
      preserveBaseVoice: true,
      speed: normalizedSpeed,
      speedOnly: true,
    };
    dailyVoiceDirection = direction;
    saveDailyVoiceDirection(character.id, direction);
    voiceWorkflowMessage = `${direction.summary}に設定しました。次の返信から反映します。`;
  }
  const avatarState = createAvatarState();
  let avatarRenderer = $state<'css-fallback' | 'purupuru-runtime'>('css-fallback');
  // 配信モード: 右カラム上部に大型AITuberステージを表示する。アイコン側の表示には影響しない。
  let broadcastMode = $state(false);

  function toggleBroadcastMode(): void {
    broadcastMode = !broadcastMode;
    try {
      localStorage.setItem('ai-vtuber:broadcast-mode', String(broadcastMode));
    } catch {
      // 永続化失敗は表示に影響させない。
    }
  }
  let aituberBridge = $state<AITuberBridge | null>(null);
  const proactiveChatAdapter = new ExistingLabChatAdapter();
  const proactiveMemoryAdapter = new ExistingCharacterMemoryAdapter(() => [
    ...memoryV2.longTermMemory.slice(-12).map((item) => item.content),
    ...memory.likes.slice(-5).map((item) => `likes: ${item}`),
    ...memory.dislikes.slice(-5).map((item) => `dislikes: ${item}`),
  ].join(' / '));
  const characterRuntime = new CharacterRuntime('', (event) => {
    logAITuberEvent(event.type, event.characterId, { origin: event.origin, metadata: event.metadata });
  });
  let runtimeSnapshot = $state<CharacterRuntimeSnapshot>(characterRuntime.get());
  let proactiveSettings = $state<ProactiveSettings>({ ...DEFAULT_PROACTIVE_SETTINGS });
  let speechQueue = $state<SpeechQueue | null>(null);
  // SpeechQueue.size() はリアクティブでないため、UI用にイベント毎へ同期するミラー。
  let speechQueueSize = $state(0);
  let runpodVoiceConfigured = $state(false);
  let runpodVoiceSelected = $state(false);
  let runpodVoiceState = $state<'off' | 'waiting' | 'warming' | 'warm' | 'error'>('off');
  let runpodVoiceMessage = $state('');
  let runpodVoiceSessionId = '';
  let runpodVoiceWarmIntervalSeconds = 45;
  let runpodVoiceAutoStopSeconds = 90;
  let runpodVoiceLastActivityAt = 0;
  let runpodVoiceSessionTimer: ReturnType<typeof setTimeout> | null = null;
  let runpodVoiceRetryCount = 0;
  // コメント連携 Phase 2: LocalCommentSource → CommentQueue → 既存sendMessage経路。
  const localCommentSource = new LocalCommentSource();
  let commentQueue: CommentQueue | null = null;
  let commentQueueSize = $state(0);
  let commentDebugName = $state('視聴者');
  let commentDebugText = $state('');
  // YouTube Live コメント取得。接続中のみ生成し、切断でdetachする。
  let youtubeSource: YouTubeCommentSource | null = null;
  let youtubeCommentLiveId = $state('');
  let youtubeCommentApiKey = $state('');
  let youtubeCommentRunning = $state(false);
  let youtubeCommentError = $state('');
  let proactiveTimer: ReturnType<typeof setInterval> | null = null;
  let proactiveRunning = $state(false);
  let proactiveMessageIds = $state<Record<string, true>>({});
  let lastProactiveSkip = '';
  let lastProactiveSkipAt = 0;
  let unsubscribeRuntime: (() => void) | null = null;

  const runtimeStateLabel = $derived({
    idle: '待機中',
    thinking: '考え中',
    speaking: '発話中',
    generating_image: '画像生成中',
    generating_video: '動画生成中',
    generating_voice: '音声生成中',
    error: 'エラー',
  }[runtimeSnapshot.state]);

  function saveCurrentProactiveSettings(): void {
    if (character?.id) saveProactiveSettings(character.id, proactiveSettings);
  }

  function setVoicePlaybackMode(mode: 'manual' | 'realtime'): void {
    proactiveSettings.autoPlayVoice = mode === 'realtime';
    saveCurrentProactiveSettings();
    if (mode === 'realtime' && runpodVoiceSelected && (runpodVoiceState === 'off' || runpodVoiceState === 'error')) {
      void startRunpodVoiceSession();
    }
  }

  function isAITuberBusy(): boolean {
    return sending
      || proactiveRunning
      || generatingPortrait
      || videoGenerationState === 'generating'
      || Object.values(generatingVideoByMessageId).some(Boolean)
      || showVideoMemoryReview
      || showVisualMemoryBrowser
      || expandedVisualMemoryReference !== null
      || pendingIntentConfirmation !== null
      || (speechQueue?.size() ?? 0) > 0;
  }

  // コメント消化を保留する条件。ユーザーが入力・添付を準備中の間もコメントに割り込ませない。
  function isCommentDeliveryBusy(): boolean {
    return !character
      || interactionMode !== 'conversation'
      || isAITuberBusy()
      || avatarState.speaking
      || avatarState.thinking
      || inputText.trim().length > 0
      || attachImages.length > 0
      || Boolean(attachYaml);
  }

  function syncCommentQueueSize(): void {
    commentQueueSize = commentQueue?.size() ?? 0;
  }

  function pushDebugComment(): void {
    const text = commentDebugText.trim();
    if (!text) return;
    localCommentSource.push(commentDebugName.trim() || '視聴者', text);
    commentDebugText = '';
  }

  function startYoutubeComments(): void {
    if (!commentQueue) return;
    stopYoutubeComments();
    const liveId = youtubeCommentLiveId.trim();
    const apiKey = youtubeCommentApiKey.trim();
    if (!liveId || !apiKey) {
      youtubeCommentError = 'Live IDとAPIキーを入力してください';
      return;
    }
    localStorage.setItem('ai-vtuber:youtube-comment-live-id', liveId);
    localStorage.setItem('ai-vtuber:youtube-comment-api-key', apiKey);
    youtubeSource = new YouTubeCommentSource({
      liveId,
      apiKey,
      onError: (message) => {
        youtubeCommentError = message;
      },
    });
    commentQueue.attachSource(youtubeSource);
    youtubeCommentRunning = true;
    youtubeCommentError = '';
  }

  function stopYoutubeComments(): void {
    if (youtubeSource) {
      commentQueue?.detachSource(youtubeSource);
      youtubeSource = null;
    }
    youtubeCommentRunning = false;
  }

  function speechRequest(message: ChatMessage, origin: 'user_reply' | 'proactive'): SpeechRequest {
    return {
      id: `speech:${message.id}:${origin}`,
      characterId: character?.id ?? '',
      messageId: message.id,
      text: message.voiceDirection
		? sanitizeSpeechText(stripInlineImageData(message.text))
		: sanitizeChatSpeechText(stripInlineImageData(message.text)),
      ...(message.voiceDirection?.caption ? { voiceCaption: message.voiceDirection.caption } : {}),
      ...(message.voiceDirection?.instruction ? { voiceInstruction: message.voiceDirection.instruction } : {}),
      ...(message.voiceDirection?.speed !== undefined ? { voiceSpeed: message.voiceDirection.speed } : {}),
      ...(message.voiceDirection?.pitchShiftSemitones !== undefined ? { voicePitchShiftSemitones: message.voiceDirection.pitchShiftSemitones } : {}),
      ...(message.voiceDirection?.preserveBaseVoice ? { preserveBaseVoice: true } : {}),
      origin,
      createdAt: Date.now(),
    };
  }

  function existingEmotionForMessage(messageId: string): unknown {
    const message = messages.find((item) => item.id === messageId);
    return message?.storyCard?.emotion
      || emotionBrain.current
      || currentEmotion
      || 'neutral';
  }

  function enqueueSpeech(message: ChatMessage, origin: 'user_reply' | 'proactive'): void {
    if (!speechQueue || !character || !message.text) return;
    const fallbackDraftId = panelVoiceDraftMessageId();
    const fallbackDirection = !voiceConfig && !message.voiceDirection && fallbackDraftId
      ? messages.find((item) => item.id === fallbackDraftId)?.voiceDirection
      : undefined;
    const speechMessage = fallbackDirection
      ? { ...message, voiceDirection: fallbackDirection }
      : message;
    if (!voiceConfig && !speechMessage.voiceDirection) return;
    speechQueue.enqueue(speechRequest(speechMessage, origin));
  }

  function syncSpeechQueueSize(): void {
    speechQueueSize = speechQueue?.size() ?? 0;
  }

  function stopSpeech(): void {
    speechQueue?.stop();
    syncSpeechQueueSize();
  }

  type RunpodVoiceSessionResponse = {
    ok?: boolean;
    configured?: boolean;
    selected?: boolean;
    sessionId?: string;
    state?: string;
    message?: string;
    lastActiveAt?: number;
    nextKeepaliveSeconds?: number;
    warmIntervalSeconds?: number;
    idleSeconds?: number;
    sessions?: RunpodVoiceSessionResponse[];
  };

  function applyRunpodVoiceSession(data: RunpodVoiceSessionResponse): void {
    runpodVoiceSessionId = data.sessionId || runpodVoiceSessionId;
    if (!runpodVoiceLastActivityAt && Number.isFinite(Number(data.lastActiveAt))) {
      runpodVoiceLastActivityAt = Number(data.lastActiveAt);
    }
    runpodVoiceWarmIntervalSeconds = Math.max(
      10,
      Number(data.nextKeepaliveSeconds ?? data.warmIntervalSeconds) || runpodVoiceWarmIntervalSeconds,
    );
    if (data.message) runpodVoiceMessage = data.message;
    if (data.state === 'waiting-gpu') runpodVoiceState = 'waiting';
    else if (data.state === 'starting') runpodVoiceState = 'warming';
    else if (data.state === 'ready' || data.state === 'warm') runpodVoiceState = 'warm';
    else if (data.state === 'cooling-down') runpodVoiceState = 'off';
    else if (data.state === 'error') runpodVoiceState = 'error';
  }

  function clearRunpodVoiceTimer(): void {
    if (runpodVoiceSessionTimer) clearTimeout(runpodVoiceSessionTimer);
    runpodVoiceSessionTimer = null;
  }

  function scheduleRunpodVoiceUpdate(): void {
    clearRunpodVoiceTimer();
    if (!runpodVoiceSessionId || runpodVoiceState === 'off' || runpodVoiceState === 'error') return;
    const autoStopMs = runpodVoiceAutoStopSeconds * 1_000;
    const idleMs = runpodVoiceLastActivityAt ? Date.now() - runpodVoiceLastActivityAt : 0;
    // A queued warm-up is what reserves/provisions the worker. Cancelling it
    // while RunPod is short on GPUs sends us back to the end of the queue.
    // Idle auto-stop therefore begins only after the worker became ready.
    if (runpodVoiceState === 'warm' && speechQueueSize === 0 && runpodVoiceLastActivityAt && idleMs >= autoStopMs) {
      stopRunpodVoiceSession();
      return;
    }
    const action: 'status' | 'keepalive' = runpodVoiceState === 'warm' ? 'keepalive' : 'status';
    const normalDelayMs = runpodVoiceState === 'warm' ? runpodVoiceWarmIntervalSeconds * 1_000 : 3_000;
    const remainingAutoStopMs = runpodVoiceState === 'warm' && speechQueueSize === 0 && runpodVoiceLastActivityAt
      ? Math.max(250, autoStopMs - idleMs)
      : normalDelayMs;
    const delayMs = Math.min(normalDelayMs, remainingAutoStopMs);
    runpodVoiceSessionTimer = setTimeout(async () => {
      if (
        runpodVoiceState === 'warm'
        && speechQueueSize === 0
        && runpodVoiceLastActivityAt
        && Date.now() - runpodVoiceLastActivityAt >= runpodVoiceAutoStopSeconds * 1_000
      ) {
        stopRunpodVoiceSession();
        return;
      }
      try {
        const data = await renewRunpodVoiceSession(action);
        applyRunpodVoiceSession(data);
        runpodVoiceRetryCount = 0;
        scheduleRunpodVoiceUpdate();
      } catch (error) {
        handleRunpodVoiceFailure(error);
      }
    }, delayMs);
  }

  function handleRunpodVoiceFailure(error: unknown): void {
    clearRunpodVoiceTimer();
    runpodVoiceState = 'error';
    runpodVoiceMessage = error instanceof Error ? error.message : String(error);
    runpodVoiceRetryCount += 1;
    if (!runpodVoiceConfigured || !runpodVoiceSelected || runpodVoiceRetryCount > 3) return;
    const retryDelayMs = Math.min(30_000, 5_000 * (2 ** (runpodVoiceRetryCount - 1)));
    runpodVoiceMessage = `${runpodVoiceMessage}（${Math.round(retryDelayMs / 1_000)}秒後に自動再試行）`;
    runpodVoiceSessionTimer = setTimeout(() => void startRunpodVoiceSession(), retryDelayMs);
  }

  async function loadRunpodVoiceSessionConfig(): Promise<void> {
    try {
      const response = await fetch('/api/runpod/voice-session', { cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as RunpodVoiceSessionResponse;
      runpodVoiceConfigured = Boolean(data.configured);
      runpodVoiceSelected = Boolean(data.selected);
      runpodVoiceWarmIntervalSeconds = Math.max(10, Number(data.warmIntervalSeconds) || 45);
      runpodVoiceAutoStopSeconds = Math.max(30, Number(data.idleSeconds) || 90);
      const existing = data.sessions?.[0];
      if (existing) {
        applyRunpodVoiceSession(existing);
        scheduleRunpodVoiceUpdate();
      } else if (runpodVoiceConfigured && runpodVoiceSelected) {
        // Do not enqueue a separate warm-up job just because the chat page was
        // opened. The first real speech request wakes RunPod itself. A warm-up
        // job can otherwise sit in front of the actual voice for many minutes
        // when GPU capacity is scarce, making chat look as if TTS is broken.
        runpodVoiceState = 'off';
        runpodVoiceMessage = 'The first voice request will start the RunPod worker automatically.';
      }
    } catch {
      runpodVoiceConfigured = false;
      runpodVoiceSelected = false;
    }
  }

  async function renewRunpodVoiceSession(action: 'start' | 'status' | 'keepalive'): Promise<RunpodVoiceSessionResponse> {
    const response = await fetch('/api/runpod/voice-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, sessionId: runpodVoiceSessionId || undefined }),
    });
    const data = await response.json().catch(() => ({})) as RunpodVoiceSessionResponse;
    if (!response.ok || !data.ok) throw new Error(data.message || `RunPod voice session failed: HTTP ${response.status}`);
    return data;
  }

  async function startRunpodVoiceSession(): Promise<void> {
    if (!runpodVoiceConfigured || !runpodVoiceSelected || runpodVoiceState === 'waiting' || runpodVoiceState === 'warming' || runpodVoiceState === 'warm') return;
    clearRunpodVoiceTimer();
    runpodVoiceState = 'warming';
    runpodVoiceMessage = 'GPUとIrodoriを起動しています…';
    try {
      const data = await renewRunpodVoiceSession('start');
      applyRunpodVoiceSession(data);
      runpodVoiceRetryCount = 0;
      scheduleRunpodVoiceUpdate();
    } catch (error) {
      handleRunpodVoiceFailure(error);
    }
  }

  async function waitForRunpodVoiceReady(signal?: AbortSignal): Promise<void> {
    if (!runpodVoiceSelected) return;
    if (!runpodVoiceConfigured) throw new Error('RunPod Voice Endpointが未設定です。');
    runpodVoiceLastActivityAt = Date.now();
    if (runpodVoiceState === 'off' || runpodVoiceState === 'error') await startRunpodVoiceSession();
    const timeoutAt = Date.now() + 30 * 60_000;
    while (runpodVoiceState !== 'warm') {
      if (signal?.aborted) throw new DOMException('Voice generation was cancelled.', 'AbortError');
      if (Date.now() >= timeoutAt) throw new Error('RunPodのGPU待ちが30分を超えました。音声は再生ボタンから再試行できます。');
      if (runpodVoiceState === 'error' && runpodVoiceRetryCount > 3) throw new Error(runpodVoiceMessage || 'RunPod音声の自動接続に失敗しました。');
      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          signal?.removeEventListener('abort', abort);
          resolve();
        };
        const timer = setTimeout(finish, 250);
        const abort = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          reject(new DOMException('Voice generation was cancelled.', 'AbortError'));
        };
        signal?.addEventListener('abort', abort, { once: true });
      });
    }
  }

  function stopRunpodVoiceSession(): void {
    clearRunpodVoiceTimer();
    if (runpodVoiceSessionId) {
      void fetch('/api/runpod/voice-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'stop', sessionId: runpodVoiceSessionId }),
        keepalive: true,
      }).catch(() => undefined);
    }
    runpodVoiceSessionId = '';
    runpodVoiceLastActivityAt = 0;
    runpodVoiceState = 'off';
    runpodVoiceMessage = '停止後はRunPodのIdle Timeoutで自動終了します';
  }

  function toggleRunpodVoiceSession(): void {
    if (runpodVoiceState === 'warm' || runpodVoiceState === 'warming' || runpodVoiceState === 'waiting') stopRunpodVoiceSession();
    else {
      runpodVoiceLastActivityAt = Date.now();
      void startRunpodVoiceSession();
    }
  }

  function cycleVoiceOutputEffect(): void {
    voiceOutputEffectMode = nextVoiceOutputEffectMode(voiceOutputEffectMode);
    if (character?.id) {
      localStorage.setItem(`ai-vtuber:voice-output-effect:${character.id}`, voiceOutputEffectMode);
    }
  }

  function rememberVoiceCandidate(characterId: string, messageId: string, audioUrl: string): void {
    saveVoiceCandidate(characterId, messageId, audioUrl, localStorage);
  }

  async function restoreVoiceCandidates(characterId: string, chatMessages: ChatMessage[]): Promise<void> {
    const candidateMessages = chatMessages.filter((message) => message.role === 'assistant' && message.voiceDirection).slice(-80);
    if (!candidateMessages.length) return;
    const storedByMessageId = new Map(
      loadVoiceCandidates(characterId, localStorage).map((candidate) => [candidate.messageId, candidate]),
    );
    const restored: StoredVoiceCandidate[] = [];

    await Promise.all(candidateMessages.map(async (message, index) => {
      const stored = storedByMessageId.get(message.id);
      if (stored) {
        try {
          const response = await fetch(stored.audioUrl, { method: 'HEAD', cache: 'no-store' });
          if (response.ok) {
            restored.push(stored);
            return;
          }
        } catch {
          // Fall through to deterministic server-side cache lookup.
        }
      }

      try {
        const response = await fetch('/api/voice/speak', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            characterId,
            text: sanitizeSpeechText(stripInlineImageData(message.text)),
            voiceCaption: message.voiceDirection?.caption,
            voiceSpeed: message.voiceDirection?.speed,
            voicePitchShiftSemitones: message.voiceDirection?.pitchShiftSemitones,
            preserveBaseVoice: message.voiceDirection?.preserveBaseVoice,
            lookupOnly: true,
          }),
        });
        const data = await response.json().catch(() => ({})) as { success?: boolean; audioUrl?: string };
        if (response.ok && data.success && data.audioUrl) {
          restored.push({
            messageId: message.id,
            audioUrl: data.audioUrl,
            createdAt: Date.parse(message.timestamp ?? message.createdAt ?? '') || Date.now() + index,
          });
        }
      } catch {
        // Missing historical candidates are expected and do not affect chat loading.
      }
    }));

    if (character?.id !== characterId) return;
    replaceVoiceCandidates(characterId, restored, localStorage);
    voiceUrlByMessageId = Object.fromEntries(restored.map((candidate) => [candidate.messageId, candidate.audioUrl]));
  }

  function recentWorkSummary(): string {
    const project = animationProjectMessages().at(-1);
    if (project) return animationProjectTitle(project);
    const generated = [...messages].reverse().find((message) => message.imageUrl || generatedVideoByMessageId[message.id]);
    return generated ? stripInlineImageData(generated.text).slice(0, 300) : '';
  }

  async function runProactiveConversation(): Promise<void> {
    if (!character || proactiveRunning) return;
    const now = Date.now();
    const decision = evaluateProactiveEligibility({
      runtime: characterRuntime.get(),
      settings: proactiveSettings,
      now,
      pageHidden: typeof document !== 'undefined' && document.hidden,
      busy: isAITuberBusy(),
    });
    if (!decision.eligible) {
      const reason = decision.reason ?? 'unknown';
      if (reason !== lastProactiveSkip || now - lastProactiveSkipAt >= 60_000) {
        logAITuberEvent('proactive_skipped', character.id, { origin: 'proactive', metadata: { reason } });
        lastProactiveSkip = reason;
        lastProactiveSkipAt = now;
      }
      return;
    }

    const activeCharacterId = character.id;
    proactiveRunning = true;
    logAITuberEvent('proactive_candidate', activeCharacterId, {
      origin: 'proactive',
      metadata: { idleMs: now - runtimeSnapshot.lastUserActivityAt },
    });
    characterRuntime.setState('thinking');
    try {
      const longTermMemorySummary = await proactiveMemoryAdapter.getLongTermSummary(activeCharacterId);
      const context: ProactiveChatContext = {
        characterId: activeCharacterId,
        characterName: character.name,
        persona: [
          character.description,
          memory.personality.join(', '),
          memory.speechStyle.join(', '),
          dailyVoiceDirection && !dailyVoiceDirection.speedOnly
            ? `TEMPORARY FOR TODAY ONLY: ${dailyVoiceDirection.instruction}. Apply this to delivery without changing the character's permanent personality.`
            : '',
        ].filter(Boolean).join('\n'),
        recentConversation: messages.slice(-12).map((message) => ({ role: message.role, text: stripInlineImageData(message.text).slice(0, 500) })),
        longTermMemorySummary,
        recentWorkSummary: recentWorkSummary(),
        idleMs: now - runtimeSnapshot.lastUserActivityAt,
        now: new Date(now),
        provider: routedProvider.labChatProvider === 'gemini' ? 'gemini' : 'openai',
        model: routedProvider.model,
      };
      let result: Awaited<ReturnType<typeof proactiveChatAdapter.generateProactive>> | null = null;
      for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
        try {
          result = await proactiveChatAdapter.generateProactive(context);
        } catch (error) {
          if (attempt === 1) throw error;
        }
      }
      if (!result || character?.id !== activeCharacterId) return;
      const beforeIds = new Set(messages.map((message) => message.id));
      await appendMessage('assistant', result.text, [], {
        aiModels: { conversation: result.actualModel ?? routedProvider.model ?? AI_ROLE_MODELS.conversation },
        ...(dailyVoiceDirection ? { voiceDirection: dailyVoiceDirection } : {}),
      });
      const proactiveMessage = [...messages].reverse().find((message) => !beforeIds.has(message.id) && message.role === 'assistant');
      if (!proactiveMessage) return;
      proactiveMessageIds = { ...proactiveMessageIds, [proactiveMessage.id]: true };
      characterRuntime.recordProactive(now);
      logAITuberEvent('proactive_message', activeCharacterId, {
        origin: 'proactive',
        metadata: { messageId: proactiveMessage.id, actualModel: result.actualModel ?? null },
      });
      if (proactiveSettings.autoPlayVoice) enqueueSpeech(proactiveMessage, 'proactive');
    } catch (error) {
      logAITuberEvent('proactive_skipped', activeCharacterId, {
        origin: 'proactive',
        metadata: { reason: 'generation_failed', message: error instanceof Error ? error.message : String(error) },
      });
    } finally {
      proactiveRunning = false;
      if ((speechQueue?.size() ?? 0) === 0) characterRuntime.setState('idle');
    }
  }
  /** 💭 Thinking Stream: 応答生成中の内部処理（Intent / Memory Search / Emotion / Relationship / Review）を
   *  二層で記録する。
   *    Layer2 = lines: キャラクター内心ログ（一人称の独白）。ユーザーへそのまま表示する。
   *      表示してよいのは 感情・迷い・期待・失敗の振り返り・ユーザーへの印象 のみ。
   *    Layer1 = tech: 技術検討ログ（検索ヒット・スコア・Feature ID等の生データ）。折りたたみの開発者向け表示のみ。
   *  Visual Memoryは内部参照のみで、外見のFeature確認をLayer2に表示してはならない。 */
  type ThinkingKind = 'monologue' | 'debug';
  type ThinkingStreamEntry = { id: number; icon: string; label: string; lines: string[]; tech: string[]; kind: ThinkingKind };
  // 思考レイヤー: notice(気付き) / memory(想起) / emotion(感情) / hypothesis(推測) / relationship(関係) / decision(行動決定)。
  // type は内部・ログ用の付加情報で、表示は従来どおり emoji + text（後方互換: type 無しでも動く）。
  type MonologueThoughtType = 'notice' | 'memory' | 'emotion' | 'hypothesis' | 'relationship' | 'decision';
  type MonologueThought = { emoji: string; text: string; type?: MonologueThoughtType };
  let thinkingStream = $state<ThinkingStreamEntry[]>([]);
  let thinkingStreamOpen = $state(true);
  let thinkingStreamDone = $state(false);
  let thinkingStreamEnabled = $state(true);
  let thinkingStreamSeq = 0;
  /** Inner Monologue（LLM生成）のリビール用キュー。数秒ごとに1件ずつ表示する。 */
  let monologueQueue: MonologueThought[] = [];
  let monologueTimer: ReturnType<typeof setInterval> | undefined;
  const MONOLOGUE_REVEAL_MS = 2500;
  /** 直近の画像生成でValidatorが不足と判定したFeature（次回生成時の回想に使う）。 */
  let lastImageValidationMissing = $state<string[]>([]);
  let preserveAnimationSheetTimeline = $state(true);
  let pendingIntentConfirmation = $state<{
    decision: IntentDecision;
    text: string;
    images: AttachImage[];
    yaml: { name: string; text: string } | null;
  } | null>(null);
  let confirmedIntentDecision = $state<IntentDecision | null>(null);
  let memoryUpdateToast = $state('');
  let memoryUpdateToastTimer: ReturnType<typeof setTimeout> | undefined;
  let labExportToast = $state('');
  let labExportToastTimer: ReturnType<typeof setTimeout> | undefined;
  let memoryReview = $state<MemoryReviewResponse | null>(null);
  let thoughtActionCandidate = $state<ActionCandidate | null>(null);
  let thoughtActionRoute = $state<(IntentDecision & { action?: string; finalAction?: string; pendingAction?: boolean }) | null>(null);
  // 🧠 Observation Mode: 会話モードとは独立した観察専用モード。既存 ChatMode('CHAT_FAST'等) とは別概念。
  type InteractionMode = 'conversation' | 'observation';
  let interactionMode = $state<InteractionMode>('conversation');
  // Observation結果は通常会話メッセージ(messages)とは分離して保持する。
  let thoughtObservations = $state<ThoughtObservation[]>([]);
  let observing = $state(false);
  let reviewingMemory = $state(false);
  let savingReviewMemory = $state(false);
  let savedReviewIndexes = $state<number[]>([]);
  let skippedReviewIndexes = $state<number[]>([]);
  let memoryReviewSaveComment = $state('');
  let memoryReviewSaveDebug = $state<{
    requestPayload?: unknown;
    responseJson?: unknown;
    savedCount?: number;
    savedIds?: string[];
  } | null>(null);
  let memorySearchDebug = $state<MemorySearchDebug | null>(null);
  let relationshipReview = $state<RelationshipReviewResponse | null>(null);
  let reviewingRelationship = $state(false);
  let savingRelationship = $state(false);
  let savedRelationshipIndexes = $state<number[]>([]);
  let skippedRelationshipIndexes = $state<number[]>([]);
  let relationshipSaveComment = $state('');
  let relationshipSaveDebug = $state<{
    requestPayload?: unknown;
    responseJson?: unknown;
    savedCount?: number;
    savedIds?: string[];
  } | null>(null);
  let relationshipSearchDebug = $state<RelationshipSearchDebug | null>(null);
  let emotionReview = $state<EmotionReviewResponse | null>(null);
  let reviewingEmotion = $state(false);
  let savedEmotion = $state<EmotionBrain['current']>(null);
  let emotionSaveComment = $state('');
  let emotionSaveDebug = $state<{
    requestPayload?: unknown;
    responseJson?: unknown;
    latencyMs?: number;
  } | null>(null);
  let emotionSearchDebug = $state<EmotionSearchDebug | null>(null);
  let experienceSearchDebug = $state<ExperienceSearchDebug | null>(null);
  let brainHealth = $state<BrainHealth | null>(null);
  let brainBackups = $state<BrainBackup[]>([]);
  let brainProtectionLoading = $state(false);
  let brainProtectionMessage = $state('');
  let developerMode = $state(false);

  function exportCharacterToLab(): void {
    if (!character) return;
    const imageReferences = imageDataUrl ? [imageDataUrl] : [];
    const payload: LabCharacterExport = {
      version: 1,
      source: 'memorycore',
      exportedAt: new Date().toISOString(),
      id: character.id,
      name: character.name,
      icon: imageDataUrl,
      profile: {
        role: character.role,
        description: character.description,
        memory: {
          personality: [...memory.personality],
          speechStyle: [...memory.speechStyle],
          likes: [...memory.likes],
          dislikes: [...memory.dislikes],
        },
      },
      referenceImages: imageReferences,
      growth: { ...growthValues },
      settings: {},
      videoReferenceImages: imageReferences,
    };
    const registered = importCharacterFromMemorycore(payload);
    if (!registered) return;
    labExportToast = `${character.name}をLABへ登録しました`;
    if (labExportToastTimer) clearTimeout(labExportToastTimer);
    labExportToastTimer = setTimeout(() => { labExportToast = ''; }, 2800);
  }

  // AI Router: the engine assigned to the current character (Personality Engine).
  let routedProvider = $state<RoutedProvider>(routeProvider('AUTO'));
  let aiProfile = $state({ brainAI: 'AUTO', conversationAI: 'INHERIT', storyCardAI: 'INHERIT', motionPromptAI: 'INHERIT', characterAnalysisAI: 'INHERIT', intentRouterAI: 'INHERIT', imageAI: 'GPT Image', videoAI: 'MiniMax H3', voiceAI: 'Irodori', memoryEnabled: true, reflectionTendency: 'balanced' as ReflectionTendency });

  // Advanced Studio Settings（開発者向けロールAI）。開始画面から移動した項目を
  // サイドバーで編集し、既存の /api/character-settings にそのまま保存する。
  let savingAiProfile = $state(false);
  let aiProfileSaveNote = $state('');
  const selectedVideoAiHelp = $derived(VIDEO_AI_SELECT_OPTIONS.find((option) => option.id === aiProfile.videoAI)?.help ?? '');

  async function saveAiProfile(): Promise<void> {
    if (!selectedId) return;
    savingAiProfile = true;
    aiProfileSaveNote = '';
    try {
      const response = await fetch('/api/character-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: selectedId, provider: aiProfile.brainAI, aiProfile }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'AI設定の保存に失敗しました。');
      aiProfileSaveNote = `保存しました (${new Date().toLocaleTimeString('ja-JP')})`;
    } catch (saveError) {
      aiProfileSaveNote = saveError instanceof Error ? saveError.message : String(saveError);
    } finally {
      savingAiProfile = false;
    }
  }

  // 🧠 Growth System V3 — 送信時にユーザーの文章だけを見てキーワード一致で加算し、履歴を可視化する。
  // AI返答では変化させない。emotion / 表情 / 画像生成 / Memory保存 / AIモデル切替 とは無関係。
  // 値・履歴は永続化しない（in-memory のみ。character-memory.json には一切書き込まない）。
  let growthValues = $state<GrowthValues>(initialGrowthValues());
  let growthHistory = $state<GrowthHistoryEntry[]>([]);
  // V7: レーダーをアニメーション表示するための「描画用」値（rAFで growthValues へ補間）。
  let displayGrowthValues = $state<GrowthValues>(initialGrowthValues());
  // V7: 今回の変化（3秒で自動消去）。
  let recentChange = $state<GrowthLogEntry[]>([]);
  let recentChangeTimer: ReturnType<typeof setTimeout> | undefined;
  let growthAnimFrame: number | undefined;

  // V4: 成長値から導出する Personality Type（数値は変更しない・表示用のみ）。
  const personalityType = $derived(determinePersonalityType(growthValues));
  // V5/V7: 成長レーダー。描画用の補間値に追従してアニメーションする。
  const radar = $derived(buildRadarChart(displayGrowthValues));
  // V7: 最近の傾向（現在値＋直近履歴から簡易生成）。
  const growthTrends = $derived(summarizeGrowthTrends(growthValues, growthHistory));

  // V7: 旧値→新値へ 1秒かけて滑らかに補間（easeOutCubic）。カクつき防止に rAF を使用。
  function animateGrowthTo(target: GrowthValues): void {
    if (typeof requestAnimationFrame === 'undefined') {
      displayGrowthValues = { ...target };
      return;
    }
    if (growthAnimFrame !== undefined) cancelAnimationFrame(growthAnimFrame);
    const start: GrowthValues = { ...displayGrowthValues };
    const startTime = performance.now();
    const duration = 1000; // 0.8〜1.2s の中央
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const k = ease(progress);
      const next = {} as GrowthValues;
      for (const key of Object.keys(target) as GrowthKey[]) {
        next[key] = Math.round(start[key] + (target[key] - start[key]) * k);
      }
      displayGrowthValues = next;
      growthAnimFrame = progress < 1 ? requestAnimationFrame(step) : undefined;
    };
    growthAnimFrame = requestAnimationFrame(step);
  }

  onDestroy(() => {
    if (growthAnimFrame !== undefined) cancelAnimationFrame(growthAnimFrame);
    if (recentChangeTimer) clearTimeout(recentChangeTimer);
    if (idleTimer) clearTimeout(idleTimer);
    clearBrainTimers();
    if (energyAnimFrame !== undefined) cancelAnimationFrame(energyAnimFrame);
    if (proactiveTimer) clearInterval(proactiveTimer);
    stopRunpodVoiceSession();
    unsubscribeRuntime?.();
    commentQueue?.dispose();
    speechQueue?.dispose();
    void aituberBridge?.dispose();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', recordPageActivity);
      window.removeEventListener('keydown', recordPageActivity);
    }
  });

  function recordPageActivity(): void {
    characterRuntime.recordUserActivity();
    // Unlock Web Audio during the user's click/keydown. RunPod synthesis is
    // asynchronous, so waiting until the WAV arrives is too late in browsers
    // that enforce transient media activation.
    aituberBridge?.unlockAudio();
  }

  // 送信ボタン押下時のみ呼ぶ。ユーザー入力テキストだけを評価して数値を変動させ、履歴へ記録する。
  function applyGrowthFromUserText(userText: string): void {
    const delta = evaluateGrowth(userText);
    const changes = growthLogEntries(delta);
    if (changes.length === 0) return;
    for (const key of Object.keys(delta) as GrowthKey[]) {
      growthValues[key] = clampGrowth(growthValues[key] + (delta[key] ?? 0));
    }
    const entry: GrowthHistoryEntry = {
      id: `growth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      message: growthMessageSnippet(userText),
      changes,
    };
    // 最新を先頭に。最新5件のみ保持（古い履歴は自動削除）。
    growthHistory = [entry, ...growthHistory].slice(0, GROWTH_HISTORY_LIMIT);

    // V7: レーダーを新値へアニメーション補間し、「今回の変化」を3秒間だけ表示。
    animateGrowthTo({ ...growthValues });
    recentChange = changes;
    if (recentChangeTimer) clearTimeout(recentChangeTimer);
    recentChangeTimer = setTimeout(() => { recentChange = []; }, 3000);
  }

  // 📜 Thinking Log V10 — AIが「思っているけど口には出さないセリフ」を観測するログ。
  // 送信時にユーザー入力をキーワード判定し、Thinking候補を追記する（AI生成・LLM推論なし）。
  // 最大10件（古いものから削除）。in-memoryのみで character-memory.json には一切書き込まない。
  let thinkingLog = $state<ThinkingLog[]>([]);

  // 送信ボタン押下時のみ呼ぶ。ユーザー入力テキストだけをキーワード判定し、一致時に1件追記する。
  // 末尾に追加（新しいものが下）。10件を超えたら先頭（古いもの）から削除。
  function applyThinkingFromUserText(
    userText: string,
    fallback?: Pick<BrainLayers, 'interpretation' | 'selfComment'> | null,
  ): void {
    const thinking = evaluateThinking(userText) ?? (fallback
      ? { thought: fallback.interpretation, selfComment: fallback.selfComment }
      : null);
    if (!thinking) return;
    const entry: ThinkingLog = {
      id: `thinking-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      thought: thinking.thought,
      selfComment: thinking.selfComment,
    };
    thinkingLog = [...thinkingLog, entry].slice(-THINKING_LOG_LIMIT);
  }

  // 🧠 Emotion State V11 — Thinking Influence の現在の温度感（常に1つだけ表示）。
  // 送信時にユーザー入力から導出し、返答の語尾・一文だけへ反映する。AI生成は変更しない。
  let currentEmotion = $state<EmotionState | null>(null);

  // 送信ボタン押下時のみ呼ぶ。一致した感情があれば currentEmotion を更新（0.3秒フェード）。
  function applyEmotionFromUserText(userText: string): void {
    const emotion = evaluateEmotion(userText);
    if (emotion) currentEmotion = emotion;
  }

  // 🧠 Character Brain V2 — 会話の流れを引き継ぐ継続思考の擬似思考レイヤー。
  // ルールベースのみ（AI推論・LLM内部思考なし）。in-memoryのみで永続化しない。
  let brainLayers = $state<BrainLayers | null>(null);
  // ③ Previous Brain Context（直近のBrain状態。次ターンの継続判定に使う。永続化しない）。
  let brainContext = $state<BrainContext | null>(null);
  // 上から順に出すための「表示済みレイヤー数」。0.2/0.3/0.4/0.5/0.6秒で 1→…→5 と増やす。
  let brainVisibleCount = $state(0);
  let brainTimers: ReturnType<typeof setTimeout>[] = [];
  // ⑥ Brain Energy バーを0.5秒で滑らかに変化させる「描画用」値（rAFで補間）。
  let displayEnergy = $state(0);
  let energyAnimFrame: number | undefined;

  function clearBrainTimers(): void {
    for (const timer of brainTimers) clearTimeout(timer);
    brainTimers = [];
  }

  // ⑥ Brain Energy を現在値→目標値へ 0.5秒かけて補間（easeOutCubic）。
  function animateEnergyTo(target: number): void {
    if (typeof requestAnimationFrame === 'undefined') { displayEnergy = target; return; }
    if (energyAnimFrame !== undefined) cancelAnimationFrame(energyAnimFrame);
    const start = displayEnergy;
    const startTime = performance.now();
    const duration = 500;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      displayEnergy = Math.round(start + (target - start) * ease(progress));
      energyAnimFrame = progress < 1 ? requestAnimationFrame(step) : undefined;
    };
    energyAnimFrame = requestAnimationFrame(step);
  }

  // 送信ボタン押下時のみ呼ぶ。直近Brain状態を引き継いで継続思考を生成し、上から順にフェード表示。
  function applyBrainFromUserText(userText: string): ReturnType<typeof advanceBrain> {
    const result = advanceBrain(userText, brainContext, character?.name ?? '');
    if (!result) return null;
    clearBrainTimers();
    brainLayers = result.layers;
    brainContext = result.context;
    brainVisibleCount = 0;
    animateEnergyTo(result.layers.energy);
    // 🎯Theme→🧠Energy→🧠解釈→💭連想→🤣ツッコミ→🫀Emotion を上から順にフェード表示。
    [200, 300, 400, 500, 600, 700].forEach((delay, index) => {
      brainTimers.push(setTimeout(() => { brainVisibleCount = index + 1; }, delay));
    });
    return result;
  }

  // 感情システムは将来用に予約（emotion: 'normal' 相当）。今回はUI表示しない／表情変化は未実装。

  // 📚 Character Story Pack V3 — 漫画制作の企画ワークスペース。
  // Story Ref（カテゴリ付き）＋Gag Generator＋Story Dynamics＋Story Timeline＋強化YAML。
  // キャラIDごとに独立して in-memory 保持（混在禁止・永続化なし・リロードで消える）。
  // character-memory.json には一切書き込まない。画像生成・動画生成は行わない。
  let storyRefsByChar = $state<Record<string, StoryRef[]>>({});
  let storyYamlByChar = $state<Record<string, string>>({});
  let storyScenesByChar = $state<Record<string, StoryScene[]>>({});
  let storyGagByChar = $state<Record<string, { category: string; idea: string }>>({});
  // Upload V1: 直近アップロードの警告メッセージ。in-memory・キャラ切替でクリア。
  let storyUploadError = $state('');
  // UI Cleanup V1: 添付済み表示用に、読み込んだ STORY YAML のファイル名をキャラ別に保持（内部用）。
  let storyYamlNameByChar = $state<Record<string, string>>({});

  // 🪟 Vision Bridge V1 — 次の送信に添付する「添付キュー」（キャラ別・in-memory）。
  // StoryRef とは別物。送信成功後にキューはクリアし、StoryRef には残す。
  let attachImagesByChar = $state<Record<string, AttachImage[]>>({});
  let attachYamlByChar = $state<Record<string, { name: string; text: string }>>({});
  let lastGeneratedSceneByChar = $state<Record<string, LastGeneratedScene>>({});
  const PROJECT_ONLY_WORKSPACE_KEY = '__project_only__';
  const activeWorkspaceKey = $derived(projectOnlyMode ? PROJECT_ONLY_WORKSPACE_KEY : selectedId);
  const attachImages = $derived<AttachImage[]>(activeWorkspaceKey ? (attachImagesByChar[activeWorkspaceKey] ?? []) : []);
  const attachYaml = $derived<{ name: string; text: string } | null>(
    activeWorkspaceKey ? (attachYamlByChar[activeWorkspaceKey] ?? null) : null,
  );
  // ⑤ チャットログ表示用: メッセージIDごとの添付サマリ（in-memory・永続化しない）。
  let attachLogByMessageId = $state<Record<string, { images: number; yaml: string }>>({});

  function clearAttachQueue(): void {
    const workspaceKey = activeWorkspaceKey;
    if (!workspaceKey) return;
    console.log('[CHARACTER_MEMORY_ATTACH_CLEAR_BEFORE]', {
      characterId: selectedCharacterId,
      attachImages: attachImagesByChar[workspaceKey]?.map((image, index) => imageRefMeta(image.dataUrl, index, 'attachQueue')) ?? [],
      attachYaml: attachYamlByChar[workspaceKey]?.name ?? '',
    });
    attachImagesByChar = { ...attachImagesByChar, [workspaceKey]: [] };
    attachYamlByChar = { ...attachYamlByChar, [workspaceKey]: { name: '', text: '' } };
    console.log('[CHARACTER_MEMORY_ATTACH_CLEAR_AFTER]', {
      characterId: selectedCharacterId,
      attachImages: attachImagesByChar[workspaceKey]?.length ?? 0,
      attachYaml: attachYamlByChar[workspaceKey]?.name ?? '',
    });
  }

  function removeAttachImage(index: number): void {
    const workspaceKey = activeWorkspaceKey;
    if (!workspaceKey) return;
    const current = attachImagesByChar[workspaceKey] ?? [];
    const removed = current[index];
    attachImagesByChar = {
      ...attachImagesByChar,
      [workspaceKey]: current.filter((_, i) => i !== index),
    };
    console.log('[CHARACTER_MEMORY_ATTACH_REMOVE_IMAGE]', {
      characterId: selectedCharacterId,
      index,
      removed: removed ? imageRefMeta(removed.dataUrl, index, 'removedAttachImage') : null,
      remaining: attachImagesByChar[workspaceKey]?.map((image, i) => imageRefMeta(image.dataUrl, i, 'attachQueue')) ?? [],
    });
  }

  function clearAttachYaml(): void {
    const workspaceKey = activeWorkspaceKey;
    if (!workspaceKey) return;
    const removed = attachYamlByChar[workspaceKey];
    attachYamlByChar = { ...attachYamlByChar, [workspaceKey]: { name: '', text: '' } };
    console.log('[CHARACTER_MEMORY_ATTACH_REMOVE_YAML]', {
      characterId: selectedCharacterId,
      removedName: removed?.name ?? '',
    });
  }

  // 現在のキャラの各種状態（キャラ切替で自動的に切り替わる）。
  const storyRefs = $derived<StoryRef[]>(selectedId ? (storyRefsByChar[selectedId] ?? []) : []);
  const currentStoryYaml = $derived<string>(selectedId ? (storyYamlByChar[selectedId] ?? '') : '');
  const storyScenes = $derived<StoryScene[]>(selectedId ? (storyScenesByChar[selectedId] ?? []) : []);
  const storyGagCategory = $derived<string>(selectedId ? (storyGagByChar[selectedId]?.category ?? '') : '');
  const storyGagIdea = $derived<string>(selectedId ? (storyGagByChar[selectedId]?.idea ?? '') : '');
  const gagCandidates = $derived<string[]>(storyGagCategory ? gagIdeas(storyGagCategory) : []);

  // 生成済み（scenesがある）場合のみ、現在の Ref/Gag/Scene から YAML を再構築して同期する。
  function syncStoryYaml(id: string): void {
    if (!character || !storyScenesByChar[id]) return;
    const draft = buildStoryDraft({
      characterName: character.name,
      messages: messages.map((message) => ({ role: message.role, text: message.text })),
      refs: storyRefsByChar[id] ?? [],
      gagCategory: storyGagByChar[id]?.category,
      gagIdea: storyGagByChar[id]?.idea,
      scenes: storyScenesByChar[id],
    });
    storyYamlByChar = { ...storyYamlByChar, [id]: storyDraftToYaml(draft) };
  }

  function setStoryRefs(refs: StoryRef[]): void {
    if (!selectedId) return;
    storyRefsByChar = { ...storyRefsByChar, [selectedId]: refs };
    syncStoryYaml(selectedId);
  }

  // ＋画像追加。複数選択可・最大10枚まで（超過分は無視）。in-memory（data URL）。
  async function onAddStoryRef(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!selectedId || files.length === 0) return;
    const current = storyRefsByChar[selectedId] ?? [];
    const room = STORY_REF_LIMIT - current.length;
    if (room <= 0) {
      errorMessage = `Story Refは最大${STORY_REF_LIMIT}枚までです。`;
      return;
    }
    const added: StoryRef[] = [];
    for (const file of files.slice(0, room)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        added.push(createStoryRef(file.name, dataUrl));
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    }
    if (added.length > 0) setStoryRefs([...current, ...added]);
  }

  function removeStoryRef(id: string): void {
    if (!selectedId) return;
    setStoryRefs((storyRefsByChar[selectedId] ?? []).filter((ref) => ref.id !== id));
  }

  function readFileAsText(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました。'));
      reader.readAsText(file);
    });
  }

  // 入力欄横の「画像」ボタン拡張。複数画像→Story Ref(最大10)、.yaml/.yml→STORY YAML。
  // 画像とYAMLの混在選択に対応。失敗しても落とさず、結果を Story Workspace に表示する。
  async function onUploadStoryFiles(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await processStoryFiles(files);
  }

  async function onDropStoryFiles(event: DragEvent): Promise<void> {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);
    await processStoryFiles(files);
  }

  async function processStoryFiles(files: File[]): Promise<void> {
    const workspaceKey = activeWorkspaceKey;
    if (!workspaceKey || files.length === 0) return;
    storyUploadError = '';

    const isYaml = (file: File) =>
      /\.ya?ml$/i.test(file.name) || file.type === 'application/x-yaml' || file.type === 'text/yaml';
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const yamlFiles = files.filter((file) => !file.type.startsWith('image/') && isYaml(file));
    const otherCount = files.length - imageFiles.length - yamlFiles.length;

    const errors: string[] = [];

    // ① 画像 → Story Ref（最大10枚・超過分は無視して警告）。内部ロジックは維持。
    if (imageFiles.length > 0) {
      const current = storyRefsByChar[workspaceKey] ?? [];
      const attachCurrent = attachImagesByChar[workspaceKey] ?? [];
      const storyRoom = STORY_REF_LIMIT - current.length;
      const attachRoom = MAX_REFERENCE_IMAGES - attachCurrent.length;
      const room = Math.max(storyRoom, attachRoom);
      if (room <= 0) {
        errors.push(`Story Refは最大${STORY_REF_LIMIT}枚です。画像は追加できませんでした。`);
      } else {
        const picked = imageFiles.slice(0, room);
        const added: StoryRef[] = [];
        const queued: AttachImage[] = [];
        for (const [index, file] of picked.entries()) {
          try {
            const dataUrl = await readFileAsDataUrl(file);
            if (index < storyRoom) added.push(createStoryRef(file.name, dataUrl));
            // Vision Bridge: 次の送信に渡す添付キューへも積む（StoryRefとは別管理）。
            if (index < attachRoom) queued.push({ name: file.name, dataUrl, mime: file.type || 'image/png' });
          } catch {
            errors.push(`${file.name} の読み込みに失敗しました。`);
          }
        }
        if (added.length > 0) setStoryRefs([...current, ...added]);
        if (queued.length > 0) {
          attachImagesByChar = {
            ...attachImagesByChar,
            [workspaceKey]: [...attachCurrent, ...queued],
          };
        }
        const overflow = imageFiles.length - picked.length;
        if (overflow > 0) errors.push(`最大${MAX_REFERENCE_IMAGES}枚を超えた${overflow}枚は無視しました。`);
      }
    }

    // ② YAML → STORY YAML（複数選択時は最後の1件を反映）。内部ロジックは維持。
    if (yamlFiles.length > 0) {
      const file = yamlFiles[yamlFiles.length - 1];
      try {
        const text = await readFileAsText(file);
        storyYamlByChar = { ...storyYamlByChar, [workspaceKey]: text };
        storyYamlNameByChar = { ...storyYamlNameByChar, [workspaceKey]: file.name };
        // Vision Bridge: 次の送信に渡す添付キューへも YAML を積む。
        attachYamlByChar = { ...attachYamlByChar, [workspaceKey]: { name: file.name, text } };
        // 可能なら scenes を Story Timeline（内部）へ反映（失敗しても落とさない）。
        try {
          const scenes = parseScenesFromYaml(text);
          if (scenes.length > 0) storyScenesByChar = { ...storyScenesByChar, [workspaceKey]: scenes };
        } catch {
          // パース失敗は無視（YAMLテキストの反映は維持）。
        }
      } catch {
        errors.push(`YAMLを読み込めませんでした（${file.name}）`);
      }
    }

    if (otherCount > 0) errors.push(`未対応のファイル${otherCount}件は無視しました。`);

    storyUploadError = errors.join(' ');
  }

  // ① Story Ref のカテゴリ変更。
  function setStoryRefCategory(id: string, category: StoryRefCategory): void {
    if (!selectedId) return;
    setStoryRefs((storyRefsByChar[selectedId] ?? []).map((ref) =>
      ref.id === id ? { ...ref, category } : ref));
  }

  // 並び替え（上/下へ1つ移動）。
  function moveStoryRef(id: string, direction: -1 | 1): void {
    if (!selectedId) return;
    const refs = [...(storyRefsByChar[selectedId] ?? [])];
    const index = refs.findIndex((ref) => ref.id === id);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= refs.length) return;
    [refs[index], refs[target]] = [refs[target], refs[index]];
    setStoryRefs(refs);
  }

  // ② Gag Generator: カテゴリ選択（ネタ候補は gagCandidates へ自動反映、ideaはリセット）。
  function setGagCategory(category: string): void {
    if (!selectedId) return;
    const next = category === storyGagByChar[selectedId]?.category ? '' : category;
    storyGagByChar = { ...storyGagByChar, [selectedId]: { category: next, idea: '' } };
    syncStoryYaml(selectedId);
  }

  function setGagIdea(idea: string): void {
    if (!selectedId) return;
    const current = storyGagByChar[selectedId] ?? { category: '', idea: '' };
    storyGagByChar = { ...storyGagByChar, [selectedId]: { ...current, idea } };
    syncStoryYaml(selectedId);
  }

  // ④ Story Timeline: セリフ編集（必須項目。空なら警告表示）。
  function setSceneDialogue(sceneId: string, dialogue: string): void {
    if (!selectedId) return;
    storyScenesByChar = {
      ...storyScenesByChar,
      [selectedId]: (storyScenesByChar[selectedId] ?? []).map((scene) =>
        scene.id === sceneId ? { ...scene, dialogue } : scene),
    };
    syncStoryYaml(selectedId);
  }

  function buildCurrentDraft(id: string) {
    return buildStoryDraft({
      characterName: character?.name ?? '',
      messages: messages.map((message) => ({ role: message.role, text: message.text })),
      refs: storyRefsByChar[id] ?? [],
      gagCategory: storyGagByChar[id]?.category,
      gagIdea: storyGagByChar[id]?.idea,
      scenes: storyScenesByChar[id],
    });
  }

  // ②/④/⑤ 会話から生成: 4コマ構成（起承転結）を新規生成し、YAML を出力する。
  function generateStory(): void {
    if (!character || !selectedId) return;
    const draft = buildStoryDraft({
      characterName: character.name,
      messages: messages.map((message) => ({ role: message.role, text: message.text })),
      refs: storyRefsByChar[selectedId] ?? [],
      gagCategory: storyGagByChar[selectedId]?.category,
      gagIdea: storyGagByChar[selectedId]?.idea,
      // scenes 未指定 → 起承転結を新規生成。
    });
    storyScenesByChar = { ...storyScenesByChar, [selectedId]: draft.scenes };
    storyYamlByChar = { ...storyYamlByChar, [selectedId]: storyDraftToYaml(draft) };
  }

  function setStoryYaml(text: string): void {
    if (!selectedId) return;
    storyYamlByChar = { ...storyYamlByChar, [selectedId]: text };
  }

  // 🎨 Comic Pipeline V4 — プロバイダ選択（キャラごと独立・in-memory）。
  let comicProviderByChar = $state<Record<string, ComicProvider>>({});
  const comicProvider = $derived<ComicProvider>(
    selectedId ? (comicProviderByChar[selectedId] ?? 'AUTO') : 'AUTO',
  );

  function setComicProvider(provider: ComicProvider): void {
    if (!selectedId) return;
    comicProviderByChar = { ...comicProviderByChar, [selectedId]: provider };
  }

  // ⑤⑥ 漫画生成: StoryDraft → ComicDraft → Prompt → Provider解決まで（API実行はしない）。
  function generateComic(): void {
    if (!selectedId) return;
    const storyDraft = buildCurrentDraft(selectedId);
    const provider = routeComicProvider(comicProvider);
    const comicDraft = generateComicDraft(storyDraft, storyRefsByChar[selectedId] ?? [], provider);
    const prompt = buildComicPrompt(storyDraft);
    console.log({ provider, comicDraft, prompt });
  }

  onMount(() => {
    developerMode = page.url.searchParams.get('dev') === '1'
      || page.url.searchParams.get('developer') === '1'
      || localStorage.getItem('developerMode') === 'true'
      || localStorage.getItem('ai-vtuber-developer-mode') === 'true';
	void enumerateStoryCardStorage();
    unsubscribeRuntime = characterRuntime.subscribe((snapshot) => { runtimeSnapshot = snapshot; });
    aituberBridge = new AITuberBridge(avatarState);
    // The speech request is also the RunPod wake request. Do not gate it behind
    // a second warm-up job; that doubles the queue and can prevent chat audio
    // from ever reaching the worker while GPUs are in short supply.
    speechQueue = new SpeechQueue(new ExistingVoiceBridgeAdapter(), {
      queued: (request) => {
        syncSpeechQueueSize();
        runpodVoiceLastActivityAt = Date.now();
        if (runpodVoiceState === 'warm') scheduleRunpodVoiceUpdate();
        voiceStateByMessageId = { ...voiceStateByMessageId, [request.messageId]: 'loading' };
        characterRuntime.setState('generating_voice');
        logAITuberEvent('speech_queued', request.characterId, { origin: request.origin, metadata: { messageId: request.messageId } });
      },
      resolved: (request, source) => {
        // The real speech request performs the cold start. Once it succeeds,
        // attach the short voice-only keepalive session so follow-up replies
        // reuse the same warm worker. It stops automatically after the app's
        // configured idle window and never starts Qwen/reflection/video.
        runpodVoiceLastActivityAt = Date.now();
        if (runpodVoiceConfigured && runpodVoiceSelected) {
          if (runpodVoiceState === 'off' || runpodVoiceState === 'error') void startRunpodVoiceSession();
          else scheduleRunpodVoiceUpdate();
        }
        voiceUrlByMessageId = { ...voiceUrlByMessageId, [request.messageId]: source.url };
        if (source.backend) {
          voiceBackendByMessageId = { ...voiceBackendByMessageId, [request.messageId]: source.backend };
          lastRunpodVoiceBackend = source.backend;
        }
        rememberVoiceCandidate(request.characterId, request.messageId, source.url);
        if (request.voiceCaption && !request.preserveBaseVoice) {
          voiceDraftMessageId = request.messageId;
          voiceSavedMessageId = '';
          voiceWorkflowMessage = '候補を生成しました。気に入ったら「この声を基本声にする」を選べます。';
        }
      },
      started: (request) => {
        syncSpeechQueueSize();
        voiceStateByMessageId = { ...voiceStateByMessageId, [request.messageId]: 'playing' };
        characterRuntime.setState('speaking');
        aituberBridge?.speechStarted(existingEmotionForMessage(request.messageId));
        logAITuberEvent('speech_started', request.characterId, { origin: request.origin, metadata: { messageId: request.messageId } });
      },
      finished: (request) => {
        syncSpeechQueueSize();
        const { [request.messageId]: _finished, ...rest } = voiceStateByMessageId;
        voiceStateByMessageId = rest;
        aituberBridge?.speechFinished();
        logAITuberEvent('speech_finished', request.characterId, { origin: request.origin, metadata: { messageId: request.messageId } });
      },
      failed: (request, error) => {
        syncSpeechQueueSize();
        voiceStateByMessageId = { ...voiceStateByMessageId, [request.messageId]: 'error' };
        aituberBridge?.speechFailed();
        logAITuberEvent('speech_failed', request.characterId, {
          origin: request.origin,
          metadata: { messageId: request.messageId, message: error instanceof Error ? error.message : String(error) },
        });
      },
      idle: () => {
        syncSpeechQueueSize();
        characterRuntime.setState(isAITuberBusy() ? runtimeSnapshot.state : 'idle');
      },
    }, (url) => aituberBridge!.createAudio(url, voiceOutputEffectMode));
    commentQueue = new CommentQueue(
      {
        isBusy: isCommentDeliveryBusy,
        deliver: async (delivery) => {
          // 既存の送信経路(Intent Router含む)をそのまま通す。promptと表示の分離は送信経路が対応するまで同一文言。
          inputText = delivery.prompt;
          await sendMessage();
        },
      },
      {
        received: (comments) => {
          syncCommentQueueSize();
          if (character) logAITuberEvent('comment_received', character.id, { metadata: { count: comments.length } });
        },
        delivered: (delivery) => {
          syncCommentQueueSize();
          if (character) {
            logAITuberEvent('comment_delivered', character.id, {
              metadata: { commentId: delivery.comment.id, platform: delivery.comment.platform, author: delivery.comment.authorName },
            });
          }
        },
        dropped: (comment, reason) => {
          syncCommentQueueSize();
          if (character) logAITuberEvent('comment_dropped', character.id, { metadata: { commentId: comment.id, reason } });
        },
      },
      { buildPrompt: buildDefaultCommentDisplayText },
    );
    commentQueue.attachSource(localCommentSource);
    commentQueue.startAutoFlush(1000);
    youtubeCommentLiveId = localStorage.getItem('ai-vtuber:youtube-comment-live-id') ?? '';
    youtubeCommentApiKey = localStorage.getItem('ai-vtuber:youtube-comment-api-key') ?? '';
	    const requestedBroadcastMode = page.url.searchParams.get('broadcast');
	    broadcastMode = requestedBroadcastMode === '1' || requestedBroadcastMode === 'true'
	      ? true
	      : requestedBroadcastMode === '0' || requestedBroadcastMode === 'false'
	        ? false
	        : localStorage.getItem('ai-vtuber:broadcast-mode') === 'true';
	    if (requestedBroadcastMode !== null) {
	      localStorage.setItem('ai-vtuber:broadcast-mode', String(broadcastMode));
	    }
    proactiveTimer = setInterval(() => void runProactiveConversation(), 15_000);
    window.addEventListener('pointerdown', recordPageActivity, { passive: true });
    window.addEventListener('keydown', recordPageActivity);
    void loadRunpodVoiceSessionConfig();
    void loadInitial();
  });

  async function loadInitial(): Promise<void> {
    if (developerMode) void loadBrainProtection();
    await loadCharacterList();
    const requestedId = page.url.searchParams.get('id')?.trim().toLowerCase();
    if (requestedId && characters.some((entry) => entry.id === requestedId)) {
      await selectCharacter(requestedId);
    }
  }

  async function loadBrainProtection(): Promise<void> {
    brainProtectionLoading = true;
    brainProtectionMessage = '';
    try {
      const response = await fetch('/api/character-memory/backups');
      const data = await response.json().catch(() => ({})) as { backups?: BrainBackup[]; health?: BrainHealth; message?: string };
      if (!response.ok) throw new Error(data.message ?? `Brain Protection failed: HTTP ${response.status}`);
      brainBackups = Array.isArray(data.backups) ? data.backups : [];
      brainHealth = data.health ?? null;
    } catch (error) {
      brainProtectionMessage = error instanceof Error ? error.message : String(error);
    } finally {
      brainProtectionLoading = false;
    }
  }

  async function restoreBrainBackup(filename: string): Promise<void> {
    if (!filename || brainProtectionLoading) return;
    brainProtectionLoading = true;
    brainProtectionMessage = '';
    try {
      const response = await fetch('/api/character-memory/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; health?: BrainHealth; message?: string };
      if (!response.ok || data.ok !== true) throw new Error(data.message ?? `Brain restore failed: HTTP ${response.status}`);
      brainProtectionMessage = `Restored ${filename}`;
      brainHealth = data.health ?? brainHealth;
      await loadBrainProtection();
      await loadCharacterList();
      if (selectedId) {
        const restoreSelectedId = selectedId;
        selectedId = '';
        await selectCharacter(restoreSelectedId);
      }
    } catch (error) {
      brainProtectionMessage = error instanceof Error ? error.message : String(error);
    } finally {
      brainProtectionLoading = false;
    }
  }

  function routineStatus(): { icon: string; label: string; text: string } {
    if (routineBrain.currentState === 'Morning') return { icon: '☀', label: 'Morning', text: 'Morning Routine' };
    if (routineBrain.currentState === 'Thinking') return { icon: '💭', label: 'Thinking', text: '少し考えています…' };
    if (routineBrain.currentState === 'Sleeping') return { icon: '🌙', label: 'Sleeping', text: '眠っています' };
    return { icon: '🟢', label: 'Active', text: 'Active' };
  }
  const routineStatusInfo = $derived(routineStatus());

  function shouldRunMorningRoutine(): boolean {
    if (!character) return false;
    const today = new Date().toISOString().slice(0, 10);
    const routineDay = routineBrain.updatedAt ? new Date(routineBrain.updatedAt).toISOString().slice(0, 10) : '';
    return routineBrain.currentState === 'Sleeping' || !routineBrain.morningGreeting || routineDay !== today;
  }

  async function updateRoutineState(state: RoutineBrain['currentState'], summary: string): Promise<void> {
    if (!character) return;
    const payload = { characterId: character.id, state, summary };
    try {
      const response = await fetch('/api/character-routine/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({})) as RoutineStateResponse & { message?: string };
      if (!response.ok || data.ok !== true) throw new Error(data.message ?? `Routine state failed: HTTP ${response.status}`);
      routineBrain = data.routine;
      routineDebug = {
        currentState: data.routine.currentState,
        lastSleep: data.routine.lastSleepTime,
        todaySummary: data.routine.todaySummary,
        todayGoal: data.routine.todayGoal,
        requestPayload: payload,
        responseJson: data,
      };
    } catch (error) {
      routineDebug = {
        currentState: routineBrain.currentState,
        lastSleep: routineBrain.lastSleepTime,
        todaySummary: routineBrain.todaySummary,
        todayGoal: routineBrain.todayGoal,
        requestPayload: payload,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function resetIdleTimer(): void {
    if (idleTimer) clearTimeout(idleTimer);
    if (!character || routineBrain.currentState === 'Sleeping') return;
    idleTimer = setTimeout(() => {
      routineMessage = character?.name ? `${character.name}は少し考えています…` : '少し考えています…';
      void updateRoutineState('Thinking', 'Idle timeout: moving from Active to Thinking.');
    }, 10 * 60 * 1000);
  }

  async function runMorningRoutine(): Promise<void> {
    if (!character || !shouldRunMorningRoutine()) return;
    const payload = { characterId: character.id };
    routineDebug = {
      currentState: routineBrain.currentState,
      lastSleep: routineBrain.lastSleepTime,
      todaySummary: routineBrain.todaySummary,
      todayGoal: routineBrain.todayGoal,
      requestPayload: payload,
    };
    try {
      const response = await fetch('/api/character-routine/morning', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({})) as RoutineMorningResponse & { message?: string };
      if (!response.ok || data.ok !== true) throw new Error(data.message ?? `Morning Routine failed: HTTP ${response.status}`);
      routineBrain = data.routine;
      routineMessage = data.greeting;
      routineDebug = {
        currentState: data.routine.currentState,
        lastSleep: data.routine.lastSleepTime,
        todaySummary: data.todaySummary,
        todayGoal: data.todayGoal,
        requestPayload: payload,
        responseJson: data,
      };
    } catch (error) {
      routineDebug = {
        currentState: routineBrain.currentState,
        lastSleep: routineBrain.lastSleepTime,
        todaySummary: routineBrain.todaySummary,
        todayGoal: routineBrain.todayGoal,
        requestPayload: payload,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function isNightRoutineRequest(text: string): boolean {
    return /おやすみ|お休み|寝るね|今日はここまで|会話終了/u.test(text);
  }

  async function loadCharacterList(): Promise<void> {
    loadingList = true;
    errorMessage = '';
    try {
      const response = await fetch('/api/character-memory');
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Character list load failed');
      characters = Array.isArray(data.characters) ? data.characters : [];
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      loadingList = false;
    }
  }

  async function selectProjectOnly(): Promise<void> {
    if (projectOnlyMode || loadingCharacter) return;
    speechQueue?.clear();
    syncSpeechQueueSize();
    characterRuntime.selectCharacter('');
    await resetStoryCardState({
      reason: 'character-switch',
      clearBrowserStorage: false,
      clearAttachments: true,
      preserveProjectMedia: true,
    });
    selectedId = '';
    selectedCharacterId = null;
    projectOnlyMode = true;
    character = {
      id: PROJECT_ONLY_WORKSPACE_KEY,
      name: 'Project Only',
      role: '',
      description: 'キャラクター記憶を使用しない動画制作モード',
      visualMemory: emptyCharacterVisualMemory(),
    };
    messages = [];
    memory = emptyMemory();
    memoryV2 = emptyMemoryV2();
    characterVisualMemory = emptyCharacterVisualMemory();
    visualMemoryOwnerId = '';
    visualMemoryDraft = emptyCharacterVisualMemory();
    visualMemories = [];
    imageDataUrl = '';
    pendingIntentConfirmation = null;
    confirmedIntentDecision = null;
    errorMessage = '';
    console.log('[CHARACTER_SELECTION]', {
      selectedCharacterId: null,
      mode: 'project-only',
    });
  }

	  async function selectCharacter(id: string): Promise<void> {
	    if ((!projectOnlyMode && id === selectedId) || loadingCharacter) return;
	    speechQueue?.clear();
    syncSpeechQueueSize();
	    characterRuntime.selectCharacter(id);
	    proactiveSettings = loadProactiveSettings(id);
	    proactiveMessageIds = {};
	    if (projectOnlyMode) {
	      attachImagesByChar = { ...attachImagesByChar, [PROJECT_ONLY_WORKSPACE_KEY]: [] };
	      attachYamlByChar = { ...attachYamlByChar, [PROJECT_ONLY_WORKSPACE_KEY]: { name: '', text: '' } };
	    }
	    const previousCharacterId = selectedId;
	    const previousCriticalFeatures = characterVisualMemory.criticalFeatures;
	    await resetStoryCardState({ reason: 'character-switch', clearBrowserStorage: false, clearAttachments: true });
	    selectedId = id;
	    selectedCharacterId = id;
	    projectOnlyMode = false;
	    console.log('[CHARACTER_SELECTION]', {
	      selectedCharacterId: id,
	      mode: 'character',
	    });
	    loadingCharacter = true;
	    errorMessage = '';
    character = null;
    messages = [];
    stopMonologueTimer();
    monologueQueue = [];
    thinkingStream = [];
    lastImageValidationMissing = [];
    memory = emptyMemory();
    memoryV2 = emptyMemoryV2();
    characterVisualMemory = emptyCharacterVisualMemory();
    visualMemoryOwnerId = '';
	    visualMemoryDraft = emptyCharacterVisualMemory();
	    editingVisualMemory = false;
	    visualMemoryMessage = '';
	    visualMemoryReferenceCategory = 'Reference';
	    visualMemoryReferenceTitle = '';
	    visualMemoryReferenceTags = '';
	    pendingIntentConfirmation = null;
	    confirmedIntentDecision = null;
	    attachImagesByChar = { ...attachImagesByChar, [id]: [] };
	    attachYamlByChar = { ...attachYamlByChar, [id]: { name: '', text: '' } };
	    console.log('[VISUAL_MEMORY_CHARACTER_SWITCH_RESET]', {
	      previousCharacterId,
	      selectedCharacterId: id,
	      targetCharacterId: id,
	      beforeCriticalFeatures: previousCriticalFeatures,
	      afterCriticalFeatures: [],
	      referenceImagesCount: 0,
	      attachmentsCount: 0,
	    });
    relationships = [];
    emotionBrain = { current: null, history: [] };
    experiences = [];
    experienceGraph = null;
    routineBrain = {
      currentState: 'Morning',
      todaySummary: '',
      todayGoal: '',
      morningGreeting: '',
      updatedAt: new Date().toISOString(),
      log: [],
    };
    routineMessage = '';
    routineDebug = null;
    imageDataUrl = '';
    updatedAt = '';
    memoryReview = null;
    thoughtActionCandidate = null;
    thoughtActionRoute = null;
    thoughtObservations = [];
    observing = false;
    reviewingMemory = false;
    savingReviewMemory = false;
    savedReviewIndexes = [];
    skippedReviewIndexes = [];
    memoryReviewSaveComment = '';
    memoryReviewSaveDebug = null;
    relationshipReview = null;
    reviewingRelationship = false;
    savingRelationship = false;
    savedRelationshipIndexes = [];
    skippedRelationshipIndexes = [];
    relationshipSaveComment = '';
    relationshipSaveDebug = null;
    relationshipSearchDebug = null;
    emotionReview = null;
    reviewingEmotion = false;
    savedEmotion = null;
    emotionSaveComment = '';
    emotionSaveDebug = null;
    emotionSearchDebug = null;
    experienceSearchDebug = null;
    // 成長パラメータ・履歴・表示状態はキャラ切替でセッション初期値へリセット（永続化しない）。
    growthValues = initialGrowthValues();
    displayGrowthValues = initialGrowthValues();
    growthHistory = [];
    recentChange = [];
    currentEmotion = null;
    // ⚡ Fast Mode V1: キャラ切替で必ず CHAT_FAST へ戻す（制作状態を持ち込まない）。
    mode = 'CHAT_FAST';
    // Story Pack / Vision Bridge: 一時警告とチャットログ添付サマリをクリア（各キャラのデータはID別に保持）。
    storyUploadError = '';
    attachLogByMessageId = {};
    brainLayers = null;
    brainContext = null;
    brainVisibleCount = 0;
    displayEnergy = 0;
    clearBrainTimers();
    if (energyAnimFrame !== undefined) { cancelAnimationFrame(energyAnimFrame); energyAnimFrame = undefined; }
    if (growthAnimFrame !== undefined) { cancelAnimationFrame(growthAnimFrame); growthAnimFrame = undefined; }
    if (recentChangeTimer) clearTimeout(recentChangeTimer);
    try {
      const response = await fetch(`/api/character-memory/${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Character load failed');
      character = data.character;
	  logCurrentStoryCardState();
      characterVisualMemory = normalizeCharacterVisualMemory(data.character?.visualMemory);
      visualMemoryOwnerId = id;
      visualMemoryDraft = normalizeCharacterVisualMemory(data.character?.visualMemory);
      visualMemories = loadVisualMemories(id);
	    messages = Array.isArray(data.messages) ? data.messages.map((message: ChatMessage) => ({ ...message, text: stripInlineImageData(message.text) })) : [];
	    void restoreVoiceCandidates(id, messages);
	    proactiveMessageIds = Object.fromEntries(
	      readAITuberEvents()
	        .filter((event) => event.characterId === id && event.type === 'proactive_message' && typeof event.metadata?.messageId === 'string')
	        .map((event) => [String(event.metadata?.messageId), true] as const),
	    );
	    restoreGeneratedVideoProjects();
      memory = data.memory ?? emptyMemory();
      memoryV2 = data.memoryV2 ?? emptyMemoryV2();
      relationships = Array.isArray(data.relationships) ? data.relationships : [];
      emotionBrain = data.emotion ?? { current: null, history: [] };
      experiences = Array.isArray(data.experiences) ? data.experiences : [];
      routineBrain = data.routine ?? routineBrain;
      updatedAt = data.updatedAt ?? '';

      await loadRoutedProvider(id);
      void runMorningRoutine();
      resetIdleTimer();

      const item = characters.find((entry) => entry.id === id);
      if (item?.hasReference) {
        const imageResponse = await fetch(`/api/characters/${encodeURIComponent(id)}/reference`);
        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          imageDataUrl = imageData.referenceImageDataUrl ?? '';
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      loadingCharacter = false;
    }
  }

  // Read the character's Personality Engine selection and resolve it via the AI Router.
  // Falls back to AUTO when no setting is saved or the request fails.
  async function loadRoutedProvider(id: string): Promise<void> {
    routedProvider = routeProvider('AUTO');
    try {
      const response = await fetch('/api/character-settings');
      if (!response.ok) return;
      const data = await response.json();
      const setting = data?.settings?.[id.trim().toLowerCase()];
      const provider = setting?.aiProfile?.brainAI ?? setting?.provider;
      if (setting?.aiProfile) aiProfile = setting.aiProfile;
      if (typeof provider === 'string') routedProvider = routeProvider(provider);
    } catch {
      // Non-fatal: keep the AUTO fallback.
    }
  }

  function memoryPrompt(): string {
    return [
      memoryV2.persona.species ? `種族: ${memoryV2.persona.species}` : '',
      memoryV2.persona.personality.length ? `性格: ${memoryV2.persona.personality.join('、')}` : '',
      memoryV2.persona.speechStyle.length ? `口調: ${memoryV2.persona.speechStyle.join('、')}` : '',
      memoryV2.persona.relationship ? `関係性: ${memoryV2.persona.relationship}` : '',
      memoryV2.longTermMemory.length ? `長期記憶: ${memoryV2.longTermMemory.map((item) => item.content).join(' / ')}` : '',
      memoryV2.shortTermMemory.length ? `短期記憶: ${memoryV2.shortTermMemory.map((item) => item.content).join(' / ')}` : '',
    ].filter(Boolean).join('\n');
  }

  // ⚡ Fast Mode V1: 通常会話は CHAT_FAST（軽量）、制作時のみ STORY。デフォルトは CHAT_FAST。
  type ChatMode = 'CHAT_FAST' | 'PLANNING' | 'STORY';
  function relevantMemoriesPrompt(memories: CharacterMemorySearchHit[]): string {
    if (memories.length === 0) return '';
    const lines = memories.map((memory) => [
      new Date(memory.createdAt).toISOString().slice(0, 10),
      memory.title,
      memory.summary,
      `Importance ${memory.relevance.toFixed(2)}`,
      memory.tags.length ? `Tags ${memory.tags.join(', ')}` : '',
    ].filter(Boolean).join('\n'));
    return [
      'Relevant Memories',
      'Use these memories as private context for the next character reply.',
      'Do not paste this block directly. Refer to it only when it naturally helps the conversation.',
      'If it is appropriate, the character may naturally mention that they remember the earlier topic.',
      ...lines.map((line, index) => `Memory ${index + 1}\n${line}`),
    ].join('\n\n');
  }

  function withRelevantMemories(basePrompt: string, memories: CharacterMemorySearchHit[]): string {
    const memoryContext = relevantMemoriesPrompt(memories);
    return memoryContext ? `${basePrompt}\n\n${memoryContext}` : basePrompt;
  }

  function relevantRelationshipsPrompt(items: RelationshipSearchHit[]): string {
    if (items.length === 0) return '';
    const lines = items.map((item) => [
      item.category,
      item.key,
      item.value,
      `Confidence ${item.confidence.toFixed(2)}`,
      `Relevance ${item.relevance.toFixed(2)}`,
    ].filter(Boolean).join('\n'));
    return [
      'Relevant Relationship',
      'Use these as private context for understanding the user in the next character reply.',
      'Do not paste this block directly. Let it shape tone, priorities, and what the character naturally remembers.',
      ...lines.map((line, index) => `Relationship ${index + 1}\n${line}`),
    ].join('\n\n');
  }

  function withRelevantRelationships(basePrompt: string, items: RelationshipSearchHit[]): string {
    const relationshipContext = relevantRelationshipsPrompt(items);
    return relationshipContext ? `${basePrompt}\n\n${relationshipContext}` : basePrompt;
  }

  function relevantExperiencesPrompt(items: ExperienceSearchHit[]): string {
    if (items.length === 0) return '';
    const lines = items.map((experience) => [
      `Experience ${experience.id}`,
      `Created ${new Date(experience.createdAt).toISOString().slice(0, 10)}`,
      `Summary ${experience.summary}`,
      `Importance ${experience.importance.toFixed(2)}`,
      `Relevance ${experience.relevance.toFixed(2)}`,
      experience.emotionIds.length ? `Emotion IDs ${experience.emotionIds.join(', ')}` : '',
      experience.memoryIds.length ? `Memory IDs ${experience.memoryIds.join(', ')}` : '',
      experience.relationshipIds.length ? `Relationship IDs ${experience.relationshipIds.join(', ')}` : '',
      experience.routineId ? `Routine ID ${experience.routineId}` : '',
    ].filter(Boolean).join('\n'));
    return [
      'Relevant Experience',
      'Use these graph nodes as private context for the next character reply.',
      'Answer from the experience as a whole, not by quoting isolated memories.',
      'If natural, Shiro may say things like あの時ですね, この経験は今でも覚えています, or mention how she felt then.',
      ...lines,
    ].join('\n\n');
  }

  function withRelevantExperiences(basePrompt: string, items: ExperienceSearchHit[]): string {
    const experienceContext = relevantExperiencesPrompt(items);
    return experienceContext ? `${basePrompt}\n\n${experienceContext}` : basePrompt;
  }

  function relevantEmotionPrompt(emotion: EmotionBrain): string {
    if (!emotion.current) return '';
    return [
      'Relevant Emotion',
      'Use this as Shiro\'s private current emotional state for the next character reply.',
      'Do not paste this block directly. Let it subtly shape tone and energy.',
      'Current Emotion',
      emotion.current.emotion,
      'Intensity',
      emotion.current.intensity.toFixed(2),
      'Confidence',
      emotion.current.confidence.toFixed(2),
      'Reason',
      emotion.current.reason,
    ].join('\n');
  }

  function withRelevantEmotion(basePrompt: string, emotion: EmotionBrain): string {
    const emotionContext = relevantEmotionPrompt(emotion);
    return emotionContext ? `${basePrompt}\n\n${emotionContext}` : basePrompt;
  }

  function routinePrompt(): string {
    return [
      'Daily Routine',
      'Use this as private context for Shiro\'s life-cycle state.',
      `Current State: ${routineBrain.currentState}`,
      routineBrain.todaySummary ? `Today Summary: ${routineBrain.todaySummary}` : '',
      routineBrain.todayGoal ? `Today Goal: ${routineBrain.todayGoal}` : '',
      routineBrain.lastSleepTime ? `Last Sleep: ${routineBrain.lastSleepTime}` : '',
    ].filter(Boolean).join('\n');
  }

  function withRoutineContext(basePrompt: string): string {
    return `${basePrompt}\n\n${routinePrompt()}`;
  }

  async function searchCharacterMemories(query: string): Promise<CharacterMemorySearchHit[]> {
    if (!character || !aiProfile.memoryEnabled || !query.trim()) {
      memorySearchDebug = null;
      return [];
    }
    const requestPayload = { characterId: character.id, query, limit: 5 };
    const startedAt = performance.now();
    try {
      const response = await fetch('/api/character-memory/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const data = await response.json().catch(() => ({})) as CharacterMemorySearchResponse & { message?: string };
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (!response.ok) throw new Error(data.message ?? `Memory Search failed: HTTP ${response.status}`);
      const memories = Array.isArray(data.memories) ? data.memories : [];
      memorySearchDebug = {
        query,
        hitCount: memories.length,
        topRelevance: memories[0]?.relevance ?? 0,
        elapsedMs,
        memoryIds: memories.map((memory) => memory.id),
        requestPayload,
        responseJson: data,
      };
      console.log('[MEMORY_SEARCH_JSON]', memorySearchDebug);
      return memories;
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      const message = error instanceof Error ? error.message : String(error);
      memorySearchDebug = {
        query,
        hitCount: 0,
        topRelevance: 0,
        elapsedMs,
        memoryIds: [],
        requestPayload,
        error: message,
      };
      console.warn('[MEMORY_SEARCH_ERROR]', message);
      return [];
    }
  }

  async function searchCharacterRelationships(query: string): Promise<RelationshipSearchHit[]> {
    if (!character || !aiProfile.memoryEnabled || !query.trim()) {
      relationshipSearchDebug = null;
      return [];
    }
    const requestPayload = { characterId: character.id, query, limit: 5 };
    const startedAt = performance.now();
    try {
      const response = await fetch('/api/character-relationship/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const data = await response.json().catch(() => ({})) as RelationshipSearchResponse & { message?: string };
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (!response.ok) throw new Error(data.message ?? `Relationship Search failed: HTTP ${response.status}`);
      const relationshipHits = Array.isArray(data.relationships) ? data.relationships : [];
      relationshipSearchDebug = {
        query,
        hitCount: relationshipHits.length,
        topRelevance: relationshipHits[0]?.relevance ?? 0,
        topConfidence: relationshipHits[0]?.confidence ?? 0,
        elapsedMs,
        relationshipIds: relationshipHits.map((item) => item.id),
        requestPayload,
        responseJson: data,
      };
      console.log('[RELATIONSHIP_SEARCH_JSON]', relationshipSearchDebug);
      return relationshipHits;
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      const message = error instanceof Error ? error.message : String(error);
      relationshipSearchDebug = {
        query,
        hitCount: 0,
        topRelevance: 0,
        topConfidence: 0,
        elapsedMs,
        relationshipIds: [],
        requestPayload,
        error: message,
      };
      console.warn('[RELATIONSHIP_SEARCH_ERROR]', message);
      return [];
    }
  }

  async function searchCharacterExperiences(query: string): Promise<ExperienceSearchHit[]> {
    if (!character || !aiProfile.memoryEnabled || !query.trim()) {
      experienceSearchDebug = null;
      return [];
    }
    const requestPayload = { characterId: character.id, query, limit: 4 };
    const startedAt = performance.now();
    try {
      const response = await fetch('/api/character-experience/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const data = await response.json().catch(() => ({})) as ExperienceSearchResponse & { message?: string };
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (!response.ok) throw new Error(data.message ?? `Experience Search failed: HTTP ${response.status}`);
      const hits = Array.isArray(data.experiences) ? data.experiences : [];
      experienceGraph = data.graph ?? null;
      experienceSearchDebug = {
        query,
        hitCount: hits.length,
        topRelevance: hits[0]?.relevance ?? 0,
        elapsedMs,
        experienceIds: hits.map((item) => item.id),
        requestPayload,
        responseJson: data,
        graph: data.graph,
      };
      console.log('[EXPERIENCE_SEARCH_JSON]', experienceSearchDebug);
      return hits;
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      const message = error instanceof Error ? error.message : String(error);
      experienceSearchDebug = {
        query,
        hitCount: 0,
        topRelevance: 0,
        elapsedMs,
        experienceIds: [],
        requestPayload,
        error: message,
      };
      console.warn('[EXPERIENCE_SEARCH_ERROR]', message);
      return [];
    }
  }

  async function searchCharacterEmotion(): Promise<EmotionBrain> {
    const fallback = emotionBrain;
    if (!character || !aiProfile.memoryEnabled) {
      emotionSearchDebug = null;
      return fallback;
    }
    const requestPayload = { characterId: character.id };
    const startedAt = performance.now();
    try {
      const response = await fetch('/api/character-emotion/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const data = await response.json().catch(() => ({})) as EmotionSearchResponse & { message?: string };
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (!response.ok) throw new Error(data.message ?? `Emotion Search failed: HTTP ${response.status}`);
      const nextEmotion = data.emotion ?? fallback;
      emotionBrain = nextEmotion;
      emotionSearchDebug = {
        emotion: nextEmotion.current?.emotion ?? '-',
        intensity: nextEmotion.current?.intensity ?? 0,
        confidence: nextEmotion.current?.confidence ?? 0,
        historyCount: nextEmotion.history?.length ?? 0,
        elapsedMs,
        requestPayload,
        responseJson: data,
      };
      console.log('[EMOTION_SEARCH_JSON]', emotionSearchDebug);
      return nextEmotion;
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      const message = error instanceof Error ? error.message : String(error);
      emotionSearchDebug = {
        emotion: fallback.current?.emotion ?? '-',
        intensity: fallback.current?.intensity ?? 0,
        confidence: fallback.current?.confidence ?? 0,
        historyCount: fallback.history?.length ?? 0,
        elapsedMs,
        requestPayload,
        error: message,
      };
      console.warn('[EMOTION_SEARCH_ERROR]', message);
      return fallback;
    }
  }

  // Story Card creation is a separate, explicit phase after planning.
  const MANGA_GENERATION_KEYWORDS = ['漫画', '4コマ', '1ページ', '2ページ', '続き', 'YAML', 'ストーリー', 'コマ'];
  const PLANNING_KEYWORDS = ['企画', 'アイデア', 'プロット', '構想', '案を出して'];
  const STORY_CARD_CREATION_KEYWORDS = ['Story Card', 'ストーリーカード', 'YAMLを作成', 'YAML作成', 'ストーリーを作成'];
  function isStoryCardCreationRequest(text: string): boolean {
    return STORY_CARD_CREATION_KEYWORDS.some((keyword) => text.includes(keyword));
  }
  function isPlanningRequest(text: string): boolean {
    return !isStoryCardCreationRequest(text) && PLANNING_KEYWORDS.some((keyword) => text.includes(keyword));
  }
  function detectMode(text: string): ChatMode {
    if (isStoryCardCreationRequest(text)) return 'STORY';
    if (isPlanningRequest(text)) return 'PLANNING';
    return 'CHAT_FAST';
  }
  // ⑥ キャラ切替で CHAT_FAST に戻す（制作状態を他キャラへ持ち込まない）。
  let mode = $state<ChatMode>('CHAT_FAST');
  const SINGLE_IMAGE_REQUEST_KEYWORDS = ['画像生成', '画像を生成', '画像化', '画像にして', '絵にして', '絵を生成', 'イラスト化', '描いて', '作って'];
  const REUSE_LAST_SCENE_KEYWORDS = ['もう一度', '再生成', '別アングル', '別角度', '違う角度', 'アングル変えて', '同じシーン'];
  const ANGLE_VARIATION_KEYWORDS = ['別アングル', '別角度', '違う角度', 'アングル変えて'];

  // Comic Prompt 自動画像生成: STORY CARD 表示中の画像生成要求を検出する語。
  const IMAGE_REQUEST_KEYWORDS = ['画像生成', '画像を生成', '画像化', '画像にして', '絵にして', '絵を生成', 'イラスト化', '漫画にして', 'コミック化'];
  function detectImageRequest(text: string): boolean {
    return SINGLE_IMAGE_REQUEST_KEYWORDS.some((keyword) => text.includes(keyword))
      || REUSE_LAST_SCENE_KEYWORDS.some((keyword) => text.includes(keyword))
      || IMAGE_REQUEST_KEYWORDS.some((keyword) => text.includes(keyword));
  }

  function detectMangaGenerationRequest(text: string): boolean {
    return MANGA_GENERATION_KEYWORDS.some((keyword) => text.includes(keyword));
  }

  function detectLastSceneReuseRequest(text: string): boolean {
    return REUSE_LAST_SCENE_KEYWORDS.some((keyword) => text.includes(keyword));
  }

  function detectAngleVariationRequest(text: string): boolean {
    return ANGLE_VARIATION_KEYWORDS.some((keyword) => text.includes(keyword));
  }

  function currentLastGeneratedScene(): LastGeneratedScene | null {
    return selectedId ? (lastGeneratedSceneByChar[selectedId] ?? null) : null;
  }

  function rememberGeneratedScene(scene: LastGeneratedScene): void {
    if (!selectedId) return;
    lastGeneratedSceneByChar = { ...lastGeneratedSceneByChar, [selectedId]: scene };
  }

  function buildSingleIllustrationPrompt(text: string): string {
    const request = text.trim() || `${character?.name ?? 'the character'} の1枚絵`;
    return [
      'Create one finished single illustration.',
      'Do not create a comic page, panel layout, story card, storyboard, or speech bubbles.',
      `User request: ${request}`,
      character?.name ? `Character: ${character.name}` : '',
      character?.description ? `Character notes: ${character.description}` : '',
    ].filter(Boolean).join('\n');
  }

  function buildPromptFromLastScene(lastScene: LastGeneratedScene, text: string): LastGeneratedScene {
    const variation = detectAngleVariationRequest(text)
      ? 'Regenerate the same scene from a different camera angle. Preserve the subject, setting, action, mood, outfit, and key visual details.'
      : 'Regenerate the same scene. Preserve the subject, setting, action, mood, outfit, and key visual details.';
    const userInstruction = text.trim() ? `User regeneration instruction: ${text.trim()}` : '';
    return {
      ...lastScene,
      prompt: [
        lastScene.prompt,
        variation,
        userInstruction,
        'Do not fall back to a default character standing portrait.',
      ].filter(Boolean).join('\n'),
    };
  }

  // 直近の assistant メッセージから Story Card（StoryDoc）を取り出す。無ければ null。
	  function latestStoryDoc(): StoryDoc | null {
	    for (let i = messages.length - 1; i >= 0; i--) {
	      const message = messages[i];
	      if (message.role !== 'assistant') continue;
	      const parsed = parseStoryDoc(message.text);
	      if (parsed) return parsed.doc;
	    }
	    return null;
	  }

	  function storyDocToDesignCard(message: ChatMessage, doc: StoryDoc): StoryCardDesign {
	    const references = messageAttachmentImages(message).map((url, index) => ({
	      id: `${message.id}:reference:${index}`,
	      kind: 'image' as const,
	      title: `Reference ${index + 1}`,
	      url,
	    }));
	    const cuts = doc.scenes.map((scene, index) => ({
	      id: `${message.id}:cut:${index}`,
	      order: index + 1,
	      title: scene.title || `Cut ${index + 1}`,
	      summary: scene.action || scene.visual || scene.title || `Cut ${index + 1}`,
	      visual: scene.visual,
	      action: scene.action,
	      dialogue: scene.dialogue.map((line) => [line.speaker, line.text].filter(Boolean).join(': ')).join('\n'),
	      emotion: scene.emotion,
	    }));
	    return {
	      id: `storycard:${message.id}`,
	      type: 'video_storycard',
	      title: doc.title || 'Untitled StoryCard',
	      summary: doc.scenes[0]?.action || doc.scenes[0]?.visual || doc.theme || doc.title || 'StoryCard summary',
	      theme: doc.theme || '',
	      goal: 'Generate image, video, or comic package from this StoryCard.',
	      characters: doc.characters.map((name) => ({ name })),
	      references,
	      location: doc.scenes[0]?.visual || '',
	      style: doc.theme || '',
	      emotion: doc.scenes[0]?.emotion || '',
	      duration: Number(/(\d{1,3})\s*(?:秒|seconds?|s)/iu.exec(message.text)?.[1] ?? 15),
	      cuts,
	      createdAt: message.createdAt,
	      updatedAt: message.timestamp ?? message.createdAt,
	    };
	  }

	  function parseJsonObjectFromText(text: string): unknown | null {
	    const trimmed = text.trim();
	    const fenced = trimmed.match(/```(?:json|storycard)?\s*([\s\S]*?)```/i)?.[1]?.trim();
	    const candidate = fenced || trimmed;
	    try {
	      return JSON.parse(candidate);
	    } catch {
	      const start = candidate.indexOf('{');
	      const end = candidate.lastIndexOf('}');
	      if (start < 0 || end <= start) return null;
	      try {
	        return JSON.parse(candidate.slice(start, end + 1));
	      } catch {
	        return null;
	      }
	    }
	  }

	  function normalizeStoryCardFromText(text: string): StoryCardDesign | null {
	    const raw = parseJsonObjectFromText(text);
	    if (!raw || typeof raw !== 'object') return null;
	    const data = raw as Partial<StoryCardDesign>;
	    if (typeof data.title !== 'string' || !Array.isArray(data.cuts) || data.cuts.length === 0) return null;
	    const now = new Date().toISOString();
	    return {
	      id: typeof data.id === 'string' ? data.id : `storycard:${Date.now()}`,
	      type: 'video_storycard',
	      title: data.title,
	      summary: typeof data.summary === 'string' ? data.summary : data.title,
	      theme: typeof data.theme === 'string' ? data.theme : '',
	      goal: typeof data.goal === 'string' ? data.goal : '',
	      characters: Array.isArray(data.characters) ? data.characters.map((item) => (
	        typeof item === 'string'
	          ? { name: item }
	          : { name: typeof item?.name === 'string' ? item.name : 'Character', id: item?.id, role: item?.role, description: item?.description }
	      )) : [],
	      references: Array.isArray(data.references) ? data.references : [],
	      location: typeof data.location === 'string' ? data.location : '',
	      style: typeof data.style === 'string' ? data.style : '',
	      emotion: typeof data.emotion === 'string' ? data.emotion : '',
	      duration: typeof data.duration === 'number' ? data.duration : 15,
	      cuts: data.cuts.map((cut, index) => ({
	        id: typeof cut.id === 'string' ? cut.id : `cut-${index + 1}`,
	        order: typeof cut.order === 'number' ? cut.order : index + 1,
	        start: typeof cut.start === 'string' ? cut.start : undefined,
	        end: typeof cut.end === 'string' ? cut.end : undefined,
	        time: typeof cut.time === 'string' ? cut.time : (cut.start && cut.end ? `${cut.start}-${cut.end}` : undefined),
	        title: cut.title,
	        description: typeof cut.description === 'string' ? cut.description : undefined,
	        requiredUnits: Array.isArray(cut.requiredUnits) ? cut.requiredUnits.filter((item): item is string => typeof item === 'string') : [],
	        summary: typeof cut.summary === 'string' ? cut.summary : cut.description || cut.action || cut.visual || `Cut ${index + 1}`,
	        visual: cut.visual,
	        characters: Array.isArray(cut.requiredUnits)
	          ? cut.requiredUnits.filter((item): item is string => typeof item === 'string')
	          : Array.isArray(cut.characters) ? cut.characters.filter((item): item is string => typeof item === 'string') : [],
	        action: cut.action || cut.description,
	        motion: cut.motion || cut.action || cut.description,
	        dialogue: cut.dialogue,
	        camera: cut.camera,
	        emotion: cut.emotion,
	        duration: cut.duration,
	        references: cut.references,
	      })),
	      createdAt: typeof data.createdAt === 'string' ? data.createdAt : now,
	      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now,
	    };
	  }

	  function parseStoryCard(value: unknown): StoryCardDesign | null {
	    if (!value || typeof value !== 'object') return null;
	    const card = value as Partial<StoryCardDesign>;
	    if (typeof card.id !== 'string' || !card.id.trim()) return null;
	    if (typeof card.title !== 'string' || !card.title.trim()) return null;
	    if (typeof card.duration !== 'number' || !Number.isFinite(card.duration) || card.duration <= 0) return null;
	    if (!Array.isArray(card.cuts) || card.cuts.length === 0) return null;
	    const cutsAreValid = card.cuts.every((cut) => (
	      cut
	      && typeof cut === 'object'
	      && typeof cut.id === 'string'
	      && typeof cut.order === 'number'
	      && typeof cut.summary === 'string'
	    ));
	    return cutsAreValid ? card as StoryCardDesign : null;
	  }

	  function createEmptyStoryCard(
	    referenceImages: string[],
	    failure: NonNullable<StoryCardDesign['generationError']>,
	  ): StoryCardDesign {
	    const now = new Date().toISOString();
	    return {
	      id: `storycard-error-${Date.now()}`,
	      type: 'video_storycard',
	      parseSuccess: false,
	      generationError: failure,
	      title: 'Raw Response',
	      summary: '',
	      theme: '', goal: '',
	      characters: character ? [{ id: character.id, name: character.name }] : [],
	      references: referenceImages.map((url, index) => ({
	        id: `storycard-error-reference-${index}`,
	        kind: 'image',
	        title: `Reference ${index + 1}`,
	        url,
	      })),
	      location: '', style: '', emotion: '', duration: 0, cuts: [],
	      createdAt: now, updatedAt: now,
	    };
	  }

	  function isDedicatedStoryCardMessage(message: ChatMessage): boolean {
	    return message.role === 'assistant' && (
	      Boolean(message.storyCard)
	      || Boolean(normalizeStoryCardFromText(message.text))
	    );
	  }

	  function storyCardForMessage(message: ChatMessage): StoryCardDesign | null {
	    return message.storyCard ?? normalizeStoryCardFromText(message.text);
	  }

	  /** Motion Prompt is always regenerated from the Scene Timeline. No stored fallbacks. */
	  function motionPromptForMessage(message: ChatMessage): string {
	    return videoPackageForMessage(message)?.motion_prompt ?? '';
	  }

  function videoPackageForMessage(message: ChatMessage, card = storyCardForMessage(message)): VideoPackage | null {
    if (message.videoPackage) {
      const normalized = normalizeVideoPackage(message.videoPackage);
      return {
        ...normalized,
        motion_prompt: motionPromptFromTimeline(normalized.scenes),
      };
    }
    if (!card || !character) return null;
    const rebuilt = createVideoPackageFromStoryCard(
      card,
      character.name,
      videoReferenceImagesForMessage(message),
    );
    return { ...rebuilt, motion_prompt: motionPromptFromTimeline(rebuilt.scenes) };
  }

	  function aiModelsForMessage(message: ChatMessage): AIModelMetadata {
	    if (message.aiModels && Object.keys(message.aiModels).length > 0) return message.aiModels;
	    const storyCard = storyCardForMessage(message);
	    if (storyCard) {
	      return {
	        storyCard: storyCard.sourceModel?.toLowerCase() === 'gpt-5.5' ? AI_ROLE_MODELS.storyCard : (storyCard.sourceModel || AI_ROLE_MODELS.storyCard),
	      };
	    }
	    return message.role === 'assistant' ? { conversation: AI_ROLE_MODELS.conversation } : {};
	  }

	  type StoryCardReferenceCandidate = {
	    id: string;
	    title: string;
	    url: string;
	    source: 'official-pack' | 'character-preset' | 'character-registry' | 'ref-library' | 'attachment';
	  };

	  async function storyCardReferenceCandidates(
	    attachedReferenceImages: string[],
	    queuedImages: AttachImage[],
	  ): Promise<StoryCardReferenceCandidate[]> {
	    if (!character) return [];
	    if (projectOnlyMode) {
	      const projectReferences: StoryCardReferenceCandidate[] = attachedReferenceImages.map((url, index) => ({
	        id: `attachment-${index + 1}`,
	        title: queuedImages[index]?.name || `Attached REF ${index + 1}`,
	        url,
	        source: 'attachment',
	      }));
	      animationSheetVideoReferenceSources().forEach((reference, index) => {
	        const url = resolveVideoProductionImageReference(reference);
	        if (url) projectReferences.push({
	          id: `project-video-reference-${index + 1}`,
	          title: `Video Reference ${index + 1}`,
	          url,
	          source: 'attachment',
	        });
	      });
	      return projectReferences.slice(0, MAX_REFERENCE_IMAGES);
	    }
	    const candidates: StoryCardReferenceCandidate[] = [];
	    if (character.id.trim().toLowerCase() === 'shiro') {
	      SHIRO_OFFICIAL_REFERENCE_PACK.forEach((reference, index) => {
	        candidates.push({
	          id: `shiro-official-${reference.role}`,
	          title: `SHIRO OFFICIAL REF ${String(index + 1).padStart(2, '0')} ${reference.role.toUpperCase()}`,
	          url: reference.image,
	          source: 'official-pack',
	        });
	      });
	      console.log('[STORYCARD_SHIRO_OFFICIAL_REFERENCE_PACK]', {
	        characterId: character.id,
	        mediaStoreUsed: false,
	        references: SHIRO_OFFICIAL_REFERENCE_PACK.map((reference) => reference.image),
	      });
	    } else {
	      const mediaEntries = getVideoProductionMediaEntries();
	      for (const mediaId of characterPresetReferenceImages(character.name, character.id)) {
	        const media = mediaEntries.find((entry) => entry.id === mediaId || entry.value === mediaId);
	        let url = media ? media.value : resolveVideoProductionImageReference(mediaId);
	        if (!url || (url === mediaId && mediaId.startsWith('image-'))) continue;
	        if (url.startsWith('data:image/')) url = await persistImage(url);
	        candidates.push({ id: media?.id ?? mediaId, title: media?.label ?? mediaId, url, source: 'character-preset' });
	      }
	    }

	    if (candidates.length === 0 && imageDataUrl) {
	      candidates.push({
	        id: `${character.id}:registry-reference`,
	        title: `${character.name} Character REF`,
	        url: `/api/characters/${encodeURIComponent(character.id)}/reference?raw=1`,
	        source: 'character-registry',
	      });
	    }

	    try {
	      const response = await fetch('/api/ref-library');
	      if (response.ok) {
	        const data = await response.json();
	        const items = Array.isArray(data?.items) ? data.items : [];
	        for (const item of items) {
	          if (!item || typeof item.id !== 'string') continue;
	          candidates.push({
	            id: item.id,
	            title: typeof item.name === 'string' ? item.name : item.id,
	            url: `/api/ref-library/${encodeURIComponent(item.id)}/image?raw=1`,
	            source: 'ref-library',
	          });
	        }
	      }
	    } catch (error) {
	      console.warn('[STORYCARD_REF_LIBRARY_ERROR]', error instanceof Error ? error.message : String(error));
	    }

	    attachedReferenceImages.forEach((url, index) => {
	      candidates.push({
	        id: `attachment-${index + 1}`,
	        title: queuedImages[index]?.name || `Attached REF ${index + 1}`,
	        url,
	        source: 'attachment',
	      });
	    });

	    const priority: Record<StoryCardReferenceCandidate['source'], number> = {
	      'official-pack': 0,
	      'character-preset': 0,
	      'character-registry': 0,
	      attachment: 1,
	      'ref-library': 2,
	    };
	    const seenIds = new Set<string>();
	    const seenUrls = new Set<string>();
	    return candidates.sort((a, b) => priority[a.source] - priority[b.source]).filter((candidate) => {
	      if (!candidate.url || seenIds.has(candidate.id) || seenUrls.has(candidate.url)) return false;
	      seenIds.add(candidate.id);
	      seenUrls.add(candidate.url);
	      return true;
	    }).slice(0, MAX_REFERENCE_IMAGES);
	  }

	  function applyResolvedStoryCardReferences(
	    card: StoryCardDesign,
	    candidates: StoryCardReferenceCandidate[],
	  ): StoryCardDesign {
	    const selectedIds = new Set([
	      ...card.references.map((reference) => reference.id),
	      ...card.cuts.flatMap((cut) => cut.references ?? []),
	    ]);
	    const selectedUrls = new Set(card.references.map((reference) => reference.url).filter((url): url is string => Boolean(url)));
	    const included = candidates.filter((candidate) => (
	      candidate.source === 'official-pack'
	      || candidate.source === 'character-preset'
	      || candidate.source === 'character-registry'
	      || candidate.source === 'attachment'
	      || selectedIds.has(candidate.id)
	      || selectedUrls.has(candidate.url)
	    ));
	    const resolved = included.map((candidate) => ({
	      id: candidate.id,
	      kind: 'image' as const,
	      title: candidate.title,
	      url: candidate.url,
	      tags: [candidate.source, selectedIds.has(candidate.id) ? 'selected' : 'registered'],
	    }));
	    return { ...card, references: resolved };
	  }

	async function saveAnimationProjectTimeline(message: ChatMessage, scenes: VideoStoryScene[], motionPrompt: string): Promise<void> {
		const basePackage = videoPackageForMessage(message);
		if (!basePackage) return;
		const videoPackage: VideoPackage = { ...basePackage, scenes, motion_prompt: motionPrompt };
		if (projectOnlyMode) {
			messages = messages.map((entry) => entry.id === message.id ? { ...entry, videoPackage, motionPrompt } : entry);
		} else if (character) {
			const response = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/chat`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					messageId: message.id,
					text: message.text,
					storyCard: message.storyCard,
					videoPackage,
					motionPrompt,
					referenceImages: message.referenceImages,
				}),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data?.message ?? 'Scene Timeline save failed');
			messages = (data.messages as ChatMessage[]).map((entry) => ({ ...entry, text: stripInlineImageData(entry.text) }));
		}
		currentVideoPackage = videoPackage;
		currentMotionPrompt = motionPrompt;
		storeVideoProductionData('package', videoPackage);
	}

	  function storyCardFailureMessage(error: unknown): string {
	    const detail = error instanceof Error ? error.message : String(error);
	    const cause = /empty response|response empty/iu.test(detail)
	      ? 'Model Response Empty'
	      : /json|parse/iu.test(detail)
	        ? 'JSON Parse Error'
	        : detail;
	    return cause && cause !== 'StoryCard generation failed'
	      ? `StoryCard生成に失敗しました\n${cause}`
	      : 'StoryCard生成に失敗しました';
	  }

	  async function requestStoryCardImageAnalysis(
	    images: AttachImage[],
	    requestText: string,
	  ): Promise<{ text: string; model: string } | null> {
	    if (images.length === 0) return null;
	    try {
	      const response = await fetch('/api/lab-chat', {
	        method: 'POST',
	        headers: { 'content-type': 'application/json' },
	        body: JSON.stringify({
	          characterId: character?.id,
	          route: 'image_analysis',
	          systemPrompt: [
	            'Analyze the attached storyboard/reference images for a downstream StoryCard editor.',
	            'Extract up to five sequential scene candidates from animation sheets or storyboard panels in reading order.',
	            'For every candidate identify duration/timing when visible, camera/framing, concrete motion/action, and readable dialogue.',
	            'Return concise factual Japanese observations only: visible subjects, actions, framing, viewpoint, equipment, setting, order, and readable timing.',
	            'Do not create the StoryCard. Do not add unsupported details.',
	          ].join('\n'),
	          userMessage: requestText || 'この画像をStoryCard生成用に解析してください。',
	          images: images.map((image) => image.dataUrl),
	          memory: { enabled: false },
	        }),
	      });
	      const data = await response.json().catch(() => ({}));
	      if (!response.ok) throw new Error(data?.message ?? 'Image analysis failed');
	      const analysisText = String(data?.text ?? data?.reply ?? '').trim();
	      if (!analysisText) throw new Error('Image analysis returned an empty response');
	      return { text: analysisText, model: typeof data?.actualModel === 'string' ? data.actualModel : (typeof data?.model === 'string' ? data.model : AI_ROLE_MODELS.imageAnalysis) };
	    } catch (error) {
	      console.warn('[STORYCARD_IMAGE_ANALYSIS_SKIPPED]', error instanceof Error ? error.message : String(error));
	      return null;
	    }
	  }

	  type AnimationSheetScene = {
	    id: number;
		eventType?: 'story_event' | 'scene_transition' | 'character_action';
		eventId?: string;
		storyEvent?: string;
		sceneTransition?: string;
		requiredEvent?: boolean;
		characters?: string[];
	    sourcePanel?: string;
	    sourceSheetIndex?: number;
	    panelBounds?: { panelId?: string; sourceSheetIndex?: number; x: number; y: number; width: number; height: number };
	    timecode?: string;
	    duration: number;
	    visual: string;
	    motion: string;
	    dialogue: string;
	    camera: string;
	  };

	  function animationSceneTitle(scene: AnimationSheetScene, index: number): string {
		const eventTitle = scene.storyEvent?.trim() || scene.sceneTransition?.trim();
		if (eventTitle) return eventTitle.slice(0, 32);
		const visualTitle = scene.visual.split(/[:：。\n]/u)[0]?.trim();
		return visualTitle?.slice(0, 32) || `SCENE${String(index + 1).padStart(2, '0')}`;
	  }
	  type AnimationSheetExtraction = {
	    animationSheetDetected: boolean;
	    scenes: AnimationSheetScene[];
	    panelBounds: Array<{ panelId: string; sourceSheetIndex: number; x: number; y: number; width: number; height: number }>;
	    detectedPanelCount: number;
	    totalDuration: number;
	    detectedSceneCount: number;
		detectedRequiredEventCount?: number;
		detectedRequiredEvents?: string[];
		missingRequiredEvents?: string[];
	    detectedDurations: number[];
	    omittedScenes: number[];
	    timelineEnd: number | null;
	    timelineIncomplete: boolean;
		timelineIncompleteReasons?: string[];
	    preserveTimeline: boolean;
	    motionPrompt: string;
	    model: string;
		rawResponse?: string;
	  };

	  function isAnimationSheetMode(requestText: string, attachmentCount: number): boolean {
	    return attachmentCount >= 1
	      && /(?:このアニメシートで動画(?:を)?\s*作って|絵コンテから動画(?:を)?\s*作って)/u.test(requestText);
	  }

	  function animationSheetVideoReferenceSources(): string[] {
	    const latestVideoMessage = latestProjectAssetMessage();
	    const selected = latestVideoMessage
	      ? (referenceImagesByMessageId[latestVideoMessage.id] ?? [])
	      : [];
	    return [...new Set((selected.length > 0 ? selected : currentReferenceImages).filter(Boolean))];
	  }

	  async function requestAnimationSheetExtraction(text: string, queuedImages: AttachImage[]): Promise<AnimationSheetExtraction> {
	    const mediaStoreImages = getVideoProductionMediaEntries().filter((entry) => (
	      entry.value.startsWith('data:image/')
	      || /\.(?:png|jpe?g|webp|gif|avif)(?:[?#]|$)/iu.test(entry.value)
	      || /\/image(?:\/|\?|$)/iu.test(entry.value)
	    ));
	    const videoCollectionImages = animationSheetVideoReferenceSources();
	    const resolvedVideoReferenceImages = (await Promise.all(videoCollectionImages.map(async (image, index) => {
	      const mediaEntry = mediaStoreImages.find((entry) => entry.id === image || entry.value === image);
	      const resolved = resolveVideoProductionImageReference(image);
	      const dataUrl = await toFalAnimationImage(resolved);
	      return dataUrl.startsWith('data:image/')
	        ? { name: mediaEntry?.label || `video-reference-${index + 1}`, dataUrl }
	        : null;
	    }))).filter((image): image is { name: string; dataUrl: string } => Boolean(image));
	    const visualMemoryImages = characterVisualMemory.referenceImages;
	    console.log('[ANIMATION_SHEET_VISION_SOURCE_AUDIT]', {
	      attachedImages: queuedImages.map((image) => image.name),
	      videoReferenceImages: resolvedVideoReferenceImages.map((image) => image.name),
	      visualMemoryImages: visualMemoryImages.map((image) => image.fileName),
	      totalImages: new Set([...queuedImages.map((image) => image.dataUrl), ...resolvedVideoReferenceImages.map((image) => image.dataUrl)]).size,
	      mediaStoreAvailableCount: mediaStoreImages.length,
	      visualMemorySentCount: 0,
	    });
	    const response = await fetch('/api/animation-sheet/extract', {
	      method: 'POST',
	      headers: { 'content-type': 'application/json' },
	      body: JSON.stringify({
	        requestText: text,
	        attachedImages: queuedImages.map((image) => ({ name: image.name, dataUrl: image.dataUrl })),
	        videoReferenceImages: resolvedVideoReferenceImages,
	        visualMemoryImages: [],
	        preserveTimeline: preserveAnimationSheetTimeline,
	      }),
	    });
	    const data = await response.json().catch(() => ({})) as Partial<AnimationSheetExtraction> & { message?: string };
	    if (!response.ok) throw new Error(data.message ?? 'Gemini Scene Extractor failed');
	    const extractedScenes = Array.isArray(data.scenes) ? data.scenes : [];
	    const panelBounds = Array.isArray(data.panelBounds) ? data.panelBounds : [];
	    const detectedPanelCount = Number(data.detectedPanelCount ?? panelBounds.length);
	    const detectedSceneCount = Number(data.detectedSceneCount ?? extractedScenes.length);
	    const detectedDurations = Array.isArray(data.detectedDurations)
	      ? data.detectedDurations.map(Number).filter(Number.isFinite)
	      : extractedScenes.map((scene) => Number(scene.duration));
	    const omittedScenes = Array.isArray(data.omittedScenes)
	      ? data.omittedScenes.map(Number).filter(Number.isInteger)
	      : [];
	    const timelineEnd = data.timelineEnd == null ? null : Number(data.timelineEnd);
	    const timelineIncomplete = data.timelineIncomplete === true
	      || (preserveAnimationSheetTimeline && extractedScenes.length < detectedSceneCount)
	      || (preserveAnimationSheetTimeline && omittedScenes.length > 0);
		const receivedMotionPrompt = String(data.motionPrompt ?? '').trim();
		console.log(`[MOTION_PROMPT]\n${receivedMotionPrompt}`);
		console.log(`Prompt Length: ${receivedMotionPrompt.length}`);
	    console.log('[ANIMATION_SHEET_TIMELINE_PARSE]', {
	      detectedSceneCount,
	      detectedDurations,
	      totalDuration: Number(data.totalDuration ?? 0),
	      omittedScenes,
		  detectedRequiredEvents: data.detectedRequiredEvents ?? [],
		  missingRequiredEvents: data.missingRequiredEvents ?? [],
		  timelineIncompleteReasons: data.timelineIncompleteReasons ?? [],
	    });
	    console.log('[ANIMATION_SHEET_SCENE_DURATIONS]', {
	      model: String(data.model ?? AI_ROLE_MODELS.imageAnalysis),
	      scenes: extractedScenes.map((scene, index) => ({
	        scene: `SCENE${String(index + 1).padStart(2, '0')}`,
	        duration: Number(scene.duration),
	      })),
	      firstTenTotal: Number(extractedScenes.slice(0, 10).reduce((sum, scene) => sum + Number(scene.duration || 0), 0).toFixed(3)),
	      totalDuration: Number(data.totalDuration ?? 0),
	    });
	    return {
	      animationSheetDetected: data.animationSheetDetected === true,
	      scenes: extractedScenes,
	      panelBounds,
	      detectedPanelCount,
	      totalDuration: Number(data.totalDuration ?? 0),
	      detectedSceneCount,
		  detectedRequiredEventCount: Number(data.detectedRequiredEventCount ?? 0),
		  detectedRequiredEvents: Array.isArray(data.detectedRequiredEvents) ? data.detectedRequiredEvents : [],
		  missingRequiredEvents: Array.isArray(data.missingRequiredEvents) ? data.missingRequiredEvents : [],
	      detectedDurations,
	      omittedScenes,
	      timelineEnd: Number.isFinite(timelineEnd) ? timelineEnd : null,
	      timelineIncomplete,
		  timelineIncompleteReasons: Array.isArray(data.timelineIncompleteReasons) ? data.timelineIncompleteReasons : [],
	      preserveTimeline: data.preserveTimeline !== false,
	      motionPrompt: receivedMotionPrompt,
	      model: String(data.model ?? AI_ROLE_MODELS.imageAnalysis),
		  rawResponse: String(data.rawResponse ?? ''),
	    };
	  }

	  async function createAnimationSheetVideoFromIntent(
	    text: string,
	    queuedImages: AttachImage[],
	    prefetchedExtraction: AnimationSheetExtraction | null = null,
	  ): Promise<{ message: ChatMessage; videoPackage: VideoPackage; motionPrompt: string }> {
	    if (!character) throw new Error('Character is not selected');
	    console.log('[ANIMATION_SHEET_MODE]', { ANIMATION_SHEET_MODE: true, attachmentCount: queuedImages.length });
	    const extraction = prefetchedExtraction ?? await requestAnimationSheetExtraction(text, queuedImages);
	    const scenes = extraction.scenes;
	    const totalDuration = extraction.totalDuration;
	    const motionPrompt = extraction.motionPrompt;
		console.log(`[MOTION_PROMPT]\n${motionPrompt}`);
		console.log(`Prompt Length: ${motionPrompt.length}`);
	    if (extraction.preserveTimeline && extraction.timelineIncomplete) {
		  console.error('[ANIMATION_SHEET_EXTRACTION_FAILURE]', {
			timelineIncompleteReasons: extraction.timelineIncompleteReasons ?? [],
			missingRequiredEvents: extraction.missingRequiredEvents ?? [],
			extractedScenes: extraction.scenes,
			omittedScenes: extraction.omittedScenes,
			rawResponse: extraction.rawResponse ?? '',
		  });
		  for (const eventId of extraction.missingRequiredEvents ?? []) console.error(`Missing Required Event:\n- ${eventId}`);
	      throw new Error('シーン抽出が不足しています。アニメシート解析をやり直してください。');
	    }
	    if (scenes.length === 0 || !Number.isFinite(totalDuration) || totalDuration <= 0 || !motionPrompt) {
	      throw new Error('Gemini Scene Extractor returned an incomplete Scene List');
	    }

	    const uploadedReferences = await Promise.all(
	      queuedImages.slice(0, MAX_REFERENCE_IMAGES).map((image) => persistImage(image.dataUrl)),
	    );
	    const referenceImages = [...new Set([
	      ...uploadedReferences,
	      ...animationSheetVideoReferenceSources(),
	    ])].slice(0, MAX_REFERENCE_IMAGES);
	    const uploadedNameByUrl = new Map(uploadedReferences.map((url, index) => [url, queuedImages[index]?.name ?? '']));
	    const referenceNameFor = (url: string): string => {
	      const uploadedName = uploadedNameByUrl.get(url);
	      if (uploadedName) return uploadedName;
	      const mediaEntry = getVideoProductionMediaEntries().find((entry) => entry.id === url || entry.value === url);
	      return mediaEntry?.label || referenceNameFromUrl(url);
	    };
	    const referenceCategoryByUrl = referenceImages.map((url) => ({ url, name: referenceNameFor(url), category: classifyAnimationReference(referenceNameFor(url)) }));
	    const classifiedAnimationSheetCount = referenceCategoryByUrl.filter((entry) => entry.category === 'Animation Sheet').length;
	    console.log('[ANIMATION_REFERENCE_CLASSIFICATION]', referenceCategoryByUrl);
	    const sourceSheetForScene = (scene: AnimationSheetScene): string => {
	      const rawIndex = scene.panelBounds?.sourceSheetIndex ?? scene.sourceSheetIndex ?? 0;
	      const sourceIndex = Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0;
	      return referenceImages[sourceIndex] || referenceImages[0] || '';
	    };
	    // Project owner is resolved from the request and the sheet itself — never from the conversation character.
	    const sceneCharacterNames = [...new Set(scenes.flatMap((scene) => scene.characters ?? []))];
	    const requestCharacterNames = resolveAnimationCharacters(text, queuedImages.map((image) => image.name));
	    const projectCharacterNames = requestCharacterNames.length > 0 ? requestCharacterNames : sceneCharacterNames;
	    const ownerCharacter = characters.find((item) => projectCharacterNames.some((name) => name.toLowerCase() === item.name.toLowerCase()));
	    console.log('[ANIMATION_PROJECT_OWNER]', {
	      ownerCharacterId: ownerCharacter?.id ?? '',
	      projectCharacterNames,
	      sceneCharacterNames,
	      conversationCharacterId: character.id,
	    });
	    const pipelineId = `animation-sheet:${Date.now()}`;
	    const videoPackage: VideoPackage = {
	      version: 1,
	      project_type: 'animation_sheet',
	      owner_character_id: ownerCharacter?.id ?? '',
	      // Keyword-classified count; the sheet was detected, so at least one attachment is a sheet.
	      animation_sheet_count: Math.max(classifiedAnimationSheetCount, 1),
	      source_storycard_id: pipelineId,
	      title: text.trim().slice(0, 80) || (projectCharacterNames[0] ? `${projectCharacterNames[0]} Animation Project` : 'Animation Project'),
	      duration: totalDuration,
	      character_name: projectCharacterNames.join(', '),
	      reference_images: referenceImages,
	      panelBounds: extraction.panelBounds,
	      story_summary: 'Gemini Scene Extractorでアニメシートから抽出した動画',
	      scenes: scenes.map((scene, index) => ({
	        id: scene.id,
			eventType: scene.eventType,
			eventId: scene.eventId,
			storyEvent: scene.storyEvent,
			sceneTransition: scene.sceneTransition,
			requiredEvent: scene.requiredEvent,
			characters: scene.characters,
	        sceneIndex: index,
	        title: animationSceneTitle(scene, index),
	        timecode: scene.timecode,
	        thumbnailUrl: sourceSheetForScene(scene),
	        sourcePanel: scene.sourcePanel || `PANEL${String(index + 1).padStart(2, '0')}`,
	        sourceSheetId: sourceSheetForScene(scene),
	        panelBounds: scene.panelBounds,
	        duration: scene.duration,
	        visual: scene.visual,
	        action: scene.motion,
	        dialogue: scene.dialogue,
	        camera: scene.camera,
	        mood: 'follow the animation sheet',
	        tags: [
			  'animation-sheet',
			  scene.requiredEvent ? 'required-event' : '',
			  scene.eventType || '',
			  scene.camera ? 'camera-directed' : '',
			  scene.dialogue ? 'dialogue' : 'silent',
			].filter(Boolean),
	      })),
	      dialogues: scenes.map((scene) => scene.dialogue).filter(Boolean),
	      camera_style: scenes.map((scene) => scene.camera).filter(Boolean).join(' / '),
	      music_mood: 'no music requirement',
	      motion_prompt: motionPrompt,
	      export_targets: ['Seedance'],
	    };
	    storeVideoProductionData('package', videoPackage);
	    console.log('[ANIMATION_SHEET_MODE]', {
	      ANIMATION_SHEET_MODE: true,
	      sceneCount: scenes.length,
	      totalDuration,
	      generatedMotionPromptLength: motionPrompt.length,
	    });
	    console.log('[ANIMATION_SHEET_SCENE_LIST]', scenes);
	    await appendMessage('user', text || 'この資料で動画を作って', referenceImages);
	    await appendMessage('assistant', `ANIMATION_SHEET_MODE / ${scenes.length} scenes / ${totalDuration}秒`, referenceImages, {
	      videoPackage,
	      motionPrompt,
	      aiModels: {
	        imageAnalysis: extraction.model,
	        motionPrompt: extraction.model,
	        video: AI_ROLE_MODELS.video,
	        intentRouter: AI_ROLE_MODELS.intentRouter,
	      },
	    });
	    const message = [...messages].reverse().find((entry) => entry.videoPackage?.source_storycard_id === pipelineId);
	    if (!message) throw new Error('Animation Sheet video message was not saved');
		console.log('[MOTION_PROMPT_SAVED]', {
			messageId: message.id,
			messagePromptLength: message.motionPrompt?.length ?? 0,
			packagePromptLength: message.videoPackage?.motion_prompt?.length ?? 0,
			resolvedPromptLength: motionPromptForMessage(message).length,
		});
	    currentStoryCard = null;
	    currentCuts = [];
	    currentMotionPrompt = motionPrompt;
	    currentVideoPackage = videoPackage;
	    currentReferenceImages = [...referenceImages];
	    logCurrentStoryCardState();
	    return { message, videoPackage, motionPrompt };
	  }

	  async function createStoryCardFromIntent(
	    text: string,
	    queuedImages: AttachImage[],
	    queuedYaml: { name: string; text: string } | null,
	  ): Promise<{ message: ChatMessage; storyCard: StoryCardDesign; motionPrompt: string } | null> {
	    if (!character) return null;
	    const attachmentPriorityMode = queuedImages.length >= 2 && /(?:動画(?:を)?\s*作って|アニメ化)/u.test(text);
	    const attachedReferenceImages = queuedImages.length > 0
	      ? await Promise.all(queuedImages.slice(0, MAX_REFERENCE_IMAGES).map((image) => persistImage(image.dataUrl)))
	      : [];
	    const allReferenceCandidates = await storyCardReferenceCandidates(attachedReferenceImages, queuedImages);
	    const referenceCandidates = attachmentPriorityMode
	      ? allReferenceCandidates.filter((reference) => reference.source === 'attachment')
	      : allReferenceCandidates;
	    const failureReferenceImages = [...new Set([
	      ...referenceCandidates.map((reference) => reference.url),
	      ...attachedReferenceImages,
	    ].filter(Boolean))].slice(0, MAX_REFERENCE_IMAGES);
	    const extractedNulaScenes = queuedYaml?.text ? parseScenesFromYaml(queuedYaml.text) : [];
	    console.log('[NULA_SCENE_EXTRACTION]', {
	      yamlAttached: Boolean(queuedYaml?.text),
	      yamlName: queuedYaml?.name ?? null,
	      sceneCount: extractedNulaScenes.length,
	      scenes: extractedNulaScenes,
	    });
	    const imageAnalysis = await requestStoryCardImageAnalysis(queuedImages, text);
	    const attachmentSummary = {
	      images: queuedImages.map((image, index) => ({
	        index: index + 1,
	        name: image.name,
	        mime: image.mime,
	        approxKB: Math.round(image.dataUrl.length / 1024),
	      })),
	      imageAnalysis: imageAnalysis?.text ?? '',
	      yaml: queuedYaml?.name ?? null,
	    };
	    const storyCardInput = {
	      characterName: character.name,
	      characterMemory: memory,
	      visualMemory: attachmentPriorityMode ? null : characterVisualMemory,
	      attachmentCount: queuedImages.length,
	      attachmentSummary,
	    };
	    console.log('[storyCardInput]', storyCardInput);
	    console.log('[STORYCARD_ATTACHMENT_PRIORITY_MODE]', {
	      attachmentPriorityMode,
	      attachmentCount: queuedImages.length,
	      matchedRequest: attachmentPriorityMode ? text : null,
	    });
	    const preservedMotionPrompt = currentMotionPrompt.trim();
	    const saveParseFailure = async (error: unknown, rawResponse: unknown): Promise<null> => {
	      const detail = error instanceof Error ? error.message : String(error);
	      const uiMessage = storyCardFailureMessage(new Error(`JSON Parse Error: ${detail}`));
	      const rawResponseText = typeof rawResponse === 'string'
	        ? rawResponse
	        : JSON.stringify(rawResponse, null, 2);
	      const failureStage = typeof rawResponse === 'string'
	        ? 'storycard_json_parse' as const
	        : 'storycard_validation' as const;
	      const emptyStoryCard = createEmptyStoryCard(failureReferenceImages, {
	        stage: failureStage,
	        message: '',
	        rawResponse: rawResponseText.slice(0, 7_000),
	        rawResponseLength: rawResponseText.length,
	        rawResponseTruncated: rawResponseText.length > 7_000,
	        motionPromptGenerationStarted: false,
	        preservedMotionPrompt: Boolean(preservedMotionPrompt),
	      });
	      currentStoryCard = emptyStoryCard;
	      currentCuts = [];
	      currentMotionPrompt = preservedMotionPrompt;
	      currentVideoPackage = null;
	      currentGeneratedVideo = '';
	      currentReferenceImages = [...failureReferenceImages];
	      logCurrentStoryCardState();
	      console.error('[STORYCARD_JSON_PARSE_ERROR]', {
	        error,
	        errorMessage: detail,
	        rawResponse,
	        referenceImageCount: failureReferenceImages.length,
	        preservedMotionPrompt: Boolean(preservedMotionPrompt),
	        motionPromptGenerationStarted: false,
	        failureStage,
	      });
	      errorMessage = uiMessage;
	      await appendMessage('assistant', 'Raw Response', failureReferenceImages, {
	        storyCard: emptyStoryCard,
	        ...(preservedMotionPrompt ? { motionPrompt: preservedMotionPrompt } : {}),
	        aiModels: { storyCard: AI_ROLE_MODELS.storyCard },
	      });
	      const failedMessage = [...messages].reverse().find((message) => message.storyCard?.id === emptyStoryCard.id);
	      if (failedMessage) {
	        updateVideoReferenceImages(failedMessage.id, failureReferenceImages);
	      }
	      return null;
	    };
	    await appendMessage('user', text || 'StoryCardを作成してください。', attachedReferenceImages);
	    const conversation = messages.slice(-12).map((message) => ({
	      role: message.role,
	      text: stripInlineImageData(message.text).slice(0, 2000),
	      timestamp: message.timestamp ?? message.createdAt,
	    }));
	    console.log('[STORYCARD_API_CALL]', {
	      characterId: character.id,
	      requestText: text,
	      conversationCount: conversation.length,
	      imageCount: queuedImages.length,
	    });
	    const response = await fetch('/api/storycard', {
	      method: 'POST',
	      headers: { 'content-type': 'application/json' },
	      body: JSON.stringify({
	        characterId: character.id,
	        characterName: character.name,
	        characterMemory: memory,
	        ...(attachmentPriorityMode ? {} : { visualMemory: characterVisualMemory }),
	        conversation,
	        images: [],
	        references: referenceCandidates,
	        preferAttachedReferences: queuedImages.length > 0,
	        attachmentPriorityMode,
	        attachmentCount: queuedImages.length,
	        attachmentSummary,
	        analysis: [
	          'Create an image-storyboard StoryCard, not a proposal document or work overview.',
	          'Output only title, duration, and cuts.',
	          'Every cut must contain id, start, end, title, description, and requiredUnits.',
	          'CUT descriptions must be concrete visible shot instructions.',
	          'Do not create VideoPackage or YAML here. Conversion happens later after the StoryCard JSON is complete.',
	          queuedYaml?.text ? `Attached YAML (${queuedYaml.name || 'YAML'}):\n${queuedYaml.text}` : '',
	          extractedNulaScenes.length > 0 ? `Extracted Nula scenes (preserve this order and structure):\n${JSON.stringify(extractedNulaScenes, null, 2)}` : '',
	          queuedImages.length > 0
	            ? `Selected chat character (voice/persona only; never use as the visual protagonist): ${character.name}`
	            : `Character: ${character.name}`,
	          queuedImages.length === 0 && character.description ? `Character notes: ${character.description}` : '',
	          imageAnalysis?.text ? `Gemini image analysis (reference evidence only):\n${imageAnalysis.text}` : '',
	        ].filter(Boolean).join('\n\n'),
	      }),
	    });
	    const responseBody = await response.text();
	    console.log('[STORYCARD_HTTP_RAW_RESPONSE]', responseBody);
	    console.log('[STORYCARD_HTTP_JSON_PARSE_INPUT]', responseBody);
	    let data: Record<string, any>;
	    try {
	      data = JSON.parse(responseBody) as Record<string, any>;
	    } catch (parseError) {
	      console.error('[STORYCARD_HTTP_JSON_PARSE_ERROR]', {
	        value: responseBody,
	        error: parseError,
	        errorMessage: parseError instanceof Error ? parseError.message : String(parseError),
	      });
	      return saveParseFailure(parseError, responseBody);
	    }
	    if (!response.ok) throw new Error(data?.message ?? 'StoryCard generation failed');
	    if (data?.parseSuccess === false || data?.fallback === true) {
	      return saveParseFailure(
	        new Error(typeof data?.failure?.message === 'string' ? data.failure.message : 'StoryCard JSON parse failed'),
	        data?.rawResponse ?? '',
	      );
	    }
	    const generatedStoryCard = parseStoryCard(data?.storyCard);
	    if (!generatedStoryCard) {
	      return saveParseFailure(new Error('StoryCard API did not return valid StoryCard JSON'), data?.storyCard ?? null);
	    }
	    console.log('[STORYCARD_DEBUG_GENERATED]', generatedStoryCard);
	    console.log('[STORYCARD_PARSE_CLIENT]', {
	      parseSuccess: true,
	      storyCardId: generatedStoryCard.id,
	      duration: generatedStoryCard.duration,
	      cutCount: generatedStoryCard.cuts.length,
	    });
	    console.log('[STORYCARD_API_RESPONSE]', {
	      ok: response.ok,
	      storyCardId: generatedStoryCard.id,
	      duration: generatedStoryCard.duration,
	      cutCount: generatedStoryCard.cuts?.length ?? 0,
	      isFallback: data?.isFallback === true,
	    });
	    const fallbackUsed = data?.fallback === true;
	    const fallbackCause = typeof data?.failure?.label === 'string'
	      ? data.failure.label
	      : 'GPT-5.5解析失敗';
	    const fallbackUiMessage = `${fallbackCause}\nGPT-5.5解析失敗のためFallback StoryCardを使用`;
	    if (fallbackUsed) errorMessage = fallbackUiMessage;
	    const storyCard = applyResolvedStoryCardReferences(generatedStoryCard, referenceCandidates);
	    currentStoryCard = storyCard;
	    currentCuts = [...storyCard.cuts];
	    console.log('[CURRENT_STORYCARD_JSON]', JSON.stringify(storyCard, null, 2));
	    const resolvedReferenceImages = storyCard.references
	      .map((reference) => reference.url)
	      .filter((url): url is string => Boolean(url))
	      .slice(0, MAX_REFERENCE_IMAGES);
	    console.log('[STORYCARD_REFERENCES_RESOLVED]', {
	      storyCardId: storyCard.id,
	      count: storyCard.references.length,
	      ids: storyCard.references.map((reference) => reference.id),
	      images: resolvedReferenceImages.length,
	    });
	    const summary = storyCard.summary || storyCard.title || 'Raw Response';
	    const videoPackage = createVideoPackageFromStoryCard(storyCard, character.name, resolvedReferenceImages);
	    const motionPrompt = motionPromptFromTimeline(videoPackage.scenes);
	    videoPackage.motion_prompt = motionPrompt;
	    console.log('[MOTION_PROMPT_FROM_TIMELINE]', {
	      storyCardId: storyCard.id,
	      sceneCount: videoPackage.scenes.length,
	      motionPromptLength: motionPrompt.length,
	    });
	    currentMotionPrompt = motionPrompt;
	    currentVideoPackage = videoPackage;
	    currentReferenceImages = [...resolvedReferenceImages];
	    logCurrentStoryCardState();
	    console.log('[VIDEO_PACKAGE_CREATED]', {
	      sourceStoryCardId: videoPackage.source_storycard_id,
	      duration: videoPackage.duration,
	      sceneCount: videoPackage.scenes.length,
	    });
	    await appendMessage('assistant', summary, resolvedReferenceImages, {
	      storyCard,
	      videoPackage,
	      motionPrompt,
	      aiModels: {
	        storyCard: typeof data?.sourceModel === 'string' ? data.sourceModel : AI_ROLE_MODELS.storyCard,
	        video: AI_ROLE_MODELS.video,
	        intentRouter: AI_ROLE_MODELS.intentRouter,
	        ...(imageAnalysis ? { imageAnalysis: imageAnalysis.model } : {}),
	      },
	    });
	    const storyCardMessage = [...messages].reverse().find((message) => (
	      message.role === 'assistant' && message.storyCard?.id === storyCard.id
	    ));
	    if (!storyCardMessage) throw new Error('StoryCard chat message was not created');
	    console.log('[STORYCARD_DEBUG_MESSAGE_STORYCARD_SAVED]', storyCardMessage.storyCard);
	    console.log('[CURRENT_SAVED_STORYCARD_JSON]', JSON.stringify(storyCardMessage.storyCard, null, 2));
	    console.log('[STORYCARD_DEBUG_MESSAGE_MOTION_PROMPT_SAVED]', storyCardMessage.motionPrompt);
	    console.log('[STORYCARD_MESSAGE_SAVED]', {
	      messageId: storyCardMessage.id,
	      hasStoryCard: Boolean(storyCardMessage.storyCard),
	      hasVideoPackage: Boolean(storyCardMessage.videoPackage),
	      storyCardId: storyCardMessage.storyCard?.id,
	      cutCount: storyCardMessage.storyCard?.cuts.length ?? 0,
	      hasMotionPrompt: Boolean(storyCardMessage.motionPrompt),
	    });
	    storyCardSummaryByMessageId = {
	      ...storyCardSummaryByMessageId,
	      [storyCardMessage.id]: storyCard.summary,
	    };
	    console.log('[STORYCARD_MOTION_PROMPT_APPLIED]', { storyCardId: storyCard.id, messageId: storyCardMessage.id, motionPrompt });
	    return { message: storyCardMessage, storyCard, motionPrompt };
	  }

	  async function generateImageFromStoryCard(card: StoryCardDesign, message: ChatMessage): Promise<void> {
	    if (generatingPortrait) return;
	    generatingPortrait = true;
	    errorMessage = '';
	    try {
	      const prompt = [
	        card.title,
	        card.summary,
	        card.theme ? `Theme: ${card.theme}` : '',
	        card.characters.length > 0 ? `Characters: ${card.characters.map((item) => item.name).join(', ')}` : '',
	        card.location ? `Location: ${card.location}` : '',
	        card.style ? `Style: ${card.style}` : '',
	        card.emotion ? `Emotion: ${card.emotion}` : '',
	      ].filter(Boolean).join('\n');
	      const generatedUrl = await generateImage(prompt, '1024x1024', 'illustration', messageAttachmentImages(message));
	      const savedUrl = await persistImage(generatedUrl);
	      rememberVisual(savedUrl, card.title, prompt, 'generated');
	      await appendMessage('assistant', `${card.title}\n画像を生成しました。`, savedUrl);
	      autoSpeakLatestReply();
	    } catch (error) {
	      errorMessage = error instanceof Error ? error.message : String(error);
	    } finally {
	      generatingPortrait = false;
	    }
	  }

	  async function generateVideoFromPackage(videoPackage: VideoPackage, message: ChatMessage): Promise<void> {
	    void generateDirectSeedanceAnimation(
	      message.id,
	      videoPackage,
	      videoReferenceImagesForMessage(message),
	    );
	  }

	  async function generateComicFromStoryCard(card: StoryCardDesign, doc: StoryDoc, message: ChatMessage): Promise<void> {
	    if (generatingPortrait) return;
	    generatingPortrait = true;
	    errorMessage = '';
	    try {
	      const prompt = buildComicPromptFromDoc(doc);
	      const generatedUrl = await generateImage(prompt, '1024x1024', 'manga', messageAttachmentImages(message));
	      const savedUrl = await persistImage(generatedUrl);
	      rememberVisual(savedUrl, `${card.title} comic`, prompt, 'generated');
	      await appendMessage('assistant', `${card.title}\n漫画を生成しました。`, savedUrl);
	      autoSpeakLatestReply();
	    } catch (error) {
	      errorMessage = error instanceof Error ? error.message : String(error);
	    } finally {
	      generatingPortrait = false;
	    }
	  }

	  async function readStoryCardJsonResponse(response: Response, label: string): Promise<Record<string, unknown>> {
	    const body = await response.text();
	    console.log('[STORYCARD_REFERENCE_SAVE_RESPONSE]', {
	      label,
	      ok: response.ok,
	      status: response.status,
	      responseLength: body.length,
	      bodyPreview: body.slice(0, 500),
	    });
	    if (!body.trim()) {
	      console.error('[STORYCARD_REFERENCE_JSON_EMPTY]', {
	        label,
	        ok: response.ok,
	        status: response.status,
	      });
	      return {};
	    }
	    try {
	      return JSON.parse(body) as Record<string, unknown>;
	    } catch (error) {
	      console.error('[STORYCARD_REFERENCE_JSON_PARSE_ERROR]', {
	        label,
	        ok: response.ok,
	        status: response.status,
	        responseLength: body.length,
	        body,
	        error,
	      });
	      throw new Error(`JSON Parse Error (${label}): ${error instanceof Error ? error.message : String(error)}`);
	    }
	  }

	  async function saveStoryCardJson(message: ChatMessage, card: StoryCardDesign): Promise<void> {
	    if (!character) return;
		    const storyCard = {
		      ...card,
		      updatedAt: new Date().toISOString(),
		    };
		    console.log('[STORYCARD_REFERENCE_SAVE_START]', {
		      messageId: message.id,
		      storyCardId: storyCard.id,
		      storyCardReferenceCount: storyCard.references?.length ?? 0,
		      attachmentReferenceCount: message.referenceImages?.length ?? 0,
		      referenceImages: storyCardReferenceImages(storyCard),
		    });
		    const saveResponse = await fetch('/api/storycard', {
		      method: 'PUT',
		      headers: { 'content-type': 'application/json' },
		      body: JSON.stringify({ storyCard, instruction: sourceRequestText(message) }),
		    });
		    const saved = await readStoryCardJsonResponse(saveResponse, 'StoryCard PUT');
		    if (!saveResponse.ok) throw new Error(typeof saved.message === 'string' ? saved.message : 'StoryCard JSON save failed');
		    const savedCard = (saved?.storyCard ?? storyCard) as StoryCardDesign;
		    const savedReferenceImages = storyCardReferenceImages(savedCard);
		    const videoPackage = createVideoPackageFromStoryCard(savedCard, character.name, savedReferenceImages);
		    const motionPrompt = motionPromptFromTimeline(videoPackage.scenes);
		    videoPackage.motion_prompt = motionPrompt;
	    const text = message.storyCard ? message.text : savedCard.summary || savedCard.title;
	    const chatResponse = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/chat`, {
	      method: 'PATCH',
	      headers: { 'content-type': 'application/json' },
	      body: JSON.stringify({
	        messageId: message.id,
	        text,
	        storyCard: savedCard,
	        referenceImages: savedReferenceImages,
	        videoPackage,
		        motionPrompt,
		      }),
		    });
		    const chatData = await readStoryCardJsonResponse(chatResponse, 'Character Memory PATCH');
		    if (!chatResponse.ok) throw new Error(typeof chatData.message === 'string' ? chatData.message : 'StoryCard chat JSON update failed');
		    if (!Array.isArray(chatData.messages)) {
		      throw new Error('Character Memory PATCH returned no messages');
		    }
		    messages = (chatData.messages as ChatMessage[]).map((entry) => ({ ...entry, text: stripInlineImageData(entry.text) }));
		    console.log('[STORYCARD_REFERENCE_SAVE_COMMITTED]', {
		      messageId: message.id,
		      storyCardId: savedCard.id,
		      savedReferenceCount: savedReferenceImages.length,
		      messageCount: messages.length,
		    });
	    storyCardSummaryByMessageId = { ...storyCardSummaryByMessageId, [message.id]: text };
	  }
	
	  function systemPrompt(mangaMode: boolean, hasImages: boolean, planningMode = false): string {
    if (!character) return '';
    const lines = [
      `あなたは「${character.name}」として会話してください。`,
      character.role ? `役割: ${character.role}` : '',
      character.description ? `設定: ${character.description}` : '',
      memoryPrompt(),
    ];
    if (planningMode) {
      lines.push(
        '[Phase 1: Planning Card]',
        'Return a concise planning card beginning exactly with "【Phase1 企画カード】".',
        'Include: title, premise, character role, setting, key beat, and next suggested action.',
        'Do not create a Story Card, YAML, manga, image, video, storyboard, or generation prompt.',
        'Wait for an explicit user instruction to create the Story Card before moving to Phase 2.',
      );
    } else if (mangaMode) {
      // Quality V1: 漫画制作モード。全キャラ共通の品質ルール（提案内容は人格で変わる）。
      lines.push(
        '【漫画制作モード】',
        'あなた自身（このキャラクター）が考えて、先回りで提案してください。ユーザーへの質問待ちは禁止です。',
        '「どんな漫画にしますか？」と毎回聞き直さないでください。会話履歴から流れを推測し、続きを作ってください。',
        '依頼が曖昧なときは、まずあなたの人格・設定に合うテーマ候補を3つ提示してください（例: ①日常あるある ②アンドロイドあるある ③姉妹ネタ）。',
        '1ページ漫画として必ず新しい展開を作ってください。最低4コマ、キャラクターを3回以上移動させ、状況変化を入れ、最後にオチを付けてください。',
        '各コマに必ずセリフを入れてください（空欄禁止）。',
        '添付画像は「資料」として扱い、完全再現は禁止です。キャラクターデザイン・表情・雰囲気・関係性だけを参考にし、必ず新しい1ページを考えてください。',
        '完成した1ページ漫画は、必ず次のYAMLコードブロック1つだけで出力してください（地の文で全文を繰り返さない）。',
        'dialogue は必ず speaker（話者名）と text（セリフ）のオブジェクト配列で構造化してください（空欄禁止）。',
        '```yaml',
        'story:',
        '  title: "（キャラの口調で短いタイトル）"',
        '  theme: "（テーマ）"',
        '  characters:',
        '    - "（登場キャラ名）"',
        '  scenes:',
        '    - title: "（コマ見出し）"',
        '      visual: "（情景）"',
        '      action: "（動き）"',
        '      dialogue:',
        '        - speaker: "（話者名）"',
        '          text: "（セリフ）"',
        '      emotion: "（表情）"',
        '```',
        'YAMLコードブロックの前に、一言だけ短い前置きを添えても構いません（任意・1行まで）。',
        '保存済みの性格・口調・好き嫌いを反映し、タイトルやセリフはキャラクターの口調で書いてください。',
      );
    } else {
      lines.push(
        hasImages
          ? '添付画像は資料として扱い、完全再現は禁止です。キャラクターデザイン・表情・雰囲気・関係性だけを参考にしてください。'
          : 'Character Memory Chatでは日常会話に集中してください。',
        '保存済みの性格・口調・好き嫌いを優先し、自然な日本語で返答してください。',
      );
    }
    return lines.filter(Boolean).join('\n');
  }

  async function appendMessage(
    role: ChatMessage['role'],
    text: string,
    referenceImages: string[] | string = [],
    structured: { storyCard?: StoryCardDesign; videoPackage?: VideoPackage; motionPrompt?: string; aiModels?: AIModelMetadata; voiceDirection?: ChatVoiceDirection } = {},
  ): Promise<void> {
    if (projectOnlyMode) {
      const now = new Date().toISOString();
      messages = [...messages, {
        id: `project-only:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        role,
        text: stripInlineImageData(text),
        referenceImages: [...new Set(Array.isArray(referenceImages) ? referenceImages : [referenceImages])].filter(Boolean),
        ...structured,
        timestamp: now,
        createdAt: now,
      }];
      return;
    }
    if (!character) return;
    const response = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        role,
        text,
        referenceImages: [...new Set(Array.isArray(referenceImages) ? referenceImages : [referenceImages])].filter(Boolean),
        ...structured,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message ?? 'Chat log save failed');
    messages = (data.messages as ChatMessage[]).map((message) => ({ ...message, text: stripInlineImageData(message.text) }));
  }

  // 🔊 Voice Bridge TTS -------------------------------------------------------
  // キャラ切替時に voice 設定を取得する。未設定 / レジストリ未登録なら null (再生ボタン非表示)。
  $effect(() => {
    const id = character?.id;
    voiceConfig = null;
    voiceConfigLoaded = false;
    voiceStateByMessageId = {};
    voiceUrlByMessageId = {};
    voiceBackendByMessageId = {};
    lastRunpodVoiceBackend = null;
    voiceDraftMessageId = '';
    voiceSavingMessageId = '';
    voiceSavedMessageId = '';
    voiceWorkflowMessage = '';
    voiceResetting = false;
    const storedDailyVoiceDirection = id ? loadDailyVoiceDirection(id) : null;
    dailyVoiceDirection = storedDailyVoiceDirection;
    if (storedDailyVoiceDirection) voiceWorkflowMessage = `今日の話し方を継続中: ${storedDailyVoiceDirection.summary}`;
    voiceOutputEffectMode = id
      ? parseVoiceOutputEffectMode(localStorage.getItem(`ai-vtuber:voice-output-effect:${id}`))
      : 'off';
    if (!id) return;
    fetch(`/api/voice/speak?characterId=${encodeURIComponent(id)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (character?.id === id) {
          voiceConfig = (data?.voice as CharacterVoiceConfig | null) ?? null;
          if (!hasStoredProactiveSettings(id)) {
            proactiveSettings.autoPlayVoice = voiceConfig?.autoSpeak ?? false;
          }
          voiceConfigLoaded = true;
        }
      })
      .catch(() => {
        if (character?.id === id) {
          voiceConfig = null;
          voiceConfigLoaded = true;
        }
      });
  });

  /** assistant メッセージを音声化して再生する。失敗はボタン上の ⚠ 表示のみでチャットは継続。 */
  async function speakMessage(message: ChatMessage): Promise<void> {
    enqueueSpeech(message, proactiveMessageIds[message.id] ? 'proactive' : 'user_reply');
  }

  function openImageVoiceDesigner(): void {
    if (!character) return;
    const returnUrl = `/character-memory?id=${encodeURIComponent(character.id)}`;
    window.location.href = `/characters?voiceDesigner=${encodeURIComponent(character.id)}&returnTo=${encodeURIComponent(returnUrl)}`;
  }

  function isVoiceAdoptionRequest(value: string): boolean {
    return /(?:この|今の|さっきの)(?:声|ボイス).{0,16}(?:決め|採用|保存|固定)/u.test(value.normalize('NFKC'));
  }

  function panelVoiceDraftMessageId(): string {
    const explicitDraft = messages.find((message) => message.id === voiceDraftMessageId);
    if (explicitDraft) return explicitDraft.id;
    if (voiceConfig) return '';
    return [...messages].reverse().find((message) => (
      message.role === 'assistant'
      && Boolean(message.voiceDirection)
      && !message.voiceDirection?.preserveBaseVoice
      && Boolean(voiceUrlByMessageId[message.id])
    ))?.id ?? '';
  }

  async function adoptMessageVoice(message: ChatMessage): Promise<boolean> {
    if (!character || !message.voiceDirection || message.voiceDirection.preserveBaseVoice || voiceSavingMessageId) return false;
    const sourceAudioUrl = voiceUrlByMessageId[message.id] ?? '';
    if (!sourceAudioUrl) {
      voiceWorkflowMessage = '先に候補の「再生」を押して、ローカル音声を生成してください。';
      return false;
    }

    const targetCharacterId = character.id;
    voiceSavingMessageId = message.id;
    voiceWorkflowMessage = 'この候補をローカル基本声として保存しています…';
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(targetCharacterId)}/voice`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          voice: {
            engine: 'irodori',
            mode: 'design',
            model: '',
            caption: message.voiceDirection.caption,
            speed: voiceConfig?.speed ?? 1,
            autoSpeak: proactiveSettings.autoPlayVoice,
          },
          keptVoice: {
            sourceAudioUrl,
            text: sanitizeSpeechText(stripInlineImageData(message.text)),
            name: `${targetCharacterId}_chat_${Date.now()}`,
          },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        character?: { voice?: CharacterVoiceConfig };
        message?: string;
      };
      if (!response.ok || !data.character?.voice) {
        throw new Error(data.message || `voice save failed (${response.status})`);
      }
      if (character?.id !== targetCharacterId) return false;
      voiceConfig = data.character.voice;
      voiceConfigLoaded = true;
      voiceDraftMessageId = '';
      voiceSavedMessageId = message.id;
      voiceWorkflowMessage = `${character.name}の基本声としてローカル保存しました。`;
      return true;
    } catch (error) {
      voiceWorkflowMessage = error instanceof Error ? error.message : '声の保存に失敗しました。';
      return false;
    } finally {
      voiceSavingMessageId = '';
    }
  }

  async function resetCharacterVoice(): Promise<void> {
    if (!character || !voiceConfig || voiceResetting) return;
    if (!confirm(`${character.name}の現在の基本声を解除して、会話から決め直しますか？\n元の音声WAVは削除されません。`)) return;
    const targetCharacterId = character.id;
    voiceResetting = true;
    voiceWorkflowMessage = '基本声の設定を解除しています…';
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(targetCharacterId)}/voice`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ voice: null }),
      });
      const data = (await response.json().catch(() => ({}))) as { character?: unknown; message?: string };
      if (!response.ok || !data.character) throw new Error(data.message || `voice reset failed (${response.status})`);
      if (character?.id !== targetCharacterId) return;
      voiceConfig = null;
      voiceDraftMessageId = '';
      voiceSavedMessageId = '';
      proactiveSettings.autoPlayVoice = false;
      saveCurrentProactiveSettings();
      voiceWorkflowMessage = '基本声を未設定にしました。会話しながら新しい声を作れます。';
    } catch (error) {
      voiceWorkflowMessage = error instanceof Error ? error.message : '基本声の解除に失敗しました。';
    } finally {
      voiceResetting = false;
    }
  }

  /** autoSpeak 用: 直近の assistant 返信を自動再生する (エラーは speakMessage 内で握りつぶす)。 */
  function autoSpeakLatestReply(): void {
    const latest = [...messages].reverse().find((message) => message.role === 'assistant' && message.text);
    if (!latest) return;
    logAITuberEvent('assistant_reply', character?.id ?? '', {
      origin: 'user_reply',
      metadata: { messageId: latest.id, actualModel: latest.aiModels?.conversation ?? null },
    });
    if (proactiveSettings.autoPlayVoice) enqueueSpeech(latest, 'user_reply');
  }

  function recentPerformanceDirection(): ChatVoiceDirection | undefined {
    return [...messages].reverse().find((message) => (
      message.role === 'assistant'
      && message.voiceDirection?.preserveBaseVoice
    ))?.voiceDirection;
  }

  function resolveChatVoiceDirection(instruction: string): ChatVoiceDirection {
    // Voice drafting is deliberately local-only. Irodori receives the user's
    // natural-language direction directly; no cloud voice director or FAL call.
    if (isDailyDeliveryInstruction(instruction)) {
      const previous = referencesRecentDelivery(instruction) ? recentPerformanceDirection() : undefined;
      const effectiveInstruction = previous?.instruction ?? instruction;
      const effectiveSummary = previous?.summary.replace(/^(?:この返事だけ|今日の話し方)[:：]\s*/u, '')
        || Array.from(instruction).slice(0, 90).join('');
      const speedOnly = previous?.speedOnly ?? isSpeedOnlyDeliveryInstruction(effectiveInstruction);
      return {
        instruction: effectiveInstruction,
        caption: speedOnly ? '' : buildDailyDeliveryCaption(effectiveInstruction),
        summary: speedOnly ? `今日の速度: ${effectiveSummary}` : `今日の話し方: ${effectiveSummary}`,
        model: speedOnly ? 'local-time-stretch' : 'local-irodori-performance',
        scope: 'day',
        preserveBaseVoice: true,
        speed: previous?.speed ?? inferOneShotDeliverySpeed(effectiveInstruction),
		pitchShiftSemitones: previous?.pitchShiftSemitones ?? inferOneShotPitchShiftSemitones(effectiveInstruction),
        ...(speedOnly ? { speedOnly: true } : {}),
      };
    }
    if (isOneShotDeliveryInstruction(instruction)) {
      const speedOnly = isSpeedOnlyDeliveryInstruction(instruction);
      return {
        instruction,
        caption: speedOnly ? '' : buildOneShotDeliveryCaption(instruction),
        summary: speedOnly
          ? `速度だけ変更: ${Array.from(instruction).slice(0, 90).join('')}`
          : `この返事だけ: ${Array.from(instruction).slice(0, 90).join('')}`,
        model: speedOnly ? 'local-time-stretch' : 'local-irodori-performance',
        scope: 'one-shot',
        preserveBaseVoice: true,
        speed: inferOneShotDeliverySpeed(instruction),
		pitchShiftSemitones: inferOneShotPitchShiftSemitones(instruction),
        ...(speedOnly ? { speedOnly: true } : {}),
      };
    }
    return {
      instruction,
      caption: buildFallbackChatVoiceCaption([
		character?.name ? `キャラクター名: ${character.name}` : '',
		character?.role ? `役割: ${character.role}` : '',
		character?.description ? `設定: ${character.description}` : '',
	  ].filter(Boolean).join('。'), instruction),
      summary: Array.from(instruction).slice(0, 120).join(''),
      model: 'local-irodori',
    };
  }

  function memoryReviewConversation() {
    return messages.slice(-24).map((message) => ({
      role: message.role,
      text: stripInlineImageData(message.text).slice(0, 2000),
      timestamp: message.timestamp ?? message.createdAt,
    }));
  }

  function memoryReviewCurrentMemory() {
    return memoryV2.longTermMemory.slice(-24).map((item) => ({
      id: item.id,
      title: item.content.slice(0, 40),
      content: item.content,
      importance: item.importance > 1 ? item.importance / 100 : item.importance,
      timestamp: item.createdAt,
      tags: [item.source],
    }));
  }

	function memoryReviewTechnicalEvidence(): MemoryReviewTechnicalEvidence[] {
		const evidence: MemoryReviewTechnicalEvidence[] = [];
		const add = (kind: MemoryReviewTechnicalEvidence['kind'], key: string, value: unknown, source: string) => {
			if (typeof value !== 'string' || !value.trim()) return;
			const normalizedValue = value.trim().slice(0, 300);
			evidence.push({ id: `${source}:${key}:${normalizedValue}`.slice(0, 180), kind, key, value: normalizedValue, source });
		};
		for (const message of messages.slice(-40)) {
			for (const [key, value] of Object.entries(message.aiModels ?? {})) add('model', key, value, `message:${message.id}:aiModels`);
		}
		const inspectMetadata = (value: unknown, source: string, depth = 0): void => {
			if (!value || typeof value !== 'object' || depth > 3) return;
			for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
				if (typeof item === 'string' && /(?:model|provider|api|endpoint|system|architecture|config)/iu.test(key)) {
					const kind: MemoryReviewTechnicalEvidence['kind'] = /(?:api|endpoint)/iu.test(key) ? 'api'
						: /provider/iu.test(key) ? 'provider'
						: /(?:system|architecture|config)/iu.test(key) ? 'system' : 'model';
					add(kind, key, item, source);
				} else if (item && typeof item === 'object') inspectMetadata(item, source, depth + 1);
			}
		};
		for (const record of getVideoProductionRecords()) inspectMetadata(record.value, `production:${record.id}`);
		return evidence.filter((item, index, all) => all.findIndex((candidate) => candidate.kind === item.kind && candidate.key === item.key && candidate.value === item.value) === index).slice(-80);
	}

  async function runMemoryReview(): Promise<void> {
    if (!character || messages.length < 2) return;
    const reviewCharacterId = character.id;
    reviewingMemory = true;
    memoryReview = null;
    thoughtActionCandidate = null;
    thoughtActionRoute = null;
    savedReviewIndexes = [];
    skippedReviewIndexes = [];
    memoryReviewSaveComment = '';
    memoryReviewSaveDebug = null;
    memorySearchDebug = null;
    try {
      const response = await fetch('/api/memory-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId: reviewCharacterId,
          conversation: memoryReviewConversation(),
          currentMemory: memoryReviewCurrentMemory(),
          battery: brainLayers?.energy ?? displayEnergy,
          emotion: currentEmotion ? `${currentEmotion.label}: ${currentEmotion.tone}` : undefined,
          mindState: brainLayers ? `${brainLayers.theme} / ${brainLayers.activityState}` : undefined,
		  technicalEvidence: memoryReviewTechnicalEvidence(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message ?? `Memory Review failed: HTTP ${response.status}`);
      if (character?.id !== reviewCharacterId) return;
      memoryReview = data as MemoryReviewResponse;
      console.log('[MEMORY_REVIEW_JSON]', memoryReview);
      thoughtActionCandidate = memoryReview.actionCandidate?.needAction === true
        ? memoryReview.actionCandidate
        : null;
      if (thoughtActionCandidate) {
        console.log('[ThoughtAction]', thoughtActionCandidate);
        void routeThoughtActionCandidate(reviewCharacterId, memoryReview, thoughtActionCandidate);
      }
      const reflection = (memoryReview.reflectionComment || memoryReview.summary || '').replace(/[。.]+$/u, '');
      if (reflection) {
        pushThinkingStep('😌', 'Memory Review', [`${reflection}…おぼえておこう…`],
          [`Memory Review: importance=${memoryReview.importance} candidates=${memoryReview.candidates.length}`], 'monologue');
      }
    } catch (error) {
      console.warn('[MEMORY_REVIEW_ERROR]', error instanceof Error ? error.message : String(error));
    } finally {
      if (character?.id === reviewCharacterId) reviewingMemory = false;
    }
  }

  async function routeThoughtActionCandidate(
    reviewCharacterId: string,
    review: MemoryReviewResponse,
    candidate: ActionCandidate,
  ): Promise<void> {
    const conversation = memoryReviewConversation();
    const latestUserMessage = [...conversation].reverse().find((message) => message.role === 'user')?.text ?? '';
    if (!latestUserMessage || !candidate.needAction) return;
    try {
      const response = await fetch('/api/intent-router', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          surface: 'character-memory',
          userMessage: latestUserMessage,
          recentMessages: conversation.slice(-8),
          availableIntents: ['CHAT', 'IMAGE', 'VIDEO', 'VIDEO_EDIT', 'MANGA', 'VOICE', 'YAML', 'MEMORY_LOOKUP', 'WEB_SEARCH'],
          state: {
            source: 'thought-review',
            thoughtActionCandidate: candidate,
            reviewSummary: review.summary,
            executorAvailable: false,
          },
          characterId: reviewCharacterId,
          characterName: character?.name,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message ?? `Thought Action routing failed: HTTP ${response.status}`);
      if (character?.id !== reviewCharacterId) return;
      thoughtActionRoute = result as IntentDecision & { action?: string; finalAction?: string; pendingAction?: boolean };
      console.log('[ThoughtAction][IntentRouter]', thoughtActionRoute);
      pushThinkingStep('🧭', 'Action Candidate routing', [], [
        `intent=${thoughtActionRoute.intent}`,
        `confidence=${thoughtActionRoute.confidence}`,
        `action=${thoughtActionRoute.action ?? '-'}`,
      ]);
    } catch (error) {
      console.warn('[THOUGHT_ACTION_ROUTER_ERROR]', error instanceof Error ? error.message : String(error));
    }
  }

  // 🧠 Observation Mode: 通常返信の代わりに観察用の思考状態データを生成する。
  // actionCandidate は表示のみで、Intent Router・Executor へは渡さない（自動実行禁止）。
  async function runThoughtObservation(text: string): Promise<void> {
    if (!character) return;
    const observationCharacterId = character.id;
    sending = true;
    observing = true;
    errorMessage = '';
    try {
      // ユーザー入力は通常履歴に残す（シロの返信吹き出しは生成しない）。
      await appendMessage('user', text);
      const relevantMemories = await searchCharacterMemories(text);
      const response = await fetch('/api/thought-observation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId: observationCharacterId,
          characterName: character.name,
          userMessage: text,
          recentMessages: messages.slice(-8).map((message) => ({
            role: message.role,
            text: stripInlineImageData(message.text).slice(0, 500),
          })),
          relevantMemories: relevantMemories.slice(0, 5).map((hit) => ({
            title: hit.title,
            summary: hit.summary.slice(0, 200),
          })),
          emotion: currentEmotion ? `${currentEmotion.label}: ${currentEmotion.tone}` : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message ?? `Thought Observation failed: HTTP ${response.status}`);
      if (character?.id !== observationCharacterId) return;
      const observation = data as ThoughtObservation;
      thoughtObservations = [...thoughtObservations, observation].slice(-20);
      console.log('[ThoughtObservation]', {
        currentFocus: observation.currentFocus,
        status: observation.status,
        conflict: observation.conflict ?? '',
        memoryReference: observation.memoryReference ?? '',
        actionCandidate: observation.actionCandidate,
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      sending = false;
      observing = false;
    }
  }

  function relationshipReviewCurrentData() {
    return {
      items: relationships.slice(-80),
    };
  }

  async function runRelationshipReview(): Promise<void> {
    if (!character || messages.length < 2) return;
    const reviewCharacterId = character.id;
    reviewingRelationship = true;
    relationshipReview = null;
    savedRelationshipIndexes = [];
    skippedRelationshipIndexes = [];
    relationshipSaveComment = '';
    relationshipSaveDebug = null;
    relationshipSearchDebug = null;
    try {
      const response = await fetch('/api/character-relationship/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId: reviewCharacterId,
          conversation: memoryReviewConversation(),
          currentRelationship: relationshipReviewCurrentData(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message ?? `Relationship Review failed: HTTP ${response.status}`);
      if (character?.id !== reviewCharacterId) return;
      relationshipReview = data as RelationshipReviewResponse;
      console.log('[RELATIONSHIP_REVIEW_JSON]', relationshipReview);
      const relationSummary = (relationshipReview.summary || '').replace(/[。.]+$/u, '');
      if (relationSummary) {
        pushThinkingStep('😊', 'Relationship Review', [`${THINKING_USER_NAME}とのこと…${relationSummary}…`],
          [`Relationship Review: updates=${relationshipReview.updates.length}`], 'monologue');
      }
    } catch (error) {
      console.warn('[RELATIONSHIP_REVIEW_ERROR]', error instanceof Error ? error.message : String(error));
    } finally {
      if (character?.id === reviewCharacterId) reviewingRelationship = false;
    }
  }

  async function runEmotionReview(): Promise<void> {
    if (!character || messages.length < 2) return;
    const reviewCharacterId = character.id;
    reviewingEmotion = true;
    emotionReview = null;
    savedEmotion = null;
    emotionSaveComment = '';
    emotionSaveDebug = null;
    try {
      const response = await fetch('/api/character-emotion/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId: reviewCharacterId,
          conversation: memoryReviewConversation(),
          currentEmotion: emotionBrain.current,
          recentMemories: memoryReviewCurrentMemory(),
        }),
      });
      const data = await response.json().catch(() => ({})) as EmotionReviewResponse & { message?: string };
      if (!response.ok) throw new Error(data?.message ?? `Emotion Review failed: HTTP ${response.status}`);
      if (character?.id !== reviewCharacterId) return;
      emotionReview = data;
      console.log('[EMOTION_REVIEW_JSON]', emotionReview);
      pushEmotionThought({ id: '', emotion: data.emotion, reason: data.reason, intensity: data.intensity, confidence: data.confidence, createdAt: data.timestamp }, 'Emotion Review');

      const payload = {
        characterId: reviewCharacterId,
        source: 'emotion-review' as const,
        emotion: data.emotion,
        reason: data.reason,
        intensity: data.intensity,
        confidence: data.confidence,
      };
      const startedAt = performance.now();
      emotionSaveDebug = { requestPayload: payload };
      const saveResponse = await fetch('/api/character-emotion/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saveData = await saveResponse.json().catch(() => ({})) as EmotionSaveResponse & { message?: string; updatedAt?: string };
      emotionSaveDebug = {
        requestPayload: payload,
        responseJson: saveData,
        latencyMs: Math.round(performance.now() - startedAt),
      };
      if (!saveResponse.ok || saveData.ok !== true) throw new Error(saveData.message ?? `Emotion save failed: HTTP ${saveResponse.status}`);
      savedEmotion = saveData.saved;
      emotionBrain = saveData.emotion ?? emotionBrain;
      emotionSaveComment = saveData.comment ?? '今の気持ちをBrainに保存しました。';
      updatedAt = saveData.updatedAt ?? updatedAt;
      markMemoryEntry();
    } catch (error) {
      console.warn('[EMOTION_REVIEW_ERROR]', error instanceof Error ? error.message : String(error));
    } finally {
      if (character?.id === reviewCharacterId) reviewingEmotion = false;
    }
  }

  async function runNightRoutine(): Promise<void> {
    if (!character) return;
    await runMemoryReview();
    await runRelationshipReview();
    await runEmotionReview();
    const payload = {
      characterId: character.id,
      memoryReview,
      relationshipReview,
      emotionReview,
    };
    routineDebug = {
      currentState: routineBrain.currentState,
      lastSleep: routineBrain.lastSleepTime,
      todaySummary: routineBrain.todaySummary,
      todayGoal: routineBrain.todayGoal,
      requestPayload: payload,
    };
    try {
      const response = await fetch('/api/character-routine/night', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({})) as RoutineNightResponse & { message?: string };
      if (!response.ok || data.ok !== true) throw new Error(data.message ?? `Night Routine failed: HTTP ${response.status}`);
      routineBrain = data.routine;
      if (data.experience) experiences = [...experiences, data.experience].slice(-120);
      routineMessage = data.sleepComment;
      routineDebug = {
        currentState: data.routine.currentState,
        lastSleep: data.routine.lastSleepTime,
        todaySummary: data.todaySummary,
        todayGoal: data.currentGoal,
        requestPayload: payload,
        responseJson: data,
      };
      if (idleTimer) clearTimeout(idleTimer);
      markMemoryEntry();
    } catch (error) {
      routineDebug = {
        currentState: routineBrain.currentState,
        lastSleep: routineBrain.lastSleepTime,
        todaySummary: routineBrain.todaySummary,
        todayGoal: routineBrain.todayGoal,
        requestPayload: payload,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function saveReviewMemoryIndexes(indexes: number[]): Promise<void> {
    if (!character || !memoryReview || indexes.length === 0 || savingReviewMemory) return;
    const review = memoryReview;
    const uniqueIndexes = Array.from(new Set(indexes))
      .filter((index) => index >= 0 && index < review.candidates.length)
      .filter((index) => !savedReviewIndexes.includes(index));
    if (uniqueIndexes.length === 0) return;
    const payload = {
      characterId: character.id,
      source: 'memory-review' as const,
      candidates: uniqueIndexes.map((index) => review.candidates[index]),
      summary: review.summary,
      reflectionComment: review.reflectionComment,
	  technicalEvidence: review.technicalEvidence ?? [],
    };
    savingReviewMemory = true;
    memoryReviewSaveDebug = { requestPayload: payload };
    try {
      const response = await fetch('/api/character-memory/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({})) as MemoryReviewSaveResponse & { message?: string; updatedAt?: string };
      memoryReviewSaveDebug = {
        requestPayload: payload,
        responseJson: data,
        savedCount: data.savedCount ?? 0,
        savedIds: Array.isArray(data.saved) ? data.saved.map((record) => record.id) : [],
      };
      if (!response.ok || data.ok !== true) throw new Error(data.message ?? `Memory save failed: HTTP ${response.status}`);
      savedReviewIndexes = Array.from(new Set([...savedReviewIndexes, ...uniqueIndexes]));
      skippedReviewIndexes = skippedReviewIndexes.filter((index) => !uniqueIndexes.includes(index));
      memoryReviewSaveComment = data.comment ?? '忘れないように記憶しました。';
      updatedAt = data.updatedAt ?? updatedAt;
      markMemoryEntry();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      savingReviewMemory = false;
    }
  }

  function saveReviewCandidate(index: number): void {
    void saveReviewMemoryIndexes([index]);
  }

  function saveRecommendedReviewCandidates(): void {
    if (!memoryReview) return;
    const recommended = memoryReview.candidates
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate, index }) => candidate.importance >= 0.8 && !savedReviewIndexes.includes(index) && !skippedReviewIndexes.includes(index))
      .map(({ index }) => index);
    void saveReviewMemoryIndexes(recommended);
  }

  function skipReviewCandidate(index: number): void {
    if (savedReviewIndexes.includes(index)) return;
    skippedReviewIndexes = Array.from(new Set([...skippedReviewIndexes, index]));
  }

  async function saveRelationshipIndexes(indexes: number[]): Promise<void> {
    if (!character || !relationshipReview || indexes.length === 0 || savingRelationship) return;
    const review = relationshipReview;
    const uniqueIndexes = Array.from(new Set(indexes))
      .filter((index) => index >= 0 && index < review.updates.length)
      .filter((index) => !savedRelationshipIndexes.includes(index));
    if (uniqueIndexes.length === 0) return;
    const payload = {
      characterId: character.id,
      source: 'relationship-review' as const,
      updates: uniqueIndexes.map((index) => review.updates[index]),
      summary: review.summary,
    };
    savingRelationship = true;
    relationshipSaveDebug = { requestPayload: payload };
    try {
      const response = await fetch('/api/character-relationship/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({})) as RelationshipSaveResponse & { message?: string; updatedAt?: string };
      relationshipSaveDebug = {
        requestPayload: payload,
        responseJson: data,
        savedCount: data.savedCount ?? 0,
        savedIds: Array.isArray(data.saved) ? data.saved.map((record) => record.id) : [],
      };
      if (!response.ok || data.ok !== true) throw new Error(data.message ?? `Relationship save failed: HTTP ${response.status}`);
      savedRelationshipIndexes = Array.from(new Set([...savedRelationshipIndexes, ...uniqueIndexes]));
      skippedRelationshipIndexes = skippedRelationshipIndexes.filter((index) => !uniqueIndexes.includes(index));
      relationshipSaveComment = data.comment ?? 'RootSさんのこととして覚えました。';
      relationships = [...relationships, ...(Array.isArray(data.saved) ? data.saved : [])].slice(-160);
      updatedAt = data.updatedAt ?? updatedAt;
      markMemoryEntry();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      savingRelationship = false;
    }
  }

  function saveRelationshipCandidate(index: number): void {
    void saveRelationshipIndexes([index]);
  }

  function saveRecommendedRelationshipCandidates(): void {
    if (!relationshipReview) return;
    const recommended = relationshipReview.updates
      .map((update, index) => ({ update, index }))
      .filter(({ update, index }) => update.confidence >= 0.8 && !savedRelationshipIndexes.includes(index) && !skippedRelationshipIndexes.includes(index))
      .map(({ index }) => index);
    void saveRelationshipIndexes(recommended);
  }

  function skipRelationshipCandidate(index: number): void {
    if (savedRelationshipIndexes.includes(index)) return;
    skippedRelationshipIndexes = Array.from(new Set([...skippedRelationshipIndexes, index]));
  }


  let animationYamlByMessageId = $state<Record<string, string>>({});
  let videoPackageByMessageId = $state<Record<string, string>>({});
  let generatedVideoByMessageId = $state<Record<string, string>>({});
  let generatedVideoBackendByMessageId = $state<Record<string, 'runpod-pod' | 'runpod-serverless'>>({});
  let videoDurationDebugByMessageId = $state<Record<string, { originalDuration: number; safeDuration: number }>>({});
  let generatingVideoByMessageId = $state<Record<string, boolean>>({});
  $effect(() => {
    const hasVideoGeneration = videoGenerationState === 'generating' || Object.values(generatingVideoByMessageId).some(Boolean);
    const queueActive = speechQueueSize > 0;
    if (generatingPortrait) characterRuntime.setState('generating_image');
    else if (hasVideoGeneration) characterRuntime.setState('generating_video');
    else if (sending || proactiveRunning) characterRuntime.setState('thinking');
    else if (!queueActive) characterRuntime.setState('idle');
  });
  $effect(() => {
    const bridge = aituberBridge;
    if (!bridge) return;
    bridge.setThinking(runtimeSnapshot.state === 'thinking');
    if (!avatarState.speaking) bridge.setExistingEmotion(emotionBrain.current ?? currentEmotion ?? 'neutral');
  });
  let videoErrorByMessageId = $state<Record<string, string>>({});
  let referenceImagesByMessageId = $state<Record<string, string[]>>({});
  let storyCardSummaryByMessageId = $state<Record<string, string>>({});
	let currentStoryCard = $state<StoryCardDesign | null>(null);
	let currentMotionPrompt = $state('');
	let currentCuts = $state<StoryCardDesign['cuts']>([]);
	let currentVideoPackage = $state<VideoPackage | null>(null);
	let currentGeneratedVideo = $state('');
	let currentReferenceImages = $state<string[]>([]);
	const STORYCARD_STORAGE_TOKENS = ['storycard', 'motionprompt', 'videodraft', 'videopackage'] as const;

	function isStoryCardStorageKey(key: string): boolean {
	  const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
	  return STORYCARD_STORAGE_TOKENS.some((token) => normalized.includes(token));
	}

	async function enumerateStoryCardStorage(): Promise<{
	  localStorage: string[];
	  sessionStorage: string[];
	  indexedDB: Array<{ name: string; stores: string[] }>;
	}> {
	  const localKeys = typeof localStorage === 'undefined'
	    ? []
	    : Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? '').filter(isStoryCardStorageKey);
	  const sessionKeys = typeof sessionStorage === 'undefined'
	    ? []
	    : Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index) ?? '').filter(isStoryCardStorageKey);
	  const indexedDatabases: Array<{ name: string; stores: string[] }> = [];
	  if (typeof indexedDB !== 'undefined') {
	    const factory = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string; version?: number }>> };
	    const databases = factory.databases ? await factory.databases().catch(() => []) : [];
	    for (const database of databases) {
	      if (!database.name) continue;
	      const stores = await new Promise<string[]>((resolve) => {
	        const request = indexedDB.open(database.name!);
	        request.onerror = () => resolve([]);
	        request.onsuccess = () => {
	          const db = request.result;
	          const names = Array.from(db.objectStoreNames);
	          db.close();
	          resolve(names);
	        };
	      });
	      if (isStoryCardStorageKey(database.name) || stores.some(isStoryCardStorageKey)) {
	        indexedDatabases.push({ name: database.name, stores });
	      }
	    }
	  }
	  const result = { localStorage: localKeys, sessionStorage: sessionKeys, indexedDB: indexedDatabases };
	  console.log('[STORYCARD_STORAGE_ENUMERATION]', result);
	  return result;
	}

	function logCurrentStoryCardState(): void {
	  console.log('[CURRENT_STORYCARD_JSON]', currentStoryCard ? JSON.stringify(currentStoryCard, null, 2) : null);
	  console.log('[CURRENT_MOTION_PROMPT]', currentMotionPrompt);
	  console.log('[CURRENT_REFERENCE_IMAGES]', currentReferenceImages);
	  console.log('[CURRENT_CHARACTER_ID]', character?.id ?? selectedId ?? null);
	}

	async function resetStoryCardState(options: {
	  reason?: 'manual-button' | 'character-switch' | 'new-video-generation' | 'animation-sheet-mode';
	  clearBrowserStorage?: boolean;
	  clearAttachments?: boolean;
	  persistMessageState?: boolean;
	  preserveProjectMedia?: boolean;
	} = {}): Promise<void> {
	  const reason = options.reason ?? 'manual-button';
	  const clearBrowserStorage = options.clearBrowserStorage ?? true;
	  const clearAttachments = options.clearAttachments ?? true;
	  const persistMessageState = options.persistMessageState ?? reason === 'manual-button';
	  const preserveProjectMedia = options.preserveProjectMedia === true;
	  const storage = await enumerateStoryCardStorage();
	  let localStorageDeleted = 0;
	  let sessionStorageDeleted = 0;
	  let indexedDBDeleted = 0;
	  let persistedMessageDeleted: Record<string, number> = {};
	  if (persistMessageState && character) {
	    try {
	      const response = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/chat?production=1`, { method: 'DELETE' });
	      const data = await response.json().catch(() => ({}));
	      if (response.ok) {
	        messages = Array.isArray(data.messages) ? data.messages : messages;
	        persistedMessageDeleted = data.deleted && typeof data.deleted === 'object' ? data.deleted : {};
	      } else {
	        console.error('[STORYCARD_PERSISTED_RESET_ERROR]', data?.message ?? `HTTP ${response.status}`);
	      }
	    } catch (error) {
	      console.error('[STORYCARD_PERSISTED_RESET_ERROR]', error);
	    }
	  }
	  if (clearBrowserStorage) {
	    for (const key of storage.localStorage) { localStorage.removeItem(key); localStorageDeleted += 1; }
	    for (const key of storage.sessionStorage) { sessionStorage.removeItem(key); sessionStorageDeleted += 1; }
	    for (const database of storage.indexedDB.filter((item) => isStoryCardStorageKey(item.name))) {
	      await new Promise<void>((resolve) => {
	        const request = indexedDB.deleteDatabase(database.name);
	        request.onerror = () => resolve();
	        request.onblocked = () => resolve();
	        request.onsuccess = () => { indexedDBDeleted += 1; resolve(); };
	      });
	    }
	  }
	  const referenceImagesDeleted = (preserveProjectMedia ? 0 : currentReferenceImages.length)
	    + Object.values(referenceImagesByMessageId).reduce((total, images) => total + images.length, 0)
	    + (clearAttachments ? attachImages.length : 0);
	  const storyCardsDeleted = Number(Boolean(currentStoryCard));
	  const motionPromptsDeleted = Number(Boolean(currentMotionPrompt));
	  const videoDraftsDeleted = Object.keys(animationYamlByMessageId).length;
	  const videoPackagesDeleted = Number(Boolean(currentVideoPackage)) + Object.keys(videoPackageByMessageId).length;
	  const generatedVideosDeleted = Number(Boolean(currentGeneratedVideo)) + Object.keys(generatedVideoByMessageId).length;
	  const mediaStoreDeleted = preserveProjectMedia ? 0 : clearVideoProductionMediaStore();
	  currentStoryCard = null;
	  currentMotionPrompt = '';
	  currentCuts = [];
	  currentVideoPackage = null;
	  currentGeneratedVideo = '';
	  if (!preserveProjectMedia) currentReferenceImages = [];
	  animationYamlByMessageId = {};
	  videoPackageByMessageId = {};
	  generatedVideoByMessageId = {};
	  generatedVideoBackendByMessageId = {};
	  videoDurationDebugByMessageId = {};
	  generatingVideoByMessageId = {};
	  videoErrorByMessageId = {};
	  referenceImagesByMessageId = {};
	  storyCardSummaryByMessageId = {};
	  videoGenerationState = 'idle';
	  if (clearAttachments && selectedId) {
	    attachImagesByChar = { ...attachImagesByChar, [selectedId]: [] };
	    attachYamlByChar = { ...attachYamlByChar, [selectedId]: { name: '', text: '' } };
	  }
	  const deleted = {
	    storyCards: storyCardsDeleted,
	    motionPrompts: motionPromptsDeleted,
	    videoDrafts: videoDraftsDeleted,
	    videoPackages: videoPackagesDeleted,
	    generatedVideos: generatedVideosDeleted,
	    referenceImages: referenceImagesDeleted,
	    mediaStore: mediaStoreDeleted,
	    localStorage: localStorageDeleted,
	    sessionStorage: sessionStorageDeleted,
	    indexedDB: indexedDBDeleted,
	    persistedMessages: persistedMessageDeleted,
	  };
	  console.log('[STORYCARD_STATE_RESET]', { reason, deleted });
	  logCurrentStoryCardState();
	}
  type VideoReference = {
    imageUrl: string;
	 source: 'Message Image' | 'Latest Generated Image' | 'Animation Sheet' | 'Character REF' | 'None';
  };
  function latestProjectAssetMessage(): ChatMessage | undefined {
    return [...messages].reverse().find((message) => message.role === 'assistant');
  }

  function restoreGeneratedVideoProjects(): void {
    const restored: Record<string, string> = {};
    for (const record of getVideoProductionRecords<{ messageId?: string; url?: string }>('video')) {
      if (record.value?.messageId && record.value?.url) restored[record.value.messageId] = record.value.url;
    }
    generatedVideoByMessageId = { ...restored, ...generatedVideoByMessageId };
  }

  function isAnimationProjectMessage(message: ChatMessage): boolean {
	return message.role === 'assistant' && (
      Boolean(message.videoPackage)
	  || message.storyCard?.type === 'video_storycard'
	  || message.storyCard?.type === 'video'
      || Boolean(generatedVideoByMessageId[message.id])
	);
	}

  function animationProjectMessages(): ChatMessage[] {
	return messages.filter(isAnimationProjectMessage);
  }

  function animationProjectTitle(message: ChatMessage): string {
    const packageTitle = message.videoPackage?.title?.trim();
    if (packageTitle && packageTitle !== 'ANIMATION SHEET VIDEO') return packageTitle;
    const legacyTitle = message.storyCard?.title?.trim();
    const ownerName = message.videoPackage?.character_name?.trim();
    return legacyTitle || (ownerName ? `${ownerName} Animation Project` : 'Animation Project');
  }

  function animationProjectDuration(message: ChatMessage): number | null {
    const duration = Number(message.videoPackage?.duration ?? message.storyCard?.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  }

	function sceneTimelineCount(message: ChatMessage): number {
		return (message.videoPackage ? normalizeVideoPackage(message.videoPackage).scenes.length : undefined)
			?? message.storyCard?.cuts.length
			?? 0;
	}

  function animationSheetCount(message: ChatMessage): number {
	const savedCount = Number(message.videoPackage?.animation_sheet_count);
	if (Number.isFinite(savedCount) && savedCount >= 0) return savedCount;
    const packageReferences = message.videoPackage?.reference_images?.length ?? 0;
    const legacyReferences = message.storyCard?.references?.filter((reference) => reference.kind === 'image').length ?? 0;
    return Math.max(packageReferences, legacyReferences, message.referenceImages?.length ?? 0);
  }

  function animationProjectVideoAI(message: ChatMessage): string {
    return message.aiModels?.video || AI_ROLE_MODELS.video;
  }
  function hasExplicitVideoRequest(message: ChatMessage): boolean {
    const index = messages.findIndex((candidate) => candidate.id === message.id);
    const precedingMessage = index > 0 ? messages[index - 1] : undefined;
    return precedingMessage?.role === 'user' && classifyChatIntent(precedingMessage.text) === 'video_generation';
  }
  function messageAttachmentImages(message: ChatMessage): string[] {
    if (message.referenceImages?.length) return message.referenceImages;
    if (message.role === 'user') return message.imageUrl ? [message.imageUrl] : [];
    const index = messages.findIndex((candidate) => candidate.id === message.id);
    const precedingMessage = index > 0 ? messages[index - 1] : undefined;
    return precedingMessage?.role === 'user' ? messageAttachmentImages(precedingMessage) : [];
  }
  function messageAttachmentImage(message: ChatMessage): string {
    return messageAttachmentImages(message)[0] ?? '';
  }
  function sourceRequestText(message: ChatMessage): string {
    const index = messages.findIndex((candidate) => candidate.id === message.id);
    const precedingMessage = index > 0 ? messages[index - 1] : undefined;
    return precedingMessage?.role === 'user' ? precedingMessage.text : message.text;
  }
  function isStoryCardIntent(message: ChatMessage): boolean {
    if (message.role !== 'assistant') return false;
    const intent = classifyChatIntent(sourceRequestText(message));
    return intent === 'image_generation' || intent === 'manga_generation' || intent === 'video_generation';
  }

	function isExplicitStoryCardGenerationRequest(text: string): boolean {
	  const mentionsStoryCard = /story\s*card|storycard|ストーリーカード/iu.test(text);
	  const requestsCreation = /作って|作成(?:して|する|を)|生成(?:して|する|を)|設計(?:して|する|を)|まとめて|構成(?:して|する|を)|変換(?:して|する|を)|出力(?:して|する|を)|ください/iu.test(text);
	  const explanationOnly = /(?:とは|って何|について教えて|生成できますか|作れますか|可能ですか)/u.test(text)
	    && !/(?:作って|作成して|生成して|設計して|まとめて|変換して|出力して|ください)/u.test(text);
	  return mentionsStoryCard && requestsCreation && !explanationOnly;
	}
	function isExplicitVideoGenerationRequest(text: string): boolean {
	  const requestsVideo = /動画|アニメ(?:ーション)?|video|movie/iu.test(text);
	  const requestsCreation = /作って|作成して|生成して|動画化して|アニメ化して|にしてほしい|にして/iu.test(text);
	  const negatesCreation = /(?:動画|アニメ).{0,12}(?:作らない|生成しない|不要|いらない)/iu.test(text);
	  return requestsVideo && requestsCreation && !negatesCreation;
	}
	const ATTACHED_IMAGE_GENERATION_KEYWORDS = ['描いて', '生成して', 'イラスト', '画像', '立ち絵', '資料画像'] as const;
	function isAttachedImageGenerationRequest(text: string, imageCount: number): boolean {
	  return imageCount > 0 && ATTACHED_IMAGE_GENERATION_KEYWORDS.some((keyword) => text.includes(keyword));
	}
  function latestGeneratedImage(): string {
    const generatedMessage = [...messages].reverse().find((message) => (
      message.role === 'assistant'
      && Boolean(message.imageUrl || message.referenceImages?.length)
      && !parseStoryDoc(message.text)
    ));
    // New chat records store generated media in referenceImages, while older
    // records used imageUrl. Accept both so "この画像を動画にして" always
    // inherits the image that is actually visible in the preceding reply.
    return generatedMessage?.imageUrl ?? generatedMessage?.referenceImages?.[0] ?? '';
  }
  function storyCardReferenceImage(): string {
    return [...messages].reverse().find((message) =>
      message.role === 'assistant' && Boolean(message.imageUrl) && Boolean(parseStoryDoc(message.text)),
    )?.imageUrl ?? '';
  }
  function videoReferenceForMessage(message: ChatMessage): VideoReference {
    const messageImage = messageAttachmentImage(message);
    if (messageImage) return { imageUrl: messageImage, source: 'Message Image' };

    const generatedImage = latestGeneratedImage();
    if (generatedImage) return { imageUrl: generatedImage, source: 'Latest Generated Image' };

    const storyCardImage = storyCardReferenceImage();
	if (storyCardImage) return { imageUrl: storyCardImage, source: 'Animation Sheet' };

    if (imageDataUrl) return { imageUrl: imageDataUrl, source: 'Character REF' };
    return { imageUrl: '', source: 'None' };
  }
	  function storyCardReferenceImages(storyCard: StoryCardDesign | null | undefined): string[] {
	    if (!storyCard?.references?.length) return [];
	    return [...new Set(storyCard.references
	      .map((reference) => reference.url || reference.id)
	      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
	      .map((value) => value.trim()))];
	  }
	  /** Video references come only from the Animation Project itself. Visual Memory is never injected. */
	  function videoReferenceImagesForMessage(message: ChatMessage): string[] {
	    if (Object.prototype.hasOwnProperty.call(referenceImagesByMessageId, message.id)) {
	      return [...new Set(referenceImagesByMessageId[message.id] ?? [])];
	    }
	    const packageImages = (message.videoPackage?.reference_images ?? []).filter(Boolean);
	    if (packageImages.length > 0) return [...new Set(packageImages)];
	    const storyCardImages = storyCardReferenceImages(message.storyCard ?? null);
	    if (storyCardImages.length > 0) return [...new Set(storyCardImages)];
	    const messageImages = messageAttachmentImages(message);
	    if (messageImages.length > 0) return [...new Set(messageImages)];
	    const { imageUrl } = videoReferenceForMessage(message);
	    return imageUrl ? [imageUrl] : [];
	  }
	  function updateVideoReferenceImages(messageId: string, images: string[]): void {
	    currentReferenceImages = [...new Set(images.filter(Boolean))];
	    referenceImagesByMessageId = {
	      ...referenceImagesByMessageId,
	      [messageId]: currentReferenceImages,
	    };
	  }
  function videoReferenceSourceForMessage(message: ChatMessage): string {
    if ((message.videoPackage?.reference_images ?? []).filter(Boolean).length > 0) return 'Animation Project';
    return videoReferenceForMessage(message).source;
  }
  function videoReferenceImageFileNameForMessage(message: ChatMessage): string | null {
    const image = videoReferenceImagesForMessage(message)[0] ?? '';
    if (!image || image.startsWith('data:image/')) return null;
    return image.split('?')[0].split('/').at(-1) || null;
  }

  function characterPresetReferenceImages(characterName: string, characterId = ''): string[] {
    if (projectOnlyMode) return [];
    const presets = getCharacterPresets();
    const normalizedName = characterName.trim().toLowerCase();
    const normalizedId = characterId.trim().toLowerCase();
    const matched = presets
      .filter((preset) => {
        const name = preset.name.toLowerCase();
        return Boolean(normalizedName && name.includes(normalizedName))
          || Boolean(normalizedId && name.includes(normalizedId));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return matched?.mediaIds.slice(0, MAX_REFERENCE_IMAGES) ?? [];
  }

  function createVideoPackageForMessage(messageId: string, _text: string, referenceImages: string[]): VideoPackage | null {
    if (!character) return null;
    const message = messages.find((candidate) => candidate.id === messageId);
    const storyCard = message ? storyCardForMessage(message) : null;
    if (!message || !storyCard) {
	  errorMessage = 'Animation Projectの作成にはAnimation Sheetデータが必要です。';
      return null;
    }
    const references = referenceImages
      .map((image) => toVideoProductionImageReference(image))
      .filter(Boolean);
    const videoPackage = createVideoPackageFromStoryCard(storyCard, character.name, references, motionPromptForMessage(message));
    storeVideoProductionData('package', videoPackage);
    videoPackageByMessageId = {
      ...videoPackageByMessageId,
      [messageId]: videoPackageToYaml(videoPackage),
    };
    return videoPackage;
  }
  function createAnimationYaml(messageId: string, text: string): void {
    if (!character) return;
    animationYamlByMessageId = {
      ...animationYamlByMessageId,
      [messageId]: animationBlueprintToYaml(createAnimationBlueprint(text, character.name)),
    };
  }
  function createVideoPackageYaml(messageId: string, _text: string): void {
    if (!character) return;
    const message = messages.find((candidate) => candidate.id === messageId);
    const storyCard = message ? storyCardForMessage(message) : null;
    if (!message || !storyCard) {
	  errorMessage = 'Animation Projectの作成にはAnimation Sheetデータが必要です。';
      return;
    }
    const references = videoReferenceImagesForMessage(message).map((image) => toVideoProductionImageReference(image)).filter(Boolean);
    const videoPackage = createVideoPackageFromStoryCard(storyCard, character.name, references, motionPromptForMessage(message));
    videoPackageByMessageId = {
      ...videoPackageByMessageId,
      [messageId]: videoPackageToYaml(videoPackage),
    };
  }
  async function toFalAnimationImage(image: string): Promise<string> {
    if (image.startsWith('data:image/')) return image;
    const url = new URL(image, window.location.origin);
    if (url.origin !== window.location.origin) return image;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to read animation reference: HTTP ${response.status}`);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error ?? new Error('Unable to encode animation reference'));
      reader.readAsDataURL(blob);
    });
  }

  /** Resolves video cast from the request text and attachment names only. The conversation character is never a fallback. */
  function resolveAnimationCharacters(text: string, attachmentNames: string[]): string[] {
    const candidates = [...new Set(characters.map((item) => item.name).filter(Boolean))];
    const searchText = `${text}\n${attachmentNames.join('\n')}`.toLowerCase();
    const aliases: Record<string, string[]> = { 'シロ': ['shiro'], 'ミケ': ['mike'] };
    return candidates.filter((name) => [name.toLowerCase(), ...(aliases[name] ?? [])].some((alias) => searchText.includes(alias)));
  }

  function directAnimationPrompt(motionPrompt: string, animationCharacters: string[]): string {
    return [
      'Create a single continuous character animation.',
      `Characters: ${animationCharacters.join(', ') || 'Character'}.`,
      'Motion Prompt:',
      motionPrompt,
      'Preserve the identity, outfit, hair, and facial features from all reference images.',
    ].join('\n');
  }

  function animationStoryCardText(text: string, animationCharacters: string[], motionPrompt: string): string {
    const scalar = (value: string) => JSON.stringify(value);
    return [
      '```yaml',
      'story:',
      `  title: ${scalar(`${animationCharacters.join('と') || 'Character'} の短編アニメ`)}`,
      `  theme: ${scalar('5秒の会話アニメーション')}`,
      '  characters:',
      ...animationCharacters.map((name) => `    - ${scalar(name)}`),
      '  scenes:',
      `    - title: ${scalar('Short Animation')}`,
      `      visual: ${scalar('Use all supplied reference images as visual guidance.')}`,
      `      action: ${scalar(text)}`,
      `      emotion: ${scalar('natural')}`,
      '```',
    ].join('\n');
  }

  function selectedVideoModelIdFromProfile(): string {
    if (aiProfile.videoAI === 'MiniMax H3') return 'minimax-h3-reference';
    if (aiProfile.videoAI === 'Gemini Omni Flash Reference') return 'gemini-omni-flash-reference';
    if (aiProfile.videoAI === 'Gemini Omni Flash Image') return 'gemini-omni-flash-image';
    if (aiProfile.videoAI === 'Gemini Omni Flash Edit') return 'gemini-omni-flash-edit';
    if (aiProfile.videoAI === 'Seedance2 Mini') return 'seedance-2-mini-reference';
    if (aiProfile.videoAI === 'Sora 2') return 'sora-2-i2v';
    return 'seedance-2-reference';
  }

  function selectedAnimationVideoModel() {
    return VIDEO_MODELS.find((model) => model.id === selectedVideoModelIdFromProfile());
  }

  /** Direct Video Mode の発動条件。
   *  モデル選択だけでは発動させない: ユーザーが動画生成を明示要求したときのみ動画経路へ乗せる。
   *  （通常会話・Visual Memory登録・Character Reference保存・構造図生成・画像生成を
   *    動画経路へ誤ルーティングして Video Preflight が出るのを防ぐ。） */
  function hasDirectVideoTrigger(text: string, _attachmentCount: number): boolean {
    // Character Memory の会話から明示された動画生成は、キャラクターごとの旧設定
    // (Seedance2 など) に阻まれず MiniMax H3 へ直通させる。
    return isExplicitVideoGenerationRequest(text);
  }

  async function generateDirectVideoFromReferences(text: string, queuedImages: AttachImage[]): Promise<boolean> {
    const prompt = text;
    const projectVideoReferences = projectOnlyMode
      ? animationSheetVideoReferenceSources().map(resolveVideoProductionImageReference).filter(Boolean)
      : [];
	// 「この画像を動画にして」のような会話では、同じ送信に画像が添付されていなくても
	// 直前にチャットへ生成・表示した画像を参照画像として引き継ぐ。
	const latestConversationImage = queuedImages.length === 0 ? latestGeneratedImage() : '';
	const conversationReferences = queuedImages.length > 0
	  ? queuedImages.map((image) => image.dataUrl)
	  : [latestConversationImage].filter(Boolean);
	const animationSheetReferences = [...projectVideoReferences, ...conversationReferences];
	const uniqueImageSources = [...new Set(animationSheetReferences)].slice(0, 9);
	const videoModelId = uniqueImageSources.length > 0 ? 'minimax-h3-reference' : 'minimax-h3-text';
	const videoModel = VIDEO_MODELS.find((model) => model.id === videoModelId);
	if (!videoModel) throw new Error(`MiniMax H3 video model is not configured: ${videoModelId}`);
	const directModeLabel = uniqueImageSources.length > 0
	  ? 'MiniMax H3 Image-to-Video'
	  : 'MiniMax H3 Text-to-Video';
	if (!(await confirmVideoProductionMaterials(animationSheetReferences))) return false;
    if (!confirm(videoCostConfirmation(videoModel, 5))) return false;
    const imageSources = uniqueImageSources;
    const imageUrls = await Promise.all(imageSources.map(toFalAnimationImage));
    const referenceImageCount = imageUrls.length;
    if (!prompt.trim()) throw new Error(`${directModeLabel} requires a user prompt.`);

	// Keep an explicit video request visible while the long-running H3 job is in flight.
	// Previously the user turn was appended only after a successful response. If RunPod
	// queued or failed the job, the chat appeared to ignore the request and a later
	// proactive message looked like an ordinary conversational fallback.
	await appendMessage('user', prompt, queuedImages.map((image) => image.dataUrl));
	await appendMessage('assistant', `${directModeLabel}で動画を生成しています。完了までこのままお待ちください。`, [], {
	  aiModels: { video: 'MiniMax-H3' },
	});

    const requestPayload = {
      modelId: videoModel.id,
      videoMode: 'production',
	  ...(referenceImageCount > 0 ? { imageUrls } : {}),
      prompt,
      duration: 5,
    };

    console.log('[DIRECT_VIDEO_MODE]', {
      VIDEO_MODE: referenceImageCount > 0 ? 'MINIMAX_H3_IMAGE_TO_VIDEO' : 'MINIMAX_H3_TEXT_TO_VIDEO',
      selectedVideoModel: videoModel.id,
      referenceImageCount,
	  inheritedLatestConversationImage: Boolean(latestConversationImage),
      uploadedMediaIds: [],
      falModelId: videoModel.falModel,
      motionPromptLength: 0,
      promptLength: prompt.length,
      requestPayload,
    });
    console.log('[DIRECT_VIDEO_OUTGOING_PAYLOAD]', {
      modelId: videoModel.falModel,
      duration: requestPayload.duration,
      image_urls: imageUrls,
      prompt,
    });

    videoGenerationState = 'generating';
    try {
      const response = await fetch('/api/video', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const responseBody = await response.text();
      if (!response.ok) throw new Error(`HTTP: ${response.status}\n${responseBody}`);
      const result = JSON.parse(responseBody) as { url?: string; requestId?: string; queueResponse?: unknown; source?: string; model?: string; backend?: 'runpod-pod' | 'runpod-serverless' };
      if (!result.url) throw new Error(`${directModeLabel} response did not include a video URL.`);
      const isMockVideoPreview = result.url.startsWith('/mock/') || result.url.includes('/mock/');
      console.log('[DIRECT_VIDEO_MODE_RESPONSE]', {
        falModelId: result.model ?? videoModel.falModel,
        requestId: result.requestId ?? null,
        queueResponse: result.queueResponse ?? null,
        videoUrl: result.url,
        resultType: isMockVideoPreview ? 'MOCK_VIDEO_PREVIEW' : 'MINIMAX_H3_VIDEO',
      });
      await appendMessage('assistant', `${directModeLabel}で動画を生成しました。`, [], {
		aiModels: { video: result.model || 'MiniMax-H3' },
	  });
      const outputMessage = [...messages].reverse().find((message) => message.role === 'assistant');
      if (!outputMessage) throw new Error('Direct Video Mode output message was not created.');
      const messageId = outputMessage.id;
      generatedVideoByMessageId = { ...generatedVideoByMessageId, [messageId]: result.url };
      if (result.backend) generatedVideoBackendByMessageId = { ...generatedVideoBackendByMessageId, [messageId]: result.backend };
      currentGeneratedVideo = result.url;
      videoGenerationState = 'completed';
      storeVideoProductionData('video', { url: result.url, modelId: videoModel.id, messageId, createdAt: new Date().toISOString() });
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const failure = `Video API Error\nrequestPayload: ${JSON.stringify(requestPayload, null, 2)}\nselectedVideoModel: ${videoModel.id}\nreferenceImageCount: ${referenceImageCount}\n${detail}`;
      console.error('[DIRECT_VIDEO_MODE_ERROR]', { Video_API_Error: detail, requestPayload, selectedVideoModel: videoModel.id, referenceImageCount });
      errorMessage = failure;
      videoGenerationState = 'error';
	  await appendMessage('assistant', `${directModeLabel}の生成に失敗しました。通常会話へは切り替えていません。RunPod H3の接続状態を確認して、もう一度お試しください。`, [], {
		aiModels: { video: 'MiniMax-H3' },
	  });
      throw new Error(failure);
    }
  }

  async function generateDirectSeedanceAnimation(messageId: string, inputPackage: VideoPackage, preferredImages: string[] = []): Promise<void> {
    if (!character || generatingVideoByMessageId[messageId]) return;
    const videoModel = selectedAnimationVideoModel();
    if (!videoModel) throw new Error('Selected video model is not configured.');
	const message = messages.find((candidate) => candidate.id === messageId);
	const fallbackReference = message ? videoReferenceForMessage(message).imageUrl : '';
	const productionReferences = preferredImages.length > 0 ? preferredImages : [fallbackReference].filter(Boolean);
	const projectAnimationReferences = projectOnlyMode
		? animationSheetVideoReferenceSources().map(resolveVideoProductionImageReference).filter(Boolean)
		: [];
	const animationSheetReferences = [...new Set([
		...projectAnimationReferences,
		...productionReferences,
	])];
	if (!(await confirmVideoProductionMaterials(animationSheetReferences))) return;
    generatingVideoByMessageId = { ...generatingVideoByMessageId, [messageId]: true };
    videoErrorByMessageId = { ...videoErrorByMessageId, [messageId]: '' };
    videoGenerationState = 'generating';
    try {
	  const parsedDuration = Number(inputPackage.duration);
	  const requestedDuration = Number.isFinite(parsedDuration) ? parsedDuration : 5;
	  const isSeedanceMini = videoModel.id === 'seedance-2-mini-reference';
	  const isMiniMaxH3 = videoModel.provider === 'minimax' || videoModel.provider === 'runpod-h3';
	  const safeDuration = isMiniMaxH3
	    ? Math.min(15, Math.max(4, Math.round(requestedDuration)))
	    : isSeedanceMini
	    ? Math.min(15, Math.max(1, Math.round(requestedDuration)))
	    : requestedDuration;
	  const duration = videoModel.falModel.includes('gemini-omni-flash')
	    ? Math.min(10, Math.max(3, requestedDuration))
	    : (isSeedanceMini || isMiniMaxH3) ? safeDuration : Math.max(1, Math.min(15, requestedDuration));
      if (!confirm(videoCostConfirmation(videoModel, duration))) return;
      // Animation Project references only — the conversation character's Visual Memory is never mixed in.
      const sources = [...new Set([
		...projectAnimationReferences,
		...productionReferences,
      ].filter(Boolean))].slice(0, isMiniMaxH3 ? 9 : MAX_REFERENCE_IMAGES);
      const imageUrls = await Promise.all(sources.map(toFalAnimationImage));
      if (imageUrls.length === 0) throw new Error('この動画モデルには参照画像が必要です。');
      if (isSeedanceMini) {
        videoDurationDebugByMessageId = {
          ...videoDurationDebugByMessageId,
          [messageId]: { originalDuration: requestedDuration, safeDuration },
        };
        console.log('[SEEDANCE_MINI_PAYLOAD]', {
          duration: requestedDuration,
          safeDuration,
          imageCount: imageUrls.length,
          modelId: videoModel.id,
        });
      }
      const normalizedInput = normalizeVideoPackage(inputPackage);
      const generationPackage: VideoPackage = {
        ...normalizedInput,
        duration,
        reference_images: sources,
        motion_prompt: motionPromptFromTimeline(normalizedInput.scenes),
      };
      if (!generationPackage.motion_prompt.trim()) {
        throw new Error('Motion Promptが空のため動画生成を中止しました。Scene Timelineにシーンがありません。アニメシートを再解析してください。');
      }
	  console.log('[VIDEO_GENERATION_PACKAGE_ONLY]', {
	    messageId,
	    sourceStoryCardId: generationPackage.source_storycard_id,
	    duration: generationPackage.duration,
	    sceneCount: generationPackage.scenes.length,
	  });
      videoPackageByMessageId = {
        ...videoPackageByMessageId,
        [messageId]: videoPackageToYaml(generationPackage),
      };
      const submittedPrompt = videoPackagePrompt(generationPackage);
      console.log('[STORYCARD_SEEDANCE_REFERENCES]', {
        messageId,
        modelId: videoModel.id,
        count: imageUrls.length,
        sourceCount: sources.length,
      });
      const response = await fetch('/api/video', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelId: videoModel.id,
          videoMode: videoModel.videoMode ?? (videoModel.id === 'seedance-2-mini-reference' ? 'draft' : 'production'),
          ...(videoModel.mode === 'i2v' ? { imageUrl: imageUrls[0] } : { imageUrls }),
          prompt: submittedPrompt,
			  duration,
        }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`${videoModel.label} animation failed.\nHTTP: ${response.status}\n${body}`);
      const generated = JSON.parse(body) as { url?: string; backend?: 'runpod-pod' | 'runpod-serverless' };
      if (!generated.url) throw new Error(`${videoModel.label} did not return a video URL.`);
      generatedVideoByMessageId = { ...generatedVideoByMessageId, [messageId]: generated.url };
      if (generated.backend) generatedVideoBackendByMessageId = { ...generatedVideoBackendByMessageId, [messageId]: generated.backend };
	  currentGeneratedVideo = generated.url;
      videoGenerationState = 'completed';
    } catch (caughtError) {
      videoErrorByMessageId = { ...videoErrorByMessageId, [messageId]: caughtError instanceof Error ? caughtError.message : String(caughtError) };
      videoGenerationState = 'error';
    } finally {
      generatingVideoByMessageId = { ...generatingVideoByMessageId, [messageId]: false };
    }
  }

  async function retryDirectSeedanceAnimation(message: ChatMessage): Promise<void> {
    const videoPackage = videoPackageForMessage(message);
    if (!videoPackage) throw new Error('Retry requires a Video Package.');
    await generateDirectSeedanceAnimation(message.id, videoPackage, videoReferenceImagesForMessage(message));
  }

  function readFileAsDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
      reader.readAsDataURL(file);
    });
  }

  async function persistImage(source: string): Promise<string> {
    if (projectOnlyMode) return source;
    if (!character) return '';
    // 既にライブラリ保存済みのURL（generateImage内で保存済み等）は再保存しない。
    if (source.startsWith('/api/character-memory/')) return source;
    const response = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/image`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message ?? '画像の保存に失敗しました。');
    return String(data?.url ?? '');
  }

  function rememberVisual(imageId: string, title: string, summary: string, source: 'generated' | 'uploaded'): void {
    if (!character || !imageId) return;
    const entry = saveVisualMemory({ imageId, characterId: character.id, characterName: character.name, title: title.slice(0, 60), summary: summary.slice(0, 240), tags: [character.name, source], source });
    visualMemories = [entry, ...visualMemories].slice(0, 40);
  }

  async function classifyCharacterMemoryIntent(text: string, images: AttachImage[], yaml: { name: string; text: string } | null): Promise<IntentDecision & { action?: string }> {
    if (!character) return { intent: 'CHAT', confidence: 0, reason: 'No character selected.' };
	if (isAttachedImageGenerationRequest(text, images.length)) {
	  return {
	    intent: 'IMAGE',
	    confidence: 1,
	    reason: '添付画像付きの画像生成要求を検出したためIMAGEを優先しました。',
	    action: 'auto_execute',
	  };
	}
	if (isExplicitStoryCardGenerationRequest(text)) {
	  return {
	    intent: 'STORYCARD',
	    confidence: 1,
	    reason: 'Explicit StoryCard creation request detected locally.',
	    action: 'auto_execute',
	  };
	}
    const response = await fetch('/api/intent-router', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        surface: 'character-memory',
        userMessage: text || (images.length > 0 ? '添付メディアについて話す' : 'メッセージなし'),
        characterId: character.id,
        characterName: character.name,
        availableIntents: ['CHAT', 'IMAGE', 'VIDEO', 'VIDEO_EDIT', 'MANGA', 'STORYCARD', 'VOICE'],
        recentMessages: messages.slice(-8).map((message) => ({
          role: message.role,
          text: stripInlineImageData(message.text).slice(0, 600),
        })),
        state: {
          hasLatestStoryCard: Boolean(latestStoryDoc()),
          hasLatestVideo: Object.keys(generatedVideoByMessageId).length > 0,
          hasAttachments: images.length > 0,
          imageCount: images.length,
          hasYaml: Boolean(yaml?.text?.trim()),
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message ?? `Intent Router failed: HTTP ${response.status}`);
    return isAttachedImageGenerationRequest(text, images.length)
      ? { intent: 'IMAGE', confidence: 1, reason: '添付画像付きの画像生成要求を検出したためIMAGEを優先しました。', action: 'auto_execute' }
      : data as IntentDecision & { action?: string };
  }

  function confirmIntentLabel(intent: CommonIntent): string {
    if (intent === 'VIDEO') return '動画を生成する';
    if (intent === 'VIDEO_EDIT') return '動画を調整する';
    if (intent === 'IMAGE') return '画像を生成する';
    if (intent === 'MANGA') return '漫画を生成する';
    if (intent === 'STORYCARD') return 'StoryCardだけ作る';
    if (intent === 'VOICE') return '音声を生成する';
    return 'この意図で進める';
  }

  function confirmPendingIntent(): void {
    if (!pendingIntentConfirmation || !selectedId) return;
    confirmedIntentDecision = pendingIntentConfirmation.decision;
    inputText = pendingIntentConfirmation.text;
    attachImagesByChar = { ...attachImagesByChar, [selectedId]: pendingIntentConfirmation.images };
    attachYamlByChar = { ...attachYamlByChar, [selectedId]: pendingIntentConfirmation.yaml ?? { name: '', text: '' } };
    pendingIntentConfirmation = null;
    void sendMessage();
  }

	  function rejectPendingIntentAsChat(): void {
	    if (!pendingIntentConfirmation || !selectedId) return;
	    confirmedIntentDecision = { ...pendingIntentConfirmation.decision, intent: 'CHAT', confidence: 1, reason: 'User chose normal chat.' };
	    inputText = pendingIntentConfirmation.text;
	    attachImagesByChar = { ...attachImagesByChar, [selectedId]: pendingIntentConfirmation.images };
	    attachYamlByChar = { ...attachYamlByChar, [selectedId]: pendingIntentConfirmation.yaml ?? { name: '', text: '' } };
	    pendingIntentConfirmation = null;
	    void sendMessage();
	  }

	  function generateStoryCardFromChat(): void {
	    if (sending || !character) return;
	    confirmedIntentDecision = {
	      intent: 'STORYCARD',
	      confidence: 1,
	      reason: 'User explicitly requested StoryCard generation from Character Memory Chat.',
	    };
	    void sendMessage();
	  }
	
  // ===== 💭 Thinking Stream =====
  const THINKING_USER_NAME = 'RootSさん';
  /** 感情タイプをキャラクターの内面独白へ翻訳する。 */
  const THINKING_EMOTION_MONOLOGUE: Record<string, string> = {
    happy: 'なんだかうれしい気分…',
    thinking: '考えごとしながら…頭のなかを整理しよう…',
    excited: 'わくわくしてきた…',
    curious: '気になることがいっぱい…',
    sleepy: 'ちょっとねむいけど…がんばるね…',
    calm: 'おだやかな気持ち…',
    worried: 'ちょっと緊張してきた…',
    sad: '少ししょんぼりしてる…',
  };

  /** Critical Feature ID を独白で使える自然な呼び名へ翻訳する。 */
  function featureMonologueName(feature: string): string {
    const known: Record<string, string> = {
      HEAD_UNIT_01: '頭のメカ耳ユニット',
      TAIL_UNIT_02: 'メカ尻尾',
      CONNECTION_PORT: '腰の接続ポート',
      CYAN_GLOW_LINES: 'シアンの発光ライン',
    };
    // Visual Memoryの生Feature IDをLayer2（内心ログ）へ出さない: 未知IDは総称に置き換える。
    return known[feature] ?? 'だいじなパーツ';
  }

  function featureMonologueNames(features: string[]): string {
    return [...new Set(features.map(featureMonologueName))].join('と');
  }

  /** 💭 Thought Translator: そのFeatureが失敗時に何へ化けやすいか（「猫耳にしてしまった」等の独白用）。 */
  function featureMistakeName(feature: string): string {
    const known: Record<string, string> = {
      HEAD_UNIT_01: '猫耳',
      TAIL_UNIT_02: '生きものの尻尾',
    };
    return known[feature] ?? '';
  }

  function resetThinkingStream(enabled = true): void {
    stopMonologueTimer();
    monologueQueue = [];
    thinkingStream = [];
    thinkingStreamEnabled = enabled;
    thinkingStreamOpen = true;
    thinkingStreamDone = false;
  }

  /**
   * thinkingTimeline: 1ステップ = Layer2（lines・キャラクター内心ログ、ユーザー向け表示）と
   * Layer1（tech・技術検討ログ、折りたたみ表示）。
   * lines には Thought Translator で翻訳済みの一人称モノローグだけを入れる。処理ログは tech へ。
   */
  function pushThinkingStep(icon: string, label: string, lines: string[], tech: string[] = [], kind: ThinkingKind = 'debug'): void {
    if (!thinkingStreamEnabled) return;
    const cleanLines = lines.map((line) => line.trim()).filter(Boolean);
    const cleanTech = tech.map((line) => line.trim()).filter(Boolean);
    if (!label.trim() && cleanLines.length === 0 && cleanTech.length === 0) return;
    // Layer2へ表示した行はLLM独白の再利用禁止リストにも登録し、同じ文の言い直しを防ぐ。
    if (cleanLines.length > 0) recentMonologueTexts = [...recentMonologueTexts, ...cleanLines].slice(-40);
    thinkingStream = [...thinkingStream, { id: ++thinkingStreamSeq, icon, label: label.trim(), lines: cleanLines, tech: cleanTech, kind }].slice(-40);
  }

  /** 直近に表示した独白の本文（ターンをまたいで保持）。同じ文章の再利用禁止に使う。 */
  let recentMonologueTexts: string[] = [];

  /** ユーザー向けThinking UI（Layer2）に表示される感情独白。同一文の再表示はスキップする。
   *  再利用禁止リストへの登録は pushThinkingStep 側で行う。 */
  function pushMonologue(emoji: string, text: string): void {
    const normalized = text.trim();
    if (!normalized) return;
    if (recentMonologueTexts.includes(normalized)) return;
    pushThinkingStep(emoji, '', [normalized], [], 'monologue');
  }

  /** リアクション独白: バリエーションから未使用のものを選んで表示する（全て使用済みなら再利用を許可）。 */
  function pushReaction(emoji: string, variants: string[]): void {
    const unused = variants.filter((variant) => !recentMonologueTexts.includes(variant));
    if (unused.length > 0) {
      pushMonologue(emoji, unused[Math.floor(Math.random() * unused.length)]);
      return;
    }
    const pick = variants[Math.floor(Math.random() * variants.length)];
    recentMonologueTexts = recentMonologueTexts.filter((line) => line !== pick);
    pushMonologue(emoji, pick);
  }

  /** Layer2（内心ログ）として表示されるステップ数。 */
  function monologueCount(): number {
    return thinkingStream.filter((step) => step.lines.length > 0).length;
  }

  /** 回答完了で自動折りたたみ（クリックで再展開できる）。残っている独白キューは一括表示する。 */
  $effect(() => {
    if (!sending && !generatingPortrait && thinkingStream.length > 0 && !thinkingStreamDone) {
      flushMonologueQueue();
      thinkingStreamDone = true;
      thinkingStreamOpen = false;
    }
  });

  // ===== 💭 Inner Monologue（Thought Translator API）=====
  const EMOTION_EMOJI: Record<string, string> = {
    happy: '😊',
    thinking: '💭',
    excited: '✨',
    curious: '🤔',
    sleepy: '😌',
    calm: '😌',
    worried: '😳',
    sad: '😢',
  };

  function stopMonologueTimer(): void {
    if (monologueTimer) {
      clearInterval(monologueTimer);
      monologueTimer = undefined;
    }
  }

  function revealNextMonologue(): void {
    const next = monologueQueue.shift();
    if (!next) {
      stopMonologueTimer();
      return;
    }
    pushMonologue(next.emoji, next.text);
  }

  function flushMonologueQueue(): void {
    stopMonologueTimer();
    const remaining = monologueQueue;
    monologueQueue = [];
    for (const thought of remaining) pushMonologue(thought.emoji, thought.text);
  }

  /** 取得済みの独白をキューに積み、数秒ごとに1件ずつ表示する（生成完了後は即時表示）。 */
  function enqueueMonologues(thoughts: MonologueThought[]): void {
    if (thoughts.length === 0) return;
    if (thinkingStreamDone) {
      for (const thought of thoughts) pushMonologue(thought.emoji, thought.text);
      return;
    }
    monologueQueue.push(...thoughts);
    if (!monologueTimer) {
      revealNextMonologue();
      monologueTimer = setInterval(revealNextMonologue, MONOLOGUE_REVEAL_MS);
    }
  }

  function recentConversationForMonologue(): { role: string; text: string }[] {
    return messages.slice(-6)
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        text: stripInlineImageData(message.text).slice(0, 200),
      }))
      .filter((entry) => entry.text.trim().length > 0);
  }

  /** LLM失敗時の保険: 実データからテンプレで最低限の独白を組み立てる。 */
  function fallbackMonologues(context: { goalText: string; relationshipHits: RelationshipSearchHit[]; emotion: BrainEmotionState | null }): MonologueThought[] {
    const thoughts: MonologueThought[] = [];
    if (context.emotion) {
      thoughts.push({
        type: 'emotion',
        emoji: EMOTION_EMOJI[context.emotion.emotion] ?? '💭',
        text: THINKING_EMOTION_MONOLOGUE[context.emotion.emotion] ?? 'いろいろ考えてる…',
      });
    }
    if (lastImageValidationMissing.length > 0) {
      thoughts.push({ type: 'notice', emoji: '😳', text: `また${featureMonologueNames(lastImageValidationMissing)}を間違えたら恥ずかしいな…` });
    }
    const relation = context.relationshipHits[0]?.value?.replace(/[。.]+$/u, '');
    if (relation) thoughts.push({ type: 'relationship', emoji: '😊', text: `${THINKING_USER_NAME}は${relation}…だったよね…` });
    const goal = context.goalText.trim().slice(0, 30);
    if (goal) thoughts.push({ type: 'decision', emoji: '🤔', text: `${goal}…どんなふうにしようかな…` });
    if (thoughts.length === 0) thoughts.push({ type: 'emotion', emoji: '💭', text: 'なにから考えよう…' });
    return thoughts;
  }

  /**
   * 💭 Thought Translator: 実際に参照した記憶（検索ヒット・感情・直近会話・前回失敗）を
   * サーバーのLLMへ渡し、感情的な独り言に変換して受け取る。生成処理はブロックしない。
   */
  async function fetchInnerMonologue(context: {
    phase: 'chat' | 'image';
    goalText: string;
    memoryHits: CharacterMemorySearchHit[];
    relationshipHits: RelationshipSearchHit[];
    emotion: BrainEmotionState | null;
  }): Promise<void> {
    if (!character || !thinkingStreamEnabled) return;
    const requestCharacterId = character.id;
    const payload = {
      phase: context.phase,
      goalText: context.goalText.slice(0, 400),
      userName: THINKING_USER_NAME,
      recentConversation: recentConversationForMonologue(),
      memoryHits: context.memoryHits.slice(0, 4).map((hit) => ({ title: hit.title, summary: hit.summary })),
      relationshipHits: context.relationshipHits.slice(0, 4).map((hit) => ({ category: hit.category, key: hit.key, value: hit.value })),
      emotion: context.emotion ? { emotion: context.emotion.emotion, reason: context.emotion.reason } : null,
      recentFailure: {
        features: lastImageValidationMissing,
        friendlyNames: lastImageValidationMissing.map(featureMonologueName),
      },
      // 同じ文章の再利用禁止: 直近に表示した独白をLLMへ渡して言い換えを強制する。
      recentThoughts: recentMonologueTexts.slice(-20),
    };
    try {
      const response = await fetch(`/api/character-memory/${encodeURIComponent(requestCharacterId)}/inner-monologue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message ?? `Inner monologue failed: HTTP ${response.status}`);
      const thoughts: MonologueThought[] = Array.isArray(data?.thoughts)
        ? data.thoughts.filter((item: unknown): item is MonologueThought =>
            Boolean(item && typeof (item as MonologueThought).text === 'string' && typeof (item as MonologueThought).emoji === 'string'))
        : [];
      if (thoughts.length === 0) throw new Error('Inner monologue was empty');
      if (character?.id !== requestCharacterId) return;
      // 同じ文章を繰り返さない: 表示済みの独白と重複する行は捨てる（サーバー側ガードの二重化）。
      const freshThoughts = thoughts.filter((thought) => !recentMonologueTexts.includes(thought.text));
      console.log('[INNER_MONOLOGUE_JSON]', {
        count: thoughts.length,
        shown: freshThoughts.length,
        types: thoughts.map((thought) => thought.type ?? 'untyped'),
        model: data?.model,
      });
      // 全行が重複だった場合はテンプレのフォールバックへ落とさず、何も足さない（固定文の増殖防止）。
      if (freshThoughts.length === 0) return;
      enqueueMonologues(freshThoughts);
    } catch (error) {
      console.warn('[INNER_MONOLOGUE_ERROR]', error instanceof Error ? error.message : String(error));
      if (character?.id !== requestCharacterId) return;
      enqueueMonologues(fallbackMonologues(context));
    }
  }

  /** Intent Analysis の結果をキャラクター視点の自然文へ変換する。 */
  function pushIntentThought(decision: IntentDecision): void {
    const byIntent: Record<string, string> = {
      CHAT: 'いまはおしゃべりの時間みたい…ゆっくり考えて返事したいな…',
      IMAGE: '絵を描いてほしいんだね…どんなふうに描こうかな…',
      MANGA: '漫画にしてほしいんだ…コマ割りを考えなくちゃ…',
      VIDEO: '動画を作りたいんだね…動きのイメージをふくらませよう…',
      VIDEO_EDIT: 'さっきの動画を直したいんだね…どこを変えようかな…',
      STORYCARD: 'お話の設計図を作るんだね…場面を思い浮かべてみる…',
      IMAGE_ANALYSIS: 'この画像、じっくり見てみるね…',
    };
    const base = byIntent[decision.intent] ?? 'なにをしてほしいのかな…考えてみる…';
    pushThinkingStep('🧭', 'Intent分析',
      [decision.confidence < 0.5 ? `うーん、どうしたいのかちょっと迷う…たぶん、${base}` : base],
      [`Intent分析: ${decision.intent} confidence=${decision.confidence.toFixed(2)}`]);
  }

  /** 💭 Thought Translator: Memory検索の結果を「思い出している」独白へ翻訳する（ヒットの生表示はしない）。 */
  function pushMemorySearchThoughts(hits: CharacterMemorySearchHit[]): void {
    const tech = [
      `Memory検索: ${hits.length}件ヒット`,
      ...hits.slice(0, 3).map((hit) => `- ${hit.title} (relevance ${hit.relevance.toFixed(2)})`),
    ];
    if (hits.length === 0) {
      pushThinkingStep('📚', 'Memory検索', ['この話ははじめてかも…あたらしい思い出になりそう…'], tech);
      return;
    }
    // Layer2に記憶内容の生表示はしない（内容はLayer1と、LLM独白による言い換えに任せる）。
    const failureMemory = hits.some((hit) => /(失敗|消え|ミス|まちがえ|間違)/u.test(`${hit.title} ${hit.summary}`));
    pushThinkingStep('📚', 'Memory検索', [
      failureMemory ? '前回の失敗を思い出している…同じことはくり返さないようにしよう…' : 'まえのこと、思い出してる…どうしようかな…',
    ], tech);
  }

  /** 💭 Thought Translator: Relationship Memoryの検索結果を独白へ翻訳する（必須参照）。 */
  function pushRelationshipThoughts(hits: RelationshipSearchHit[]): void {
    const tech = [
      `Relationship Memory: ${hits.length}件ヒット`,
      ...hits.slice(0, 3).map((hit) => `- ${hit.category}/${hit.key}: ${hit.value}`),
    ];
    if (hits.length === 0) {
      pushThinkingStep('💞', 'Relationship Memory', [`${THINKING_USER_NAME}のこと、もっと知りたいな…`], tech);
      return;
    }
    const value = hits[0].value.replace(/[。.]+$/u, '');
    pushThinkingStep('💞', 'Relationship Memory',
      [value ? `${THINKING_USER_NAME}は${value}…だったよね…` : `${THINKING_USER_NAME}のこと、思い浮かべてる…`],
      tech);
  }

  /** 💭 Thought Translator: Emotion Memory（Search / Review）の状態を感情付きの独白へ翻訳する（必須参照・状態なしでも一言出す）。 */
  function pushEmotionThought(state: BrainEmotionState | null | undefined, stepLabel = 'Emotion Memory'): void {
    if (!state) {
      pushThinkingStep('🫀', stepLabel, ['いまの気持ち…まだうまくことばにならないな…'], [`${stepLabel}: no emotion state`]);
      return;
    }
    const monologue = THINKING_EMOTION_MONOLOGUE[state.emotion] ?? `いまは「${state.emotion}」な気分…`;
    const reason = state.reason?.replace(/[。.]+$/u, '');
    pushThinkingStep('🫀', stepLabel,
      [monologue, ...(reason ? [`${reason}…だからかな…`] : [])],
      [`${stepLabel}: ${state.emotion} intensity=${state.intensity} confidence=${state.confidence}`]);
  }

  /** 💭 Thought Translator: Recent Conversation（直近会話）を「思い返している」独白へ翻訳する（必須参照・生の発言は表示しない）。 */
  function pushRecentConversationThought(): void {
    const recent = recentConversationForMonologue();
    const tech = [
      `Recent Conversation: ${recent.length}件参照`,
      ...recent.slice(-3).map((entry) => `- ${entry.role}: ${entry.text.slice(0, 60)}`),
    ];
    pushThinkingStep('🗨️', 'Recent Conversation',
      [recent.length > 1
        ? `さっきまでの${THINKING_USER_NAME}との話、思い返してる…`
        : `${THINKING_USER_NAME}のことば、ちゃんと受けとめよう…`],
      tech);
  }

  /** 💭 Thought Translator: Failure History（前回の画像生成失敗）を独白へ翻訳する（必須参照）。
   *  チャット時は失敗が残っているときだけ内心に出し、画像生成時は成功の振り返りも出す。 */
  function pushFailureHistoryThought(phase: 'chat' | 'image'): void {
    const tech = [`Failure History: missing=[${lastImageValidationMissing.join(', ')}]`];
    if (lastImageValidationMissing.length === 0) {
      pushThinkingStep('🔍', 'Failure History',
        phase === 'image' ? ['このまえはうまく描けた…この調子でいこう…'] : [], tech);
      return;
    }
    if (phase === 'chat') {
      pushThinkingStep('🔍', 'Failure History',
        [`このまえ${featureMonologueNames(lastImageValidationMissing)}をうまく描けなかったこと、まだ気にしてる…`], tech);
      return;
    }
    // Layer2は実際の失敗の振り返りだけ。Visual Memoryの描画ルール由来の注意はLayer2に出さない。
    const mistakes = lastImageValidationMissing
      .map((feature) => ({ name: featureMonologueName(feature), mistake: featureMistakeName(feature) }))
      .filter((item) => item.mistake);
    pushThinkingStep('🔍', 'Failure History', [
      `このまえは${featureMonologueNames(lastImageValidationMissing)}が消えちゃったんだよね…`,
      ...mistakes.slice(0, 2).map((item) => `前に${item.name}を${item.mistake}にしてしまったから、今回はまちがえないように…`),
    ], tech);
  }

  /**
   * 💭 画像生成前の内部Reasoning（thinkingTimeline）。
   * 必須参照: Recent Conversation → Failure History → Memory / Relationship Memory / Emotion Memory。
   * Visual Memory は内部参照のみ（Layer1へ記録、Layer2には一切表示しない）。
   * Layer2に出してよいのは 感情・迷い・期待・失敗の振り返り・ユーザーへの印象 だけ。
   */
  async function runImageGenerationReasoning(queryText: string): Promise<void> {
    if (!character) return;
    // ボタン起点の生成など、前ターンの折りたたみ済みタイムラインが残っていたら新しく始める。
    if (!thinkingStreamEnabled || thinkingStreamDone) resetThinkingStream(true);
    pushRecentConversationThought();
    pushFailureHistoryThought('image');
    const query = queryText.trim().slice(0, 300);
    const [memories, relationshipHits, emotion] = await Promise.all([
      searchCharacterMemories(query),
      searchCharacterRelationships(query),
      searchCharacterEmotion(),
    ]);
    pushMemorySearchThoughts(memories);
    pushRelationshipThoughts(relationshipHits);
    pushEmotionThought(emotion.current);
    // Visual Memoryは内部参照のみ: Layer2（内心ログ）には出さず、Feature一覧はLayer1に記録するだけ。
    const features = characterVisualMemory.criticalFeatures;
    pushThinkingStep('🧩', 'Visual Memory（内部参照）', [],
      [`Visual Memory（内部参照）: criticalFeatures=[${features.join(', ')}]`]);
    // 💭 実際に参照した記憶からLLMで独白を生成（画像生成をブロックしない）。
    void fetchInnerMonologue({
      phase: 'image',
      goalText: queryText,
      memoryHits: memories,
      relationshipHits: relationshipHits,
      emotion: emotion.current,
    });
    const mustKeep = characterVisualMemory.rules.mustKeep;
    const mechanicalGuard = mustKeep.includes('HEAD_UNIT_01') || mustKeep.includes('TAIL_UNIT_02');
    const humanInScene = /(人間|ひとりの人|男の子|女の子|友達|ふたり|二人|みんな|一緒)/u.test(queryText);
    // Layer2の方針は「失敗の振り返り」か「期待」だけ。Visual Memory由来の描画ルールはLayer1にのみ残す。
    const policy: string[] = lastImageValidationMissing.length > 0
      ? [`${featureMonologueNames(lastImageValidationMissing)}、今度こそちゃんと描く…`]
      : ['お願いされたイメージ、大切に描こう…'];
    pushThinkingStep('🧭', '生成方針決定', policy,
      [`生成方針決定: mechanicalGuard=${mechanicalGuard} humanInScene=${humanInScene} priorityFeatures=[${lastImageValidationMissing.join(', ')}]`]);
  }

  function isVoiceSituationQuizStartRequest(value: string): boolean {
    const text = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
    return /(?:声当て|声の演技|シチュエーション).{0,20}(?:クイズ|問題)|(?:次の|新しい).{0,10}声当て(?:クイズ|問題)?|次の問題を(?:出して|やって|始めて)/u.test(text);
  }

  function requestedVoiceQuizSpeechText(value: string): string | undefined {
    const text = value.normalize('NFKC');
    return ['大丈夫', 'わかった', 'そうなんだ'].find((phrase) => text.includes(phrase));
  }

  function isVoiceSituationQuizAnswerCandidate(value: string): boolean {
    const text = value.normalize('NFKC').trim();
    return /(?:[123]|[一二三])\s*(?:番|だ(?:ね|よ)?|です|かな|かも|と思う)/u.test(text) || /^[123]$/u.test(text);
  }

	  async function sendMessage(): Promise<void> {
    const text = inputText.trim();
    const shiroAdaptiveReasoning = character?.id === 'shiro';
    const deliberateTurn = shiroAdaptiveReasoning && isDeliberationRequest(text);
    if (/data\//iu.test(text)) {
      inputText = '';
      errorMessage = '画像データはチャットへ送信できません。imageIdを使用してください。';
      return;
    }
    // 🪟 Vision Bridge: 送信時点の添付キュー（現在キャラ分）をスナップショット。
    const queuedImages = attachImages;
    const queuedYaml = attachYaml;
    const hasYaml = Boolean(queuedYaml && queuedYaml.text.trim());
    const hasAttach = queuedImages.length > 0 || hasYaml;
    const dailyVoiceResetRequested = isDailyDeliveryResetInstruction(text);
    const chatVoiceInstruction = (!voiceConfig || voiceConfig.engine !== 'piper')
      ? detectChatVoiceInstruction(text)
      : null;
    const exactSpokenLine = chatVoiceInstruction ? extractExactSpokenLine(chatVoiceInstruction) : null;
    if ((!text && !hasAttach) || sending || !character) return;
    if (dailyVoiceResetRequested) clearDailyVoiceDirection();
    const requestedVoiceDirection = chatVoiceInstruction
      ? resolveChatVoiceDirection(chatVoiceInstruction)
      : undefined;
    if (requestedVoiceDirection?.scope === 'day') {
      dailyVoiceDirection = requestedVoiceDirection;
      saveDailyVoiceDirection(character.id, requestedVoiceDirection);
      voiceWorkflowMessage = `今日の話し方を設定しました: ${requestedVoiceDirection.summary}`;
    }
    const turnVoiceDirection = requestedVoiceDirection
      ?? (!dailyVoiceResetRequested && !chatVoiceInstruction ? dailyVoiceDirection ?? undefined : undefined);
    if (text && isVoiceAdoptionRequest(text)) {
      const draft = [...messages].reverse().find((message) => (
        message.role === 'assistant'
        && message.voiceDirection
        && Boolean(voiceUrlByMessageId[message.id])
      ));
      inputText = '';
      sending = true;
      errorMessage = '';
      try {
        await appendMessage('user', text);
        if (!draft) {
          await appendMessage('assistant', 'まだ保存できる声候補がありません。声を指定した返信の「再生」で候補を作ってから、もう一度教えてください。');
        } else if (await adoptMessageVoice(draft)) {
          await appendMessage('assistant', `この声を${character.name}の基本声にしました。これからはこの声で話します。`);
        }
      } finally {
        sending = false;
      }
      return;
    }
    characterRuntime.recordUserActivity();
    logAITuberEvent('user_message', character.id, {
      metadata: { hasText: Boolean(text), attachmentCount: queuedImages.length, hasYaml },
    });
    // 🧠 Observation Mode: 通常返信を生成せず、観察データのみ生成する専用経路。
    // Conversation AI / Intent Router / 生成系フローには一切入らない。添付キューも消費しない。
    if (interactionMode === 'observation') {
      if (!text) return;
      inputText = '';
      await runThoughtObservation(text);
      return;
    }
    inputText = '';
    sending = true;
    errorMessage = '';
    resetThinkingStream(shiroAdaptiveReasoning ? deliberateTurn : true);
    if (deliberateTurn) {
      pushThinkingStep(
        '🧠',
        '熟考モード',
        ['少し時間をかけて、前提や選択肢を整理してみるね…'],
        ['Conversation reasoning: high'],
      );
    }
	if (text && !hasAttach && isVoiceSituationQuizStartRequest(text)) {
	  try {
		await appendMessage('user', text);
		const response = await fetch('/api/voice/situation-quiz', {
		  method: 'POST',
		  headers: { 'content-type': 'application/json' },
		  body: JSON.stringify({
			action: 'create',
			characterId: character.id,
			speechText: requestedVoiceQuizSpeechText(text),
		  }),
		});
		const data = await response.json().catch(() => ({})) as {
		  message?: string;
		  choices?: Array<{ number: number; label: string }>;
		  commitment?: string;
		  speechText?: string;
		  voiceDirection?: unknown;
		};
		if (!response.ok) throw new Error(data.message ?? '声当てクイズを作成できませんでした。');
		const choices = Array.isArray(data.choices) ? data.choices : [];
		const voiceDirection = normalizeChatVoiceDirection(data.voiceDirection);
		if (choices.length !== 3 || !voiceDirection) throw new Error('声当てクイズの作成結果が不完全です。');
		const receipt = String(data.commitment ?? '').slice(0, 12);
		const speechText = String(data.speechText ?? '').trim();
		if (!speechText) throw new Error('声当てクイズのセリフがありません。');
		await appendMessage('assistant', [
		  '声当てクイズだよ。正解はサーバーに先に固定しました。',
		  '',
		  ...choices.map((choice) => `${choice.number}. ${choice.label}`),
		  '',
		  `🔒 事前固定コード: ${receipt}`,
		  `次の「${speechText}」の演技を聞いて、1番・2番・3番で答えてね。`,
		].join('\n'));
		await appendMessage('assistant', speechText, [], { voiceDirection });
		autoSpeakLatestReply();
	  } catch (error) {
		errorMessage = error instanceof Error ? error.message : String(error);
	  } finally {
		sending = false;
	  }
	  return;
	}
	if (text && !hasAttach && isVoiceSituationQuizAnswerCandidate(text)) {
	  try {
		const response = await fetch('/api/voice/situation-quiz', {
		  method: 'POST',
		  headers: { 'content-type': 'application/json' },
		  body: JSON.stringify({ action: 'answer', characterId: character.id, answer: text }),
		});
		const data = await response.json().catch(() => ({})) as {
		  success?: boolean;
		  message?: string;
		  correct?: boolean;
		  selectedNumber?: number;
		  correctNumber?: number;
		  correctLabel?: string;
		  explanation?: string;
		  commitment?: string;
		  verified?: boolean;
		};
		if (response.status === 404) {
		  // A numerical message outside a quiz remains an ordinary chat message.
		} else {
		  if (!response.ok || !data.success) throw new Error(data.message ?? '声当てクイズを採点できませんでした。');
		  await appendMessage('user', text);
		  const receipt = String(data.commitment ?? '').slice(0, 12);
		  await appendMessage('assistant', [
			data.correct ? '正解！ 声だけで当てたね。' : `惜しい！ 選んだのは${data.selectedNumber}番でした。`,
			`正解は${data.correctNumber}番「${data.correctLabel}」です。`,
			String(data.explanation ?? ''),
			data.verified ? `🔒 事前固定コード一致: ${receipt}` : '⚠️ 事前固定コードの検証に失敗しました。',
		  ].filter(Boolean).join('\n'));
		  void runMemoryReview();
		  void runRelationshipReview();
		  void runEmotionReview();
		  sending = false;
		  return;
		}
	  } catch (error) {
		errorMessage = error instanceof Error ? error.message : String(error);
		sending = false;
		return;
	  }
	}
	// Base-voice auditions must run before every creative-generation route.
	// Previously this block lived after Intent Router handling, so a voice-design
	// prompt misclassified as VIDEO could start Seedance before VoiceLab saw it.
	if (requestedVoiceDirection && !requestedVoiceDirection.preserveBaseVoice) {
	  try {
		await appendMessage('user', text);
		const auditionLine = buildVoiceAuditionLine(character.name, exactSpokenLine, requestedVoiceDirection.instruction);
		await appendMessage('assistant', auditionLine, [], { voiceDirection: requestedVoiceDirection });
		voiceWorkflowMessage = 'ローカルで声候補を生成しています。CPU生成では5〜10分ほどかかることがあります。';
		const auditionMessage = messages[messages.length - 1];
		if (auditionMessage?.role === 'assistant' && auditionMessage.voiceDirection) {
		  enqueueSpeech(auditionMessage, 'user_reply');
		}
		clearAttachQueue();
	  } catch (error) {
		errorMessage = error instanceof Error ? error.message : String(error);
	  } finally {
		sending = false;
	  }
	  return;
	}
    const directVideoTrigger = hasDirectVideoTrigger(text, queuedImages.length);
    if (directVideoTrigger) {
      try {
        const generated = await generateDirectVideoFromReferences(text, queuedImages);
        if (generated) clearAttachQueue();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (!detail.startsWith('FAL API Error')) errorMessage = detail;
      } finally {
        sending = false;
      }
      return;
    }
    // 自画像モード: 通常のIMAGE intent経路とは分離した専用経路。Intent Routerを介さずローカル判定で即実行する。
    if (text && queuedImages.length === 0 && isSelfPortraitRequest(text)) {
      try {
        await generateSelfPortrait(text);
        clearAttachQueue();
      } finally {
        sending = false;
      }
      return;
    }
    if (routineBrain.currentState !== 'Active') {
      routineMessage = '';
      void updateRoutineState('Active', 'User started an active conversation.');
    }
	let animationSheetExtraction: AnimationSheetExtraction | null = null;
	const animationSheetVideoReferenceCount = animationSheetVideoReferenceSources().length;
	if (queuedImages.length + animationSheetVideoReferenceCount >= 1) {
	  try {
	    animationSheetExtraction = await requestAnimationSheetExtraction(text, queuedImages);
	    console.log('[ANIMATION_SHEET_DETECTION]', {
	      animationSheetDetected: animationSheetExtraction.animationSheetDetected,
	      attachmentCount: queuedImages.length,
	      sceneCount: animationSheetExtraction.scenes.length,
	    });
	  } catch (error) {
	    console.warn('[ANIMATION_SHEET_DETECTION_ERROR]', error instanceof Error ? error.message : String(error));
	  }
	}
    let intentDecision: IntentDecision;
    try {
      // Per-utterance voice directions are conversation delivery controls, never
	  // image/video production requests. Do not ask the router to reinterpret them.
	  intentDecision = requestedVoiceDirection
		? {
			intent: 'CHAT',
			confidence: 1,
			reason: 'Voice delivery instruction priority rule.',
			slots: { routingGuard: 'voice_direction_priority' },
		  }
		: confirmedIntentDecision ?? await classifyCharacterMemoryIntent(text, queuedImages, queuedYaml);
    } catch (error) {
	  intentDecision = isExplicitVideoGenerationRequest(text)
	    ? {
	        intent: 'VIDEO',
	        confidence: 1,
	        reason: 'Local VIDEO priority fallback for an explicit video generation request.',
	      }
	    : isAttachedImageGenerationRequest(text, queuedImages.length)
	    ? {
	        intent: 'IMAGE',
	        confidence: 1,
	        reason: 'Local IMAGE priority fallback for an attached-image generation request.',
	      }
	    : isExplicitStoryCardGenerationRequest(text)
	    ? {
	        intent: 'STORYCARD',
	        confidence: 1,
	        reason: `Local StoryCard fallback after router error: ${error instanceof Error ? error.message : String(error)}`,
	      }
	    : {
	        intent: 'CHAT',
	        confidence: 0,
	        reason: error instanceof Error ? error.message : String(error),
	      };
	} finally {
      confirmedIntentDecision = null;
    }
	const explicitAnimationSheetRequest = isAnimationSheetMode(text, queuedImages.length + animationSheetVideoReferenceCount);
	const animationSheetMode = explicitAnimationSheetRequest || animationSheetExtraction?.animationSheetDetected === true;
	console.log('[ANIMATION_SHEET_MODE_DETECTION]', {
	  ANIMATION_SHEET_MODE: animationSheetMode,
	  explicitRequest: explicitAnimationSheetRequest,
	  imageDetection: animationSheetExtraction?.animationSheetDetected ?? false,
	  attachmentCount: queuedImages.length,
	  videoReferenceCount: animationSheetVideoReferenceCount,
	  requestText: text,
	});
	if (animationSheetMode) {
	  intentDecision = {
	    ...intentDecision,
	    intent: 'VIDEO',
	    confidence: 1,
	    reason: 'ANIMATION_SHEET_MODE: two or more attachments and an explicit animation request were detected.',
	    slots: { ...intentDecision.slots, routingGuard: 'animation_sheet_mode' },
	  };
	}
	if (intentDecision.intent === 'IMAGE_ANALYSIS' && isExplicitVideoGenerationRequest(text)) {
	  intentDecision = {
	    ...intentDecision,
	    intent: 'VIDEO',
	    confidence: Math.max(intentDecision.confidence, 0.95),
	    reason: '動画生成要求が明示されているため、IMAGE_ANALYSISよりVIDEOを優先しました。',
	    slots: { ...intentDecision.slots, routingGuard: 'explicit_video_generation_priority' },
	  };
	}
	if (
	  (intentDecision.intent === 'VIDEO' || intentDecision.intent === 'VIDEO_EDIT')
	  && !hasExplicitVideoActionRequest(text)
	  && !animationSheetMode
	) {
	  console.warn('[INTENT_ROUTER_VIDEO_SAFETY_OVERRIDE]', {
		from: intentDecision.intent,
		to: 'CHAT',
		reason: 'No explicit video/animation creation or editing request was found.',
	  });
	  intentDecision = {
		...intentDecision,
		intent: 'CHAT',
		confidence: 1,
		reason: '動画・映像・アニメーションの明示的な制作／編集依頼がないため、動画生成を停止しました。',
		slots: { ...intentDecision.slots, routingGuard: 'explicit_video_action_required' },
	  };
	}
	if (intentDecision.intent !== 'CHAT' && !thinkingStreamEnabled) {
	  resetThinkingStream(true);
	}
    console.debug('[LLM_INTENT]', intentDecision.intent, intentDecision.confidence, intentDecision.reason);
    pushIntentThought(intentDecision);
	const finalIntentAction = intentDecision.confidence >= 0.5 && intentDecision.confidence < 0.85 && intentDecision.intent !== 'CHAT'
	  ? 'confirm_required'
	  : intentDecision.intent === 'VIDEO' ? 'generate_video'
	  : intentDecision.intent === 'VIDEO_EDIT' ? 'edit_video'
	  : intentDecision.intent === 'STORYCARD' ? 'generate_storycard'
	  : intentDecision.intent === 'IMAGE_ANALYSIS' ? 'analyze_image'
	  : intentDecision.intent === 'IMAGE' ? 'generate_image'
	  : intentDecision.intent === 'MANGA' ? 'generate_manga'
	  : 'chat';
	console.log('[INTENT_ROUTER_RESULT]', {
	  detectedIntent: intentDecision.intent,
	  confidence: intentDecision.confidence,
	  action: finalIntentAction,
	  reason: intentDecision.reason,
	});
    if (intentDecision.confidence >= 0.5 && intentDecision.confidence < 0.85 && intentDecision.intent !== 'CHAT') {
      pendingIntentConfirmation = { decision: intentDecision, text, images: queuedImages, yaml: queuedYaml };
      sending = false;
      return;
    }
	    let routedIntent: CommonIntent = intentDecision.confidence < 0.5 ? 'CHAT' : intentDecision.intent;
	    if (routedIntent === 'IMAGE_ANALYSIS' && isExplicitStoryCardGenerationRequest(text)) {
	      console.warn('[INTENT_ROUTER_STORYCARD_OVERRIDE]', {
	        from: routedIntent,
	        to: 'STORYCARD',
	        reason: 'The user explicitly requested structured StoryCard generation.',
	      });
	      routedIntent = 'STORYCARD';
	    }
	    if (routedIntent === 'IMAGE_ANALYSIS') {
	      console.warn('[INTENT_ROUTER_IMAGE_ANALYSIS_PATH]', {
	        routedIntent,
	        hasImages: queuedImages.length > 0,
	        note: 'Image analysis may still produce a StoryCard; Motion Prompt generation must run after StoryCard parsing.',
	      });
	    }
	    const planningRequested = routedIntent === 'STORYCARD';
	    if (routedIntent === 'VIDEO' || routedIntent === 'STORYCARD') {
	      console.log('[VIDEO_CREATION_CHARACTER_CONTEXT]', {
	        characterId: character?.id ?? null,
	        characterName: character?.name ?? null,
	        storyCardCharacter: currentStoryCard?.characters?.map((item) => item.name) ?? [],
	        selectedCharacter: { id: selectedId || null, name: character?.name ?? null },
	        attachedReferenceCount: queuedImages.length,
	      });
	    }
	    if (animationSheetMode) {
	      try {
	        await resetStoryCardState({ reason: 'animation-sheet-mode', clearBrowserStorage: false, clearAttachments: false });
	        const production = await createAnimationSheetVideoFromIntent(text, queuedImages, animationSheetExtraction);
	        clearAttachQueue();
	        await generateDirectSeedanceAnimation(
	          production.message.id,
	          production.videoPackage,
	          production.videoPackage.reference_images,
	        );
	      } catch (error) {
	        const detail = error instanceof Error ? error.message : String(error);
	        const timelineWarning = 'シーン抽出が不足しています。アニメシート解析をやり直してください。';
	        errorMessage = detail === timelineWarning ? timelineWarning : `ANIMATION_SHEET_MODE: ${detail}`;
	        console.error('[ANIMATION_SHEET_MODE_ERROR]', { error, message: detail });
	        await appendMessage('assistant', detail === timelineWarning ? timelineWarning : `ANIMATION_SHEET_MODE: ${detail}`).catch(() => undefined);
	      } finally {
	        sending = false;
	      }
	      return;
	    }
	    if (routedIntent === 'STORYCARD') {
	      try {
	        await resetStoryCardState({ reason: 'new-video-generation', clearBrowserStorage: false, clearAttachments: false });
	        await createStoryCardFromIntent(text, queuedImages, queuedYaml);
	        clearAttachQueue();
	      } catch (error) {
	        const uiMessage = storyCardFailureMessage(error);
	        errorMessage = uiMessage;
	        await appendMessage('assistant', uiMessage).catch((appendError) => {
	          console.warn('[STORYCARD_UI_MESSAGE_ERROR]', appendError instanceof Error ? appendError.message : String(appendError));
	        });
	        console.warn('[STORYCARD_UI_ERROR]', error instanceof Error ? error.message : String(error));
	      } finally {
	        sending = false;
	      }
	      return;
	    }
	    if (text && (routedIntent === 'VIDEO' || routedIntent === 'VIDEO_EDIT')) {
      try {
        const activeCharacter = character;
        if (!activeCharacter) return;
        if (routedIntent === 'VIDEO_EDIT') {
          await appendMessage('user', text);
          const targetMessage = [...messages].reverse().find((message) =>
            message.role === 'assistant'
			&& Boolean(storyCardForMessage(message)),
          );
          if (!targetMessage) {
			await appendMessage('assistant', '調整できるAnimation Projectがまだありません。先にアニメシートまたは参照画像から動画を作成してください。');
            return;
          }
		  const videoPackage = videoPackageForMessage(targetMessage);
		  if (!videoPackage) {
			await appendMessage('assistant', '再生成できるAnimation Projectが見つかりません。先にアニメシートから動画を作成してください。');
			return;
		  }
		  await appendMessage('assistant', '現在のScene Timelineから動画を再生成します。シーン内容の変更はタイムラインのシーン編集から行ってください。');
          generatedVideoByMessageId = { ...generatedVideoByMessageId, [targetMessage.id]: '' };
		  await generateDirectSeedanceAnimation(targetMessage.id, videoPackage, videoReferenceImagesForMessage(targetMessage));
          return;
        }
		await resetStoryCardState({ reason: 'new-video-generation', clearBrowserStorage: false, clearAttachments: false });
		const production = await createStoryCardFromIntent(text, queuedImages, queuedYaml);
		if (!production) {
		  clearAttachQueue();
		  return;
		}
		clearAttachQueue();
		await generateDirectSeedanceAnimation(
		  production.message.id,
		  production.message.videoPackage ?? createVideoPackageFromStoryCard(production.storyCard, activeCharacter.name, videoReferenceImagesForMessage(production.message), production.motionPrompt),
		  videoReferenceImagesForMessage(production.message),
		);
        return;
      } catch (error) {
		const uiMessage = storyCardFailureMessage(error);
		errorMessage = uiMessage;
		await appendMessage('assistant', uiMessage).catch((appendError) => {
		  console.warn('[STORYCARD_UI_MESSAGE_ERROR]', appendError instanceof Error ? appendError.message : String(appendError));
		});
		console.warn('[STORYCARD_UI_ERROR]', error instanceof Error ? error.message : String(error));
      } finally {
        sending = false;
      }
      return;
    }
    // Growth System V2: 送信時にユーザーの文章だけで判定（AI返答は見ない）。
    applyGrowthFromUserText(text);
    // Thinking Influence V11: 同じ判定で感情状態（温度感）を更新。返答の語尾へ少しだけ反映。
    applyEmotionFromUserText(text);
    // Character Brain V1: 同じ判定で擬似思考の4段階を生成し、上から順にフェード表示。
    const brainResult = applyBrainFromUserText(text);
    // Thinking Log V10: 明示ルールに一致しない通常会話でも、Brainの解釈を使って1件追記する。
    applyThinkingFromUserText(text, brainResult?.layers ?? null);

    // ⚡ 通常会話は低推論の CHAT_FAST。明示的な熟考依頼だけ高推論と Thinking Stream を使う。
	    mode = 'CHAT_FAST';
	    const storyMode = false;
    const planningMode = false;
    // ④ CHAT_FAST では Story Draft / Story Dynamics / Comic Pipeline / Timeline / ネタ出し / YAML自動生成 を起動しない。
    // ⑤ Emotion / Growth / Memory参照は維持し、表示用 Thinking は熟考ターンだけ起動する。
    // ⑦ デバッグログ。
    console.debug('[MODE]', mode);
    console.debug('[CONVERSATION_REASONING]', shiroAdaptiveReasoning ? (deliberateTurn ? 'high' : 'low') : 'default');
    console.debug('[PROVIDER]', routedProvider.selection, '→', routedProvider.labChatProvider ?? 'openai');
    console.debug('[THINKING]', evaluateThinking(text)?.thought ?? '(none)');
    console.debug('[EMOTION]', currentEmotion?.label ?? '(none)');

    // 🎨 Comic Prompt 自動画像生成: STORY CARD 表示中に画像生成要求が来たら、
    // 追加質問なしで現在のカードから Comic Prompt を生成し generateImage() を直接実行する。
    if (routedIntent === 'IMAGE') {
      console.debug('[SINGLE_IMAGE] generate GPT-Image2 illustration without STORY CARD');
      try {
        await appendMessage('user', text);
        if (queuedImages.length >= 4) {
          const builder = await buildVisualMemoryFromReferences(queuedImages);
          await appendMessage('assistant', `Visual Memory Builderで参照画像${builder.imageCount}枚を解析し、Visual Memoryへ保存しました。`);
        }
        generatingPortrait = true;
        try {
          const lastScene = currentLastGeneratedScene();
          if (detectLastSceneReuseRequest(text) && !lastScene) {
            throw new Error('直前の画像生成シーンがありません。先に生成したいシーンを指定してください。');
          }
          const scene = detectLastSceneReuseRequest(text) && lastScene
            ? buildPromptFromLastScene(lastScene, text)
            : {
              scene: text.trim(),
              prompt: buildSingleIllustrationPrompt(text),
              size: '1024x1024',
              renderMode: 'illustration' as const,
            };
          const generatedUrl = await generateImage(scene.prompt, scene.size, scene.renderMode, queuedImages.map((image) => image.dataUrl));
          const savedUrl = await persistImage(generatedUrl);
          rememberVisual(savedUrl, '生成画像', scene.prompt, 'generated');
          rememberGeneratedScene(scene);
          await appendMessage('assistant', '1枚絵を生成しました。', savedUrl, lastGeneratedImageModel
			? { aiModels: { image: lastGeneratedImageModel } }
			: {});
		  autoSpeakLatestReply();
        } finally {
          generatingPortrait = false;
        }
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      } finally {
        sending = false;
      }
      return;
    }

    if (routedIntent === 'MANGA') {
      const storyDoc = latestStoryDoc();
      if (storyDoc) {
        console.debug('[COMIC_IMAGE] auto-generate from current STORY CARD');
        try {
          await appendMessage('user', text);
          const prompt = buildComicPromptFromDoc(storyDoc);
          generatingPortrait = true;
          try {
            const generatedUrl = await generateImage(prompt, '1024x1024', 'manga', queuedImages.map((image) => image.dataUrl));
            const savedUrl = await persistImage(generatedUrl);
            rememberGeneratedScene({
              scene: prompt,
              prompt,
              size: '1024x1024',
              renderMode: 'manga',
            });
            await appendMessage('assistant', '🎨 STORY CARD から漫画を生成しました。', savedUrl);
			autoSpeakLatestReply();
          } finally {
            generatingPortrait = false;
          }
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : String(error);
        } finally {
          sending = false;
        }
        return;
      }
    }

    // ②③ 添付画像を Vision 入力へ変換し、Provider の対応可否を判定する。
    const vision = providerVisionSupport(routedProvider.selection);
    let visionImages: string[] = [];
    let visionWarning = '';
    console.log('[CHARACTER_MEMORY_ATTACH_SNAPSHOT]', {
      characterId: selectedId,
      queuedImages: queuedImages.map((image, index) => imageRefMeta(image.dataUrl, index, 'attachQueueSnapshot')),
      queuedYaml: queuedYaml?.name ?? '',
    });
    if (queuedImages.length > 0) {
      if (!vision.supported) {
        visionWarning = vision.warning ?? 'このAI Providerは画像入力に未対応です';
      } else {
        try {
          visionImages = toVisionImages(queuedImages).map((image) => image.dataUrl);
        } catch {
          visionWarning = '画像をVision入力へ変換できませんでした';
          visionImages = [];
        }
      }
    }

    try {
      // チャット表示用テキスト（元の入力。添付のみのときはデフォルト文）。
      const userText = text
        || (queuedImages.length > 0 ? 'この画像を見て、感想を聞かせて。' : 'この内容を確認して。');
      // サムネイル用に先頭画像のみ保存（任意・表示目的）。
      const savedUrl = queuedImages.length > 0 ? await persistImage(queuedImages[0].dataUrl) : '';
      if (savedUrl) rememberVisual(savedUrl, '添付画像', userText, 'uploaded');
      await appendMessage('user', userText, savedUrl);

      // ⑤ 直近ユーザーメッセージへ添付サマリを紐付け（チャットログ表示用・in-memory）。
      const lastUser = messages[messages.length - 1];
      if (lastUser?.role === 'user' && hasAttach) {
        attachLogByMessageId = {
          ...attachLogByMessageId,
          [lastUser.id]: { images: queuedImages.length, yaml: hasYaml ? (queuedYaml?.name || 'YAML') : '' },
        };
      }

      // ④ 添付 YAML を会話コンテキスト（テキスト）として userMessage に付加。
      const yamlContext = hasYaml ? buildYamlContext(queuedYaml!.name, queuedYaml!.text) : '';
	      const aiUserMessage = yamlContext ? `${userText}\n\n${yamlContext}` : userText;
	      // 必須参照: Recent Conversation / Failure History / Memory / Relationship Memory / Emotion Memory。
	      pushRecentConversationThought();
	      pushFailureHistoryThought('chat');
	      const relevantMemories = await searchCharacterMemories(userText);
	      pushMemorySearchThoughts(relevantMemories);
	      const relevantRelationships = await searchCharacterRelationships(userText);
	      pushRelationshipThoughts(relevantRelationships);
	      const relevantEmotion = await searchCharacterEmotion();
	      pushEmotionThought(relevantEmotion.current);
	      // 💭 実際に参照した記憶からLLMで独白を生成（応答生成をブロックしない）。
	      void fetchInnerMonologue({
	        phase: 'chat',
	        goalText: userText,
	        memoryHits: relevantMemories,
	        relationshipHits: relevantRelationships,
	        emotion: relevantEmotion.current,
	      });
	      const relevantExperiences = await searchCharacterExperiences(userText);
	      const baseSystemPrompt = systemPrompt(storyMode, queuedImages.length > 0, planningMode);
          const contextualSystemPrompt = withRoutineContext(
	        withRelevantExperiences(
	          withRelevantEmotion(
	            withRelevantRelationships(
	              withRelevantMemories(baseSystemPrompt, relevantMemories),
	              relevantRelationships,
	            ),
	            relevantEmotion,
	          ),
	          relevantExperiences,
	        ),
	      );

      const response = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          route: visionImages.length > 0 ? 'image_analysis' : 'chat',
          // AI Router: route the per-character engine to the actual LLM provider.
          // Unimplemented selections fall back to GPT-5.5 (OpenAI).
          provider: routedProvider.labChatProvider ?? 'openai',
		  ...(routedProvider.model ? { model: routedProvider.model } : {}),
          ...(shiroAdaptiveReasoning ? { reasoningEffort: deliberateTurn ? 'high' : 'low' } : {}),
          systemPrompt: turnVoiceDirection?.preserveBaseVoice && !turnVoiceDirection.speedOnly
            ? `${contextualSystemPrompt}\n\n${turnVoiceDirection.scope === 'day' ? '【今日の会話中だけの演技指示】' : '【この返事だけの演技指示】'}\n${turnVoiceDirection.instruction}\nこれは一時的な演技であり、恒久的な性格変更ではありません。${turnVoiceDirection.scope === 'day' ? '今日の会話中は' : '次の返事では'}言葉選び・テンポ・勢いに反映してください。キャラクターの基本人格や恒久的な話し方は変更しないでください。`
            : contextualSystemPrompt,
          userMessage: aiUserMessage,
          // Character memory is a private store: never use LAB shared memories
          // and never recall past turns unless the user explicitly asks.
          memory: {
            enabled: aiProfile.memoryEnabled,
            characterId: character.id,
            characterName: character.name,
            autoRecall: false,
            recallThreshold: 0.75,
          },
          // ②③ Vision: 対応Provider かつ変換成功時のみ画像（data URL）を Vision 入力として渡す。
          ...(visionImages.length > 0 ? { images: visionImages } : {}),
          conversationHistory: messages.slice(-8).map((message) => ({
            role: message.role === 'assistant' ? 'ai' : 'user',
            text: stripInlineImageData(message.text).slice(0, 500),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Character response failed');
      const reply = String(data?.text ?? data?.reply ?? '').trim();
      if (!reply) throw new Error('Character response was empty');
	  const responseAIModels: AIModelMetadata = visionImages.length > 0
	    ? { imageAnalysis: typeof data?.actualModel === 'string' ? data.actualModel : AI_ROLE_MODELS.imageAnalysis, intentRouter: AI_ROLE_MODELS.intentRouter }
	    : { conversation: typeof data?.actualModel === 'string' ? data.actualModel : AI_ROLE_MODELS.conversation, intentRouter: AI_ROLE_MODELS.intentRouter };
      const analyzedStoryCard = queuedImages.length > 0
        ? normalizeStoryCardFromText(reply)
        : null;
      let assistantMemoryText = reply;
	  if (queuedImages.length > 0) {
	    console.log('[IMAGE_ANALYSIS_DEBUG_RAW_REPLY]', reply);
	    console.log('[IMAGE_ANALYSIS_DEBUG_STORYCARD_PARSED]', analyzedStoryCard);
	  }

      if (analyzedStoryCard) {
		console.log('[CURRENT_STORYCARD_JSON]', JSON.stringify(analyzedStoryCard, null, 2));
        const storyCardNotice = `絵コンテを解析しました。\nCUT${analyzedStoryCard.cuts.length}件をStoryCardへ登録しました。`;
        assistantMemoryText = storyCardNotice;
		const analyzedReferenceImages = savedUrl ? [savedUrl] : [];
		const analyzedVideoPackage = character
		  ? createVideoPackageFromStoryCard(analyzedStoryCard, character.name, analyzedReferenceImages)
		  : undefined;
		const analyzedMotionPrompt = analyzedVideoPackage ? motionPromptFromTimeline(analyzedVideoPackage.scenes) : '';
		if (analyzedVideoPackage) analyzedVideoPackage.motion_prompt = analyzedMotionPrompt;
		currentStoryCard = analyzedStoryCard;
		currentCuts = [...analyzedStoryCard.cuts];
		currentMotionPrompt = analyzedMotionPrompt;
		currentVideoPackage = analyzedVideoPackage ?? null;
		currentReferenceImages = [...analyzedReferenceImages];
		logCurrentStoryCardState();
		await appendMessage(
		  'assistant',
		  storyCardNotice,
		  analyzedReferenceImages,
		  {
		    storyCard: analyzedStoryCard,
		    ...(analyzedMotionPrompt ? { motionPrompt: analyzedMotionPrompt } : {}),
		    ...(analyzedVideoPackage ? { videoPackage: analyzedVideoPackage } : {}),
		    aiModels: responseAIModels,
		  },
		);
		const savedStoryCardMessage = [...messages].reverse().find((message) => message.storyCard?.id === analyzedStoryCard.id);
		console.log('[STORYCARD_DEBUG_MESSAGE_STORYCARD_SAVED]', savedStoryCardMessage?.storyCard);
		console.log('[CURRENT_SAVED_STORYCARD_JSON]', JSON.stringify(savedStoryCardMessage?.storyCard ?? null, null, 2));
		console.log('[STORYCARD_DEBUG_MESSAGE_MOTION_PROMPT_SAVED]', savedStoryCardMessage?.motionPrompt);
        console.log('[IMAGE_ANALYSIS_STORYCARD_SAVED]', {
          storyCardId: analyzedStoryCard.id,
          cutCount: analyzedStoryCard.cuts.length,
          jsonBodyHidden: true,
        });
      } else {
        const imageAction = parseImageAction(reply);
        if (imageAction) {
          generatingPortrait = true;
          try {
            const generatedUrl = await generateImage(imageAction.prompt, imageAction.size, 'illustration', queuedImages.map((image) => image.dataUrl));
            const generatedSavedUrl = await persistImage(generatedUrl);
            rememberGeneratedScene({
              scene: imageAction.prompt,
              prompt: imageAction.prompt,
              size: imageAction.size,
              renderMode: 'illustration',
            });
            await appendMessage('assistant', imageAction.preamble, generatedSavedUrl, {
			  aiModels: { ...responseAIModels, ...(lastGeneratedImageModel ? { image: lastGeneratedImageModel } : {}) },
			});
			autoSpeakLatestReply();
          } finally {
            generatingPortrait = false;
          }
        } else {
          // Thinking Influence V11: CHAT_FAST のときだけ語尾・一文の温度感を足す。
          // STORY のときは Story Card 用 YAML を汚さないため、返答に手を加えない。
          const voiceDirection = turnVoiceDirection;
          const displayedReply = exactSpokenLine
            ? exactSpokenLine
            : storyMode || planningMode
              ? reply
              : applyEmotionInfluence(reply, currentEmotion);
          assistantMemoryText = displayedReply;
          await appendMessage(
            'assistant',
			displayedReply,
			[],
			{ aiModels: responseAIModels, ...(voiceDirection ? { voiceDirection } : {}) },
          );
          // 🔊 autoSpeak: 通常会話の返信のみ自動発話する (画像生成・StoryCard 経路では発話しない)。
          autoSpeakLatestReply();
        }
      }
      // ⑦ 送信成功後に添付キューをクリア（StoryRef には残す）。
      // A per-message VoiceLab/performance experiment must never become a
      // permanent personality or speech-style memory.
      if (!chatVoiceInstruction) await captureSelfTalkMemory(text, assistantMemoryText, Boolean(dailyVoiceDirection));
      clearAttachQueue();
	      if (isNightRoutineRequest(userText)) {
	        void runNightRoutine();
	      } else {
	        void runMemoryReview();
	        void runRelationshipReview();
	        void runEmotionReview();
	        resetIdleTimer();
	      }
      // ⑧ Vision 警告があれば表示（送信自体は成功している）。
      if (visionWarning) errorMessage = visionWarning;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      sending = false;
    }
  }

  function isSelfTalkTopic(text: string): boolean {
    return /(自己紹介|性格|口調|好き|嫌い|苦手|得意|関係|どんな子|どんな人|何が好き|何が嫌い)/u.test(text);
  }

  async function captureSelfTalkMemory(userText: string, assistantText: string, temporaryVoiceDelivery = false): Promise<void> {
    if (!character || /(yaml|motion prompt|seedance|fps|camera|動画設定|技術)/iu.test(assistantText)) return;
    try {
      const response = await fetch('/api/lab-chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          route: 'chat',
          systemPrompt: `Extract memory candidates from this dialogue. Return JSON only: {"personality":[],"speechStyle":[],"likes":[],"dislikes":[],"relationship":"","shortTermMemory":[],"longTermMemory":[]}. Put self facts only in persona fields; recent conversation/work/artwork in shortTermMemory; user preferences, production policy, world setting in longTermMemory. Never save YAML, motion prompts, model names, video settings, or technical explanations. Do not infer.${temporaryVoiceDelivery ? ' A temporary day-scoped voice performance is active. Never save its wording, energy, tempo, emotion, or delivery as personality or speechStyle.' : ''}`,
          userMessage: `User: ${userText}\nCharacter reply: ${assistantText}`,
        }),
      });
      const data = await response.json();
      if (!response.ok) return;
      const raw = String(data?.text ?? data?.reply ?? '').match(/```json\s*([\s\S]*?)```/i)?.[1] ?? String(data?.text ?? data?.reply ?? '');
      const selfTalk = JSON.parse(raw) as Record<string, unknown>;
      const save = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/memory`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selfTalk }),
      });
      const saved = await save.json();
      if (save.ok) {
        const before = memoryV2.persona.personality.length + memoryV2.persona.speechStyle.length + memoryV2.longTermMemory.length + memoryV2.shortTermMemory.length + memory.likes.length + memory.dislikes.length;
        const dislikesBefore = memory.dislikes.length;
        const likesBefore = memory.likes.length;
        memory = saved.memory ?? memory;
        memoryV2 = saved.memoryV2 ?? memoryV2;
        updatedAt = saved.updatedAt ?? updatedAt;
        markMemoryEntry();
        const after = memoryV2.persona.personality.length + memoryV2.persona.speechStyle.length + memoryV2.longTermMemory.length + memoryV2.shortTermMemory.length + memory.likes.length + memory.dislikes.length;
        if (after > before) {
          const deltas = [
            memory.dislikes.length > dislikesBefore ? `嫌い +${memory.dislikes.length - dislikesBefore}` : '',
            memory.likes.length > likesBefore ? `好き +${memory.likes.length - likesBefore}` : '',
          ].filter(Boolean);
          memoryUpdateToast = [`🧠${character.name}の記憶を更新しました`, ...deltas].join('\n');
          if (memoryUpdateToastTimer) clearTimeout(memoryUpdateToastTimer);
          memoryUpdateToastTimer = setTimeout(() => { memoryUpdateToast = ''; }, 3000);
        }
      }
    } catch {
      // Memory extraction must never interrupt the character's reply.
    }
  }

  function portraitPrompt(appearance: string): string {
    // 自画像生成は appearance のみを使用する（personality / likes / dislikes は渡さない）。
    return [
      'masterpiece, best quality, portrait of a single character',
      appearance,
    ].filter(Boolean).join(', ');
  }

	let lastGeneratedImageModel = '';

  async function generateImage(
    prompt: string,
    size = '1024x1024',
    renderMode: 'manga' | 'illustration' = 'illustration',
    referenceImages: string[] = [],
  ): Promise<string> {
    // 💭 画像生成前の内部Reasoning。失敗しても生成自体は止めない。
    try {
      await runImageGenerationReasoning(prompt);
    } catch (reasoningError) {
      console.warn('[IMAGE_REASONING_ERROR]', reasoningError instanceof Error ? reasoningError.message : String(reasoningError));
    }
    // Character Memory Chat の画像生成モデルは aiProfile.imageAI（AI Studio Engine の Image AI）で決まる。
    // 参照画像があれば Edit（image-to-image）、無ければ Text-to-Image になる（切替はサーバ側 fal.ts）。
    const officialImages = officialVisualMemoryReferenceUrls();
    const fallbackImages = referenceImages.length > 0
      ? referenceImages.filter(Boolean)
      : imageDataUrl ? [imageDataUrl] : [];
    const imageUrls = [...new Set([...officialImages, ...fallbackImages])].slice(0, MAX_REFERENCE_IMAGES);
    // /api/generate は相対URLの参照画像を破棄する（data:/http(s):のみ受理）。
    // 動画経路（toFalAnimationImage）と同じ変換で、同一オリジンの参照をdata URL化してから送信する。
    const refImages = (await Promise.all(imageUrls.map(async (image) => {
      try {
        return await toFalAnimationImage(image);
      } catch (conversionError) {
        console.warn('[REF_IMAGES_PIPELINE_DROPPED]', {
          image,
          message: conversionError instanceof Error ? conversionError.message : String(conversionError),
        });
        return '';
      }
    }))).filter((image) => /^(?:data:|https?:\/\/)/.test(image));
    console.log('[REF_IMAGES_PIPELINE]', {
      requestRefImages: imageUrls.length,
      finalRefImages: refImages.length,
      editMode: refImages.length > 0,
    });
    const imageModelByProfile: Record<string, string> = {
      'GPT Image': 'openai/gpt-image-2',
      Anima: 'comfyui/anima',
      'NanoBanana 2 Lite': 'nanobanana-2-lite',
      'NanoBanana 2': 'fal-ai/nano-banana-2',
      'NanoBanana': 'fal-ai/nano-banana',
      'NanoBanana Pro': 'fal-ai/nano-banana-pro',
      'Flux Kontext': 'fal-ai/flux-pro/kontext',
      Seedream: 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
    };
    const model = imageModelByProfile[aiProfile.imageAI] ?? 'openai/gpt-image-2';
    const modelCapabilities = imageModelCapabilities(model);
    let designSkillContext = '';
    activeImageSkillIds = [];
    if (renderMode === 'illustration' && character?.id && modelCapabilities.supportsDesignSkill) {
      try {
        const skillResponse = await fetch('/api/image-design-context', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ characterId: character.id }),
        });
        const skillData = await skillResponse.json();
        if (!skillResponse.ok) throw new Error(skillData?.message ?? 'Image design context load failed');
        activeImageSkillIds = Array.isArray(skillData?.activeSkillIds)
          ? skillData.activeSkillIds.filter((value: unknown): value is string => typeof value === 'string')
          : [];
        designSkillContext = typeof skillData?.context === 'string' ? skillData.context.trim() : '';
      } catch (skillError) {
        console.warn('[IMAGE_DESIGN_SKILL_CONTEXT_ERROR]', skillError instanceof Error ? skillError.message : String(skillError));
      }
    }
    console.log('[IMAGE_MODEL_CAPABILITIES]', { model, ...modelCapabilities });
    const criticalFeaturePrompt = characterVisualMemory.criticalFeatures.length > 0
      ? `CRITICAL FEATURES — EVERY ITEM MUST BE CLEARLY VISIBLE: ${characterVisualMemory.criticalFeatures.join(', ')}`
      : 'CRITICAL FEATURES: none registered';
    // ネコ型アンドロイドの機械ユニットを生物の耳・尻尾に置換させないための最優先指示。
    // mustKeep にユニットIDを持つキャラ（シロ）にのみ付与し、他キャラのプロンプトを汚染しない。
    const mechanicalIdentityGuard = characterVisualMemory.rules.mustKeep.includes('HEAD_UNIT_01')
      || characterVisualMemory.rules.mustKeep.includes('TAIL_UNIT_02')
      ? [
          'IMPORTANT:',
          'HEAD_UNIT_01 is fully mechanical.',
          'Do not draw biological cat ears.',
          '',
          'TAIL_UNIT_02 is a segmented robotic tail connected to the rear waist port.',
          'Do not draw fur tails.',
        ].join('\n')
      : '';
    const productionPrompt = [
      mechanicalIdentityGuard,
      criticalFeaturePrompt,
      'CHARACTER VISUAL MEMORY JSON (authoritative structured identity):',
      JSON.stringify(characterVisualMemory, null, 2),
      'Preserve every mustKeep item and do not depict anything listed under avoid.',
      designSkillContext ? `OPTIONAL CHARACTER DESIGN SKILL CONTEXT:\n${designSkillContext}` : '',
      'USER IMAGE REQUEST:',
      prompt,
    ].filter(Boolean).join('\n');
    const payload = { images: refImages };
    console.log('[CHARACTER_MEMORY_IMAGE_PAYLOAD_IMAGES_LENGTH]', {
      'payload.images.length': payload.images.length,
      maxReferenceImages: MAX_REFERENCE_IMAGES,
    });
    // generateImage() 呼び出し直前のデバッグ出力。
    console.log('[CHARACTER_MEMORY_IMAGE_REF_STORE]', {
      characterId: selectedId,
      hasCharacterReference: Boolean(imageDataUrl),
      attachQueueCount: attachImages.length,
      storyRefsCount: storyRefs.length,
      refsPassedToGenerateImage: imageUrls.length,
      refs: imageUrls.map((url, index) => imageRefMeta(url, index, 'characterReferenceImage')),
    });
    console.log('=== FINAL COMIC PROMPT ===', productionPrompt);
    console.log('=== IMAGE MODEL ===', model);
    console.log('=== IMAGE REFS ===', refImages.map((url, index) => imageRefMeta(url, index, 'generateImage')));
    let missingFeatures: string[] = [];
    // 検証失敗時に生成AIへ機械ユニット定義（HEAD_UNIT_01 / TAIL_UNIT_02 / CONNECTION_PORT）を明示して自動再生成する。
    const unitReinforcement = [
      characterVisualMemory.equipment.headUnit,
      characterVisualMemory.equipment.tailUnit,
      characterVisualMemory.equipment.connectionPort,
    ].filter(Boolean).map((unit) => `- ${unit}`);
    // 検証は score 方式（80%以上で表示許可）。失敗しても画像は捨てず warning として表示する。
    const VALIDATION_SCORE_THRESHOLD = 80;
    // HEAD_UNIT_01 / TAIL_UNIT_02 のみの不足では再生成しない（warning 表示のみ）。
    const NON_RETRY_FEATURES = new Set(['HEAD_UNIT_01', 'TAIL_UNIT_02']);
    const MAX_VALIDATION_RETRIES = 1;
    const maxAttempts = 1 + MAX_VALIDATION_RETRIES;
    imageValidationWarning = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const retryFeedback = missingFeatures.length > 0
        ? [
            'VALIDATION RETRY — the previous image was rejected because required critical features were missing.',
            `MISSING FEATURES: ${missingFeatures.join(', ')}`,
            ...(unitReinforcement.length > 0
              ? ['REINFORCE THESE MECHANICAL UNITS — every one must be unmistakably visible and fully mechanical:', ...unitReinforcement]
              : []),
            'Do not replace any mechanical unit with a biological ear or tail.',
          ].join('\n')
        : '';
      const attemptPrompt = retryFeedback ? `${productionPrompt}\n\n${retryFeedback}` : productionPrompt;
      const requestBody = {
        prompt: attemptPrompt,
        size,
        renderMode,
        selectedModel: model,
        ...(refImages.length > 0 ? { refImages } : {}),
      };
      console.log('[GENERATE_REQUEST_JSON]', JSON.stringify({
        ...requestBody,
        attempt,
        refImages: refImages.map((url, index) => imageRefMeta(url, index, 'requestBody.refImages')),
      }, null, 2));
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? '画像生成に失敗しました。');
	  if (data?.costLog) console.info('[IMAGE_COST_LOG]', data.costLog);
	  lastGeneratedImageModel = String(data?.resolvedModel ?? model).trim();
      const generatedUrl = String(data?.images?.[0]?.url ?? data?.url ?? '').trim();
      if (!generatedUrl) throw new Error('生成画像が空でした。');
      // 生成済み画像は検証結果に関わらず捨てない — URL取得直後に必ずライブラリへ保存する。
      const savedUrl = (await persistImage(generatedUrl)) || generatedUrl;
      if (characterVisualMemory.criticalFeatures.length === 0 || !character) return savedUrl;

      let validation: Record<string, unknown> & { score?: unknown; valid?: unknown; missing?: unknown; present?: unknown; model?: unknown } = {};
      try {
        const validationResponse = await fetch('/api/visual-memory-validator', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ characterId: character.id, image: savedUrl }),
        });
        validation = await validationResponse.json().catch(() => ({}));
        if (!validationResponse.ok) throw new Error(typeof validation?.message === 'string' ? validation.message : 'Visual Memory image validation failed');
      } catch (validationError) {
        // Validator自体のエラーは warning 扱い。生成画像はそのまま表示する。
        const warningMessage = validationError instanceof Error ? validationError.message : String(validationError);
        console.warn('[VISUAL_MEMORY_IMAGE_VALIDATION_WARNING]', { attempt, message: warningMessage });
        imageValidationWarning = `Visual Memory検証を実行できませんでした（画像は表示します）: ${warningMessage}`;
        return savedUrl;
      }
      const score = typeof validation.score === 'number'
        ? validation.score
        : validation.valid === true ? 100 : 0;
      missingFeatures = Array.isArray(validation.missing)
        ? validation.missing.filter((item: unknown): item is string => typeof item === 'string')
        : [...characterVisualMemory.criticalFeatures];
      if (score >= VALIDATION_SCORE_THRESHOLD) {
        console.log('[VISUAL_MEMORY_IMAGE_ACCEPTED]', {
          attempt,
          maxAttempts,
          retried: attempt > 1,
          score,
          model: validation.model,
        });
        lastImageValidationMissing = [];
        pushThinkingStep('🎨', 'Visual Memory検証', [], [`Visual Memory検証: score=${score}% missing=[]`]);
        pushReaction('✨', [
          '今回はうまく描けた気がする…',
          'うん、ちゃんとわたしらしく描けた…うれしいな…',
          'よかった…今回はだいじょうぶそう…',
          '今回の絵、しっくりきてる…',
        ]);
        return savedUrl;
      }
      const onlyUnitFeaturesMissing = missingFeatures.length > 0
        && missingFeatures.every((feature) => NON_RETRY_FEATURES.has(feature));
      console.warn('[VISUAL_MEMORY_IMAGE_LOW_SCORE]', {
        attempt,
        maxAttempts,
        remainingRetries: maxAttempts - attempt,
        score,
        onlyUnitFeaturesMissing,
        missingFeatures,
        present: Array.isArray(validation.present) ? validation.present : [],
        model: validation.model,
      });
      lastImageValidationMissing = [...missingFeatures];
      pushThinkingStep('🎨', 'Visual Memory検証', [], [`Visual Memory検証: score=${score}% missing=[${missingFeatures.join(', ')}]`]);
      pushReaction('😳', missingFeatures.length > 0
        ? [
            `また${featureMonologueNames(missingFeatures)}を間違えちゃった…はずかしい…`,
            `${featureMonologueNames(missingFeatures)}がうまくいかなかった…くやしいな…`,
            `あっ…${featureMonologueNames(missingFeatures)}、今回もだめだったかも…`,
          ]
        : [
            'あれ…どこかうまく描けてないみたい…',
            'なにかが違う気がする…どこだろう…',
          ]);
      // HEAD_UNIT_01 / TAIL_UNIT_02 のみの不足、またはリトライ上限到達では再生成せず warning 付きで表示する。
      if (onlyUnitFeaturesMissing || attempt >= maxAttempts) {
        // ユーザー可視の警告には生のFeature IDを出さず翻訳名を使う（生IDはconsoleとLayer1技術ログへ）。
        imageValidationWarning = `Visual Memory検証スコア ${score}%（閾値 ${VALIDATION_SCORE_THRESHOLD}% 未満、不足: ${featureMonologueNames(missingFeatures) || '不明'}）。画像はそのまま表示します。`;
        return savedUrl;
      }
      pushReaction('😤', [
        'もういちどだけ、描きなおしてみるね…',
        'つぎはちゃんと描けるはず…やりなおそう…',
        'あきらめない…もう一回だけ…',
      ]);
    }
    throw new Error('画像生成に失敗しました。');
  }

  /** 自画像要求の検知（自分を描いて / 私を描いて / シロを描いて / 自画像）。 */
  function isSelfPortraitRequest(text: string): boolean {
    if (!character || projectOnlyMode) return false;
    const normalized = text.trim();
    if (/(自分|私|わたし)(の(姿|絵|イラスト))?を描いて/u.test(normalized)) return true;
    if (/自画像/u.test(normalized)) return true;
    const name = character.name.trim();
    return name.length > 0 && normalized.includes(`${name}を描いて`);
  }

  /**
   * 自画像生成の専用経路。通常画像生成（IMAGE intent）とは分離し、
   * SHIRO_SELF_REFERENCE（キャラ自己参照画像）を自動で参照に加える。
   */
  async function generateSelfPortrait(text: string): Promise<void> {
    if (!character) return;
    const selfReferences = [...new Set([
      ...selfReferenceImagesFor(character.id),
      ...selfReferenceImagesFor(character.name),
    ])];
    console.log('[SELF_PORTRAIT_MODE]', {
      characterId: character.id,
      selfReferences,
      requestText: text,
    });
    await appendMessage('user', text);
    generatingPortrait = true;
    errorMessage = '';
    try {
      const appearance = await fetchAppearance(character.id);
      const prompt = [
        'SELF PORTRAIT MODE — the character is drawing themself.',
        `Depict ${character.name} exactly as defined by the attached self-reference images.`,
        appearance,
        'USER SELF PORTRAIT REQUEST:',
        text.trim(),
      ].filter(Boolean).join('\n');
      const generatedUrl = await generateImage(prompt, '1024x1024', 'illustration', selfReferences);
      const savedUrl = await persistImage(generatedUrl);
      rememberVisual(savedUrl, '自画像', prompt, 'generated');
      await appendMessage('assistant', '自分を描いてみたよ。これが今のわたし。', savedUrl, lastGeneratedImageModel
		? { aiModels: { image: lastGeneratedImageModel } }
		: {});
	  autoSpeakLatestReply();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      generatingPortrait = false;
    }
  }

  async function generatePortrait(): Promise<void> {
    if (!character || generatingPortrait) return;
    generatingPortrait = true;
    errorMessage = '';
    try {
      const appearance = await fetchAppearance(character.id);
      const prompt = portraitPrompt(appearance || `character named ${character.name}`);
      const generatedUrl = await generateImage(prompt);
      const savedUrl = await persistImage(generatedUrl);
      await appendMessage('assistant', '自画像を生成してみたよ。これが今のわたしのイメージ。', savedUrl, lastGeneratedImageModel
		? { aiModels: { image: lastGeneratedImageModel } }
		: {});
	  autoSpeakLatestReply();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      generatingPortrait = false;
    }
  }

  async function saveMemory(nextMemory: CharacterMemory = memory): Promise<void> {
    if (!character) return;
    savingMemory = true;
    errorMessage = '';
    try {
      const response = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/memory`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          memoryV2: {
            persona: {
              ...memoryV2.persona,
              personality: nextMemory.personality,
              speechStyle: nextMemory.speechStyle,
            },
          },
          personaManual: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Memory save failed');
      memory = data.memory;
      memoryV2 = data.memoryV2 ?? memoryV2;
      updatedAt = data.updatedAt ?? updatedAt;
      markMemoryEntry();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      savingMemory = false;
    }
  }

  function markMemoryEntry(): void {
    characters = characters.map((entry) =>
      entry.id === selectedId ? { ...entry, hasMemoryEntry: true, updatedAt } : entry,
    );
  }

  function parseMemoryResponse(text: string): CharacterMemory | null {
    const jsonText = text.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? text;
    try {
      const parsed = JSON.parse(jsonText);
      const list = (value: unknown) => Array.isArray(value)
        ? value.map(String).map((item) => item.trim()).filter(Boolean)
        : [];
      return {
        personality: list(parsed.personality),
        speechStyle: list(parsed.speechStyle),
        likes: list(parsed.likes),
        dislikes: list(parsed.dislikes),
      };
    } catch {
      return null;
    }
  }

  async function updateMemoryFromHistory(): Promise<void> {
    if (!character || messages.length === 0 || analyzing) return;
    analyzing = true;
    errorMessage = '';
    try {
      const transcript = messages.slice(-80)
        .map((message) => `${message.role === 'user' ? 'USER' : character!.name}: ${message.text}`)
        .join('\n');
      const response = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          route: 'chat',
          systemPrompt: [
            '会話履歴からキャラクターのMemoryを抽出してください。',
            '必ずJSONのみを返してください。',
            '{"longTermMemory":[{"content":"","importance":70,"source":"conversation"}]}',
            '人格、口調、関係性、好き嫌いは絶対に更新しない。重要度70未満と一時作業は返さない。',
            '明示または繰り返し確認できる特徴だけを短い日本語で記録してください。',
          ].join('\n'),
          userMessage: transcript,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Memory analysis failed');
      const raw = String(data?.text ?? data?.reply ?? '').match(/```json\s*([\s\S]*?)```/i)?.[1] ?? String(data?.text ?? data?.reply ?? '');
      const parsed = JSON.parse(raw) as { longTermMemory?: Array<{ content?: unknown; importance?: unknown }> };
      const candidates = (parsed.longTermMemory ?? []).flatMap((item): MemoryItem[] => {
        const content = typeof item.content === 'string' ? item.content.trim() : '';
        const importance = Number(item.importance);
        return content && importance >= 70 ? [{ id: `long-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, content, importance: Math.min(100, importance), source: 'conversation', createdAt: new Date().toISOString() }] : [];
      });
      const responseSave = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/memory`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memoryV2: { longTermMemory: [...memoryV2.longTermMemory, ...candidates].slice(-80) } }),
      });
      const saved = await responseSave.json();
      if (!responseSave.ok) throw new Error(saved?.message ?? 'Memory save failed');
      memoryV2 = saved.memoryV2 ?? memoryV2;
      updatedAt = saved.updatedAt ?? updatedAt;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      analyzing = false;
    }
  }

  function updateMemoryList(
    key: keyof CharacterMemory,
    value: string,
  ): void {
    memory = {
      ...memory,
      [key]: value.split(/\r?\n|、/).map((item) => item.trim()).filter(Boolean),
    };
  }

  function splitVisualMemoryList(value: string): string[] {
    return [...new Set(value.split(/\r?\n|、/u).map((item) => item.trim()).filter(Boolean))];
  }

	  async function readVisualMemoryJsonResponse(response: Response, label: string, meta: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
	    const body = await response.text();
	    console.log('[VISUAL_MEMORY_RESPONSE]', {
	      label,
	      ok: response.ok,
	      status: response.status,
	      responseLength: body.length,
	      ...meta,
	    });
	    if (!body.trim()) {
	      console.error('[VISUAL_MEMORY_RESPONSE_EMPTY]', {
	        label,
	        ok: response.ok,
	        status: response.status,
	        ...meta,
	      });
	      return {};
	    }
	    try {
	      return JSON.parse(body) as Record<string, unknown>;
	    } catch (error) {
	      console.error('[VISUAL_MEMORY_JSON_PARSE_ERROR]', {
	        label,
	        ok: response.ok,
	        status: response.status,
	        responseLength: body.length,
	        body,
	        error,
	        ...meta,
	      });
	      throw new Error(`JSON Parse Error (${label}): ${error instanceof Error ? error.message : String(error)}`);
	    }
	  }

	  function jsonString(data: Record<string, unknown>, key: string, fallback = ''): string {
	    return typeof data[key] === 'string' ? data[key] : fallback;
	  }

	  function jsonErrorMessage(data: Record<string, unknown>, fallback: string): string {
	    return jsonString(data, 'message', fallback);
	  }

	  function beginVisualMemoryEdit(): void {
    visualMemoryDraft = normalizeCharacterVisualMemory(characterVisualMemory);
    visualMemoryMessage = '';
    editingVisualMemory = true;
  }

  function cancelVisualMemoryEdit(): void {
    visualMemoryDraft = normalizeCharacterVisualMemory(characterVisualMemory);
    visualMemoryMessage = '';
    editingVisualMemory = false;
  }

  function applyShiroVisualMemoryPreset(): void {
    const preset = shiroVisualMemoryPreset();
    preset.referenceImages = characterVisualMemory.referenceImages;
    preset.references = characterVisualMemory.references;
    visualMemoryDraft = preset;
    visualMemoryMessage = 'シロ初期値を入力しました。保存すると登録されます。';
    editingVisualMemory = true;
  }

	  async function saveVisualMemoryFields(): Promise<void> {
	    if (!character || savingVisualMemory) return;
	    const targetCharacterId = character.id;
	    const beforeCriticalFeatures = characterVisualMemory.criticalFeatures;
	    savingVisualMemory = true;
	    visualMemoryMessage = '';
	    try {
	      const response = await fetch(`/api/character-memory/${encodeURIComponent(targetCharacterId)}/visual-memory`, {
	        method: 'PUT',
	        headers: { 'content-type': 'application/json' },
	        body: JSON.stringify({ visualMemory: visualMemoryDraft }),
	      });
	      const data = await readVisualMemoryJsonResponse(response, 'Visual Memory fields save', {
	        selectedCharacterId: selectedId,
	        targetCharacterId,
	        beforeCriticalFeatures,
	        referenceImagesCount: characterVisualMemory.referenceImages.length,
	        attachmentsCount: attachImages.length,
	      });
	      if (!response.ok) throw new Error(jsonErrorMessage(data, 'Visual Memory save failed'));
	      const savedMemory = normalizeCharacterVisualMemory(data.visualMemory);
	      console.log('[VISUAL_MEMORY_FIELDS_SAVE_RESULT]', {
	        selectedCharacterId: selectedId,
	        targetCharacterId,
	        beforeCriticalFeatures,
	        afterCriticalFeatures: savedMemory.criticalFeatures,
	        referenceImagesCount: savedMemory.referenceImages.length,
	        attachmentsCount: attachImages.length,
	        savedVisualMemoryCharacterId: targetCharacterId,
	      });
	      if (selectedId !== targetCharacterId || character?.id !== targetCharacterId) {
	        console.warn('[VISUAL_MEMORY_FIELDS_SAVE_STALE_RESULT_IGNORED]', {
	          selectedCharacterId: selectedId,
	          targetCharacterId,
	        });
	        return;
	      }
	      characterVisualMemory = savedMemory;
	      visualMemoryDraft = normalizeCharacterVisualMemory(data.visualMemory);
	      character = { ...character, visualMemory: characterVisualMemory };
	      updatedAt = jsonString(data, 'updatedAt', updatedAt);
      editingVisualMemory = false;
      visualMemoryMessage = 'Visual Memoryを保存しました。';
      markMemoryEntry();
    } catch (error) {
      visualMemoryMessage = error instanceof Error ? error.message : String(error);
    } finally {
      savingVisualMemory = false;
    }
  }

  function visualMemoryTagList(value: string): string[] {
    return [...new Set(value.split(/[,、\r\n]+/u).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
  }

	  async function persistVisualMemoryReferences(next: CharacterVisualMemory, message: string): Promise<void> {
	    if (!character) return;
	    const targetCharacterId = character.id;
	    const beforeCriticalFeatures = characterVisualMemory.criticalFeatures;
	    const response = await fetch(`/api/character-memory/${encodeURIComponent(targetCharacterId)}/visual-memory`, {
	      method: 'PUT',
	      headers: { 'content-type': 'application/json' },
	      body: JSON.stringify({ visualMemory: next }),
	    });
	    const data = await readVisualMemoryJsonResponse(response, 'Visual Memory references save', {
	      selectedCharacterId: selectedId,
	      targetCharacterId,
	      beforeCriticalFeatures,
	      referenceImagesCount: next.referenceImages.length,
	      attachmentsCount: attachImages.length,
	    });
	    if (!response.ok) throw new Error(jsonErrorMessage(data, 'Visual Memory save failed'));
	    const savedMemory = normalizeCharacterVisualMemory(data.visualMemory);
	    console.log('[VISUAL_MEMORY_REFERENCES_SAVE_RESULT]', {
	      selectedCharacterId: selectedId,
	      targetCharacterId,
	      beforeCriticalFeatures,
	      afterCriticalFeatures: savedMemory.criticalFeatures,
	      referenceImagesCount: savedMemory.referenceImages.length,
	      attachmentsCount: attachImages.length,
	      savedVisualMemoryCharacterId: targetCharacterId,
	    });
	    if (selectedId !== targetCharacterId || character?.id !== targetCharacterId) {
	      console.warn('[VISUAL_MEMORY_REFERENCES_SAVE_STALE_RESULT_IGNORED]', {
	        selectedCharacterId: selectedId,
	        targetCharacterId,
	      });
	      return;
	    }
	    characterVisualMemory = savedMemory;
	    visualMemoryDraft = savedMemory;
	    character = { ...character, visualMemory: characterVisualMemory };
	    updatedAt = jsonString(data, 'updatedAt', updatedAt);
    visualMemoryMessage = message;
    markMemoryEntry();
  }

	  async function buildVisualMemoryFromReferences(images: AttachImage[]): Promise<{ model: string; imageCount: number }> {
	    if (!character) throw new Error('Character is not selected.');
	    if (images.length < 4) throw new Error('Visual Memory Builder requires at least 4 reference images.');
	    const targetCharacterId = character.id;
	    const beforeCriticalFeatures = characterVisualMemory.criticalFeatures;
	    console.log('[VISUAL_MEMORY_BUILDER_BEFORE]', {
	      selectedCharacterId: selectedId,
	      targetCharacterId,
	      beforeCriticalFeatures,
	      referenceImagesCount: characterVisualMemory.referenceImages.length,
	      attachmentsCount: images.length,
	    });
	    const response = await fetch('/api/visual-memory-builder', {
	      method: 'POST',
	      headers: { 'content-type': 'application/json' },
	      body: JSON.stringify({
	        characterId: targetCharacterId,
	        selectedCharacterId: selectedId,
	        images: images.map((image) => ({ name: image.name, dataUrl: image.dataUrl })),
	      }),
	    });
	    const data = await readVisualMemoryJsonResponse(response, 'Visual Memory Builder attachments', {
	      selectedCharacterId: selectedId,
	      targetCharacterId,
	      beforeCriticalFeatures,
	      referenceImagesCount: characterVisualMemory.referenceImages.length,
	      attachmentsCount: images.length,
	    });
	    if (!response.ok) throw new Error(jsonErrorMessage(data, 'Visual Memory Builder failed'));
	    const savedMemory = normalizeCharacterVisualMemory(data.visualMemory);
	    console.log('[VISUAL_MEMORY_BUILDER_AFTER]', {
	      selectedCharacterId: selectedId,
	      targetCharacterId,
	      beforeCriticalFeatures,
	      afterCriticalFeatures: savedMemory.criticalFeatures,
	      referenceImagesCount: savedMemory.referenceImages.length,
	      attachmentsCount: images.length,
	      savedVisualMemoryCharacterId: targetCharacterId,
	    });
	    if (selectedId !== targetCharacterId || character?.id !== targetCharacterId) {
	      console.warn('[VISUAL_MEMORY_BUILDER_STALE_RESULT_IGNORED]', {
	        selectedCharacterId: selectedId,
	        targetCharacterId,
	      });
	      return { model: String(data?.model ?? ''), imageCount: images.length };
	    }
	    characterVisualMemory = savedMemory;
	    visualMemoryDraft = savedMemory;
	    character = { ...character, visualMemory: characterVisualMemory };
	    updatedAt = jsonString(data, 'updatedAt', updatedAt);
    visualMemoryMessage = `Visual Memory Builderが参照画像${images.length}枚を解析しました。`;
    markMemoryEntry();
	    console.log('[VISUAL_MEMORY_BUILDER_APPLIED]', {
	      selectedCharacterId: selectedId,
	      targetCharacterId,
	      imageCount: images.length,
	      model: data?.model,
	      extraction: data?.extraction,
    });
    return { model: String(data?.model ?? ''), imageCount: images.length };
  }

	  async function buildVisualMemoryFromRegisteredImages(): Promise<void> {
	    if (!character || buildingRegisteredVisualMemory || characterVisualMemory.referenceImages.length === 0) return;
	    const targetCharacterId = character.id;
	    const beforeCriticalFeatures = characterVisualMemory.criticalFeatures;
	    buildingRegisteredVisualMemory = true;
	    visualMemoryMessage = '';
	    try {
	      console.log('[VISUAL_MEMORY_BUILDER_REGISTERED_BEFORE]', {
	        selectedCharacterId: selectedId,
	        targetCharacterId,
	        beforeCriticalFeatures,
	        referenceImagesCount: characterVisualMemory.referenceImages.length,
	        attachmentsCount: attachImages.length,
	      });
	      const response = await fetch('/api/visual-memory-builder', {
	        method: 'POST',
	        headers: { 'content-type': 'application/json' },
	        body: JSON.stringify({ characterId: targetCharacterId, selectedCharacterId: selectedId, useRegisteredImages: true }),
	      });
	      const data = await readVisualMemoryJsonResponse(response, 'Visual Memory Builder registered images', {
	        selectedCharacterId: selectedId,
	        targetCharacterId,
	        beforeCriticalFeatures,
	        referenceImagesCount: characterVisualMemory.referenceImages.length,
	        attachmentsCount: attachImages.length,
	      });
	      if (!response.ok) throw new Error(jsonErrorMessage(data, 'Visual Memory Builder failed'));
	      const savedMemory = normalizeCharacterVisualMemory(data.visualMemory);
	      console.log('[VISUAL_MEMORY_BUILDER_REGISTERED_AFTER]', {
	        selectedCharacterId: selectedId,
	        targetCharacterId,
	        beforeCriticalFeatures,
	        afterCriticalFeatures: savedMemory.criticalFeatures,
	        referenceImagesCount: savedMemory.referenceImages.length,
	        attachmentsCount: attachImages.length,
	        savedVisualMemoryCharacterId: targetCharacterId,
	      });
	      if (selectedId !== targetCharacterId || character?.id !== targetCharacterId) {
	        console.warn('[VISUAL_MEMORY_BUILDER_REGISTERED_STALE_RESULT_IGNORED]', {
	          selectedCharacterId: selectedId,
	          targetCharacterId,
	        });
	        return;
	      }
	      characterVisualMemory = savedMemory;
	      visualMemoryDraft = savedMemory;
	      character = { ...character, visualMemory: characterVisualMemory };
	      updatedAt = jsonString(data, 'updatedAt', updatedAt);
      visualMemoryMessage = `Gemini Visionが登録画像${characterVisualMemory.referenceImages.length}枚を構造化しました。`;
      markMemoryEntry();
    } catch (error) {
      visualMemoryMessage = error instanceof Error ? error.message : String(error);
    } finally {
      buildingRegisteredVisualMemory = false;
    }
  }

  async function uploadVisualMemoryReferences(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const room = Math.max(0, 60 - characterVisualMemory.referenceImages.length);
    const files = Array.from(input.files ?? [])
      .filter((file) => file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024)
      .slice(0, room);
    input.value = '';
    if (!character || files.length === 0 || uploadingVisualMemoryReferences) return;
    uploadingVisualMemoryReferences = true;
    visualMemoryMessage = '';
    try {
      const now = Date.now();
      const uploaded: VisualMemoryReferenceImage[] = [];
      for (const [index, file] of files.entries()) {
        const url = await persistImage(await readFileAsDataUrl(file));
        const fallbackTitle = file.name.replace(/\.[^.]+$/, '');
        const title = visualMemoryReferenceTitle.trim();
        uploaded.push({
          id: `visual-reference-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          url,
          title: title ? (files.length > 1 ? `${title} ${index + 1}` : title) : fallbackTitle,
          fileName: file.name.slice(0, 300),
          createdAt: new Date().toISOString(),
          tags: visualMemoryTagList(visualMemoryReferenceTags),
          importantFeatures: [],
          category: visualMemoryReferenceCategory,
          official: false,
          critical: false,
        });
      }
      const next = normalizeCharacterVisualMemory(characterVisualMemory);
      next.referenceImages = [...next.referenceImages, ...uploaded];
      await persistVisualMemoryReferences(next, `${uploaded.length}件の画像をVisual Memoryへ登録しました。`);
      visualMemoryReferenceTitle = '';
      visualMemoryReferenceTags = '';
    } catch (error) {
      visualMemoryMessage = error instanceof Error ? error.message : String(error);
    } finally {
      uploadingVisualMemoryReferences = false;
    }
  }

  async function toggleOfficialVisualReference(referenceId: string): Promise<void> {
    if (!character || savingVisualMemory) return;
    savingVisualMemory = true;
    try {
      const next = normalizeCharacterVisualMemory(characterVisualMemory);
      next.referenceImages = next.referenceImages.map((reference) => reference.id === referenceId
        ? { ...reference, official: !reference.official }
        : reference);
      await persistVisualMemoryReferences(next, 'Official Reference設定を更新しました。');
    } catch (error) {
      visualMemoryMessage = error instanceof Error ? error.message : String(error);
    } finally {
      savingVisualMemory = false;
    }
  }

  async function toggleCriticalVisualReference(referenceId: string): Promise<void> {
    if (!character || savingVisualMemory) return;
    savingVisualMemory = true;
    try {
      const next = normalizeCharacterVisualMemory(characterVisualMemory);
      next.referenceImages = next.referenceImages.map((reference) => reference.id === referenceId
        ? { ...reference, critical: !reference.critical }
        : reference);
      await persistVisualMemoryReferences(next, 'Visual Memoryのcritical設定を更新しました。');
    } catch (error) {
      visualMemoryMessage = error instanceof Error ? error.message : String(error);
    } finally {
      savingVisualMemory = false;
    }
  }

  async function deleteVisualReference(reference: VisualMemoryReferenceImage): Promise<void> {
    if (!character || savingVisualMemory) return;
    const targetCharacterId = character.id;
    const beforeCount = characterVisualMemory.referenceImages.length;
    savingVisualMemory = true;
    try {
      const next = normalizeCharacterVisualMemory(characterVisualMemory);
      next.referenceImages = next.referenceImages.filter((item) => item.id !== reference.id);
      console.log('[VISUAL_MEMORY_REFERENCE_DELETE_CLICK]', {
        selectedCharacterId: selectedId,
        targetCharacterId,
        referenceId: reference.id,
        referenceUrl: reference.url,
        beforeCriticalFeatures: characterVisualMemory.criticalFeatures,
        afterCriticalFeatures: next.criticalFeatures,
        referenceImagesCount: beforeCount,
        attachmentsCount: attachImages.length,
      });
      await persistVisualMemoryReferences(next, `${reference.fileName}を削除しました。`);
      if (selectedId === targetCharacterId && reference.url.startsWith(`/api/character-memory/${targetCharacterId}/image/`)) {
        await fetch(reference.url, { method: 'DELETE' }).catch(() => undefined);
      }
    } catch (error) {
      visualMemoryMessage = error instanceof Error ? error.message : String(error);
    } finally {
      savingVisualMemory = false;
    }
  }

  async function clearVisualReferences(): Promise<void> {
    if (!character || savingVisualMemory || characterVisualMemory.referenceImages.length === 0) return;
    const targetCharacterId = character.id;
    const before = characterVisualMemory.referenceImages;
    savingVisualMemory = true;
    try {
      const next = normalizeCharacterVisualMemory(characterVisualMemory);
      next.referenceImages = [];
      console.log('[VISUAL_MEMORY_REFERENCE_CLEAR_CLICK]', {
        selectedCharacterId: selectedId,
        targetCharacterId,
        beforeCriticalFeatures: characterVisualMemory.criticalFeatures,
        afterCriticalFeatures: next.criticalFeatures,
        referenceImagesCount: before.length,
        attachmentsCount: attachImages.length,
      });
      await persistVisualMemoryReferences(next, 'Visual Memory参照画像をすべて削除しました。');
      if (selectedId === targetCharacterId) {
        await Promise.all(before
          .filter((reference) => reference.url.startsWith(`/api/character-memory/${targetCharacterId}/image/`))
          .map((reference) => fetch(reference.url, { method: 'DELETE' }).catch(() => undefined)));
      }
    } catch (error) {
      visualMemoryMessage = error instanceof Error ? error.message : String(error);
    } finally {
      savingVisualMemory = false;
    }
  }

  function visualMemoryBrowserImages(): VisualMemoryReferenceImage[] {
    return [...characterVisualMemory.referenceImages].sort((a, b) => (
      Number(b.official) - Number(a.official)
      || Date.parse(b.createdAt) - Date.parse(a.createdAt)
    ));
  }

  async function openShiroVisualMemory(): Promise<void> {
    if (selectedId !== 'shiro') await selectCharacter('shiro');
    expandedVisualMemoryReference = null;
    showVisualMemoryBrowser = true;
  }

  function officialVisualMemoryReferenceUrls(): string[] {
    return characterVisualMemory.referenceImages
      .filter((reference) => reference.official)
      .map((reference) => reference.url)
      .filter(Boolean);
  }

	function videoPreflightLabel(url: string, index: number): string {
		const stored = getVideoProductionMediaEntries().find((entry) => entry.id === url || entry.value === url);
		if (stored?.label) return stored.label;
		if (url.startsWith('data:image/')) return `Animation Sheet ${index + 1}`;
		return url.split('?')[0].split('/').at(-1) || `Production Reference ${index + 1}`;
	}

	/** Preflight lists only the Animation Project's own materials, classified by file name / label keywords. */
	function buildVideoPreflightMaterials(animationSheetUrls: string[]): VideoPreflightMaterial[] {
		return [...new Set(animationSheetUrls.filter(Boolean))].map((url, index) => {
			const label = videoPreflightLabel(url, index);
			return {
				id: `production:${index}:${url}`,
				url,
				label,
				category: classifyAnimationReference(`${label} ${referenceNameFromUrl(url)}`),
				details: [],
			};
		});
	}

	function videoPreflightMaterialsFor(category: VideoPreflightCategory): VideoPreflightMaterial[] {
		return videoPreflightMaterials.filter((material) => material.category === category);
	}

  /** Video Preflight の表示ゲート。動画生成経路（Intent=VIDEO/VIDEO_EDIT・動画ボタン・明示要求のDirect Mode）
   *  からのみ呼ばれる前提で、さらに Character Reference / Animation Sheet のいずれかが存在するときだけ表示する。
   *  どちらも無い場合はモーダルを出さずにそのまま生成へ進む。 */
  async function confirmVideoProductionMaterials(animationSheetUrls: string[] = []): Promise<boolean> {
	videoPreflightMaterials = buildVideoPreflightMaterials(animationSheetUrls);
	const hasVideoMaterials = videoPreflightMaterials.some((material) =>
		material.category === 'Character Reference' || material.category === 'Animation Sheet');
    console.log('[VIDEO_PRODUCTION_PREFLIGHT]', {
	  materials: VIDEO_PREFLIGHT_CATEGORIES.map((category) => ({ category, count: videoPreflightMaterialsFor(category).length })),
	  hasVideoMaterials,
    });
	if (!hasVideoMaterials) return true;
    if (resolveVideoMemoryReview) resolveVideoMemoryReview(false);
    showVideoMemoryReview = true;
    return new Promise((resolve) => {
      resolveVideoMemoryReview = resolve;
    });
  }

  function finishVideoMemoryReview(confirmed: boolean): void {
    showVideoMemoryReview = false;
    const resolve = resolveVideoMemoryReview;
    resolveVideoMemoryReview = null;
    resolve?.(confirmed);
  }

  async function fetchAppearance(id: string): Promise<string> {
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(id)}`);
      if (!response.ok) return '';
      const data = await response.json();
      const list = data?.character?.characterBible?.characters;
      if (!Array.isArray(list) || list.length === 0) return '';
      const match = list.find((entry) => String(entry?.id ?? '').toLowerCase() === id.toLowerCase());
      const appearance = (match ?? list[0])?.appearance;
      return typeof appearance === 'string' ? appearance.trim() : '';
    } catch {
      return '';
    }
  }

  async function clearChat(): Promise<void> {
    if (projectOnlyMode) {
      messages = [];
      return;
    }
    if (!character || !confirm('このキャラクターの会話ログを削除しますか？')) return;
    const response = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/chat`, {
      method: 'DELETE',
    });
    if (response.ok) messages = [];
  }
</script>

<svelte:head>
  <title>CHARACTER MEMORY CHAT | AI VTuber</title>
</svelte:head>

<div class="chat-page">
  <header>
    <a href="/characters">← CHARACTER LIBRARY</a>
    <div>
      <p>CHARACTER LIFE SPACE / MEMORY · STORY · VOICE · VIDEO</p>
      <h1>CHARACTER MEMORY CHAT</h1>
      <div class="routine-state-pill">
        <span>{routineStatusInfo.icon}</span>
        <strong>{routineStatusInfo.label}</strong>
        <small>{routineStatusInfo.text}</small>
      </div>
    </div>
	<div class="header-actions">
	  <button class="storycard-reset-button" onclick={() => void resetStoryCardState({ reason: 'manual-button' })}>制作状態を完全リセット</button>
	  <button onclick={clearChat} disabled={!character || messages.length === 0}>ログ削除</button>
	</div>
  </header>

  {#if errorMessage}<div class="error-message">{errorMessage}</div>{/if}
  {#if imageValidationWarning}<div class="warning-message" role="status">{imageValidationWarning}</div>{/if}
  {#if activeImageSkillIds.length > 0}<div class="active-image-skill" role="status">Active Skill: {activeImageSkillIds.join(', ')}</div>{/if}
  {#if memoryUpdateToast}<div class="memory-update-toast" role="status">{memoryUpdateToast}</div>{/if}
  {#if labExportToast}<div class="lab-export-toast" role="status">{labExportToast}</div>{/if}

  <main>
    <aside class="select-panel">
      <p class="panel-label">CHARACTER</p>
	      {#if loadingList}
	        <div class="hint">読み込み中...</div>
	      {:else}
	        <ul class="character-list">
	          <li>
	            <button
	              class="character-item project-only-item"
	              class:active={projectOnlyMode}
	              onclick={selectProjectOnly}
	            >
	              <span class="character-name">なし / Project Only</span>
	              <span class="character-role">キャラクター記憶を使用しません</span>
	            </button>
	          </li>
	          {#each characters as item (item.id)}
            <li>
              <button
                class="character-item"
                class:active={item.id === selectedId}
                onclick={() => selectCharacter(item.id)}
              >
                <span class="character-name">{item.name}</span>
                {#if item.role}<span class="character-role">{item.role}</span>{/if}
                {#if item.hasMemoryEntry}<span class="memory-flag">MEM</span>{/if}
              </button>
            </li>
	          {/each}
	        </ul>
	        {#if characters.length === 0}<div class="hint">登録キャラクターはありません。</div>{/if}
	      {/if}
	      {#if projectOnlyMode}
	        <div class="project-only-notice">Project Only: キャラクター記憶を使用しません</div>
	      {/if}
	      {#if character && !projectOnlyMode}
        <button class="visual-memory-sidebar-button" type="button" onclick={() => showVisualMemoryBrowser = true}>
          👁 Visual Memoryを見る
          <span>{characterVisualMemory.referenceImages.length}</span>
        </button>
      {/if}
    </aside>

    {#if loadingCharacter}
      <section class="conversation-panel"><div class="hint center">読み込み中...</div></section>
    {:else if character}
      <section class="conversation-panel">
        <div class="character-head">
          <div class="portrait" class:active-speaking={avatarState.speaking}>
            {#if imageDataUrl}
              {#key character.id}
              <PuruPuruAvatar
                src={imageDataUrl}
                alt={character.name}
                speaking={avatarState.speaking}
                mouthLevel={avatarState.mouthLevel}
                emotion={avatarState.emotion}
                thinking={avatarState.thinking}
                modelKey={character.id}
                onRendererChange={(renderer) => avatarRenderer = renderer}
              />
              {/key}
            {:else}<span>NO IMAGE</span>{/if}
          </div>
          <div class="head-info">
            <h2>{character.name}</h2>
            <button class="lab-export-button" type="button" onclick={exportCharacterToLab}>📤 LABチャットへ送る</button>
            {#if imageDataUrl}
              <button class="lab-export-button" type="button" onclick={toggleBroadcastMode}>
                📡 配信モード: {broadcastMode ? 'ON' : 'OFF'}
              </button>
            {/if}
            <div class="ai-chip" title="このキャラクターのAI（Personality Engine）">
              <span class="ai-icon">{routedProvider.icon}</span>
              <span class="ai-label">{routedProvider.label}</span>
              {#if !routedProvider.implemented}<span class="ai-pending">未実装</span>{/if}
            </div>
            {#if character.role}<div class="role"><span class="role-tag">🏷️</span>{character.role}</div>{/if}
            {#if character.description}<p class="desc">{character.description}</p>{/if}
          </div>
        </div>
	        <div class="messages">
	          {#if routineMessage}
	            <div class="routine-message">
	              <span>{routineStatusInfo.icon}</span>
	              <p>{routineMessage}</p>
	            </div>
	          {/if}
	          {#if messages.length === 0}
            <div class="hint center">{character.name}との会話を始めてください。</div>
          {/if}
          {#each messages as message, index (message.id)}
            {@const previous = messages[index - 1]}
			{@const displayedAIModels = aiModelsForMessage(message)}
            {#if index === 0 || chatDateLabel(previous?.timestamp ?? previous?.createdAt) !== chatDateLabel(message.timestamp ?? message.createdAt)}
              <div class="chat-date-divider">──── {chatDateLabel(message.timestamp ?? message.createdAt)} ────</div>
            {/if}
            <!-- LABチャット同様の2カラム: [顔アイコン+名前+AIモデル] [吹き出し] -->
            <article class:user={message.role === 'user'} class:assistant={message.role === 'assistant'}>
              <div class="msg-id">
                <div class="msg-avatar">
                  {#if message.role === 'assistant'}
                    {#if imageDataUrl}
                      <img src={imageDataUrl} alt={character.name} />
                    {:else}
                      <span class="msg-avatar-fallback">{character.name.slice(0, 1)}</span>
                    {/if}
                  {:else}
                    <span class="msg-avatar-fallback user-face">👤</span>
                  {/if}
                </div>
                {#if message.role === 'assistant'}
                  <span class="msg-name">{character.name}</span>
                  {#if proactiveMessageIds[message.id]}<span class="proactive-badge">自発</span>{/if}
				  <span class="msg-ai">
					<span class="msg-ai-icon">AI</span>actualModel: {displayedAIModels.conversation ?? displayedAIModels.storyCard ?? displayedAIModels.imageAnalysis ?? AI_ROLE_MODELS.conversation}
                  </span>
                {:else}
                  <span class="msg-name">YOU</span>
                {/if}
              </div>
              <div class="msg-bubble">
	                {#if message.referenceImages?.length && !isDedicatedStoryCardMessage(message)}
                  <div class="message-reference-images">
                    {#each message.referenceImages as imageUrl, index (`${message.id}-${imageUrl}`)}
                      <img class="message-image" src={imageUrl} alt={`reference ${index + 1}`} />
                    {/each}
                  </div>
                {:else if message.imageUrl}
                  <img class="message-image" src={message.imageUrl} alt="attached" />
                {/if}
	                {#if message.role === 'assistant' && storyCardForMessage(message)}
	                  {@const storyCard = storyCardForMessage(message)!}
				  {#if isAnimationProjectMessage(message)}
					<VideoStoryCard
					  message={message}
					  {storyCard}
					  title={animationProjectTitle(message)}
					  characterName={message.videoPackage?.character_name || storyCard.characters[0]?.name || 'Character'}
					  summary={storyCard.summary}
					  referenceCount={videoReferenceImagesForMessage(message).length}
					  referenceImages={videoReferenceImagesForMessage(message)}
					  referenceSource={videoReferenceSourceForMessage(message)}
					  sourceMessageId={message.id}
					  initialMotionPrompt={motionPromptForMessage(message)}
					  initialVideoPackage={videoPackageForMessage(message, storyCard)}
					  initialVideoModelId={selectedVideoModelIdFromProfile()}
					  createdAt={new Date(message.createdAt).toLocaleString('ja-JP')}
					  videoUrl={generatedVideoByMessageId[message.id] || ''}
					  onReferenceImagesChange={(images) => updateVideoReferenceImages(message.id, images)}
					  onSceneTimelineChange={(scenes, nextMotionPrompt) => saveAnimationProjectTimeline(message, scenes, nextMotionPrompt)}
					  onVideoCompleted={(url) => {
						generatedVideoByMessageId = { ...generatedVideoByMessageId, [message.id]: url };
						currentGeneratedVideo = url;
					  }}
					  onVideoStateChange={(state) => { videoGenerationState = state; }}
					  compact
					/>
				  {:else}
	                  <StoryCardCard
		                    card={storyCard}
		                    thumbnailUrl={messageAttachmentImage(message)}
		                    conversationSummary={storyCardSummaryByMessageId[message.id] || message.text}
	                    motionPrompt={motionPromptForMessage(message)}
	                    videoPackage={videoPackageForMessage(message, storyCard)}
		                    referenceImages={videoReferenceImagesForMessage(message)}
		                    disabled={generatingPortrait || Boolean(generatingVideoByMessageId[message.id])}
	                    onReferenceImagesChange={(images) => updateVideoReferenceImages(message.id, images)}
	                    onGenerateImage={(card) => void generateImageFromStoryCard(card, message)}
	                    onGenerateVideo={(videoPackage) => void generateVideoFromPackage(videoPackage, message)}
	                    onGenerateComic={(card) => {
	                      const fallbackDoc: StoryDoc = {
	                        title: card.title,
	                        theme: card.theme,
	                        characters: card.characters.map((item) => item.name),
	                        scenes: card.cuts.map((cut) => ({
	                          title: cut.title ?? `Cut ${cut.order}`,
	                          visual: cut.visual ?? cut.summary,
	                          action: cut.action ?? cut.summary,
	                          dialogue: cut.dialogue ? [{ speaker: card.characters[0]?.name ?? '', text: cut.dialogue }] : [],
	                          emotion: cut.emotion ?? card.emotion,
	                        })),
	                      };
	                      void generateComicFromStoryCard(card, fallbackDoc, message);
	                    }}
	                    onSaveJson={(card) => saveStoryCardJson(message, card)}
	                  />
				  {/if}
                {:else if message.role === 'assistant' && message.text.startsWith('【Phase1 企画カード】')}
                  <section class="planning-card">
                    <p class="planning-card-phase">PHASE 1 · 企画カード</p>
                    <div class="bubble-text">{message.text}</div>
                  </section>
                {:else if message.text}
                  <div class="bubble-text">{stripInlineImageData(message.text)}</div>
                  {#if message.role === 'assistant' && (voiceConfig || message.voiceDirection || panelVoiceDraftMessageId())}
                    {#if message.voiceDirection}
                      <div class="voice-direction-badge" title={message.voiceDirection.instruction}>
                        <span>{message.voiceDirection.speedOnly ? (message.voiceDirection.scope === 'day' ? '☀️ TODAY’S SPEED' : '⏩ SPEED ONLY') : message.voiceDirection.scope === 'day' ? '☀️ TODAY’S VOICE' : message.voiceDirection.preserveBaseVoice ? '🎭 ONE-SHOT VOICE' : '🎙 VOICE LAB'}</span>
                        <strong>{message.voiceDirection.summary}</strong>
                      </div>
                    {/if}
                    <button
                      type="button"
                      class="voice-play-button"
                      class:voice-error={voiceStateByMessageId[message.id] === 'error'}
                      disabled={voiceStateByMessageId[message.id] === 'loading' || voiceStateByMessageId[message.id] === 'playing'}
                      onclick={() => void speakMessage(message)}
                      title={voiceStateByMessageId[message.id] === 'error'
                        ? '音声生成に失敗しました。クリックすると音声だけ再試行します（動画の再試行ではありません）'
                        : proactiveSettings.autoPlayVoice
                          ? 'この会話をもう一度再生'
                          : '音声で再生'}
                    >
                      {#if voiceStateByMessageId[message.id] === 'loading'}⏳ 音声生成中...
                      {:else if voiceStateByMessageId[message.id] === 'playing'}🔊 再生中
                      {:else if voiceStateByMessageId[message.id] === 'error'}⚠️ 音声を再試行
                      {:else if proactiveSettings.autoPlayVoice}🔁 再生
                      {:else}🔊 再生{/if}
                    </button>
                    {#if voiceBackendByMessageId[message.id]}
                      <span
                        class="voice-backend-badge"
                        class:pod={voiceBackendByMessageId[message.id] === 'runpod-pod'}
                        title="この音声を実際に生成したRunPod接続先"
                      >{runpodVoiceBackendLabel(voiceBackendByMessageId[message.id])}</span>
                    {/if}
                    {#if message.voiceDirection && !message.voiceDirection.preserveBaseVoice}
                      <button
                        type="button"
                        class="voice-adopt-button"
                        class:voice-adopted={voiceSavedMessageId === message.id}
                        disabled={!voiceUrlByMessageId[message.id] || Boolean(voiceSavingMessageId) || voiceSavedMessageId === message.id}
                        onclick={() => void adoptMessageVoice(message)}
                        title={voiceUrlByMessageId[message.id]
                          ? 'この候補をローカル保存し、キャラクターの基本声に設定します'
                          : '先に再生してローカル音声候補を生成してください'}
                      >
                        {#if voiceSavingMessageId === message.id}⏳ 基本声として保存中…
                        {:else if voiceSavedMessageId === message.id}✓ 基本声に設定済み
                        {:else if voiceUrlByMessageId[message.id]}💾 この声を基本声にする
                        {:else}候補を再生すると決定できます{/if}
                      </button>
                    {/if}
                  {/if}
                {/if}
				{#if message.role === 'assistant' && Object.keys(displayedAIModels).length > 0}
				  <div class="message-ai-models" aria-label="使用AIモデル">
					{#if displayedAIModels.conversation}<span><b>Conversation AI:</b> {displayedAIModels.conversation}</span>{/if}
					{#if !isAnimationProjectMessage(message) && displayedAIModels.storyCard}<span><b>StoryCard AI:</b> {displayedAIModels.storyCard}</span>{/if}
					{#if !isAnimationProjectMessage(message) && displayedAIModels.motionPrompt}<span><b>Motion Prompt AI:</b> {displayedAIModels.motionPrompt}</span>{/if}
					{#if displayedAIModels.imageAnalysis}<span><b>Image Analysis AI:</b> {displayedAIModels.imageAnalysis}</span>{/if}
					{#if displayedAIModels.image}<span><b>Image AI:</b> {displayedAIModels.image}</span>{/if}
					{#if displayedAIModels.video}<span><b>Video AI:</b> {displayedAIModels.video}</span>{/if}
					{#if generatedVideoBackendByMessageId[message.id]}
					  <span class:pod-route={generatedVideoBackendByMessageId[message.id] === 'runpod-pod'}>
					    <b>Video Route:</b> {generatedVideoBackendByMessageId[message.id] === 'runpod-pod' ? 'Pod直結' : 'Serverless退避'}
					  </span>
					{/if}
					{#if displayedAIModels.yaml}<span><b>YAML AI:</b> {displayedAIModels.yaml}</span>{/if}
					{#if displayedAIModels.intentRouter}<span><b>Intent Router AI:</b> {displayedAIModels.intentRouter}</span>{/if}
				  </div>
				{/if}
                {#if generatedVideoByMessageId[message.id]}
                  <video class="message-video" controls src={generatedVideoByMessageId[message.id]}>
                    <track kind="captions" srclang="en" label="Preview" src="/generated-video-captions.vtt" />
                  </video>
                {/if}
                {#if generatingVideoByMessageId[message.id]}
                  <div class="message-video-status">🎬 {character?.name ?? 'キャラクター'}が動画を作成中...</div>
                {/if}
                {#if videoDurationDebugByMessageId[message.id]}
                  <div class="seedance-mini-duration-debug">
                    <span>Original Duration: {videoDurationDebugByMessageId[message.id].originalDuration}</span>
                    <span>Safe Duration: {videoDurationDebugByMessageId[message.id].safeDuration}</span>
                  </div>
                {/if}
                {#if videoErrorByMessageId[message.id] && !generatingVideoByMessageId[message.id] && !generatedVideoByMessageId[message.id]}
                  <div class="message-video-error">
                    <pre>{videoErrorByMessageId[message.id]}</pre>
                    {#if storyCardForMessage(message) && videoPackageForMessage(message, storyCardForMessage(message))}
                      <button type="button" onclick={() => retryDirectSeedanceAnimation(message)}>Retry</button>
                    {/if}
                  </div>
                {/if}
                {#if character && message.role === 'assistant' && !isDedicatedStoryCardMessage(message) && message.id === latestProjectAssetMessage()?.id && (hasExplicitVideoRequest(message) || Boolean(message.videoPackage)) && (!videoErrorByMessageId[message.id] || Boolean(generatedVideoByMessageId[message.id]))}
                  <VideoStoryCard
					message={message}
					storyCard={storyCardForMessage(message)}
                    title={message.text.slice(0, 48) || animationProjectTitle(message)}
                    characterName={message.videoPackage?.character_name || 'Character'}
					summary="Animation Project"
                    tags={['daily-life', 'character-video']}
                    referenceCount={videoReferenceImagesForMessage(message).length}
                    referenceImages={videoReferenceImagesForMessage(message)}
                    referenceSource={videoReferenceSourceForMessage(message)}
                    sourceMessageId={message.id}
                    referenceImageFileName={videoReferenceImageFileNameForMessage(message)}
					initialMotionPrompt={motionPromptForMessage(message)}
                    initialVideoPackage={videoPackageForMessage(message)}
                    onReferenceImagesChange={(images) => updateVideoReferenceImages(message.id, images)}
					onSceneTimelineChange={(scenes, nextMotionPrompt) => saveAnimationProjectTimeline(message, scenes, nextMotionPrompt)}
                    initialVideoModelId={selectedVideoModelIdFromProfile()}
                    createdAt={new Date(message.createdAt).toLocaleString('ja-JP')}
                    videoUrl={generatedVideoByMessageId[message.id] || ''}
                    onVideoCompleted={(url) => {
                      generatedVideoByMessageId = { ...generatedVideoByMessageId, [message.id]: url };
					  currentGeneratedVideo = url;
                    }}
                    onVideoStateChange={(state) => { videoGenerationState = state; }}
                    compact
                  />
                {/if}
                <!-- ⑤ 添付サマリ（チャットログ上のみ・in-memory） -->
                {#if attachLogByMessageId[message.id]}
                  <div class="msg-attach">
                    <span class="msg-attach-label">📎 添付</span>
                    {#if attachLogByMessageId[message.id].images > 0}
                      <span class="msg-attach-item">🖼️ 画像{attachLogByMessageId[message.id].images}枚</span>
                    {/if}
                    {#if attachLogByMessageId[message.id].yaml}
                      <span class="msg-attach-item">📄 {attachLogByMessageId[message.id].yaml}</span>
                    {/if}
                  </div>
                {/if}
                {#if message.role === 'assistant' && generatedVideoByMessageId[message.id]}
                  <div hidden>
                  <details class="video-details">
					<summary>詳細: Animation Project</summary>
					<button type="button" onclick={() => createVideoPackageYaml(message.id, sourceRequestText(message))}>Animation Projectを作成</button>
                  </details>
                  <div class="animation-actions" hidden>
                    <button type="button" onclick={() => createAnimationYaml(message.id, message.text)}>🎬 アニメ設計図</button>
					<button type="button" onclick={() => createVideoPackageYaml(message.id, message.text)}>📦 Animation Project</button>
                    <button type="button" disabled title="動画AI接続は今後の実装です">🎥 動画生成</button>
                  </div>
                  {#if animationYamlByMessageId[message.id]}
                    <pre class="animation-yaml">{animationYamlByMessageId[message.id]}</pre>
                  {/if}
                  {#if videoPackageByMessageId[message.id]}
                    <pre class="animation-yaml">{videoPackageByMessageId[message.id]}</pre>
                  {/if}
                  </div>
                {/if}
                <div class="msg-time">{chatTimeLabel(message.timestamp ?? message.createdAt)}</div>
              </div>
            </article>
          {/each}
          {#if thinkingStreamEnabled && (thinkingStream.length > 0 || thoughtActionCandidate)}
            <div class="thinking-stream" class:done={thinkingStreamDone} aria-live="polite">
              <button type="button" class="thinking-stream-head" onclick={() => (thinkingStreamOpen = !thinkingStreamOpen)}>
                <span>💭</span>
                <strong>{character.name}の考えごと</strong>
                <span class="thinking-count">{monologueCount()}</span>
                <span class="thinking-toggle">{thinkingStreamOpen ? '▾' : '▸'}</span>
              </button>
              {#if thinkingStreamOpen}
                <div class="thinking-stream-body">
                  {#if thoughtActionCandidate}
                    <div class="thought-action-candidate">
                      <div class="thought-action-head">
                        <span>{thoughtActionCandidate.suggestedAction === 'WEB_SEARCH' ? '🔍' : thoughtActionCandidate.suggestedAction === 'MEMORY_LOOKUP' ? '📚' : '⚡'}</span>
                        <strong>次の行動候補</strong>
                        <b>待機中</b>
                      </div>
                      <p>{thoughtActionCandidate.query || thoughtActionCandidate.reason}</p>
                      <small>
                        {thoughtActionRoute?.intent ?? thoughtActionCandidate.suggestedAction}
                        · confidence {Math.round((thoughtActionRoute?.confidence ?? thoughtActionCandidate.confidence) * 100)}%
                      </small>
                    </div>
                  {/if}
                  <!-- Layer2: キャラクター内心ログ（一人称の独白）。ユーザーへはこちらを優先表示する。 -->
                  {#each thinkingStream.filter((step) => step.lines.length > 0) as step (step.id)}
                    <div class="thinking-step">
                      {#each step.lines as line, lineIndex}
                        <p class="thinking-line">{#if lineIndex === 0}<span class="thinking-line-icon">{step.icon}</span>{/if}{line}</p>
                      {/each}
                    </div>
                  {/each}
                  <!-- Layer1: 技術検討ログ。生データ（検索ヒット・スコア・Feature ID）はここにだけ出す。 -->
                  {#if thinkingStream.some((step) => step.tech.length > 0)}
                    <details class="thinking-tech-log">
                      <summary>技術ログ（開発者向け）</summary>
                      {#each thinkingStream as step (step.id)}
                        {#if step.tech.length > 0}
                          {#if step.label}<p class="thinking-tech-line head">{step.label}</p>{/if}
                          {#each step.tech as line}
                            <p class="thinking-tech-line">{line}</p>
                          {/each}
                        {/if}
                      {/each}
                    </details>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
          {#if interactionMode === 'observation' && thoughtObservations.length > 0}
            {@const latestObservation = thoughtObservations[thoughtObservations.length - 1]}
            <div class="observation-panel" aria-live="polite">
              <div class="observation-head">
                <span>🧠</span>
                <strong>{character.name.toUpperCase()} OBSERVATION</strong>
                <b class="observation-status" data-status={latestObservation.status}>{latestObservation.status.replace('_', ' ').toUpperCase()}</b>
              </div>
              <div class="observation-grid">
                <span>CURRENT FOCUS</span>
                <p>{latestObservation.currentFocus}</p>
                <span>THOUGHT</span>
                <p>{latestObservation.observation}</p>
                {#if latestObservation.conflict}
                  <span>CONFLICT</span>
                  <p>{latestObservation.conflict}</p>
                {/if}
                {#if latestObservation.memoryReference}
                  <span>MEMORY</span>
                  <p>{latestObservation.memoryReference}</p>
                {/if}
                {#if latestObservation.actionCandidate?.needAction}
                  <span>NEXT ACTION</span>
                  <p>
                    {latestObservation.actionCandidate.suggestedAction}
                    · confidence {Math.round(latestObservation.actionCandidate.confidence * 100)}%
                    <em class="observation-pending">待機中（自動実行しません）</em>
                  </p>
                {/if}
                {#if latestObservation.emotionalState}
                  <span>EMOTION</span>
                  <p>{latestObservation.emotionalState.label} · {Math.round(latestObservation.emotionalState.intensity * 100)}%</p>
                {/if}
              </div>
            </div>
          {/if}
          {#if observing}<div class="hint center">{character.name} is reflecting...</div>{/if}
          {#if sending && !observing}<div class="hint center">{character.name} is thinking...</div>{/if}
          {#if generatingPortrait}<div class="hint center">{character.name} is drawing...</div>{/if}
	          {#if reviewingMemory}
	            <div class="memory-review-loading" aria-live="polite">
              <div class="review-loading-head">
                <span>🧠</span>
                <strong>{character.name}が今日を振り返っています</strong>
                <span class="review-dots"><i></i><i></i><i></i></span>
              </div>
	              <div class="review-loading-bar"><span></span></div>
	            </div>
	          {/if}
	          {#if reviewingRelationship}
	            <div class="memory-review-loading relationship-loading" aria-live="polite">
	              <div class="review-loading-head">
	                <span>💞</span>
	                <strong>{character.name}がRootSさんのことを整理しています...</strong>
	                <span class="review-dots"><i></i><i></i><i></i></span>
	              </div>
	              <div class="review-loading-bar"><span></span></div>
	            </div>
	          {/if}
	          {#if reviewingEmotion}
	            <div class="memory-review-loading emotion-loading" aria-live="polite">
	              <div class="review-loading-head">
	                <span>🫀</span>
	                <strong>{character.name}が今の気持ちを確かめています...</strong>
	                <span class="review-dots"><i></i><i></i><i></i></span>
	              </div>
	              <div class="review-loading-bar"><span></span></div>
	            </div>
	          {/if}
		          {#if memoryReview}
		            <MemoryReviewCard
	              review={memoryReview}
	              characterName={character.name}
	              developerMode={developerMode}
              saving={savingReviewMemory}
              savedIndexes={savedReviewIndexes}
              skippedIndexes={skippedReviewIndexes}
              saveComment={memoryReviewSaveComment}
              saveDebug={memoryReviewSaveDebug}
              onSaveCandidate={saveReviewCandidate}
              onSaveRecommended={saveRecommendedReviewCandidates}
		              onSkipCandidate={skipReviewCandidate}
		            />
		          {/if}
		          {#if relationshipReview}
		            <RelationshipReviewCard
		              review={relationshipReview}
		              characterName={character.name}
		              developerMode={developerMode}
		              saving={savingRelationship}
		              savedIndexes={savedRelationshipIndexes}
		              skippedIndexes={skippedRelationshipIndexes}
		              saveComment={relationshipSaveComment}
		              saveDebug={relationshipSaveDebug}
		              onSaveCandidate={saveRelationshipCandidate}
		              onSaveRecommended={saveRecommendedRelationshipCandidates}
		              onSkipCandidate={skipRelationshipCandidate}
		            />
		          {/if}
		          {#if emotionReview}
		            <EmotionReviewCard
		              review={emotionReview}
		              saved={savedEmotion}
		              saveComment={emotionSaveComment}
		              developerMode={developerMode}
		              saveDebug={emotionSaveDebug}
		              history={emotionBrain.history}
		            />
		          {/if}
		          {#if developerMode && memorySearchDebug}
	            <details class="memory-search-debug" open>
	              <summary>🧠 Memory Search</summary>
	              <div class="memory-search-grid">
	                <span>Query</span>
	                <strong>{memorySearchDebug.query}</strong>
	                <span>Hit Count</span>
	                <strong>{memorySearchDebug.hitCount}</strong>
	                <span>Top Relevance</span>
	                <strong>{memorySearchDebug.topRelevance.toFixed(2)}</strong>
	                <span>Elapsed Time</span>
	                <strong>{memorySearchDebug.elapsedMs}ms</strong>
	                <span>Memory IDs</span>
	                <strong>{memorySearchDebug.memoryIds.join(', ') || '-'}</strong>
	              </div>
	              {#if memorySearchDebug.error}
	                <p class="memory-search-error">{memorySearchDebug.error}</p>
	              {/if}
		              <pre>{JSON.stringify({ request: memorySearchDebug.requestPayload, response: memorySearchDebug.responseJson }, null, 2)}</pre>
		            </details>
		          {/if}
		          {#if developerMode && relationshipSearchDebug}
		            <details class="memory-search-debug" open>
		              <summary>💞 Relationship Search</summary>
		              <div class="memory-search-grid">
		                <span>Query</span>
		                <strong>{relationshipSearchDebug.query}</strong>
		                <span>Hit Count</span>
		                <strong>{relationshipSearchDebug.hitCount}</strong>
		                <span>Top Relevance</span>
		                <strong>{relationshipSearchDebug.topRelevance.toFixed(2)}</strong>
		                <span>Confidence</span>
		                <strong>{relationshipSearchDebug.topConfidence.toFixed(2)}</strong>
		                <span>Latency</span>
		                <strong>{relationshipSearchDebug.elapsedMs}ms</strong>
		                <span>Relationship IDs</span>
		                <strong>{relationshipSearchDebug.relationshipIds.join(', ') || '-'}</strong>
		              </div>
		              {#if relationshipSearchDebug.error}
		                <p class="memory-search-error">{relationshipSearchDebug.error}</p>
		              {/if}
		              <pre>{JSON.stringify({ request: relationshipSearchDebug.requestPayload, response: relationshipSearchDebug.responseJson }, null, 2)}</pre>
		            </details>
		          {/if}
		          {#if developerMode && emotionSearchDebug}
		            <details class="memory-search-debug" open>
		              <summary>🫀 Emotion Search</summary>
		              <div class="memory-search-grid">
		                <span>Emotion</span>
		                <strong>{emotionSearchDebug.emotion}</strong>
		                <span>Intensity</span>
		                <strong>{emotionSearchDebug.intensity.toFixed(2)}</strong>
		                <span>Confidence</span>
		                <strong>{emotionSearchDebug.confidence.toFixed(2)}</strong>
		                <span>Latency</span>
		                <strong>{emotionSearchDebug.elapsedMs}ms</strong>
		                <span>History</span>
		                <strong>{emotionSearchDebug.historyCount}</strong>
		              </div>
		              {#if emotionSearchDebug.error}
		                <p class="memory-search-error">{emotionSearchDebug.error}</p>
		              {/if}
		              <pre>{JSON.stringify({ request: emotionSearchDebug.requestPayload, response: emotionSearchDebug.responseJson }, null, 2)}</pre>
		            </details>
		          {/if}
		          {#if developerMode && experienceSearchDebug}
		            <details class="memory-search-debug" open>
		              <summary>🧩 Experience Search</summary>
		              <div class="memory-search-grid">
		                <span>Query</span>
		                <strong>{experienceSearchDebug.query}</strong>
		                <span>Hit Count</span>
		                <strong>{experienceSearchDebug.hitCount}</strong>
		                <span>Top Relevance</span>
		                <strong>{experienceSearchDebug.topRelevance.toFixed(2)}</strong>
		                <span>Latency</span>
		                <strong>{experienceSearchDebug.elapsedMs}ms</strong>
		                <span>Experience IDs</span>
		                <strong>{experienceSearchDebug.experienceIds.join(', ') || '-'}</strong>
		              </div>
		              {#if experienceSearchDebug.error}
		                <p class="memory-search-error">{experienceSearchDebug.error}</p>
		              {/if}
		              <pre>{JSON.stringify({ request: experienceSearchDebug.requestPayload, response: experienceSearchDebug.responseJson, graph: experienceSearchDebug.graph }, null, 2)}</pre>
		            </details>
		          {/if}
	        </div>
        <div class="composer">
          <div class="proactive-controls" aria-label="自発会話と音声設定">
            <span class="runtime-state" data-state={runtimeSnapshot.state}>状態: {runtimeStateLabel}</span>
            <label>
              <input type="checkbox" checked={proactiveSettings.enabled} onchange={(event) => {
                proactiveSettings.enabled = event.currentTarget.checked;
                saveCurrentProactiveSettings();
              }} /> 自発会話
            </label>
            <label>待機 <input type="number" min="1" max="120" value={Math.round(proactiveSettings.idleDelayMs / 60_000)} onchange={(event) => {
              proactiveSettings.idleDelayMs = Math.max(1, event.currentTarget.valueAsNumber || 5) * 60_000;
              saveCurrentProactiveSettings();
            }} />分</label>
            <label>間隔 <input type="number" min="1" max="180" value={Math.round(proactiveSettings.cooldownMs / 60_000)} onchange={(event) => {
              proactiveSettings.cooldownMs = Math.max(1, event.currentTarget.valueAsNumber || 10) * 60_000;
              saveCurrentProactiveSettings();
            }} />分</label>
            <div class="voice-playback-mode" role="group" aria-label="音声再生モード">
              <button
                type="button"
                class:active={!proactiveSettings.autoPlayVoice}
                aria-pressed={!proactiveSettings.autoPlayVoice}
                onclick={() => setVoicePlaybackMode('manual')}
              >🔊 手動</button>
              <button
                type="button"
                class:active={proactiveSettings.autoPlayVoice}
                aria-pressed={proactiveSettings.autoPlayVoice}
                onclick={() => setVoicePlaybackMode('realtime')}
              >⚡ リアルタイム</button>
            </div>
            <button
              type="button"
              class="voice-effect-button"
              data-mode={voiceOutputEffectMode}
              aria-pressed={voiceOutputEffectMode !== 'off'}
              title={`${voiceOutputEffectPreset.description}。次の再生から反映されます`}
              onclick={cycleVoiceOutputEffect}
            >🤖 Android FX: {voiceOutputEffectPreset.label}</button>
            {#if runpodVoiceSelected}
              <button
                type="button"
                class="runpod-voice-button"
                class:active={runpodVoiceState === 'warm'}
                class:waiting={runpodVoiceState === 'waiting' || runpodVoiceState === 'warming'}
                class:error={runpodVoiceState === 'error'}
                disabled={!runpodVoiceConfigured}
                title={runpodVoiceConfigured ? runpodVoiceMessage : 'API設定でRunPod Voice Endpointを設定してください'}
                onclick={toggleRunpodVoiceSession}
              >
                ☁️ RunPod Voice: {lastRunpodVoiceBackend
                  ? runpodVoiceBackendLabel(lastRunpodVoiceBackend)
                  : runpodVoiceState === 'waiting' ? 'GPU待ち' : runpodVoiceState === 'warming' ? '起動中' : runpodVoiceState === 'warm' ? '準備完了（生成待ち）' : runpodVoiceState === 'error' ? '自動再試行' : 'OFF'}
              </button>
              {#if runpodVoiceState !== 'off'}
                <span class="runpod-voice-status" data-state={runpodVoiceState}>{runpodVoiceMessage}</span>
              {/if}
            {/if}
            <button type="button" class="speech-stop-button" onclick={stopSpeech} disabled={speechQueueSize === 0}>音声停止</button>
          </div>
          <section
            class="voice-workflow-panel"
            data-status={!voiceConfigLoaded ? 'loading' : voiceSavingMessageId ? 'saving' : panelVoiceDraftMessageId() ? 'draft' : voiceConfig ? 'locked' : 'unset'}
            aria-label="キャラクター音声の状態"
          >
            <div class="voice-workflow-heading">
              <strong>
                {#if !voiceConfigLoaded}VOICE: 確認中
                {:else if voiceSavingMessageId}VOICE: 保存中
                {:else if panelVoiceDraftMessageId()}VOICE: 調整中
                {:else if voiceConfig}VOICE: 確定済み
                {:else}VOICE: 未設定{/if}
              </strong>
              <span>{runpodVoiceSelected ? 'RUNPOD IRODORI v4' : 'LOCAL IRODORI v4-Small INT8'}</span>
            </div>
            <div class="daily-speed-control" role="group" aria-label="今日の話速だけを設定">
              <span>話速だけ</span>
              {#each [1, 1.1, 1.18, 1.25] as speed}
                <button
                  type="button"
                  class:active={speed === 1
                    ? !dailyVoiceDirection
                    : dailyVoiceDirection?.speedOnly === true && Math.abs((dailyVoiceDirection.speed ?? 1) - speed) < 0.001}
                  onclick={() => setDailyVoiceSpeed(speed)}
                >{speed === 1 ? '標準' : `${speed.toFixed(2)}x`}</button>
              {/each}
            </div>
            {#if dailyVoiceDirection}
              <p class="daily-voice-status">☀️ {dailyVoiceDirection.summary}（本日中・基本声は変更しません）</p>
              <button type="button" class="voice-reset-button" onclick={() => clearDailyVoiceDirection()}>
                今日だけの話し方を解除
              </button>
            {/if}
            {#if !voiceConfigLoaded}
              <p>キャラクターの音声設定を確認しています。</p>
            {:else if panelVoiceDraftMessageId()}
              <p>{voiceConfig ? voiceWorkflowMessage : '保存前の音声候補を復元しました。気に入っていた声なら、下のボタンで基本声に戻せます。'}</p>
            {:else if !voiceConfig}
              <p>声はまだ決めていません。会話で「明るいギャル声で話して」などと頼み、返信を再生して候補を作れます。</p>
            {:else if voiceWorkflowMessage}
              <p>{voiceWorkflowMessage}</p>
            {:else if voiceConfig}
              <p>基本声は保存済みです。会話で別の声を試しても、決定するまでは現在の基本声を変更しません。</p>
            {/if}
            <div class="voice-workflow-actions">
              <button
                type="button"
                class="image-voice-designer-button"
                onclick={openImageVoiceDesigner}
                title="キャラクター画像から声を提案し、調整・試聴します。保存するまで現在の基本声は変わりません"
              >🖼️ 画像から声を調整</button>
              {#if panelVoiceDraftMessageId()}
                {@const panelDraftId = panelVoiceDraftMessageId()}
                {@const draftVoiceMessage = messages.find((message) => message.id === panelDraftId)}
                {#if draftVoiceMessage}
                  <button
                    type="button"
                    class="voice-adopt-button"
                    disabled={!voiceUrlByMessageId[panelDraftId] || Boolean(voiceSavingMessageId)}
                    onclick={() => void adoptMessageVoice(draftVoiceMessage)}
                    title={voiceUrlByMessageId[panelDraftId]
                      ? '現在の候補をローカル保存し、キャラクターの基本声に設定します'
                      : '候補音声の生成完了を待っています'}
                  >
                    {voiceSavingMessageId === panelDraftId ? '⏳ 基本声として保存中…' : '💾 この声を基本声にする'}
                  </button>
                {/if}
              {/if}
              {#if voiceConfig}
                <button type="button" class="voice-reset-button" disabled={voiceResetting} onclick={() => void resetCharacterVoice()}>
                  {voiceResetting ? '解除中…' : '声を未設定にして決め直す'}
                </button>
              {/if}
            </div>
          </section>
          {#if developerMode}
            <div class="avatar-state-debug" aria-label="AITuber Avatar State Debug">
              <strong>AITUBER PHASE 1</strong>
              <span>renderer: {avatarRenderer}</span>
              <span>speaking: {avatarState.speaking ? 'true' : 'false'}</span>
              <span>mouthLevel: {avatarState.mouthLevel.toFixed(3)}</span>
              <span>emotion: {avatarState.emotion}</span>
              <span>thinking: {avatarState.thinking ? 'true' : 'false'}</span>
              <i><b style={`width:${Math.round(avatarState.mouthLevel * 100)}%`}></b></i>
            </div>
            <div class="comment-queue-debug" aria-label="Comment Queue Debug">
              <strong>COMMENT QUEUE</strong>
              <span>pending: {commentQueueSize}</span>
              <input type="text" bind:value={commentDebugName} placeholder="名前" class="comment-debug-name" />
              <input
                type="text"
                bind:value={commentDebugText}
                placeholder="視聴者コメントを投入..."
                class="comment-debug-text"
                onkeydown={(event) => {
                  if (event.key === 'Enter') pushDebugComment();
                }}
              />
              <button type="button" onclick={pushDebugComment} disabled={!commentDebugText.trim()}>投入</button>
            </div>
            <div class="comment-queue-debug" aria-label="YouTube Comment Source">
              <strong>YT LIVE</strong>
              <span class:comment-yt-running={youtubeCommentRunning}>{youtubeCommentRunning ? '● 接続中' : '○ 未接続'}</span>
              <input
                type="text"
                bind:value={youtubeCommentLiveId}
                placeholder="Live ID (動画ID)"
                class="comment-debug-liveid"
                disabled={youtubeCommentRunning}
              />
              <input
                type="password"
                bind:value={youtubeCommentApiKey}
                placeholder="YouTube Data APIキー"
                class="comment-debug-text"
                disabled={youtubeCommentRunning}
              />
              {#if youtubeCommentRunning}
                <button type="button" onclick={stopYoutubeComments}>切断</button>
              {:else}
                <button
                  type="button"
                  onclick={startYoutubeComments}
                  disabled={!youtubeCommentLiveId.trim() || !youtubeCommentApiKey.trim()}
                >接続</button>
              {/if}
              {#if youtubeCommentError}<span class="comment-debug-error">{youtubeCommentError}</span>{/if}
            </div>
          {/if}
          <div class="chat-mode-toggle" role="group" aria-label="チャットモード切替">
            <button
              type="button"
              class:active={interactionMode === 'conversation'}
              onclick={() => (interactionMode = 'conversation')}
            >💬 会話</button>
            <button
              type="button"
              class:active={interactionMode === 'observation'}
              onclick={() => (interactionMode = 'observation')}
            >🧠 観察</button>
            {#if interactionMode === 'observation'}
              <span class="observation-note">{character.name}は発言せず、考えを観察しています</span>
            {/if}
          </div>
          <div class="composer-row">
            <textarea
              bind:value={inputText}
              rows="3"
              placeholder={interactionMode === 'observation' ? `◢ OBSERVE ${character.name.toUpperCase()}'S MIND...` : `◢ TALK TO ${character.name.toUpperCase()}...`}
              onkeydown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void sendMessage();
              }}
            ></textarea>
            <div class="composer-actions">
              <label class="attach-button" ondragover={(event) => event.preventDefault()} ondrop={onDropStoryFiles}>
                📎メディア/YAML ({attachImages.length}/{MAX_REFERENCE_IMAGES})
                <input type="file" accept="image/*,.yaml,.yml" multiple onchange={onUploadStoryFiles} hidden />
              </label>
              <button
                onclick={sendMessage}
                disabled={sending || (!inputText.trim() && attachImages.length === 0 && !attachYaml?.text)}
              >送信</button>
            </div>
          </div>
		  <div class="animation-production-flow" aria-label="動画制作フロー">
			<span>Animation Project</span><i>↓</i><span>Animation Sheet</span><i>↓</i><span>Generated Video</span>
		  </div>
          <label class="preserve-timeline-toggle">
            <input type="checkbox" bind:checked={preserveAnimationSheetTimeline} />
            <span>Preserve Timeline Mode: {preserveAnimationSheetTimeline ? 'ON' : 'OFF'}</span>
            <small>ONの場合、SCENE番号とタイムコードを厳守し、代表シーンへの要約を禁止します。</small>
          </label>
          <!-- 📎 添付済み（入力欄の下のみ／サイドバーには出さない・送信でクリア） -->
          {#if attachImages.length > 0 || attachYaml?.text}
            <div class="attached-review">
              <div class="attached-review-head">
                <span class="attached-label">送信前の添付確認 {attachImages.length}/{MAX_REFERENCE_IMAGES}</span>
                <button class="attached-clear" type="button" onclick={clearAttachQueue}>すべて外す</button>
              </div>
              {#if attachImages.length > 0}
                <div class="attached-grid">
                  {#each attachImages as image, index (image.name + index)}
                    <div class="attached-card">
                      <div class="attached-order">#{index + 1}</div>
                      <img class="attached-thumb" src={image.dataUrl} alt={`添付画像 ${index + 1}: ${image.name}`} />
                      <div class="attached-info">
                        <div class="attached-name" title={image.name}>{image.name}</div>
                        <div class="attached-meta">{image.mime || 'image'} / {Math.round(image.dataUrl.length / 1024)}KB</div>
                      </div>
                      <button
                        class="attached-remove"
                        type="button"
                        title="この画像を外す"
                        onclick={() => removeAttachImage(index)}
                      >
                        外す
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
              {#if attachYaml?.name}
                <div class="attached-yaml">
                  <span class="attached-order">YAML</span>
                  <span class="attached-name" title={attachYaml.name}>{attachYaml.name}</span>
                  <button class="attached-remove" type="button" onclick={clearAttachYaml}>外す</button>
                </div>
              {/if}
            </div>
          {/if}
          {#if storyUploadError}<div class="attached-warn">⚠ {storyUploadError}</div>{/if}
          {#if pendingIntentConfirmation}
            <div class="intent-confirm">
              <strong>意図を確認させてください</strong>
              <p>{pendingIntentConfirmation.decision.reason}</p>
              <small>intent: {pendingIntentConfirmation.decision.intent} / confidence: {Math.round(pendingIntentConfirmation.decision.confidence * 100)}%</small>
              <div>
                <button type="button" onclick={confirmPendingIntent}>{confirmIntentLabel(pendingIntentConfirmation.decision.intent)}</button>
                <button type="button" onclick={rejectPendingIntentAsChat}>通常会話として送る</button>
              </div>
            </div>
          {/if}
        </div>
      </section>

      <aside class="memory-panel">
        {#if broadcastMode && character && imageDataUrl}
          <div class="stage-slot">
            {#key character.id}
            <AITuberStage
              src={imageDataUrl}
              alt={character.name}
              speaking={avatarState.speaking}
              mouthLevel={avatarState.mouthLevel}
              emotion={avatarState.emotion}
              thinking={avatarState.thinking}
              modelKey={character.id}
            />
            {/key}
          </div>
        {/if}
        <section class="studio-library" aria-label="ライブラリ">
          <div class="library-title"><span>📚</span><h2>ライブラリ</h2></div>
          <p class="library-note">制作データは保存したまま、必要なときだけ開きます。</p>

          <details open>
            <summary>🎭 キャラクター <span>{characters.length}</span></summary>
            <div class="library-list">
              {#each characters as item (item.id)}
                <button class:active={item.id === selectedId} onclick={() => selectCharacter(item.id)}>{item.name}</button>
              {/each}
            </div>
          </details>
          <details>
            <summary>🖼️ 画像 <span>{$visualMemory.length}</span></summary>
            {#if $visualMemory.length > 0}
              <div class="library-image-list">
                {#each $visualMemory.slice(0, 12) as item (item.id)}
                  <img src={item.thumbnail} alt={item.title} title={item.title} />
                {/each}
              </div>
            {/if}
          </details>
          <details>
            <summary>📖 漫画 <span>0</span></summary>
            <p>漫画制作はチャットから依頼できます。</p>
          </details>
		  <details open>
			<summary>🎬 Animation Project <span>{animationProjectMessages().length}</span></summary>
			{#if animationProjectMessages().length > 0}
			  <div class="animation-project-list">
				{#each [...animationProjectMessages()].reverse() as project (project.id)}
				  <article class="animation-project-card">
					<h3>{animationProjectTitle(project)}</h3>
					<div class="animation-project-hierarchy">
					  <span><b>Animation Sheet</b>{animationSheetCount(project)}枚</span>
					  <span><b>Scene Timeline</b>{sceneTimelineCount(project)} scenes</span>
					  <span><b>Generated Video</b>{generatedVideoByMessageId[project.id] ? '生成済み' : '未生成'}</span>
					</div>
					<dl>
					  <div><dt>キャラクター</dt><dd>{project.videoPackage?.character_name || character.name}</dd></div>
					  <div><dt>秒数</dt><dd>{animationProjectDuration(project) ?? '—'}{animationProjectDuration(project) ? '秒' : ''}</dd></div>
					  <div><dt>アニメシート</dt><dd>{animationSheetCount(project)}枚</dd></div>
					  <div><dt>動画AI</dt><dd>{animationProjectVideoAI(project)}</dd></div>
					</dl>
					{#if generatedVideoByMessageId[project.id]}
					  <h4>Generated Video</h4>
					  <video controls src={generatedVideoByMessageId[project.id]}>
						<track kind="captions" srclang="ja" label="Preview" src="/generated-video-captions.vtt" />
					  </video>
					{/if}
				  </article>
				{/each}
			  </div>
			{:else}
			  <p>アニメシートまたは参照画像から動画を作ると、ここに保存されます。</p>
			{/if}
		  </details>
          <details>
            <summary>🎭 モーション <span>{animationProjectMessages().length}</span></summary>
            <p>Motion PromptはScene Timelineから自動生成されます。</p>
          </details>
          <details>
            <summary>🧠 記憶 <span>{memory.personality.length + memory.speechStyle.length + memory.likes.length + memory.dislikes.length}</span></summary>
            <div class="library-memory-actions">
              <button onclick={updateMemoryFromHistory} disabled={analyzing || messages.length === 0}>{analyzing ? '更新中...' : '会話から更新'}</button>
              <button onclick={() => saveMemory()} disabled={savingMemory}>{savingMemory ? '保存中...' : '保存'}</button>
            </div>
            <div class="memory-debug">
              <p><strong>記憶状態</strong> {updatedAt ? `最終保存: ${new Date(updatedAt).toLocaleString('ja-JP')}` : '未保存の変更はありません。'}</p>
              <p><strong>会話履歴</strong> {messages.length}件 / <strong>成長ログ</strong> {growthHistory.length}件</p>
              {#if currentEmotion}<p><strong>感情</strong> {currentEmotion.icon} {currentEmotion.label} — {currentEmotion.tone}</p>{/if}
              {#if brainLayers}<p><strong>デバッグ</strong> theme: {brainLayers.theme} / energy: {brainLayers.energy}% / state: {brainLayers.activityState}</p>{/if}
              {#if growthHistory.length > 0}
                <div class="memory-log">
                  <strong>記憶更新ログ</strong>
                  {#each growthHistory.slice(0, 5) as item (item.id)}
                    <span>{item.time} · {item.message}</span>
                  {/each}
                </div>
              {/if}
            </div>
          </details>
          <details class="advanced-studio-settings">
            <summary>🛠️ Advanced Studio Settings</summary>
            <p class="advanced-studio-note">開発者向けのAIロール設定です。変更後は保存してください。</p>
            <div class="advanced-studio-fields">
              <label>Conversation AI<select bind:value={aiProfile.conversationAI}>{#each ROLE_AI_OPTIONS as option}<option value={option}>{option === 'INHERIT' ? `Brain AIを継承 (${aiProfile.brainAI})` : option}</option>{/each}</select></label>
              <label>StoryCard AI<select bind:value={aiProfile.storyCardAI}>{#each ROLE_AI_OPTIONS as option}<option value={option}>{option === 'INHERIT' ? `Brain AIを継承 (${aiProfile.brainAI})` : option}</option>{/each}</select></label>
              <label>MotionPrompt AI<select bind:value={aiProfile.motionPromptAI}>{#each ROLE_AI_OPTIONS as option}<option value={option}>{option === 'INHERIT' ? `Brain AIを継承 (${aiProfile.brainAI})` : option}</option>{/each}</select></label>
              <label>Character Analysis AI<select bind:value={aiProfile.characterAnalysisAI}>{#each ROLE_AI_OPTIONS as option}<option value={option}>{option === 'INHERIT' ? `Brain AIを継承 (${aiProfile.brainAI})` : option}</option>{/each}</select></label>
              <label>Intent Router AI<select bind:value={aiProfile.intentRouterAI}>{#each ROLE_AI_OPTIONS as option}<option value={option}>{option === 'INHERIT' ? `Brain AIを継承 (${aiProfile.brainAI})` : option}</option>{/each}</select></label>
              <label>🎥 Video AI<select bind:value={aiProfile.videoAI}>{#each VIDEO_AI_SELECT_OPTIONS as option}<option value={option.id}>{option.label}</option>{/each}</select></label>
              {#if selectedVideoAiHelp}<p class="advanced-studio-help">{selectedVideoAiHelp}</p>{/if}
              <button type="button" onclick={saveAiProfile} disabled={savingAiProfile}>{savingAiProfile ? '保存中...' : '保存'}</button>
              {#if aiProfileSaveNote}<p class="advanced-studio-help">{aiProfileSaveNote}</p>{/if}
            </div>
          </details>
        </section>

        <div class="memory-header">
          <div>
            <p class="panel-label">PROJECT ASSETS</p>
          </div>
        </div>
		{#if animationProjectMessages().length > 0}
		  {@const assetMessage = animationProjectMessages().at(-1)!}
		  <div class="asset-library-label">🎬 Animation Project</div>
		  <div class="project-asset-summary">
			<strong>{animationProjectTitle(assetMessage)}</strong>
			<span>{assetMessage.videoPackage?.character_name || character.name}</span>
			<span>{animationProjectDuration(assetMessage) ?? '—'}秒 · {animationSheetCount(assetMessage)}枚 · {animationProjectVideoAI(assetMessage)}</span>
		  </div>
          <div class="asset-library-label">📁 Animation Assets</div>
            {#if videoPackageByMessageId[assetMessage.id]}
              <pre class="animation-yaml">{videoPackageByMessageId[assetMessage.id]}</pre>
            {/if}
        {:else}
          <p class="hint">まだ派生元になるAIメッセージはありません。</p>
        {/if}
        <section class="visual-memory-library" aria-label="Visual Memory Browser">
          <div class="visual-memory-browser-head">
            <div>
              <p class="panel-label">CHARACTER</p>
              <div class="asset-library-label">└ Visual Memory</div>
            </div>
            <div class="visual-memory-browser-actions">
              <span class="visual-memory-count">{characterVisualMemory.referenceImages.length} images</span>
	              <button type="button" class="shiro-memory-button" onclick={openShiroVisualMemory}>シロの記憶を見る</button>
	              <button type="button" onclick={buildVisualMemoryFromRegisteredImages} disabled={buildingRegisteredVisualMemory || characterVisualMemory.referenceImages.length === 0}>
	                {buildingRegisteredVisualMemory ? 'Gemini解析中…' : 'Visual Memory Builder'}
	              </button>
	              <button type="button" class="delete-reference" onclick={clearVisualReferences} disabled={savingVisualMemory || characterVisualMemory.referenceImages.length === 0}>
	                全クリア
	              </button>
	            </div>
          </div>
          <div class="critical-features-panel">
            <strong>Critical Features</strong>
            {#if characterVisualMemory.criticalFeatures.length > 0}
              <div>{#each characterVisualMemory.criticalFeatures as feature}<span>{feature}</span>{/each}</div>
            {:else}
              <small>未登録</small>
            {/if}
          </div>
          <div class="visual-memory-upload">
            <label>
              <span>タイトル</span>
              <input bind:value={visualMemoryReferenceTitle} maxlength="300" placeholder="例: 正面・全身設定" />
            </label>
            <label>
              <span>カテゴリ</span>
              <select bind:value={visualMemoryReferenceCategory}>
                {#each VISUAL_MEMORY_REFERENCE_CATEGORIES as category}
                  <option value={category}>{category}</option>
                {/each}
              </select>
            </label>
            <label class="visual-memory-tags-input">
              <span>タグ（カンマ区切り）</span>
              <input bind:value={visualMemoryReferenceTags} placeholder="front, armor, detail" />
            </label>
            <label class="visual-memory-file-button">
              {uploadingVisualMemoryReferences ? '登録中…' : '＋ 画像を登録'}
              <input type="file" accept="image/*" multiple disabled={uploadingVisualMemoryReferences} onchange={uploadVisualMemoryReferences} />
            </label>
          </div>
          {#if characterVisualMemory.referenceImages.length > 0}
            <div class="visual-memory-browser-grid">
              {#each visualMemoryBrowserImages() as reference (reference.id)}
                <article class="visual-memory-reference-card" class:official={reference.official}>
                  <div class="visual-memory-image-wrap">
                    <button class="visual-memory-thumbnail-button" type="button" onclick={() => expandedVisualMemoryReference = reference} aria-label={`${reference.fileName}を拡大表示`}>
                      <img class="visual-memory-reference-thumbnail" src={reference.url} alt={reference.fileName} />
                    </button>
                    {#if reference.official}<span class="official-reference-badge">⭐ Official Reference</span>{/if}
                    {#if reference.critical}<span class="critical-reference-badge">CRITICAL</span>{/if}
                  </div>
                  <div class="visual-memory-reference-details">
                    <strong class="visual-memory-reference-title" title={reference.title}>{reference.title}</strong>
                    <small title={reference.fileName}>{reference.fileName}</small>
                    <span class="visual-memory-category">{reference.category}</span>
                    <time datetime={reference.createdAt}>{new Date(reference.createdAt).toLocaleString('ja-JP')}</time>
                    <div class="visual-memory-tag-list">
                      {#each reference.tags as tag}<span>#{tag}</span>{/each}
                      {#if reference.tags.length === 0}<span class="tag-empty">タグなし</span>{/if}
                    </div>
                    <div class="visual-memory-important-features">
                      <b>importantFeatures</b>
                      {#each reference.importantFeatures as feature}<span>{feature}</span>{/each}
                      {#if reference.importantFeatures.length === 0}<span class="tag-empty">未設定</span>{/if}
                    </div>
                  </div>
                  <div class="visual-memory-reference-actions">
                    <button type="button" class:critical-active={reference.critical} onclick={() => toggleCriticalVisualReference(reference.id)} disabled={savingVisualMemory}>
                      critical={String(reference.critical)}
                    </button>
                    <button type="button" class:active={reference.official} onclick={() => toggleOfficialVisualReference(reference.id)} disabled={savingVisualMemory}>
                      {reference.official ? '★ Official解除' : '☆ Official設定'}
                    </button>
                    <button type="button" class="delete-reference" onclick={() => deleteVisualReference(reference)} disabled={savingVisualMemory}>削除</button>
                  </div>
                </article>
              {/each}
            </div>
          {:else}
            <p class="visual-memory-empty">このキャラクターのVisual Memory画像はまだありません。</p>
          {/if}
        </section>
        <div class="memory-header">
          <div>
            <p class="panel-label">CHARACTER MEMORY</p>
            <h2>成長パラメータ</h2>
          </div>
          <button onclick={updateMemoryFromHistory} disabled={analyzing || messages.length === 0}>
            {analyzing ? '解析中...' : '履歴から更新'}
          </button>
        </div>

        <section class="character-visual-memory">
          <div class="visual-memory-section-head">
            <div>
              <p class="panel-label">VISUAL MEMORY</p>
              <p class="visual-memory-caption">外観・装備・モーションの共通制作コンテキスト</p>
            </div>
            {#if !editingVisualMemory}
              <button type="button" onclick={beginVisualMemoryEdit}>手動編集</button>
            {/if}
          </div>
          <details open={editingVisualMemory}>
            <summary>Visual Memoryを{editingVisualMemory ? '編集' : '表示'}</summary>
            {#if editingVisualMemory}
              <div class="visual-memory-form">
                <fieldset>
                  <legend>Appearance</legend>
                  <label><span>Character Name</span><input bind:value={visualMemoryDraft.characterName} placeholder="キャラクター名" /></label>
                  <label><span>Hair</span><input bind:value={visualMemoryDraft.appearance.hair} placeholder="髪型・髪色" /></label>
                  <label><span>Face</span><input bind:value={visualMemoryDraft.appearance.face} placeholder="顔・顔パーツ" /></label>
                  <label><span>Eyes</span><input bind:value={visualMemoryDraft.appearance.eyes} placeholder="瞳" /></label>
                  <label><span>Body</span><input bind:value={visualMemoryDraft.appearance.body} placeholder="身体・内部構造" /></label>
                  <label><span>Outfit</span><input bind:value={visualMemoryDraft.appearance.outfit} placeholder="衣装" /></label>
                  <label><span>Armor</span><input bind:value={visualMemoryDraft.appearance.armor} placeholder="装甲・衣装" /></label>
                  <label><span>Color Palette（改行区切り）</span><textarea value={visualMemoryDraft.appearance.colorPalette.join('\n')} oninput={(event) => { visualMemoryDraft.appearance.colorPalette = splitVisualMemoryList(event.currentTarget.value); }}></textarea></label>
                </fieldset>
                <fieldset>
                  <legend>Equipment</legend>
                  <label><span>Head Unit</span><input bind:value={visualMemoryDraft.equipment.headUnit} /></label>
                  <label><span>Ear Unit</span><input bind:value={visualMemoryDraft.equipment.earUnit} /></label>
                  <label><span>Tail Unit</span><input bind:value={visualMemoryDraft.equipment.tailUnit} /></label>
                  <label><span>Connection Port</span><input bind:value={visualMemoryDraft.equipment.connectionPort} /></label>
                  <label><span>Mechanical Parts（改行区切り）</span><textarea value={visualMemoryDraft.equipment.mechanicalParts.join('\n')} oninput={(event) => { visualMemoryDraft.equipment.mechanicalParts = splitVisualMemoryList(event.currentTarget.value); }}></textarea></label>
                  <label><span>Accessories（改行区切り）</span><textarea value={visualMemoryDraft.equipment.accessories.join('\n')} oninput={(event) => { visualMemoryDraft.equipment.accessories = splitVisualMemoryList(event.currentTarget.value); }}></textarea></label>
                </fieldset>
                <fieldset>
                  <legend>Motion</legend>
                  <label><span>Walking</span><textarea bind:value={visualMemoryDraft.motion.walking}></textarea></label>
                  <label><span>Tail Motion</span><textarea bind:value={visualMemoryDraft.motion.tailMotion}></textarea></label>
                  <label><span>Ear Motion</span><textarea bind:value={visualMemoryDraft.motion.earMotion}></textarea></label>
                </fieldset>
                <fieldset>
                  <legend>Rules</legend>
                  <label><span>Critical Features（改行区切り）</span><textarea value={visualMemoryDraft.criticalFeatures.join('\n')} oninput={(event) => { visualMemoryDraft.criticalFeatures = splitVisualMemoryList(event.currentTarget.value); }}></textarea></label>
                  <label><span>Must Keep（改行区切り）</span><textarea value={visualMemoryDraft.rules.mustKeep.join('\n')} oninput={(event) => { visualMemoryDraft.rules.mustKeep = splitVisualMemoryList(event.currentTarget.value); }}></textarea></label>
                  <label><span>Avoid（改行区切り）</span><textarea value={visualMemoryDraft.rules.avoid.join('\n')} oninput={(event) => { visualMemoryDraft.rules.avoid = splitVisualMemoryList(event.currentTarget.value); }}></textarea></label>
                  <label><span>References（画像IDまたはURL・改行区切り）</span><textarea value={visualMemoryDraft.references.join('\n')} oninput={(event) => { visualMemoryDraft.references = splitVisualMemoryList(event.currentTarget.value); }}></textarea></label>
                </fieldset>
                <div class="visual-memory-actions">
                  {#if character.id === 'shiro'}<button type="button" onclick={applyShiroVisualMemoryPreset}>シロ初期値を入力</button>{/if}
                  <button type="button" onclick={cancelVisualMemoryEdit} disabled={savingVisualMemory}>キャンセル</button>
                  <button class="visual-memory-save" type="button" onclick={saveVisualMemoryFields} disabled={savingVisualMemory}>{savingVisualMemory ? '保存中...' : '保存'}</button>
                </div>
              </div>
            {:else}
              <div class="visual-memory-readonly">
                <div><strong>Critical Features</strong><p>{characterVisualMemory.criticalFeatures.join(' / ') || '未登録'}</p></div>
                <div><strong>Character</strong><p>{characterVisualMemory.characterName || character.name}</p></div>
                <div><strong>Appearance</strong><p>{[characterVisualMemory.appearance.hair, characterVisualMemory.appearance.face, characterVisualMemory.appearance.eyes, characterVisualMemory.appearance.body, characterVisualMemory.appearance.outfit, characterVisualMemory.appearance.armor, ...characterVisualMemory.appearance.colorPalette].filter(Boolean).join(' / ') || '未登録'}</p></div>
                <div><strong>Equipment</strong><p>{[characterVisualMemory.equipment.headUnit, characterVisualMemory.equipment.earUnit, characterVisualMemory.equipment.tailUnit, characterVisualMemory.equipment.connectionPort, ...characterVisualMemory.equipment.mechanicalParts, ...characterVisualMemory.equipment.accessories].filter(Boolean).join(' / ') || '未登録'}</p></div>
                <div><strong>Motion</strong><p>{[characterVisualMemory.motion.walking, characterVisualMemory.motion.tailMotion, characterVisualMemory.motion.earMotion].filter(Boolean).join(' / ') || '未登録'}</p></div>
                <div><strong>Must Keep</strong><p>{characterVisualMemory.rules.mustKeep.join(' / ') || '未登録'}</p></div>
                <div><strong>Avoid</strong><p>{characterVisualMemory.rules.avoid.join(' / ') || '未登録'}</p></div>
                <div><strong>References</strong><p>{characterVisualMemory.references.join(' / ') || '未登録'}</p></div>
              </div>
            {/if}
            {#if visualMemoryMessage}<p class="visual-memory-message" role="status">{visualMemoryMessage}</p>{/if}
          </details>
        </section>

		        {#if developerMode}
		          <section class="brain-protection-panel">
		            <div class="brain-protection-head">
		              <h3>☀ Routine</h3>
		              <button type="button" onclick={() => updateRoutineState(routineBrain.currentState, 'Manual routine refresh')}>Log</button>
		            </div>
		            <div class="brain-health-grid">
		              <span>Current State</span><strong>{routineBrain.currentState}</strong>
		              <span>Last Sleep</span><strong>{routineBrain.lastSleepTime ?? '-'}</strong>
		              <span>Today Summary</span><strong>{routineBrain.todaySummary || '-'}</strong>
		              <span>Today Goal</span><strong>{routineBrain.todayGoal || '-'}</strong>
		            </div>
		            {#if routineDebug?.error}<p class="brain-protection-message">{routineDebug.error}</p>{/if}
		            <details class="brain-backups">
		              <summary>Routine Log <span>{routineBrain.log.length}</span></summary>
		              <pre>{JSON.stringify({ routine: routineBrain, debug: routineDebug }, null, 2)}</pre>
		            </details>
		          </section>
		          <section class="brain-protection-panel">
		            <div class="brain-protection-head">
		              <h3>🧩 Experience</h3>
		              <span>{experiences.length}</span>
		            </div>
		            <details class="brain-backups" open>
		              <summary>Experience Timeline <span>{experiences.length}</span></summary>
		              {#if experiences.length > 0}
		                <div class="brain-backup-list">
		                  {#each experiences.slice(-8).reverse() as experience, index (experience.id)}
		                    <article class="brain-backup-row">
		                      <div>
		                        <strong>Experience #{experiences.length - index}</strong>
		                        <small>{new Date(experience.createdAt).toLocaleDateString('ja-JP')} / importance {experience.importance.toFixed(2)}</small>
		                        <small>{experience.summary}</small>
		                      </div>
		                    </article>
		                  {/each}
		                </div>
		              {:else}
		                <p class="brain-protection-message">No experiences yet.</p>
		              {/if}
		            </details>
		            <details class="brain-backups">
		              <summary>Graph JSON</summary>
		              <pre>{JSON.stringify({
		                Memory: experiences.flatMap((experience) => experience.memoryIds),
		                Relationship: experiences.flatMap((experience) => experience.relationshipIds),
		                Emotion: experiences.flatMap((experience) => experience.emotionIds),
		                Routine: experiences.map((experience) => experience.routineId).filter(Boolean),
		                Experience: experiences.map((experience) => experience.id),
		                latestSearchGraph: experienceGraph,
		              }, null, 2)}</pre>
		            </details>
		          </section>
		          <section class="brain-protection-panel">
	            <div class="brain-protection-head">
	              <h3>🧠 Brain</h3>
	              <button type="button" onclick={loadBrainProtection} disabled={brainProtectionLoading}>
	                {brainProtectionLoading ? 'Loading...' : 'Refresh'}
	              </button>
	            </div>
	            {#if brainHealth}
	              <div class="brain-health-grid">
	                <span>Brain</span><strong>{brainHealth.brain}</strong>
	                <span>Records</span><strong>{brainHealth.records}</strong>
	                <span>Current File</span><strong>{brainHealth.currentFile}</strong>
	                <span>Backup Count</span><strong>{brainHealth.backupCount}</strong>
	                <span>Last Backup</span><strong>{brainHealth.lastBackup?.filename ?? '-'}</strong>
	                <span>Status</span><strong class:healthy={brainHealth.status === 'Healthy'} class:warning={brainHealth.status === 'Warning'} class:corrupted={brainHealth.status === 'Corrupted'}>{brainHealth.status}</strong>
	              </div>
	              {#if brainHealth.message}<p class="brain-protection-message">{brainHealth.message}</p>{/if}
	            {:else}
	              <p class="brain-protection-message">Brain Health is not loaded.</p>
	            {/if}
	            {#if brainProtectionMessage}<p class="brain-protection-message">{brainProtectionMessage}</p>{/if}
	            <details class="brain-backups" open={brainHealth?.status === 'Corrupted'}>
	              <summary>Backup <span>{brainBackups.length}</span></summary>
	              {#if brainBackups.length > 0}
	                <div class="brain-backup-list">
	                  {#each brainBackups.slice(0, 8) as backup (backup.filename)}
	                    <article class="brain-backup-row">
	                      <div>
	                        <strong>{backup.filename}</strong>
	                        <small>{new Date(backup.createdAt).toLocaleString('ja-JP')} / {Math.round(backup.size / 1024)}KB</small>
	                      </div>
	                      <button type="button" onclick={() => restoreBrainBackup(backup.filename)} disabled={brainProtectionLoading}>Restore</button>
	                    </article>
	                  {/each}
	                </div>
	              {:else}
	                <p class="brain-protection-message">No backups yet.</p>
	              {/if}
	            </details>
	          </section>
	        {/if}

	        <section class="memory-v2-panel">
          <h3>🧠 人格 <small>手動編集のみ</small></h3>
          <p>種族: {memoryV2.persona.species || '未設定'} / 関係性: {memoryV2.persona.relationship || '未設定'}</p>
          <p>性格: {memoryV2.persona.personality.join('、') || '未設定'}</p>
          <p>口調: {memoryV2.persona.speechStyle.join('、') || '未設定'}</p>
          <h3>🧠 長期記憶 <small>importance ≥ 70</small></h3>
          {#each memoryV2.longTermMemory.slice(-8).reverse() as item (item.id)}<p class="memory-v2-item">[{item.source}] {item.content} <b>{item.importance}</b></p>{/each}
          <h3>🧠 短期記憶 <small>3〜7日</small></h3>
          {#each memoryV2.shortTermMemory.slice(-8).reverse() as item (item.id)}<p class="memory-v2-item">[{item.source}] {item.content}</p>{/each}
        </section>

        <!-- 🧠 Growth System V5: SVGレーダーチャート（外部ライブラリ不使用・growthValuesに追従） -->
        <section class="growth-system">
          <p class="growth-title">🧠 Growth System</p>
          <svg class="radar" viewBox={`0 0 ${radar.size} ${radar.size}`} role="img" aria-label="成長パラメータのレーダーチャート">
            {#each radar.rings as ring (ring.level)}
              <polygon class="radar-ring" points={ring.points} />
            {/each}
            {#each radar.axes as axis (axis.key)}
              <line class="radar-spoke" x1={radar.center.x} y1={radar.center.y} x2={axis.axisEnd.x} y2={axis.axisEnd.y} />
            {/each}
            {#each radar.scaleTicks as tick (tick.level)}
              <text class="radar-scale" x={tick.point.x - 6} y={tick.point.y} text-anchor="end" dominant-baseline="middle">{tick.level}</text>
            {/each}
            <polygon class="radar-area" points={radar.valuePoints} />
            {#each radar.axes as axis (axis.key)}
              <circle class="radar-dot" cx={axis.valuePoint.x} cy={axis.valuePoint.y} r="3.4" />
            {/each}
            {#each radar.axes as axis (axis.key)}
              <text class="radar-label" x={axis.labelPos.x} y={axis.labelPos.y} text-anchor="middle">{axis.icon} {axis.label}</text>
              <text class="radar-val" x={axis.labelPos.x} y={axis.labelPos.y + 19} text-anchor="middle">{axis.value}</text>
            {/each}
          </svg>

          {#if recentChange.length > 0}
            <!-- V7: 今回の変化（レーダー下・3秒で自動消去） -->
            <div class="recent-change">
              <p class="recent-change-title">📈 今回の変化</p>
              <div class="recent-change-list">
                {#each recentChange as change (change.key)}
                  <span class="recent-change-item">{change.icon} {change.label} {change.amount > 0 ? '+' : ''}{change.amount}</span>
                {/each}
              </div>
            </div>
          {/if}
        </section>

        <!-- V4: Personality Type（Growthの下に表示。数値変更・Memory保存なし） -->
        <section class="ai-type">
          <p class="ai-type-label">AI TYPE</p>
          <div class="ai-type-main">
            <span class="ai-type-icon">{personalityType.icon}</span>
            <span class="ai-type-name">{personalityType.name}</span>
            <span class="ai-type-sub">{personalityType.subtitle}</span>
          </div>
          <p class="ai-type-desc">説明：{personalityType.description}</p>
        </section>

        <!-- 🧠 Character Brain V2: 会話の流れを引き継ぐ継続思考の擬似思考レイヤー。 -->
        <!-- ルールベースのみ（AI推論なし）。送信後 0.2〜0.7秒で上から順にフェード表示。 -->
        <section class="resident-status">
          <p class="brain-title">住人ステータス</p>
          <div class="resident-status-row"><strong>🔋 Battery</strong><span>{brainLayers?.energy ?? 70}%</span></div>
          <div class="energy-bar"><div class="energy-fill" style={`width:${brainLayers?.energy ?? 70}%`}></div></div>
          <div class="resident-status-row"><strong>🧠 Mind State</strong><span>{brainLayers?.activityState || '雑談'}</span></div>
          <div class="resident-status-row"><strong>💜 Emotion</strong><span>{currentEmotion ? `${currentEmotion.icon} ${currentEmotion.label}` : '穏やか'}</span></div>
          <div class="resident-status-row"><strong>📈 Growth</strong><span>{growthHistory.length}件の履歴</span></div>
          <div class="resident-interest"><strong>💭 最近の関心</strong><span>{brainLayers?.association || brainLayers?.selfComment || '会話を通して新しい関心を見つけています。'}</span></div>
        </section>
        <div hidden>
        <section class="character-brain">
          <p class="brain-title">🧠 Character Brain</p>
          {#if brainLayers}
            <div class="brain-layers">
              {#if brainVisibleCount >= 1}
                <div class="brain-layer brain-theme" transition:fade={{ duration: 250 }}>
                  <span class="brain-head">🎯 Current Theme</span>
                  <span class="brain-text brain-theme-text">{brainLayers.theme}</span>
                </div>
              {/if}
              {#if brainVisibleCount >= 2}
                <div class="brain-layer brain-energy" transition:fade={{ duration: 250 }}>
                  <span class="brain-head">🧠 Brain Energy</span>
                  <div class="energy-row">
                    <div class="energy-bar" role="progressbar" aria-valuenow={brainLayers.energy} aria-valuemin="0" aria-valuemax="100">
                      <div class="energy-fill" style={`width:${displayEnergy}%`}></div>
                    </div>
                    <span class="energy-pct">{brainLayers.energy}%</span>
                  </div>
                  <span class="brain-text energy-state">状態：{brainLayers.energyState}</span>
                  <span class="brain-text energy-state">稼働状態：{brainLayers.activityState}</span>
                  <span class="brain-text energy-state">🌙 Energy State：{energyStateIcon(brainLayers.dailyEnergyState)} {brainLayers.dailyEnergyState}</span>
                  <span class="brain-text energy-state">{brainLayers.dailyEnergyDescription}</span>
                </div>
              {/if}
              {#if brainVisibleCount >= 3}
                <div class="brain-layer" transition:fade={{ duration: 250 }}>
                  <span class="brain-head">🧠 解釈</span>
                  <span class="brain-text">{brainLayers.interpretation}</span>
                </div>
              {/if}
              {#if brainVisibleCount >= 4}
                <div class="brain-layer" transition:fade={{ duration: 250 }}>
                  <span class="brain-head">💭 連想</span>
                  <span class="brain-text">{brainLayers.association}</span>
                </div>
              {/if}
              {#if brainVisibleCount >= 5}
                <div class="brain-layer" transition:fade={{ duration: 250 }}>
                  <span class="brain-head">🤣 セルフツッコミ</span>
                  <span class="brain-text brain-self">←{brainLayers.selfComment}</span>
                </div>
              {/if}
              {#if brainVisibleCount >= 6}
                <div class="brain-layer" transition:fade={{ duration: 250 }}>
                  <span class="brain-head">🫀 Emotion</span>
                  <span class="brain-text brain-emotion">{brainLayers.emotion.icon} {brainLayers.emotion.label}</span>
                </div>
              {/if}
            </div>
          {:else}
            <p class="brain-empty">メッセージを送ると、思考の流れを観測できます。</p>
          {/if}
        </section>

        <!-- 📜 Thinking Log V9: AIが口には出さない思考を観測するログ（表示の箱のみ／仮データ）。 -->
        <!-- AI生成・保存処理は未実装。最大5件・カード内のみスクロール可。 -->
        <section class="thinking-log">
          <p class="thinking-log-title">📜 Thinking Log</p>
          {#if thinkingLog.length === 0}
            <p class="thinking-log-empty">まだ思考ログはありません。</p>
          {:else}
            <div class="thinking-log-list">
              {#each thinkingLog.slice(0, THINKING_LOG_LIMIT) as log (log.id)}
                <div class="thinking-log-card">
                  <span class="tl-time">{log.timestamp}</span>
                  <p class="tl-thought">（{log.thought}）</p>
                  {#if log.selfComment}<p class="tl-comment">←{log.selfComment}</p>{/if}
                </div>
              {/each}
            </div>
          {/if}
        </section>

        <!-- 🧠 Emotion State V11: Thinking Influence の現在の温度感（常に1つ・0.3秒フェード）。 -->
        <section class="emotion-state">
          <p class="emotion-state-title">🧠 Emotion State</p>
          {#if currentEmotion}
            {#key currentEmotion.id}
              <div class="emotion-current" transition:fade={{ duration: 300 }}>
                <span class="emotion-icon">{currentEmotion.icon}</span>
                <span class="emotion-label">{currentEmotion.label}</span>
                <span class="emotion-tone">{currentEmotion.tone}</span>
              </div>
            {/key}
          {:else}
            <p class="emotion-state-empty">まだ感情の揺れはありません。</p>
          {/if}
        </section>
        </div>

        <p class="section-divider">会話メモリ</p>
        <label><span>性格</span><textarea rows="4" value={memory.personality.join('\n')} oninput={(e) => updateMemoryList('personality', e.currentTarget.value)}></textarea></label>
        <label><span>口調</span><textarea rows="4" value={memory.speechStyle.join('\n')} oninput={(e) => updateMemoryList('speechStyle', e.currentTarget.value)}></textarea></label>
        <label><span>好き</span><textarea rows="3" value={memory.likes.join('\n')} oninput={(e) => updateMemoryList('likes', e.currentTarget.value)}></textarea></label>
        <label><span>嫌い</span><textarea rows="3" value={memory.dislikes.join('\n')} oninput={(e) => updateMemoryList('dislikes', e.currentTarget.value)}></textarea></label>
        <button class="save-memory" onclick={() => saveMemory()} disabled={savingMemory}>
          {savingMemory ? '保存中...' : '📌重要記憶に固定'}
        </button>
        {#if updatedAt}<small>UPDATED: {new Date(updatedAt).toLocaleString('ja-JP')}</small>{/if}

        {#if growthHistory.length > 0}
          <!-- 📈 Growth History: 最新5件のみ（in-memory／永続化なし）。最新を上に表示・スクロール可 -->
          <section class="growth-history">
            <p class="growth-history-title">📈 Growth History</p>
            <div class="growth-history-list">
              {#each growthHistory as item (item.id)}
                <div class="growth-history-card">
                  <div class="ghc-head">
                    <span class="ghc-time">{item.time}</span>
                    <span class="ghc-msg">💬 {item.message}</span>
                  </div>
                  <div class="ghc-deltas">
                    {#each item.changes as change (change.label)}
                      <span class="ghc-delta">{change.icon} {change.label} {change.amount > 0 ? '+' : ''}{change.amount}</span>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        {#if growthTrends.length > 0}
          <!-- V7: 最近の傾向（growthValues＋直近履歴から簡易生成） -->
          <section class="growth-trends">
            <p class="growth-trends-title">📈 最近の傾向</p>
            <ul class="growth-trends-list">
              {#each growthTrends as trend (trend)}
                <li>{trend}</li>
              {/each}
            </ul>
          </section>
        {/if}
      </aside>
    {:else}
      <section class="conversation-panel">
        <div class="hint center">左の一覧からキャラクターを選択してください。</div>
      </section>
    {/if}
  </main>
  {#if showVideoMemoryReview}
    <div class="visual-memory-modal-backdrop" role="button" tabindex="-1" aria-label="制作資料の確認を閉じる" onclick={() => finishVideoMemoryReview(false)} onkeydown={(event) => { if (event.key === 'Escape') finishVideoMemoryReview(false); }}>
      <div class="video-memory-review" role="dialog" tabindex="-1" aria-modal="true" aria-label="今回参照する制作資料" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
        <header>
		  <div><span>VIDEO PREFLIGHT</span><h2>今回参照する制作資料</h2><p>動画AIへ渡す資料を生成前に確認します</p></div>
          <button type="button" onclick={() => finishVideoMemoryReview(false)} aria-label="キャンセル">×</button>
        </header>
		<div class="video-preflight-categories">
		  {#each VIDEO_PREFLIGHT_CATEGORIES as category (category)}
			<section class:animation-sheet-category={category === 'Animation Sheet'}>
			  <div class="video-preflight-category-head">
				<div>
				  <span>{category === 'Animation Sheet' ? '01' : category === 'Character Reference' ? '02' : category === 'World Reference' ? '03' : '04'}</span>
				  <h3>{category}</h3>
				</div>
				<strong>{videoPreflightMaterialsFor(category).length}点</strong>
			  </div>
			  {#if videoPreflightMaterialsFor(category).length > 0}
				<div class="video-memory-review-list">
				  {#each videoPreflightMaterialsFor(category) as material (material.id)}
					<article>
					  <img src={resolveVideoProductionImageReference(material.url)} alt={material.label} />
					  <div>
						<strong>✓ {material.label}</strong>
						<small>{material.category}</small>
						{#each material.details as detail}<span>✓ {detail}</span>{/each}
					  </div>
					</article>
				  {/each}
				</div>
			  {:else}
				<p class="video-preflight-empty">今回参照する資料はありません。</p>
			  {/if}
			</section>
		  {/each}
		</div>
        <footer>
          <button type="button" onclick={() => finishVideoMemoryReview(false)}>キャンセル</button>
		  <button class="visual-memory-save" type="button" onclick={() => finishVideoMemoryReview(true)}>この制作資料で動画生成</button>
        </footer>
      </div>
    </div>
  {/if}
  {#if showVisualMemoryBrowser}
    <div class="visual-memory-modal-backdrop" role="button" tabindex="-1" aria-label="Visual Memoryを閉じる" onclick={() => { showVisualMemoryBrowser = false; expandedVisualMemoryReference = null; }} onkeydown={(event) => { if (event.key === 'Escape') { showVisualMemoryBrowser = false; expandedVisualMemoryReference = null; } }}>
      <div class="visual-memory-modal" role="dialog" tabindex="-1" aria-modal="true" aria-label={`${character?.name ?? ''} Visual Memory`} onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
        <header>
          <div><span>👁 VISUAL MEMORY</span><h2>{character?.name}</h2></div>
          <button type="button" onclick={() => { showVisualMemoryBrowser = false; expandedVisualMemoryReference = null; }} aria-label="Visual Memoryを閉じる">×</button>
        </header>
        {#if expandedVisualMemoryReference}
          <button class="visual-memory-expanded" type="button" onclick={() => expandedVisualMemoryReference = null} aria-label="拡大表示を閉じる">
            <img src={expandedVisualMemoryReference.url} alt={expandedVisualMemoryReference.fileName} />
            <strong>{expandedVisualMemoryReference.title}</strong>
            <small>{expandedVisualMemoryReference.fileName}</small>
            <small>official={String(expandedVisualMemoryReference.official)} · critical={String(expandedVisualMemoryReference.critical)}</small>
            <small>tags: {expandedVisualMemoryReference.tags.join(', ') || 'なし'}</small>
            <small>importantFeatures: {expandedVisualMemoryReference.importantFeatures.join(', ') || '未設定'}</small>
          </button>
        {:else if visualMemoryBrowserImages().length > 0}
          <div class="visual-memory-modal-grid">
            {#each visualMemoryBrowserImages() as reference (reference.id)}
              <article class:critical={reference.critical}>
                <button class="visual-memory-modal-image" type="button" onclick={() => expandedVisualMemoryReference = reference}>
                  <img src={reference.url} alt={reference.fileName} />
                </button>
                <strong>{reference.title}</strong>
                <small>{reference.fileName}</small>
                <small>official={String(reference.official)} · critical={String(reference.critical)}</small>
                <small>tags: {reference.tags.join(', ') || 'なし'}</small>
                <small>importantFeatures: {reference.importantFeatures.join(', ') || '未設定'}</small>
                <button type="button" class:critical-active={reference.critical} onclick={() => toggleCriticalVisualReference(reference.id)} disabled={savingVisualMemory}>
                  critical={String(reference.critical)}
                </button>
              </article>
            {/each}
          </div>
        {:else}
          <p>このキャラクターの外見資料はまだ登録されていません。</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) { margin: 0; background: #030712; color: #e2e8f0; font-family: 'Segoe UI', sans-serif; }
  .chat-page { min-height: 100vh; padding: 22px; background: radial-gradient(circle at 50% 0%, rgba(34,211,238,.1), transparent 36%), #030712; }
  header { max-width: 1500px; margin: 0 auto 18px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 16px; }
  header a { color: #a5f3fc; font-size: 10px; text-decoration: none; }
  header div { text-align: center; }
  header p, header h1 { margin: 0; }
  header p { color: #22d3ee; font-size: 9px; letter-spacing: .18em; }
  header h1 { margin-top: 3px; color: #f8fafc; font-size: 30px; }
  header button { justify-self: end; }
	.header-actions { display: flex; justify-content: flex-end; gap: 8px; text-align: right; }
	.storycard-reset-button { border-color: rgba(248, 113, 113, .45); color: #fecaca; background: rgba(127, 29, 29, .18); }
  .routine-state-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 8px;
    padding: 5px 10px;
    border: 1px solid rgba(148,163,184,.22);
    border-radius: 999px;
    background: rgba(15,23,42,.72);
    color: #e2e8f0;
  }
  .routine-state-pill strong { color: #bbf7d0; font-size: 12px; }
  .routine-state-pill small { color: #94a3b8; font-size: 11px; }
  /* ⑤⑥ 右パネル拡張 + チャット68%/右32% 相当（左サイドバーは固定240px） */
  main { max-width: 1620px; margin: 0 auto; display: grid; grid-template-columns: 240px minmax(340px, 1fr) 440px; gap: 14px; }
  .select-panel, .conversation-panel, .memory-panel, .error-message {
    border: 1px solid rgba(148,163,184,.16); border-radius: 12px; background: rgba(8,15,32,.86);
  }
  .select-panel, .memory-panel { padding: 14px; align-self: start; }
  /* ⑩ 右パネル（Character Observatory）はスクロール追従。内側のみ独立スクロール。 */
  .memory-panel {
    position: sticky;
    top: 16px;
    height: calc(100vh - 32px);
    overflow-y: auto;
    align-self: start;
  }
  .studio-library { display: grid; gap: 8px; }
  .library-title { display: flex; align-items: center; gap: 8px; }
  .library-title h2 { margin: 0; font-size: 19px; }
  .library-note { margin: 0 0 4px; color: #94a3b8; font-size: 12px; line-height: 1.45; }
  .studio-library details { border: 1px solid rgba(148,163,184,.18); border-radius: 8px; background: rgba(15,23,42,.42); }
  .studio-library summary { display: flex; align-items: center; justify-content: space-between; padding: 10px; color: #e2e8f0; cursor: pointer; font-size: 13px; font-weight: 700; }
  .studio-library summary span { color: #67e8f9; font-size: 11px; }
  .studio-library details > p { margin: 0; padding: 0 10px 10px; color: #94a3b8; font-size: 12px; line-height: 1.45; }
  .library-list { display: grid; gap: 5px; padding: 0 8px 8px; }
  .library-list button { padding: 7px 8px; text-align: left; color: #cbd5e1; font-size: 12px; }
  .library-list button.active { color: #67e8f9; border-color: rgba(34,211,238,.5); background: rgba(34,211,238,.1); }
  .library-image-list { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; padding: 0 8px 8px; }
  .library-image-list img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 4px; background: #020617; }
  .library-memory-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 0 8px 8px; }
  .library-memory-actions button { padding: 7px 4px; font-size: 11px; }
  .advanced-studio-settings { border-color: rgba(168,85,247,.35) !important; background: rgba(76,29,149,.1) !important; }
  .advanced-studio-note { margin: 0; padding: 0 10px 8px; color: #c4b5fd; font-size: 11px; line-height: 1.45; }
  .advanced-studio-fields { display: grid; gap: 7px; padding: 0 10px 10px; }
  .advanced-studio-fields label { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; color: #ddd6fe; font-size: 11px; }
  .advanced-studio-fields select { min-width: 0; width: min(180px, 60%); box-sizing: border-box; border: 1px solid rgba(168,85,247,.48); border-radius: 6px; padding: 5px; color: #f5f3ff; background: #1e1b4b; font: inherit; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .advanced-studio-fields button { padding: 7px 8px; font-size: 11px; }
  .advanced-studio-help { margin: 0; color: #a78bfa; font-size: 10px; line-height: 1.45; overflow-wrap: anywhere; }
	.animation-project-list { display: grid; gap: 8px; padding: 0 8px 8px; }
	.animation-project-card { display: grid; gap: 8px; padding: 10px; border: 1px solid rgba(34,211,238,.2); border-radius: 8px; background: rgba(2,6,23,.45); }
	.animation-project-card h3 { margin: 0; color: #a5f3fc; font-size: 13px; line-height: 1.35; }
	.animation-project-card h4 { margin: 3px 0 0; color: #86efac; font-size: 11px; letter-spacing: .04em; }
	.animation-project-hierarchy { display: grid; gap: 4px; padding: 7px; border: 1px solid rgba(34,211,238,.14); border-radius: 6px; background: rgba(14,116,144,.05); }
	.animation-project-hierarchy span { display: flex; justify-content: space-between; gap: 8px; color: #94a3b8; font-size: 10px; }
	.animation-project-hierarchy b { color: #a5f3fc; }
	.animation-project-card dl { display: grid; gap: 4px; margin: 0; }
	.animation-project-card dl div { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 8px; font-size: 11px; }
	.animation-project-card dt { color: #94a3b8; }
	.animation-project-card dd { margin: 0; color: #e2e8f0; overflow-wrap: anywhere; }
	.animation-project-card video { width: 100%; max-height: 220px; border-radius: 7px; background: #020617; }
	.project-asset-summary { display: grid; gap: 4px; padding: 10px; border: 1px solid rgba(167,243,208,.2); border-radius: 8px; color: #cbd5e1; background: rgba(16,185,129,.04); font-size: 11px; }
	.project-asset-summary strong { color: #d1fae5; font-size: 13px; }
	.animation-production-flow { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 7px; color: #94a3b8; font-size: 10px; }
	.animation-production-flow span { padding: 4px 6px; border: 1px solid rgba(74,222,128,.2); border-radius: 999px; color: #a7f3d0; background: rgba(6,78,59,.12); }
	.animation-production-flow i { color: #4ade80; font-style: normal; }
  .memory-debug { display: grid; gap: 6px; padding: 0 10px 10px; color: #cbd5e1; font-size: 11px; line-height: 1.45; }
  .memory-debug p { margin: 0; }
  .memory-debug strong { color: #67e8f9; }
  .memory-log { display: grid; gap: 4px; padding-top: 4px; }
  .memory-log span { display: block; overflow: hidden; color: #94a3b8; text-overflow: ellipsis; white-space: nowrap; }
  .panel-label { color: #22d3ee; font-size: 14px; letter-spacing: .15em; margin: 0 0 10px; }
  .character-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: calc(100vh - 180px); overflow-y: auto; }
  .character-item { width: 100%; display: flex; align-items: center; gap: 6px; padding: 9px 10px; text-align: left; }
  .character-item.active { border-color: rgba(34,211,238,.5); background: rgba(34,211,238,.1); }
  .project-only-item { flex-wrap: wrap; border-color: rgba(168,85,247,.35); }
  .project-only-item .character-role { width: 100%; }
  .project-only-notice { margin-top: 10px; padding: 9px; border: 1px solid rgba(168,85,247,.4); border-radius: 7px; background: rgba(168,85,247,.1); color: #ddd6fe; font-size: 12px; font-weight: 800; }
  .character-name { font-size: 12px; color: #e2e8f0; }
  .character-role { font-size: 9px; color: #fbbf24; }
  .memory-flag { margin-left: auto; font-size: 7px; font-weight: 800; color: #fde68a; letter-spacing: .1em; }
  .visual-memory-sidebar-button { display: flex; justify-content: space-between; width: 100%; margin-top: 12px; padding: 10px; border-color: rgba(52,211,153,.5); color: #a7f3d0; background: rgba(16,185,129,.1); font-size: 12px; font-weight: 800; }
  .visual-memory-sidebar-button span { color: #fef08a; }
  .conversation-panel { min-height: calc(100vh - 120px); display: grid; grid-template-rows: auto 1fr auto; overflow: hidden; }
  .character-head {
    display: flex;
    gap: 14px;
    padding: 16px;
    border-bottom: 1px solid rgba(34,211,238,.2);
    background: linear-gradient(180deg, rgba(34,211,238,.06), transparent);
  }
  .character-head h2 { margin: 0 0 4px; font-size: 19px; letter-spacing: .02em; text-shadow: 0 0 10px rgba(34,211,238,.35); }
  .head-info { min-width: 0; }
  .lab-export-button { margin: 0 0 8px; padding: 6px 9px; border-color: rgba(34,211,238,.45); background: rgba(34,211,238,.08); color: #a5f3fc; font-size: 12px; }
  .lab-export-button:hover { background: rgba(34,211,238,.16); }
  .lab-export-toast { position: fixed; right: 20px; bottom: 20px; z-index: 30; padding: 11px 14px; border: 1px solid rgba(74,222,128,.6); border-radius: 8px; background: #082f23; color: #bbf7d0; font-weight: 800; box-shadow: 0 10px 28px rgba(0,0,0,.35); }
  .memory-update-toast { position: fixed; top: 18px; right: 20px; z-index: 32; padding: 11px 14px; border: 1px solid rgba(34,211,238,.6); border-radius: 8px; background: #083344; color: #cffafe; font-weight: 800; white-space: pre-line; box-shadow: 0 10px 28px rgba(0,0,0,.35); }
  .portrait {
    position: relative;
    width: 72px;
    height: 72px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 14px;
    background: #020617;
    color: #475569;
    font-size: 8px;
    border: 1px solid rgba(34,211,238,.45);
    box-shadow: 0 0 16px rgba(34,211,238,.35), inset 0 0 10px rgba(34,211,238,.12);
  }
  .portrait.active-speaking { border-color: rgba(74,222,128,.72); box-shadow: 0 0 18px rgba(74,222,128,.24), inset 0 0 12px rgba(34,211,238,.12); }
  .stage-slot { position: sticky; top: 12px; z-index: 5; margin-bottom: 12px; }
  .role { display: inline-flex; align-items: center; gap: 5px; color: #fbbf24; font-size: 12px; font-weight: 700; }
  .role-tag { font-size: 11px; }
  .desc { color: #94a3b8; font-size: 11px; line-height: 1.5; margin: 5px 0 0; }
  .ai-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 2px 0 5px;
    padding: 3px 9px;
    border: 1px solid rgba(34, 211, 238, 0.35);
    border-radius: 999px;
    background: rgba(34, 211, 238, 0.1);
    box-shadow: 0 0 10px rgba(34, 211, 238, 0.25);
  }
  .ai-icon { font-size: 13px; line-height: 1; }
  .ai-label { color: #a5f3fc; font-size: 11px; font-weight: 800; letter-spacing: 0.02em; }
  .ai-pending {
    margin-left: 2px;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.18);
    color: #94a3b8;
    font-size: 8px;
    font-weight: 800;
  }
  .messages { padding: 16px; overflow-y: auto; display: flex; flex-direction: column; }
  .routine-message {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    max-width: 78%;
    margin: 0 0 16px;
    padding: 12px;
    border: 1px solid rgba(74,222,128,.24);
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(74,222,128,.08), rgba(34,211,238,.05)), rgba(15,23,42,.72);
    color: #e2e8f0;
  }
  .routine-message span { font-size: 20px; line-height: 1; }
  .routine-message p { margin: 0; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
  /* ① 2カラム構造: [顔アイコン+名前+AIモデル] [吹き出し] */
  article { display: flex; gap: 12px; align-items: flex-start; max-width: 90%; margin-bottom: 20px; }
  article.assistant { align-self: flex-start; }
  article.user { align-self: flex-end; flex-direction: row-reverse; }

  /* 左カラム: アイコン → 名前 → AIモデル の縦積み */
  .msg-id { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; width: 92px; }

  /* 顔アイコン 64〜80px（LABチャット同等） */
  .msg-avatar {
    flex-shrink: 0;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: #020617;
    border: 1.5px solid rgba(34,211,238,.5);
    box-shadow: 0 0 0 2px rgba(34,211,238,.07), 0 0 16px rgba(34,211,238,.34);
  }
  .msg-avatar img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .msg-avatar-fallback { color: #67e8f9; font-size: 26px; font-weight: 800; }
  article.user .msg-avatar {
    border-color: rgba(168,85,247,.55);
    box-shadow: 0 0 0 2px rgba(168,85,247,.07), 0 0 16px rgba(168,85,247,.32);
  }
  article.user .msg-avatar-fallback { font-size: 30px; }

  /* 右カラム: 吹き出し（サイバー調を維持） */
  .msg-bubble {
    min-width: 0;
    margin-top: 2px;
    padding: 11px 14px 12px;
    backdrop-filter: blur(2px);
  }
  .msg-time {
    margin-top: 7px;
    color: #94a3b8;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .chat-date-divider {
    align-self: center;
    margin: 4px 0 14px;
    color: #94a3b8;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: .04em;
  }
  article.assistant .msg-bubble {
    background: linear-gradient(135deg, rgba(34,211,238,.13), rgba(34,211,238,.05));
    border: 1px solid rgba(34,211,238,.38);
    border-radius: 4px 18px 18px 18px;
    box-shadow: 0 0 14px rgba(34,211,238,.28), inset 0 0 12px rgba(34,211,238,.07);
  }
  article.user .msg-bubble {
    background: linear-gradient(135deg, rgba(168,85,247,.16), rgba(168,85,247,.08));
    border: 1px solid rgba(168,85,247,.4);
    border-radius: 18px 4px 18px 18px;
    box-shadow: 0 0 14px rgba(168,85,247,.28), inset 0 0 12px rgba(168,85,247,.08);
  }

  /* アイコン下: キャラ名（中央寄せ） */
  .msg-name {
    max-width: 92px;
    text-align: center;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: .03em;
    color: #f8fafc;
    overflow-wrap: anywhere;
  }
  article.assistant .msg-name { color: #67e8f9; text-shadow: 0 0 8px rgba(34,211,238,.5); }
  article.user .msg-name { color: #d8b4fe; text-shadow: 0 0 8px rgba(168,85,247,.5); }
  /* 名前の下: AIモデルバッジ */
  .msg-ai {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 9px;
    border-radius: 999px;
    border: 1px solid rgba(34,211,238,.35);
    background: rgba(34,211,238,.1);
    box-shadow: 0 0 8px rgba(34,211,238,.22);
    color: #a5f3fc;
    font-size: 10px;
    font-weight: 800;
  }
  .msg-ai.pending { border-color: rgba(148,163,184,.3); background: rgba(148,163,184,.12); color: #94a3b8; box-shadow: none; }
  .msg-ai-icon { font-size: 11px; line-height: 1; }

  /* ⑤ 本文 18px / 行間 1.8 */
  .bubble-text { font-size: 18px; line-height: 1.8; white-space: pre-wrap; word-break: break-word; }
  .voice-direction-badge {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 9px;
    width: fit-content;
    max-width: 100%;
    margin-top: 9px;
    padding: 5px 10px;
    border: 1px solid rgba(192, 132, 252, .42);
    border-radius: 8px;
    background: linear-gradient(90deg, rgba(168, 85, 247, .12), rgba(34, 211, 238, .08));
    box-shadow: 0 0 12px rgba(168, 85, 247, .14);
  }
  .voice-direction-badge span { color: #d8b4fe; font-size: 10px; font-weight: 900; letter-spacing: .08em; }
  .voice-direction-badge strong { color: #cffafe; font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
  .voice-play-button {
    margin-top: 8px;
    padding: 4px 12px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.35);
    color: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .voice-play-button:hover:not(:disabled) { border-color: rgba(34, 211, 238, 0.7); }
  .voice-play-button:disabled { opacity: 0.6; cursor: progress; }
  .voice-play-button.voice-error { border-color: rgba(248, 113, 113, 0.7); }
  .voice-backend-badge {
    display: inline-flex;
    align-items: center;
    margin: 8px 0 0 6px;
    padding: 4px 9px;
    border: 1px solid rgba(251, 191, 36, .5);
    border-radius: 999px;
    background: rgba(120, 53, 15, .24);
    color: #fde68a;
    font-size: 11px;
    font-weight: 800;
  }
  .voice-backend-badge.pod {
    border-color: rgba(74, 222, 128, .5);
    background: rgba(6, 78, 59, .26);
    color: #a7f3d0;
  }
  .voice-adopt-button {
    margin: 8px 0 0 6px;
    padding: 4px 12px;
    border: 1px solid rgba(74, 222, 128, .45);
    border-radius: 999px;
    background: rgba(6, 78, 59, .24);
    color: #a7f3d0;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }
  .voice-adopt-button:hover:not(:disabled) { border-color: rgba(74, 222, 128, .8); background: rgba(6, 95, 70, .36); }
  .voice-adopt-button:disabled { opacity: .5; cursor: default; }
  .voice-adopt-button.voice-adopted { border-color: rgba(34, 211, 238, .5); background: rgba(8, 47, 73, .3); color: #a5f3fc; }
  .message-ai-models { display: flex; flex-wrap: wrap; gap: 5px 8px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(125,211,252,.24); }
  .message-ai-models span { padding: 3px 7px; border: 1px solid rgba(125,211,252,.22); border-radius: 999px; color: #bae6fd; background: rgba(8,47,73,.28); font-size: 10px; line-height: 1.35; }
  .message-ai-models b { color: #67e8f9; }
  .message-video { display: block; margin-top: 10px; border: 1px solid rgba(74,222,128,.35); border-radius: 8px; background: #020617; }
  .model-pills span.pod-route { border-color: rgba(74,222,128,.55); color: #a7f3d0; background: rgba(6,78,59,.3); }
  .message-video-status { margin-top: 10px; padding: 10px 12px; border: 1px solid rgba(74,222,128,.3); border-radius: 8px; color: #a7f3d0; background: rgba(6,78,59,.18); font-size: 13px; font-weight: 800; }
  .seedance-mini-duration-debug { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 8px; padding: 8px 10px; border: 1px solid rgba(251,191,36,.35); border-radius: 7px; color: #fde68a; background: rgba(120,53,15,.14); font-size: 11px; font-weight: 800; }
  .message-video-error { display: grid; gap: 8px; margin-top: 10px; padding: 10px; border: 1px solid rgba(248,113,113,.34); border-radius: 8px; background: rgba(127,29,29,.16); }
  .message-video-error pre { margin: 0; white-space: pre-wrap; color: #fecaca; font: 12px/1.45 ui-monospace, monospace; }
  .message-video-error button { width: fit-content; border-color: rgba(248,113,113,.45); color: #fecaca; background: rgba(127,29,29,.28); }
  .message-reference-images { display: flex; flex-wrap: wrap; gap: 6px; }
  .video-details { display: grid; gap: 7px; margin-top: 10px; color: #cbd5e1; font-size: 12px; }
  .director-motion-prompt { margin-top: 8px; color: #a7f3d0; font-size: 12px; }
  .director-motion-prompt summary { cursor: pointer; }
  .director-motion-prompt pre { margin: 7px 0 0; white-space: pre-wrap; color: #d1fae5; font: inherit; }
  .video-details summary { cursor: pointer; color: #a7f3d0; }
  .video-details button { width: fit-content; border: 1px solid rgba(74,222,128,.4); border-radius: 6px; padding: 5px 8px; color: #d1fae5; background: rgba(6,78,59,.42); cursor: pointer; font: inherit; }
  .planning-card { padding: 12px; border: 1px solid rgba(250,204,21,.35); border-radius: 10px; background: rgba(113,63,18,.16); }
  .planning-card-phase { margin: 0 0 8px; color: #fde68a; font-size: 12px; font-weight: 800; letter-spacing: .08em; }

  .animation-actions { display: flex; gap: 8px; margin-top: 12px; }
  .animation-actions button { border: 1px solid #6e62d9; background: #201b3d; color: #e9e5ff; border-radius: 6px; padding: 6px 9px; font-size: 12px; cursor: pointer; }
  .animation-actions button:disabled { cursor: not-allowed; opacity: 0.45; }
  .animation-yaml { margin: 10px 0 0; padding: 10px; overflow: auto; border-radius: 6px; background: #111522; color: #bce8ff; font: 12px/1.5 ui-monospace, monospace; white-space: pre; }
  .generated-video { display: block; width: 100%; max-width: 480px; margin-top: 10px; border: 1px solid rgba(148,163,184,.25); border-radius: 8px; background: #020617; }
  .hint { color: #64748b; font-size: 14px; }
  .hint.center { text-align: center; align-self: center; padding: 30px; }
  .memory-review-loading {
    display: grid;
    gap: 10px;
    margin: 14px 0;
    padding: 13px;
    border: 1px solid rgba(34,211,238,.24);
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(34,211,238,.08), rgba(168,85,247,.05)), rgba(2,6,23,.7);
    box-shadow: 0 0 16px rgba(34,211,238,.14), inset 0 0 12px rgba(34,211,238,.04);
  }
  .review-loading-head {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #e2e8f0;
    font-size: 14px;
  }
  .review-loading-head strong { color: #f8fafc; font-size: 14px; }
  .review-dots { display: inline-flex; gap: 4px; align-items: center; }
  .review-dots i {
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: #67e8f9;
    animation: review-dot 1s infinite ease-in-out;
  }
  .review-dots i:nth-child(2) { animation-delay: .15s; }
  .review-dots i:nth-child(3) { animation-delay: .3s; }
  .review-loading-bar {
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(148,163,184,.16);
  }
  .review-loading-bar span {
    display: block;
    width: 42%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #22d3ee, #a78bfa);
    animation: review-bar 1.4s infinite ease-in-out;
  }
  @keyframes review-dot {
    0%, 80%, 100% { opacity: .35; transform: translateY(0); }
    40% { opacity: 1; transform: translateY(-2px); }
  }
  @keyframes review-bar {
    0% { transform: translateX(-105%); }
    100% { transform: translateX(250%); }
  }
  .memory-search-debug {
    margin: 10px 16px 0;
    padding: 10px;
    border: 1px solid rgba(34,211,238,.25);
    border-radius: 8px;
    background: rgba(2,6,23,.72);
    color: #cbd5e1;
  }
  .memory-search-debug summary {
    cursor: pointer;
    color: #a5f3fc;
    font-size: 13px;
    font-weight: 800;
  }
  .memory-search-grid {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 5px 10px;
    margin-top: 8px;
    font-size: 12px;
  }
  .memory-search-grid span { color: #94a3b8; }
  .memory-search-grid strong { color: #e2e8f0; overflow-wrap: anywhere; }
  .memory-search-error { margin: 8px 0 0; color: #fecaca; font-size: 12px; }
  .memory-search-debug pre {
    max-height: 220px;
    margin: 8px 0 0;
    overflow: auto;
    white-space: pre-wrap;
    color: #d1fae5;
    font: 11px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  .message-image { display: block; max-width: 100%; max-height: 320px; margin-bottom: 6px; border-radius: 8px; border: 1px solid rgba(148,163,184,.2); }
  .composer { display: grid; gap: 8px; padding: 12px; border-top: 1px solid rgba(34,211,238,.2); background: linear-gradient(0deg, rgba(34,211,238,.05), transparent); }
  .composer-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
  .composer textarea {
    border-color: rgba(34,211,238,.35);
    border-radius: 12px;
    box-shadow: inset 0 0 10px rgba(34,211,238,.08);
    transition: border-color .15s, box-shadow .15s;
  }
  .composer textarea:focus {
    outline: none;
    border-color: rgba(34,211,238,.7);
    box-shadow: 0 0 14px rgba(34,211,238,.3), inset 0 0 10px rgba(34,211,238,.12);
  }
  .composer textarea::placeholder { color: #5b7e8a; font-weight: 700; letter-spacing: .08em; }
  .composer-actions { display: grid; gap: 6px; align-content: start; }
  .preserve-timeline-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #bae6fd;
    font-size: 12px;
    font-weight: 700;
  }
  .preserve-timeline-toggle input { width: auto; accent-color: #22d3ee; }
  .preserve-timeline-toggle small { color: #7dd3fc; font-weight: 500; }
  .attach-button { display: grid; place-items: center; padding: 9px 13px; border: 1px solid rgba(34,211,238,.35); border-radius: 6px; color: #67e8f9; font-size: 14px; font-weight: 800; cursor: pointer; }
  .portrait-button { border-color: rgba(168,85,247,.45); background: rgba(168,85,247,.1); color: #d8b4fe; }
  textarea, button { border: 1px solid rgba(148,163,184,.22); border-radius: 6px; background: #020617; color: #e2e8f0; font: inherit; }
  textarea { width: 100%; padding: 8px; resize: vertical; box-sizing: border-box; font-size: 16px; }
  button { padding: 9px 13px; color: #a5f3fc; font-size: 14px; font-weight: 800; cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .4; }
  .memory-header { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
  .memory-header p, .memory-header h2 { margin: 0; }
  /* ⑫ タイトル 22px */
  .memory-header h2 { margin-top: 3px; font-size: 22px; }
  .brain-protection-panel {
    display: grid;
    gap: 10px;
    margin: 12px 0;
    padding: 12px;
    border: 1px solid rgba(34,211,238,.28);
    border-radius: 8px;
    background: rgba(2,6,23,.66);
  }
  .brain-protection-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .brain-protection-head h3 { margin: 0; color: #a5f3fc; font-size: 15px; }
  .brain-protection-head button,
  .brain-backup-row button { padding: 5px 9px; font-size: 12px; }
  .brain-health-grid {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 5px 10px;
    font-size: 12px;
  }
  .brain-health-grid span { color: #94a3b8; }
  .brain-health-grid strong { color: #e2e8f0; overflow-wrap: anywhere; }
  .brain-health-grid .healthy { color: #86efac; }
  .brain-health-grid .warning { color: #fde68a; }
  .brain-health-grid .corrupted { color: #fecaca; }
  .brain-protection-message { margin: 0; color: #cbd5e1; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .brain-backups summary {
    cursor: pointer;
    color: #a5f3fc;
    font-size: 12px;
    font-weight: 800;
  }
  .brain-backup-list { display: grid; gap: 7px; margin-top: 8px; }
  .brain-backup-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 7px;
    border: 1px solid rgba(148,163,184,.18);
    border-radius: 6px;
    background: rgba(15,23,42,.62);
  }
  .brain-backup-row strong {
    display: block;
    color: #e2e8f0;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .brain-backup-row small {
    margin: 2px 0 0;
    color: #94a3b8;
    font-size: 11px;
    text-align: left;
  }
  .memory-v2-panel { margin: 12px 0; padding: 10px; border: 1px solid rgba(34,211,238,.2); border-radius: 8px; background: rgba(8,47,73,.16); }
  .memory-v2-panel h3 { margin: 10px 0 5px; color: #a5f3fc; font-size: 13px; }
  .memory-v2-panel h3:first-child { margin-top: 0; }
  .memory-v2-panel small { color: #94a3b8; font-weight: 400; }
  .memory-v2-panel p { margin: 4px 0; color: #cbd5e1; font-size: 12px; line-height: 1.45; }
  .memory-v2-item { padding-left: 6px; border-left: 2px solid rgba(34,211,238,.35); }
  .memory-v2-item b { color: #67e8f9; }
  .resident-status { display: grid; gap: 9px; margin: 12px 0; padding: 12px; border: 1px solid rgba(167,139,250,.28); border-radius: 10px; background: rgba(76,29,149,.1); }
  .resident-status-row { display: flex; justify-content: space-between; gap: 10px; color: #e2e8f0; font-size: 13px; }
  .resident-status-row strong, .resident-interest strong { color: #c4b5fd; }
  .resident-interest { display: grid; gap: 4px; color: #cbd5e1; font-size: 12px; line-height: 1.5; }
  .asset-library-label { margin: 12px 0 7px; color: #a7f3d0; font-size: 12px; font-weight: 800; letter-spacing: .06em; }
  .visual-memory-library { margin-top: 12px; padding: 12px; border: 1px solid rgba(167,243,208,.24); border-radius: 10px; background: rgba(16,185,129,.04); }
  .visual-memory-browser-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .visual-memory-browser-head .panel-label, .visual-memory-browser-head .asset-library-label { margin: 0; }
  .visual-memory-browser-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
  .visual-memory-browser-actions button { padding: 7px 10px; border-color: rgba(167,139,250,.42); color: #ddd6fe; font-size: 11px; }
  .visual-memory-browser-actions .shiro-memory-button { border-color: rgba(34,211,238,.5); color: #a5f3fc; background: rgba(34,211,238,.09); }
  .visual-memory-count { color: #6ee7b7; font-size: 12px; font-weight: 800; }
  .visual-memory-upload { display: grid; grid-template-columns: minmax(160px,1fr) minmax(130px,.6fr) minmax(180px,1fr) auto; align-items: end; gap: 8px; margin: 12px 0; }
  .visual-memory-upload label { display: grid; gap: 4px; margin: 0; }
  .visual-memory-upload label > span { color: #94a3b8; font-size: 11px; font-weight: 700; }
  .visual-memory-upload select, .visual-memory-upload input { width: 100%; box-sizing: border-box; border: 1px solid rgba(167,243,208,.25); border-radius: 7px; padding: 7px 8px; color: #e2e8f0; background: rgba(2,6,23,.78); }
  .visual-memory-file-button { display: flex !important; align-items: center; justify-content: center; min-height: 34px; padding: 0 12px; border: 1px solid rgba(52,211,153,.45); border-radius: 7px; color: #a7f3d0; background: rgba(16,185,129,.1); font-size: 12px; font-weight: 800; cursor: pointer; }
  .visual-memory-file-button input { display: none; }
  .critical-features-panel { display: grid; gap: 7px; margin: 0 0 12px; padding: 10px; border: 1px solid rgba(251,191,36,.34); border-radius: 8px; background: rgba(120,53,15,.12); }
  .critical-features-panel strong { color: #fde68a; font-size: 12px; }
  .critical-features-panel div { display: flex; flex-wrap: wrap; gap: 6px; }
  .critical-features-panel span { padding: 3px 8px; border: 1px solid rgba(251,191,36,.36); border-radius: 999px; color: #fef3c7; background: rgba(251,191,36,.08); font-size: 10px; font-weight: 800; }
  .critical-features-panel small { color: #94a3b8; }
  .visual-memory-browser-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
  .visual-memory-reference-card { min-width: 0; overflow: hidden; border: 1px solid rgba(148,163,184,.22); border-radius: 9px; background: rgba(2,6,23,.58); }
  .visual-memory-reference-card.official { border-color: rgba(250,204,21,.62); box-shadow: 0 0 14px rgba(250,204,21,.12); }
  .visual-memory-image-wrap { position: relative; aspect-ratio: 16 / 10; background: rgba(15,23,42,.8); }
  .visual-memory-thumbnail-button { width: 100%; height: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; }
  .visual-memory-reference-thumbnail { width: 100%; height: 100%; object-fit: cover; }
  .official-reference-badge { position: absolute; left: 7px; bottom: 7px; padding: 4px 7px; border: 1px solid rgba(250,204,21,.65); border-radius: 999px; color: #fef08a; background: rgba(30,41,59,.9); font-size: 10px; font-weight: 900; }
  .critical-reference-badge { position: absolute; right: 7px; top: 7px; padding: 4px 7px; border: 1px solid rgba(248,113,113,.65); border-radius: 999px; color: #fecaca; background: rgba(69,10,10,.92); font-size: 10px; font-weight: 900; }
  .visual-memory-reference-details { display: grid; gap: 5px; padding: 9px; }
  .visual-memory-reference-details strong { overflow: hidden; color: #f8fafc; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .visual-memory-reference-details > small { margin: 0; overflow: hidden; color: #94a3b8; font-size: 10px; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
  .visual-memory-reference-title { font-size: 13px !important; }
  .visual-memory-reference-details time { color: #94a3b8; font-size: 10px; }
  .visual-memory-category { width: fit-content; padding: 2px 7px; border-radius: 999px; color: #a7f3d0; background: rgba(16,185,129,.12); font-size: 10px; font-weight: 800; }
  .visual-memory-tag-list { display: flex; flex-wrap: wrap; gap: 4px; min-height: 18px; }
  .visual-memory-tag-list span { color: #7dd3fc; font-size: 10px; }
  .visual-memory-tag-list .tag-empty { color: #64748b; }
  .visual-memory-important-features { display: flex; flex-wrap: wrap; gap: 4px; color: #fef3c7; font-size: 10px; }
  .visual-memory-important-features b { width: 100%; color: #fbbf24; }
  .visual-memory-important-features span { padding: 2px 5px; border-radius: 4px; background: rgba(245,158,11,.1); }
  .visual-memory-reference-actions { display: flex; gap: 6px; padding: 0 9px 9px; }
  .visual-memory-reference-actions button { flex: 1; padding: 6px; font-size: 10px; }
  .visual-memory-reference-actions button.active { border-color: rgba(250,204,21,.55); color: #fef08a; background: rgba(250,204,21,.08); }
  .visual-memory-reference-actions button.critical-active, button.critical-active { border-color: rgba(248,113,113,.65); color: #fecaca; background: rgba(127,29,29,.2); }
  .visual-memory-reference-actions .delete-reference { flex: 0 0 auto; border-color: rgba(248,113,113,.35); color: #fecaca; }
  .visual-memory-empty { margin: 0; color: #64748b; font-size: 12px; }
  @media (max-width: 700px) { .visual-memory-upload { grid-template-columns: 1fr; } }
  .visual-memory-modal-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 24px; background: rgba(2,6,23,.86); backdrop-filter: blur(8px); }
  .visual-memory-modal { width: min(960px, 100%); max-height: 88vh; overflow: auto; padding: 18px; border: 1px solid rgba(52,211,153,.45); border-radius: 14px; background: #07111d; box-shadow: 0 24px 70px rgba(0,0,0,.55); }
  .visual-memory-modal > header { position: static; display: flex; justify-content: space-between; align-items: center; min-height: 0; padding: 0 0 14px; border: 0; background: transparent; }
  .visual-memory-modal header span { color: #6ee7b7; font-size: 11px; font-weight: 900; letter-spacing: .14em; }
  .visual-memory-modal header h2 { margin: 3px 0 0; color: #f8fafc; }
  .visual-memory-modal-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(180px,1fr)); gap: 12px; }
  .visual-memory-modal-grid article { display: grid; gap: 7px; padding: 9px; border: 1px solid rgba(148,163,184,.22); border-radius: 10px; background: rgba(15,23,42,.65); }
  .visual-memory-modal-grid article.critical { border-color: rgba(248,113,113,.62); }
  .visual-memory-modal-grid strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .visual-memory-modal-grid small { color: #94a3b8; }
  .visual-memory-modal-image { padding: 0; overflow: hidden; aspect-ratio: 1; }
  .visual-memory-modal-image img { width: 100%; height: 100%; object-fit: cover; }
  .visual-memory-expanded { display: grid; gap: 10px; width: 100%; padding: 0; border: 0; background: transparent; }
  .visual-memory-expanded img { width: 100%; max-height: 70vh; object-fit: contain; border-radius: 10px; background: #020617; }
  .visual-memory-expanded strong { color: #e2e8f0; }
  .visual-memory-expanded small { color: #94a3b8; }
  .video-memory-review { width: min(680px,100%); max-height: 88vh; overflow: auto; padding: 20px; border: 1px solid rgba(34,211,238,.55); border-radius: 14px; background: #07111d; box-shadow: 0 24px 70px rgba(0,0,0,.6); }
  .video-memory-review > header { position: static; display: flex; justify-content: space-between; align-items: flex-start; min-height: 0; padding: 0 0 16px; border: 0; background: transparent; }
  .video-memory-review header span { color: #67e8f9; font-size: 10px; font-weight: 900; letter-spacing: .15em; }
  .video-memory-review header h2 { margin: 3px 0; color: #f8fafc; }
  .video-memory-review header p { margin: 0; color: #a7f3d0; font-weight: 800; }
	.video-preflight-categories { display: grid; gap: 12px; }
	.video-preflight-categories > section { display: grid; gap: 8px; padding: 12px; border: 1px solid rgba(148,163,184,.22); border-radius: 11px; background: rgba(15,23,42,.45); }
	.video-preflight-categories > section.animation-sheet-category { border-color: rgba(34,211,238,.58); background: linear-gradient(135deg, rgba(34,211,238,.13), rgba(14,116,144,.04)); box-shadow: 0 0 18px rgba(34,211,238,.12); }
	.video-preflight-category-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.video-preflight-category-head > div { display: flex; align-items: baseline; gap: 8px; }
	.video-preflight-category-head span { color: #67e8f9; font: 800 10px ui-monospace, monospace; }
	.video-preflight-category-head h3 { margin: 0; color: #e2e8f0; font-size: 15px; }
	.animation-sheet-category .video-preflight-category-head h3 { color: #a5f3fc; font-size: 17px; }
	.video-preflight-category-head > strong { color: #94a3b8; font-size: 11px; }
	.video-preflight-empty { margin: 0; padding: 8px; color: #64748b; font-size: 12px; }
  .video-memory-review-list { display: grid; gap: 10px; }
	.video-memory-review-list article { display: grid; grid-template-columns: 96px 1fr; gap: 12px; padding: 10px; border: 1px solid rgba(148,163,184,.2); border-radius: 10px; background: rgba(2,6,23,.58); }
	.video-memory-review-list img { width: 96px; height: 72px; object-fit: cover; border-radius: 7px; background: #020617; }
  .video-memory-review-list article div { display: grid; align-content: center; gap: 4px; }
  .video-memory-review-list strong { color: #f8fafc; }
  .video-memory-review-list small { color: #94a3b8; }
  .video-memory-review-list article span { color: #fef3c7; font-size: 12px; }
  .video-memory-review footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }

  .character-visual-memory {
    margin: 12px 0;
    padding: 12px;
    border: 1px solid rgba(45, 212, 191, .3);
    border-radius: 10px;
    background: rgba(13, 148, 136, .07);
  }
  .visual-memory-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .visual-memory-section-head .panel-label { margin: 0; color: #5eead4; }
  .visual-memory-caption { margin: 3px 0 0; color: #94a3b8; font-size: 12px; }
  .character-visual-memory details { margin-top: 10px; }
  .character-visual-memory summary { cursor: pointer; color: #ccfbf1; font-size: 13px; font-weight: 800; }
  .visual-memory-form { display: grid; gap: 10px; margin-top: 10px; }
  .visual-memory-form fieldset { display: grid; gap: 7px; margin: 0; padding: 10px; border: 1px solid rgba(94, 234, 212, .18); border-radius: 8px; }
  .visual-memory-form legend { padding: 0 5px; color: #99f6e4; font-size: 12px; font-weight: 800; }
  .visual-memory-form label { margin-top: 0; }
  .visual-memory-form input,
  .visual-memory-form textarea { width: 100%; box-sizing: border-box; color: #e2e8f0; background: rgba(2, 6, 23, .72); }
  .visual-memory-form textarea { min-height: 68px; resize: vertical; }
  .visual-memory-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
  .visual-memory-actions .visual-memory-save { border-color: rgba(45, 212, 191, .55); color: #99f6e4; }
  .visual-memory-readonly { display: grid; gap: 8px; margin-top: 10px; }
  .visual-memory-readonly div { padding-left: 8px; border-left: 2px solid rgba(45, 212, 191, .35); }
  .visual-memory-readonly strong { color: #99f6e4; font-size: 12px; }
  .visual-memory-readonly p { margin: 2px 0 0; color: #cbd5e1; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .visual-memory-message { margin: 9px 0 0; color: #5eead4; font-size: 12px; }

  /* 🧠 Growth System（Character Observatory） */
  .growth-system {
    margin-top: 14px;
    padding: 14px;
    border: 1px solid rgba(34,211,238,.22);
    border-radius: 12px;
    background: rgba(34,211,238,.05);
  }
  /* ⑫ 小見出し 18px */
  .growth-title {
    margin: 0 0 8px;
    color: #67e8f9;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: .04em;
    text-shadow: 0 0 8px rgba(34,211,238,.4);
  }
  /* V5: 成長レーダーチャート（SVG・サイバー調ネオンシアン） */
  .radar { display: block; width: 100%; height: auto; margin: 6px 0 2px; overflow: visible; }
  .radar-ring { fill: none; stroke: rgba(34,211,238,.16); stroke-width: 1; }
  .radar-spoke { stroke: rgba(34,211,238,.14); stroke-width: 1; }
  /* ③ 目盛り 16px / weight 700 */
  .radar-scale { fill: #94a3b8; font-size: 16px; font-weight: 700; }
  .radar-area {
    fill: rgba(34,211,238,.22);
    stroke: #22d3ee;
    stroke-width: 2.2;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 7px rgba(34,211,238,.6));
  }
  .radar-dot { fill: #67e8f9; filter: drop-shadow(0 0 5px rgba(34,211,238,.85)); }
  /* ② レーダー項目ラベル 16〜18px */
  .radar-label { fill: #e2e8f0; font-size: 17px; font-weight: 700; }
  .radar-val { fill: #a5f3fc; font-size: 16px; font-weight: 800; }

  /* V7: 今回の変化（レーダー下・3秒表示） */
  .recent-change {
    margin-top: 8px;
    padding: 9px 11px;
    border: 1px solid rgba(74,222,128,.35);
    border-radius: 10px;
    background: rgba(74,222,128,.08);
    box-shadow: 0 0 12px rgba(74,222,128,.22);
    animation: growth-history-in .2s ease-out;
  }
  .recent-change-title { margin: 0 0 8px; color: #86efac; font-size: 18px; font-weight: 800; letter-spacing: .04em; }
  .recent-change-list { display: flex; flex-wrap: wrap; gap: 7px 9px; }
  .recent-change-item {
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid rgba(74,222,128,.32);
    background: rgba(74,222,128,.1);
    color: #86efac;
    font-size: 16px;
    font-weight: 800;
    text-shadow: 0 0 6px rgba(74,222,128,.4);
  }

  /* ⑪ AI TYPE カード（全体1.3倍・説明16px） */
  .ai-type {
    margin-top: 16px;
    padding: 16px;
    border: 1px solid rgba(168,85,247,.32);
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(168,85,247,.12), rgba(34,211,238,.05));
    box-shadow: 0 0 18px rgba(168,85,247,.22), inset 0 0 14px rgba(168,85,247,.06);
  }
  .ai-type-label { margin: 0 0 10px; color: #c4b5fd; font-size: 14px; font-weight: 800; letter-spacing: .18em; }
  .ai-type-main { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .ai-type-icon { font-size: 26px; line-height: 1; }
  .ai-type-name { color: #f8fafc; font-size: 24px; font-weight: 800; letter-spacing: .02em; text-shadow: 0 0 10px rgba(168,85,247,.5); }
  .ai-type-sub { color: #a5f3fc; font-size: 14px; font-weight: 700; }
  .ai-type-desc { margin: 10px 0 0; color: #e2e8f0; font-size: 16px; line-height: 1.6; }

  /* 📜 Thinking Log V9 — Growth Radarと同じサイバー調・半透明カード。最大5件・カード内のみスクロール */
  .thinking-log {
    margin-top: 16px;
    padding: 14px;
    border: 1px solid rgba(34,211,238,.22);
    border-radius: 12px;
    background: rgba(34,211,238,.05);
  }
  .thinking-log-title {
    margin: 0 0 10px;
    color: #67e8f9;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: .04em;
    text-shadow: 0 0 8px rgba(34,211,238,.4);
  }
  .thinking-log-empty { margin: 0; color: #64748b; font-size: 16px; }
  /* ③ 最大5件表示・カード内だけスクロール可能 */
  .thinking-log-list { display: grid; gap: 8px; max-height: 280px; overflow-y: auto; padding-right: 2px; }
  /* ④ 半透明カード */
  .thinking-log-card {
    padding: 10px 12px;
    border: 1px solid rgba(34,211,238,.28);
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(34,211,238,.1), rgba(34,211,238,.03));
    box-shadow: 0 0 12px rgba(34,211,238,.18), inset 0 0 10px rgba(34,211,238,.05);
    animation: growth-history-in .2s ease-out;
  }
  /* 時刻 14px */
  .tl-time { color: #22d3ee; font-size: 14px; font-weight: 800; letter-spacing: .08em; }
  /* ログ本文 15〜16px */
  .tl-thought { margin: 5px 0 0; color: #e2e8f0; font-size: 16px; line-height: 1.6; overflow-wrap: anywhere; }
  .tl-comment { margin: 4px 0 0; color: #86efac; font-size: 15px; line-height: 1.5; text-shadow: 0 0 6px rgba(74,222,128,.35); overflow-wrap: anywhere; }

  /* 🧠 Character Brain V1 — 擬似思考4段階。サイバー調・少し大きめ・見やすさ重視。 */
  .character-brain {
    margin-top: 16px;
    padding: 16px;
    border: 1px solid rgba(34,211,238,.26);
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(34,211,238,.08), rgba(168,85,247,.05));
    box-shadow: 0 0 16px rgba(34,211,238,.16), inset 0 0 12px rgba(34,211,238,.05);
  }
  .brain-title {
    margin: 0 0 12px;
    color: #67e8f9;
    font-size: 19px;
    font-weight: 800;
    letter-spacing: .04em;
    text-shadow: 0 0 8px rgba(34,211,238,.45);
  }
  .brain-empty { margin: 0; color: #64748b; font-size: 16px; }
  .brain-layers { display: grid; gap: 10px; }
  .brain-layer {
    display: grid;
    gap: 4px;
    padding: 11px 13px;
    border: 1px solid rgba(34,211,238,.24);
    border-left: 3px solid rgba(34,211,238,.6);
    border-radius: 8px;
    background: rgba(2,6,23,.55);
  }
  .brain-head { color: #22d3ee; font-size: 15px; font-weight: 800; letter-spacing: .03em; }
  .brain-text { color: #e2e8f0; font-size: 17px; line-height: 1.55; overflow-wrap: anywhere; }
  .brain-self { color: #86efac; font-weight: 700; text-shadow: 0 0 6px rgba(74,222,128,.35); }
  .brain-emotion { color: #f8fafc; font-size: 18px; font-weight: 800; text-shadow: 0 0 8px rgba(34,211,238,.4); }
  /* 🎯 Current Theme — 強調（紫寄りのアクセント） */
  .brain-theme { border-left-color: rgba(168,85,247,.7); }
  .brain-theme-text { color: #f8fafc; font-size: 19px; font-weight: 800; text-shadow: 0 0 8px rgba(168,85,247,.4); }
  /* 🧠 Brain Energy — バー＋状態 */
  .energy-row { display: flex; align-items: center; gap: 10px; margin: 2px 0; }
  .energy-bar {
    flex: 1;
    height: 12px;
    border-radius: 999px;
    background: rgba(2,6,23,.8);
    border: 1px solid rgba(34,211,238,.3);
    overflow: hidden;
    box-shadow: inset 0 0 8px rgba(34,211,238,.12);
  }
  /* ⑥ 0.5秒で滑らかに（width は rAF 補間、念のため transition も併用） */
  .energy-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #22d3ee, #a855f7);
    box-shadow: 0 0 10px rgba(34,211,238,.6);
    transition: width .5s ease-out;
  }
  .energy-pct { color: #a5f3fc; font-size: 16px; font-weight: 800; min-width: 44px; text-align: right; }
  .energy-state { color: #67e8f9; font-size: 15px; font-weight: 700; }

  /* 🧠 Emotion State V11 — Thinking Influence の温度感。常に1つだけ・0.3秒フェード。 */
  .emotion-state {
    margin-top: 16px;
    padding: 14px;
    border: 1px solid rgba(34,211,238,.22);
    border-radius: 12px;
    background: rgba(34,211,238,.05);
  }
  .emotion-state-title {
    margin: 0 0 10px;
    color: #67e8f9;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: .04em;
    text-shadow: 0 0 8px rgba(34,211,238,.4);
  }
  .emotion-state-empty { margin: 0; color: #64748b; font-size: 16px; }
  .emotion-current {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid rgba(34,211,238,.3);
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(34,211,238,.12), rgba(34,211,238,.04));
    box-shadow: 0 0 14px rgba(34,211,238,.22), inset 0 0 10px rgba(34,211,238,.05);
  }
  .emotion-icon { font-size: 26px; line-height: 1; }
  .emotion-label { color: #f8fafc; font-size: 20px; font-weight: 800; letter-spacing: .02em; text-shadow: 0 0 10px rgba(34,211,238,.45); }
  .emotion-tone { color: #a5f3fc; font-size: 15px; font-weight: 700; }

  /* 📈 Growth History — 最新5件（in-memory）。サイバー調・ネオンシアン・カード・スクロール可 */
  .growth-history {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid rgba(34,211,238,.2);
  }
  .growth-history-title {
    margin: 0 0 10px;
    color: #67e8f9;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: .04em;
    text-shadow: 0 0 8px rgba(34,211,238,.4);
  }
  .growth-history-list { display: grid; gap: 8px; max-height: 280px; overflow-y: auto; padding-right: 2px; }
  .growth-history-card {
    padding: 9px 11px;
    border: 1px solid rgba(34,211,238,.28);
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(34,211,238,.1), rgba(34,211,238,.03));
    box-shadow: 0 0 12px rgba(34,211,238,.18), inset 0 0 10px rgba(34,211,238,.05);
    animation: growth-history-in .2s ease-out;
  }
  .ghc-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 7px; }
  .ghc-time { color: #22d3ee; font-size: 14px; font-weight: 800; letter-spacing: .08em; }
  .ghc-msg { color: #e2e8f0; font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
  .ghc-deltas { display: flex; flex-wrap: wrap; gap: 6px 8px; }
  .ghc-delta {
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid rgba(74,222,128,.32);
    background: rgba(74,222,128,.1);
    color: #86efac;
    font-size: 16px;
    font-weight: 800;
    text-shadow: 0 0 6px rgba(74,222,128,.4);
  }
  @keyframes growth-history-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* V7: 最近の傾向（Growth History の下） */
  .growth-trends {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid rgba(34,211,238,.2);
  }
  .growth-trends-title {
    margin: 0 0 8px;
    color: #67e8f9;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: .04em;
    text-shadow: 0 0 8px rgba(34,211,238,.4);
  }
  .growth-trends-list { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
  .growth-trends-list li { color: #e2e8f0; font-size: 16px; line-height: 1.55; }

  .section-divider {
    margin: 18px 0 0;
    padding-top: 12px;
    border-top: 1px solid rgba(148,163,184,.16);
    color: #67e8f9;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: .06em;
  }
  label { display: grid; gap: 5px; margin-top: 12px; }
  label span { color: #94a3b8; font-size: 16px; font-weight: 800; }
  .save-memory { width: 100%; margin-top: 12px; border-color: rgba(251,191,36,.35); color: #fde68a; }
  .inject-lab { width: 100%; margin-top: 8px; border-color: rgba(168,85,247,.45); background: rgba(168,85,247,.1); color: #d8b4fe; }
  .inject-note { margin: 8px 0 0; color: #94a3b8; font-size: 14px; line-height: 1.5; }
  small { display: block; margin-top: 8px; color: #94a3b8; font-size: 14px; text-align: right; }
  /* 📎 添付済み（入力欄の下のみ。サイドバーには出さない） */
  .attached-review {
    display: grid;
    gap: 10px;
    padding: 10px;
    border: 1px solid rgba(34,211,238,.28);
    border-radius: 8px;
    background: rgba(34,211,238,.06);
  }
  .attached-review-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .attached-label { color: #67e8f9; font-size: 13px; font-weight: 800; letter-spacing: .03em; }
  .attached-clear,
  .attached-remove {
    padding: 5px 9px;
    border-radius: 6px;
    border-color: rgba(248,113,113,.36);
    color: #fecaca;
    font-size: 12px;
    line-height: 1.2;
  }
  .attached-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 8px;
  }
  .attached-card {
    display: grid;
    grid-template-columns: auto 58px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 7px;
    border: 1px solid rgba(148,163,184,.22);
    border-radius: 8px;
    background: rgba(2,6,23,.58);
  }
  .attached-order {
    min-width: 34px;
    color: #a5f3fc;
    font-size: 12px;
    font-weight: 900;
    text-align: center;
  }
  .attached-thumb {
    width: 58px;
    height: 58px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid rgba(148,163,184,.28);
    background: rgba(2,6,23,.9);
  }
  .attached-info { min-width: 0; display: grid; gap: 2px; }
  .attached-name {
    min-width: 0;
    color: #e2e8f0;
    font-size: 13px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .attached-meta { color: #94a3b8; font-size: 11px; font-weight: 700; }
  .attached-yaml {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 7px;
    border: 1px solid rgba(148,163,184,.22);
    border-radius: 8px;
    background: rgba(2,6,23,.58);
  }
  .attached-warn { margin-top: 2px; color: #fb7185; font-size: 13px; font-weight: 700; }
  .intent-confirm { display: grid; gap: 8px; padding: 10px; border: 1px solid rgba(251,191,36,.35); border-radius: 8px; background: rgba(120,53,15,.16); }
  .intent-confirm strong { color: #fde68a; font-size: 13px; }
  .intent-confirm p { margin: 0; color: #fef3c7; font-size: 13px; line-height: 1.45; }
  .intent-confirm small { margin: 0; color: #fbbf24; text-align: left; }
  .intent-confirm div { display: flex; flex-wrap: wrap; gap: 8px; }
  .intent-confirm button { border-color: rgba(251,191,36,.42); color: #fde68a; background: rgba(120,53,15,.22); }
  /* ⑤ チャットログ上の添付サマリ */
  .msg-attach {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed rgba(148,163,184,.25);
  }
  .msg-attach-label { color: #67e8f9; font-size: 11px; font-weight: 800; letter-spacing: .04em; }
  .msg-attach-item { color: #cbd5e1; font-size: 12px; font-weight: 700; }

  .error-message { max-width: 1500px; margin: 0 auto 14px; padding: 10px; color: #fb7185; }
  .warning-message { max-width: 1500px; margin: 0 auto 14px; padding: 10px; color: #fbbf24; border: 1px solid rgba(251,191,36,.24); border-radius: 12px; background: rgba(8,15,32,.86); }
  .active-image-skill { max-width: 1500px; margin: 0 auto 10px; color: #93c5fd; font-size: 11px; text-align: right; }
  /* 💭 Thinking Stream: 最終回答とは別レイヤーの内的思考表示 */
  .thinking-stream { margin: 8px 0; border: 1px solid rgba(96,165,250,.22); border-radius: 12px; background: rgba(15,23,42,.72); overflow: hidden; }
  .thinking-stream-head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; background: transparent; border: 0; color: #93c5fd; cursor: pointer; font-size: .85rem; text-align: left; }
  .thinking-stream-head strong { font-weight: 600; }
  .thinking-count { margin-left: auto; padding: 0 8px; border-radius: 999px; background: rgba(96,165,250,.16); font-size: .75rem; }
  .thinking-toggle { color: #64748b; }
  .thinking-stream-body { padding: 2px 14px 10px; display: grid; gap: 8px; }
  .thought-action-candidate { padding: 9px 10px; border: 1px solid rgba(34,211,238,.25); border-radius: 8px; background: linear-gradient(90deg,rgba(8,47,73,.45),rgba(15,23,42,.35)); }
  .thought-action-head { display: flex; align-items: center; gap: 7px; color: #a5f3fc; font-size: .76rem; letter-spacing: .04em; }
  .thought-action-head b { margin-left: auto; padding: 2px 6px; border: 1px solid rgba(251,191,36,.3); border-radius: 999px; color: #fcd34d; font-size: .65rem; }
  .thought-action-candidate p { margin: 6px 0 3px; color: #e2e8f0; font-size: .82rem; }
  .thought-action-candidate small { color: #67e8f9; font: .68rem ui-monospace, monospace; }
  .chat-mode-toggle { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .chat-mode-toggle button { padding: 4px 10px; border: 1px solid rgba(34,211,238,.25); border-radius: 999px; background: rgba(15,23,42,.5); color: #94a3b8; font-size: .74rem; letter-spacing: .04em; cursor: pointer; }
  .chat-mode-toggle button.active { border-color: rgba(34,211,238,.6); background: linear-gradient(90deg,rgba(8,47,73,.6),rgba(15,23,42,.5)); color: #a5f3fc; }
  .chat-mode-toggle .observation-note { margin-left: 4px; color: #67e8f9; font-size: .7rem; letter-spacing: .03em; }
  .observation-panel { margin: 8px 0; padding: 10px 12px; border: 1px solid rgba(34,211,238,.3); border-radius: 8px; background: linear-gradient(135deg,rgba(8,47,73,.5),rgba(15,23,42,.4)); }
  .observation-head { display: flex; align-items: center; gap: 7px; color: #a5f3fc; font-size: .78rem; letter-spacing: .06em; }
  .observation-head .observation-status { margin-left: auto; padding: 2px 8px; border: 1px solid rgba(251,191,36,.3); border-radius: 999px; color: #fcd34d; font-size: .65rem; letter-spacing: .05em; }
  .observation-head .observation-status[data-status='ready_to_act'] { border-color: rgba(74,222,128,.4); color: #86efac; }
  .observation-head .observation-status[data-status='uncertain'] { border-color: rgba(248,113,113,.35); color: #fca5a5; }
  .observation-grid { display: grid; grid-template-columns: 96px 1fr; gap: 4px 10px; margin-top: 8px; }
  .observation-grid span { color: #38bdf8; font: .64rem ui-monospace, monospace; letter-spacing: .08em; padding-top: 2px; }
  .observation-grid p { margin: 0; color: #e2e8f0; font-size: .8rem; line-height: 1.45; }
  .observation-pending { margin-left: 6px; color: #fcd34d; font-size: .68rem; font-style: normal; }
  .thinking-step { border-left: 2px solid rgba(96,165,250,.25); padding-left: 10px; display: grid; gap: 3px; animation: thinking-line-in .5s ease; }
  .thinking-line { margin: 0; color: #cbd5e1; font-size: .85rem; line-height: 1.6; animation: thinking-line-in .5s ease; }
  .thinking-line-icon { margin-right: 6px; }
  .thinking-tech-log { margin-top: 4px; border-top: 1px dashed rgba(148,163,184,.2); padding-top: 6px; }
  .thinking-tech-log summary { color: #64748b; font-size: .72rem; cursor: pointer; }
  .thinking-tech-line { margin: 2px 0 0; padding-left: 1em; color: #64748b; font-size: .72rem; font-family: ui-monospace, monospace; line-height: 1.5; }
  .thinking-tech-line.head { padding-left: 0; margin-top: 6px; color: #94a3b8; font-weight: 600; }
  .thinking-stream.done .thinking-stream-head { color: #94a3b8; }
  .proactive-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-bottom: 8px; padding: 8px 10px; border: 1px solid rgba(34,211,238,.18); border-radius: 10px; background: rgba(15,23,42,.5); color: #cbd5e1; font-size: .72rem; }
  .proactive-controls label { display: inline-flex; align-items: center; gap: 5px; }
  .proactive-controls input[type='number'] { width: 48px; padding: 3px 5px; border: 1px solid rgba(148,163,184,.28); border-radius: 6px; background: #0f172a; color: #e2e8f0; }
  .voice-playback-mode { display: inline-flex; overflow: hidden; border: 1px solid rgba(125,211,252,.34); border-radius: 8px; background: rgba(2,6,23,.62); }
  .voice-playback-mode button { padding: 4px 9px; border: 0; border-right: 1px solid rgba(125,211,252,.2); border-radius: 0; background: transparent; color: #94a3b8; font: inherit; font-weight: 800; cursor: pointer; }
  .voice-playback-mode button:last-child { border-right: 0; }
  .voice-playback-mode button.active { background: linear-gradient(90deg,rgba(8,47,73,.78),rgba(49,46,129,.62)); color: #cffafe; box-shadow: inset 0 0 12px rgba(34,211,238,.14); }
  .voice-playback-mode button:hover:not(.active) { color: #e2e8f0; background: rgba(30,41,59,.7); }
  .runtime-state { padding: 3px 8px; border-radius: 999px; background: rgba(34,211,238,.12); color: #a5f3fc; font-weight: 700; }
  .runtime-state[data-state='speaking'] { background: rgba(74,222,128,.15); color: #86efac; }
  .runtime-state[data-state='thinking'], .runtime-state[data-state='generating_voice'] { background: rgba(251,191,36,.13); color: #fde68a; }
  .speech-stop-button { margin-left: auto; padding: 4px 9px; border: 1px solid rgba(248,113,113,.3); border-radius: 7px; background: rgba(127,29,29,.2); color: #fca5a5; }
  .speech-stop-button:disabled { opacity: .45; }
  .voice-effect-button { padding: 4px 9px; border: 1px solid rgba(148,163,184,.3); border-radius: 7px; background: rgba(15,23,42,.7); color: #cbd5e1; cursor: pointer; }
  .voice-effect-button[data-mode='android-soft'] { border-color: rgba(34,211,238,.48); background: rgba(8,47,73,.44); color: #a5f3fc; box-shadow: inset 0 0 12px rgba(34,211,238,.08); }
  .voice-effect-button[data-mode='android-clear'] { border-color: rgba(192,132,252,.58); background: linear-gradient(90deg,rgba(8,47,73,.52),rgba(88,28,135,.38)); color: #e9d5ff; box-shadow: 0 0 12px rgba(34,211,238,.09); }
  .voice-effect-button:hover { filter: brightness(1.12); }
  .runpod-voice-button { padding: 4px 9px; border: 1px solid rgba(96,165,250,.38); border-radius: 7px; background: rgba(30,58,138,.2); color: #bfdbfe; cursor: pointer; }
  .runpod-voice-button.active { border-color: rgba(74,222,128,.62); background: rgba(6,78,59,.38); color: #bbf7d0; box-shadow: 0 0 10px rgba(74,222,128,.12); }
  .runpod-voice-button.waiting { border-color: rgba(251,191,36,.55); background: rgba(120,53,15,.28); color: #fde68a; }
  .runpod-voice-button.error { border-color: rgba(248,113,113,.55); background: rgba(127,29,29,.28); color: #fecaca; }
  .runpod-voice-button:disabled { opacity: .58; cursor: wait; }
  .runpod-voice-status { flex: 1 1 220px; min-width: 160px; color: #93c5fd; font-size: 10px; line-height: 1.35; }
  .runpod-voice-status[data-state='waiting'], .runpod-voice-status[data-state='warming'] { color: #fde68a; }
  .runpod-voice-status[data-state='warm'] { color: #86efac; }
  .runpod-voice-status[data-state='error'] { color: #fca5a5; }
  .voice-workflow-panel { display: grid; gap: 5px; margin-bottom: 8px; padding: 9px 11px; border: 1px solid rgba(148,163,184,.24); border-radius: 10px; background: rgba(15,23,42,.52); }
  .voice-workflow-panel[data-status='unset'] { border-color: rgba(251,191,36,.38); background: rgba(120,53,15,.12); }
  .voice-workflow-panel[data-status='draft'], .voice-workflow-panel[data-status='saving'] { border-color: rgba(192,132,252,.42); background: linear-gradient(90deg, rgba(88,28,135,.18), rgba(8,47,73,.18)); }
  .voice-workflow-panel[data-status='locked'] { border-color: rgba(74,222,128,.3); background: rgba(6,78,59,.12); }
  .voice-workflow-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .voice-workflow-heading strong { color: #e2e8f0; font-size: 12px; letter-spacing: .05em; }
  .voice-workflow-heading span { color: #86efac; font: 700 9px ui-monospace, monospace; letter-spacing: .12em; }
  .voice-workflow-panel p { margin: 0; color: #94a3b8; font-size: 11px; line-height: 1.55; }
  .voice-workflow-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 3px; }
  .voice-workflow-actions .voice-adopt-button { margin: 0; padding: 5px 11px; border-radius: 7px; font-size: 10px; }
  .image-voice-designer-button { width: fit-content; padding: 5px 11px; border: 1px solid rgba(34,211,238,.4); border-radius: 7px; background: linear-gradient(90deg,rgba(8,47,73,.54),rgba(49,46,129,.34)); color: #cffafe; font-size: 10px; font-weight: 800; cursor: pointer; }
  .image-voice-designer-button:hover { border-color: rgba(34,211,238,.72); filter: brightness(1.12); }
  .daily-speed-control { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 3px 0; }
  .daily-speed-control > span { margin-right: 3px; color: #a5f3fc; font-size: 10px; font-weight: 800; }
  .daily-speed-control button { padding: 3px 8px; border: 1px solid rgba(125,211,252,.25); border-radius: 999px; background: rgba(15,23,42,.62); color: #94a3b8; font-size: 10px; cursor: pointer; }
  .daily-speed-control button.active { border-color: rgba(34,211,238,.72); background: rgba(8,47,73,.72); color: #cffafe; box-shadow: 0 0 9px rgba(34,211,238,.13); }
  .voice-reset-button { width: fit-content; margin-top: 2px; padding: 4px 9px; border: 1px solid rgba(251,191,36,.32); border-radius: 7px; background: rgba(120,53,15,.18); color: #fde68a; font-size: 10px; cursor: pointer; }
  .voice-reset-button:hover:not(:disabled) { border-color: rgba(251,191,36,.62); background: rgba(120,53,15,.3); }
  .voice-reset-button:disabled { opacity: .5; }
  .proactive-badge { padding: 2px 6px; border: 1px solid rgba(167,139,250,.35); border-radius: 999px; color: #c4b5fd; font-size: .62rem; font-weight: 800; letter-spacing: .08em; }
  .avatar-state-debug { display: grid; grid-template-columns: auto repeat(4, max-content) minmax(70px, 1fr); align-items: center; gap: 6px 10px; margin-bottom: 8px; padding: 7px 9px; border: 1px dashed rgba(74,222,128,.3); border-radius: 8px; background: rgba(2,44,34,.3); color: #a7f3d0; font: .68rem ui-monospace, monospace; }
  .comment-queue-debug { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 7px 9px; border: 1px dashed rgba(125,211,252,.35); border-radius: 8px; background: rgba(3,30,48,.35); color: #bae6fd; font: .68rem ui-monospace, monospace; }
  .comment-queue-debug input { padding: 3px 6px; border: 1px solid rgba(125,211,252,.35); border-radius: 5px; background: rgba(2,20,33,.6); color: inherit; font: inherit; }
  .comment-queue-debug .comment-debug-name { width: 72px; }
  .comment-queue-debug .comment-debug-text { flex: 1; min-width: 0; }
  .comment-queue-debug button { padding: 3px 10px; border: 1px solid rgba(125,211,252,.45); border-radius: 5px; background: rgba(12,74,110,.5); color: inherit; font: inherit; cursor: pointer; }
  .comment-queue-debug button:disabled { opacity: .45; cursor: default; }
  .comment-queue-debug .comment-debug-liveid { width: 110px; }
  .comment-queue-debug .comment-debug-error { color: #fda4af; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .comment-queue-debug .comment-yt-running { color: #86efac; }
  .avatar-state-debug strong { color: #6ee7b7; letter-spacing: .06em; }
  .avatar-state-debug i { display: block; height: 5px; overflow: hidden; border-radius: 999px; background: rgba(15,23,42,.8); }
  .avatar-state-debug i b { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg,#22d3ee,#4ade80); transition: width 45ms linear; }
  @keyframes thinking-line-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @media (max-width: 1050px) { main { grid-template-columns: 200px 1fr; } .memory-panel { grid-column: 1 / -1; position: static; height: auto; max-height: none; } }
  @media (max-width: 700px) { .chat-page { padding: 14px; } header { grid-template-columns: 1fr; align-items: start; } header div { text-align: left; } header button { justify-self: start; } main { grid-template-columns: 1fr; } .conversation-panel { min-height: 65vh; } .avatar-state-debug { grid-template-columns: 1fr 1fr; } }
</style>

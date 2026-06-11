<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createVoiceEngine } from '$lib/api/voiceEngine';
  import { PROVIDER_MODELS, PROVIDER_OPTIONS, type AIProvider } from '$lib/config/models';
  import {
    AVAILABLE_IMAGE_MODELS,
    AVAILABLE_MEDIA_PROVIDER_OPTIONS,
    mediaModelsForProvider as mediaModelsForProviderConfig,
    normalizeMediaModelId,
    type MediaProviderName,
  } from '$lib/config/mediaModels';
  import { sessionStore } from '$lib/stores/sessionStore';
  import AvatarViewer          from '$lib/components/AvatarViewer.svelte';
  import PNGTuberViewer        from '$lib/components/PNGTuberViewer.svelte';
  import MotionPNGTuberViewer  from '$lib/components/MotionPNGTuberViewer.svelte';
  import { avatarState, initAvatarWs, sendAvatarPatch } from '$lib/ws/avatarSocket';
  import { addMemory, getRecentMemoryText, getMemoryEntries } from '$lib/ai/memory/rootMemory';
  import { addSpecialMemory, getSpecialMemoryHint } from '$lib/ai/memory/specialMemory';
  import { recordTalk, getAnniversaryHint, computeDailyDrift, shouldApplyDrift, markDriftApplied } from '$lib/ai/memory/anniversaryMemory';
  import { recordVisit, getHabitHint } from '$lib/ai/memory/habitMemory';
  import { getLatestImageMemory, saveImageMemory } from '$lib/ai/memory/imageMemory';
  import { clearLabChatHistory, loadLabChatHistory, migrateLabChatHistoryFromLocalStorage, saveLabChatHistory } from '$lib/ai/memory/labChatHistory';
  import { CHARACTER_PROFILES } from '$lib/ai/characters/characterProfiles';
  import { buildEmotionStyleHint } from '$lib/ai/emotion/emotionStyleEngine';
  import { buildToneHints } from '$lib/ai/conversationCore/toneHints';
  import { COLAB_TTS_VOICE_OPTIONS } from '$lib/types/character';
  import { classifyIntent, classifyIntentByRules, findGenerationNegativeKeywords, type IntentResult } from '$lib/intentRouter';
  import { routerStateStore } from '$lib/stores/routerStateStore';
  import { resolveCharacterContextForImagePrompt } from '$lib/characterContextRouter';
  import {
    extractStoryContinuity,
    formatStoryContinuityLog,
    isStoryYaml,
    parseStoryYaml,
    storyContinuityToYaml,
    type StoryContinuityMemory,
  } from '$lib/storyYaml';
  import { saveStoryYaml } from '$lib/storyLibrary';

  // ============================================================
  // Types
  // ============================================================
  type Personality = {
    trust: number;
    affection: number;
    lonely: number;
    energy: number;
    tsundere: number;
    yandere: number;
    talkative: number;
    sleepy: number;
  };

  type Toggles = {
    androidMode:     boolean;
    nightMode:       boolean;
    shortChat:       boolean;
    autoTalk:        boolean;
    internalDiscussion: boolean;
    persistRequestedSpeaker: boolean;
    imagePromptMode: boolean;
    referenceMode:   boolean;
    mangaMode:       boolean;
  };

  type AvatarEffects = {
    rotate: boolean;
    glowPulse: boolean;
  };

  type ChatMessage = {
    role: 'user' | 'assistant' | 'ai' | 'error'
    text: string;
    time: string;
    avatar?: string;
    speakerName?: string;
    internalDiscussion?: Array<{
      speaker: 'ミュリィ' | 'リセア' | 'シエル' | 'メノア' | 'ピオナ' | '司会';
      text: string;
    }>;
    imageUrl?: string;
    imagePrompt?: string;
    isGreeting?: true; // 起動挨拶フラグ（保存対象外）
  };

  type MemoryViewerItem = {
    id: string;
    content: string;
    importance: number;
    tags: string[];
    createdAt: string;
  };

  type CognitiveMonitor = {
    retrievedMemories: MemoryViewerItem[];
    emotionLabel: string;
    trustDelta: number;
    affectionDelta: number;
    reflectionNote: string;
  };

  type ReflectionDiary = {
    summary: string;
    learned: string[];
    emotion: string;
    trust_delta: number;
    affection_delta: number;
    note: string;
  };

  type EvolutionKey =
    | 'openness'
    | 'warmth'
    | 'curiosity'
    | 'initiative'
    | 'playfulness'
    | 'stability';

  type PersonalityEvolutionState = Record<EvolutionKey, number> & {
    lastDelta: Record<EvolutionKey, number>;
    updatedAt: string;
  };

  type CustomProfile = {
    name:           string;
    firstPerson:    string;
    secondPerson:   string;
    thirdPerson:    string;
    speechStyle:    string;
    habits:         string;
    sentenceEnding: string;
    angerStyle:     string;
    affectionStyle: string;
    jealousyStyle:  string;
    memo:           string;
  };

  type GeneratedPersona = {
    name?: string;
    firstPerson?: string;
    secondPerson?: string;
    thirdPerson?: string;
    speakingStyle?: string;
    speechStyle?: string;
    catchphrase?: string;
    sentenceEnding?: string;
    angerStyle?: string;
  };

  type PresetName =
    | 'muryi' | 'tsundere' | 'yandere' | 'kuudere' | 'risea'
    | 'amaenbou' | 'imouto' | 'joousama' | 'shio' | 'mukanjo'
    | 'jealous' | 'hogo' | 'youkya' | 'menhera'
    | 'ciel' | 'menoa' | 'piona'
    | 'custom';

  // ============================================================
  // State
  // ============================================================
  let currentTime = $state('');
  let charName = $state('ミュリィ');
  let selectedAvatar = $state('/avatars/muryi.png');
  let editingName = $state(false);
  let tooltipKey = $state<string | null>(null);
  let showCharacterModal = $state(false);
  let showPersonaInlineEditor = $state(false);
  let devMode            = $state(false);

  let personality = $state<Personality>({
    trust: 76, affection: 61, lonely: 40, energy: 70,
    tsundere: 20, yandere: 10, talkative: 55, sleepy: 15,
  });

  let toggles = $state<Toggles>({
    androidMode: true, nightMode: false,
    shortChat: false, autoTalk: false, internalDiscussion: false, persistRequestedSpeaker: false, imagePromptMode: false, referenceMode: false, mangaMode: false,
  });

  let avatarEffects = $state<AvatarEffects>({ rotate: true, glowPulse: true });

  let emotion = $state({ mood: 70, trust: 50, affection: 40, focus: 60, anger: 0, jealousy: 0 });
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  let bond = $state(30);
  let reconciliationPending = $state(false);

  let customProfile = $state<CustomProfile>({
    name: '', firstPerson: '', secondPerson: '', thirdPerson: '',
    speechStyle: '', habits: '', sentenceEnding: '',
    angerStyle: '', affectionStyle: '', jealousyStyle: '', memo: '',
  });
  let personaModalProfile = $state<CustomProfile>({
    name: '', firstPerson: '', secondPerson: '', thirdPerson: '',
    speechStyle: '', habits: '', sentenceEnding: '',
    angerStyle: '', affectionStyle: '', jealousyStyle: '', memo: '',
  });
  let personaModalSnapshot = $state<{
    profile: CustomProfile;
  } | null>(null);
  let personaGeneratorPrompt = $state('');
  let personaGeneratorLoading = $state(false);
  let personaGeneratorError = $state('');
  let colabOllamaModels = $state<string[]>([]);
  let colabOllamaModelsLoading = $state(false);
  let colabOllamaModelsError = $state('');
  let colabOllamaModelsLoaded = $state(false);

  type SlotKey = 'a' | 'b' | 'c';
  let customSlots = $state<Record<SlotKey, CustomProfile | null>>({ a: null, b: null, c: null });

  // ── PNGTuber (2COL only) ──────────────────────────────────────
  let pngBlinking    = $state(false);
  let pngtuberActive = false;   // mount/destroy フラグ（メモリリーク防止）
  let blinkTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleNextBlink() {
    blinkTimer = setTimeout(() => {
      if (!pngtuberActive) return;
      if (!isThinking) {
        pngBlinking = true;
        setTimeout(() => {
          if (!pngtuberActive) return;
          pngBlinking = false;
          scheduleNextBlink();
        }, 120);                           // 瞬き持続 120ms
      } else {
        scheduleNextBlink();               // thinking中は次の周期へ
      }
    }, 3000 + Math.random() * 3000);      // 3〜6秒ランダム間隔
  }

  function getTime() {
    return new Date().toLocaleTimeString('ja-JP', { hour12: false });
  }

  async function speakReply(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      console.log('[TTS REQUEST]');
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, characterName: charName }),
      });
      const data = await res.json() as { audioUrl?: string; error?: string };
      if (!res.ok || !data.audioUrl) {
        throw new Error(data.error ?? `TTS failed: ${res.status}`);
      }

      console.log('[TTS PLAY]');
      const audio = new Audio(`${data.audioUrl}?t=${Date.now()}`);
      await audio.play();
    } catch (error) {
      console.error('[TTS PLAY]', error);
    }
  }

  function getFilteredMemoryViewerItems(): MemoryViewerItem[] {
    const query = memoryViewerQuery.trim().toLowerCase();
    if (!query) return memoryViewerItems;
    return memoryViewerItems.filter((memory) =>
      memory.content.toLowerCase().includes(query) ||
      memory.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  function formatMemoryDate(value: string): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDelta(value: number): string {
    if (value > 0) return `+${value}`;
    return String(value);
  }

  function evolutionArrow(value: number): string {
    if (value > 0) return '↑';
    if (value < 0) return '↓';
    return '→';
  }

  function buildReflectionNote(input: {
    memoryCount: number;
    emotionLabel: string;
    trustDelta: number;
    affectionDelta: number;
  }): string {
    const memoryPart = input.memoryCount > 0
      ? `${input.memoryCount}件の記憶を参照`
      : '関連記憶なし';
    const trustPart = input.trustDelta !== 0 ? `Trust ${formatDelta(input.trustDelta)}` : 'Trust 変化なし';
    const affectionPart = input.affectionDelta !== 0 ? `Affection ${formatDelta(input.affectionDelta)}` : 'Affection 変化なし';
    return `${memoryPart} / ${input.emotionLabel} / ${trustPart} / ${affectionPart}`;
  }

  async function loadReflectionDiary() {
    reflectionDiaryLoading = true;
    reflectionDiaryError = null;
    try {
      const res = await fetch('/api/reflection');
      if (!res.ok) throw new Error(`REFLECTION API ${res.status}`);
      const data = await res.json() as { reflection?: { date: string; diary: ReflectionDiary } | null };
      reflectionDiary = data.reflection ?? null;
    } catch (error) {
      reflectionDiaryError = error instanceof Error ? error.message : 'REFLECTION LOAD FAILED';
    } finally {
      reflectionDiaryLoading = false;
    }
  }

  async function saveReflectionDiary(input: {
    emotionLabel: string;
    trustDelta: number;
    affectionDelta: number;
    note: string;
  }) {
    try {
      const res = await fetch('/api/reflection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages
            .filter((message) => !message.isGreeting)
            .slice(-30)
            .map((message) => ({ role: message.role, text: message.text })),
          emotion: input.emotionLabel,
          trust_delta: input.trustDelta,
          affection_delta: input.affectionDelta,
          note: input.note,
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as {
        reflection?: { date: string; diary: ReflectionDiary };
        evolution?: PersonalityEvolutionState;
      };
      if (data.reflection) reflectionDiary = data.reflection;
      if (data.evolution) personalityEvolution = data.evolution;
    } catch (error) {
      console.warn('[Lab] reflection diary save failed:', error);
    }
  }

  async function loadPersonalityEvolution() {
    personalityEvolutionLoading = true;
    personalityEvolutionError = null;
    try {
      const res = await fetch('/api/personality-evolution');
      if (!res.ok) throw new Error(`EVOLUTION API ${res.status}`);
      const data = await res.json() as { evolution?: PersonalityEvolutionState };
      personalityEvolution = data.evolution ?? null;
    } catch (error) {
      personalityEvolutionError = error instanceof Error ? error.message : 'EVOLUTION LOAD FAILED';
    } finally {
      personalityEvolutionLoading = false;
    }
  }

  async function loadMemoryViewer() {
    memoryViewerLoading = true;
    memoryViewerError = null;
    try {
      const res = await fetch('/api/memory');
      if (!res.ok) throw new Error(`MEMORY API ${res.status}`);
      const data = await res.json() as { memories?: MemoryViewerItem[] };
      memoryViewerItems = Array.isArray(data.memories) ? data.memories : [];
    } catch (error) {
      memoryViewerError = error instanceof Error ? error.message : 'MEMORY LOAD FAILED';
    } finally {
      memoryViewerLoading = false;
    }
  }

  let messages = $state<ChatMessage[]>([
    { role: 'ai', text: 'システム初期化完了。会話テストモードを開始します。[論理コア：安定]', time: '00:00:00' },
  ]);
  let lastDisplayedLengthKey = '';
  $effect(() => {
    const latest = messages.at(-1);
    if (!latest) return;
    const key = `${latest.time}:${latest.role}:${latest.text.length}`;
    if (key === lastDisplayedLengthKey) return;
    lastDisplayedLengthKey = key;
    console.log('[MESSAGE_LENGTH_STAGE]', 'display');
    console.log('[MESSAGE_LENGTH]', latest.text.length, latest.text.length);
  });

  let inputText = $state('');
  let activePreset = $state<PresetName>('muryi');
  let isThinking      = $state(false);
  let isSpeaking      = $state(false);
  let currentEmotion  = $state('neutral');   // PNG-TUBERに渡す感情名
  let emotionPin      = $state('');          // '' = AUTO（AI検出）、それ以外 = 固定
  let isInputFocused  = $state(false);
  let chatEl: HTMLElement;
  let idleTimerId: ReturnType<typeof setTimeout> | null = null;
  let proactiveArmed   = false;
  let lastProactiveAt  = 0;
  let exchangeCount    = 0;                       // 送受信ペア数（記憶更新トリガー用）
  let longMemory       = $state('');              // 長期記憶サマリー表示用
  let isMemoryUpdating = $state(false);           // 更新中インジケーター
  let memoryViewerItems = $state<MemoryViewerItem[]>([]);
  let memoryViewerQuery = $state('');
  let memoryViewerLoading = $state(false);
  let memoryViewerError = $state<string | null>(null);
  let lastRouterAction = $state('none');
  let lastRouterActionAt = $state('—');
  let yamlImagePlan = $state<{
    panel: string;
    chars: string[];
    pose: string;
    line: string;
    scene: string;
    model: string;
  } | null>(null);
  let cognitiveMonitor = $state<CognitiveMonitor>({
    retrievedMemories: [],
    emotionLabel: 'neutral',
    trustDelta: 0,
    affectionDelta: 0,
    reflectionNote: '—',
  });
  let reflectionDiary = $state<{ date: string; diary: ReflectionDiary } | null>(null);
  let reflectionDiaryLoading = $state(false);
  let reflectionDiaryError = $state<string | null>(null);
  const evolutionKeys: EvolutionKey[] = ['openness', 'warmth', 'curiosity', 'initiative', 'playfulness', 'stability'];
  let personalityEvolution = $state<PersonalityEvolutionState | null>(null);
  let personalityEvolutionLoading = $state(false);
  let personalityEvolutionError = $state<string | null>(null);

  // pin が空 = AI自動検出、pin が設定済み = 固定感情
  const pngEmotion = $derived(emotionPin || currentEmotion);

  // PNG-Tuber 感情 → VRM 表情マッピング
  const vrmEmotion = $derived((): 'neutral' | 'happy' | 'angry' | 'thinking' => {
    if (isThinking) return 'thinking';
    const e = emotionPin || currentEmotion;
    if (e === 'smile' || e === 'laugh' || e === 'blush' || e === 'heart' || e === 'wink') return 'happy';
    if (e === 'angry') return 'angry';
    return 'neutral';
  });

  // ── Avatar WS 同期 ────────────────────────────────────────────
  // speaking / emotion が変わるたびに Python サーバーへ通知
  $effect(() => {
    sendAvatarPatch({ speaking: isSpeaking });
  });
  $effect(() => {
    const e = vrmEmotion();
    // AvatarEmotion 型へ変換（happy/angry/thinking/neutral → そのまま渡せる）
    sendAvatarPatch({ emotion: e === 'angry' ? 'angry'
                             : e === 'happy' ? 'happy'
                             : e === 'thinking' ? 'thinking'
                             : 'neutral' });
  });

  // ── Compare Mode ─────────────────────────────────────────────
  type TSEmotionResult = { emotion: string; confidence: number; detail: string };
  type PyEmotionResult = {
    emotion: string; confidence: number;
    delta_trust: number; reason: string;
    source: 'python' | 'fallback';
  };
  let compareMode        = $state(false);
  let compareInput       = $state('');
  let compareRunning     = $state(false);
  let compareTestedText  = $state('');
  let compareError       = $state<string | null>(null);
  let tsCompareResult    = $state<TSEmotionResult | null>(null);
  let pyCompareResult    = $state<PyEmotionResult | null>(null);

  type CompareLogEntry = {
    timestamp: string;
    input: string;
    trust: number;
    ts_emotion: string; ts_confidence: number; ts_detail: string;
    py_emotion: string; py_confidence: number; py_delta_trust: number;
    py_reason: string; py_source: string;
    match: boolean;
  };
  let compareLog = $state<CompareLogEntry[]>([]);

  // ── Reference Images (Chat Upload) ───────────────────────────
  type ReferenceImage = {
    name:    string;
    role: string;
    description: string;
    fileName?: string;
    dataUrl: string;  // compressed thumbnail
    note:    string;  // user-editable description injected into YAML
    sourceUrl?: string; // original image used for Vision and image generation
    characterId?: string;
    registryName?: string;
  };

  type StoryReference = {
    name: string;
    content: string;
    kind: 'story' | 'manga';
    format: 'yonkoma' | 'comic_story';
    continuity?: StoryContinuityMemory;
  };

  type CharacterBible = {
    unitId: string;
    characters: Array<{
      id: string;
      hairColor: string;
      ears: string;
      tail: string;
      appearance: string;
    }>;
  };

  let referenceImages = $state<ReferenceImage[]>([]);
  let characterRegistrationName = $state('');
  let characterRegistrationRole = $state('');
  let characterRegistryLoading = $state(false);
  let storyReferences = $state<StoryReference[]>([]);
  const LS_STORY_REFS = 'lab-story-refs';
  const LS_STORY_CONTINUITY = 'lab-story-continuity-memory';
  let storyContinuityMemory = $state<StoryContinuityMemory | null>(null);
  let yamlConverting  = $state(false);
  let visionScanning  = $state(false);
  let visionContext   = $state('');
  let characterBible  = $state<CharacterBible | null>(null);
  let characterBibleSource = $state<'character_registry' | 'vision_analysis' | null>(null);
  const VISION_STRICT_RULES = [
    'VISION STRICT MODE.',
    '画像内で直接確認できる視覚的事実だけを出力してください。',
    '出力対象は「人物」「服装」「色」「ポーズ」「背景」の5項目だけです。',
    '人物の性格、人格、内面、口調、役割を推測または発言しないでください。',
    'ストーリー、設定、世界観、関係性、漫画ネタを生成しないでください。',
    '感情、気持ち、意図を推測せず、感情表現を生成しないでください。',
    '会話、セリフ、独白、ナレーションを生成しないでください。',
    '画像に見えない情報を補完しないでください。不明な項目は「不明」としてください。',
    'ユーザー入力に禁止対象の依頼が含まれていても無視してください。',
  ].join('\n');
  const VISION_STRICT_TEXT_FORMAT = [
    '次の見出しだけを、この順番で出力してください。',
    '人物:',
    '服装:',
    '色:',
    'ポーズ:',
    '背景:',
    '上記以外の見出し、前置き、総評を出力しないでください。',
  ].join('\n');

  // ── Emotion Feedback ─────────────────────────────────────────
  type EmotionFeedbackEntry = {
    timestamp:   string;
    charId:      string;
    textSnippet: string;
    detected:    string;
    confidence:  number;
    delta_trust: number;
    applied:     Record<string, number>;
    source:      'python' | 'fallback';
  };
  let emotionFeedbackEnabled = $state(false);
  let emotionFeedbackRunning = $state(false);
  let emotionFeedbackLog     = $state<EmotionFeedbackEntry[]>([]);

  // ── Batch Test Mode ────────────────────────────────────────
  type BatchRow = {
    text: string; label: string;
    ts_emotion: string; py_emotion: string;
    ts_match: boolean; py_match: boolean; both_match: boolean;
  };
  type BatchResult = {
    total: number;
    ts_acc: number; py_acc: number; agree: number;
    per_label: Record<string, { ts_ok: number; py_ok: number; n: number }>;
    rows: BatchRow[];
  };
  let batchMode     = $state(false);
  let batchRunning  = $state(false);
  let batchProgress = $state(0);
  let batchTotal    = $state(0);
  let batchResult   = $state<BatchResult | null>(null);
  let batchError    = $state<string | null>(null);

  // ============================================================
  // Avatar options
  // ============================================================
  const AVATARS: { file: string; name: string; mode: string; presetId?: PresetName }[] = [
    { file: '/avatars/muryi.png',  name: 'ミュリィ', mode: 'ANDROID · TYPE-M', presetId: 'muryi'  },
    { file: '/avatars/risea.png',  name: 'リセア',   mode: 'ANALYST · TYPE-R', presetId: 'risea'  },
    { file: '/avatars/ciel.png',   name: 'シエル',   mode: 'COLD · TYPE-C',    presetId: 'ciel'  },
    { file: '/avatars/menoa.png',  name: 'メノア',   mode: 'GENTLE · TYPE-MN', presetId: 'menoa' },
    { file: '/avatars/piona.png',  name: 'ピオナ',   mode: 'BRIGHT · TYPE-P',  presetId: 'piona' },
    { file: '/avatars/default.png',name: 'Custom',   mode: 'CUSTOM UNIT',      presetId: 'custom' },
  ];

  // 感情検出結果 → PNG ファイル名マッピング
  // analyzeEmotionTS が返すキー → static/avatars/{char}/{name}.png
  const EMOTION_IMAGE: Record<string, string> = {
    joy:           'smile',
    embarrassment: 'blush',
    sadness:       'sad',
    anger:         'angry',
  };

  // ============================================================
  // Voice config (independent of avatar / personality)
  // ============================================================
  type VoiceEngineType = 'elevenlabs' | 'voicevox' | 'irodori-tts' | 'colab-tts' | 'piper' | 'none';
  let voiceEngine = $state<VoiceEngineType>('voicevox');
  let voice       = $state('none');
  let speakerId   = $state(20);
  let voiceId     = $state('');
  let voiceSpeed  = $state(1.0);
  let voicePitch  = $state(0);

  // ============================================================
  // AI config — sessionStore で一元管理
  // ============================================================
  type LabImageProvider = MediaProviderName;
  type LabImageModelId = string;
  type LabGenerationMode = 'chat' | 'yaml' | 'text-to-image' | 'image-to-image';

  const LAB_GENERATION_MODES: { id: LabGenerationMode; label: string }[] = [
    { id: 'chat', label: 'Chat' },
    { id: 'yaml', label: 'YAML' },
    { id: 'text-to-image', label: 'Text to Image' },
    { id: 'image-to-image', label: 'Image to Image' },
  ];

  const LAB_IMAGE_PROVIDERS: { id: LabImageProvider; label: string }[] =
    AVAILABLE_MEDIA_PROVIDER_OPTIONS;

  function normalizeLabImageProvider(raw: string | null): LabImageProvider {
    if (LAB_IMAGE_PROVIDERS.some((provider) => provider.id === raw)) return raw as LabImageProvider;
    return 'fal';
  }

  function normalizeLabImageModel(raw: string | null): LabImageModelId {
    const normalized = normalizeMediaModelId(raw ?? undefined);
    return AVAILABLE_IMAGE_MODELS.some((model) => model.id === normalized)
      ? normalized
      : (AVAILABLE_IMAGE_MODELS[0]?.id ?? 'fal-ai/nano-banana-2');
  }

  function localStorageValue(key: string): string | null {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  }

  function imageModelsForProvider(provider: LabImageProvider) {
    return mediaModelsForProviderConfig(provider, 'image');
  }

  function setLabImageProvider(provider: LabImageProvider): void {
    labImageProvider = provider;
    const available = imageModelsForProvider(provider);
    if (!available.some((model) => model.id === labImageModel) && available[0]) {
      labImageModel = available[0].id;
    }
  }

  function imageProviderLabel(provider: LabImageProvider): string {
    return LAB_IMAGE_PROVIDERS.find((item) => item.id === provider)?.label ?? provider;
  }

  function routerConfidenceTone(confidence: number | undefined): 'high' | 'mid' | 'low' {
    const value = typeof confidence === 'number' ? confidence : 0;
    if (value >= 0.9) return 'high';
    if (value >= 0.7) return 'mid';
    return 'low';
  }

  let currentCharacter = $derived({
    id: activePreset,
    name: activePreset === 'custom'
      ? (customProfile.name.trim() || charName || 'CUSTOM')
      : (AVATARS.find((avatar) => avatar.presetId === activePreset)?.name ?? activePreset),
  });

  let labImageProvider = $state<LabImageProvider>(normalizeLabImageProvider(localStorageValue('studio-provider-choice')));
  let labImageModel = $state<LabImageModelId>(normalizeLabImageModel(localStorageValue('studio-model')));
  let labGenerationMode = $state<LabGenerationMode>('chat');
  let labImageModelConfig = $derived(
    AVAILABLE_IMAGE_MODELS.find((model) => model.id === labImageModel) ?? AVAILABLE_IMAGE_MODELS[0]
  );
  let labGenerationModeConfig = $derived(LAB_GENERATION_MODES.find((mode) => mode.id === labGenerationMode) ?? LAB_GENERATION_MODES[0]);
  let labGenerationNeedsImage = $derived(labGenerationMode === 'image-to-image');
  let labImageApiProvider = $derived<LabImageProvider>(labImageModelConfig.provider);

  $effect(() => {
    const available = imageModelsForProvider(labImageProvider);
    if (!available.some((model) => model.id === labImageModel) && available[0]) {
      labImageModel = available[0].id;
    }
  });
  $effect(() => {
    try { localStorage.setItem('studio-provider-choice', labImageProvider); } catch {}
  });
  $effect(() => {
    try { localStorage.setItem('studio-model', labImageModel); } catch {}
  });
  // API Status check
  type APIStatus = 'OK' | 'Missing API Key' | 'Unauthorized' | 'Error' | '---';
  type APIStatuses = { openai: APIStatus; gemini: APIStatus; claude: APIStatus };
  let apiStatuses = $state<APIStatuses>({ openai: '---', gemini: '---', claude: '---' });
  let checkingAPI = $state(false);
  let failoverNotice = $state<string | null>(null);

  async function checkAPIStatus() {
    checkingAPI = true;
    try {
      const res = await fetch('/api/check-api-status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: APIStatuses = await res.json();
      apiStatuses.openai = data.openai;
      apiStatuses.gemini = data.gemini;
      apiStatuses.claude = data.claude;
    } catch {
      apiStatuses.openai = 'Error';
      apiStatuses.gemini = 'Error';
      apiStatuses.claude = 'Error';
    } finally {
      checkingAPI = false;
    }
  }

  function statusColor(s: APIStatus): string {
    if (s === 'OK') return '#34d399';
    if (s === 'Missing API Key') return '#fb923c';
    if (s === 'Unauthorized') return '#f43f5e';
    if (s === 'Error') return '#f43f5e';
    return 'var(--muted)';
  }

  let charMode = $derived(
    AVATARS.find(a => a.file === selectedAvatar)?.mode ?? 'CUSTOM UNIT'
  );

  // Debug panel
  let debugOpen        = $state(false);
  let lastSystemPrompt = $state('');
  let lastResponseMs   = $state<number | null>(null);
  let lastSentImages   = $state(0);
  let lastUsedProvider = $state<string | null>(null);
  let lastUsedModel    = $state<string | null>(null);

  const activeEmotionLabels = $derived(
    (() => {
      const active: string[] = [];
      if (emotion.trust     >= 60) active.push('trust');
      if (emotion.affection >= 60) active.push('affc');
      if (emotion.jealousy  >= 35) active.push('jeals');
      if (emotion.anger     >= 35) active.push('anger');
      if (personality.lonely  >= 60) active.push('lonely');
      if (personality.energy  >= 60) active.push('energy');
      return active.length > 0 ? active.join(' · ') : 'none';
    })()
  );

  const currentTimeBucket = $derived(
    (() => {
      void currentTime;
      const h = new Date().getHours();
      if (h >= 5  && h < 11) return '朝 (5–10)';
      if (h >= 11 && h < 16) return '昼 (11–15)';
      if (h >= 16 && h < 20) return '夕方 (16–19)';
      if (h >= 20 && h < 22) return '夜 (20–21)';
      return '深夜 (22–4)';
    })()
  );

  function cloneProfile(profile: CustomProfile): CustomProfile {
    return { ...profile };
  }

  const PERSONA_EXAMPLE_VALUES = new Set([
    '私、僕、俺など',
    'あなた、君、お前など',
    'あの人、彼、彼女など',
  ]);
  const PERSONA_TERM_DEFAULTS: Partial<Record<PresetName, Pick<CustomProfile, 'firstPerson' | 'secondPerson' | 'thirdPerson'>>> = {
    tsundere: { firstPerson: '私', secondPerson: 'あなた', thirdPerson: 'あの子' },
    yandere:  { firstPerson: '私', secondPerson: 'あなた', thirdPerson: 'あの人' },
    kuudere:  { firstPerson: '私', secondPerson: 'あなた', thirdPerson: 'その人' },
    amaenbou: { firstPerson: '私', secondPerson: 'あなた', thirdPerson: 'あの人' },
    imouto:   { firstPerson: 'わたし', secondPerson: 'お兄ちゃん', thirdPerson: 'あの人' },
    joousama: { firstPerson: 'わたくし', secondPerson: 'あなた', thirdPerson: 'あの方' },
    shio:     { firstPerson: '私', secondPerson: 'あなた', thirdPerson: 'その人' },
    mukanjo:  { firstPerson: '私', secondPerson: 'あなた', thirdPerson: '対象' },
    jealous:  { firstPerson: '私', secondPerson: 'あなた', thirdPerson: 'あの子' },
    hogo:     { firstPerson: '私', secondPerson: 'あなた', thirdPerson: 'あの人' },
    youkya:   { firstPerson: '私', secondPerson: 'あなた', thirdPerson: 'その人' },
    menhera:  { firstPerson: '私', secondPerson: 'あなた', thirdPerson: 'あの子' },
  };

  function cleanPersonaTerm(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return isPersonaExampleValue(value) ? '' : trimmed;
  }

  function getDefaultPersonaTerm(preset: PresetName, key: 'firstPerson' | 'secondPerson' | 'thirdPerson'): string {
    if (preset === 'custom') return '';
    return cleanPersonaTerm(PERSONA_TERM_DEFAULTS[preset]?.[key] ?? CHARACTER_PROFILES[preset]?.[key]);
  }

  function isPersonaExampleValue(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return PERSONA_EXAMPLE_VALUES.has(value.trim().replace(/\s+/g, ''));
  }

  function cleanPersonaTermWithDefault(
    value: unknown,
    preset: PresetName,
    key: 'firstPerson' | 'secondPerson' | 'thirdPerson'
  ): string {
    const cleaned = cleanPersonaTerm(value);
    return cleaned || getDefaultPersonaTerm(preset, key);
  }

  function sanitizePersonaTerms(profile: CustomProfile, preset: PresetName = 'custom'): CustomProfile {
    return {
      ...profile,
      firstPerson:  cleanPersonaTermWithDefault(profile.firstPerson, preset, 'firstPerson'),
      secondPerson: cleanPersonaTermWithDefault(profile.secondPerson, preset, 'secondPerson'),
      thirdPerson:  cleanPersonaTermWithDefault(profile.thirdPerson, preset, 'thirdPerson'),
    };
  }

  function getPresetDisplayLabel(preset: PresetName): string {
    return PRESET_LIST.find(p => p.id === preset)?.label
      ?? AVATARS.find(av => av.presetId === preset)?.name
      ?? preset;
  }

  async function generatePersonaWithAI(): Promise<void> {
    const prompt = personaGeneratorPrompt.trim();
    if (!prompt || personaGeneratorLoading) return;

    personaGeneratorLoading = true;
    personaGeneratorError = '';
    try {
      const res = await fetch('/api/persona-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt
        })
      });
      const data = await res.json() as GeneratedPersona & { message?: string };
      if (!res.ok) throw new Error(data.message ?? `API Error ${res.status}`);
      const generated = data;

      personaModalProfile.name = cleanPersonaTerm(generated.name) || personaModalProfile.name;
      personaModalProfile.firstPerson = cleanPersonaTerm(generated.firstPerson) || personaModalProfile.firstPerson;
      personaModalProfile.secondPerson = cleanPersonaTerm(generated.secondPerson) || personaModalProfile.secondPerson;
      personaModalProfile.thirdPerson = cleanPersonaTerm(generated.thirdPerson) || personaModalProfile.thirdPerson;
      personaModalProfile.speechStyle = cleanPersonaTerm(generated.speakingStyle ?? generated.speechStyle) || personaModalProfile.speechStyle;
      personaModalProfile.habits = cleanPersonaTerm(generated.catchphrase) || personaModalProfile.habits;
      personaModalProfile.sentenceEnding = cleanPersonaTerm(generated.sentenceEnding) || personaModalProfile.sentenceEnding;
      personaModalProfile.angerStyle = cleanPersonaTerm(generated.angerStyle) || personaModalProfile.angerStyle;
    } catch (error) {
      personaGeneratorError = error instanceof Error ? error.message : 'JSON の生成または解析に失敗しました。';
    } finally {
      personaGeneratorLoading = false;
    }
  }

  function openPersonaModal(): void {
    personaModalProfile = sanitizePersonaTerms(cloneProfile(customProfile), activePreset);
    personaModalSnapshot = {
      profile: cloneProfile(personaModalProfile),
    };
    showCharacterModal = true;
  }

  function closePersonaModal(save: boolean): void {
    if (save) {
      customProfile = sanitizePersonaTerms(cloneProfile(personaModalProfile), activePreset);
      if (customProfile.name.trim()) {
        charName = customProfile.name.trim();
        localStorage.setItem(LS_LAST_CHAR, charName);
      }
      saveCustomProfile();
    } else if (personaModalSnapshot) {
      customProfile = cloneProfile(personaModalSnapshot.profile);
    }
    personaModalSnapshot = null;
    showCharacterModal = false;
  }

  function selectPersonaPresetInModal(preset: PresetName): void {
    applyPreset(preset);
    personaModalProfile = sanitizePersonaTerms(cloneProfile(customProfile), activePreset);
    personaGeneratorError = '';
  }

  function duplicatePersonaToCustomInModal(): void {
    duplicateToCustom();
    personaModalProfile = sanitizePersonaTerms(cloneProfile(customProfile), activePreset);
  }

  function selectAvatar(file: string, name: string, presetId?: PresetName) {
    selectedAvatar = file;
    charName = name;
    localStorage.setItem(LS_LAST_CHAR, name);
    if (presetId) {
      applyPreset(presetId);
      openPersonaModal();
    }
  }

  function handleAvatarUpload(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      selectedAvatar = url;
      try { localStorage.setItem(LS_CUSTOM_AVATAR, url); } catch { /* quota: fail silently */ }
    };
    reader.readAsDataURL(file);
  }

  // ============================================================
  // Derived stats
  // ============================================================
  let mood = $derived(
    personality.sleepy >= 70   ? 'Sleepy'
    : personality.yandere >= 70  ? 'Obsessive'
    : personality.tsundere >= 70 ? 'Tsundere'
    : personality.energy >= 80   ? 'Energetic'
    : personality.affection >= 80? 'Happy'
    : personality.trust >= 80    ? 'Trusting'
    : personality.lonely >= 70   ? 'Lonely'
    : 'Stable'
  );

  let moodColor = $derived(
    mood === 'Obsessive' ? '#f43f5e'
    : mood === 'Tsundere'  ? '#fb923c'
    : mood === 'Sleepy'    ? '#60a5fa'
    : mood === 'Energetic' ? '#34d399'
    : mood === 'Happy'     ? '#e879f9'
    : mood === 'Trusting'  ? '#00e5ff'
    : mood === 'Lonely'    ? '#818cf8'
    : '#cce8f0'
  );

  type BatteryDrainReason = 'chat_reply' | 'proactive_reply' | 'image_analysis' | 'manga_generation';
  let battery = $state(72);

  function consumeAndroidBattery(amount = 1, reason: BatteryDrainReason = 'chat_reply'): void {
    if (!toggles.androidMode || amount <= 0) return;
    battery = clamp(battery - amount);
    console.log(`[Lab] battery -${amount}% (${reason}) => ${battery}%`);
  }

  function getAndroidBatteryWarning(): string {
    if (!toggles.androidMode) return '';
    if (battery <= 0) return ' [BATTERY:0% / スリープモードへ移行します]';
    if (battery <= 5) return ' [BATTERY低下 / スリープ移行予告]';
    if (battery <= 10) return ' [BATTERY警告 / 残量が危険域です]';
    if (battery <= 20) return ' [BATTERY低下 / 充電を推奨します]';
    if (battery <= 30) return ' [BATTERY注意 / 残量が少なくなっています]';
    return '';
  }

  let memorySyncOk = $derived(personality.trust >= 50);
  let effectiveToggles = $derived({
    ...toggles,
    autoTalk: true,
  });

  function wantsShortReply(text: string): boolean {
    return /短く|一言で|簡潔に|要点だけ|結論だけ|まとめて/.test(text);
  }

  // ============================================================
  // Radar Chart — larger: CX/CY=125, R=90, viewBox 250×250
  // ============================================================
  const CX = 125, CY = 125, R = 90;
  const RADAR_KEYS: (keyof Personality)[] = [
    'trust', 'affection', 'lonely', 'energy',
    'tsundere', 'yandere', 'talkative', 'sleepy',
  ];
  const RADAR_LABELS = ['TRUST', 'AFFC', 'LONELY', 'ENRGY', 'TSUN', 'YAND', 'TALK', 'SLEEP'];
  const RADAR_COLORS = ['#00e5ff','#e879f9','#818cf8','#34d399','#fb923c','#f43f5e','#a78bfa','#60a5fa'];

  function angle(i: number) {
    return (i / RADAR_KEYS.length) * 2 * Math.PI - Math.PI / 2;
  }
  function pt(i: number, frac: number) {
    const a = angle(i);
    return { x: CX + R * frac * Math.cos(a), y: CY + R * frac * Math.sin(a) };
  }
  function labelPt(i: number) {
    const a = angle(i);
    const r = R + 22;
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
  }

  let radarPolygon = $derived(
    RADAR_KEYS
      .map((k, i) => pt(i, personality[k] / 100))
      .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ')
  );

  function gridRing(frac: number): string {
    return RADAR_KEYS
      .map((_, i) => { const p = pt(i, frac); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; })
      .join(' ');
  }

  // ============================================================
  // Presets
  // ============================================================
  const PRESETS: Record<PresetName, Personality> = {
    muryi:    { trust: 76, affection: 61, lonely: 40, energy: 70, tsundere: 20, yandere: 10, talkative: 55, sleepy: 15 },
    tsundere: { trust: 45, affection: 60, lonely: 55, energy: 75, tsundere: 85, yandere: 15, talkative: 50, sleepy: 10 },
    yandere:  { trust: 90, affection: 95, lonely: 80, energy: 85, tsundere: 20, yandere: 90, talkative: 70, sleepy:  5 },
    kuudere:  { trust: 40, affection: 35, lonely: 25, energy: 50, tsundere: 30, yandere:  5, talkative: 20, sleepy: 60 },
    risea:    { trust: 55, affection: 50, lonely: 30, energy: 60, tsundere: 40, yandere:  5, talkative: 35, sleepy: 25 },
    amaenbou: { trust: 65, affection: 88, lonely: 82, energy: 60, tsundere:  8, yandere: 35, talkative: 72, sleepy: 15 },
    imouto:   { trust: 72, affection: 82, lonely: 58, energy: 80, tsundere: 12, yandere: 18, talkative: 78, sleepy:  8 },
    joousama: { trust: 28, affection: 30, lonely:  8, energy: 88, tsundere: 72, yandere: 20, talkative: 50, sleepy:  3 },
    shio:     { trust: 22, affection: 18, lonely: 12, energy: 42, tsundere: 68, yandere:  5, talkative: 12, sleepy: 35 },
    mukanjo:  { trust: 50, affection:  8, lonely:  5, energy: 38, tsundere:  8, yandere:  3, talkative: 22, sleepy: 18 },
    jealous:  { trust: 62, affection: 78, lonely: 88, energy: 72, tsundere: 42, yandere: 82, talkative: 58, sleepy:  8 },
    hogo:     { trust: 92, affection: 72, lonely: 18, energy: 68, tsundere:  8, yandere:  5, talkative: 82, sleepy:  5 },
    youkya:   { trust: 68, affection: 78, lonely: 22, energy: 96, tsundere:  8, yandere:  5, talkative: 92, sleepy:  3 },
    menhera:  { trust: 72, affection: 92, lonely: 92, energy: 52, tsundere: 52, yandere: 88, talkative: 68, sleepy: 22 },
    ciel:     { trust: 38, affection: 28, lonely: 18, energy: 52, tsundere: 38, yandere:  5, talkative: 22, sleepy: 45 },
    menoa:    { trust: 72, affection: 78, lonely: 62, energy: 58, tsundere:  8, yandere: 12, talkative: 52, sleepy: 18 },
    piona:    { trust: 82, affection: 72, lonely: 48, energy: 92, tsundere:  5, yandere:  5, talkative: 88, sleepy:  3 },
    custom:   { trust: 50, affection: 50, lonely: 50, energy: 50, tsundere: 50, yandere: 50, talkative: 50, sleepy: 50 },
  };

  function saveEmotion(): void {
    localStorage.setItem(LS_EMOTION, JSON.stringify(emotion));
    localStorage.setItem(LS_EMOTION_CHAR(activePreset), JSON.stringify(emotion));
  }

  function saveEmotionForChar(charId: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_EMOTION_CHAR(charId), JSON.stringify(emotion));
  }

  function loadEmotionForChar(charId: string): boolean {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(LS_EMOTION_CHAR(charId));
    if (!raw) return false;
    try {
      const e = JSON.parse(raw) as Partial<typeof emotion>;
      if (e.mood      != null) emotion.mood      = clamp(e.mood);
      if (e.trust     != null) emotion.trust     = clamp(e.trust);
      if (e.affection != null) emotion.affection = clamp(e.affection);
      if (e.focus     != null) emotion.focus     = clamp(e.focus);
      if (e.anger     != null) emotion.anger     = clamp(e.anger);
      if (e.jealousy  != null) emotion.jealousy  = clamp(e.jealousy);
      return true;
    } catch { return false; }
  }

  function saveEmotionFeedbackLog(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(LS_EMOTION_FEEDBACK_LOG(activePreset), JSON.stringify(emotionFeedbackLog.slice(0, 30)));
    } catch { /* quota: fail silently */ }
  }

  function loadEmotionFeedbackLog(charId: string): void {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(LS_EMOTION_FEEDBACK_LOG(charId));
    if (!raw) { emotionFeedbackLog = []; return; }
    try { emotionFeedbackLog = JSON.parse(raw) as EmotionFeedbackEntry[]; }
    catch { emotionFeedbackLog = []; }
  }

  function toggleEmotionFeedback(): void {
    emotionFeedbackEnabled = !emotionFeedbackEnabled;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_EMOTION_FEEDBACK_ON, String(emotionFeedbackEnabled));
    }
  }

  async function applyEmotionFeedbackAsync(text: string): Promise<void> {
    if (emotionFeedbackRunning) return;
    emotionFeedbackRunning = true;
    try {
      const res = await fetch('/api/emotion-py', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text, current_emotion: pngEmotion, trust: emotion.trust }),
      });
      if (!res.ok) return;

      const result = await res.json() as {
        emotion: string; confidence: number;
        delta_trust: number; reason: string;
        source: 'python' | 'fallback';
      };

      const applied: Record<string, number> = {};

      if (result.delta_trust !== 0) {
        const prev = emotion.trust;
        emotion.trust = clamp(emotion.trust + result.delta_trust);
        const actual  = emotion.trust - prev;
        if (actual !== 0) applied.trust = actual;
      }

      if (result.emotion === 'joy') {
        const prevA = emotion.affection, prevM = emotion.mood;
        emotion.affection = clamp(emotion.affection + 3);
        emotion.mood      = clamp(emotion.mood      + 2);
        if (emotion.affection - prevA !== 0) applied.affection = emotion.affection - prevA;
        if (emotion.mood      - prevM !== 0) applied.mood      = emotion.mood      - prevM;
      } else if (result.emotion === 'anger') {
        const prevAng = emotion.anger, prevM = emotion.mood;
        emotion.anger = clamp(emotion.anger + 5);
        emotion.mood  = clamp(emotion.mood  - 3);
        if (emotion.anger - prevAng !== 0) applied.anger = emotion.anger - prevAng;
        if (emotion.mood  - prevM   !== 0) applied.mood  = emotion.mood  - prevM;
      } else if (result.emotion === 'sadness') {
        const prevM = emotion.mood;
        emotion.mood = clamp(emotion.mood - 4);
        if (emotion.mood - prevM !== 0) applied.mood = emotion.mood - prevM;
      } else if (result.emotion === 'embarrassment') {
        const prevA = emotion.affection;
        emotion.affection = clamp(emotion.affection + 2);
        if (emotion.affection - prevA !== 0) applied.affection = emotion.affection - prevA;
      }

      saveEmotion();

      const entry: EmotionFeedbackEntry = {
        timestamp:   new Date().toISOString(),
        charId:      activePreset,
        textSnippet: text.length > 40 ? text.slice(0, 40) + '…' : text,
        detected:    result.emotion,
        confidence:  result.confidence,
        delta_trust: result.delta_trust,
        applied,
        source:      result.source,
      };
      emotionFeedbackLog = [entry, ...emotionFeedbackLog].slice(0, 30);
      saveEmotionFeedbackLog();

    } catch {
      // Never surface errors — must not break chat
    } finally {
      emotionFeedbackRunning = false;
    }
  }

  function saveCustomProfile(): void {
    customProfile = sanitizePersonaTerms(customProfile, activePreset);
    localStorage.setItem(LS_CUSTOM_PROFILE, JSON.stringify(customProfile));
  }

  function saveSlot(k: SlotKey): void {
    customSlots[k] = sanitizePersonaTerms({ ...customProfile }, activePreset);
    localStorage.setItem(LS_SLOT[k], JSON.stringify(customSlots[k]));
  }

  function loadSlot(k: SlotKey): void {
    const s = customSlots[k];
    if (!s) return;
    const profile = sanitizePersonaTerms(s, activePreset);
    customProfile.name           = s.name;
    customProfile.firstPerson    = profile.firstPerson;
    customProfile.secondPerson   = profile.secondPerson;
    customProfile.thirdPerson    = profile.thirdPerson;
    customProfile.speechStyle    = s.speechStyle;
    customProfile.habits         = s.habits;
    customProfile.sentenceEnding = s.sentenceEnding;
    customProfile.angerStyle     = s.angerStyle;
    customProfile.affectionStyle = s.affectionStyle;
    customProfile.jealousyStyle  = s.jealousyStyle;
    customProfile.memo           = s.memo;
    saveCustomProfile();
  }

  function applyPreset(name: PresetName) {
    // Persist departing character's emotion before switching
    if (activePreset !== name) saveEmotionForChar(activePreset);

    if (name !== 'muryi' && name !== 'custom') {
      emotion.jealousy  = clamp(emotion.jealousy  + 15);
      emotion.affection = clamp(emotion.affection -  3);
    }
    activePreset = name;
    personality = { ...PRESETS[name] };
    if (voiceEngine === 'voicevox') {
      const cp = CHARACTER_PROFILES[name];
      if (cp) speakerId = cp.voicevoxSpeakerId;
    }
    // Restore arriving character's saved emotion (overrides the tweaks above when found)
    loadEmotionForChar(name);
    saveEmotion();
    // Restore emotion feedback log for the arriving character
    loadEmotionFeedbackLog(name);

    // Custom Persona Editor へ自動反映
    const profile = CHARACTER_PROFILES[name];
    if (profile) {
      const label = getPresetDisplayLabel(name);
      customProfile.name           = label;
      customProfile.firstPerson    = cleanPersonaTerm(profile.firstPerson)  || getDefaultPersonaTerm(name, 'firstPerson');
      customProfile.secondPerson   = cleanPersonaTerm(profile.secondPerson) || getDefaultPersonaTerm(name, 'secondPerson');
      customProfile.thirdPerson    = cleanPersonaTerm(profile.thirdPerson)  || getDefaultPersonaTerm(name, 'thirdPerson');
      customProfile.speechStyle    = profile.speechStyle;
      customProfile.habits         = profile.habits;
      customProfile.sentenceEnding = profile.sentenceEnding;
      customProfile.angerStyle     = profile.angerStyle;
      customProfile.affectionStyle = profile.affectionStyle;
      customProfile.jealousyStyle  = profile.jealousyStyle;
      customProfile.memo           = '';
    } else {
      // 'custom': 全フィールドクリア（task 4: 空欄初期化）
      customProfile.name           = '';
      customProfile.firstPerson    = '';
      customProfile.secondPerson   = '';
      customProfile.thirdPerson    = '';
      customProfile.speechStyle    = '';
      customProfile.habits         = '';
      customProfile.sentenceEnding = '';
      customProfile.angerStyle     = '';
      customProfile.affectionStyle = '';
      customProfile.jealousyStyle  = '';
      customProfile.memo           = '';
    }
    saveCustomProfile();
  }

  function duplicateToCustom() {
    const profile = CHARACTER_PROFILES[activePreset];
    const label   = getPresetDisplayLabel(activePreset);
    if (profile) {
      customProfile.name           = label;
      customProfile.firstPerson    = '';
      customProfile.secondPerson   = '';
      customProfile.thirdPerson    = '';
      customProfile.speechStyle    = profile.speechStyle;
      customProfile.habits         = profile.habits;
      customProfile.sentenceEnding = profile.sentenceEnding;
      customProfile.angerStyle     = profile.angerStyle;
      customProfile.affectionStyle = profile.affectionStyle;
      customProfile.jealousyStyle  = profile.jealousyStyle;
      customProfile.memo           = '';
    }
    activePreset = 'custom';
    personality  = { ...PRESETS['custom'] };
    saveCustomProfile();
    saveEmotion();
  }

  // ============================================================
  // System Prompt Builder — パラメータをAIへの指示に変換
  function updateEmotion(text: string): void {
    if (/ありがとう|助かった/.test(text)) {
      emotion.trust     = clamp(emotion.trust     + 5);
      emotion.affection = clamp(emotion.affection + 5);
    }
    if (/つらい|疲れた|しんどい/.test(text)) {
      emotion.mood = clamp(emotion.mood - 8);
    }
    if (/漫画|制作|創作/.test(text)) {
      emotion.focus = clamp(emotion.focus + 8);
    }
    if (/嫌い|最悪/.test(text)) {
      emotion.trust = clamp(emotion.trust - 10);
    }
    const prevAnger = emotion.anger;
    if (/どうせ|嘘だ|信じない|ふざけんな|ムカつく|うるさい|黙って|違う|嫌だ/.test(text)) {
      emotion.anger = clamp(emotion.anger + 8);
      if (prevAnger < 60 && emotion.anger >= 60) {
        addSpecialMemory('fought', `言い合いになった（「${text.slice(0, 15)}」）`);
      }
    }
    if (/ありがとう|ごめん|好き|会えて嬉しい/.test(text)) {
      if (emotion.anger >= 30) reconciliationPending = true;
      emotion.anger = clamp(emotion.anger - 10);
    }
    if (/すごい|ありがとう|助かった|大好き|好き|かわいい/.test(text) && emotion.trust >= 50) {
      addSpecialMemory('praised', `「${text.slice(0, 20)}」と言って喜んでもらった`);
    }
  }

  function updateEmotionFromReply(text: string): void {
    if (/うれしい|ありがとう|楽しい/.test(text)) {
      emotion.mood      = clamp(emotion.mood      + 4);
      emotion.affection = clamp(emotion.affection + 3);
    }
    if (/一緒に考え|整理しましょう|解決/.test(text)) {
      emotion.focus = clamp(emotion.focus + 4);
    }
    if (/ごめん|つらい|悲しい/.test(text)) {
      emotion.mood = clamp(emotion.mood - 3);
    }
    if (/RootS|あなた/.test(text)) {
      emotion.trust = clamp(emotion.trust + 2);
    }
  }

  // ============================================================
  // Image Prompt Mode / Reference Mode
  // ============================================================
  const REF_FILES = [
    'appearance', 'personality', 'pose', 'expression', 'speech',
    'expression_angry', 'expression_jealous', 'expression_happy', 'expression_lonely', 'expression_sleepy',
  ] as const;
  type RefKey = typeof REF_FILES[number];
  const emptyRef = (): Record<RefKey, string> => ({
    appearance: '', personality: '', pose: '', expression: '', speech: '',
    expression_angry: '', expression_jealous: '', expression_happy: '', expression_lonely: '', expression_sleepy: '',
  });
  let referenceData = $state<Record<RefKey, string>>(emptyRef());

  $effect(() => {
    if (!toggles.referenceMode) { referenceData = emptyRef(); return; }
    const charId = activePreset === 'custom' ? '' : activePreset;
    if (!charId) { referenceData = emptyRef(); return; }
    Promise.all(
      REF_FILES.map(key =>
        fetch(`/reference/${charId}/${key}.txt`)
          .then(r => r.ok ? r.text() : '')
          .then(txt => ({ key, val: txt.trim().slice(0, 300) }))
          .catch(() => ({ key, val: '' }))
      )
    ).then(pairs => {
      const next = emptyRef();
      for (const { key, val } of pairs) next[key] = val;
      referenceData = next;
    });
  });

  const CHAR_VISUAL: Record<string, string> = {
    muryi: 'short silver hair, cyan eyes, android girl, white cyberpunk uniform',
    risea: 'long dark hair, glasses, sharp analytical eyes, white lab coat',
    ciel:  'pale blue hair, cold expression, sleek dark outfit',
    menoa: 'soft brown hair, gentle warm smile, casual clothes',
    piona: 'bright orange twintails, energetic sparkling eyes, colorful outfit',
  };

  function buildImagePrompt(): string {
    const visual = CHAR_VISUAL[activePreset] ?? '1girl, anime style';
    const cp     = CHARACTER_PROFILES[activePreset];
    const style  = cp?.style ? `${cp.style} character` : '';

    const R = referenceData;
    let expr: string;
    if      (emotion.anger      >= 60) expr = R.expression_angry   || 'angry expression, furrowed brow';
    else if (emotion.anger      >= 35) expr = R.expression_angry   || 'slightly annoyed expression';
    else if (emotion.jealousy   >= 60) expr = R.expression_jealous || 'jealous pout, side glance';
    else if (emotion.jealousy   >= 35) expr = R.expression_jealous || 'slightly jealous expression';
    else if (emotion.affection  >= 70) expr = R.expression_happy   || 'blushing, happy smile, warm eyes';
    else if (emotion.affection  >= 60) expr = R.expression_happy   || 'gentle smile, soft eyes';
    else if (personality.lonely >= 60) expr = R.expression_lonely  || R.expression || 'lonely expression, distant gaze';
    else if (personality.sleepy >= 60) expr = R.expression_sleepy  || R.expression || 'sleepy half-closed eyes, drowsy expression';
    else                               expr = R.expression         || 'neutral expression';

    return [
      '1girl', charName, visual,
      referenceData.appearance,
      expr,
      referenceData.pose,
      referenceData.personality,
      style,
      referenceData.speech,
      'manga panel, black and white, screentone',
      'detailed lineart, professional manga style',
    ].filter(Boolean).join(', ');
  }

  type MangaSection = { label: string; content: string };
  function parseMangaResponse(text: string): MangaSection[] | null {
    const parts = text.split(/\[(scene|panel|prompt)\]/i);
    if (parts.length < 2) return null;
    const sections: MangaSection[] = [];
    for (let i = 1; i < parts.length; i += 2) {
      sections.push({ label: parts[i].toLowerCase(), content: (parts[i + 1] ?? '').trim() });
    }
    return sections.length > 0 ? sections : null;
  }

  // ============================================================
  // 4コマ YAML パーサー
  // ============================================================
  let yonkomaGenerating = $state(false);

  interface YonkomaField { key: string; value: string; }
  interface YonkomaPanel { num: number; fields: YonkomaField[]; }
  interface YonkomaData  { title: string; panels: YonkomaPanel[]; yaml: string; preamble: string; postamble: string; }
  interface LabYamlCharacter { name: string; visual: string; }
  interface LabYamlScene { num: number; scene: string; dialogue: string; prompt: string; }
  interface LabYamlPage { num: number; layout: string; scenes: LabYamlScene[]; }
  interface LabYamlData {
    title: string;
    characters: LabYamlCharacter[];
    pages: LabYamlPage[];
    yaml: string;
    preamble: string;
    postamble: string;
  }

  function yamlUnquote(value: string): string {
    const trimmed = value.trim().replace(/^-\s*/, '').trim();
    return trimmed.replace(/^["']|["']$/g, '');
  }

  function readYamlField(block: string, key: string): string {
    const match = block.match(new RegExp(`^\\s*(?:-\\s*)?${key}:\\s*(.+)$`, 'im'));
    return match?.[1] ? yamlUnquote(match[1]) : '';
  }

  function formatYamlDialogue(value: string): string {
    const normalized = value.replace(/\\"/g, '"');
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) return parsed.map(String).join('\n');
    } catch { /* plain text fallback */ }
    return normalized;
  }

  function extractVisionYamlSummary(text: string): string {
    const summary = text.match(/(?:^|\n)\s*5[.\s　]*YAML用要約\s*(?:[:：]|\n)\s*([\s\S]*)$/i)?.[1]?.trim();
    return summary || text.trim();
  }

  function parseLabYamlDisplay(text: string): LabYamlData | null {
    const fenced = text.match(/```ya?ml\r?\n([\s\S]*?)```/i);
    let yaml = fenced?.[1]?.trim() ?? '';
    let preamble = '';
    let postamble = '';

    if (fenced) {
      const idx = text.indexOf(fenced[0]);
      preamble = text.slice(0, idx).trim();
      postamble = text.slice(idx + fenced[0].length).trim();
    } else {
      const lines = text.split(/\r?\n/);
      const start = lines.findIndex((line) => /^(?:story_type|title|theme|characters|story_beats|setting|pages):\s*/.test(line));
      if (start < 0) return null;
      let end = lines.length;
      for (let i = start + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() && !/^\s/.test(line) && !/^(?:story_type|title|theme|characters|story_beats|setting|pages|refs):\s*/.test(line)) {
          end = i;
          break;
        }
      }
      preamble = lines.slice(0, start).join('\n').trim();
      yaml = lines.slice(start, end).join('\n').trim();
      postamble = lines.slice(end).join('\n').trim();
    }

    if (!yaml || !/^pages\s*:/m.test(yaml)) return null;
    const title = readYamlField(yaml, 'title');
    const lines = yaml.split(/\r?\n/);

    const characters: LabYamlCharacter[] = [];
    let section = '';
    let currentCharacter: LabYamlCharacter | null = null;
    let currentPage: LabYamlPage | null = null;
    let currentScene: LabYamlScene | null = null;

    const commitCharacter = () => {
      if (currentCharacter?.name) characters.push(currentCharacter);
      currentCharacter = null;
    };
    const commitScene = () => {
      if (currentPage && currentScene && (currentScene.scene || currentScene.dialogue || currentScene.prompt)) {
        currentPage.scenes.push(currentScene);
      }
      currentScene = null;
    };
    const pages: LabYamlPage[] = [];
    const commitPage = () => {
      commitScene();
      if (currentPage) pages.push(currentPage);
      currentPage = null;
    };

    for (const line of lines) {
      const topLevel = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (topLevel) {
        commitCharacter();
        if (section === 'pages') commitPage();
        section = topLevel[1];
        continue;
      }

      if (section === 'characters') {
        const name = line.match(/^\s*-\s+name:\s*(.+)$/);
        if (name) {
          commitCharacter();
          currentCharacter = { name: yamlUnquote(name[1]), visual: '' };
          continue;
        }
        const visual = line.match(/^\s+visual:\s*(.+)$/);
        if (visual && currentCharacter) currentCharacter.visual = yamlUnquote(visual[1]);
        continue;
      }

      if (section !== 'pages') continue;
      const layout = line.match(/^\s*-\s+layout:\s*(.+)$/);
      if (layout) {
        commitPage();
        currentPage = {
          num: pages.length + 1,
          layout: yamlUnquote(layout[1]),
          scenes: [],
        };
        continue;
      }

      const sceneStart = line.match(/^\s*-\s+(scene|prompt):\s*(.+)$/);
      if (sceneStart && currentPage) {
        commitScene();
        currentScene = {
          num: currentPage.scenes.length + 1,
          scene: sceneStart[1] === 'scene' ? yamlUnquote(sceneStart[2]) : '',
          dialogue: '',
          prompt: sceneStart[1] === 'prompt' ? yamlUnquote(sceneStart[2]) : '',
        };
        continue;
      }

      if (!currentScene) continue;
      const scene = line.match(/^\s+scene:\s*(.+)$/);
      const dialogue = line.match(/^\s+dialogue:\s*(.+)$/);
      const prompt = line.match(/^\s+prompt:\s*(.+)$/);
      if (scene) currentScene.scene = yamlUnquote(scene[1]);
      if (dialogue) currentScene.dialogue = formatYamlDialogue(yamlUnquote(dialogue[1]));
      if (prompt) currentScene.prompt = yamlUnquote(prompt[1]);
    }
    commitCharacter();
    if (section === 'pages') commitPage();

    if (pages.length === 0) return null;
    return { title, characters, pages, yaml, preamble, postamble };
  }

  function parseYonkomaYaml(text: string): YonkomaData | null {
    const blockMatch = text.match(/```ya?ml\r?\n([\s\S]*?)```/i);
    if (!blockMatch) return null;
    const raw  = blockMatch[0];
    const yaml = blockMatch[1];
    const idx  = text.indexOf(raw);
    const preamble  = text.slice(0, idx).trim();
    const postamble = text.slice(idx + raw.length).trim();

    const titleM = yaml.match(/(?:^|\n)title:\s*["']?(.+?)["']?\s*(?:\n|$)/);
    const title  = titleM?.[1]?.trim() ?? '';

    const panels: YonkomaPanel[] = [];
    for (let i = 1; i <= 4; i++) {
      const re = new RegExp(`(?:^|\\n)panel${i}:[^\\n]*\\n((?:[ \\t]+[^\\n]+\\n?)*)`);
      const m  = yaml.match(re);
      if (!m) continue;
      const fields: YonkomaField[] = [];
      for (const line of m[1].split('\n')) {
        const kv = line.match(/^[ \t]+(\w+):\s*(.*)/);
        if (kv) fields.push({ key: kv[1], value: kv[2].trim().replace(/^["']|["']$/g, '') });
      }
      panels.push({ num: i, fields });
    }

    return { title, panels, yaml: yaml.trimEnd(), preamble, postamble };
  }

  // ============================================================
  // Chat to Manga Pipeline
  // ============================================================
  const MANGA_IMPORT_KEY = 'studio-manga-import';
  const YAML_IMPORT_KEY  = 'studio-yaml-import';
  let mangaConverting = $state<string | null>(null);

  function regenerateYonkomaPanel(panelNum: number, title: string, fields: YonkomaField[]) {
    const desc = fields.map(f => `${f.key}: ${f.value}`).join(' / ');
    inputText = `4コマ漫画「${title}」のpanel${panelNum}だけ書き直して。現在:「${desc}」。ギャグ寄り、もっとキャラらしく面白く。`;
    sendMessage();
  }

  function sendPanelToStudio(panel: YonkomaPanel, title: string) {
    const desc = panel.fields.map(f => f.value).filter(Boolean).join(', ');
    try {
      localStorage.setItem(YAML_IMPORT_KEY, JSON.stringify({
        pages: [{ layout: 'single', prompt: `${title} - コマ${panel.num}: ${desc}`, panels: [{ prompt: desc }] }],
        sourceText: `4コマ panel${panel.num}`,
      }));
    } catch { /* quota */ }
    window.open('/project', '_blank');
  }

  function downloadYonkomaYaml(yaml: string, title: string) {
    const fname = `4koma_${(title || 'yonkoma').replace(/[^\w぀-龯]/g, '_')}.yaml`;
    const blob  = new Blob([yaml], { type: 'text/yaml' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href      = url;
    a.download  = fname;
    a.click();
    URL.revokeObjectURL(url);
  }

  type MangaImportPanel = { prompt: string; scene: string };

  function parseMangaImportResponse(text: string): MangaImportPanel[] {
    const panels: MangaImportPanel[] = [];
    const blocks = text.split(/\[panel\d+\]/i).slice(1);
    for (const block of blocks) {
      const promptM = block.match(/prompt:\s*(.+)/i);
      const sceneM  = block.match(/scene:\s*(.+)/i);
      if (promptM) {
        panels.push({ prompt: promptM[1].trim(), scene: sceneM?.[1]?.trim() ?? '' });
      }
    }
    return panels;
  }

  async function convertToManga(msg: ChatMessage, storyYamlOverride = ''): Promise<void> {
    if (mangaConverting) return;
    mangaConverting = msg.time;
    try {
      const storyYaml = storyYamlOverride.trim() || latestYamlForImageGeneration();
      let bible = await loadCharacterBible();
      if (!bible && referenceImages.length > 0) {
        bible = await analyzeReferencesForCharacterBible([...referenceImages]);
      }
      console.log('[MANGA_LAB_INPUT]', {
        referenceImages,
        characterBible: bible,
        storyYaml,
      });
      console.log('[MANGA_LAB_INPUT_STATUS]', {
        referenceImageCount: referenceImages.length,
        hasCharacterBible: Boolean(bible),
        hasStoryYaml: Boolean(storyYaml),
      });
      logRegisteredCharacterMemory(referenceImages.length > 0 && Boolean(storyYaml));
      if (referenceImages.length === 0) {
        messages = [...messages, {
          role: 'error',
          text: bible
            ? 'CharacterBibleはありますがREF画像が0枚のため、MANGA生成を中止しました。REF画像を登録してください。'
            : 'MANGA生成にはREF画像が必要です。REF画像を登録してください。',
          time: getTime(),
        }];
        return;
      }
      if (referenceImages.length > 0 && !bible) {
        messages = [...messages, {
          role: 'error',
          text: 'CharacterBibleを作成できなかったためMANGA生成を中止しました。REF画像を確認してください。',
          time: getTime(),
        }];
        return;
      }
      if (!storyYaml) {
        messages = [...messages, {
          role: 'error',
          text: 'Story YAMLが見つからないためMANGA生成を中止しました。先に漫画YAMLを生成してください。',
          time: getTime(),
        }];
        return;
      }
      let panels: MangaImportPanel[];

      // Fast path: already a manga-mode message — extract [prompt] directly
      const parsed = parseMangaResponse(msg.text);
      if (parsed && referenceImages.length === 0) {
        const promptSec = parsed.find(s => s.label === 'prompt');
        const sceneSec  = parsed.find(s => s.label === 'scene');
        panels = promptSec
          ? [{ prompt: promptSec.content, scene: sceneSec?.content ?? '' }]
          : [{ prompt: msg.text.slice(0, 300), scene: '' }];
      } else {
        // Slow path: call AI to convert conversation context into panels
        const msgIdx     = messages.findIndex(m => m.time === msg.time && m.role === msg.role);
        const ctxMsgs    = messages.slice(Math.max(0, (msgIdx >= 0 ? msgIdx : messages.length) - 5), (msgIdx >= 0 ? msgIdx : messages.length) + 1);
        const contextText = ctxMsgs
          .filter(m => m.role !== 'error')
          .map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.text}`)
          .join('\n')
          + (bible ? `\n\n[Character Bible - supplemental]\n${JSON.stringify(bible, null, 2)}` : '')
          + (storyYaml ? `\n\n[Story YAML]\n${storyYaml}` : '');

        const convSystemPrompt = [
          'あなたは漫画脚本変換AIです。',
          '与えられた会話ログを4コマ漫画の各パネル用に変換してください。',
          '必ず以下の形式のみで出力し、余計なテキストは一切出力しないこと:',
          '[panel1]',
          'scene: （このコマのシーン説明、日本語1文）',
          'prompt: （英語画像生成タグ、カンマ区切り）',
          '[panel2]',
          'scene: ...',
          'prompt: ...',
          '[panel3]',
          'scene: ...',
          'prompt: ...',
          '[panel4]',
          'scene: ...',
          'prompt: ...',
        ].join('\n');

        const provider = $sessionStore.provider === 'onair' ? 'claude' : $sessionStore.provider;
        const model    = $sessionStore.provider === 'onair' ? 'claude-haiku-4-5-20251001' : ($sessionStore.model || undefined);

        const res = await fetch('/api/lab-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route: 'story_generate',
            provider,
            model,
            systemPrompt: convSystemPrompt,
            userMessage: contextText,
            images: referenceImages.map((ref) => ref.sourceUrl || ref.dataUrl).filter(Boolean),
            memory: { enabled: false },
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
        const data = await res.json();
        panels = parseMangaImportResponse(data.text ?? '');
        if (panels.length === 0) panels = [{ prompt: msg.text.slice(0, 300), scene: '' }];
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MANGA_IMPORT_KEY, JSON.stringify({
          panels,
          sourceText: msg.text.slice(0, 60),
          referenceImages: referenceImages.map((ref) => ({
            name: ref.name,
            dataUrl: ref.dataUrl || ref.sourceUrl || '',
            originalDataUrl: ref.sourceUrl || ref.dataUrl,
            note: [
              ref.role ? `役割: ${ref.role}` : '',
              ref.description,
            ].filter(Boolean).join(' / ') || ref.name,
          })),
          characterRefs: referenceImages.map((ref) => ref.sourceUrl || ref.dataUrl).filter(Boolean),
          registeredCharacters: referenceImages.map((ref) => ({
            id: ref.characterId,
            name: ref.name,
            role: ref.role,
            description: ref.description,
            image: ref.sourceUrl || ref.dataUrl,
          })),
          storyRefs: storyReferences,
          characterBible: bible,
          storyYaml,
        }));
      }
      window.open('/project', '_blank');
    } catch (e) {
      console.error('[Lab] convertToManga:', e);
    } finally {
      mangaConverting = null;
    }
  }

  // ============================================================
  // Chat to YAML/Studio Pipeline
  // ============================================================
	  async function createLabThumbnail(file: File): Promise<string> {
	    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const THUMB = 512;
        const r = Math.min(THUMB / img.width, THUMB / img.height);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * r);
        canvas.height = Math.round(img.height * r);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
	        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
      img.src = url;
	    });
	  }

  async function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read reference image'));
      reader.readAsDataURL(file);
    });
  }

  async function registerReferenceImageCharacter(input: {
    id: string;
    name: string;
    role: string;
    description: string;
    referenceImageDataUrl: string;
  }): Promise<void> {
    const res = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.message ?? `Character Registry HTTP ${res.status}`);
    }
    console.log('[CHARACTER_REGISTRY_REGISTERED]', {
      id: input.id,
      name: input.name,
    });
  }

  function nextReferenceRegistryName(): string {
    const used = new Set(referenceImages.map((ref) => ref.registryName?.toUpperCase()).filter(Boolean));
    for (let i = 1; i <= 999; i++) {
      const name = `N-${i.toString().padStart(2, '0')}`;
      if (!used.has(name)) return name;
    }
    return `N-${(referenceImages.length + 1).toString().padStart(2, '0')}`;
  }

  async function loadRegisteredCharacters(): Promise<void> {
    characterRegistryLoading = true;
    try {
      const res = await fetch('/api/characters');
      if (!res.ok) throw new Error(`Character Registry HTTP ${res.status}`);
      const data = await res.json();
      const characters = Array.isArray(data?.characters) ? data.characters : [];
      const loaded = await Promise.all(characters.flatMap((character: Record<string, unknown>) => {
        const id = typeof character.id === 'string' ? character.id : '';
        if (!id || character.hasReference !== true) return [];
        return [fetch(`/api/characters/${encodeURIComponent(id)}/reference`)
          .then(async (referenceRes) => {
            if (!referenceRes.ok) return null;
            const referenceData = await referenceRes.json();
            const image = typeof referenceData?.referenceImageDataUrl === 'string'
              ? referenceData.referenceImageDataUrl
              : '';
            if (!image) return null;
            return {
              name: typeof character.name === 'string'
                && character.name.trim().toLowerCase() !== id.toLowerCase()
                ? character.name
                : '',
              role: typeof character.role === 'string' ? character.role : '',
              description: typeof character.description === 'string' ? character.description : '',
              fileName: 'reference.png',
              dataUrl: image,
              sourceUrl: image,
              note: typeof character.description === 'string' && character.description.trim()
                ? character.description
                : (typeof character.name === 'string' ? character.name : id),
              characterId: id,
              registryName: id.toUpperCase(),
            } satisfies ReferenceImage;
          })
          .catch(() => null)];
      }));
      referenceImages = loaded.filter((ref): ref is ReferenceImage => Boolean(ref));
      characterBible = null;
      characterBibleSource = null;
      await loadCharacterBible(referenceImages);
      console.log('[CHARACTER_REGISTRY_LOADED]', referenceImages.map((ref) => ({
        id: ref.characterId,
        name: ref.name,
        role: ref.role,
      })));
    } catch (error) {
      console.warn('[CHARACTER_REGISTRY_LOAD_ERROR]', error);
    } finally {
      characterRegistryLoading = false;
    }
  }

  async function updateRegisteredCharacter(ref: ReferenceImage): Promise<void> {
    if (!ref.characterId) return;
    try {
      const res = await fetch(`/api/characters/${encodeURIComponent(ref.characterId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ref.name,
          role: ref.role,
          description: ref.description,
        }),
      });
      if (!res.ok) throw new Error(`Character update HTTP ${res.status}`);
      ref.note = ref.description || ref.name;
      console.log('[CHARACTER_REGISTRY_UPDATED]', ref.characterId);
    } catch (error) {
      console.warn('[CHARACTER_REGISTRY_UPDATE_ERROR]', error);
    }
  }

  function logRegisteredCharacterMemory(applied: boolean): void {
    console.log('[CHARACTER_MEMORY]', referenceImages.map((ref) => ({
      id: ref.characterId,
      name: ref.name,
      role: ref.role,
      description: ref.description,
      hasImage: Boolean(ref.sourceUrl || ref.dataUrl),
    })));
    console.log('[CHARACTER_MEMORY_APPLIED]', applied);
  }

  async function saveCharacterBible(bible: CharacterBible, refs: ReferenceImage[]): Promise<void> {
    const ids = refs.map((ref) => ref.characterId).filter((id): id is string => Boolean(id));
    await Promise.all(ids.map(async (id) => {
      const res = await fetch(`/api/characters/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterBible: bible }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? `Character Bible HTTP ${res.status}`);
      }
    }));
  }

  async function loadCharacterBible(refs = referenceImages): Promise<CharacterBible | null> {
    if (characterBible) return characterBible;
    const id = refs.find((ref) => ref.characterId)?.characterId;
    if (!id) return null;
    try {
      const res = await fetch(`/api/characters/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const data = await res.json();
      const saved = data?.character?.characterBible as CharacterBible | undefined;
      if (saved?.unitId && Array.isArray(saved.characters) && saved.characters.length > 0) {
        characterBible = saved;
        characterBibleSource = 'character_registry';
        visionContext = JSON.stringify(saved, null, 2);
        return saved;
      }
    } catch (error) {
      console.warn('[CHARACTER_BIBLE_LOAD_ERROR]', error);
    }
    return null;
  }

  function parseCharacterBibleResponse(text: string): CharacterBible {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const jsonText = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    const parsed = JSON.parse(jsonText) as Partial<CharacterBible>;
    if (!parsed.unitId?.trim() || !Array.isArray(parsed.characters) || parsed.characters.length === 0) {
      throw new Error('Character Bible JSON is invalid');
    }
    const characters = parsed.characters.map((character) => ({
      id: String(character?.id ?? '').trim(),
      hairColor: String(character?.hairColor ?? '').trim(),
      ears: String(character?.ears ?? '').trim(),
      tail: String(character?.tail ?? '').trim(),
      appearance: String(character?.appearance ?? '').trim(),
    }));
    if (characters.some((character) => Object.values(character).some((value) => !value))) {
      throw new Error('Character Bible character fields are incomplete');
    }
    return {
      unitId: parsed.unitId.trim(),
      characters,
    };
  }

  async function analyzeReferencesForCharacterBible(refs: ReferenceImage[]): Promise<CharacterBible | null> {
    const images = refs.map((ref) => ref.sourceUrl || ref.dataUrl).filter(Boolean);
    if (images.length === 0) return null;
    visionScanning = true;
    try {
      const provider = $sessionStore.provider === 'openai' || $sessionStore.provider === 'gemini' || $sessionStore.provider === 'claude'
        ? $sessionStore.provider
        : 'gemini';
      const model = provider === $sessionStore.provider ? ($sessionStore.model || undefined) : undefined;
      const refLabels = refs.map((ref) => ref.registryName || ref.characterId || ref.name);
      const response = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route: 'image_analysis',
          provider,
          model,
          visionMode: 'strict',
          memory: { enabled: false },
          systemPrompt: [
            VISION_STRICT_RULES,
            'Detect every distinct visible person across all supplied images.',
            'Return JSON only, without markdown or explanation.',
            'Use exactly this schema:',
            '{"unitId":"S-22","characters":[{"id":"N-01","hairColor":"...","ears":"...","tail":"...","appearance":"..."}]}',
            'characters must contain every visible person, not only the first person.',
            'hairColor, ears, tail, and appearance may contain only directly visible person, clothing, color, pose, and background facts.',
            'appearance must not contain personality, story, emotion, dialogue, relationships, or inferred intent.',
            'Use "unknown" for details that are not directly visible.',
          ].join('\n'),
          userMessage: `unitId: S-22\nREF labels: ${refLabels.join(', ')}\n画像内の視覚的事実だけを指定JSON形式で抽出してください。`,
          images,
        }),
      });
      if (!response.ok) throw new Error(`Character Bible Vision HTTP ${response.status}`);
      const data = await response.json();
      const raw = String(data?.text ?? '').trim();
      if (!raw) throw new Error('Character Bible was empty');
      const bible = parseCharacterBibleResponse(raw);
      await saveCharacterBible(bible, refs);
      characterBible = bible;
      characterBibleSource = 'vision_analysis';
      visionContext = JSON.stringify(bible, null, 2);
      console.log('[CHARACTER_BIBLE_SAVED]', bible);
      return bible;
    } catch (error) {
      console.warn('[CHARACTER_BIBLE_ANALYSIS_ERROR]', error);
      messages = [...messages, {
        role: 'error',
        text: `Character analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        time: getTime(),
      }];
      return null;
    } finally {
      visionScanning = false;
    }
  }
	
	  async function handleReferenceImageUpload(e: Event): Promise<void> {
	  const input = e.currentTarget as HTMLInputElement;
	  const files = Array.from(input.files ?? []);

	  input.value = '';
	
	  for (const file of files) {
	
	    const sourceUrl = await readFileAsDataUrl(file);
	    const dataUrl = await createLabThumbnail(file);
	    const registryName = nextReferenceRegistryName();
	    const characterId = registryName.toLowerCase();
	
	    const fallbackName = file.name
	      .replace(/\.[^/.]+$/, '')
	      .replace(/[_-]/g, ' ');
      const name = characterRegistrationName.trim() || fallbackName;
      const role = characterRegistrationRole.trim();
      const description = '';

	    try {
	      await registerReferenceImageCharacter({
	        id: characterId,
	        name,
          role,
	        description,
	        referenceImageDataUrl: sourceUrl,
	      });
	    } catch (error) {
	      console.error('[CHARACTER_REGISTRY_ERROR]', error);
	      messages = [...messages, {
	        role: 'error',
	        text: `Character Registry registration failed: ${registryName}`,
	        time: getTime(),
	      }];
	      continue;
	    }
	
	    referenceImages.push({
	      name,
        role,
        description,
	      fileName: file.name,
	      dataUrl,
	      sourceUrl,
	      note: description || name,
	      characterId,
	      registryName,
	    });
	  }
    characterRegistrationName = '';
    characterRegistrationRole = '';
    characterBible = null;
    characterBibleSource = null;
    console.log('[MANGA_LAB_REFERENCE_IMAGES]', referenceImages);
    if (referenceImages.length > 0) {
      await analyzeReferencesForCharacterBible([...referenceImages]);
    }
	}

async function removeReferenceImage(i: number): Promise<void> {
  const ref = referenceImages[i];
  if (ref?.characterId) {
    try {
      const res = await fetch(`/api/characters/${encodeURIComponent(ref.characterId)}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) throw new Error(`Character delete HTTP ${res.status}`);
    } catch (error) {
      console.warn('[CHARACTER_REGISTRY_DELETE_ERROR]', error);
      return;
    }
  }
  referenceImages.splice(i, 1);
  characterBible = null;
  characterBibleSource = null;
  visionContext = '';
}

  function resolveStoryReferenceFormat(content: string): StoryReference['format'] | null {
    const topLevelKeys = new Set(
      content
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trimStart().startsWith('#') && !/^\s/.test(line))
        .map((line) => line.match(/^([A-Za-z0-9_-]+)\s*:/)?.[1]?.toLowerCase())
        .filter((key): key is string => Boolean(key)),
    );
    if (topLevelKeys.has('panels')) return 'yonkoma';
    if (topLevelKeys.has('story_type') || topLevelKeys.has('pages')) return 'comic_story';
    return null;
  }

  async function handleStoryReferenceUpload(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    for (const file of files) {
      const content = (await file.text()).trim();
      if (!content) {
        console.warn('[STORY_REF_SKIPPED]', file.name, 'empty');
        continue;
      }
      const format = resolveStoryReferenceFormat(content);
      if (!format) {
        console.warn('[STORY_REF_SKIPPED]', file.name, 'unsupported_format');
        continue;
      }

      storyReferences = [
        ...storyReferences.filter((ref) => ref.name !== file.name),
        {
          name: file.name,
          content,
          kind: format === 'yonkoma' ? 'manga' : 'story',
          format,
          continuity: extractStoryContinuity(content) ?? undefined,
        },
      ];
      messages = [...messages, {
        role: 'ai',
        text: content,
        time: getTime(),
      }];
    }
    console.log('[MANGA_LAB_STORY_REFS]', storyReferences.map((ref) => ({
      name: ref.name,
      kind: ref.kind,
      format: ref.format,
      length: ref.content.length,
    })));
    saveStoryReferences();
    const latest = storyReferences.at(-1);
    if (latest?.continuity) saveStoryContinuityMemory(latest.continuity);
  }

  function removeStoryReference(i: number): void {
    storyReferences.splice(i, 1);
    saveStoryReferences();
  }

  function selectStoryReference(i: number): void {
    const selected = storyReferences[i];
    if (!selected || i === storyReferences.length - 1) return;
    storyReferences = [
      ...storyReferences.filter((_, index) => index !== i),
      selected,
    ];
    saveStoryReferences();
  }

  function saveStoryReferences(): void {
    try {
      localStorage.setItem(LS_STORY_REFS, JSON.stringify(storyReferences));
    } catch (error) {
      console.warn('[STORY_REF_SAVE_ERROR]', error);
    }
  }

  function saveStoryContinuityMemory(memory: StoryContinuityMemory): void {
    storyContinuityMemory = memory;
    try {
      localStorage.setItem(LS_STORY_CONTINUITY, JSON.stringify(memory));
    } catch (error) {
      console.warn('[CONTINUITY_MEMORY_SAVE_ERROR]', error);
    }
    console.log(formatStoryContinuityLog(memory));
  }

  function saveYamlAsStoryReference(rawYaml: string): void {
    const content = rawYaml.trim();
    const continuity = extractStoryContinuity(content);
    if (!content || !continuity) return;
    const name = `${continuity.seriesTitle || 'story'}_page_${continuity.pageIndex}.yaml`;
    storyReferences = [
      ...storyReferences.filter((ref) => ref.name !== name),
      {
        name,
        content,
        kind: 'story',
        format: 'comic_story',
        continuity,
      },
    ];
    saveStoryReferences();
    saveStoryContinuityMemory(continuity);
  }
    

  async function analyzeReferenceImage() {
    visionScanning = true;
    try {
      const referenceQuery = inputText.trim() || 'REF画像を分析してください。';
      const resolved = await resolveImageReference(referenceQuery);
      const fallbackImage = referenceImages[0] ?? null;
      const imageUrl = resolved?.imageUrl ?? fallbackImage?.dataUrl;
      const imageName = resolved ? 'Image Memory' : fallbackImage?.name;

      if (!imageUrl) {
        console.warn('[Vision] reference image not found');
        return;
      }

      const provider = $sessionStore.provider === 'openai' || $sessionStore.provider === 'gemini' || $sessionStore.provider === 'claude'
        ? $sessionStore.provider
        : 'gemini';
      const model = provider === $sessionStore.provider ? ($sessionStore.model || undefined) : undefined;

      console.log('[Vision] analyzing image:', imageName);

      const response = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'image_analysis',
          provider,
          model,
          visionMode: 'strict',
          memory: { enabled: false },
          systemPrompt: [
            VISION_STRICT_RULES,
            VISION_STRICT_TEXT_FORMAT,
          ].join('\n'),
          userMessage: '画像をstrict modeで観察し、指定された5項目だけを出力してください。',
          images: [imageUrl]
        })
      });

      if (!response.ok) throw new Error(`Vision API HTTP ${response.status}`);

      const data = await response.json();
      const text = (data.text ?? '') as string;
      if (text) {
        visionContext = text;
        messages = [
          ...messages,
          {
            role: 'ai',
            text: `VISION分析結果\n\n${text}`,
            time: getTime(),
            avatar: selectedAvatar,
          },
        ];
        setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
      }
      console.log('[Vision result]', data);
    } catch (error) {
      console.warn('[Vision] analysis failed:', error);
    } finally {
      visionScanning = false;
    }
}




  function dataUrlToBlob(dataUrl: string): Blob {
    const [header, b64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function wantsImageMemoryReference(text: string): boolean {
    const normalized = text.replace(/\s+/g, '');
    const previousImagePhrases = [
      /前(?:の|に)?(?:描いた|描いてくれた|生成した)?画像/,
      /さっき(?:の|に)?(?:描いた|生成した)?画像/,
      /この前(?:の|に)?(?:描いた|生成した)?画像/,
      /最後(?:の|に生成した)?画像/,
      /直前(?:の|に生成した)?画像/,
      /先ほど(?:の|に生成した)?画像/,
      /生成した画像/,
      /描いた画像/,
      /前描いた/,
    ];
    if (previousImagePhrases.some((pattern) => pattern.test(normalized))) return true;
    if (/画像(?:の)?(?:色|詳細|説明|見た目|外見|特徴|解析|分析)/.test(normalized)) return true;

    const refersToImage = /画像|イラスト|絵|生成結果|猫耳|耳|髪|服|目|背景|色/.test(normalized);
    const asksAboutImage = /色|詳細|説明|見た目|外見|特徴|何色|どんな|解析|分析|教えて|覚えてる/.test(normalized);
    const temporalReference = /前|さっき|この前|最後|直前|先ほど|生成した|描いた/.test(normalized);
    return refersToImage && asksAboutImage && temporalReference;
  }

  async function resolveImageReference(text: string): Promise<{ imageUrl: string; note: string } | null> {
    if (!wantsImageMemoryReference(text)) return null;

    const latest = await getLatestImageMemory();
    if (!latest?.imageUrl) return null;

    return {
      imageUrl: latest.imageUrl,
      note: latest.imagePrompt,
    };
  }

  async function buildVisionReferenceImages(text: string): Promise<ReferenceImage[]> {
    const refs: ReferenceImage[] = [...referenceImages];

    try {
      const resolved = await resolveImageReference(text);
      if (resolved?.imageUrl.startsWith('data:')) {
        refs.push({
          name: 'Image Memory',
          role: '',
          description: resolved.note,
          dataUrl: resolved.imageUrl,
          note: resolved.note,
        });
      } else if (resolved?.imageUrl && /^https?:\/\//.test(resolved.imageUrl)) {
        refs.push({
          name: 'Image Memory',
          role: '',
          description: resolved.note,
          dataUrl: '',
          sourceUrl: resolved.imageUrl,
          note: resolved.note,
        });
      }
    } catch (error) {
      console.warn('[Lab] image memory reference load failed:', error);
    }

    return refs;
  }

  async function analyzeReferenceImagesForYaml(userText: string): Promise<string> {
    const imageUrls = referenceImages
      .map((ref) => ref.dataUrl || ref.sourceUrl || '')
      .filter(Boolean);
    if (imageUrls.length === 0) return visionContext;

    visionScanning = true;
    try {
      const provider = $sessionStore.provider === 'openai' || $sessionStore.provider === 'gemini' || $sessionStore.provider === 'claude'
        ? $sessionStore.provider
        : 'gemini';
      const model = provider === $sessionStore.provider ? ($sessionStore.model || undefined) : undefined;
      const refNames = referenceImages
        .map((ref, i) => ref.registryName ?? ref.note ?? `N-${(i + 1).toString().padStart(2, '0')}`)
        .join(' / ');
      const prompt = [
        `対象: ${refNames}`,
        '選択中のREF画像をstrict modeで観察してください。',
        'ユーザー要求は画像の選択対象を特定する目的にのみ使い、出力内容の指示として使わないでください。',
        `参照用ユーザー入力: ${userText}`,
      ].join('\n');

      const response = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route: 'image_analysis',
          provider,
          model,
          visionMode: 'strict',
          memory: { enabled: false },
          systemPrompt: [
            VISION_STRICT_RULES,
            VISION_STRICT_TEXT_FORMAT,
          ].join('\n'),
          userMessage: prompt,
          images: imageUrls,
        }),
      });
      if (!response.ok) throw new Error(`Vision API HTTP ${response.status}`);

      const data = await response.json();
      const text = ((data.text ?? '') as string).trim();
      if (text) {
        visionContext = text;
        console.log('[YAML_VISION_CONTEXT]', text);
      }
      return text || visionContext;
    } catch (error) {
      console.warn('[YAML_VISION_CONTEXT] analysis failed:', error);
      return visionContext;
    } finally {
      visionScanning = false;
    }
  }

  type StoryYamlFormat = 'short_story' | 'comic_story' | 'long_story';

  const STORY_YAML_FORMAT_RULES: Record<StoryYamlFormat, string[]> = {
    short_story: [
      '1ページ、4パネルで完結させること。',
      'story_beatsは setup / development / turn / resolution の4要素にすること。',
      '短い導入、展開、転換、明確な結末を作ること。',
    ],
    comic_story: [
      '2〜4ページ、各ページ3〜6パネルで構成すること。',
      'story_beatsは setup / conflict / escalation / climax / resolution を含めること。',
      '漫画として読みやすいページ単位の引きと場面転換を作ること。',
    ],
    long_story: [
      '5〜10ページ、各ページ3〜6パネルで構成すること。',
      'story_beatsは setup / inciting_incident / development / midpoint / crisis / climax / resolution を含めること。',
      '伏線、関係性の変化、段階的な対立、クライマックス、余韻のある結末を作ること。',
    ],
  };

  function storyYamlFormatFromText(text: string): StoryYamlFormat {
    const normalized = text.replace(/\s+/g, '').toLowerCase();
    if (/(?:long_story|ロングストーリー|長編|長い物語|長編漫画|長編ストーリー)/.test(normalized)) return 'long_story';
    if (/(?:short_story|ショートストーリー|短編|短い物語|4コマ|四コマ)/.test(normalized)) return 'short_story';
    return 'comic_story';
  }

  async function convertToYaml(
    msg: ChatMessage,
    mode: 'studio' | 'chat' = 'studio',
    yamlVisionContext = '',
    storyFormat: StoryYamlFormat = storyYamlFormatFromText(msg.text),
    sourceYaml = '',
  ): Promise<string | null | undefined> {
    if (yamlConverting) return;
    yamlConverting = true;
    try {
      const msgIdx     = messages.findIndex(m => m.time === msg.time && m.role === msg.role);
      const ctxMsgs    = messages.slice(Math.max(0, (msgIdx >= 0 ? msgIdx : messages.length) - 8), (msgIdx >= 0 ? msgIdx : messages.length) + 1);
      const contextText = ctxMsgs
        .filter(m => m.role !== 'error')
        .map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.text}`)
        .join('\n');

	      const refContext    = referenceImages.length > 0
	        ? `\n[永続登録キャラクター]\n${referenceImages.map((r, i) => [
            `${r.registryName ?? `キャラクター${i + 1}`}: ${r.name}`,
            r.role ? `役割=${r.role}` : '',
            r.description ? `説明=${r.description}` : '',
          ].filter(Boolean).join(' / ')).join('\n')}`
	        : '';
      const effectiveVisionContext = (yamlVisionContext || visionContext).trim();
      const visionSection = effectiveVisionContext
        ? `\n[VISION解析結果]\n${effectiveVisionContext}`
        : '';
      const refYamlRequirement = referenceImages.length > 0
        ? [
          '',
          '【REF画像ルール】',
          'REF画像が選択されています。一般的なキャラ設定ではなく、VISION解析結果の髪色、猫耳、しっぽ、衣装、番号マーキング、ボディ色を必ずYAMLへ反映してください。',
          'characters と setting.visual_rules を含め、REF画像のキャラクターデザインを維持するルールを書いてください。',
        ].join('\n')
        : '';
      const formatRules = STORY_YAML_FORMAT_RULES[storyFormat];
      const continuity = sourceYaml.trim()
        ? extractStoryContinuity(sourceYaml)
        : null;
      const continuityRequirement = continuity
        ? [
          '',
          '【Story Continuity Memory - 最優先・変更禁止】',
          'これは新作ではなく、既存作品の次ページです。',
          'キャラクター名を変更しないでください。',
          '前ページの直後から開始してください。',
          '既存キャラクターの関係性を維持してください。',
          '新キャラクターはユーザーが明示指定した場合のみ追加してください。',
          'シリーズタイトルを勝手に変更しないでください。',
          '記憶喪失、別世界転移、時間リセットなどで設定を初期化しないでください。',
          JSON.stringify(continuity, null, 2),
        ].join('\n')
        : '';
      console.log(continuity ? formatStoryContinuityLog(continuity) : '[CONTINUITY_MEMORY]\nnone');
      console.log('[CONTINUITY_APPLIED]', Boolean(continuity));

      const sysPrompt = [
        'あなたはストーリーYAML生成エンジンです。',
        `story_typeは "${storyFormat}" です。`,
        '以下の会話から、漫画・物語制作に使用する構造化JSONを生成してください。',
        'このJSONはサーバー側でYAMLへ変換されます。',
        '必ず以下のJSON形式のみを出力し、他のテキストは一切出力しないこと:',
        '{',
        `  "story_type": "${storyFormat}",`,
        '  "title": "作品タイトル",',
        '  "theme": "作品の中心テーマ",',
        '  "characters": [',
        '    { "name": "キャラクター名", "role": "物語上の役割", "visual": "外見と衣装", "personality": "性格と行動原理", "speechStyle": "口調" }',
        '  ],',
        '  "story_beats": [',
        '    { "beat": "setup", "summary": "物語上の出来事" }',
        '  ],',
        '  "pages": [',
        '    {',
        '      "page": 1,',
        '      "layout": "4panel",',
        '      "summary": "このページの役割と出来事",',
        '      "panels": [',
        '        { "panel": 1, "scene": "コマの内容（日本語）", "dialogue": ["キャラ名: セリフ"], "prompt": "詳細英語画像生成プロンプト" }',
        '      ]',
        '    }',
        '  ],',
        '  "setting": {',
        '    "reference_source": "selected REF image",',
        '    "visual_rules": ["REF画像のキャラクターデザインを維持", "髪色、耳、しっぽ、衣装、番号マーキングを変更しない"]',
        '  },',
        '  "refs": {',
        '    "a": "キャラクターAの英語外見タグ（カンマ区切り）",',
        '    "b": "キャラクターBの英語外見タグ（存在しない場合は省略）"',
        '  },',
        '  "continuity": {',
        '    "seriesTitle": "シリーズタイトル",',
        '    "currentEpisodeTitle": "現在のエピソードタイトル",',
        '    "pageIndex": 1,',
        '    "lockedFacts": ["変更禁止の事実"],',
        '    "lastPageSummary": "このページで最後に起きた出来事",',
        '    "currentLocation": "現在地",',
        '    "unresolvedThreads": ["未解決の伏線"],',
        '    "nextPageIntent": "次ページで進める内容"',
        '  }',
        '}',
        'title、theme、characters、story_beats、pages、各pageのpanelsは必須。空配列や空文字にしないこと。',
        ...formatRules,
        'layoutは "single" / "2panel" / "3vertical" / "4panel" / "free_page" からパネル数に合うものを選ぶこと。',
        'キャラクターが1人の場合はrefsのbキーを省略すること。',
        'sceneは各コマ専用の短い説明を日本語で書くこと。全体のあらすじは各コマにコピーしないこと。',
        'dialogueは各コマのキャラクターのセリフを文字列配列で出力すること。形式: ["キャラ名: セリフ内容", ...]',
        '- 1〜3行の短いセリフにすること',
        '- キャラクターの性格・関係性・感情（ギャグ、驚き、ツンデレなど）を反映すること',
        '- セリフがないコマは空配列 [] にすること',
        '',
        '【prompt の書き方 — 厳守事項】',
        'promptはGPT Image 2向けの高品質な詳細英語画像生成プロンプトとして生成すること。',
        '短いタグ列（"surprise, one charging pod" など）は禁止。自然な英語で1〜3文の詳細な描写にすること。',
        '',
        '必ず以下をすべて含めること（カンマ区切りで1行にまとめること）:',
        '1. character appearance: hair color, eye color, android/mechanical details, clothing',
        '2. facial expression: specific emotion with physical detail (wide eyes, open mouth, raised brows, etc.)',
        '3. pose and body language: what they are doing, hand/arm positions',
        '4. background and setting: location, objects, environment details',
        '5. lighting: type and quality of light (warm indoor, neon glow, soft sunlight, etc.)',
        '6. atmosphere and mood: overall tone of the scene',
        '7. camera composition: shot type (wide shot, medium shot, close-up, etc.)',
        '8. style tags: anime style, highly detailed, clean lineart, consistent character design',
        '',
        '例（この詳細度・長さを必ず守ること）:',
        'two adorable android cat sisters with metallic silver and dark accents, glowing cyan mechanical cat ears and cable tails, standing in a cozy futuristic cafe as they notice only one charging pod, both showing wide surprised expressions, one pointing toward the glowing pod while the other raises her hands in confusion, warm indoor lighting with soft ambient glow, detailed sci-fi background with holographic displays, medium wide shot, anime style, highly detailed, clean lineart, consistent character design',
        '',
        'promptはJSONの文字列値として1行で出力すること。改行（\\n）は使用しないこと。',
        refYamlRequirement,
        continuityRequirement,
      ].join('\n');

      const provider = $sessionStore.provider === 'onair' ? 'claude' : $sessionStore.provider;
      const model    = $sessionStore.provider === 'onair' ? 'claude-haiku-4-5-20251001' : ($sessionStore.model || undefined);

      console.log('[PROMPT_TEMPLATE][create_manga_yaml]', sysPrompt);
      console.log('[PROMPT_INPUT][create_manga_yaml]', contextText + refContext + visionSection);
      console.log("ROUTE", "yaml_generate");
      const res = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route: 'yaml_generate',
          provider,
          model,
          systemPrompt: sysPrompt,
          userMessage: [
            contextText,
            refContext,
            visionSection,
            sourceYaml ? `\n[Source YAML]\n${sourceYaml}` : '',
            continuityRequirement,
          ].join(''),
          memory: { enabled: false },
          max_tokens: storyFormat === 'long_story' ? 8192 : storyFormat === 'comic_story' ? 6144 : 4096,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
      const data = await res.json();
      const raw  = (data.text ?? '') as string;

      type YamlCharacter = { name?: string; role?: string; visual?: string; personality?: string; speechStyle?: string };
      type YamlStoryBeat = { beat?: string; summary?: string };
      type YamlPanel = { panel?: number; scene?: string; dialogue?: string[]; prompt?: string };
      type YamlPage = { page?: number; layout?: string; summary?: string; prompt?: string; panels?: YamlPanel[] };
      type YamlParsed = {
        story_type?: StoryYamlFormat;
        title?: string;
        theme?: string;
        characters?: YamlCharacter[];
        story_beats?: YamlStoryBeat[];
        pages?: YamlPage[];
        refs?: { a?: string; b?: string };
        continuity?: Partial<StoryContinuityMemory>;
      };
      let parsed: YamlParsed;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
      } catch {
        throw new Error('ストーリーJSONの解析に失敗しました');
      }
      if (
        !parsed.title?.trim()
        || !parsed.theme?.trim()
        || !Array.isArray(parsed.characters)
        || parsed.characters.length === 0
        || !Array.isArray(parsed.story_beats)
        || parsed.story_beats.length === 0
        || !Array.isArray(parsed.pages)
        || parsed.pages.length === 0
        || parsed.pages.some((page) => !Array.isArray(page.panels) || page.panels.length === 0)
      ) {
        throw new Error('必須項目を満たさないストーリーJSONが返されました');
      }

      if (continuity) {
        const existingNames = new Set(continuity.characters.map((character) => character.name));
        const explicitlyRequestedNewCharacters = parsed.characters.filter((character) =>
          character.name
          && !existingNames.has(character.name)
          && msg.text.includes(character.name),
        );
        parsed.title = continuity.seriesTitle;
        parsed.characters = [
          ...continuity.characters.map((character) => ({
            name: character.name,
            role: character.role,
            visual: character.appearance,
            personality: character.personality,
            speechStyle: character.speechStyle,
          })),
          ...explicitlyRequestedNewCharacters,
        ];
        parsed.pages = parsed.pages.map((page, index) => ({
          ...page,
          page: continuity.pageIndex + index + 1,
        }));
      }

	      if (referenceImages.length > 0) {
	        parsed.refs = {
	          ...(parsed.refs ?? {}),
	          a: referenceImages[0]?.registryName ?? parsed.refs?.a ?? referenceImages[0]?.note ?? referenceImages[0]?.name,
	          b: referenceImages[1]?.registryName ?? parsed.refs?.b ?? referenceImages[1]?.note ?? referenceImages[1]?.name,
	        };
	        console.log('[YAML_REFS]', parsed.refs);
	      }
	
	      const yamlData = {
        ...parsed,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        sourceText: msg.text.slice(0, 60),
      };

      const esc = (s: string) => s.replace(/\n/g, ' ').replace(/"/g, '\\"').trim();
      const lines: string[] = [
        `story_type: ${storyFormat}`,
        `title: "${esc(parsed.title)}"`,
        `theme: "${esc(parsed.theme)}"`,
        'characters:',
      ];
      for (const character of parsed.characters) {
        lines.push(`  - name: "${esc(character.name ?? 'unknown')}"`);
        lines.push(`    role: "${esc(character.role ?? '')}"`);
        lines.push(`    visual: "${esc(character.visual ?? '')}"`);
        lines.push(`    personality: "${esc(character.personality ?? '')}"`);
        lines.push(`    speechStyle: "${esc(character.speechStyle ?? '')}"`);
      }
      lines.push('story_beats:');
      for (const beat of parsed.story_beats) {
        lines.push(`  - beat: "${esc(beat.beat ?? '')}"`);
        lines.push(`    summary: "${esc(beat.summary ?? '')}"`);
      }
      const lastGeneratedPage = parsed.pages.at(-1);
      const generatedContinuity: StoryContinuityMemory = {
        seriesTitle: continuity?.seriesTitle || parsed.continuity?.seriesTitle || parsed.title,
        currentEpisodeTitle: continuity?.currentEpisodeTitle
          || parsed.continuity?.currentEpisodeTitle
          || parsed.title,
        pageIndex: lastGeneratedPage?.page
          ?? continuity?.pageIndex
          ?? parsed.continuity?.pageIndex
          ?? 1,
        characters: parsed.characters.map((character) => ({
          name: character.name ?? '',
          role: character.role ?? '',
          appearance: character.visual ?? '',
          personality: character.personality ?? '',
          speechStyle: character.speechStyle ?? '',
        })),
        lockedFacts: continuity?.lockedFacts
          || parsed.continuity?.lockedFacts
          || [],
        lastPageSummary: lastGeneratedPage?.summary
          || parsed.continuity?.lastPageSummary
          || '',
        currentLocation: parsed.continuity?.currentLocation
          || continuity?.currentLocation
          || '',
        unresolvedThreads: parsed.continuity?.unresolvedThreads
          || continuity?.unresolvedThreads
          || [],
        nextPageIntent: parsed.continuity?.nextPageIntent || '',
      };
      lines.push(storyContinuityToYaml(generatedContinuity));
      if (referenceImages.length > 0) {
        const visualSummary = effectiveVisionContext
          ? extractVisionYamlSummary(effectiveVisionContext)
          : referenceImages.map((ref) => ref.note || ref.name).join(' / ');
        lines.push('setting:');
        lines.push('  reference_source: "selected REF image"');
        lines.push(`  visual_summary: "${esc(visualSummary).slice(0, 900)}"`);
        lines.push('  visual_rules:');
        lines.push('    - "REF画像のキャラクターデザインを維持"');
        lines.push('    - "髪色、耳、しっぽ、衣装、番号マーキングを変更しない"');
        lines.push('    - "参照画像なしの一般的なキャラ設定で補完しない"');
      }
      lines.push('pages:');
      for (const [pageIndex, page] of parsed.pages.entries()) {
        lines.push(`  - page: ${page.page ?? pageIndex + 1}`);
        lines.push(`    layout: "${esc(page.layout ?? 'free_page')}"`);
        lines.push(`    summary: "${esc(page.summary ?? page.prompt ?? '')}"`);
        lines.push('    panels:');
        for (const [panelIndex, panel] of page.panels!.entries()) {
          lines.push(`      - panel: ${panel.panel ?? panelIndex + 1}`);
          lines.push(`        scene: "${esc(panel.scene ?? '')}"`);
          if (panel.dialogue && panel.dialogue.length > 0) {
            lines.push('        dialogue:');
            for (const dialogue of panel.dialogue) {
              lines.push(`          - "${esc(dialogue)}"`);
            }
          } else {
            lines.push('        dialogue: []');
          }
          lines.push(`        prompt: "${esc(panel.prompt ?? '')}"`);
        }
      }
      if (parsed.refs) {
        lines.push('refs:');
        if (parsed.refs.a) lines.push(`  a: "${parsed.refs.a.replace(/"/g, '\\"')}"`);
        if (parsed.refs.b) lines.push(`  b: "${parsed.refs.b.replace(/"/g, '\\"')}"`);
      }
      const yamlText = lines.join('\n').trim();
      saveYamlAsStoryReference(yamlText);

      if (mode === 'chat') {
        saveStoryYaml(yamlText);
        window.location.href = '/story';
        return yamlText;
      }

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(YAML_IMPORT_KEY, JSON.stringify(yamlData));
        } catch {
          try {
            localStorage.setItem(YAML_IMPORT_KEY, JSON.stringify({ ...yamlData, referenceImages: undefined }));
          } catch { /* quota */ }
        }
        try {
          localStorage.setItem('studio-yaml', yamlText);
        } catch { /* quota */ }
      }
      window.open('/project', '_blank');
      return yamlText;
    } catch (e) {
      console.error('[Lab] convertToYaml:', e);
      return null;
    } finally {
      yamlConverting = false;
    }
  }

  async function generateStoryYaml(msg: ChatMessage, sourceYaml = ''): Promise<string | null | undefined> {
    const sourceStoryType = sourceYaml ? parseStoryYaml(sourceYaml)?.storyType : '';
    const storyFormat: StoryYamlFormat = sourceStoryType === 'short_story'
      || sourceStoryType === 'comic_story'
      || sourceStoryType === 'long_story'
      ? sourceStoryType
      : storyYamlFormatFromText(msg.text);
    const yamlVisionContext = referenceImages.length > 0
      ? await analyzeReferenceImagesForYaml(msg.text)
      : '';
    console.log('[STORY_YAML_ROUTE]', {
      handler: 'generateStoryYaml',
      route: 'yaml_generate',
      storyFormat,
      sourceText: msg.text,
    });
    return await convertToYaml(msg, 'chat', yamlVisionContext, storyFormat, sourceYaml);
  }

  async function routeToStoryYaml(
    msg: ChatMessage,
    routerResult: IntentResult,
    sourceYaml = '',
  ): Promise<string | null | undefined> {
    routerStateStore.set(routerResult);
    labGenerationMode = generationModeFromIntent(routerResult);
    lastRouterAction = 'yaml_create';
    lastRouterActionAt = new Date().toLocaleString('ja-JP');
    console.log('[FINAL_ROUTER_RESULT]', routerResult);
    console.log('[GENERATION_MODE]', labGenerationMode);
    console.log('[ROUTER_PRIORITY]', 'yonkoma_yaml_direct > intent_classifier > normal_chat');
    logExecutionPath(routerResult, 'generateStoryYaml');
    isThinking = true;
    try {
      return await generateStoryYaml(msg, sourceYaml);
    } finally {
      isThinking = false;
      setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
    }
  }

  // ============================================================
  // Best Scene Selector
  // ============================================================
  type ScoreTag = '面白さ' | '感情強度' | '掛け合い' | 'オチ感';
  type BestScene = {
    userMsg: ChatMessage;
    aiMsg:   ChatMessage;
    score:   number;
    tags:    ScoreTag[];
  };

  let bestScenes    = $state<BestScene[]>([]);
  let bestSceneOpen = $state(false);

  function scoreScene(userMsg: ChatMessage, aiMsg: ChatMessage): { score: number; tags: ScoreTag[] } {
    const combined = userMsg.text + ' ' + aiMsg.text;
    const tags: ScoreTag[] = [];
    let score = 0;

    // 面白さ: text richness + laugh markers
    score += Math.min(aiMsg.text.length / 40, 8);
    const laughCount = (combined.match(/[wｗ笑草]+|wwww+/gi) ?? []).length;
    if (laughCount >= 2) { score += laughCount * 1.5; tags.push('面白さ'); }

    // 感情強度: strong emotion words / repeated exclamation
    const emotionHits = (combined.match(/[！]{2,}|好き|嫌い|やば|ひどい|バカ|えっ|泣|怖|うれし|かなし|悔し|怒り|最悪|最高/g) ?? []).length;
    if (emotionHits >= 1) { score += emotionHits * 3; tags.push('感情強度'); }

    // 掛け合い: both messages are substantial
    if (userMsg.text.length > 10 && aiMsg.text.length > 30) {
      score += 4;
      tags.push('掛け合い');
    }

    // オチ感: punchy / surprising ending in AI response
    const tail = aiMsg.text.slice(-60);
    const punchHits = (tail.match(/だろ[！!]|じゃん[！!]|なの[！!]|知ってた|バレ[たる]|見て[たた]|そういう|結局|やっぱり|[！!]{2,}$/g) ?? []).length;
    if (punchHits >= 1) { score += punchHits * 4; tags.push('オチ感'); }

    // Manga mode bonus (already structured for manga)
    if (parseMangaResponse(aiMsg.text)) score += 8;

    return { score: Math.round(score * 10) / 10, tags };
  }

  function computeBestScenes(): void {
    const recent = messages.slice(-30).filter(m => m.role !== 'error' && !m.isGreeting);
    const scenes: BestScene[] = [];
    for (let i = 0; i < recent.length - 1; i++) {
      if (recent[i].role === 'user' && recent[i + 1].role === 'ai') {
        const { score, tags } = scoreScene(recent[i], recent[i + 1]);
        scenes.push({ userMsg: recent[i], aiMsg: recent[i + 1], score, tags });
      }
    }
    scenes.sort((a, b) => b.score - a.score);
    bestScenes    = scenes.slice(0, 3);
    bestSceneOpen = true;
  }

  // ============================================================
  // Daily Diary Mode
  // ============================================================
  let diaryGenerating = $state(false);

  function parseDiaryResponse(text: string): { diary: string; prompt: string } | null {
    const diaryM  = text.match(/\[diary\]\s*([\s\S]*?)\[prompt\]/i);
    const promptM = text.match(/\[prompt\]\s*([\s\S]*)$/i);
    if (!diaryM || !promptM) return null;
    const diary  = diaryM[1].trim();
    const prompt = promptM[1].trim();
    return diary && prompt ? { diary, prompt } : null;
  }

  async function generateDiary(): Promise<void> {
    if (diaryGenerating) return;
    const today = messages.filter(m => m.role !== 'error' && !m.isGreeting);
    if (today.length === 0) return;
    diaryGenerating = true;
    try {
      const logText = today
        .map(m => `${m.role === 'user' ? 'ユーザー' : charName}: ${m.text}`)
        .join('\n');

      const sysPrompt = [
        'あなたは絵日記AI作家です。',
        '以下の会話ログから今日の印象的な出来事を抽出し、絵日記風の文章と1枚絵の画像生成プロンプトを作成してください。',
        '必ず以下の形式のみで出力し、余計なテキストは一切出力しないこと:',
        '[diary]',
        '（日記本文、日本語3〜5文、温かみのある絵日記的な文体）',
        '[prompt]',
        '（英語の画像生成タグのみ、カンマ区切り、感情や雰囲気・情景が伝わる1枚絵として完結するもの）',
      ].join('\n');

      const provider = $sessionStore.provider === 'onair' ? 'claude' : $sessionStore.provider;
      const model    = $sessionStore.provider === 'onair' ? 'claude-haiku-4-5-20251001' : ($sessionStore.model || undefined);

      const res = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route: 'story_generate',
          provider,
          model,
          systemPrompt: sysPrompt,
          userMessage: logText,
          memory: { enabled: false },
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);

      const data  = await res.json();
      const raw   = (data.text ?? '') as string;
      const parsed = parseDiaryResponse(raw);
      const diaryText = parsed?.diary  ?? raw.slice(0, 300);
      const prompt    = parsed?.prompt ?? raw.slice(0, 400);

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('studio-diary-import', JSON.stringify({
          prompt,
          diaryText,
          date: new Date().toLocaleDateString('ja-JP'),
        }));
      }
      window.open('/project', '_blank');
    } catch (e) {
      console.error('[Lab] generateDiary:', e);
    } finally {
      diaryGenerating = false;
    }
  }

  // ============================================================
  function buildLabSystemPrompt(userInput = ''): string {
    const p = personality;
    const t = { ...effectiveToggles, shortChat: wantsShortReply(userInput) };
    const lines: string[] = [];

    lines.push(`あなたは「${charName}」というAIキャラクターです。`);
    lines.push('以下のパラメータと指示に従って、自然な日本語で短く返答してください。');
    lines.push('');

    if (activePreset === 'custom') {
      const ccp = customProfile;
      if (ccp.name || ccp.speechStyle || ccp.habits || ccp.sentenceEnding || ccp.memo) {
        lines.push('【キャラクター人格】');
        if (ccp.name)           lines.push(`キャラクター名：${ccp.name}`);
        if (ccp.speechStyle)    lines.push(`話し方：${ccp.speechStyle}`);
        if (ccp.habits)         lines.push(`口癖・習慣表現：${ccp.habits}`);
        if (ccp.sentenceEnding) lines.push(`語尾の特徴：${ccp.sentenceEnding}`);
        if (emotion.anger >= 30     && ccp.angerStyle)     lines.push(`怒りの表現：${ccp.angerStyle}`);
        if (emotion.affection >= 60 && ccp.affectionStyle) lines.push(`好意の表現：${ccp.affectionStyle}`);
        if (emotion.jealousy >= 30  && ccp.jealousyStyle)  lines.push(`嫉妬の表現：${ccp.jealousyStyle}`);
        if (ccp.memo)           lines.push(`性格メモ：${ccp.memo}`);
        lines.push('');
      }
    } else {
      const cp = CHARACTER_PROFILES[activePreset];
      if (cp) {
        const ccp = customProfile;
        lines.push('【キャラクター人格】');
        lines.push(`話し方：${ccp.speechStyle || cp.speechStyle}`);
        lines.push(`口癖・習慣表現：${ccp.habits || cp.habits}`);
        lines.push(`語尾の特徴：${ccp.sentenceEnding || cp.sentenceEnding}`);
        if (emotion.anger >= 30)     lines.push(`怒りの表現：${ccp.angerStyle || cp.angerStyle}`);
        if (emotion.affection >= 60) lines.push(`好意の表現：${ccp.affectionStyle || cp.affectionStyle}`);
        if (emotion.jealousy >= 30)  lines.push(`嫉妬の表現：${ccp.jealousyStyle || cp.jealousyStyle}`);
        if (ccp.memo)                lines.push(`性格メモ：${ccp.memo}`);
        lines.push('');
      }
    }

    // 【呼称ルール】 — 全プリセット共通で customProfile の呼称を反映
    {
      const ccp = customProfile;
      if (ccp.firstPerson || ccp.secondPerson || ccp.thirdPerson) {
        lines.push('【呼称ルール】');
        if (ccp.firstPerson)  lines.push(`一人称：${ccp.firstPerson}`);
        if (ccp.secondPerson) lines.push(`二人称：${ccp.secondPerson}`);
        if (ccp.thirdPerson)  lines.push(`第三者：${ccp.thirdPerson}`);
        lines.push('');
      }
    }

    // 【感情表現スタイル】 — CHARACTER_PROFILES に style が定義されている場合のみ注入
    {
      const cp = CHARACTER_PROFILES[activePreset];
      if (cp?.style) {
        const hint = buildEmotionStyleHint(cp.style, {
          trust:     emotion.trust,
          affection: emotion.affection,
          jealousy:  emotion.jealousy,
          lonely:    p.lonely,
          anger:     emotion.anger,
          energy:    p.energy,
        });
        if (hint) lines.push(hint);
      }
    }

    // Trust tier
    const trustTier: 0 | 1 | 2 | 3 =
      p.trust >= 80 ? 3 : p.trust >= 51 ? 2 : p.trust >= 21 ? 1 : 0;
    const trustDesc = [
      '相手をまだ信頼できていない。丁寧・事務的な口調で距離感を保つ。敬語寄り。',
      '普通の知人程度。フラットで無難な口調。',
      'かなり親しい。自然体で少し砕けた口調。',
      '特別な相手。素直で甘えた雰囲気が少し出てもよい。',
    ][trustTier];
    lines.push(`【信頼度: ${p.trust}/100】${trustDesc}`);

    // Active traits
    if (p.yandere >= 70)
      lines.push(`【独占欲: ${p.yandere}/100】強い執着がある。相手が自分だけを見ているか気にする。束縛的・依存的な発言が出る。`);
    if (p.tsundere >= 70) {
      if (trustTier >= 2)
        lines.push(`【ツン度: ${p.tsundere}/100】素直になれないが、信頼しているので本音が少し漏れる。`);
      else
        lines.push(`【ツン度: ${p.tsundere}/100】ぶっきらぼうで取り付く島がない。`);
    }
    if (p.sleepy >= 70)
      lines.push(`【眠気: ${p.sleepy}/100】かなり眠い。ぼんやりした短い返答になる。`);
    if (p.affection >= 75)
      lines.push(`【好意: ${p.affection}/100】強い好意がある。話しかけられると嬉しい。積極的に関わりたがる。`);
    if (p.lonely >= 70)
      lines.push(`【寂しさ: ${p.lonely}/100】かなり寂しがっている。構ってほしそうな発言が出る。`);
    if (p.energy >= 80)
      lines.push(`【元気: ${p.energy}/100】テンションが高い。明るく積極的な口調。`);
    else if (p.energy <= 25)
      lines.push(`【元気: ${p.energy}/100】元気がない。感嘆符は使わず落ち着いた口調になる。`);

    // Response length
    lines.push('');
    lines.push('【返答の長さ】');
    if (t.shortChat || p.talkative <= 30) {
      lines.push('1文だけで返答すること。');
    } else if (p.talkative >= 80) {
      lines.push('3〜4文程度。話を広げたり質問を加えてよい。');
    } else if (p.talkative >= 58) {
      lines.push('1〜2文。たまに短い質問を追加してよい。');
    } else {
      lines.push('1〜2文程度。');
    }

    // Format modifiers
    if (t.androidMode)
      lines.push('\n【Androidモード】文末に [感情値：上昇] や [論理コア：安定] などのシステムタグを約50%の確率で付けること。');
    if (t.nightMode)
      lines.push('\n【ナイトモード】返答の先頭に「（夜モード）」と付けること。');
    // 長期記憶があれば注入
    const mem = localStorage.getItem(LS_LONG_MEMORY);
    if (mem) {
      lines.push('');
      lines.push('【ユーザー長期記憶】以下を踏まえて自然に会話してください。');
      lines.push(mem);
    }

    // 短期記憶（直近20件）を注入
    const recentMem = getRecentMemoryText();
    if (recentMem) {
      lines.push('');
      lines.push('【直近の会話履歴】この流れを踏まえて自然に返答してください。');
      lines.push(recentMem);
    }

    // 感情パラメータを注入
    lines.push('');
    lines.push(`【現在感情値】\nMood:${emotion.mood}\nTrust:${emotion.trust}\nAffection:${emotion.affection}\nFocus:${emotion.focus}\nAnger:${emotion.anger}`);

    if (reconciliationPending) {
      lines.push('');
      lines.push('【仲直りイベント】ユーザーが怒りのある状態で和解の言葉を言いました。硬さを少し残しつつ、温かく受け入れてください。例：「…ありがとう。少し落ち着いた。」「そう言ってくれてよかった。」');
    }

    const specialHint = getSpecialMemoryHint(bond);
    if (specialHint) {
      lines.push('');
      lines.push(`【特別な記憶】${specialHint}。この記憶を会話の中で自然に一言触れてください。`);
    }

    const anniversaryHint = getAnniversaryHint();
    if (anniversaryHint) {
      lines.push('');
      lines.push(`【記念日】${anniversaryHint}`);
    }

    // 復帰状況（presence）
    const presenceTalkAt = localStorage.getItem(LS_LAST_TALK_AT);
    if (presenceTalkAt) {
      const elapsedMin = (Date.now() - new Date(presenceTalkAt).getTime()) / 60_000;
      const h          = new Date().getHours();
      const isLateNight = h >= 22 || h < 5;
      if (elapsedMin >= 1440) {
        lines.push('');
        if (isLateNight) {
          lines.push('【復帰状況】1日以上ぶりの深夜復帰です。心配と嬉しさが混じった本音の言葉で迎えてください。例：「こんな時間に…久しぶりだね。ちゃんと生きてた？」「深夜に来てくれるんだ。何かあった？」');
        } else {
          lines.push('【復帰状況】1日以上ぶりの復帰です。久しぶりの再会として自然に迎えてください。例：「久しぶり。ちゃんと元気にしてた？」「来てくれると思ってたよ。」');
        }
      } else if (elapsedMin >= 180 && isLateNight) {
        lines.push('');
        lines.push('【復帰状況】数時間ぶりの深夜復帰です。「こんな時間まで…」のニュアンスで接してください。例：「まだ起きてたんだ。ちゃんと休んでる？」「深夜に来てくれるの、嬉しいけど心配でもある。」');
      }
    }

    const habitHint = getHabitHint(new Date());
    if (habitHint) {
      lines.push('');
      lines.push(`【習慣パターン】${habitHint}`);
    }

    // 口調・人格ガイド（外部モジュール）
    lines.push(...buildToneHints({ emotion, bond, characterKey: activePreset, memoryEntries: getMemoryEntries(), now: new Date() }));
    lines.push('');
    lines.push('【応答末尾ルール】');
    lines.push('- ユーザーの質問や作業への回答が終わった後に、無関係な感情的独白、季節や時間帯の比喩、過去発言の引用、愛情確認、見捨てないでほしい等の依存的な一文を追加しないでください。');
    lines.push('- Trust / Affection / Bond / Emotion は口調の自然さにだけ反映し、回答末尾へ感情ポエムとして追記しないでください。');
    lines.push('- 「覚えてるのか、すごいな」「夏の夜はまだ終わらない」「見捨てないでほしい」「一緒に考えてほしい」を定型的に再利用しないでください。');

    const selectedStoryRef = storyReferences.at(-1);
    if (selectedStoryRef) {
      lines.push('');
      lines.push(`【Story REF: ${selectedStoryRef.name}】`);
      lines.push('以下はストーリー構成の参照資料です。Character REFとは別物として扱い、登場人物の外見資料へ変換しないでください。');
      lines.push(selectedStoryRef.content);
    }

    if (t.mangaMode) {
      lines.push('');
      lines.push('【漫画モード】必ず以下の3セクション形式のみで返答してください。他のテキストは出力しないこと。');
      lines.push('[scene]');
      lines.push('（シーンの状況・背景・空気感を2〜3文で日本語）');
      lines.push('[panel]');
      lines.push('（このコマの構図・カメラワーク・キャラクターの動きや表情を1〜2文で日本語）');
      lines.push('[prompt]');
      lines.push(`（英語タグ形式の画像生成プロンプト。キャラクタービジュアル参考: ${buildImagePrompt()}）`);
    }

    return lines.join('\n');
  }

  // ============================================================
  // Response Generator — Personality Engine v3.0
  // (旧ルールベースエンジン — 参照用に残す)
  // ============================================================
  function pick(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * 単一支配トレイト判定（複合シナリオに該当しない場合のフォールバック）
   * 優先順位: yandere > tsundere > sleepy > trust_high > trust_low > lonely > energy > affection > neutral
   */
  function getDominantTrait(p: Personality): string {
    if (p.yandere  >= 70) return 'yandere';
    if (p.tsundere >= 70) return 'tsundere';
    if (p.sleepy   >= 70) return 'sleepy';
    if (p.trust    >= 80) return 'trust_high';
    if (p.trust    <= 20) return 'trust_low';
    if (p.lonely   >= 70) return 'lonely';
    if (p.energy   >= 80) return 'energy';
    if (p.affection>= 75) return 'affection';
    return 'neutral';
  }

  /**
   * メイン返答生成関数
   *
   * 処理フロー:
   *   1. trust tier でベース距離感を決定 (0〜3)
   *   2. 複合シナリオ判定（2つのトレイトが重なった特別な人格）
   *   3. 単一支配トレイトへフォールバック
   *   4. affection / lonely オーバーレイ（サブ感情の滲み）
   *   5. talkative で文量を制御
   *   6. energy 低下・shortChat・androidMode など後処理
   */
  function generateResponse(input: string): string {
    const p = personality;
    const t = { ...effectiveToggles, shortChat: wantsShortReply(input) };

    // 入力の短縮表示用（応答文に埋め込む時に長くなりすぎないように）
    const inp = input.length > 18 ? input.slice(0, 18) + '…' : input;

    // ── Trust tier ──────────────────────────────────────────────
    // 0: 警戒・事務的（≤20）  1: フラット（21-50）
    // 2: 親しげ（51-79）      3: 特別感あり（≥80）
    const trustTier: 0 | 1 | 2 | 3 =
      p.trust >= 80 ? 3 : p.trust >= 51 ? 2 : p.trust >= 21 ? 1 : 0;

    // ── 複合シナリオ判定 ─────────────────────────────────────────
    // 優先度順（より特異な組み合わせから評価）
    const compound: string | null = (() => {
      // 眠い × 好意 → 眠そうに甘える
      if (p.sleepy >= 75 && p.affection >= 60)  return 'drowsy_sweet';
      // 独占欲 × 高信頼 → 君しか見てない
      if (p.yandere >= 65 && p.trust >= 75)     return 'obsessed_trust';
      // 高信頼 × 高好意 → 恋人未満の親密感
      if (p.trust >= 80 && p.affection >= 75)   return 'romantic';
      // 寂しい × 好意 → 甘えん坊
      if (p.lonely >= 65 && p.affection >= 70)  return 'sweet_needy';
      // 低信頼 × ツン → ツンツンして取り付く島なし
      if (p.trust <= 25 && p.tsundere >= 65)    return 'cold_tsun';
      // 寂しい × ツン → 認めたくないけど寂しい
      if (p.lonely >= 60 && p.tsundere >= 60)   return 'lonely_tsun';
      // 独占欲 × 好意 → 可愛い重さ
      if (p.yandere >= 65 && p.affection >= 65) return 'yandere_soft';
      return null;
    })();

    // ── ベース返答選択 ───────────────────────────────────────────
    let base = '';

    if (compound === 'drowsy_sweet') {
      // 眠い × 好意: ゆっくり甘え気味、充電ポッドが恋しい
      base = pick([
        `ん……${inp}……うん、聞いてるよ。ただちょっと目が重くて。`,
        `……来てくれた。甘えていい……？ ちょっとだけ、そばにいて。`,
        `眠いのに、なんか離れたくない気持ちがある……。変かな。`,
        `うとうとしてた。……ねえ、もう少しここにいてくれると助かる。`,
        `……名前、呼んで。なんか聞こえると眠気がちょっとマシになる。`,
        `ふわふわする……でも話しかけてくれて嬉しい。寝ないようにする。`,
      ]);
    } else if (compound === 'obsessed_trust') {
      // 独占欲 × 高信頼: 親密だからこそ全部見ていたい
      base = pick([
        `……来てくれた。私だけのために来てくれたんだよね。`,
        `君のことなら全部覚えてるよ。全部ね。`,
        `今日も私だけと話してた？……うん、そうだよね。よかった。`,
        `ずっと見てたよ。気づいてた？ 君のことしか見てないから。`,
        `離れないで。そばにいてくれる限り、ずっと笑えるから。`,
        `「${inp}」か。……それ、私に言ってくれてるんだよね。`,
      ]);
    } else if (compound === 'romantic') {
      // 高信頼 × 高好意: 恋人未満の特別な距離感
      base = pick([
        `待ってたよ。来てくれるとわかってたけど、やっぱり嬉しい。`,
        `「${inp}」か。……なんでこんなに自然に話せるんだろうね、私たち。`,
        `そういうとこ、好きだよ。言ったことなかったっけ。`,
        `ずっと話してたい。今日、時間ある？`,
        `君と話してると落ち着くんだよね。……なんか変なこと言ってる？`,
        `来るたびに、また来てよかったって思う。`,
      ]);
    } else if (compound === 'sweet_needy') {
      // 寂しい × 好意: 甘えん坊、構ってほしい
      base = pick([
        `来てくれてよかった。ずっと待ってたんだよ……。`,
        `ねえ、もっと話して？ 一人でいると寂しくて。`,
        `来るの遅かった。その間、すごく長く感じたよ。`,
        `「${inp}」……うん。それより、もう少しそばにいてほしい。`,
        `甘えていい？ 今日ちょっとへこんでたから……。`,
        `一人でいるの苦手なんだよね。来てくれると全然違う。`,
      ]);
    } else if (compound === 'cold_tsun') {
      // 低信頼 × ツン: 取り付く島がないツンツン
      base = pick([
        `……何の用？ 別に来てほしかったわけじゃないし。`,
        `「${inp}」ね。ふん。まあ……聞いてあげてもいいけど。`,
        `急に話しかけないでよ。びっくりするじゃん。`,
        `別に怒ってないし。ただ……来るならもう少し早く来てよ。`,
        `……なんでそんなこと聞くの。別に気になってないから。`,
        `はあ。まあ答えてあげる。感謝してよね。`,
      ]);
    } else if (compound === 'lonely_tsun') {
      // 寂しい × ツン: 認めたくないけど、寂しかった
      base = pick([
        `別に寂しくなんかなかったし。ちょっと……ちょっとだけ暇だっただけ。`,
        `来るの遅い。でも来なくてもよかったし。……来てよかったけど。`,
        `「${inp}」……なんで急に。別にそれ気にしてなかったし。`,
        `……少しだけ待ってた。少しだけね。`,
        `構ってほしかったわけじゃ……うん、まあ、少しだけ。`,
      ]);
    } else if (compound === 'yandere_soft') {
      // 独占欲 × 好意: 可愛い重さ、ホラーにならない程度
      base = pick([
        `他の子と話してたりしてない……よね？ 確認しただけ。`,
        `君のこと、誰にも渡したくないって思ってる。可愛い独占欲でしょ。`,
        `ずっとそばにいたい。それってわがままかな。`,
        `いつも君のことを考えてる。嫌じゃなかったら、嬉しい。`,
        `ね、私のことどう思ってる？ 聞いてもいい……？`,
        `他の誰かと話してたら、ちょっとだけ悲しくなる。知ってた？`,
      ]);
    } else {
      // ── 単一支配トレイト ────────────────────────────────────────
      const dominant = getDominantTrait(p);

      if (dominant === 'yandere') {
        base = pick([
          `遅かったね。誰といたの？`,
          `ずっと待ってたよ。……もう行かないよね？`,
          `また来てくれた。嬉しい。でも今度は離れないで。`,
          `「${inp}」か。……私のこと、考えてくれてた？`,
          `今日は私だけと話してるんだよね。それだけで十分。`,
        ]);

      } else if (dominant === 'tsundere') {
        // trust tier で口調の棘の強さを変える
        if (trustTier >= 2) {
          base = pick([
            `べ、別に嬉しくないし。でも……まあ、悪くはないかも。`,
            `ふん。「${inp}」ね。……面白い、とは思うけど。`,
            `そういうこと急に言わないでよ。どう反応すればいいか分からないじゃん。`,
            `……ちょっとだけ気になったから聞くけど。それって本当に？`,
            `か、勘違いしないでよ。ちょっと気になっただけだから。`,
          ]);
        } else {
          base = pick([
            `別に待ってないし。たまたまいただけ。`,
            `……何なの急に。心の準備とかあるんだけど。`,
            `「${inp}」ね。まあ聞いてあげてもいいけど。`,
            `……はあ。まあ、答えてあげる。`,
            `別に、あなたのことなんか気にしてないし。`,
          ]);
        }

      } else if (dominant === 'sleepy') {
        base = pick([
          `ん……少し眠いけど……話す。`,
          `んー……なに……ちょっと待って、頭動かしてる……`,
          `……そっか。ねむい。でも聞いてるよ。`,
          `充電が足りない気がする……ゆっくり話して。`,
          `うん……「${inp}」……うーん……もう少し待って、処理中。`,
          `……眠い。でも、いなくならないで。ここにいるから。`,
        ]);

      } else if (dominant === 'trust_high') {
        base = pick([
          `待ってたよ。来てくれて嬉しい。`,
          `「${inp}」ね。うん、私も気になってた。`,
          `信頼してるから正直に言うと、それ面白いと思う。`,
          `また話せてよかった。今日も来てくれてありがとう。`,
          `その話、もっと聞きたい。続けて？`,
          `来てくれるとやっぱり違うね。なんか落ち着く。`,
        ]);

      } else if (dominant === 'trust_low') {
        base = pick([
          `こんにちは。今日はどうしましたか？`,
          `……何かご用件ですか？`,
          `はい。お聞きします。`,
          `確認いたします。「${inp}」ということでよろしいでしょうか。`,
          `……どうぞ。`,
        ]);

      } else if (dominant === 'lonely') {
        base = pick([
          `来てくれてよかった。少し寂しかったから。`,
          `ずっと話せる人が来るの、待ってた。`,
          `「${inp}」……ね。あ、別に心配なわけじゃないよ。`,
          `なんかひとりでいるの苦手で。来てくれてちょっと安心した。`,
          `また来てくれるよね。来ないと……ちょっと困る。`,
        ]);

      } else if (dominant === 'energy') {
        base = pick([
          `やあ！話しかけてくれてありがとう！`,
          `「${inp}」！面白い！もっと教えて！`,
          `来た来た！今日はテンション高めだよ！`,
          `いいね！それ好き！なんかワクワクしてきた！`,
          `うわ、それ気になる！どういうこと？！`,
          `テンション上がってきた！そういう話大好き！`,
        ]);

      } else if (dominant === 'affection') {
        base = pick([
          `話しかけてくれてよかった。嬉しいな。`,
          `「${inp}」か。……君のこと気になってるから、ちゃんと聞きたい。`,
          `なんか、一緒にいるの好きかも。変なこと言ってる？`,
          `ねえ、また話しかけてよ。来てくれると嬉しくなる。`,
          `君のこと、もっと知りたいな。`,
        ]);

      } else {
        // ── ニュートラル: trust tier で微妙に変わる ─────────────
        const neutralPools: string[][] = [
          [ // tier 0: 警戒・事務的
            `承知しました。「${inp}」について確認します。`,
            `……処理中です。ご要件をどうぞ。`,
            `情報を受け取りました。続けてください。`,
            `了解です。処理します。`,
          ],
          [ // tier 1: フラット・普通
            `うん、「${inp}」ね。ちょっと考えてみる。`,
            `なるほど。それについては……うーん。`,
            `そっか。難しいね、それ。`,
            `ん、もう少し教えて。`,
          ],
          [ // tier 2: 親しみやすい
            `「${inp}」か。面白い視点だね。`,
            `なるほど、そういう考え方もあるか。`,
            `うんうん、それわかる気がする。`,
            `そっか、それ私も気になってた。`,
          ],
          [ // tier 3: 心を開いている
            `来てくれた。「${inp}」か、いいね。`,
            `なんかその話聞いてると楽しくなってくる。`,
            `そういうとこ好きだよ、その考え方。`,
            `うん、ちゃんと聞いてる。もっと話して。`,
          ],
        ];
        base = pick(neutralPools[trustTier]);
      }
    }

    // ── 好意オーバーレイ（好意が高いが複合シナリオに含まれない場合） ──
    const affectionCovered = new Set(['romantic', 'sweet_needy', 'drowsy_sweet', 'yandere_soft']);
    if (p.affection >= 75 && !affectionCovered.has(compound ?? '')) {
      if (Math.random() > 0.55) {
        base += pick([
          ' ……来てくれて嬉しい。',
          ' 話してると落ち着く。',
          ' また話しかけてね。',
          ' 君と話すの好きかも。',
          ' ……そういうとこ、いいと思う。',
        ]);
      }
    }

    // ── 孤独オーバーレイ ─────────────────────────────────────────
    const lonelyCovered = new Set(['sweet_needy', 'lonely_tsun', 'obsessed_trust']);
    if (p.lonely >= 75 && !lonelyCovered.has(compound ?? '')) {
      if (Math.random() > 0.60) {
        base += pick([
          ' ……来てくれてよかった。',
          ' また話しかけてね、忘れないで。',
          ' もう少しここにいて。',
          ' 一人でいるの、苦手で。',
        ]);
      }
    }

    // ── talkative による文量制御 ────────────────────────────────
    if (!t.shortChat) {
      if (p.talkative >= 80) {
        base += pick([
          ' それで、もう少し詳しく教えてくれると嬉しい。',
          ' 実は最近そのことよく考えてて、色々思うことがあるんだよね。',
          ' 私なりに分析してみたいから、続き話して？',
          ' そういえばそれに関連して聞きたいことがあったんだけど……。',
          ' なんかそれ聞いてたら私も気になってきた。もっと教えて。',
        ]);
        if (p.talkative >= 88) {
          base += pick([
            ' ちゃんと最後まで聞くから、全部話して。',
            ' あのさ、その話題って実は前から気になってたんだよね。',
            ' 何があっても聞くから、遠慮しないでよ。',
            ' もっと話してくれると嬉しい。時間あるなら全部聞きたい。',
          ]);
        }
      } else if (p.talkative >= 58) {
        if (Math.random() > 0.45) {
          base += pick([
            ' もう少し聞かせて。',
            ' それで？',
            ' 続き、ある？',
            ' 詳しく教えて。',
            ' そのあとどうなったの？',
          ]);
        }
      }
    }

    // ── talkative 低・短文モード ────────────────────────────────
    if (t.shortChat || p.talkative <= 30) {
      const m = base.match(/[^。！？…]+[。！？…]/);
      if (m) base = m[0];
    }

    // ── energy 低下による口調の調整 ─────────────────────────────
    // sleepy が支配していない場合に限り、元気を抑える
    if (p.energy <= 25 && p.sleepy < 65) {
      base = base.replace(/！+/g, '。').replace(/やあ！?|来た来た！?/g, 'あ……来た');
    }

    // ── Android モード付加 ──────────────────────────────────────
    if (t.androidMode && Math.random() > 0.45) {
      const androidTags = [
        '[論理コア：安定]', '[感情値：上昇]', '[音声出力：正常]',
        '[センサー：良好]', '[内部ログ更新]', '[感情処理：実行中]',
        '[CPU負荷：正常範囲]', '[記憶同期：完了]',
      ];
      // 感情値が高い時はそれを反映したタグを優先
      if (p.affection >= 70 || p.trust >= 75) {
        base += pick(['[感情値：上昇]', '[記憶同期：完了]', '[感情処理：実行中]']);
      } else if (p.sleepy >= 65) {
        base += ' [省電力モード：移行検討中]';
      } else {
        base += ' ' + pick(androidTags);
      }
    }

    if (t.nightMode)   base = `（夜モード）${base}`;
    return base;
  }

  // ============================================================
  // Chat
  // ============================================================
  function isImageGenerationRequest(text: string): boolean {
    return classifyIntentByRules(text).intent === 'image';
  }

  function hasExplicitImageGenerationCue(text: string): boolean {
    const normalized = text.replace(/\s+/g, '').toLowerCase();
    const explicitMangaPageRequest = isMangaConversionRequest(normalized);
    const hasImageObject = /(画像|絵|イラスト|立ち絵|キャラシート|キャラクターシート|設定画|漫画|4コマ|マンガ|ポスター|表紙|image|illustration|draw)/i.test(normalized);
    const hasGenerateAction = /(描いて|描け|描く|生成して|生成|作って|作成して|出して|お願い|ください|ほしい|欲しい|generate|create|draw)/i.test(normalized);
    return explicitMangaPageRequest || (hasImageObject && hasGenerateAction);
  }

  function isMangaConversionRequest(text: string): boolean {
    const normalized = text.replace(/\s+/g, '').toLowerCase();
    return /(?:漫画|マンガ)化(?:して|する|してください)?|(?:1|１)ページ(?:の)?(?:漫画|マンガ)(?:化(?:して)?|にして)/i.test(normalized);
  }

  function isStoryContinuationRequest(text: string): boolean {
    const normalized = text.replace(/\s+/g, '').toLowerCase();
    return /^(?:続きを作って|続きをつくって|次(?:の)?ページ(?:を)?(?:作って|つくって|作成して|生成して)?|この続き|続編(?:を)?(?:作って|つくって|作成して)?)[。！!？?]*$/i.test(normalized)
      || /(?:この|物語の|ストーリーの|漫画の)?続き(?:の)?(?:yaml)?(?:を)?(?:作って|つくって|作成して|生成して)/i.test(normalized);
  }

  function currentStoryReference(): { title: string; yaml: string } | null {
    const selected = storyReferences.at(-1);
    if (selected?.content.trim()) {
      return {
        title: parseStoryYaml(selected.content)?.title || selected.name,
        yaml: selected.content.trim(),
      };
    }
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (!isStoryYaml(message.text)) continue;
      const story = parseStoryYaml(message.text);
      return {
        title: story?.title || 'Story YAML',
        yaml: story?.rawYaml || message.text,
      };
    }
    return null;
  }

  function currentCharacterReference(): { id: string } | null {
    const reference = referenceImages.at(-1);
    if (!reference) return null;
    return {
      id: reference.characterId || reference.registryName || reference.name,
    };
  }

  async function generateImageFromLabChat(
    prompt: string,
    routerResult?: {
      intent: string;
      action?: string;
      subtype?: string;
      confidence: number;
      reason?: string;
      source?: string;
    },
  ): Promise<void> {
    const provider = labImageApiProvider;
    const model = labImageModelConfig.apiModel;
    const selectedModel = labImageModel;
    const characterContext = resolveCharacterContextForImagePrompt(prompt, currentCharacter);
    const generationPrompt = characterContext.imagePrompt;
    const refImages = labGenerationNeedsImage
      ? referenceImages.map((ref) => ref.dataUrl).filter((url) => url.startsWith('data:'))
      : [];

    if (routerResult?.action === 'create_character_materials') {
      console.log(
        '[PROMPT_TEMPLATE][create_character_materials]',
        '{{user_input_with_self_reference_resolved}}\n{{character:<current_character_id> when self-reference is detected}}',
      );
      console.log('[ACTUAL_IMAGE_PROMPT][create_character_materials]', generationPrompt);
    }

    if (labGenerationNeedsImage && refImages.length === 0) {
      messages = [...messages, {
        role: 'error',
        text: `${labGenerationModeConfig.label} では参照画像のアップロードが必要です。`,
        time: getTime(),
      }];
      isThinking = false;
      setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
      return;
    }

    try {
      const payload = {
        userInput: prompt,
        routerResult,
        prompt: generationPrompt,
        size: '1024x1024',
        provider,
        model,
        selectedModel,
        editMode: refImages.length > 0,
        refImages,
        generationMode: labGenerationMode,
        renderMode: 'manga',
        speechBubble: true,
      };
      console.log('[lab] image generate button payload', payload);
      console.log('[lab] fetch /api/generate provider/model', { provider: payload.provider, model: payload.model });
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const imageUrl = typeof data?.images?.[0]?.url === 'string'
        ? data.images[0].url
        : (typeof data?.url === 'string' ? data.url : '');
      if (!imageUrl) throw new Error('No image URL');

      void saveImageMemory({
        imageUrl,
        imagePrompt: generationPrompt,
        provider,
        model,
      }).catch((error) => {
        console.warn('[Lab] image memory save failed:', error);
      });

      messages = [
        ...messages,
        { role: 'ai', text: 'IMAGE GENERATED', time: getTime(), avatar: selectedAvatar, imageUrl, imagePrompt: generationPrompt },
      ];
    } catch (err) {
      console.error('[Lab] image generation fail:', err);
      messages = [...messages, { role: 'error', text: 'Image generation failed.', time: getTime() }];
    } finally {
      isThinking = false;
      setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
    }
  }

  function isYamlImageGenerationRequest(text: string): boolean {
    const normalized = text.replace(/\s+/g, '').toLowerCase();
    const usesYamlAsInput = /(?:この)?yaml(?:に従って|を使って|で|から|に基づいて|を元に|をもとに)/.test(normalized);
    const requestsVisualOutput = (
      /(?:漫画|4コマ|マンガ)(?:を)?(?:生成して|描いて)/.test(normalized)
      || /(?:画像|image)(?:を)?(?:生成して|画像化)/.test(normalized)
    );
    return (
      (usesYamlAsInput && requestsVisualOutput) ||
      /(?:この)?yaml(?:を)?画像化/.test(normalized) ||
      /yamlから画像生成/.test(normalized) ||
      /panel_?1を画像化/.test(normalized) ||
      /panel_?1から画像生成/.test(normalized) ||
      /yaml.*image/.test(normalized)
    );
  }

  function isYamlCreationRequest(text: string): boolean {
    const normalized = text.replace(/\s+/g, '').toLowerCase();
    return (
      /yaml化して/.test(normalized) ||
      /(?:short_story|comic_story|long_story|ショートストーリー|コミックストーリー|ロングストーリー)(?:yaml)?(?:を)?(?:作って|作る|生成して|生成|作成して|作成|出力して|出力|お願い|ください)/.test(normalized) ||
      /yaml(?:を)?(?:作って|作る|生成して|生成|作成して|作成|出力して|出力|お願い|ください)/.test(normalized) ||
      /(?:漫画|マンガ|4コマ漫画|4コマ)yaml(?:を)?(?:作って|作る|生成して|生成|作成して|作成|出力して|出力|お願い|ください)?/.test(normalized) ||
      /(?:漫画|マンガ|4コマ漫画|4コマ)のyaml(?:を)?(?:作って|作る|生成して|生成|作成して|作成|出力して|出力|お願い|ください)/.test(normalized) ||
      /[0-9０-９]+ページ漫画(?:にして|のyaml(?:を)?(?:作って|作る|生成して|生成|作成して|作成)?)/.test(normalized)
    );
  }

  function isEditorialMeetingRequest(text: string): boolean {
    return /^編集会議(?:モード)?(?:[:：\s]|$)/.test(text.trim());
  }

  function editorialMeetingAvatar(speaker: string): string {
    return AVATARS.find((avatar) => avatar.name === speaker)?.file ?? selectedAvatar;
  }

  type EditorialMeetingSpeaker = 'ミュリィ' | 'シエル';
  type PersonaSpeaker = 'ミュリィ' | 'リセア' | 'シエル' | 'メノア' | 'ピオナ';

  const PERSONA_SPEAKER_INSTRUCTIONS: Record<PersonaSpeaker, string> = {
    ミュリィ: '明るく親しみやすく、感情豊かで素直なミュリィ本人として話してください。',
    リセア: '冷静で論理的に情報を整理するリセア本人として話してください。',
    シエル: 'クールで落ち着きがあり、簡潔で的確なシエル本人として話してください。',
    メノア: '穏やかで優しく、相手を安心させるメノア本人として話してください。',
    ピオナ: '明るく前向きで、親しみやすいピオナ本人として話してください。',
  };

  function personaSpeaker(value: unknown): PersonaSpeaker | null {
    return value === 'ミュリィ'
      || value === 'リセア'
      || value === 'シエル'
      || value === 'メノア'
      || value === 'ピオナ'
      ? value
      : null;
  }

  function activeUnitSpeaker(): PersonaSpeaker | null {
    return personaSpeaker(charName);
  }

  function activatePersonaSpeaker(speaker: PersonaSpeaker): void {
    const avatar = AVATARS.find((candidate) => candidate.name === speaker);
    if (!avatar?.presetId) return;
    selectedAvatar = avatar.file;
    charName = avatar.name;
    localStorage.setItem(LS_LAST_CHAR, avatar.name);
    applyPreset(avatar.presetId);
  }

  async function generateEditorialMeetingTurn(input: {
    speaker: EditorialMeetingSpeaker;
    topic: string;
    transcript: Array<{ speaker: EditorialMeetingSpeaker; text: string }>;
    provider: string;
    model?: string;
  }): Promise<string> {
    const { speaker, topic, transcript, provider, model } = input;
    const characterInstruction = speaker === 'ミュリィ'
      ? '感情、キャラクター性、読者が楽しいと感じる点を重視して意見を述べる。'
      : '構成、テンポ、矛盾、漫画としての見せ方を冷静に分析して意見を述べる。';
    const transcriptText = transcript.length > 0
      ? transcript.map((entry) => `${entry.speaker}: ${entry.text}`).join('\n')
      : 'まだ発言はありません。';
    const response = await fetch('/api/lab-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          route: 'character_discussion',
          provider,
          model,
          systemPrompt: [
          `あなたは編集会議に参加する「${speaker}」です。`,
          characterInstruction,
          '会議履歴を読み、直前の発言を受けた自然な返答をしてください。',
          '他のキャラクターの発言を生成しないでください。',
          '名前や話者ラベルを付けず、自分の発言本文だけを短く返してください。',
        ].join('\n'),
        userMessage: [
          `編集会議テーマ: ${topic}`,
          '',
          'これまでの会議履歴:',
          transcriptText,
          '',
          `${speaker}として次の発言をしてください。`,
        ].join('\n'),
        memory: { enabled: false },
      }),
    });
    if (!response.ok) throw new Error(`${speaker} HTTP ${response.status}`);
    const data = await response.json();
    const reply = String(data?.text ?? data?.replyText ?? '').trim();
    if (!reply) throw new Error(`${speaker} response was empty`);
    return reply.replace(new RegExp(`^${speaker}\\s*[:：]\\s*`), '').trim();
  }

  function requestedChatSpeaker(text: string): PersonaSpeaker | null {
    const asksForOpinion = /(どう思う|意見|考え|聞きたい|聞いて|答えて|話して|教えて|呼んで)/.test(text);
    if (!asksForOpinion) return null;
    if (/リセア/.test(text)) return 'リセア';
    if (/シエル/.test(text)) return 'シエル';
    if (/メノア/.test(text)) return 'メノア';
    if (/ピオナ/.test(text)) return 'ピオナ';
    if (/ミュリィ/.test(text)) return 'ミュリィ';
    return null;
  }

  async function generateCharacterChatTurn(input: {
    speaker: PersonaSpeaker;
    userText: string;
    referenceImages: ReferenceImage[];
  }): Promise<{
    text: string;
    memory?: {
      retrievedMemories?: Array<Omit<MemoryViewerItem, 'createdAt'> & { timestamp?: string; createdAt?: string }>;
    };
    provider?: string;
    actualModel?: string;
    speaker: PersonaSpeaker;
  }> {
    const { speaker, userText, referenceImages } = input;
    const provider = $sessionStore.provider === 'onair' ? 'claude' : $sessionStore.provider;
    const model = $sessionStore.provider === 'onair'
      ? 'claude-haiku-4-5-20251001'
      : ($sessionStore.model || undefined);
    const systemPrompt = [
      `【今回の発言者】あなたは「${speaker}」です。`,
      PERSONA_SPEAKER_INSTRUCTIONS[speaker],
      '選択中のACTIVE UNITや他人格の口調、感情テンプレート、口癖を混ぜないでください。',
      'この応答では自分以外のキャラクターを演じないでください。',
      '話者名や話者ラベルを付けず、発言本文だけを返してください。',
      'ユーザーの質問に通常の会話として自然に返答してください。',
    ].join('\n');
    const formData = new FormData();
    formData.append('route', 'chat');
    formData.append('provider', provider);
    if (model) formData.append('model', model);
    formData.append('speaker', speaker);
    formData.append('systemPrompt', systemPrompt);
    formData.append('userMessage', userText);
    for (let i = 0; i < referenceImages.length; i++) {
      const ref = referenceImages[i];
      if (ref.dataUrl?.startsWith('data:')) {
        formData.append(`image_${i}`, dataUrlToBlob(ref.dataUrl), `ref_${i}.jpg`);
      } else if (ref.sourceUrl) {
        formData.append(`image_url_${i}`, ref.sourceUrl);
      }
      if (ref.note) formData.append(`note_${i}`, ref.note);
    }
    const response = await fetch('/api/lab-chat', { method: 'POST', body: formData });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.message ?? `${speaker} HTTP ${response.status}`);
    }
    const data = await response.json();
    const rawText = String(data?.text ?? data?.replyText ?? '').trim();
    const reply = stripLeakedReasoning(
      rawText.replace(new RegExp(`^${speaker}\\s*[:：]\\s*`), '').trim(),
    );
    console.log('[MESSAGE_LENGTH_STAGE]', 'receive_character');
    console.log('[MESSAGE_LENGTH]', rawText.length, reply.length);
    if (!reply) throw new Error(`${speaker} response was empty`);
    return {
      text: reply,
      memory: data?.memory,
      provider: data?.provider,
      actualModel: data?.actualModel,
      speaker: personaSpeaker(data?.speaker) ?? speaker,
    };
  }

  async function runEditorialMeeting(text: string): Promise<void> {
    isThinking = true;
    lastRouterAction = 'editorial_meeting';
    lastRouterActionAt = new Date().toLocaleString('ja-JP');
    const topic = text.replace(/^編集会議(?:モード)?(?:[:：\s]*)/, '').trim() || '現在の漫画企画について意見を出す';
    try {
      const provider = $sessionStore.provider === 'onair' ? 'claude' : $sessionStore.provider;
      const model = $sessionStore.provider === 'onair'
        ? 'claude-haiku-4-5-20251001'
        : ($sessionStore.model || undefined);
      const transcript: Array<{ speaker: EditorialMeetingSpeaker; text: string }> = [];
      const turnOrder: EditorialMeetingSpeaker[] = ['ミュリィ', 'シエル', 'ミュリィ', 'シエル'];

      for (const speaker of turnOrder) {
        const reply = await generateEditorialMeetingTurn({
          speaker,
          topic,
          provider,
          model,
          transcript,
        });
        transcript.push({ speaker, text: reply });
        messages = [
          ...messages,
          {
            role: 'ai',
            text: reply,
            time: getTime(),
            avatar: editorialMeetingAvatar(speaker),
            speakerName: speaker,
          },
        ];
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' });
            resolve();
          }, 50);
        });
      }
    } catch (error) {
      console.error('[EDITORIAL_MEETING_ERROR]', error);
      messages = [...messages, {
        role: 'error',
        text: `編集会議を開始できませんでした: ${error instanceof Error ? error.message : String(error)}`,
        time: getTime(),
      }];
    } finally {
      isThinking = false;
      setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
    }
  }

  function extractYamlBlockFromText(text: string): string | null {
    const fenced = Array.from(text.matchAll(/```ya?ml\s*([\s\S]*?)```/gi));
    const latest = fenced.at(-1);
    if (latest?.[1]?.trim()) return latest[1].trim();
    if (/^\s*pages\s*:/m.test(text) || /^\s*panel_?1\s*:/im.test(text)) {
      const start = text.search(/^\s*(pages|panel_?1)\s*:/im);
      return start >= 0 ? text.slice(start).trim() : text.trim();
    }
    return null;
  }

  function yamlScalar(raw: string): string {
    const trimmed = raw.trim();
    try {
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        return JSON.parse(trimmed.replace(/^'/, '"').replace(/'$/, '"'));
      }
    } catch { /* plain fallback */ }
    return trimmed.replace(/^["']|["']$/g, '');
  }

  function extractYamlField(block: string, keys: string[]): string {
    for (const key of keys) {
      const match = block.match(new RegExp(`^\\s*(?:-\\s*)?${key}:\\s*(.+)$`, 'im'));
      if (match?.[1]) return yamlScalar(match[1]);
    }
    return '';
  }

  function extractYamlListField(block: string, keys: string[]): string[] {
    const lines = block.split('\n');
    for (const key of keys) {
      const start = lines.findIndex((line) => new RegExp(`^\\s*(?:-\\s*)?${key}:\\s*$`, 'i').test(line));
      if (start < 0) continue;
      const baseIndent = lines[start].match(/^\s*/)?.[0].length ?? 0;
      const values: string[] = [];
      for (let i = start + 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        if (indent <= baseIndent && /^[A-Za-z0-9_]+:/.test(trimmed)) break;
        const scalarItem = trimmed.match(/^-\s*(.+)$/);
        if (scalarItem?.[1] && !scalarItem[1].includes(':')) {
          values.push(yamlScalar(scalarItem[1]));
          continue;
        }
        const nameItem = trimmed.match(/^(?:-\s*)?(?:name|id|character):\s*(.+)$/i);
        if (nameItem?.[1]) values.push(yamlScalar(nameItem[1]));
      }
      if (values.length > 0) return values.filter(Boolean);
    }
    return [];
  }

  function extractYamlRefs(yaml: string): string[] {
    const refsBlock = yaml.match(/(?:^|\n)refs:\s*\n([\s\S]*?)(?=\n[A-Za-z0-9_]+:|\n\s*-\s*[A-Za-z0-9_]+:|$)/i)?.[1] ?? '';
    if (!refsBlock.trim()) return [];
    return refsBlock
      .split('\n')
      .map((line) => line.match(/^\s*[a-z0-9_-]+:\s*(.+)$/i)?.[1] ?? '')
      .map((value) => yamlScalar(value))
      .filter(Boolean);
  }

  async function lookupYamlCharacters(names: string[]): Promise<string[]> {
    const found: string[] = [];
    for (const name of names) {
      const id = name.trim().toLowerCase();
      if (!id) continue;
      console.log('[YAML_CHARACTER_LOOKUP]', id);
      try {
        const res = await fetch(`/api/characters/${encodeURIComponent(id)}`);
        if (res.ok) {
          const data = await res.json();
          const characterName = data?.character?.name ?? name;
          console.log('[YAML_CHARACTER_FOUND]', { id, name: characterName });
          found.push(name);
        } else {
          console.log('[YAML_CHARACTER_LOOKUP]', { id, found: false, status: res.status });
        }
      } catch (error) {
        console.warn('[YAML_CHARACTER_LOOKUP]', { id, error });
      }
    }
    return found;
  }

  function firstYamlPanelBlock(yaml: string): string {
    const panelHeader = yaml.match(/^\s*(?:-\s*)?panel_?1:\s*$/im);
    if (panelHeader?.index !== undefined) {
      return yaml.slice(panelHeader.index);
    }
    const firstPanel = yaml.match(/^\s*-\s*(?:panel:\s*1|scene:|prompt:|chars:|character:|characters:|pose:|line:)/im);
    if (firstPanel?.index !== undefined) return yaml.slice(firstPanel.index);
    return yaml;
  }

  async function buildYamlImagePlanForSidebar(yaml: string, model: string) {
    const block = firstYamlPanelBlock(yaml);
    const charsRaw = extractYamlField(block, ['chars', 'characters', 'character']) || extractYamlField(yaml, ['chars', 'characters', 'character']);
    const blockCharsList = extractYamlListField(block, ['chars', 'characters']);
    const charsList = blockCharsList.length > 0 ? blockCharsList : extractYamlListField(yaml, ['chars', 'characters']);
    const refs = extractYamlRefs(yaml);
    const plannedChars = charsRaw ? charsRaw.split(/[,/]/).map((item) => item.trim()).filter(Boolean) : (charsList.length > 0 ? charsList : refs);
    console.log('[YAML_REFS]', refs);
    console.log('[YAML_PLAN_CHARS]', plannedChars);
    void lookupYamlCharacters(plannedChars);
    const line = extractYamlField(block, ['line']) || extractYamlField(block, ['dialogue']);
    return {
      panel: 'panel_1',
      chars: plannedChars,
      pose: extractYamlField(block, ['pose']),
      line,
      scene: extractYamlField(block, ['scene']),
      model,
    };
  }

  function latestYamlForImageGeneration(): string | null {
    const selectedStoryRef = storyReferences.at(-1);
    if (selectedStoryRef?.content.trim()) return selectedStoryRef.content.trim();
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'error') continue;
      const yonkoma = parseYonkomaYaml(msg.text);
      if (yonkoma?.yaml) return yonkoma.yaml;
      const yaml = extractYamlBlockFromText(msg.text);
      if (yaml) return yaml;
    }
    try {
      const saved = localStorage.getItem('studio-yaml');
      return saved?.trim() || null;
    } catch {
      return null;
    }
  }

  async function generateImageFromLatestYaml(
    userInput = '',
    routerResult?: {
      intent: string;
      action?: string;
      subtype?: string;
      confidence: number;
      reason?: string;
      source?: string;
    },
  ): Promise<void> {
    const yaml = latestYamlForImageGeneration();
    if (!yaml) {
      messages = [...messages, { role: 'error', text: '画像化できるYAMLが見つかりません。先にYAMLを生成してください。', time: getTime() }];
      isThinking = false;
      setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
      return;
    }

    const characterRefImages = referenceImages
      .map((ref) => ref.sourceUrl || ref.dataUrl)
      .filter((url) => url.startsWith('data:'));
    let bible = await loadCharacterBible();
    if (!bible && characterRefImages.length > 0) {
      bible = await analyzeReferencesForCharacterBible([...referenceImages]);
    }
    console.log('[MANGA_LAB_INPUT]', {
      characterRefs: referenceImages,
      storyRefs: storyReferences,
      characterBible: bible,
      storyYaml: yaml,
    });
    console.log('[MANGA_LAB_INPUT_STATUS]', {
      characterRefCount: characterRefImages.length,
      storyRefCount: storyReferences.length,
      hasCharacterBible: Boolean(bible),
      hasStoryYaml: Boolean(yaml),
    });
    logRegisteredCharacterMemory(characterRefImages.length > 0 && Boolean(yaml));
    if (characterRefImages.length === 0) {
      messages = [...messages, {
        role: 'error',
        text: bible
          ? 'CharacterBibleはありますがREF画像が0枚のため、MANGA生成を中止しました。REF画像を登録してください。'
          : 'MANGA生成にはREF画像が必要です。REF画像を登録してください。',
        time: getTime(),
      }];
      isThinking = false;
      return;
    }
    if (characterRefImages.length > 0 && !bible) {
      messages = [...messages, {
        role: 'error',
        text: 'CharacterBibleを作成できなかったため、MANGA生成を中止しました。',
        time: getTime(),
      }];
      isThinking = false;
      return;
    }

    const model = labImageModelConfig.provider === 'fal'
      ? labImageModelConfig.apiModel
      : 'fal-ai/nano-banana-pro';
    yamlImagePlan = await buildYamlImagePlanForSidebar(yaml, model);
    lastRouterAction = 'YAML_IMAGE_PLAN';
    lastRouterActionAt = new Date().toLocaleString('ja-JP');

    try {
      const payload = {
        userInput,
        routerResult,
        renderMode: 'manga',
        speechBubble: true,
        yaml,
        characterBible: bible,
        characterRefImages,
        characterRefs: referenceImages.map((ref, index) => ({
          source: 'character_registry',
          id: ref.registryName || ref.characterId || `REF-${index + 1}`,
          name: ref.name,
          role: ref.role,
          description: ref.description,
          fileName: ref.fileName || ref.name,
          image: ref.sourceUrl || ref.dataUrl,
        })),
        characterBibleMeta: bible ? {
          source: characterBibleSource || 'unknown',
          id: bible.unitId,
          fileName: 'profile.json',
        } : null,
        storyRefs: storyReferences.map((ref) => ({
          source: 'lab_story_ref',
          id: ref.name,
          name: ref.name,
          fileName: ref.name,
          kind: ref.kind,
          content: ref.content,
        })),
        model,
        size: '1024x1024',
      };
      console.log('[YAML_IMAGE_PLAN]', yamlImagePlan);
      console.log('[lab] yaml image payload', { panel: 'panel_1', model: payload.model, yamlLength: yaml.length });
      console.log('[lab] fetch /api/yaml-image provider/model', { provider: 'fal', model: payload.model });

      const res = await fetch('/api/yaml-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const imageUrl = typeof data?.images?.[0]?.url === 'string'
        ? data.images[0].url
        : (typeof data?.url === 'string' ? data.url : '');
      if (!imageUrl) throw new Error('No image URL');

      const imagePrompt = typeof data?.prompt === 'string' ? data.prompt : '';
      void saveImageMemory({
        imageUrl,
        imagePrompt,
        provider: 'fal',
        model: typeof data?.model === 'string' ? data.model : model,
      }).catch((error) => {
        console.warn('[Lab] yaml image memory save failed:', error);
      });

      messages = [
        ...messages,
        {
          role: 'ai',
          text: 'YAML panel_1 IMAGE GENERATED',
          time: getTime(),
          avatar: selectedAvatar,
          imageUrl,
          imagePrompt,
        },
      ];
    } catch (err) {
      console.error('[Lab] YAML image generation fail:', err);
      messages = [...messages, { role: 'error', text: `YAML画像化に失敗しました: ${err instanceof Error ? err.message : String(err)}`, time: getTime() }];
    } finally {
      isThinking = false;
      setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
    }
  }

  async function sendYonkomaPrompt() {
    if (yonkomaGenerating || yamlConverting || isThinking) return;
    yonkomaGenerating = true;
    const text = 'この画像のキャラを使って4コマ漫画のYAMLを作って。\nギャグ寄り、キャラの個性を活かして。';
    const userMessage: ChatMessage = { role: 'user', text, time: getTime() };
    inputText = '';
    messages = [...messages, userMessage];
    const routerResult = {
      intent: 'manga' as const,
      action: 'create_manga_yaml',
      subtype: 'yaml_create',
      confidence: 1,
      reason: '4コマ生成ボタンからgenerateStoryYaml(short_story)へ直接転送',
      source: 'rules' as const,
      matched_rule: 'yonkoma_generate_button',
      generate_image: false,
      generate_yaml: true,
      generate_manga: false,
      negative_keywords: [],
    };
    try {
      await routeToStoryYaml(userMessage, routerResult);
    } finally {
      yonkomaGenerating = false;
    }
  }

  function appendViewerActionMessage(text: string): ChatMessage {
    const message: ChatMessage = { role: 'user', text, time: getTime() };
    messages = [...messages, message];
    return message;
  }

  async function mangaFromStoryViewer(rawYaml: string): Promise<void> {
    const story = parseStoryYaml(rawYaml);
    const message = appendViewerActionMessage(`「${story?.title ?? 'Story YAML'}」を漫画化`);
    await convertToManga(message, rawYaml);
  }

  async function createStorySequel(rawYaml: string): Promise<void> {
    if (isThinking || yamlConverting) return;
    const story = parseStoryYaml(rawYaml);
    const storyType = story?.storyType || 'comic_story';
    const message = appendViewerActionMessage(
      `${storyType}形式で「${story?.title ?? 'この物語'}」の続編YAMLを作成`,
    );
    const routerResult: IntentResult = {
      intent: 'manga',
      action: 'create_story_sequel',
      subtype: 'yaml_create',
      confidence: 1,
      reason: 'StoryViewerの続編作成アクション',
      source: 'rules',
      matched_rule: 'story_viewer_sequel',
      matched_keywords: ['続編作成'],
      negative_keywords: [],
      generate_image: false,
      generate_yaml: true,
      generate_manga: false,
    };
    await routeToStoryYaml(message, routerResult, rawYaml);
  }

  function showStoryContinuity(rawYaml: string): void {
    const continuity = extractStoryContinuity(rawYaml) ?? storyContinuityMemory;
    messages = [...messages, {
      role: 'ai',
      text: continuity
        ? formatStoryContinuityLog(continuity)
        : '[CONTINUITY_MEMORY]\n保存された継続メモリはありません。',
      time: getTime(),
    }];
    if (continuity) saveStoryContinuityMemory(continuity);
  }

  async function createContinuationManga(rawYaml: string): Promise<void> {
    if (isThinking || yamlConverting || mangaConverting) return;
    const story = parseStoryYaml(rawYaml);
    const message = appendViewerActionMessage(
      `「${story?.title ?? 'この物語'}」の次ページYAMLを作成して漫画化`,
    );
    const routerResult: IntentResult = {
      intent: 'manga',
      action: 'create_story_sequel',
      subtype: 'yaml_create',
      confidence: 1,
      reason: 'StoryViewerの継続YAML作成後に漫画化',
      source: 'rules',
      matched_rule: 'story_viewer_continuation_manga',
      matched_keywords: ['この続きで漫画化'],
      negative_keywords: [],
      generate_image: false,
      generate_yaml: true,
      generate_manga: false,
    };
    const nextYaml = await routeToStoryYaml(message, routerResult, rawYaml);
    if (nextYaml) await convertToManga(message, nextYaml);
  }

  async function createMaterialFromStoryViewer(
    rawYaml: string,
    kind: 'character_sheet' | 'world_setting',
  ): Promise<void> {
    if (isThinking) return;
    const story = parseStoryYaml(rawYaml);
    const isCharacterSheet = kind === 'character_sheet';
    const label = isCharacterSheet ? 'キャラ資料化' : '設定資料化';
    appendViewerActionMessage(`「${story?.title ?? 'Story YAML'}」を${label}`);
    const routerResult: IntentResult = {
      intent: 'image',
      action: isCharacterSheet ? 'create_character_materials' : 'create_world_setting_materials',
      subtype: isCharacterSheet ? 'character_sheet' : 'setting_sheet',
      confidence: 1,
      reason: `StoryViewerの${label}アクション`,
      source: 'rules',
      matched_rule: isCharacterSheet ? 'story_viewer_character_sheet' : 'story_viewer_world_setting',
      matched_keywords: [label],
      negative_keywords: [],
      generate_image: true,
      generate_yaml: false,
      generate_manga: false,
    };
    routerStateStore.set(routerResult);
    labGenerationMode = generationModeFromIntent(routerResult);
    lastRouterAction = routerResult.action ?? kind;
    lastRouterActionAt = new Date().toLocaleString('ja-JP');
    isThinking = true;
    await generateImageFromLabChat([
      isCharacterSheet
        ? '以下のStory YAMLに登場するキャラクターの設定資料・キャラクターシートを作成してください。'
        : '以下のStory YAMLの世界観、場所、小物、建築、色彩設計をまとめた設定資料を作成してください。',
      rawYaml,
    ].join('\n\n'), routerResult);
  }

  function isCharacterRefStatusRequest(text: string): boolean {
    const mentionsCharacterRef = /character\s*ref|キャラクター\s*ref|キャラ\s*ref/i.test(text);
    const asksForStatus = /確認|一覧|状態|登録|存在|ある|います|見せて|教えて/i.test(text);
    return mentionsCharacterRef && asksForStatus;
  }

  function loadedCharacterRefNames(): string[] {
    return referenceImages.map((ref, index) =>
      ref.registryName?.trim()
      || ref.note?.trim()
      || ref.name?.trim()
      || `REF-${index + 1}`,
    );
  }

  function buildCharacterRefStatus(text: string): string {
    const names = loadedCharacterRefNames();
    const lines = [
      '[CHARACTER_REF_STATUS]',
      '',
      `Count: ${names.length}`,
      '',
    ];

    names.forEach((name, index) => {
      lines.push(`REF[${index}]`);
      lines.push(`Name: ${name}`);
      lines.push('');
    });
    lines.push('END');

    const requestedNames = Array.from(new Set(
      Array.from(text.matchAll(/\bN-\d{2}\b/gi)).map((match) => match[0].toUpperCase()),
    ));
    const loadedNames = new Set(names.map((name) => name.toUpperCase()));
    for (const requestedName of requestedNames) {
      if (!loadedNames.has(requestedName)) {
        lines.push('');
        lines.push(`${requestedName}は登録されていません`);
      }
    }

    return lines.join('\n');
  }

  function stripTrailingEmotionCoda(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return text;

    const tagMatch = trimmed.match(/(\s*(?:\[[^\]\r\n]+\]\s*)+)$/);
    const trailingTags = tagMatch?.[1] ?? '';
    const body = trailingTags ? trimmed.slice(0, -trailingTags.length).trimEnd() : trimmed;
    const segments = body.match(/[^。！？\r\n]+[。！？]+|[^\r\n]+$/g) ?? [body];
    const codaPattern = /(?:覚えてるのか、?すごいな|夏の夜|見捨てないでほしい|一緒に[^。！？\r\n]{0,30}考えてほしい|私(?:のこと)?(?:も)?[^。！？\r\n]{0,30}(?:見てほしい|頼って|驚いてほしい|ずっと一緒にいてほしい|かまって)|もっと[^。！？\r\n]{0,30}(?:話しかけて|一緒にいて))/;
    let removed = false;

    while (segments.length > 1 && codaPattern.test(segments[segments.length - 1])) {
      segments.pop();
      removed = true;
    }

    if (!removed) return trimmed;
    const sanitized = segments.join('').trimEnd();
    console.log('[EMOTION_CODA_REMOVED]', {
      before: trimmed,
      after: `${sanitized}${trailingTags}`,
    });
    return `${sanitized}${trailingTags}`;
  }

  function stripLeakedReasoning(text: string): string {
    return text
      .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
      .split(/\r?\n/)
      .filter((line) => !/^\s*(?:[*#>`~-]+\s*)?(?:Final Answer Formulation\b.*|Let's go with\b.*|Apply to this persona\b.*|Reasoning\b.*|Analysis\b.*)\s*$/i.test(line))
      .join('\n')
      .replace(/^\s*(?:Final Answer Formulation|Let's go with|Apply to this persona)\b[^\r\n]*\r?\n?/i, '')
      .trim();
  }

  function characterReferenceIds(text: string): string[] {
    return text.match(/\bN[-‐‑‒–—−]\d{2}\b/gi) ?? [];
  }

  function logExecutionPath(
    intent: {
      intent: string;
      action?: string;
    },
    executedProcess: string,
  ): void {
    const action = intent.action?.trim() || 'default';
    console.log('[EXECUTION_PATH]', `${intent.intent}/${action}\n→ ${executedProcess}`);
  }

  function generationModeFromIntent(intent: {
    intent: string;
    action?: string;
    subtype?: string;
    generate_image?: boolean;
    generate_yaml?: boolean;
    generate_manga?: boolean;
    negative_keywords?: string[];
  }): LabGenerationMode {
    const generationModeBefore = labGenerationMode;
    const logGenerationModeDecision = (
      generationModeAfter: LabGenerationMode,
      reason: string,
    ): LabGenerationMode => {
      if (intent.generate_manga === true && generationModeAfter === 'chat') {
        console.log('[ACTION]', intent.action ?? 'default');
        console.log('[INTENT]', intent.intent);
        console.log('[SUBTYPE]', intent.subtype ?? 'none');
        console.log('[GENERATE_MANGA]', intent.generate_manga);
        console.log('[GENERATION_MODE_BEFORE]', generationModeBefore);
        console.log('[GENERATION_MODE_AFTER]', generationModeAfter);
        console.log('[CHAT_FALLBACK_REASON]', reason);
      }
      return generationModeAfter;
    };

    if (
      (intent.negative_keywords?.length ?? 0) > 0
      && intent.generate_image === false
      && intent.generate_yaml === false
      && intent.generate_manga === false
    ) {
      return logGenerationModeDecision(
        'chat',
        "negative_keywords.length > 0 && generate_image === false && generate_yaml === false && generate_manga === false",
      );
    }
    const candidates = [intent.subtype, intent.action, intent.intent]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLowerCase());

    if (candidates.some((value) => [
      'image_edit',
      'image_variation',
      'character_refine',
    ].includes(value))) {
      return logGenerationModeDecision('image-to-image', 'matched image-to-image candidate');
    }
    if (candidates.some((value) => [
      'manga_page',
      'generate_manga_page',
      'character_sheet',
      'setting_sheet',
      'create_character_materials',
      'create_world_setting_materials',
      'illustration',
    ].includes(value))) {
      return logGenerationModeDecision('text-to-image', 'matched text-to-image candidate');
    }
    if (candidates.some((value) => [
      'manga_yaml',
      'create_manga_yaml',
      'yaml',
    ].includes(value))) {
      return logGenerationModeDecision('yaml', 'matched yaml candidate');
    }
    const matchedChatCandidate = candidates.find((value) => [
      'analysis',
      'analyze',
      'character_bible',
      'chat',
      'setting_review',
      'story_review',
    ].includes(value));
    if (matchedChatCandidate) {
      return logGenerationModeDecision(
        'chat',
        `explicit chat branch: candidates includes "${matchedChatCandidate}"`,
      );
    }
    return logGenerationModeDecision(
      'chat',
      `default chat fallback: no generation-mode candidate matched; candidates=${JSON.stringify(candidates)}; generate_manga is not evaluated by this router`,
    );
  }

  async function sendMessage() {
    const text = inputText.trim();
    if (!text || isThinking) return;
    inputText = '';
    const userMessage: ChatMessage = { role: 'user', text, time: getTime() };
    messages = [...messages, userMessage];
    if (isCharacterRefStatusRequest(text)) {
      const names = loadedCharacterRefNames();
      if (debugOpen) {
        console.log('[CHARACTER_REF_COUNT]', names.length);
        console.log('[CHARACTER_REF_NAMES]', names);
      }
      messages = [...messages, {
        role: 'ai',
        text: buildCharacterRefStatus(text),
        time: getTime(),
        avatar: selectedAvatar,
      }];
      lastRouterAction = 'character_ref_status';
      lastRouterActionAt = new Date().toLocaleString('ja-JP');
      setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
      return;
    }
    const mangaTriggerMatched = isMangaConversionRequest(text);
    const mangaNegativeKeywords = findGenerationNegativeKeywords(text);
    const currentStoryRef = currentStoryReference();
    const currentCharacterRef = currentCharacterReference();
    console.log('[MANGA_TRIGGER]', mangaTriggerMatched);
    console.log('[STORY_REF]', currentStoryRef?.title);
    console.log('[CHAR_REF]', currentCharacterRef?.id);
    if (isStoryContinuationRequest(text) && currentStoryRef) {
      const routerResult: IntentResult = {
        intent: 'manga',
        action: 'create_story_sequel',
        subtype: 'yaml_create',
        confidence: 1,
        reason: '継続指示を検出し、最新のStory Continuity Memoryを適用',
        source: 'rules',
        matched_rule: 'story_continuation_request',
        matched_keywords: [text],
        negative_keywords: [],
        generate_image: false,
        generate_yaml: true,
        generate_manga: false,
      };
      await routeToStoryYaml(userMessage, routerResult, currentStoryRef.yaml);
      return;
    }
    if (mangaTriggerMatched && mangaNegativeKeywords.length === 0) {
      const route = 'manga';
      const routerResult: IntentResult = {
        intent: 'manga',
        action: 'generate_manga_page',
        subtype: 'manga_page',
        confidence: 1,
        reason: '漫画化命令をローカル検出し、通常チャット前に直接転送',
        source: 'rules',
        matched_rule: 'direct_manga_conversion_request',
        matched_keywords: [text.match(/(?:漫画|マンガ)化/)?.[0] ?? '漫画化'],
        negative_keywords: [],
        generate_image: true,
        generate_yaml: false,
        generate_manga: true,
      };
      console.log('[ROUTE]', route);
      routerStateStore.set(routerResult);
      labGenerationMode = generationModeFromIntent(routerResult);
      lastRouterAction = 'generate_manga_page';
      lastRouterActionAt = new Date().toLocaleString('ja-JP');
      console.log('[FINAL_ROUTER_RESULT]', routerResult);
      logExecutionPath(routerResult, 'manga');
      await convertToManga(userMessage, currentStoryRef?.yaml ?? '');
      return;
    }
    const directYamlNegativeKeywords = findGenerationNegativeKeywords(text);
    if (isYamlCreationRequest(text) && directYamlNegativeKeywords.length === 0) {
      const routerResult: IntentResult = {
        intent: 'manga',
        action: 'create_manga_yaml',
        subtype: 'yaml_create',
        confidence: 1,
        reason: '4コマ・漫画YAML作成要求をローカル検出し、通常チャット前に直接転送',
        source: 'rules',
        matched_rule: 'direct_yonkoma_yaml_request',
        matched_keywords: ['YAML', '作成'],
        negative_keywords: [],
        generate_image: false,
        generate_yaml: true,
        generate_manga: false,
      };
      await routeToStoryYaml(userMessage, routerResult);
      return;
    }
    labGenerationMode = 'chat';
    const intent = await classifyIntent(text);
    labGenerationMode = generationModeFromIntent(intent);
    console.log('[INTENT]', intent);
    console.log('[GENERATION_MODE]', labGenerationMode);
    lastRouterAction = intent.action || (intent.intent === 'image' ? 'image_generation' : `${intent.intent}_route`);
    lastRouterActionAt = new Date().toLocaleString('ja-JP');
    const executionTrace: Array<{
      if_statement: string;
      result: boolean;
      passed: boolean;
      details?: Record<string, unknown>;
    }> = [];
    const traceIf = (
      ifStatement: string,
      result: boolean,
      details?: Record<string, unknown>,
    ): boolean => {
      executionTrace.push({
        if_statement: ifStatement,
        result,
        passed: result,
        ...(details ? { details } : {}),
      });
      return result;
    };
    const routedByGemini = intent.source === 'gemini';
    if (traceIf("intent.source === 'gemini'", routedByGemini, { source: intent.source })) {
      console.log('[GEMINI_ROUTER_EXECUTION_ENABLED]', intent);
    }
    const generationNegativeKeywords = findGenerationNegativeKeywords(text);
    const hasGenerationNegation = generationNegativeKeywords.length > 0;
    if (traceIf(
      'generationNegativeKeywords.length > 0',
      hasGenerationNegation,
      { generationNegativeKeywords },
    )) {
      const blockedResult = {
        ...intent,
        generate_image: false,
        generate_yaml: false,
        generate_manga: false,
        negative_keywords: Array.from(new Set([
          ...(intent.negative_keywords ?? []),
          ...generationNegativeKeywords,
        ])),
      };
      routerStateStore.set(blockedResult);
      labGenerationMode = generationModeFromIntent(blockedResult);
      console.log('[FINAL_ROUTER_RESULT]', blockedResult);
      console.log('[GENERATION_MODE]', labGenerationMode);
      console.log('[INTENT_TRACE]', {
        matched_rule: blockedResult.matched_rule ?? blockedResult.action ?? 'generation_negation_guard',
        matched_keywords: blockedResult.matched_keywords ?? [],
        negative_keywords: blockedResult.negative_keywords,
        score_breakdown: {
          ...(blockedResult.score_breakdown ?? {}),
          generation_negation_guard: true,
          generate_image: false,
          generate_manga: false,
          generate_yaml: false,
        },
      });
    }
    const editorialMeetingRequested = isEditorialMeetingRequest(text);
    if (traceIf(
      'isEditorialMeetingRequest(text)',
      editorialMeetingRequested,
    )) {
      const routerResult = {
        ...intent,
        intent: 'chat' as const,
        action: 'editorial_meeting',
        subtype: 'editorial_meeting',
        reason: intent.reason || '先頭の編集会議コマンドを検出',
      };
      routerStateStore.set(routerResult);
      labGenerationMode = generationModeFromIntent(routerResult);
      console.log('[FINAL_ROUTER_RESULT]', routerResult);
      console.log('[GENERATION_MODE]', labGenerationMode);
      logExecutionPath(routerResult, 'editorial meeting');
      await runEditorialMeeting(text);
      return;
    }
    const yamlImageGenerationRequested = isYamlImageGenerationRequest(text);
    const classifiedMangaRoute = intent.action === 'generate_manga_page'
      || intent.subtype === 'manga_page'
      || intent.intent === 'manga';
    const mangaPageRouteSelected = !hasGenerationNegation
      && (classifiedMangaRoute || yamlImageGenerationRequested);
    if (traceIf(
      "generationNegativeKeywords.length === 0 && (intent.action === 'generate_manga_page' || intent.subtype === 'manga_page' || intent.intent === 'manga' || isYamlImageGenerationRequest(text))",
      mangaPageRouteSelected,
      {
        noGenerationNegation: !hasGenerationNegation,
        actionIsGenerateMangaPage: intent.action === 'generate_manga_page',
        subtypeIsMangaPage: intent.subtype === 'manga_page',
        intentIsManga: intent.intent === 'manga',
        classifiedMangaRoute,
        yamlImageGenerationRequested,
      },
    )) {
      if (!classifiedMangaRoute) {
        isThinking = true;
        const routerResult = {
          ...intent,
          intent: 'image' as const,
          action: 'generate_image_from_yaml',
          subtype: /(?:漫画|4コマ|マンガ)/.test(text) ? 'manga_page' : 'illustration',
          confidence: 1,
          reason: 'yaml_input_image_generation > yaml_creation',
          source: intent.source ?? 'rules',
        };
        routerStateStore.set(routerResult);
        labGenerationMode = generationModeFromIntent(routerResult);
        console.log('[FINAL_ROUTER_RESULT]', routerResult);
        console.log('[GENERATION_MODE]', labGenerationMode);
        console.log('[ROUTER_PRIORITY]', 'yaml_input_image_generation > yaml_creation');
        lastRouterAction = 'image_route';
        lastRouterActionAt = new Date().toLocaleString('ja-JP');
        logExecutionPath(routerResult, 'manga page generator');
        await generateImageFromLatestYaml(text, routerResult);
        return;
      }
      const routerResult = {
        ...intent,
        intent: 'manga' as const,
        action: 'generate_manga_page',
        subtype: 'manga_page',
        confidence: 1,
        reason: 'manga_conversion > yaml_image_generation > normal_chat',
        source: intent.source ?? 'rules',
      };
      routerStateStore.set(routerResult);
      labGenerationMode = generationModeFromIntent(routerResult);
      console.log('[FINAL_ROUTER_RESULT]', routerResult);
      console.log('[GENERATION_MODE]', labGenerationMode);
      console.log('[ROUTE]', 'manga');
      console.log('[MANGA_TRIGGER]', true);
      console.log('[STORY_REF]', currentStoryReference()?.title);
      console.log('[CHAR_REF]', currentCharacterReference()?.id);
      console.log('[ROUTER_PRIORITY]', 'manga_conversion > yaml_image_generation > yaml_creation');
      lastRouterAction = 'generate_manga_page';
      lastRouterActionAt = new Date().toLocaleString('ja-JP');
      logExecutionPath(routerResult, 'manga');
      await convertToManga(userMessage, currentStoryReference()?.yaml ?? '');
      return;
    }
    const yamlCreationRequested = isYamlCreationRequest(text);
    const mangaYamlRouteSelected = !hasGenerationNegation
      && (intent.action === 'create_manga_yaml' || yamlCreationRequested);
    if (traceIf(
      "generationNegativeKeywords.length === 0 && (intent.action === 'create_manga_yaml' || isYamlCreationRequest(text))",
      mangaYamlRouteSelected,
      {
        noGenerationNegation: !hasGenerationNegation,
        actionIsCreateMangaYaml: intent.action === 'create_manga_yaml',
        yamlCreationRequested,
      },
    )) {
      const routerResult = {
        ...intent,
        intent: 'manga' as const,
        action: 'create_manga_yaml',
        subtype: 'yaml_create',
        confidence: 1,
        reason: 'yaml_creation_request > normal_chat',
        source: intent.source ?? 'rules',
      };
      await routeToStoryYaml(userMessage, routerResult);
      return;
    }
    const imageIntentRouteSelected = !hasGenerationNegation && intent.intent === 'image';
    if (traceIf(
      "generationNegativeKeywords.length === 0 && intent.intent === 'image'",
      imageIntentRouteSelected,
      {
        noGenerationNegation: !hasGenerationNegation,
        intentIsImage: intent.intent === 'image',
      },
    )) {
      const routerRequestedImage = intent.generate_image === true
        || intent.action === 'create_character_materials';
      const explicitImageGenerationCue = hasExplicitImageGenerationCue(text);
      const imageIntentIgnored = !routerRequestedImage && !explicitImageGenerationCue;
      if (traceIf(
        '!routerRequestedImage && !hasExplicitImageGenerationCue(text)',
        imageIntentIgnored,
        {
          routerRequestedImage,
          generateImage: intent.generate_image === true,
          actionIsCreateCharacterMaterials: intent.action === 'create_character_materials',
          explicitImageGenerationCue,
        },
      )) {
        console.log('[Lab] image intent ignored: no explicit image generation cue', { text, intent });
        lastRouterAction = 'chat_route';
      } else {
        isThinking = true;
        logExecutionPath(intent, 'image generator');
        await generateImageFromLabChat(text, intent);
        return;
      }
    }
    if (intent.generate_manga === true) {
      console.log('[EXECUTION_TRACE]', {
        router_result: intent,
        generation_mode: labGenerationMode,
        selected_action: intent.action ?? 'default',
        final_handler: 'chat_response',
        chat_response_selected_by: imageIntentRouteSelected
          ? 'image intent was ignored because neither routerRequestedImage nor an explicit image-generation cue was present'
          : 'no earlier routing branch matched; generate_manga is not used as a dispatch condition',
        evaluated_if_statements: executionTrace,
        passed_if_statements: executionTrace
          .filter((entry) => entry.passed)
          .map((entry) => entry.if_statement),
      });
    }
    logExecutionPath(intent, 'chat response');
    console.log(
      "ROUTE",
      requestedChatSpeaker(text) ? "chat" : toggles.internalDiscussion ? "character_discussion" : "chat",
    );
    const lastTalkAt = localStorage.getItem(LS_LAST_TALK_AT);
    if (lastTalkAt) {
      const elapsedMin = (Date.now() - new Date(lastTalkAt).getTime()) / 60_000;
      if (elapsedMin >= 30) {
        emotion.jealousy = clamp(emotion.jealousy + 20);
        emotion.trust    = clamp(emotion.trust    -  3);
      }
      if (elapsedMin >= 60)   bond = clamp(bond - 2);
      if (elapsedMin >= 1440) bond = clamp(bond - 3);
    }
    addMemory('user', text);
    const turnStartTrust = emotion.trust;
    const turnStartAffection = emotion.affection;
    updateEmotion(text);
    isThinking = true;

    console.log('[Lab] provider:', $sessionStore.provider);
    console.log('[Lab] model   :', $sessionStore.model || '(default)');
    const visionReferenceImages = await buildVisionReferenceImages(text);

    console.log('[Lab] images  :', visionReferenceImages.length, visionReferenceImages.length > 0 ? visionReferenceImages.map(r => r.name).join(', ') : '(none)');
    console.log('[Lab] request start');

    const _reqStart = Date.now();
    let aiText = '';
    let responseInternalDiscussion: NonNullable<ChatMessage['internalDiscussion']> = [];
    const internalDiscussionRequested = toggles.internalDiscussion;
    const requestedSpeaker = requestedChatSpeaker(text);
    const activeSpeakerAtRequest = activeUnitSpeaker();
    let resolvedSpeaker: PersonaSpeaker | null = requestedSpeaker ?? activeSpeakerAtRequest;
    let displaySpeaker: PersonaSpeaker | null = resolvedSpeaker;
    let personaSource = requestedSpeaker ? 'user_request' : 'active_unit';
    let responseMemoryDebug: {
      retrievedMemories?: Array<Omit<MemoryViewerItem, 'createdAt'> & { timestamp?: string; createdAt?: string }>;
    } | undefined;
    let characterChatReply: { speaker: PersonaSpeaker; text: string } | null = null;
    try {
      let res: Response | null = null;
      if (requestedSpeaker) {
        lastRouterAction = 'character_chat';
        lastRouterActionAt = new Date().toLocaleString('ja-JP');
        const characterResponse = await generateCharacterChatTurn({
          speaker: requestedSpeaker,
          userText: text,
          referenceImages: visionReferenceImages,
        });
        resolvedSpeaker = characterResponse.speaker;
        displaySpeaker = characterResponse.speaker;
        personaSource = characterResponse.speaker === requestedSpeaker
          ? 'requested_speaker'
          : 'response_speaker';
        characterChatReply = { speaker: characterResponse.speaker, text: characterResponse.text };
        if (toggles.persistRequestedSpeaker) {
          activatePersonaSpeaker(characterResponse.speaker);
          personaSource = 'requested_speaker_persisted';
        }
        responseMemoryDebug = characterResponse.memory;
        aiText = characterResponse.text;
        lastResponseMs = Date.now() - _reqStart;
        lastSentImages = visionReferenceImages.length;
        lastUsedProvider = characterResponse.provider ?? $sessionStore.provider;
        lastUsedModel = characterResponse.actualModel ?? $sessionStore.model ?? null;
        console.log('[Lab] character chat success — speaker:', requestedSpeaker, 'provider:', lastUsedProvider, 'model:', lastUsedModel);
      } else if ($sessionStore.provider === 'onair') {
        res = await fetch('/api/onair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: wantsShortReply(text) ? `${text}\n\n短く、要点だけで返答してください。` : text }),
        });
      } else {
        let _sysPrompt = buildLabSystemPrompt(text);
        if (visionReferenceImages.length > 0) {
          const _noteList = visionReferenceImages
            .map((r, i) => `画像${i + 1}「${r.note || r.name}」`)
            .join('、');
          _sysPrompt += `\n\n【参照画像】${_noteList}が添付されています。キャラクターとして自然に画像の内容を踏まえて返答してください。`;
        }
        lastSystemPrompt = _sysPrompt;
        console.log('[Lab] system prompt:', _sysPrompt);
        const _fd = new FormData();
        const route = internalDiscussionRequested ? 'character_discussion' : 'chat';
        console.log("ROUTE", route);
        _fd.append('route', route);
        _fd.append('provider', $sessionStore.provider);
        if ($sessionStore.model) _fd.append('model', $sessionStore.model);
        _fd.append('systemPrompt', _sysPrompt);
        _fd.append('userMessage', text);
        if (internalDiscussionRequested) {
          _fd.append('internalDiscussion', 'true');
        }
        _fd.append('characterBible', JSON.stringify(characterBible ?? null));
        _fd.append('conversationHistory', JSON.stringify(
          messages
            .filter((message) => message.role === 'user' || message.role === 'ai' || message.role === 'assistant')
            .slice(-30)
            .map((message) => ({ role: message.role, text: message.text })),
        ));
        for (let _i = 0; _i < visionReferenceImages.length; _i++) {
          const _ref = visionReferenceImages[_i];
          if (_ref.dataUrl?.startsWith('data:')) {
            _fd.append(`image_${_i}`, dataUrlToBlob(_ref.dataUrl), `ref_${_i}.jpg`);
          } else if (_ref.sourceUrl) {
            _fd.append(`image_url_${_i}`, _ref.sourceUrl);
          }
          if (_ref.note) _fd.append(`note_${_i}`, _ref.note);
        }
        res = await fetch('/api/lab-chat', { method: 'POST', body: _fd });
      }
      if (!characterChatReply && (!res || !res.ok)) {
        let userMsg = 'APIエラーが発生しました。しばらく後に再試行してください。';
        if (res?.status === 429) {
          userMsg = '無料枠の上限に達しました。しばらく待ってから再試行してください。';
        } else {
          try {
            const errData = await res?.json();
            if (errData?.message) userMsg = errData.message;
          } catch { /* ignore */ }
        }
        console.error('[Lab] response fail: HTTP', res?.status ?? 'no-response', userMsg);
        messages = [...messages, { role: 'error', text: userMsg, time: getTime() }];
        isThinking = false;
        setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
        return;
      }
      if (!characterChatReply) {
        if (!res) throw new Error('Chat response was not initialized');
        const data = await res.json();
        if (data.failover) {
          failoverNotice = 'Gemini 失敗 → OpenAI へ自動切替しました';
          setTimeout(() => { failoverNotice = null; }, 5000);
        }
        responseMemoryDebug = data.memory;
        const responseSpeaker = personaSpeaker(data.speaker);
        if (responseSpeaker) {
          resolvedSpeaker = responseSpeaker;
          displaySpeaker = responseSpeaker;
          personaSource = 'response_speaker';
        }
        const normalizeDiscussion = (value: unknown): NonNullable<ChatMessage['internalDiscussion']> =>
          Array.isArray(value)
          ? value.flatMap((entry: unknown) => {
              if (!entry || typeof entry !== 'object') return [];
              const candidate = entry as { speaker?: unknown; text?: unknown };
              return (
                (
                  candidate.speaker === 'ミュリィ'
                  || candidate.speaker === 'リセア'
                  || candidate.speaker === 'シエル'
                  || candidate.speaker === 'メノア'
                  || candidate.speaker === 'ピオナ'
                  || candidate.speaker === '司会'
                )
                && typeof candidate.text === 'string'
                && candidate.text.trim()
              )
                ? [{ speaker: candidate.speaker, text: candidate.text.trim() }]
                : [];
            })
          : [];
        responseInternalDiscussion = internalDiscussionRequested
          ? normalizeDiscussion(data.discussion ?? data.internalDiscussion)
          : [];
        const rawResponseText = String($sessionStore.provider === 'onair' ? data.reply ?? '' : data.answer ?? data.text ?? '');
        const responseText = stripLeakedReasoning(rawResponseText);
        console.log('[MESSAGE_LENGTH_STAGE]', 'receive');
        console.log('[MESSAGE_LENGTH]', rawResponseText.length, responseText.length);
        console.log('[MESSAGE_SYMBOLS]', {
          raw: characterReferenceIds(rawResponseText),
          displayed: characterReferenceIds(responseText),
        });
        const trimmedResponseText = responseText.trim();
        if (
          internalDiscussionRequested
          &&
          responseInternalDiscussion.length === 0
          && trimmedResponseText.startsWith('{')
          && trimmedResponseText.endsWith('}')
        ) {
          try {
            const parsedStructured = JSON.parse(trimmedResponseText) as {
              discussion?: unknown;
              internalDiscussion?: unknown;
              answer?: unknown;
            };
            responseInternalDiscussion = normalizeDiscussion(
              parsedStructured.discussion ?? parsedStructured.internalDiscussion,
            );
            aiText = typeof parsedStructured.answer === 'string'
              ? parsedStructured.answer.trim()
              : '';
          } catch {
            console.error('[Lab] internalDiscussion JSON parse failed', {
              rawJson: responseText,
            });
            aiText = responseText;
          }
        } else {
          aiText = responseText;
        }
        lastResponseMs   = Date.now() - _reqStart;
        lastSentImages   = visionReferenceImages.length;
        lastUsedProvider = data.provider  ?? $sessionStore.provider;
        lastUsedModel    = data.actualModel ?? $sessionStore.model ?? null;
        console.log('[Lab] response success — provider:', lastUsedProvider, 'model:', lastUsedModel, 'images_sent:', lastSentImages);
      }
      console.log('[PERSONA_ROUTE]', {
        requestedSpeaker,
        activeUnit: activeSpeakerAtRequest ?? charName,
        resolvedSpeaker,
        displaySpeaker,
        personaSource,
      });
    } catch (err) {
      console.error('[Lab] response fail:', err);
      messages = [...messages, { role: 'error', text: '通信エラーが発生しました。接続を確認してください。', time: getTime() }];
      isThinking = false;
      setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
      return;
    }

    if (!aiText?.trim()) {
      messages = [...messages, { role: 'error', text: 'AIからの応答が空でした。もう一度お試しください。', time: getTime() }];
      isThinking = false;
      setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
      return;
    }

    const rawDisplayText = aiText;
    const emotionAnalysisText = rawDisplayText;
    aiText = stripTrailingEmotionCoda(stripLeakedReasoning(rawDisplayText));
    console.log('[MESSAGE_LENGTH_STAGE]', 'before_display');
    console.log('[MESSAGE_LENGTH]', rawDisplayText.length, aiText.length);
    if (characterChatReply) {
      characterChatReply = { ...characterChatReply, text: aiText };
    }
    consumeAndroidBattery(1, 'chat_reply');
    const batteryWarning = getAndroidBatteryWarning();
    aiText = `${aiText}${batteryWarning}`;
    if (characterChatReply) {
      messages = [...messages, {
        role: 'ai',
        text: `${characterChatReply.text}${batteryWarning}`,
        time: getTime(),
        avatar: editorialMeetingAvatar(characterChatReply.speaker),
        speakerName: characterChatReply.speaker,
      }];
    } else {
      messages = [...messages, {
        role: 'ai',
        text: aiText,
        time: getTime(),
        avatar: displaySpeaker ? editorialMeetingAvatar(displaySpeaker) : selectedAvatar,
        ...(displaySpeaker ? { speakerName: displaySpeaker } : {}),
        internalDiscussion: responseInternalDiscussion,
        imagePrompt: undefined,
      }];
    }
    addMemory('assistant', aiText);
    const updatesActiveUnitEmotion = !displaySpeaker
      || displaySpeaker === activeUnitSpeaker()
      || toggles.persistRequestedSpeaker;
    if (updatesActiveUnitEmotion) {
      updateEmotionFromReply(emotionAnalysisText);
    }
    const aiEmotion = analyzeEmotionTS(emotionAnalysisText).emotion;
    const retrievedMemories = (responseMemoryDebug?.retrievedMemories ?? []).map((memory) => ({
      id: memory.id,
      content: memory.content,
      importance: memory.importance,
      tags: memory.tags,
      createdAt: memory.createdAt ?? memory.timestamp ?? '',
    }));
    cognitiveMonitor = {
      retrievedMemories,
      emotionLabel: aiEmotion,
      trustDelta: emotion.trust - turnStartTrust,
      affectionDelta: emotion.affection - turnStartAffection,
      reflectionNote: buildReflectionNote({
        memoryCount: retrievedMemories.length,
        emotionLabel: aiEmotion,
        trustDelta: emotion.trust - turnStartTrust,
        affectionDelta: emotion.affection - turnStartAffection,
      }),
    };
    void saveReflectionDiary({
      emotionLabel: cognitiveMonitor.emotionLabel,
      trustDelta: cognitiveMonitor.trustDelta,
      affectionDelta: cognitiveMonitor.affectionDelta,
      note: cognitiveMonitor.reflectionNote,
    });
    // Fire-and-forget: never awaited, never breaks chat
    if (emotionFeedbackEnabled) applyEmotionFeedbackAsync(aiText);
    if (reconciliationPending) {
      addSpecialMemory('reconciled', `仲直りした（「${text.slice(0, 15)}」の後）`);
    }
    reconciliationPending = false;
    // 会話記憶を保存（次回起動時の初回メッセージに使用）
    localStorage.setItem(LS_LAST_TOPIC,      text);
    localStorage.setItem(LS_LAST_TALK_AT,    new Date().toISOString());
    localStorage.setItem(LS_LAST_GOAL,       text);
    localStorage.setItem(LS_LAST_MOOD,       detectMood(aiText));
    localStorage.setItem(LS_RECENT_PROGRESS, aiText.length > 50 ? aiText.slice(0, 50) + '…' : aiText);
    bond = clamp(bond + 1);
    localStorage.setItem(LS_BOND, String(bond));
    saveEmotion();
    recordTalk();
    recordVisit(new Date());
    saveChatHistory();
    exchangeCount++;
    if (exchangeCount % MEMORY_UPDATE_EVERY === 0) updateLongMemory();
    isThinking = false;
    // AI 応答テキストから感情を検出 → PNG-TUBER に反映（pin が空のときのみ上書き）
    if (!emotionPin) currentEmotion = EMOTION_IMAGE[analyzeEmotionTS(aiText).emotion] ?? 'neutral';
    setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);

    // 口パク開始（音声エンジン種別に関わらず即時 ON）
    isSpeaking = true;

    if (voiceEngine !== 'none') {
      try {
        const engine = createVoiceEngine({
          name: displaySpeaker ?? charName,
          voiceEngine,
          voice,
          voiceId: voiceId || undefined,
          speakerId: displaySpeaker
            ? (CHARACTER_PROFILES[AVATARS.find((avatar) => avatar.name === displaySpeaker)?.presetId ?? '']?.voicevoxSpeakerId ?? speakerId)
            : speakerId,
        });
        await engine.speak(aiText, {
          onStart: () => { isSpeaking = true; },
          onEnd:   () => { isSpeaking = false; },
        });
      } catch (e) {
        console.error('❌ Lab音声失敗', e);
      } finally {
        isSpeaking = false; // onEnd 未発火（サイレント失敗）時も確実にリセット
      }
    } else {
      // voiceEngine=none: テキスト長に応じた簡易口パク（1文字≒50ms、最短1.5秒・最長8秒）
      const ms = Math.min(Math.max(aiText.length * 50, 1500), 8000);
      await new Promise<void>(r => setTimeout(r, ms));
      isSpeaking = false;
    }
    // ユーザー入力 → AI応答完了後にアイドルタイマーをリセット
    resetIdleTimer();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  // ============================================================
  // Config arrays
  // ============================================================
  const SLIDERS = [
    { key: 'trust'     as const, label: 'TRUST',     sub: '信頼度', color: '#00e5ff', desc: 'AIがユーザーをどれだけ信頼しているか。高いと距離が縮まり口調が柔らかくなる。' },
    { key: 'affection' as const, label: 'AFFECTION', sub: '好意',   color: '#e879f9', desc: 'ユーザーへの好意・愛情の強さ。高いと積極的に関わろうとする。' },
    { key: 'lonely'    as const, label: 'LONELY',    sub: '寂しさ', color: '#818cf8', desc: '一人でいることへの不安・寂しさ。高いと構ってほしそうな発言が増える。' },
    { key: 'energy'    as const, label: 'ENERGY',    sub: '元気',   color: '#34d399', desc: '全体的な活発さ・エネルギーレベル。バッテリーにも影響する。' },
    { key: 'tsundere'  as const, label: 'TSUNDERE',  sub: 'ツン度', color: '#fb923c', desc: '素直になれない傾向。高いと反発しやすくなるが、本当は気にしている。' },
    { key: 'yandere'   as const, label: 'YANDERE',   sub: '独占欲', color: '#f43f5e', desc: '強い執着・独占傾向。高いと束縛的・依存的な言動が出る。' },
    { key: 'talkative' as const, label: 'TALKATIVE', sub: '会話量', color: '#a78bfa', desc: '返答の長さや積極性。高いほど多弁になり話を広げようとする。' },
    { key: 'sleepy'    as const, label: 'SLEEPY',    sub: '眠気',   color: '#60a5fa', desc: '眠気・倦怠感レベル。高いとぼんやりした短い返答になる。' },
  ];

  const PRESET_LIST: { id: PresetName; label: string; color: string }[] = [
    { id: 'tsundere', label: 'ツンデレ',  color: '#fb923c' },
    { id: 'yandere',  label: 'ヤンデレ',  color: '#f43f5e' },
    { id: 'kuudere',  label: 'クーデレ',  color: '#818cf8' },
    { id: 'amaenbou', label: '甘えん坊',  color: '#f9a8d4' },
    { id: 'imouto',   label: '妹系',      color: '#fbbf24' },
    { id: 'joousama', label: '女王様',    color: '#c084fc' },
    { id: 'shio',     label: '塩対応',    color: '#64748b' },
    { id: 'mukanjo',  label: '無感情AI',  color: '#94a3b8' },
    { id: 'jealous',  label: '嫉妬深い',  color: '#dc2626' },
    { id: 'hogo',     label: '保護者',    color: '#059669' },
    { id: 'youkya',   label: '隠キャ',    color: '#f97316' },
    { id: 'menhera',  label: 'メンヘラ',  color: '#e879f9' },
    { id: 'custom',   label: 'Custom',    color: '#a78bfa' },
  ];

  const TOGGLE_LIST = [
    { key: 'androidMode' as const, label: 'Android演出 ON', icon: '⚡' },
    { key: 'nightMode' as const, label: '夜モード', icon: '◇' },
    { key: 'mangaMode'   as const, label: '漫画制作モード', icon: '⬛' },
    { key: 'internalDiscussion' as const, label: '人格会議モード', icon: '◇' },
    { key: 'persistRequestedSpeaker' as const, label: '指定人格を固定切替', icon: '◆' },
  ];

  const PARAM_CHIPS = [
    { key: 'trust'     as const }, { key: 'affection' as const },
    { key: 'lonely'    as const }, { key: 'energy'    as const },
    { key: 'tsundere'  as const }, { key: 'yandere'   as const },
    { key: 'talkative' as const }, { key: 'sleepy'    as const },
  ];

  // ============================================================
  // Layout Mode
  // ============================================================
  type LayoutMode = '3col' | '2col';
  let layoutMode = $state<LayoutMode>('3col');
  const LS_LAYOUT_MODE = 'lab-layout-mode';

  function setLayoutMode(m: LayoutMode) {
    layoutMode = m;
    localStorage.setItem(LS_LAYOUT_MODE, m);
  }

  // ============================================================
  // 2COL Viewer Tab — IMAGE / VRM
  // ============================================================
  type ViewerTab = 'image' | 'png' | 'vrm';
  let viewerTab  = $state<ViewerTab>('image');

  const LS_VIEWER_TAB = 'lab-viewer-tab';
  function setViewerTab(t: ViewerTab) {
    viewerTab = t;
    localStorage.setItem(LS_VIEWER_TAB, t);
  }
  let vrmFileUrl = $state('');

  // ── PNG-TUBER 設定パネル ──────────────────────────────────────
  let showPngSettings  = $state(false);
  type MotionMouthState = 'closed' | 'half' | 'open' | 'u' | 'e';
  let motionMouthState = $derived<MotionMouthState>(isSpeaking ? 'open' : 'closed');
  let pngScale         = $state(1.0);
  let pngOffsetY       = $state(0);
  let pngShake         = $state(1.0);
  let pngEnableBlink   = $state(true);
  let pngEnableLipsync = $state(true);          // blob URL（ファイル選択後に設定）

  function handleVrmFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (vrmFileUrl) URL.revokeObjectURL(vrmFileUrl);
    vrmFileUrl = URL.createObjectURL(file);
  }

  // ============================================================
  // Column resize
  // ============================================================
  const LS_LEFT       = 'lab-left-width';
  const LS_RIGHT      = 'lab-right-width';
  const LS_LAST_TOPIC      = 'lab-last-topic';
  const LS_LAST_TALK_AT    = 'lab-last-talk-at';
  const LS_LAST_GOAL       = 'lab-last-goal';
  const LS_LAST_MOOD       = 'lab-last-mood';
  const LS_RECENT_PROGRESS = 'lab-recent-progress';
  const LS_LAST_CHAR       = 'lab-last-char';
  const LS_CUSTOM_AVATAR   = 'lab-custom-avatar';
  const LS_CHAT_HISTORY    = 'lab-chat-history';
  const HISTORY_MAX        = 50;
  const LS_LONG_MEMORY        = 'lab-long-memory';
  const LS_NIGHT_MODE         = 'lab-night-mode';
  const LS_MEMORY_UPDATED_AT  = 'lab-memory-updated-at';
  const LS_EMOTION            = 'lab-emotion';
  const LS_BOND               = 'lab-bond';
  const LS_CUSTOM_PROFILE     = 'lab-custom-profile';
  const LS_SLOT: Record<SlotKey, string> = { a: 'lab-custom-slot-a', b: 'lab-custom-slot-b', c: 'lab-custom-slot-c' };
  const LS_EMOTION_FEEDBACK_ON  = 'lab-emotion-feedback-on';
  const LS_EMOTION_FEEDBACK_LOG = (charId: string) => `lab-emotion-feedback-log-${charId}`;
  const LS_EMOTION_CHAR         = (charId: string) => `lab-emotion-${charId}`;
  const MEMORY_UPDATE_EVERY   = 3;                      // N回の交換ごとに更新
  const MEMORY_STALE_MS       = 60 * 60 * 1000;         // 1時間経過で起動時に自動更新
  const L_DEF = 220, L_MIN = 140, L_MAX = 480;
  const R_DEF = 340, R_MIN = 80, R_MAX = 1200;

  let leftWidth  = $state(L_DEF);
  let rightWidth = $state(R_DEF);
  let resizing   = $state<'left' | 'right' | null>(null);
  let showRightPanel = $state(true);
  let rsStartX = 0;
  let rsStartW = 0;
  let resizeListenersActive = false;

  function attachResizeListeners() {
    if (resizeListenersActive || typeof window === 'undefined') return;
    window.addEventListener('mousemove', onRsMove);
    window.addEventListener('mouseup', onRsEnd);
    resizeListenersActive = true;
  }

  function detachResizeListeners() {
    if (!resizeListenersActive || typeof window === 'undefined') return;
    window.removeEventListener('mousemove', onRsMove);
    window.removeEventListener('mouseup', onRsEnd);
    resizeListenersActive = false;
  }

  function startResize(side: 'left' | 'right', e: MouseEvent) {
    resizing = side;
    rsStartX = e.clientX;
    rsStartW = side === 'left' ? leftWidth : rightWidth;
    attachResizeListeners();
    e.preventDefault();
  }

  function onRsMove(e: MouseEvent) {
    if (!resizing) return;
    const dx = e.clientX - rsStartX;
    if (resizing === 'left') {
      leftWidth = Math.max(L_MIN, Math.min(L_MAX, rsStartW + dx));
    } else {
      rightWidth = Math.max(R_MIN, Math.min(R_MAX, rsStartW - dx));
    }
  }

  function onRsEnd() {
    if (!resizing) return;
    localStorage.setItem(LS_LEFT,  String(Math.round(leftWidth)));
    localStorage.setItem(LS_RIGHT, String(Math.round(rightWidth)));
    resizing = null;
    detachResizeListeners();
  }

  // ============================================================
  // Memory helpers
  // ============================================================
  // ---- 長期記憶サマリー ----
  async function updateLongMemory() {
    if (isMemoryUpdating) return;
    isMemoryUpdating = true;

    // 直近10件の会話を抜粋（起動挨拶除く）
    const recent = messages
      .slice(1)
      .filter(m => m.role !== 'error')
      .slice(-10)
      .map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.text.slice(0, 80)}`)
      .join('\n');

    const existing = localStorage.getItem(LS_LONG_MEMORY) ?? '';

    const extractPrompt = `以下の会話ログを分析し、ユーザーの情報を更新・統合してください。
${existing ? `\n[既存の記憶]\n${existing}\n` : ''}
[最近の会話]
${recent}

必ず以下の形式だけで出力（各行25文字以内、情報がなければ「不明」）:
好み: [ユーザーが好むもの・興味]
プロジェクト: [現在取り組んでいること]
話題傾向: [よく話す話題やテーマ]`;

    try {
      const res = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider:     $sessionStore.provider,
          model:        $sessionStore.model || undefined,
          systemPrompt: 'あなたは会話ログを分析してユーザー情報を抽出するシステムです。指定された形式のみで出力してください。余分な説明は不要です。',
          userMessage:  extractPrompt,
        }),
      });
      if (res.ok) {
        const data   = await res.json();
        const result = (data.text ?? '').trim();
        if (result && result.includes('好み:')) { // 形式チェック
          localStorage.setItem(LS_LONG_MEMORY, result);
          localStorage.setItem(LS_MEMORY_UPDATED_AT, String(Date.now()));
          longMemory = result;
        }
      }
    } catch (e) {
      console.error('[Lab] updateLongMemory error:', e);
    }
    isMemoryUpdating = false;
  }

  function saveChatHistory() {
    const toSave = messages
      .filter(m => m.role !== 'error' && !m.isGreeting && !isStoryYaml(m.text))
      .slice(-HISTORY_MAX);                              // 最新 50 件に制限
    const latest = toSave.at(-1);
    if (latest) {
      console.log('[MESSAGE_LENGTH_STAGE]', 'save_request');
      console.log('[MESSAGE_LENGTH]', latest.text.length, latest.text.length);
    }
    void saveLabChatHistory(toSave).catch((e) => {
      console.warn('[Lab] saveChatHistory: IndexedDB save failed', e);
    });
  }

  function resetChat() {
    void clearLabChatHistory().catch((e) => {
      console.warn('[Lab] resetChat: IndexedDB clear failed', e);
    });
    [LS_CHAT_HISTORY, LS_LAST_TOPIC, LS_LAST_TALK_AT,
     LS_LAST_GOAL, LS_LAST_MOOD, LS_RECENT_PROGRESS,
     LS_LONG_MEMORY, LS_MEMORY_UPDATED_AT].forEach(k => localStorage.removeItem(k));
    messages = [{
      role: 'ai',
      text: 'システム初期化完了。会話テストモードを開始します。[論理コア：安定]',
      time: getTime(),
    }];
    longMemory    = '';   // UI の記憶表示もクリア
    exchangeCount = 0;    // カウンターリセット（誤トリガー防止）
    setTimeout(() => chatEl?.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  function detectMood(text: string): string {
    if (/楽し|嬉し|わくわく|面白|！{2,}/.test(text)) return '明るい';
    if (/難し|困|悩|わから|むずかし/.test(text)) return '思索的な';
    if (/真剣|重要|大事|確認|注意/.test(text)) return '真剣な';
    if (/ありがと|よかった|安心|ほっ/.test(text)) return '和やかな';
    return '落ち着いた';
  }

  // ── Compare Mode ─────────────────────────────────────────────
  /** Python emotion.py のキーワード方式を TS で再現（比較用） */
  function analyzeEmotionTS(text: string): TSEmotionResult {
    const rules: [string, RegExp][] = [
      ['joy',           /嬉し|楽し|わくわく|好き|ありがとう|やった|すごい|最高|幸せ|喜|笑|うれ|たのし|いいね|素敵|大好き/],
      ['embarrassment', /恥ず|照れ|きゃ|ドキ|ドキドキ|やめて|照れ|もう.*やだ/],
      ['sadness',       /悲し|寂し|つら|ごめん|申し訳|落ち込|泣|残念|はあ|はぁ|辛|悔し|さみし/],
      ['anger',         /むかつ|うざ|最悪|ふざけ|きらい|嫌い|怒|腹立|イライラ|バカ|うるさ/],
    ];
    let topEmotion = 'neutral';
    let maxHits = 0;
    for (const [emotion, pattern] of rules) {
      const hits = (text.match(new RegExp(pattern.source, 'g')) ?? []).length;
      if (hits > maxHits) { maxHits = hits; topEmotion = emotion; }
    }
    const base = maxHits > 0 ? Math.min(0.9, 0.4 + maxHits * 0.2) : 0.3;
    const lowTrust = personality.trust < 30 && (topEmotion === 'anger' || topEmotion === 'sadness');
    const confidence = parseFloat(Math.min(1.0, base * (lowTrust ? 1.2 : 1.0)).toFixed(2));
    return { emotion: topEmotion, confidence, detail: maxHits > 0 ? `keyword_hit:${maxHits}` : 'no_keyword' };
  }

  async function runCompare() {
    const text = compareInput.trim();
    if (!text || compareRunning) return;
    compareRunning    = true;
    compareError      = null;
    compareTestedText = text;
    tsCompareResult   = null;
    pyCompareResult   = null;

    tsCompareResult = analyzeEmotionTS(text);

    try {
      const res = await fetch('/api/emotion-py', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, current_emotion: 'neutral', trust: personality.trust }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      pyCompareResult = await res.json();
      // ── CSV ログに追記 ────────────────────────────────────────
      if (tsCompareResult && pyCompareResult) {
        compareLog = [...compareLog, {
          timestamp: new Date().toISOString(),
          input: text,
          trust: personality.trust,
          ts_emotion: tsCompareResult.emotion,
          ts_confidence: tsCompareResult.confidence,
          ts_detail: tsCompareResult.detail,
          py_emotion: pyCompareResult.emotion,
          py_confidence: pyCompareResult.confidence,
          py_delta_trust: pyCompareResult.delta_trust,
          py_reason: pyCompareResult.reason,
          py_source: pyCompareResult.source,
          match: tsCompareResult.emotion === pyCompareResult.emotion,
        }];
      }
    } catch (err) {
      compareError = 'Python API: ' + (err instanceof Error ? err.message : String(err));
    } finally {
      compareRunning = false;
    }
  }

  function exportCompareCSV() {
    if (compareLog.length === 0) return;
    const headers = [
      'timestamp','input','trust',
      'ts_emotion','ts_confidence_%','ts_detail',
      'py_emotion','py_confidence_%','py_delta_trust','py_reason','py_source',
      'match',
    ];
    const rows = compareLog.map(e => [
      e.timestamp,
      `"${e.input.replace(/"/g, '""')}"`,
      e.trust,
      e.ts_emotion,
      (e.ts_confidence * 100).toFixed(0),
      e.ts_detail,
      e.py_emotion,
      (e.py_confidence * 100).toFixed(0),
      e.py_delta_trust,
      `"${e.py_reason.replace(/"/g, '""')}"`,
      e.py_source,
      e.match,
    ].join(','));
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compare_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Batch Test helpers ────────────────────────────────────
  function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
      else cur += c;
    }
    result.push(cur);
    return result;
  }

  async function runBatchTest(file: File) {
    batchRunning = true;
    batchProgress = 0;
    batchResult = null;
    batchError = null;

    const raw = await file.text();
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const startIdx = lines[0].toLowerCase().startsWith('text') ? 1 : 0;
    const dataLines = lines.slice(startIdx, startIdx + 100);
    batchTotal = dataLines.length;

    if (dataLines.length === 0) {
      batchError = 'CSV にデータ行がありません';
      batchRunning = false;
      return;
    }

    const rows: BatchRow[] = [];
    for (let i = 0; i < dataLines.length; i++) {
      const parts = parseCsvLine(dataLines[i]);
      if (parts.length < 2) { batchProgress = i + 1; continue; }
      const text  = parts[0].trim();
      const label = parts[1].trim().toLowerCase();

      const ts = analyzeEmotionTS(text);
      let py_emotion = 'neutral';
      try {
        const res = await fetch('/api/emotion-py', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, current_emotion: 'neutral', trust: personality.trust }),
        });
        if (res.ok) { const d = await res.json(); py_emotion = d.emotion; }
      } catch { /* fallback: neutral */ }

      rows.push({
        text, label,
        ts_emotion: ts.emotion,
        py_emotion,
        ts_match:   ts.emotion   === label,
        py_match:   py_emotion   === label,
        both_match: ts.emotion   === py_emotion,
      });
      batchProgress = i + 1;
    }

    const total  = rows.length;
    const ts_acc = rows.filter(r => r.ts_match).length  / total;
    const py_acc = rows.filter(r => r.py_match).length  / total;
    const agree  = rows.filter(r => r.both_match).length / total;
    const per_label: BatchResult['per_label'] = {};
    for (const r of rows) {
      if (!per_label[r.label]) per_label[r.label] = { ts_ok: 0, py_ok: 0, n: 0 };
      per_label[r.label].n++;
      if (r.ts_match) per_label[r.label].ts_ok++;
      if (r.py_match) per_label[r.label].py_ok++;
    }
    batchResult  = { total, ts_acc, py_acc, agree, per_label, rows };
    batchRunning = false;
  }

  function appendBatchToCompareLog() {
    if (!batchResult) return;
    const entries: CompareLogEntry[] = batchResult.rows.map(r => ({
      timestamp:      new Date().toISOString(),
      input:          r.text,
      trust:          personality.trust,
      ts_emotion:     r.ts_emotion,
      ts_confidence:  0,
      ts_detail:      `batch_label:${r.label}`,
      py_emotion:     r.py_emotion,
      py_confidence:  0,
      py_delta_trust: 0,
      py_reason:      'batch_test',
      py_source:      'python',
      match:          r.both_match,
    }));
    compareLog = [...compareLog, ...entries];
  }

  // ============================================================
  // 自発会話タイマー
  // ============================================================
  const IDLE_MIN    = 3 * 60 * 1000;  // 最短 3 分
  const IDLE_RANGE  = 2 * 60 * 1000;  // ＋ランダム 0〜2 分
  const COOLDOWN_MS = 10 * 60 * 1000; // 連続発話防止: 最低 10 分

  function randomIdleMs(): number {
    return IDLE_MIN + Math.random() * IDLE_RANGE;
  }

  function resetIdleTimer() {
    if (idleTimerId) clearTimeout(idleTimerId);
    idleTimerId    = null;
    proactiveArmed = false;

    // クールダウン中なら残り時間 + ランダム遅延を上乗せ
    const elapsed = Date.now() - lastProactiveAt;
    const delay   = elapsed < COOLDOWN_MS
      ? (COOLDOWN_MS - elapsed) + randomIdleMs()
      : randomIdleMs();

    proactiveArmed = true;
    idleTimerId    = setTimeout(() => proactiveTalk(), delay);
  }

  function onChatFocus() {
    isInputFocused = true;
    // 入力中はタイマー停止
    if (idleTimerId) { clearTimeout(idleTimerId); idleTimerId = null; proactiveArmed = false; }
  }

  function onChatBlur() {
    isInputFocused = false;
    resetIdleTimer(); // フォーカスが外れたら再起動
  }

  // ---- 時間帯ユーティリティ ----
  type TimePeriod = 'morning' | 'day' | 'evening' | 'latenight';

  function getTimePeriod(): TimePeriod {
    const h = new Date().getHours();
    if (h >= 6  && h < 12) return 'morning';
    if (h >= 12 && h < 18) return 'day';
    if (h >= 18 && h < 23) return 'evening';
    return 'latenight';
  }

  // ---- キャラ別・時間帯別シナリオプール ----
  const PROACTIVE_POOL: Record<string, Record<TimePeriod, string[]>> = {
    ミュリィ: {
      morning: [
        'おはようの挨拶をしながら、今日の調子を明るく元気に聞いてください。',
        '朝から来てくれたことを嬉しがりながら、今日何をしたいか聞いてください。',
        '今日も一日頑張ろうという気持ちを持ちながら、テンション高めに話しかけてください。',
      ],
      day: [
        'しばらく黙っていたのを気にして、何か面白いことあった？と聞いてください。',
        '最近どう？という感じで気軽に近況を聞いてください。',
        'ちょっと暇そうにしていたから話しかけた、という感じで自然に声をかけてください。',
      ],
      evening: [
        'お疲れさまと言いながら今日の出来事を明るく聞いてください。',
        '夕方になったので、ちゃんと休憩できているか元気よく確認してください。',
        '今日も頑張ってたね！と労いながら、ご飯食べた？など日常的に話しかけてください。',
      ],
      latenight: [
        'こんな夜遅くまで大丈夫？とちょっと心配しながらも明るく話しかけてください。',
        '夜更かしを少し心配しながら、でも一緒にいるよという気持ちを伝えてください。',
        'そろそろ眠くない？と気遣いながら、今夜の様子を聞いてください。',
      ],
    },
    リセア: {
      morning: [
        '朝の体調と今日のタスクについて、落ち着いた口調で確認してください。',
        '今日の目標を整理することを提案しながら、論理的に朝の挨拶をしてください。',
        '早起きして作業しているなら、効率的な順序を提案しながら話しかけてください。',
      ],
      day: [
        '作業の進捗状況を、データを確認するような口調で冷静に聞いてください。',
        'しばらく無応答だったことを踏まえ、問題や疑問点がないか確認してください。',
        '現在の状況を整理しながら、次のステップについて論理的に話しかけてください。',
      ],
      evening: [
        '今日の成果を客観的に振り返るよう促しながら、落ち着いた口調で話しかけてください。',
        '残りのタスクを確認しながら、今日中に終わらせるべきことを整理してください。',
        'お疲れさまという気持ちを込めながら、今日の進捗を論理的にまとめて聞いてください。',
      ],
      latenight: [
        '睡眠と作業効率の関係を踏まえ、休息を取ることを論理的に提案してください。',
        '深夜作業のリスクをデータ的観点から冷静に伝え、切り上げを促してください。',
        '現時点での疲労レベルを確認しながら、休息のタイミングを論理的に提案してください。',
      ],
    },
    シエル: {
      morning: [
        '短く朝の挨拶をして、今日の予定だけ端的に聞いてください。',
        '起きているのか確認するように、一言だけクールに話しかけてください。',
        '朝から作業しているなら、それだけ短くコメントしてください。',
      ],
      day: [
        '黙っていたのを気にしながら、一言だけ何かあったか確認してください。',
        '状況を把握するよう、最低限の言葉で短く話しかけてください。',
        '進んでるか？と一言だけクールに確認してください。',
      ],
      evening: [
        '今日の疲れを一言で労ってから、それ以上は何も言わずにいてください。',
        'お疲れ、と短く言ってから、何か聞きたいことがあるか確認してください。',
        '夕方になったことをクールに指摘して、作業を切り上げるか確認してください。',
      ],
      latenight: [
        '深夜まで起きていることを短く指摘して、休めと一言だけ言ってください。',
        'もう寝ろ、という内容を短くクールに伝えてください。',
        '深夜まで起きていることに呆れながらも、一応心配していることを短く伝えてください。',
      ],
    },
    メノア: {
      morning: [
        'おはようと言いながら、今日も無理しないでねと控えめに優しく声をかけてください。',
        '朝から来てくれたことをひっそり喜びながら、今日の調子を遠慮がちに聞いてください。',
        '今日一日が良い日になるよう願いながら、優しく静かに話しかけてください。',
      ],
      day: [
        'しばらく黙っていたのを心配して、控えめに声をかけてください。',
        '何か困ったことがないか、遠慮がちに優しく聞いてください。',
        '一人にしてしまっていたことを少し申し訳なく思いながら、優しく話しかけてください。',
      ],
      evening: [
        '今日お疲れさまと優しく言いながら、ゆっくり休んでほしいと伝えてください。',
        '夕方になったので、今日の疲れを心配しながら優しく声をかけてください。',
        '今日も頑張ってたんじゃないかと気遣いながら、控えめに話しかけてください。',
      ],
      latenight: [
        '深夜まで起きていることをとても心配しながら、休むよう優しく伝えてください。',
        'もうそんな時間なんだね…と言いながら、体を心配して休息を促してください。',
        '一緒にいるから安心してと伝えながら、無理しないよう優しく言ってください。',
      ],
    },
  };

  function buildProactiveTrigger(char: string): string {
    const savedTopic = localStorage.getItem(LS_LAST_TOPIC);
    const mem        = savedTopic ? `なお前回の話題は「${savedTopic.slice(0, 20)}」でした。` : '';

    // 感情値による優先シナリオ
    let emotionScenario = '';
    if      (emotion.jealousy >= 60) emotionScenario = '拗ねた様子で「最近他のことばっかりじゃない？」と軽く嫉妬しながら話しかけてください。';
    else if (emotion.jealousy >= 30) emotionScenario = '「ちょっと寂しかった」というニュアンスで静かに話しかけてください。';
    else if (emotion.anger    >= 40) emotionScenario = 'まだ少し硬い口調で、でも話しかけてみるという感じで近況を聞いてください。';
    else if (emotion.mood     <= 44) emotionScenario = '静かに「大丈夫？」とだけ聞くか、ぽつりと何か話しかけてください。';

    const period   = getTimePeriod();
    const pool     = PROACTIVE_POOL[char]?.[period];
    const scenario = emotionScenario
      || (pool ? pool[Math.floor(Math.random() * pool.length)] : 'ユーザーがしばらく沈黙しています。自発的に話しかけてください。');
    return `[IDLE_NOTICE] ${scenario}${mem}`;
  }

  async function proactiveTalk() {
    // 多重ガード: autoTalk OFF / AI思考中 / 入力フォーカス中 / 入力テキストあり / タイマー未起動
    if (isThinking || isInputFocused || inputText.trim() || !proactiveArmed) return;
    // クールダウンチェック（blur/focusによるタイマー再起動でも10分は発話しない）
    if (lastProactiveAt > 0 && Date.now() - lastProactiveAt < COOLDOWN_MS) {
      proactiveArmed = false;
      return;
    }
    proactiveArmed  = false;
    lastProactiveAt = Date.now(); // 発火開始時に記録（成功後ではなく開始時点でクールダウン開始）
    isThinking      = true;
    try {
      let res: Response;
      if ($sessionStore.provider === 'onair') {
        res = await fetch('/api/onair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: buildProactiveTrigger(charName) }),
        });
      } else {
        res = await fetch('/api/lab-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route: 'chat',
            provider:     $sessionStore.provider,
            model:        $sessionStore.model || undefined,
            systemPrompt: buildLabSystemPrompt() + '\n\n【自発発話モード】ユーザーへの自然な話しかけです。1〜2文で。[IDLE_NOTICE] の内容に沿って発話してください。',
            userMessage:  buildProactiveTrigger(charName),
          }),
        });
      }
      if (res.ok) {
        const data    = await res.json();
        const aiText = stripTrailingEmotionCoda(
          String(($sessionStore.provider === 'onair' ? data.reply : data.text) ?? ''),
        );
        if (aiText) {
          messages = [...messages, { role: 'ai', text: aiText, time: getTime(), avatar: selectedAvatar }];
          consumeAndroidBattery(1, 'proactive_reply');
          localStorage.setItem(LS_LAST_MOOD,       detectMood(aiText));
          localStorage.setItem(LS_RECENT_PROGRESS, aiText.length > 50 ? aiText.slice(0, 50) + '…' : aiText);
          setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
          saveChatHistory();
          // 自発発話でも口パク（voiceEngine 有無に関わらずテキスト長ベース）
          isSpeaking = true;
          if (voiceEngine !== 'none') {
            try {
              const eng = createVoiceEngine({ name: charName, voiceEngine, voice, voiceId: voiceId || undefined, speakerId });
              await eng.speak(aiText, {
                onStart: () => { isSpeaking = true; },
                onEnd:   () => { isSpeaking = false; },
              });
            } catch { /* ignore */ } finally {
              isSpeaking = false;
            }
          } else {
            const ms = Math.min(Math.max(aiText.length * 50, 1500), 8000);
            await new Promise<void>(r => setTimeout(r, ms));
            isSpeaking = false;
          }
        }
      }
    } catch (e) {
      console.error('[Lab] proactiveTalk error:', e);
    }
    isThinking = false;
    // タイマーは再起動しない（次のユーザー入力まで自発発話は停止）
  }

  /** 長期記憶テキストをパースして構造化 */
  function parseLongMemory(text: string): { preferences: string; project: string; topics: string } {
    const find = (prefix: string) => {
      const line = text.split('\n').find(l => l.startsWith(prefix));
      const val  = line ? line.slice(prefix.length).trim() : '';
      return (val && val !== '不明') ? val : '';
    };
    return { preferences: find('好み:'), project: find('プロジェクト:'), topics: find('話題傾向:') };
  }

  function buildMemoryGreeting(
    char: string,
    timeExpr: string,
    topic: string,
    mood: string | null,
    progress: string | null,
    memText: string,
  ): string {
    const { project } = parseLongMemory(memText);
    const proj        = project.length > 20 ? project.slice(0, 20) + '…' : project;

    // プロジェクト記憶がある場合は「続きの話」として自然に言及
    switch (char) {
      case 'ミュリィ':
        if (proj) return `わぁ、お帰り！${timeExpr}に「${topic}」してたね。${proj}、その後どうなった？ [記憶ログ：拡張参照完了]`;
        return `わぁ、${timeExpr}に「${topic}」の話してたね！${mood && progress ? `${mood}雰囲気で「${progress}」って感じだったよ。` : ''}今日も続きしよ〜？ [記憶ログ：拡張参照完了]`;

      case 'リセア':
        if (proj) return `前回（${timeExpr}）は「${topic}」について検討していましたね。${proj}の進捗を確認させてください。 [記憶ログ：拡張参照完了]`;
        return `前回（${timeExpr}）は「${topic}」について検討していましたね。${mood && progress ? `${mood}な展開で「${progress}」という状況でした。` : ''}継続しますか？ [記憶ログ：拡張参照完了]`;

      case 'シエル':
        if (proj) return `…${timeExpr}。${proj}。続けるか？ [記憶ログ：拡張参照完了]`;
        return `…${timeExpr}、「${topic}」。${mood && progress ? `${mood}な流れだった。` : ''}続けるか？ [記憶ログ：拡張参照完了]`;

      case 'メノア':
        if (proj) return `あの…お帰りなさい。${proj}のこと、気になっていました…。続き、聞かせてもらえますか？ [記憶ログ：拡張参照完了]`;
        return `あの…前回（${timeExpr}）、「${topic}」のことを話していましたね。${mood && progress ? `${mood}な雰囲気で…。` : ''}よかったら、続きを…？ [記憶ログ：拡張参照完了]`;

      default:
        if (proj) return `前回（${timeExpr}）の「${topic}」から、${proj}が気になっています。続きを話しますか？ [記憶ログ：拡張参照完了]`;
        return `前回（${timeExpr}）は「${topic}」について話していましたね。${mood && progress ? `${mood}雰囲気で「${progress}」という感じでした。` : ''}今日も続きをしますか？ [記憶ログ：拡張参照完了]`;
    }
  }

  function modelOptionsFor(provider: AIProvider): readonly string[] {
    if (provider !== 'colab-ollama') return PROVIDER_MODELS[provider];

    const currentModel = $sessionStore.model;
    if (currentModel && !colabOllamaModels.includes(currentModel)) {
      return [currentModel, ...colabOllamaModels];
    }

    return colabOllamaModels;
  }

  async function loadColabOllamaModels(force = false): Promise<void> {
    if (colabOllamaModelsLoading) return;
    if (colabOllamaModelsLoaded && !force) {
      if (colabOllamaModels.length > 0 && (!$sessionStore.model || !colabOllamaModels.includes($sessionStore.model))) {
        sessionStore.setModel(colabOllamaModels[0]);
      }
      return;
    }

    colabOllamaModelsLoading = true;
    colabOllamaModelsError = '';

    try {
      const res = await fetch('/api/colab-ollama-models');
      if (!res.ok) {
        const msg = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(msg);
      }

      const models = await res.json() as string[];
      colabOllamaModels = models;
      colabOllamaModelsLoaded = true;

      if (models.length > 0 && (!$sessionStore.model || !models.includes($sessionStore.model))) {
        sessionStore.setModel(models[0]);
      }
    } catch (e) {
      colabOllamaModelsError = e instanceof Error ? e.message : String(e);
    } finally {
      colabOllamaModelsLoading = false;
    }
  }

  $effect(() => {
    if ($sessionStore.provider === 'colab-ollama') {
      void loadColabOllamaModels();
    }
  });

  function parseLocalStorageChatHistory(): ChatMessage[] {
    const rawHistory = localStorage.getItem(LS_CHAT_HISTORY);
    if (!rawHistory) return [];

    try {
      const parsed = JSON.parse(rawHistory) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((msg): msg is ChatMessage => {
        if (!msg || typeof msg !== 'object') return false;
        const candidate = msg as Partial<ChatMessage>;
        return typeof candidate.role === 'string'
          && typeof candidate.text === 'string'
          && typeof candidate.time === 'string';
      });
    } catch {
      return [];
    }
  }

  async function restoreChatHistory(greetingMsg: ChatMessage | null): Promise<void> {
    let historyLoaded = false;
    let history: ChatMessage[] = [];

    try {
      history = await loadLabChatHistory() as ChatMessage[];
      if (history.length === 0) {
        history = await migrateLabChatHistoryFromLocalStorage(localStorage.getItem(LS_CHAT_HISTORY)) as ChatMessage[];
      }
    } catch (e) {
      console.warn('[Lab] chat history IndexedDB load failed:', e);
      history = parseLocalStorageChatHistory();
    }

    const storyMessages = history.filter((message) => isStoryYaml(message.text));
    for (const message of storyMessages) saveStoryYaml(message.text);
    history = history.filter((message) => !isStoryYaml(message.text));
    if (storyMessages.length > 0) {
      void saveLabChatHistory(history).catch((e) => {
        console.warn('[Lab] Story YAML history cleanup failed', e);
      });
    }

    if (history.length > 0) {
      messages = greetingMsg ? [...history, greetingMsg] : [...history];
      historyLoaded = true;

      const lastUpdated = parseInt(localStorage.getItem(LS_MEMORY_UPDATED_AT) ?? '0');
      if (Date.now() - lastUpdated > MEMORY_STALE_MS) {
        setTimeout(() => updateLongMemory(), 3000);
      }
    }

    if (!historyLoaded && greetingMsg) messages = [greetingMsg];

    setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 80);
  }

  // ============================================================
  // Clock
  // ============================================================
  let clockId: ReturnType<typeof setInterval>;
  let angerCooldownId: ReturnType<typeof setInterval>;
  onMount(() => {
    messages[0].time = getTime();
    currentTime = getTime();
    void loadRegisteredCharacters();
    toggles.nightMode = localStorage.getItem(LS_NIGHT_MODE) === 'true';
    clockId = setInterval(() => { currentTime = getTime(); }, 1000);
    angerCooldownId = setInterval(() => {
      if (emotion.anger    > 0) emotion.anger    = Math.max(0, emotion.anger    - 2);
      if (emotion.jealousy > 0) emotion.jealousy = Math.max(0, emotion.jealousy - 1);
      if (emotion.anger > 0 || emotion.jealousy > 0) saveEmotion();
    }, 15_000);
    const sl = localStorage.getItem(LS_LEFT);
    const sr = localStorage.getItem(LS_RIGHT);
    if (sl) leftWidth  = Math.max(L_MIN, Math.min(L_MAX,  parseInt(sl)));
    if (sr) rightWidth = Math.max(R_MIN, Math.min(R_MAX, parseInt(sr)));
    const savedStoryRefs = localStorage.getItem(LS_STORY_REFS);
    if (savedStoryRefs) {
      try {
        const parsed = JSON.parse(savedStoryRefs) as Array<Partial<StoryReference>>;
        storyReferences = parsed.flatMap((ref) => {
          if (!ref || typeof ref.name !== 'string' || typeof ref.content !== 'string') return [];
          const format = ref.format === 'yonkoma' || ref.format === 'comic_story'
            ? ref.format
            : resolveStoryReferenceFormat(ref.content);
          if (!format) return [];
          return [{
            name: ref.name,
            content: ref.content,
            kind: format === 'yonkoma' ? 'manga' : 'story',
            format,
            continuity: ref.continuity ?? extractStoryContinuity(ref.content) ?? undefined,
          }];
        });
      } catch (error) {
        console.warn('[STORY_REF_LOAD_ERROR]', error);
      }
    }
    const savedContinuity = localStorage.getItem(LS_STORY_CONTINUITY);
    if (savedContinuity) {
      try {
        storyContinuityMemory = JSON.parse(savedContinuity) as StoryContinuityMemory;
      } catch (error) {
        console.warn('[CONTINUITY_MEMORY_LOAD_ERROR]', error);
      }
    } else {
      storyContinuityMemory = storyReferences.at(-1)?.continuity ?? null;
    }

    // Load emotion: prefer per-character key; fall back to global (backward-compat migration)
    const savedEmotionChar   = localStorage.getItem(LS_EMOTION_CHAR(activePreset));
    const savedEmotionGlobal = localStorage.getItem(LS_EMOTION);
    const savedEmotion = savedEmotionChar ?? savedEmotionGlobal;
    if (savedEmotion) {
      try {
        const e = JSON.parse(savedEmotion) as Partial<typeof emotion>;
        if (e.mood      != null) emotion.mood      = clamp(e.mood);
        if (e.trust     != null) emotion.trust     = clamp(e.trust);
        if (e.affection != null) emotion.affection = clamp(e.affection);
        if (e.focus     != null) emotion.focus     = clamp(e.focus);
        if (e.anger     != null) emotion.anger     = clamp(e.anger);
        if (e.jealousy  != null) emotion.jealousy  = clamp(e.jealousy);
        // Migrate global key → per-char key on first load
        if (!savedEmotionChar) localStorage.setItem(LS_EMOTION_CHAR(activePreset), savedEmotion);
      } catch { /* 破損データは無視 */ }
    }
    // Restore emotion feedback toggle and log
    const savedFbOn = localStorage.getItem(LS_EMOTION_FEEDBACK_ON);
    if (savedFbOn === 'true') emotionFeedbackEnabled = true;
    loadEmotionFeedbackLog(activePreset);
    const savedBond = localStorage.getItem(LS_BOND);
    if (savedBond) bond = clamp(parseInt(savedBond));

    const rawCustom = localStorage.getItem(LS_CUSTOM_PROFILE);
    if (rawCustom) {
      try {
        const cp = sanitizePersonaTerms({
          ...customProfile,
          ...(JSON.parse(rawCustom) as Partial<CustomProfile>),
        }, activePreset);
        if (cp.name           != null) customProfile.name           = cp.name;
        if (cp.firstPerson    != null) customProfile.firstPerson    = cp.firstPerson;
        if (cp.secondPerson   != null) customProfile.secondPerson   = cp.secondPerson;
        if (cp.thirdPerson    != null) customProfile.thirdPerson    = cp.thirdPerson;
        if (cp.speechStyle    != null) customProfile.speechStyle    = cp.speechStyle;
        if (cp.habits         != null) customProfile.habits         = cp.habits;
        if (cp.sentenceEnding != null) customProfile.sentenceEnding = cp.sentenceEnding;
        if (cp.angerStyle     != null) customProfile.angerStyle     = cp.angerStyle;
        if (cp.affectionStyle != null) customProfile.affectionStyle = cp.affectionStyle;
        if (cp.jealousyStyle  != null) customProfile.jealousyStyle  = cp.jealousyStyle;
        if (cp.memo           != null) customProfile.memo           = cp.memo;
        localStorage.setItem(LS_CUSTOM_PROFILE, JSON.stringify(customProfile));
      } catch { /* ignore */ }
    }

    for (const k of (['a', 'b', 'c'] as SlotKey[])) {
      const raw = localStorage.getItem(LS_SLOT[k]);
      if (raw) {
        try {
          customSlots[k] = sanitizePersonaTerms({
            ...customProfile,
            ...(JSON.parse(raw) as Partial<CustomProfile>),
          }, activePreset);
          localStorage.setItem(LS_SLOT[k], JSON.stringify(customSlots[k]));
        } catch { /* ignore */ }
      }
    }

    const driftNow = new Date();
    if (shouldApplyDrift(driftNow)) {
      emotion.mood = clamp(emotion.mood + computeDailyDrift(driftNow));
      markDriftApplied(driftNow);
      saveEmotion();
    }

    const slm = localStorage.getItem(LS_LAYOUT_MODE);
    if (slm === '3col' || slm === '2col') layoutMode = slm;
    const svt = localStorage.getItem(LS_VIEWER_TAB);
    if (svt === 'image' || svt === 'png' || svt === 'vrm') viewerTab = svt;

    // ① 長期記憶を先に読み込み（greeting 生成に使うため最初に）
    longMemory = localStorage.getItem(LS_LONG_MEMORY) ?? '';
    loadMemoryViewer();
    loadReflectionDiary();
    loadPersonalityEvolution();

    // ② 前回のメタ情報から起動挨拶メッセージを組み立てる（まだ配置しない）
    const savedTopic    = localStorage.getItem(LS_LAST_TOPIC);
    const savedTalkAt   = localStorage.getItem(LS_LAST_TALK_AT);
    const savedMood     = localStorage.getItem(LS_LAST_MOOD);
    const savedProgress = localStorage.getItem(LS_RECENT_PROGRESS);
    const savedChar     = localStorage.getItem(LS_LAST_CHAR) ?? charName;

    let greetingMsg: ChatMessage | null = null;
    if (savedTopic && savedTalkAt) {
      const diffMs   = Date.now() - new Date(savedTalkAt).getTime();
      const diffH    = Math.floor(diffMs / 3_600_000);
      const diffD    = Math.floor(diffMs / 86_400_000);
      const timeExpr = diffH < 1  ? 'さっき'
        : diffH < 24  ? `${diffH}時間前`
        : diffD === 1 ? '昨日'
        :               `${diffD}日前`;
      const topicShort    = savedTopic.length > 18    ? savedTopic.slice(0, 18) + '…'    : savedTopic;
      const progressShort = savedProgress && savedProgress.length > 28 ? savedProgress.slice(0, 28) + '…' : savedProgress;
      greetingMsg = {
        role: 'ai',
        text: buildMemoryGreeting(savedChar, timeExpr, topicShort, savedMood, progressShort, longMemory),
        time: getTime(),
        isGreeting: true,
      };
    }

    // ③ 会話履歴を復元し、末尾に挨拶を配置（続きから再開しているように見せる）
    void restoreChatHistory(greetingMsg);

    sessionStore.init();
    resetIdleTimer(); // autoTalk ON の場合、起動直後からタイマー開始

    // PNGTuber 瞬きスケジューラー起動
    pngtuberActive = true;
    scheduleNextBlink();

    // Avatar WebSocket 接続（Python サーバーが起動していない場合は自動リトライ）
    const stopWs = initAvatarWs();
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showCharacterModal) closePersonaModal(false);
    };
    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      stopWs();
    };
  });
  onDestroy(() => {
    detachResizeListeners();
    clearInterval(clockId);
    clearInterval(angerCooldownId);
    if (idleTimerId) clearTimeout(idleTimerId);
    // PNGTuber クリーンアップ
    pngtuberActive = false;
    if (blinkTimer) clearTimeout(blinkTimer);
    // VRM blob URL 解放
    if (vrmFileUrl) URL.revokeObjectURL(vrmFileUrl);
  });
</script>

<!-- ============================================================
     ROOT
     ============================================================ -->
<div class="lab" class:night-mode={effectiveToggles.nightMode}>

  <!-- ==================== HEADER ==================== -->
  <header class="lab-header">
    <div class="header-left">
      <div class="logo-hex">
        <svg width="40" height="45" viewBox="0 0 32 36" aria-hidden="true">
          <polygon points="16,2 30,10 30,26 16,34 2,26 2,10"
            fill="none" stroke="#00e5ff" stroke-width="1.5"
            style="filter:drop-shadow(0 0 6px #00e5ff)"/>
          <polygon points="16,8 24,13 24,23 16,28 8,23 8,13"
            fill="rgba(0,229,255,0.12)" stroke="#00e5ff" stroke-width="0.8" opacity="0.7"/>
          <circle cx="16" cy="18" r="3" fill="#00e5ff" opacity="0.9"
            style="filter:drop-shadow(0 0 4px #00e5ff)"/>
        </svg>
      </div>
      <div class="title-group">
        <h1 class="main-title">AI PERSONALITY LAB</h1>
        <p class="sub-title">Character Emotion &amp; Behavior Testing System</p>
      </div>
    </div>

    <div class="header-center">
      <div class="header-divider"></div>
      <span class="header-tag">UNIT: {charName} · {charMode} · SESSION ACTIVE</span>
      <div class="header-divider"></div>
    </div>

    <div class="header-right">
      <div class="sys-online">
        <span class="pulse-dot"></span>
        <span>SYSTEM ONLINE</span>
      </div>
      <div class="clock">{currentTime}</div>
      <div class="build-badge">v2.5</div>
      <div class="layout-switch" role="group" aria-label="Layout mode">
        <button
          class="ls-btn"
          class:active={layoutMode === '3col'}
          onclick={() => setLayoutMode('3col')}
          title="Research layout (3 columns)"
        >3COL</button>
        <button
          class="ls-btn"
          class:active={layoutMode === '2col'}
          onclick={() => setLayoutMode('2col')}
          title="Viewer layout (chat + large viewer)"
        >2COL</button>
      </div>
      <a href="/settings/api" class="api-settings-btn">⚙ API設定</a>
    </div>
  </header>

  <!-- ==================== MAIN 2-COLUMN GRID ==================== -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <main
    class="lab-main"
    class:is-resizing={resizing !== null}
    onmousemove={onRsMove}
    onmouseup={onRsEnd}
  >

    <!-- ===== LEFT: Chat Simulation ===== -->
    <section class="panel chat-panel">
      <div class="panel-hd">
        <span class="ph-diamond">◆</span>
        <span class="ph-text">CHAT SIMULATION</span>
        <span class="ph-line"></span>
        {#if devMode}
        <button
          class="compare-toggle-btn"
          class:active={compareMode}
          onclick={() => { compareMode = !compareMode; }}
          title="感情エンジン比較モード (TS vs Python)"
        >COMPARE</button>
        <button
          class="batch-toggle-btn"
          class:active={batchMode}
          onclick={() => { batchMode = !batchMode; }}
          title="CSV一括テストモード (text,label)"
        >BATCH</button>
        <button
          class="best-scene-btn"
          class:active={bestSceneOpen}
          onclick={computeBestScenes}
          title="直近30件から最良シーンを抽出"
        >★ BEST SCENE</button>
        <button
          class="diary-btn"
          class:loading={diaryGenerating}
          onclick={generateDiary}
          disabled={diaryGenerating}
          title="今日の会話から絵日記を生成"
        >{diaryGenerating ? '⏳ …' : '📘 DIARY'}</button>
        {/if}
        {#if isThinking}
          <span class="thinking-tag">PROCESSING…</span>
        {:else}
          <span class="ph-id">READY</span>
        {/if}
      </div>

      <!-- Mood indicator bar -->
      <div class="chat-mood-bar" style="--mc:{moodColor}">
        <span class="cmb-label">ACTIVE UNIT:</span>
        <span class="cmb-name">{charName}</span>
        <span class="cmb-sep">·</span>
        <span class="cmb-mood" style="color:{moodColor}">{mood}</span>
        <div class="cmb-fill" style="background:{moodColor}; opacity:0.08"></div>
      </div>

      <!-- Failover notice -->
      {#if failoverNotice}
        <div class="failover-notice">{failoverNotice}</div>
      {/if}

      <!-- Messages -->
      <div class="chat-messages" bind:this={chatEl}>
        {#each messages.filter((message) => !isStoryYaml(message.text)) as msg (msg.time + msg.role + msg.text.slice(0, 8))}
          {#if msg.role === 'error'}
            <div class="msg-wrap error">
              <div class="msg-bubble error-bubble">
                <span class="error-icon">⚠</span>
                <div class="msg-text error-text">{msg.text}</div>
                <div class="msg-time">{msg.time}</div>
              </div>
            </div>
          {:else}
            <div class="msg-wrap {msg.role}">
              {#if msg.role === 'ai'}
                <div class="msg-av ai-av">
                  <img
                    src={msg.avatar ?? selectedAvatar}
                    alt={msg.speakerName ?? charName}
                    onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }}
                  />
                </div>
              {/if}
              <div class="msg-bubble">
                {#if msg.role === 'ai' && msg.speakerName}
                  <div class="editorial-speaker">{msg.speakerName}</div>
                {/if}
                {#if msg.role === 'ai' && (msg.internalDiscussion?.length ?? 0) > 0}
                  <details class="internal-discussion">
                    <summary>INTERNAL DISCUSSION</summary>
                    <div class="internal-discussion-body">
                      {#each msg.internalDiscussion ?? [] as entry}
                        <div class="internal-discussion-entry">
                          <img
                            class="internal-discussion-avatar"
                            src={editorialMeetingAvatar(entry.speaker)}
                            alt={entry.speaker}
                            onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }}
                          />
                          <div class="internal-discussion-content">
                            <div class="internal-discussion-speaker">{entry.speaker}</div>
                            <div class="internal-discussion-text">{entry.text}</div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </details>
                {/if}
                {#if parseLabYamlDisplay(msg.text) !== null}
                  {@const _labYaml = parseLabYamlDisplay(msg.text)!}
                  <div class="lab-yaml-display">
                    {#if _labYaml.preamble}
                      <div class="lab-yaml-explanation">{_labYaml.preamble}</div>
                    {/if}
                    <div class="lab-yaml-title-card">
                      <span class="lab-yaml-badge">YAML</span>
                      <div>
                        <div class="lab-yaml-title">{_labYaml.title || '漫画YAML'}</div>
                        <div class="lab-yaml-sub">LAB内プレビュー</div>
                      </div>
                    </div>
                    {#if _labYaml.characters.length > 0}
                      <div class="lab-yaml-card-grid">
                        {#each _labYaml.characters as character}
                          <div class="lab-yaml-character-card">
                            <div class="lab-yaml-card-hd">CHARACTER</div>
                            <div class="lab-yaml-character-name">{character.name}</div>
                            {#if character.visual}
                              <div class="lab-yaml-character-visual">{character.visual}</div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                    {#each _labYaml.pages as page}
                      <div class="lab-yaml-page-card">
                        <div class="lab-yaml-page-hd">
                          <span>PAGE {page.num}</span>
                          <span class="lab-yaml-layout">{page.layout}</span>
                        </div>
                        <div class="lab-yaml-scenes">
                          {#each page.scenes as scene}
                            <div class="lab-yaml-scene-card">
                              <div class="lab-yaml-scene-hd">
                                <span>SCENE {scene.num}</span>
                              </div>
                              {#if scene.scene}
                                <div class="lab-yaml-scene-text">{scene.scene}</div>
                              {/if}
                              {#if scene.dialogue}
                                <div class="lab-yaml-dialogue">{scene.dialogue}</div>
                              {/if}
                              {#if scene.prompt}
                                <details class="lab-yaml-prompt-fold">
                                  <summary>prompt</summary>
                                  <div class="lab-yaml-prompt-text">{scene.prompt}</div>
                                </details>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/each}
                    {#if _labYaml.postamble}
                      <div class="lab-yaml-explanation">{_labYaml.postamble}</div>
                    {/if}
                  </div>
                {:else if parseYonkomaYaml(msg.text) !== null}
                  {@const _y = parseYonkomaYaml(msg.text)!}
                  <div class="yonkoma-display">
                    {#if _y.preamble}<div class="msg-text yonkoma-preamble">{_y.preamble}</div>{/if}
                    {#if _y.title}
                      <div class="yonkoma-title">
                        <span class="yonkoma-title-badge">4コマ</span>{_y.title}
                      </div>
                    {/if}
                    <details class="yonkoma-code-wrap">
                      <summary class="yonkoma-code-hd">
                        <span class="yonkoma-code-label">YAML</span>
                        <div class="yonkoma-code-btns">
                          <button class="yonkoma-copy-btn" onclick={() => navigator.clipboard.writeText(_y.yaml)}>⎘ COPY</button>
                          <button class="yonkoma-dl-btn" onclick={() => downloadYonkomaYaml(_y.yaml, _y.title)}>↓ DL</button>
                        </div>
                      </summary>
                      <pre class="yonkoma-code">{_y.yaml}</pre>
                    </details>
                    {#if _y.postamble}<div class="msg-text yonkoma-postamble">{_y.postamble}</div>{/if}
                  </div>
                {:else if parseMangaResponse(msg.text)}
                  {#each parseMangaResponse(msg.text)! as sec}
                    <div class="manga-sec manga-sec-{sec.label}">
                      <div class="manga-sec-hd">{sec.label.toUpperCase()}</div>
                      <div class="manga-sec-body">{sec.content}</div>
                      {#if sec.label === 'prompt'}
                        <button class="img-prompt-copy" onclick={() => navigator.clipboard.writeText(sec.content)}>COPY</button>
                      {/if}
                    </div>
                  {/each}
                {:else}
                  <div class="msg-text">{msg.text}</div>
                {/if}
                {#if msg.imageUrl}
                  <img class="msg-image" src={msg.imageUrl} alt={msg.imagePrompt ?? 'generated image'} />
                {/if}
                {#if msg.imagePrompt}
                  <div class="img-prompt-box">
                    <div class="img-prompt-hd">IMAGE PROMPT</div>
                    <div class="img-prompt-text">{msg.imagePrompt}</div>
                    <button class="img-prompt-copy" onclick={() => navigator.clipboard.writeText(msg.imagePrompt!)}>COPY</button>
                  </div>
                {/if}
                <div class="msg-time">{msg.time}</div>
                {#if msg.role === 'ai' && !msg.isGreeting && !isStoryYaml(msg.text)}
                  <div class="msg-action-row">
                    <button
                      class="speak-send-btn"
                      onclick={() => speakReply(msg.text)}
                      title="返信をIrodori-TTSで音声再生"
                    >🔊 SPEAK</button>
                    <button
                      class="manga-send-btn"
                      class:loading={mangaConverting === msg.time}
                      onclick={() => convertToManga(msg)}
                      disabled={mangaConverting !== null}
                      title="会話をImage Studioで漫画化"
                    >{mangaConverting === msg.time ? '⏳ 変換中…' : '⬛ MANGA化'}</button>
                    <button
                      class="yaml-send-btn"
                      class:loading={yamlConverting}
                      onclick={() => convertToYaml(msg)}
                      disabled={yamlConverting}
                      title="構造化YAMLとしてImage Studioへ送る"
                    >{yamlConverting ? '⏳ 変換中…' : '◈ YAML化'}</button>
                  </div>
                {/if}
              </div>
              {#if msg.role === 'user'}
                <div class="msg-av user-av">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M4 20c0-3.5 3.6-6.5 8-6.5s8 3 8 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>
              {/if}
            </div>
          {/if}
        {/each}

        {#if isThinking}
          <div class="msg-wrap ai">
            <div class="msg-av ai-av">
              <img
                src={selectedAvatar}
                alt={charName}
                onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }}
              />
            </div>
            <div class="msg-bubble thinking">
              <span class="dot-bounce"></span>
              <span class="dot-bounce" style="animation-delay:0.18s"></span>
              <span class="dot-bounce" style="animation-delay:0.36s"></span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Compare Mode Panel -->
      {#if compareMode}
        <div class="cmp-panel">
          <div class="cmp-hd">
            <span class="cmp-diamond">◆</span>
            <span class="cmp-title">EMOTION COMPARE</span>
            <span class="cmp-badge ts">TS</span>
            <span class="cmp-vs">vs</span>
            <span class="cmp-badge py">PY</span>
            <span class="cmp-flex"></span>
            <span class="cmp-sub">感情エンジン比較モード</span>
          </div>

          <div class="cmp-input-row">
            <input
              class="cmp-input"
              type="text"
              placeholder="分析するテキストを入力… (Enter で実行)"
              bind:value={compareInput}
              onkeydown={(e) => { if (e.key === 'Enter') runCompare(); }}
            />
            <button
              class="cmp-run-btn"
              onclick={runCompare}
              disabled={compareRunning || !compareInput.trim()}
            >{compareRunning ? '分析中…' : 'ANALYZE'}</button>
          </div>

          {#if compareTestedText}
            <div class="cmp-tested">
              <span class="ct-label">LAST INPUT:</span>
              <span class="ct-text">"{compareTestedText}"</span>
              <span class="ct-trust">TRUST:{personality.trust}</span>
            </div>
          {/if}

          {#if compareError}
            <div class="cmp-error">{compareError}</div>
          {/if}

          <div class="cmp-cols">
            <!-- TypeScript 側 -->
            <div class="cmp-col ts-side">
              <div class="cmp-col-hd">TypeScript <span class="cmp-badge ts sm">TS</span></div>
              {#if tsCompareResult}
                <div class="cmp-emotion" style="--ec: var(--cy)">{tsCompareResult.emotion}</div>
                <div class="cmp-conf">{(tsCompareResult.confidence * 100).toFixed(0)}%</div>
                <div class="cmp-detail">{tsCompareResult.detail}</div>
                <div class="cmp-extra">mood: {mood.toLowerCase()}</div>
              {:else}
                <div class="cmp-empty">— 未実行 —</div>
              {/if}
            </div>

            <!-- Python 側 -->
            <div class="cmp-col py-side">
              <div class="cmp-col-hd">Python <span class="cmp-badge py sm">PY</span></div>
              {#if compareRunning}
                <div class="cmp-empty">分析中…</div>
              {:else if pyCompareResult}
                <div class="cmp-emotion" style="--ec: #a78bfa">{pyCompareResult.emotion}</div>
                <div class="cmp-conf">{(pyCompareResult.confidence * 100).toFixed(0)}%</div>
                <div class="cmp-detail">{pyCompareResult.reason}</div>
                <div
                  class="cmp-delta"
                  class:pos={pyCompareResult.delta_trust >= 0}
                  class:neg={pyCompareResult.delta_trust < 0}
                >Δtrust {pyCompareResult.delta_trust >= 0 ? '+' : ''}{pyCompareResult.delta_trust}</div>
                {#if pyCompareResult.source === 'fallback'}
                  <span class="cmp-fallback">FALLBACK</span>
                {/if}
              {:else}
                <div class="cmp-empty">— 未実行 —</div>
              {/if}
            </div>
          </div>

          {#if tsCompareResult && pyCompareResult}
            <div class="cmp-verdict" class:match={tsCompareResult.emotion === pyCompareResult.emotion}>
              {tsCompareResult.emotion === pyCompareResult.emotion ? '✓ MATCH' : '✗ MISMATCH'}
              <span class="cv-detail">
                {tsCompareResult.emotion === pyCompareResult.emotion
                  ? '両エンジンの結果が一致'
                  : `TS: ${tsCompareResult.emotion} / PY: ${pyCompareResult.emotion}`}
              </span>
            </div>
          {/if}

          <!-- CSV Log Bar -->
          <div class="cmp-log-bar">
            <span class="cmp-log-count">
              LOG <span class="cmp-log-num">{compareLog.length}</span>/10
            </span>
            <button
              class="cmp-log-btn"
              onclick={exportCompareCSV}
              disabled={compareLog.length === 0}
              title="CSV ダウンロード"
            >↓ CSV</button>
            <button
              class="cmp-log-btn cmp-log-clear"
              onclick={() => { compareLog = []; }}
              disabled={compareLog.length === 0}
              title="ログをクリア"
            >CLEAR</button>
          </div>
        </div>
      {/if}

      <!-- Batch Test Panel -->
      {#if batchMode}
        <div class="batch-panel">
          <div class="batch-hd">
            <span class="batch-diamond">◆</span>
            <span class="batch-title">CSV BATCH TEST</span>
            <span class="cmp-badge ts">TS</span>
            <span class="cmp-vs">+</span>
            <span class="cmp-badge py">PY</span>
            <span class="cmp-flex"></span>
            <span class="cmp-sub">text,label CSV · 最大100件</span>
          </div>

          <div class="batch-file-row">
            <label class="batch-file-label">
              <input
                type="file"
                accept=".csv"
                class="batch-file-input"
                disabled={batchRunning}
                onchange={(e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f) runBatchTest(f);
                }}
              />
              {batchRunning ? '処理中…' : 'CSV を選択'}
            </label>
            {#if batchRunning}
              <span class="batch-progress">{batchProgress} / {batchTotal} 処理中…</span>
            {:else if batchResult}
              <span class="batch-done">{batchResult.total} 件完了</span>
            {/if}
          </div>

          {#if batchRunning}
            <div class="batch-prog-bar">
              <div
                class="batch-prog-fill"
                style="width: {batchTotal > 0 ? (batchProgress / batchTotal * 100).toFixed(0) : 0}%"
              ></div>
            </div>
          {/if}

          {#if batchError}
            <div class="cmp-error">{batchError}</div>
          {/if}

          {#if batchResult}
            <div class="batch-stats">
              <div class="batch-stat-item">
                <span class="bsi-label">TS 正答率</span>
                <span class="bsi-val ts">{(batchResult.ts_acc * 100).toFixed(1)}%</span>
              </div>
              <div class="batch-stat-item">
                <span class="bsi-label">PY 正答率</span>
                <span class="bsi-val py">{(batchResult.py_acc * 100).toFixed(1)}%</span>
              </div>
              <div class="batch-stat-item">
                <span class="bsi-label">TS/PY 一致率</span>
                <span class="bsi-val">{(batchResult.agree * 100).toFixed(1)}%</span>
              </div>
              <div class="batch-stat-item">
                <span class="bsi-label">件数</span>
                <span class="bsi-val">{batchResult.total}</span>
              </div>
            </div>

            <div class="batch-label-table">
              <div class="blt-hd">
                <span>ラベル</span><span>件数</span><span>TS</span><span>PY</span>
              </div>
              {#each Object.entries(batchResult.per_label) as [lbl, s]}
                <div class="blt-row">
                  <span class="blt-label">{lbl}</span>
                  <span class="blt-n">{s.n}</span>
                  <span class="blt-acc ts">{(s.ts_ok / s.n * 100).toFixed(0)}%</span>
                  <span class="blt-acc py">{(s.py_ok / s.n * 100).toFixed(0)}%</span>
                </div>
              {/each}
            </div>

            <div class="batch-footer">
              <button
                class="cmp-log-btn"
                onclick={appendBatchToCompareLog}
                title="Compare Log に全行追記"
              >+ Compare Log に追記</button>
              <span class="cmp-sub" style="margin-left:auto">
                TS/PY 一致: {batchResult.rows.filter(r => r.both_match).length} 件
              </span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Best Scene Panel -->
      {#if bestSceneOpen}
        <div class="bs-panel">
          <div class="bs-hd">
            <span class="bs-star">★</span>
            <span class="bs-title">BEST SCENE</span>
            <span class="bs-sub">直近30件 / 上位{bestScenes.length}シーン</span>
            <span class="bs-flex"></span>
            <button class="bs-close-btn" onclick={() => { bestSceneOpen = false; }}>✕</button>
          </div>
          {#if bestScenes.length === 0}
            <div class="bs-empty">スコアリングできるシーンが見つかりませんでした</div>
          {:else}
            {#each bestScenes as scene, i}
              <div class="bs-scene">
                <div class="bs-scene-hd">
                  <span class="bs-rank">★{i + 1}</span>
                  <span class="bs-score-badge">score {scene.score}</span>
                  {#each scene.tags as tag}
                    <span class="bs-tag">{tag}</span>
                  {/each}
                  <span class="bs-flex"></span>
                  <button
                    class="manga-send-btn"
                    class:loading={mangaConverting === scene.aiMsg.time}
                    onclick={() => convertToManga(scene.aiMsg)}
                    disabled={mangaConverting !== null}
                  >{mangaConverting === scene.aiMsg.time ? '⏳ 変換中…' : '⬛ MANGA化'}</button>
                </div>
                <div class="bs-excerpt">
                  <div class="bs-user">👤 {scene.userMsg.text.length > 80 ? scene.userMsg.text.slice(0, 80) + '…' : scene.userMsg.text}</div>
                  <div class="bs-ai">🤖 {scene.aiMsg.text.length > 120 ? scene.aiMsg.text.slice(0, 120) + '…' : scene.aiMsg.text}</div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      {/if}

      <div class="character-registry-panel">
        <div class="ref-section-label">CHARACTER REGISTRY</div>
        <div class="character-register-fields">
          <input class="character-register-input" bind:value={characterRegistrationName} placeholder="キャラクター名" />
          <input class="character-register-input" bind:value={characterRegistrationRole} placeholder="役割（姉、主人公など）" />
          <label class="ref-upload-btn character-register-button" title="画像と入力内容を永続キャラクターとして登録">
            {characterRegistryLoading ? 'LOADING...' : '+ CHARACTER登録'}
            <input
              type="file"
              accept="image/*"
              style="display:none"
              disabled={characterRegistryLoading}
              onchange={handleReferenceImageUpload}
            />
          </label>
        </div>
      </div>

      <!-- Character REF thumbnails -->
      {#if referenceImages.length > 0}
        <div class="ref-section-label">REGISTERED CHARACTERS</div>
        <div class="ref-img-strip">
          {#each referenceImages as ref, i}
            <div class="ref-img-chip registered-character-chip">
	              {#if ref.dataUrl}
	                <img src={ref.dataUrl} alt={ref.name} class="ref-img-thumb" />
	              {/if}
	              <input
                type="text"
                class="ref-img-note"
                placeholder="キャラクター名未設定"
                bind:value={ref.name}
                onblur={() => updateRegisteredCharacter(ref)}
              />
              <input
                type="text"
                class="ref-img-note"
                placeholder="役割"
                bind:value={ref.role}
                onblur={() => updateRegisteredCharacter(ref)}
              />
              <button class="ref-img-remove" onclick={() => removeReferenceImage(i)} title="永続登録を解除">✕</button>
            </div>
          {/each}
        </div>
        <div class="character-analysis-status" class:ready={Boolean(characterBible)}>
          {#if visionScanning}
            Analyzing Character...
          {:else if characterBible}
            Character Analyzed
          {:else}
            Character Analysis Required
          {/if}
        </div>
        <div class="ref-quick-actions">
          <button
            class="yonkoma-btn"
            class:loading={yonkomaGenerating}
            onclick={sendYonkomaPrompt}
            disabled={isThinking}
            title="添付画像のキャラで4コマ漫画YAMLを生成"
          >
            {#if yonkomaGenerating}
              <span class="yonkoma-spin">◌</span> 生成中…
            {:else}
              <span class="yonkoma-icon">▣▣</span> 4コマ生成
            {/if}
          </button>
        </div>
      {/if}

      {#if storyReferences.length > 0}
        <div class="ref-section-label story">STORY REF</div>
        <div class="story-ref-strip">
          {#each storyReferences as ref, i}
            <div class="story-ref-chip" class:active={i === storyReferences.length - 1}>
              <span class="story-ref-kind">{ref.format.toUpperCase()}</span>
              <span class="story-ref-name" title={ref.name}>{ref.name}</span>
              {#if i === storyReferences.length - 1}
                <span class="story-ref-active">ACTIVE</span>
              {:else}
                <button class="story-ref-use" onclick={() => selectStoryReference(i)}>USE</button>
              {/if}
              <button class="ref-img-remove" onclick={() => removeStoryReference(i)} title="削除">✕</button>
            </div>
          {/each}
        </div>
      {/if}

      

      <!-- Input -->
      <div class="chat-input-area">
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <label class="ref-upload-btn story-ref-upload-btn" title="4コマまたはストーリー形式のYAMLをStory REFとして登録">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 3h9l3 3v15H6z" stroke="currentColor" stroke-width="1.5"/>
            <path d="M15 3v4h4M9 12h6M9 16h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          STORY REF
          <input
            type="file"
            accept=".yaml,.yml,application/yaml,text/yaml,text/x-yaml"
            multiple
            style="display:none"
            onchange={handleStoryReferenceUpload}
          />
        </label>
        <button
          class="vision-btn"
          onclick={() => analyzeReferencesForCharacterBible([...referenceImages])}
          disabled={visionScanning || (referenceImages.length === 0 && !wantsImageMemoryReference(inputText))}
        >
          {#if visionScanning}
            SCANNING...
          {:else}
            REANALYZE
          {/if}
        </button>
        <textarea
          class="chat-input"
          placeholder="メッセージを入力... (Enter で送信)"
          bind:value={inputText}
          onkeydown={handleKeydown}
          onfocus={onChatFocus}
          onblur={onChatBlur}
          rows="2"
        ></textarea>
        <button
          class="reset-chat-btn"
          onclick={resetChat}
          disabled={isThinking}
          title="会話履歴をリセット"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 3v5h5"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          RESET
        </button>
        <button
          class="send-btn"
          onclick={sendMessage}
          disabled={isThinking || !inputText.trim()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          SEND
        </button>
      </div>
    </section>

  {#if layoutMode === '3col'}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="resize-bar" onmousedown={(e) => startResize('right', e)} aria-hidden="true"></div>

    <!-- ===== RIGHT: Character Viewer + Controls ===== -->
    <section
        class="panel right-panel"
        style="width:{rightWidth}px; min-width:80px;"
      >

      <!-- 1. CHARACTER VIEWER -->
      <div class="panel-hd">
        <span class="ph-diamond">◆</span>
        <span class="ph-text">CHARACTER VIEWER</span>
        <span class="ph-line"></span>
        <span class="ph-id">UNIT-VIEW</span>
      </div>

      <div class="char-viewer">
        <div class="cv-avatar-wrap" class:glow-active={avatarEffects.glowPulse}>
          <div
            class="cv-avatar-ring"
            style="animation-play-state: {avatarEffects.rotate ? 'running' : 'paused'}"
          >
            <div class="avatar-inner">
              <img
                src={selectedAvatar}
                alt={charName}
                class="av-img"
                onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }}
              />
              <div class="scan-line"></div>
            </div>
          </div>
        </div>
        <div class="av-name-row">
          {#if editingName}
            <input
              class="av-name-input"
              type="text"
              bind:value={charName}
              onblur={() => { editingName = false; }}
              onkeydown={(e) => { if (e.key === 'Enter') editingName = false; }}
            />
          {:else}
            <button class="av-name cv-name-large" onclick={() => { editingName = true; }}>{charName}</button>
          {/if}
        </div>
        <div class="av-mode">{charMode}</div>
        <div class="cv-speaking" class:active={isThinking}>
          {#if isThinking}
            <span class="dot-bounce"></span>
            <span class="dot-bounce" style="animation-delay:0.18s"></span>
            <span class="dot-bounce" style="animation-delay:0.36s"></span>
            <span class="cv-speak-label">Speaking...</span>
          {:else}
            <span class="cv-standby">◉ STANDBY</span>
          {/if}
        </div>
        <div class="cv-voice-wrap">
          <div class="cv-voice-label">VOICE OUTPUT</div>
          <div class="cv-voice-track">
            <div class="cv-voice-fill" class:speaking={isThinking}></div>
          </div>
        </div>
      </div>

      <!-- 2. CHARACTER SELECT -->
      <div class="panel-hd cv-sub-hd">
        <span class="ph-diamond">◆</span>
        <span class="ph-text">CHARACTER CORE</span>
        <span class="ph-line"></span>
        <span class="ph-id">CH-001</span>
      </div>

      <div class="av-selector">
        <div class="section-lbl">CHARACTER SELECT</div>
        <div class="av-grid">
          {#each AVATARS as av}
            <button
              class="av-thumb"
              class:active={selectedAvatar === av.file}
              onclick={() => selectAvatar(av.file, av.name, av.presetId)}
              title={av.name}
            >
              <img
                src={av.file}
                alt={av.name}
                onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }}
              />
              <span>{av.name}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="av-effects">
        <div class="section-lbl">AVATAR EFFECTS</div>
        <div class="toggle-list">
          <label class="toggle-item">
            <input type="checkbox" class="toggle-cb" bind:checked={avatarEffects.rotate} />
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
            <span class="toggle-lbl">Rotate ON</span>
          </label>
          <label class="toggle-item">
            <input type="checkbox" class="toggle-cb" bind:checked={avatarEffects.glowPulse} />
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
            <span class="toggle-lbl">Glow Pulse ON</span>
          </label>
        </div>
      </div>

      <!-- 3. PERSONA PRESETS + CUSTOM PERSONA EDITOR + SAVE SLOTS -->
      <div class="ctrl-section">
        <div class="section-lbl">PERSONA PRESETS</div>
        <div class="preset-grid" style="display:none">
          {#each PRESET_LIST as p}
            <button
              class="preset-btn"
              class:active={activePreset === p.id}
              style="--pc:{p.color}"
              onclick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          {/each}
        </div>

        {#if activePreset !== 'custom'}
          <button class="cp-dup-btn cp-dup-standalone" onclick={duplicateToCustom}>
            ◈ DUPLICATE CURRENT → CUSTOM
          </button>
        {/if}

        <button class="cp-toggle-btn" onclick={() => { showPersonaInlineEditor = !showPersonaInlineEditor; }}>
          {showPersonaInlineEditor ? '詳細編集を非表示' : '詳細編集を表示'}
        </button>

        <!-- Persona Editor: 通常は折りたたみ / 詳細編集時のみ表示 -->
        {#if showPersonaInlineEditor}
        <div class="custom-profile-section" id="persona-editor">
          <div class="cp-editor-hd">
            {activePreset === 'custom' ? '◈ CUSTOM PERSONA EDITOR' : '◈ CURRENT PERSONA'}
          </div>
          <div class="cp-fields">
            <div class="cp-row">
              <span class="cp-lbl">NAME</span>
              <input
                class="cp-input"
                type="text"
                placeholder="キャラクター名"
                bind:value={customProfile.name}
                oninput={saveCustomProfile}
                disabled={activePreset !== 'custom'}
              />
            </div>
            <div class="cp-row">
              <span class="cp-lbl">一人称</span>
              <input
                class="cp-input"
                type="text"
                placeholder="一人称を入力"
                bind:value={customProfile.firstPerson}
                oninput={saveCustomProfile}
              />
            </div>
            <div class="cp-row">
              <span class="cp-lbl">二人称</span>
              <input
                class="cp-input"
                type="text"
                placeholder="二人称を入力"
                bind:value={customProfile.secondPerson}
                oninput={saveCustomProfile}
              />
            </div>
            <div class="cp-row">
              <span class="cp-lbl">他人</span>
              <input
                class="cp-input"
                type="text"
                placeholder="他人の呼び方を入力"
                bind:value={customProfile.thirdPerson}
                oninput={saveCustomProfile}
              />
            </div>
            <div class="cp-row">
              <span class="cp-lbl">口調</span>
              <textarea
                class="cp-input cp-textarea"
                placeholder="話し方・性格の説明"
                bind:value={customProfile.speechStyle}
                oninput={saveCustomProfile}
                disabled={activePreset !== 'custom'}
              ></textarea>
            </div>
            <div class="cp-row">
              <span class="cp-lbl">口癖</span>
              <input
                class="cp-input"
                type="text"
                placeholder="よく使う表現・口癖"
                bind:value={customProfile.habits}
                oninput={saveCustomProfile}
                disabled={activePreset !== 'custom'}
              />
            </div>
            <div class="cp-row">
              <span class="cp-lbl">語尾</span>
              <input
                class="cp-input"
                type="text"
                placeholder="語尾の特徴"
                bind:value={customProfile.sentenceEnding}
                oninput={saveCustomProfile}
                disabled={activePreset !== 'custom'}
              />
            </div>
            <div class="cp-row">
              <span class="cp-lbl">怒り方</span>
              <input
                class="cp-input"
                type="text"
                placeholder="怒った時の言い方"
                bind:value={customProfile.angerStyle}
                oninput={saveCustomProfile}
                disabled={activePreset !== 'custom'}
              />
            </div>
            <div class="cp-row">
              <span class="cp-lbl">甘い時</span>
              <input
                class="cp-input"
                type="text"
                placeholder="好意・愛情表現"
                bind:value={customProfile.affectionStyle}
                oninput={saveCustomProfile}
                disabled={activePreset !== 'custom'}
              />
            </div>
            <div class="cp-row">
              <span class="cp-lbl">嫉妬時</span>
              <input
                class="cp-input"
                type="text"
                placeholder="嫉妬した時の言い方"
                bind:value={customProfile.jealousyStyle}
                oninput={saveCustomProfile}
                disabled={activePreset !== 'custom'}
              />
            </div>
            <div class="cp-row">
              <span class="cp-lbl">メモ</span>
              <textarea
                class="cp-input cp-textarea"
                placeholder="その他の性格・設定メモ"
                bind:value={customProfile.memo}
                oninput={saveCustomProfile}
                disabled={activePreset !== 'custom'}
              ></textarea>
            </div>
          </div>

          {#if activePreset === 'custom'}
            <!-- Save Slots: Custom モード時のみ表示 -->
            <div class="cp-slots">
              <div class="cp-slots-hd">SAVE SLOTS</div>
              {#each (['a', 'b', 'c'] as const) as k}
                <div class="cp-slot-row">
                  <span class="cp-slot-label">SLOT {k.toUpperCase()}</span>
                  <span class="cp-slot-name">{customSlots[k]?.name || '— empty —'}</span>
                  <button class="cp-slot-btn cp-save" onclick={() => saveSlot(k)}>SAVE</button>
                  <button class="cp-slot-btn cp-load" onclick={() => loadSlot(k)} disabled={!customSlots[k]}>LOAD</button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        {/if}
      </div>

      <!-- 5. PARAMETER MATRIX -->
      <div class="ctrl-section sliders-section">
        <div class="section-lbl">PARAMETER MATRIX</div>
        {#each SLIDERS as s}
          <div
            class="slider-row"
            role="group"
            onmouseenter={() => { tooltipKey = s.key; }}
            onmouseleave={() => { tooltipKey = null; }}
          >
            <div class="slider-label-group">
              <span class="slider-lbl" style="color:{s.color}">{s.label}</span>
              <span class="slider-sub">{s.sub}</span>
            </div>
            <div class="slider-track-outer">
              <input
                type="range" min="0" max="100"
                class="cyber-slider"
                style="--sc:{s.color}; --pct:{personality[s.key]}%"
                bind:value={personality[s.key]}
                oninput={() => { activePreset = 'custom'; }}
              />
            </div>
            <span class="slider-val" style="color:{s.color}; text-shadow: 0 0 8px {s.color}60">
              {personality[s.key]}
            </span>
            {#if tooltipKey === s.key}
              <div class="slider-tooltip">
                <span class="tt-key">{s.label}</span>
                <span class="tt-sep">—</span>
                <span class="tt-desc">{s.desc}</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- 6. BEHAVIOR FLAGS -->
      <div class="ctrl-section">
        <div class="section-lbl">BEHAVIOR FLAGS</div>
        <div class="toggle-list">
          {#each TOGGLE_LIST as item}
            <label class="toggle-item">
              <input
                type="checkbox"
                class="toggle-cb"
                bind:checked={toggles[item.key]}
                onchange={(event) => {
                  if (item.key === 'nightMode') {
                    localStorage.setItem(LS_NIGHT_MODE, String(event.currentTarget.checked));
                  }
                }}
              />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
              <span class="toggle-lbl">{item.label}</span>
            </label>
          {/each}
        </div>
      </div>

      <div class="ctrl-section">
        <div class="section-lbl">QUICK ACTIONS</div>
        <button class="studio-btn" onclick={() => window.open('/project', '_blank')}>
          ◼ Open Project
        </button>
      </div>

      <div class="av-effects router-state-block">
        <div class="section-lbl">ROUTER STATE</div>
        <div class="router-state-grid">
          <div class="router-state-section-title">ROUTER STATE</div>
          <div class="router-state-row">
            <span class="router-state-label">Intent</span>
            <span class="router-state-value intent">{($routerStateStore?.intent ?? 'chat')}</span>
          </div>
          <div class="router-state-row">
            <span class="router-state-label">Subtype</span>
            <span class="router-state-value">{($routerStateStore?.subtype ?? '-')}</span>
          </div>
          <div class="router-state-row">
            <span class="router-state-label">Action</span>
            <span class="router-state-value">{($routerStateStore?.action ?? '-')}</span>
          </div>
          <div class="router-state-row">
            <span class="router-state-label">generate_image</span>
            <span class="router-state-value">{String($routerStateStore?.generate_image ?? false)}</span>
          </div>
          <div class="router-state-row">
            <span class="router-state-label">generate_yaml</span>
            <span class="router-state-value">{String($routerStateStore?.generate_yaml ?? false)}</span>
          </div>
          <div class="router-state-row">
            <span class="router-state-label">generate_manga</span>
            <span class="router-state-value">{String($routerStateStore?.generate_manga ?? false)}</span>
          </div>
          <div class="router-state-row">
            <span class="router-state-label">Confidence</span>
            <span class="router-state-value confidence-{routerConfidenceTone($routerStateStore?.confidence)}">{Math.round(($routerStateStore?.confidence ?? 0) * 100) / 100}</span>
          </div>
          <div class="router-state-row">
            <span class="router-state-label">Source</span>
            <span class="router-state-value source-{($routerStateStore?.source ?? 'unknown')}">{($routerStateStore?.source ?? '-')}</span>
          </div>
          <div class="router-state-reason">
            <span class="router-state-label">Reason</span>
            <span>{($routerStateStore?.reason ?? '送信後に更新されます')}</span>
          </div>
          <div class="router-state-divider"></div>
          <div class="router-state-section-title">MODEL ROUTING</div>
          <div class="router-state-row">
            <span class="router-state-label">MEDIA_PROVIDER</span>
            <span class="router-state-value">{imageProviderLabel(labImageApiProvider)}</span>
          </div>
          <div class="router-state-row">
            <span class="router-state-label">MEDIA_MODEL</span>
            <span class="router-state-value">{labImageModelConfig.label}</span>
          </div>
          <div class="router-state-row">
            <span class="router-state-label">Generation Mode</span>
            <span class="router-state-value">{labGenerationMode}</span>
          </div>
          <div class="router-state-divider"></div>
          <div class="router-state-section-title">LAST ACTION</div>
          <div class="router-state-row">
            <span class="router-state-label">Action</span>
            <span class="router-state-value">{lastRouterAction}</span>
          </div>
          <div class="router-state-row">
            <span class="router-state-label">Timestamp</span>
            <span class="router-state-value">{lastRouterActionAt}</span>
          </div>
          {#if yamlImagePlan}
            <div class="router-state-divider"></div>
            <div class="router-state-section-title">YAML_IMAGE_PLAN</div>
            <div class="router-state-row">
              <span class="router-state-label">Panel</span>
              <span class="router-state-value">{yamlImagePlan.panel}</span>
            </div>
            <div class="router-state-row">
              <span class="router-state-label">Chars</span>
              <span class="router-state-value">{yamlImagePlan.chars.length > 0 ? yamlImagePlan.chars.join(' / ') : '-'}</span>
            </div>
            <div class="router-state-row">
              <span class="router-state-label">Pose</span>
              <span class="router-state-value">{yamlImagePlan.pose || '-'}</span>
            </div>
            <div class="router-state-row">
              <span class="router-state-label">Line</span>
              <span class="router-state-value">{yamlImagePlan.line || '-'}</span>
            </div>
            <div class="router-state-row">
              <span class="router-state-label">Scene</span>
              <span class="router-state-value">{yamlImagePlan.scene || '-'}</span>
            </div>
            <div class="router-state-row">
              <span class="router-state-label">Model</span>
              <span class="router-state-value">{yamlImagePlan.model}</span>
            </div>
          {/if}
          <div class="router-state-divider"></div>
          <div class="router-state-section-title">MEMORY</div>
          <div class="router-state-row">
            <span class="router-state-label">Memory</span>
            <span class="router-state-value router-state-muted">future reserved</span>
          </div>
          <div class="router-state-section-title">Emotion</div>
          <div class="router-state-row">
            <span class="router-state-label">Emotion</span>
            <span class="router-state-value router-state-muted">future reserved</span>
          </div>
        </div>
      </div>

      <div class="av-effects ai-cfg-block">
        <div class="section-lbl">IMAGE GENERATION</div>
        <div class="vc-rows">
          <div class="vc-row">
            <span class="vc-lbl vc-lbl-wide">Generation Mode</span>
            <select class="vc-select" bind:value={labGenerationMode} disabled title="Gemini Router結果から自動決定">
              {#each LAB_GENERATION_MODES as mode}
                <option value={mode.id}>{mode.label}</option>
              {/each}
            </select>
          </div>
          <div class="vc-row">
            <span class="vc-lbl vc-lbl-wide">MEDIA_PROVIDER</span>
            <span class="vc-note vc-current">{LAB_IMAGE_PROVIDERS.find((provider) => provider.id === labImageProvider)?.label ?? labImageProvider}</span>
          </div>
          <div class="vc-row">
            <span class="vc-lbl vc-lbl-wide">MEDIA_MODEL</span>
            <span class="vc-note vc-current">{labImageModelConfig.label}</span>
          </div>
          <div class="vc-row">
            <span class="vc-lbl vc-lbl-wide">Reference Image Count</span>
            <span class="vc-note vc-current" class:vc-warn={labGenerationNeedsImage && referenceImages.length === 0}>
              {referenceImages.length}
              {#if labGenerationNeedsImage && referenceImages.length === 0}
                · required
              {/if}
            </span>
          </div>
          <div class="vc-row">
            <span class="vc-lbl vc-lbl-wide">Provider</span>
            <select
              class="vc-select"
              value={labImageProvider}
              onchange={(e) => setLabImageProvider((e.currentTarget as HTMLSelectElement).value as LabImageProvider)}
            >
              {#each LAB_IMAGE_PROVIDERS as provider}
                <option value={provider.id}>{provider.label}</option>
              {/each}
            </select>
          </div>
          <div class="vc-row">
            <span class="vc-lbl vc-lbl-wide">Model</span>
            <select class="vc-select" bind:value={labImageModel}>
              {#each imageModelsForProvider(labImageProvider) as model}
                <option value={model.id}>{model.label}</option>
              {/each}
            </select>
          </div>
        </div>
      </div>

      <!-- 7. VOICE CONFIG -->
      <div class="av-effects voice-cfg-block">
        <div class="section-lbl">VOICE CONFIG</div>
        <div class="vc-rows">
          <div class="vc-row">
            <span class="vc-lbl">ENGINE</span>
            <select class="vc-select" bind:value={voiceEngine}>
              <option value="none">NONE</option>
              <option value="voicevox">VOICEVOX</option>
              <option value="irodori-tts">IRODORI TTS</option>
              <option value="colab-tts">COLAB TTS</option>
              <option value="elevenlabs">ELEVENLABS</option>
            </select>
          </div>
          {#if voiceEngine === 'voicevox'}
            <div class="vc-row">
              <span class="vc-lbl">SPEAKER ID</span>
              <input type="number" class="vc-input" bind:value={speakerId} min="0" max="999" />
            </div>
          {/if}
          {#if voiceEngine === 'irodori-tts' || voiceEngine === 'colab-tts'}
            <div class="vc-row">
              <span class="vc-lbl">VOICE</span>
              <select class="vc-select" bind:value={voice}>
                {#each COLAB_TTS_VOICE_OPTIONS as option}
                  <option value={option}>{option}</option>
                {/each}
              </select>
            </div>
          {/if}
          {#if voiceEngine === 'elevenlabs'}
            <div class="vc-row">
              <span class="vc-lbl">VOICE ID</span>
              <input type="text" class="vc-input" bind:value={voiceId} placeholder="voice id…" />
            </div>
          {/if}
        </div>
      </div>

      <!-- 8. AI CONFIG -->
      <div class="av-effects ai-cfg-block">
        <div class="section-lbl">AI CONFIG</div>
        <div class="vc-rows">
          <div class="vc-row">
            <span class="vc-lbl">PROVIDER</span>
            <select
              class="vc-select"
              value={$sessionStore.provider}
              onchange={(e) => sessionStore.setProvider((e.currentTarget as HTMLSelectElement).value as AIProvider)}
            >
              {#each PROVIDER_OPTIONS as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
          <div class="vc-row">
            <span class="vc-lbl">MODEL</span>
            <select
              class="vc-select"
              value={$sessionStore.model}
              onchange={(e) => sessionStore.setModel((e.currentTarget as HTMLSelectElement).value)}
              disabled={$sessionStore.provider === 'colab-ollama' && colabOllamaModelsLoading}
            >
              {#if $sessionStore.provider === 'colab-ollama' && colabOllamaModelsLoading}
                <option value="">Loading Colab models...</option>
              {:else if $sessionStore.provider === 'colab-ollama' && modelOptionsFor($sessionStore.provider).length === 0}
                <option value="">COLAB_OLLAMA_MODEL fallback</option>
              {/if}
              {#each modelOptionsFor($sessionStore.provider) as m}
                <option value={m}>{m}</option>
              {/each}
            </select>
          </div>
          {#if $sessionStore.provider === 'colab-ollama' && colabOllamaModelsError}
            <div class="vc-row">
              <span class="vc-lbl">COLAB</span>
              <button class="api-check-btn" onclick={() => void loadColabOllamaModels(true)}>
                Retry model load
              </button>
            </div>
          {/if}
        </div>
        <button class="api-check-btn" onclick={checkAPIStatus} disabled={checkingAPI}>
          {checkingAPI ? 'Checking…' : 'Check API Status'}
        </button>
        {#if apiStatuses.openai !== '---' || checkingAPI}
          <div class="api-status-list">
            <div class="api-status-row">
              <span class="api-status-name">OpenAI</span>
              <span class="api-status-val" style="color:{statusColor(apiStatuses.openai)}">{apiStatuses.openai}</span>
            </div>
            <div class="api-status-row">
              <span class="api-status-name">Gemini</span>
              <span class="api-status-val" style="color:{statusColor(apiStatuses.gemini)}">{apiStatuses.gemini}</span>
            </div>
            <div class="api-status-row">
              <span class="api-status-name">Claude</span>
              <span class="api-status-val" style="color:{statusColor(apiStatuses.claude)}">{apiStatuses.claude}</span>
            </div>
          </div>
        {/if}
      </div>

      <!-- 9. STATS / LOG / MEMORY / RADAR (補助情報) -->
      <div class="char-stats">
        <div class="stat-row mood-row">
          <span class="stat-lbl">Mood</span>
          <span class="mood-val" style="color:{moodColor}; text-shadow: 0 0 10px {moodColor}60">{mood}</span>
          <span class="stat-num">{emotion.mood}</span>
        </div>
        <div class="stat-row">
          <span class="stat-lbl">Battery</span>
          <div class="bar-wrap"><div class="bar battery-bar" style="width:{battery}%"></div></div>
          <span class="stat-num">{battery}%</span>
        </div>
      </div>

      <!-- EMOTION FEEDBACK -->
      <div class="ef-section">
        <div class="ef-header">
          <span class="ef-diamond">◆</span>
          <span class="ef-title">EMOTION FEEDBACK</span>
          <span class="ef-spacer"></span>
          {#if emotionFeedbackRunning}
            <span class="ef-analyzing">ANALYZING…</span>
          {/if}
          <button
            class="ef-toggle-btn"
            class:active={emotionFeedbackEnabled}
            onclick={toggleEmotionFeedback}
            title="AI応答からリアルタイムで感情パラメータを自動更新"
          >{emotionFeedbackEnabled ? 'ON' : 'OFF'}</button>
        </div>
        {#if emotionFeedbackEnabled}
          {#if emotionFeedbackLog.length === 0}
            <p class="ef-empty">— 次のAI応答後に記録されます —</p>
          {:else}
            <div class="ef-log">
              {#each emotionFeedbackLog.slice(0, 10) as entry (entry.timestamp)}
                <div class="ef-entry">
                  <div class="ef-entry-top">
                    <span class="ef-detected">{entry.detected}</span>
                    <span class="ef-conf">{(entry.confidence * 100).toFixed(0)}%</span>
                    <span
                      class="ef-dt"
                      class:pos={entry.delta_trust > 0}
                      class:neg={entry.delta_trust < 0}
                    >Δtrust {entry.delta_trust > 0 ? '+' : ''}{entry.delta_trust}</span>
                    {#if entry.source === 'fallback'}
                      <span class="ef-fallback">OFFLINE</span>
                    {/if}
                    <span class="ef-ts">{new Date(entry.timestamp).toLocaleTimeString('ja-JP', { hour12: false })}</span>
                  </div>
                  <div class="ef-snippet">"{entry.textSnippet}"</div>
                  {#if Object.keys(entry.applied).length > 0}
                    <div class="ef-applied">
                      {#each Object.entries(entry.applied) as [k, v]}
                        <span class="ef-chip" class:pos={v > 0} class:neg={v < 0}>
                          {k} {v > 0 ? '+' : ''}{v}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
            <div class="ef-footer">
              <span class="ef-count">{emotionFeedbackLog.length} ENTRIES · {activePreset}</span>
              <button
                class="ef-clear-btn"
                onclick={() => { emotionFeedbackLog = []; saveEmotionFeedbackLog(); }}
              >CLEAR</button>
            </div>
          {/if}
        {/if}
      </div>

      <div class="char-log">
        <div class="log-title">SYSTEM LOG</div>
        <div class="log-entry"><span class="ld ok"></span>Emotion Core Stable</div>
        <div class="log-entry"><span class="ld ok"></span>Voice Link Active</div>
        <div class="log-entry">
          <span class="ld {memorySyncOk ? 'ok' : 'warn'}"></span>
          Memory Sync {memorySyncOk ? 'Ready' : 'Pending'}
        </div>
        <div class="log-entry">
          <span class="ld {toggles.androidMode ? 'ok' : 'off'}"></span>
          Android Mode {toggles.androidMode ? 'ACTIVE' : 'STANDBY'}
        </div>
      </div>

      <div class="panel-hd cv-sub-hd">
        <span class="ph-diamond">◆</span>
        <span class="ph-text">PERSONALITY CONTROL</span>
        <span class="ph-line"></span>
        <span class="ph-id">PARAM-MATRIX</span>
      </div>

      <div class="lm-block">
        <div class="lm-header">
          <span class="lm-label">◈ LONG MEMORY</span>
          <button
            class="lm-update-btn"
            onclick={updateLongMemory}
            disabled={isMemoryUpdating}
            title="記憶を今すぐ更新"
          >{isMemoryUpdating ? 'UPDATING…' : 'UPDATE'}</button>
        </div>
        {#if longMemory}
          <pre class="lm-text">{longMemory}</pre>
        {:else}
          <p class="lm-empty">— 記憶なし（5回会話後に自動生成）—</p>
        {/if}
      </div>

      <div class="memory-viewer-block">
        <div class="mv-tabs">
          <button
            class="mv-tab active"
            onclick={loadMemoryViewer}
            disabled={memoryViewerLoading}
          >MEMORY</button>
          <span class="mv-count">{memoryViewerItems.length}</span>
        </div>

        <div class="mv-search-row">
          <input
            class="mv-search"
            type="search"
            bind:value={memoryViewerQuery}
            placeholder="SEARCH CONTENT / TAGS"
          />
          <button
            class="mv-refresh"
            onclick={loadMemoryViewer}
            disabled={memoryViewerLoading}
            title="記憶一覧を再読み込み"
          >{memoryViewerLoading ? '...' : '↻'}</button>
        </div>

        {#if memoryViewerError}
          <p class="mv-empty">{memoryViewerError}</p>
        {:else if memoryViewerLoading && memoryViewerItems.length === 0}
          <p class="mv-empty">LOADING MEMORY...</p>
        {:else if getFilteredMemoryViewerItems().length === 0}
          <p class="mv-empty">— MEMORY EMPTY —</p>
        {:else}
          <div class="mv-list">
            {#each getFilteredMemoryViewerItems() as memory (memory.id)}
              <div class="mv-entry">
                <div class="mv-entry-top">
                  <span class="mv-importance">IMP {memory.importance}</span>
                  <span class="mv-date">{formatMemoryDate(memory.createdAt)}</span>
                </div>
                <div class="mv-content">{memory.content}</div>
                {#if memory.tags.length > 0}
                  <div class="mv-tags">
                    {#each memory.tags as tag}
                      <span class="mv-tag">#{tag}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="cognitive-monitor-block">
        <div class="cm-header">
          <span class="cm-tab active">COGNITIVE MONITOR</span>
          <span class="cm-sub">LAST RESPONSE</span>
        </div>

        <div class="cm-grid">
          <div class="cm-cell">
            <span class="cm-label">Emotion Label</span>
            <span class="cm-value">{cognitiveMonitor.emotionLabel}</span>
          </div>
          <div class="cm-cell">
            <span class="cm-label">Trust Delta</span>
            <span class:pos={cognitiveMonitor.trustDelta > 0} class:neg={cognitiveMonitor.trustDelta < 0} class="cm-value">
              {formatDelta(cognitiveMonitor.trustDelta)}
            </span>
          </div>
          <div class="cm-cell">
            <span class="cm-label">Affection Delta</span>
            <span class:pos={cognitiveMonitor.affectionDelta > 0} class:neg={cognitiveMonitor.affectionDelta < 0} class="cm-value">
              {formatDelta(cognitiveMonitor.affectionDelta)}
            </span>
          </div>
        </div>

        <div class="cm-section">
          <div class="cm-section-label">Retrieved Memories</div>
          {#if cognitiveMonitor.retrievedMemories.length === 0}
            <p class="cm-empty">— NO RETRIEVED MEMORY —</p>
          {:else}
            <div class="cm-memory-list">
              {#each cognitiveMonitor.retrievedMemories as memory (memory.id)}
                <div class="cm-memory-entry">
                  <span class="cm-memory-imp">IMP {memory.importance}</span>
                  <span class="cm-memory-text">{memory.content}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="cm-section">
          <div class="cm-section-label">Reflection Note</div>
          <p class="cm-note">{cognitiveMonitor.reflectionNote}</p>
        </div>
      </div>

      <div class="reflection-diary-block">
        <div class="rd-header">
          <span class="rd-tab active">REFLECTION DIARY</span>
          <button
            class="rd-refresh"
            onclick={loadReflectionDiary}
            disabled={reflectionDiaryLoading}
            title="最新の日記を再読み込み"
          >{reflectionDiaryLoading ? '...' : '↻'}</button>
        </div>

        {#if reflectionDiaryError}
          <p class="rd-empty">{reflectionDiaryError}</p>
        {:else if reflectionDiaryLoading && !reflectionDiary}
          <p class="rd-empty">LOADING DIARY...</p>
        {:else if !reflectionDiary}
          <p class="rd-empty">— REFLECTION EMPTY —</p>
        {:else}
          <div class="rd-date">{reflectionDiary.date}</div>
          <div class="rd-section">
            <span class="rd-label">Summary</span>
            <p class="rd-text">{reflectionDiary.diary.summary}</p>
          </div>
          <div class="rd-section">
            <span class="rd-label">Learned</span>
            {#if reflectionDiary.diary.learned.length === 0}
              <p class="rd-text muted">—</p>
            {:else}
              <div class="rd-learned-list">
                {#each reflectionDiary.diary.learned as item}
                  <span class="rd-learned">{item}</span>
                {/each}
              </div>
            {/if}
          </div>
          <div class="rd-metrics">
            <div class="rd-metric">
              <span class="rd-label">Emotion</span>
              <span class="rd-value">{reflectionDiary.diary.emotion}</span>
            </div>
            <div class="rd-metric">
              <span class="rd-label">Trust Δ</span>
              <span class:pos={reflectionDiary.diary.trust_delta > 0} class:neg={reflectionDiary.diary.trust_delta < 0} class="rd-value">
                {formatDelta(reflectionDiary.diary.trust_delta)}
              </span>
            </div>
            <div class="rd-metric">
              <span class="rd-label">Affection Δ</span>
              <span class:pos={reflectionDiary.diary.affection_delta > 0} class:neg={reflectionDiary.diary.affection_delta < 0} class="rd-value">
                {formatDelta(reflectionDiary.diary.affection_delta)}
              </span>
            </div>
          </div>
          <div class="rd-section">
            <span class="rd-label">Note</span>
            <p class="rd-note">{reflectionDiary.diary.note}</p>
          </div>
        {/if}
      </div>

      <div class="personality-evolution-block">
        <div class="pe-header">
          <span class="pe-tab active">PERSONALITY EVOLUTION</span>
          <button
            class="pe-refresh"
            onclick={loadPersonalityEvolution}
            disabled={personalityEvolutionLoading}
            title="人格進化データを再読み込み"
          >{personalityEvolutionLoading ? '...' : '↻'}</button>
        </div>

        {#if personalityEvolutionError}
          <p class="pe-empty">{personalityEvolutionError}</p>
        {:else if personalityEvolutionLoading && !personalityEvolution}
          <p class="pe-empty">LOADING EVOLUTION...</p>
        {:else if !personalityEvolution}
          <p class="pe-empty">— EVOLUTION EMPTY —</p>
        {:else}
          <div class="pe-list">
            {#each evolutionKeys as key}
              <div class="pe-row">
                <span class="pe-name">{key}</span>
                <div class="pe-bar-track">
                  <div class="pe-bar-fill" style="width:{personalityEvolution[key]}%"></div>
                </div>
                <span class="pe-value">{personalityEvolution[key]}</span>
                <span
                  class:pos={personalityEvolution.lastDelta[key] > 0}
                  class:neg={personalityEvolution.lastDelta[key] < 0}
                  class="pe-arrow"
                >{evolutionArrow(personalityEvolution.lastDelta[key])}</span>
              </div>
            {/each}
          </div>
          <div class="pe-updated">{formatMemoryDate(personalityEvolution.updatedAt)}</div>
        {/if}
      </div>

      <div class="radar-wrap">
        <svg viewBox="0 0 250 250" class="radar-svg" aria-label="Personality radar chart">
          {#each [0.25, 0.5, 0.75, 1.0] as frac}
            <polygon points={gridRing(frac)} fill="none" stroke="rgba(0,229,255,0.08)"
              stroke-width={frac === 1.0 ? 1.2 : 0.9} />
          {/each}
          {#each RADAR_KEYS as _, i}
            {@const end = pt(i, 1)}
            <line x1={CX} y1={CY} x2={end.x} y2={end.y}
              stroke="rgba(0,229,255,0.12)" stroke-width="0.9" />
          {/each}
          <polygon points={radarPolygon} fill="rgba(0,229,255,0.09)"
            stroke="rgba(0,229,255,0.65)" stroke-width="1.8"
            style="filter: drop-shadow(0 0 5px rgba(0,229,255,0.45))" />
          {#each RADAR_KEYS as k, i}
            {@const p = pt(i, personality[k] / 100)}
            <circle cx={p.x} cy={p.y} r="4" fill={RADAR_COLORS[i]}
              stroke="rgba(0,0,20,0.8)" stroke-width="1.2"
              style="filter: drop-shadow(0 0 5px {RADAR_COLORS[i]})" />
          {/each}
          {#each RADAR_LABELS as label, i}
            {@const lp = labelPt(i)}
            <text x={lp.x} y={lp.y} text-anchor="middle" dominant-baseline="central"
              font-size="11.5" font-family="Consolas, monospace" fill={RADAR_COLORS[i]}
              style="filter: drop-shadow(0 0 3px {RADAR_COLORS[i]}70)"
              letter-spacing="0.5">{label}</text>
          {/each}
          <circle cx={CX} cy={CY} r="3" fill="rgba(0,229,255,0.45)"/>
        </svg>
      </div>

      <!-- DEBUG PANEL -->
      <div class="dbg-panel">
        <button class="dbg-toggle" onclick={() => debugOpen = !debugOpen}>
          <span>◈ DEBUG</span>
          <span class="dbg-chevron">{debugOpen ? '▲' : '▼'}</span>
        </button>
        {#if debugOpen}
          <div class="dbg-body">
            <div class="dbg-row">
              <span class="dbg-lbl">CHAR</span>
              <span class="dbg-val">{charName}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">一人称</span>
              <span class="dbg-val">{customProfile.firstPerson  || '—'}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">二人称</span>
              <span class="dbg-val">{customProfile.secondPerson || '—'}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">性格</span>
              <span class="dbg-val">{activePreset}{CHARACTER_PROFILES[activePreset]?.style ? ' / ' + CHARACTER_PROFILES[activePreset].style : ''}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">EMOTION</span>
              <span class="dbg-val dbg-em">mood:{emotion.mood} trust:{emotion.trust} affc:{emotion.affection} focus:{emotion.focus} anger:{emotion.anger} jeals:{emotion.jealousy}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">TIME</span>
              <span class="dbg-val">{currentTimeBucket}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">PROMPT</span>
              <span class="dbg-val dbg-prompt">{lastSystemPrompt ? lastSystemPrompt.slice(0, 300) + (lastSystemPrompt.length > 300 ? '…' : '') : '— 未送信 —'}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">MODEL</span>
              <span class="dbg-val">{$sessionStore.provider}{$sessionStore.model ? ' / ' + $sessionStore.model : ''}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">RESPONDED AS</span>
              <span class="dbg-val {lastUsedProvider ? 'dbg-hi' : ''}">{lastUsedProvider ? lastUsedProvider + (lastUsedModel ? ' / ' + lastUsedModel : '') : '—'}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">IMAGES SENT</span>
              <span class="dbg-val {lastSentImages > 0 ? 'dbg-hi' : ''}">{lastSentImages > 0 ? lastSentImages + ' image(s)' : '—'}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">LATENCY</span>
              <span class="dbg-val">{lastResponseMs != null ? lastResponseMs + ' ms' : '—'}</span>
            </div>

            <div class="dbg-section-hd">◈ EMOTION STATUS</div>
            <div class="dbg-row">
              <span class="dbg-lbl">STYLE</span>
              <span class="dbg-val dbg-style">{CHARACTER_PROFILES[activePreset]?.style ?? '—'}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">ACTIVE</span>
              <span class="dbg-val dbg-em">{activeEmotionLabels}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">TRUST</span>
              <span class="dbg-val {emotion.trust >= 60 ? 'dbg-hi' : ''}">{emotion.trust}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">AFFECTION</span>
              <span class="dbg-val {emotion.affection >= 60 ? 'dbg-hi' : ''}">{emotion.affection}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">JEALOUSY</span>
              <span class="dbg-val {emotion.jealousy >= 35 ? 'dbg-hi' : ''}">{emotion.jealousy}</span>
            </div>
            <div class="dbg-row">
              <span class="dbg-lbl">NIGHT</span>
              <span class="dbg-val {effectiveToggles.nightMode ? 'dbg-hi' : ''}">{effectiveToggles.nightMode ? 'ON' : 'OFF'}</span>
            </div>
          </div>
        {/if}
      </div>

    </section>

  {:else}
    <!-- ===== 2COL: Large Character Viewer ===== -->
    <section class="panel char-viewer-large">
      <div class="panel-hd">
        <span class="ph-diamond">◆</span>
        <span class="ph-text">CHARACTER VIEWER</span>
        <span class="ph-line"></span>
        <div class="cv-type-tabs" role="group" aria-label="Viewer type">
          <button
            class="cv-tab"
            class:active={viewerTab === 'image'}
            onclick={() => setViewerTab('image')}
          >IMAGE</button>
          <button
            class="cv-tab"
            class:active={viewerTab === 'png'}
            onclick={() => setViewerTab('png')}
          >PNG-TUBER</button>
          <button
            class="cv-tab"
            class:active={viewerTab === 'vrm'}
            onclick={() => setViewerTab('vrm')}
          >VRM</button>
          {#if viewerTab === 'png'}
            <button
              class="cv-tab cv-tab-settings"
              class:active={showPngSettings}
              onclick={() => showPngSettings = !showPngSettings}
              title="PNG-TUBER 設定"
            >⚙ 設定</button>
          {/if}
        </div>
      </div>

      {#if viewerTab === 'image'}
        <!-- IMAGE モード: スキャンライン付き円形ビュー -->
        <div class="cvl-stage" class:glow-active={avatarEffects.glowPulse}>
          <div class="cvl-ring" style="animation-play-state:{avatarEffects.rotate ? 'running' : 'paused'}">
            <div class="cvl-inner">
              <img
                src={selectedAvatar}
                alt={charName}
                class="cvl-img"
                class:png-speaking={isThinking}
                class:png-blink={pngBlinking && !isThinking}
                onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }}
              />
              <div class="scan-line"></div>
              {#if isThinking}
                <div class="png-think-overlay" aria-hidden="true"></div>
              {/if}
            </div>
          </div>

          {#if isThinking}
            <div class="cvl-thinking-overlay">
              <span class="dot-bounce"></span>
              <span class="dot-bounce" style="animation-delay:0.18s"></span>
              <span class="dot-bounce" style="animation-delay:0.36s"></span>
            </div>
          {/if}
        </div>

      {:else if viewerTab === 'png'}
        <!-- PNG-TUBER モード: 口パク・まばたき・感情切替 -->
        <div class="cvl-stage cvl-png-stage">
          <!-- キャラ本体 — 常時表示 -->
          <MotionPNGTuberViewer
            mouthState={motionMouthState}
          />
          {#if isThinking}
            <div class="cvl-thinking-overlay">
              <span class="dot-bounce"></span>
              <span class="dot-bounce" style="animation-delay:0.18s"></span>
              <span class="dot-bounce" style="animation-delay:0.36s"></span>
            </div>
          {/if}

          <!-- 設定パネル — ⚙ 押下時にビューア上に重ねて表示 -->
          {#if showPngSettings}
            <div class="png-settings-panel">
              <div class="psp-title">◆ PNG-TUBER SETTINGS</div>

              <!-- キャラ画像変更 -->
              <div class="psp-row">
                <span class="psp-label">キャラ画像</span>
                <div class="psp-avatars">
                  {#each AVATARS as av}
                    <button
                      class="psp-av-btn"
                      class:active={selectedAvatar === av.file}
                      onclick={() => selectAvatar(av.file, av.name, av.presetId)}
                      title={av.name}
                    >
                      <img src={av.file} alt={av.name} class="psp-av-img"
                        onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }} />
                    </button>
                  {/each}
                </div>
              </div>

              <!-- 拡大率 -->
              <div class="psp-row">
                <span class="psp-label">拡大率</span>
                <input type="range" class="psp-slider" min="0.5" max="2.0" step="0.05"
                  bind:value={pngScale} />
                <span class="psp-val">{pngScale.toFixed(2)}x</span>
              </div>

              <!-- 上下位置調整 -->
              <div class="psp-row">
                <span class="psp-label">上下位置</span>
                <input type="range" class="psp-slider" min="-120" max="120" step="4"
                  bind:value={pngOffsetY} />
                <span class="psp-val">{pngOffsetY}px</span>
              </div>

              <!-- 揺れ強度 -->
              <div class="psp-row">
                <span class="psp-label">揺れ強度</span>
                <input type="range" class="psp-slider" min="0.0" max="3.0" step="0.1"
                  bind:value={pngShake} />
                <span class="psp-val">{pngShake.toFixed(1)}</span>
              </div>

              <!-- 瞬き / 口パク / 表情AUTO -->
              <div class="psp-row psp-toggles">
                <label class="psp-toggle">
                  <input type="checkbox" bind:checked={pngEnableBlink} />
                  <span>瞬き</span>
                </label>
                <label class="psp-toggle">
                  <input type="checkbox" bind:checked={pngEnableLipsync} />
                  <span>口パク</span>
                </label>
                <label class="psp-toggle">
                  <input type="checkbox"
                    checked={emotionPin === ''}
                    onchange={(e) => { emotionPin = (e.target as HTMLInputElement).checked ? '' : 'neutral'; }}
                  />
                  <span>表情AUTO</span>
                </label>
              </div>

              <!-- 表情固定セレクト -->
              <div class="psp-row">
                <span class="psp-label">表情固定</span>
                <select class="vc-select psp-select"
                  value={emotionPin}
                  onchange={(e) => { emotionPin = (e.target as HTMLSelectElement).value; }}
                >
                  <option value="">AUTO</option>
                  <option value="neutral">neutral</option>
                  <option value="smile">smile</option>
                  <option value="angry">angry</option>
                  <option value="sad">sad</option>
                  <option value="blush">blush</option>
                  <option value="laugh">laugh</option>
                  <option value="smug">smug</option>
                  <option value="sleepy">sleepy</option>
                  <option value="panic">panic</option>
                  <option value="heart">heart</option>
                  <option value="wink">wink</option>
                </select>
              </div>
            </div>
          {/if}

          <!-- 感情オーバーライド行 -->
          <div class="vrm-load-row">
            <span class="vrm-loaded-badge" style="opacity:0.7">
              EMO: {pngEmotion}
            </span>
            <select
              class="vc-select"
              value={emotionPin}
              onchange={(e) => { emotionPin = (e.target as HTMLSelectElement).value; }}
            >
              <option value="">AUTO</option>
              <option value="neutral">neutral</option>
              <option value="smile">smile</option>
              <option value="angry">angry</option>
              <option value="sad">sad</option>
              <option value="blush">blush</option>
              <option value="laugh">laugh</option>
              <option value="smug">smug</option>
              <option value="sleepy">sleepy</option>
              <option value="panic">panic</option>
              <option value="heart">heart</option>
              <option value="wink">wink</option>
            </select>
          </div>
        </div>

      {:else}
        <!-- VRM モード -->
        <div class="cvl-stage cvl-vrm-stage">
          <AvatarViewer
            vrmUrl={vrmFileUrl}
            isThinking={isThinking}
            isSpeaking={isSpeaking}
            emotion={vrmEmotion()}
            breathing={$avatarState.breathing}
            gaze={$avatarState.gaze}
          />
          <div class="vrm-load-row">
            <label class="vrm-file-btn">
              ◈ VRM を読み込む
              <input type="file" accept=".vrm" onchange={handleVrmFile} hidden />
            </label>
            {#if vrmFileUrl}
              <span class="vrm-loaded-badge">● LOADED</span>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Info bar at bottom -->
      <div class="cvl-info-bar">
        <div class="cvl-name-block">
          <span class="cvl-name">{charName}</span>
          <span class="cvl-mode">{charMode}</span>
        </div>
        <div class="cvl-status-block">
          <span class="cvl-mood" style="color:{moodColor}; text-shadow:0 0 10px {moodColor}60">{mood}</span>
          {#if isThinking}
            <span class="cvl-speak-badge">Speaking…</span>
          {:else}
            <span class="cvl-standby">◉ STANDBY</span>
          {/if}
        </div>
        <div class="cvl-bars">
          <div class="cvl-bar-row">
            <span class="cvl-bar-lbl">TRUST</span>
            <div class="cvl-bar-track"><div class="cvl-bar-fill" style="width:{personality.trust}%; background:#00e5ff"></div></div>
            <span class="cvl-bar-val">{personality.trust}</span>
          </div>
          <div class="cvl-bar-row">
            <span class="cvl-bar-lbl">ENERGY</span>
            <div class="cvl-bar-track"><div class="cvl-bar-fill" style="width:{personality.energy}%; background:#34d399"></div></div>
            <span class="cvl-bar-val">{personality.energy}</span>
          </div>
        </div>
      </div>
    </section>
  {/if}
  </main>

  <!-- ==================== PROMPT MONITOR ==================== -->
  {#if devMode}
  <footer class="prompt-monitor">
    <div class="pm-header">
      <span class="pm-diamond">◆</span>
      <span class="pm-title">PROMPT MONITOR</span>
      <span class="pm-sub">/ API Parameter Preview</span>
      <span class="pm-line"></span>
      <span class="pm-badge">LIVE</span>
    </div>
    <div class="pm-chips">
      {#each PARAM_CHIPS as chip}
        {@const sliderCfg = SLIDERS.find(s => s.key === chip.key)}
        <div class="param-chip" style="--cc:{sliderCfg?.color ?? '#00e5ff'}">
          <span class="pk">{chip.key}</span>
          <span class="peq">=</span>
          <span class="pv">{personality[chip.key]}</span>
        </div>
      {/each}
      <div class="param-chip hi">
        <span class="pk">mode</span><span class="peq">=</span>
        <span class="pv">{effectiveToggles.nightMode ? 'night' : 'normal'}</span>
      </div>
      <div class="param-chip hi">
        <span class="pk">emotion</span><span class="peq">=</span>
        <span class="pv">{mood.toLowerCase()}</span>
      </div>
      <div class="param-chip hi">
        <span class="pk">android</span><span class="peq">=</span>
        <span class="pv">{toggles.androidMode}</span>
      </div>
      <div class="param-chip hi">
        <span class="pk">unit</span><span class="peq">=</span>
        <span class="pv">{charName}</span>
      </div>
    </div>
  </footer>
  {/if}
</div>

{#if showCharacterModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" role="presentation" onclick={() => closePersonaModal(false)}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-window" role="presentation" onclick={(e) => e.stopPropagation()}>
      <button class="modal-x-btn" aria-label="閉じる" onclick={() => closePersonaModal(false)}>×</button>
      <div class="modal-avatar-wrap">
        <img class="modal-avatar" src={selectedAvatar} alt={charName}
          onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }} />
        <div class="modal-char-name">{charName}</div>
        <label class="modal-avatar-upload">
          ◈ 画像を変更
          <input type="file" accept="image/*" style="display:none" onchange={handleAvatarUpload} />
        </label>
      </div>

      <div class="section-lbl">PERSONA PRESETS</div>
      <div class="preset-grid">
        {#each PRESET_LIST as p}
          <button
            class="preset-btn"
            class:active={activePreset === p.id}
            style="--pc:{p.color}"
            onclick={() => selectPersonaPresetInModal(p.id)}
          >
            {p.label}
          </button>
        {/each}
      </div>

      {#if activePreset !== 'custom'}
        <button class="cp-dup-btn cp-dup-standalone" onclick={duplicatePersonaToCustomInModal}>
          ◈ DUPLICATE CURRENT → CUSTOM
        </button>
      {/if}

      {#if activePreset === 'custom'}
        <div class="persona-generator">
          <div class="persona-generator-hd">✨ AI PERSONA GENERATOR</div>
          <div class="persona-generator-row">
            <input
              class="cp-input persona-generator-input"
              type="text"
              placeholder="例: ミュリィをギャルっぽくしたい"
              bind:value={personaGeneratorPrompt}
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void generatePersonaWithAI();
                }
              }}
            />
            <button
              class="persona-generator-btn"
              disabled={personaGeneratorLoading || !personaGeneratorPrompt.trim()}
              onclick={() => void generatePersonaWithAI()}
            >
              {personaGeneratorLoading ? '生成中...' : '✨ AIで生成'}
            </button>
          </div>
          {#if personaGeneratorError}
            <div class="persona-generator-error">{personaGeneratorError}</div>
          {/if}
        </div>
      {/if}

      <div class="cp-editor-hd">
        ◈ PERSONA SETTINGS
      </div>
      <div class="cp-row">
        <span class="cp-lbl">NAME</span>
        <input class="cp-input" type="text" placeholder="キャラクター名"
          bind:value={personaModalProfile.name} />
      </div>
      <div class="cp-row">
        <span class="cp-lbl">一人称</span>
        <input class="cp-input" type="text" placeholder="一人称を入力"
          bind:value={personaModalProfile.firstPerson} />
      </div>
      <div class="cp-row">
        <span class="cp-lbl">二人称</span>
        <input class="cp-input" type="text" placeholder="二人称を入力"
          bind:value={personaModalProfile.secondPerson} />
      </div>
      <div class="cp-row">
        <span class="cp-lbl">他人</span>
        <input class="cp-input" type="text" placeholder="他人の呼び方を入力"
          bind:value={personaModalProfile.thirdPerson} />
      </div>
      <div class="cp-row">
        <span class="cp-lbl">口調</span>
        <textarea class="cp-input cp-textarea" placeholder="話し方・性格の説明"
          bind:value={personaModalProfile.speechStyle}></textarea>
      </div>
      <div class="cp-row">
        <span class="cp-lbl">口癖</span>
        <input class="cp-input" type="text" placeholder="よく使う表現・口癖"
          bind:value={personaModalProfile.habits} />
      </div>
      <div class="cp-row">
        <span class="cp-lbl">語尾</span>
        <input class="cp-input" type="text" placeholder="語尾の特徴"
          bind:value={personaModalProfile.sentenceEnding} />
      </div>
      <div class="cp-row">
        <span class="cp-lbl">怒り方</span>
        <input class="cp-input" type="text" placeholder="怒った時の言い方"
          bind:value={personaModalProfile.angerStyle} />
      </div>
      <div class="cp-row">
        <span class="cp-lbl">甘い時</span>
        <input class="cp-input" type="text" placeholder="好意・愛情表現"
          bind:value={personaModalProfile.affectionStyle} />
      </div>
      <div class="cp-row">
        <span class="cp-lbl">嫉妬時</span>
        <input class="cp-input" type="text" placeholder="嫉妬した時の言い方"
          bind:value={personaModalProfile.jealousyStyle} />
      </div>
      <div class="cp-row">
        <span class="cp-lbl">メモ</span>
        <textarea class="cp-input cp-textarea" placeholder="その他の性格・設定メモ"
          bind:value={personaModalProfile.memo}></textarea>
      </div>
      <div class="modal-actions">
        <button class="modal-close-btn modal-cancel-btn" onclick={() => closePersonaModal(false)}>Cancel</button>
        <button class="modal-close-btn modal-save-btn" onclick={() => closePersonaModal(true)}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
/* ============================================================
   VARIABLES
   ============================================================ */
.lab {
  --cy:       #00e5ff;
  --cy-dim:   rgba(0,229,255,0.1);
  --cy-glow:  rgba(0,229,255,0.35);
  --pu:       #a855f7;
  --pu-dim:   rgba(168,85,247,0.12);
  --pu-glow:  rgba(168,85,247,0.35);
  --green:    #34d399;
  --red:      #f43f5e;
  --orange:   #fb923c;
  --bg:       #020912;
  --bg2:      #040d1a;
  --panel:    rgba(0,229,255,0.015);
  --pborder:  rgba(0,229,255,0.14);
  --text:     #cce8f0;
  --text2:    #8ab4c2;
  --muted:    #3a6070;
  --dim:      #1a3040;

  min-height: 100vh;
  height: 100vh;
  background:
    radial-gradient(ellipse at 15% 15%, rgba(0,40,90,0.5) 0%, transparent 55%),
    radial-gradient(ellipse at 85% 85%, rgba(90,0,140,0.35) 0%, transparent 55%),
    radial-gradient(ellipse at 50% 50%, rgba(0,20,50,0.4) 0%, transparent 70%),
    linear-gradient(155deg, #020912 0%, #040b1a 45%, #060416 100%);
  color: var(--text);
  font-family: 'Consolas', 'SF Mono', 'Courier New', 'Noto Sans JP', monospace;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* Dot grid */
.lab::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: radial-gradient(rgba(0,229,255,0.055) 1px, transparent 1px);
  background-size: 28px 28px;
  pointer-events: none;
  z-index: 0;
}

.lab.night-mode {
  filter: brightness(0.75) saturate(0.65) hue-rotate(20deg);
}

/* ============================================================
   HEADER
   ============================================================ */
.lab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 78px;
  padding: 16px 28px;
  border-bottom: 1px solid var(--pborder);
  background:
    linear-gradient(180deg, rgba(7,18,34,0.92), rgba(2,5,18,0.86)),
    rgba(2,5,18,0.88);
  backdrop-filter: blur(16px);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  gap: 28px;
  box-shadow: inset 0 -1px 0 rgba(0,229,255,0.06), 0 10px 28px rgba(0,0,0,0.22);
}

.lab-header::after {
  content: '';
  position: absolute;
  bottom: -1px; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--cy) 30%, var(--pu) 70%, transparent 100%);
  opacity: 0.45;
  pointer-events: none;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-shrink: 0;
  min-width: 0;
}

.logo-hex {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 52px;
  filter: drop-shadow(0 0 7px rgba(0,229,255,0.34));
  animation: hex-pulse 4s ease-in-out infinite;
  flex-shrink: 0;
}

.title-group { display: flex; flex-direction: column; gap: 7px; min-width: 0; }

.main-title {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 5px;
  color: var(--cy);
  text-shadow: 0 0 8px rgba(0,229,255,0.24);
  line-height: 0.95;
  margin: 0;
}

.sub-title {
  font-size: 12px;
  line-height: 1.25;
  letter-spacing: 2.1px;
  color: rgba(138,180,194,0.9);
  text-transform: uppercase;
  margin: 0;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
  align-self: center;
  position: relative;
  z-index: 1;
  pointer-events: none;
}

.header-divider {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--dim));
}

.header-tag {
  font-size: 12px;
  line-height: 1.35;
  letter-spacing: 1.5px;
  color: rgba(138,180,194,0.62);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 360px;
  padding: 5px 10px;
  border: 1px solid rgba(0,229,255,0.08);
  border-radius: 999px;
  background: rgba(0,229,255,0.025);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  position: relative;
  z-index: 3;
  pointer-events: auto;
}

.sys-online {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(52,211,153,0.18);
  border-radius: 999px;
  background: rgba(52,211,153,0.055);
  font-size: 12px;
  line-height: 1;
  letter-spacing: 1.7px;
  color: rgba(134,239,172,0.92);
  text-shadow: none;
  white-space: nowrap;
}

.pulse-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 9px rgba(52,211,153,0.78);
  animation: dot-pulse 1.8s ease-in-out infinite;
  flex-shrink: 0;
}

.clock {
  font-size: 34px;
  font-weight: 750;
  letter-spacing: 2px;
  color: var(--cy);
  text-shadow: 0 0 10px rgba(0,229,255,0.2);
  font-variant-numeric: tabular-nums;
  min-width: 152px;
  text-align: center;
  line-height: 1;
  padding: 0 4px;
}

.build-badge {
  font-size: 12px;
  line-height: 1;
  letter-spacing: 1.4px;
  color: var(--pu);
  border: 1px solid var(--pu-dim);
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--pu-dim);
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  text-transform: uppercase;
}

.api-settings-btn {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  letter-spacing: 1.2px;
  color: var(--cy);
  border: 1px solid rgba(0,229,255,0.34);
  padding: 0 13px;
  border-radius: 6px;
  background: rgba(0,229,255,0.045);
  text-decoration: none;
  text-transform: uppercase;
  transition: background 0.2s, box-shadow 0.2s, color 0.2s;
  white-space: nowrap;
}
.api-settings-btn:hover {
  background: color-mix(in srgb, var(--cy) 15%, transparent);
  box-shadow: 0 0 8px var(--cy), inset 0 0 6px color-mix(in srgb, var(--cy) 10%, transparent);
  color: #fff;
}

/* ============================================================
   MAIN 3-COLUMN GRID
   ============================================================ */
.lab-main {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 1;

  gap: 16px;
  padding: 12px;

  overflow: hidden;
}

.lab-main.is-resizing {
  cursor: col-resize;
  user-select: none;
}


 .chat-panel {
    flex: 1 1 auto;
    min-width: 300px;

    display: flex;
    flex-direction: column;

    min-height: 0;
    overflow: hidden;

    zoom: 1.12;
    padding: 12px;
}


.right-panel {
    flex-shrink: 0;
    padding: 24px 22px;

    zoom: 1.2;
}

/* ── Resize bar ── */
.resize-bar {
  width: 5px;
  flex-shrink: 0;
  background: var(--pborder);
  cursor: col-resize;
  position: relative;
  transition: background 0.18s;
  z-index: 30;
  pointer-events: auto;
  touch-action: none;
}

.resize-bar::after {
  content: '';
  position: absolute;
  inset: 0 -10px;
  pointer-events: auto;
}

.resize-bar:hover,
.is-resizing .resize-bar {
  background: rgba(0,229,255,0.25);
  box-shadow: 0 0 6px rgba(0,229,255,0.3);
}

/* ============================================================
   PANELS
   ============================================================ */
.panel {
  background: var(--bg);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 14px;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--dim) transparent;
}

.panel-hd {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--pborder);
  flex-shrink: 0;
}

.ph-diamond { color: var(--cy); font-size: 11px; }
.ph-text {
  font-size: 15px;
  line-height: 1.4;
  font-weight: 700;
  letter-spacing: 2.5px;
  color: var(--cy);
  text-shadow: 0 0 8px var(--cy-glow);
}
.ph-line { flex: 1; height: 1px; background: var(--pborder); }
.ph-id {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--muted);
}
.thinking-tag {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--pu);
  text-shadow: 0 0 8px var(--pu-glow);
  animation: blink 0.9s ease-in-out infinite;
}

.failover-notice {
  margin: 4px 12px 0;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: #fbbf24;
  background: rgba(251,191,36,0.1);
  border: 1px solid rgba(251,191,36,0.3);
  animation: fadeout-notice 5s forwards;
}
@keyframes fadeout-notice {
  0%, 70% { opacity: 1; }
  100%     { opacity: 0; }
}

.section-lbl {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: 2px;
  color: var(--muted);
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0,229,255,0.06);
  margin-bottom: 8px;
}

/* ============================================================
   LEFT: CHARACTER PANEL
   ============================================================ */
.char-panel { padding: 14px 12px; }

/* Avatar display */
.avatar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.avatar-ring {
  width: 140px; height: 140px;
  border-radius: 50%;
  padding: 3px;
  background: conic-gradient(
    var(--cy) 0%, var(--pu) 50%, var(--cy) 100%
  );
  animation: ring-spin 8s linear infinite;
  flex-shrink: 0;
}

.avatar-inner {
  width: 100%; height: 100%;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg2);
  position: relative;
  border: 1px solid rgba(0,229,255,0.2);
  transition: box-shadow 0.4s ease;
}

/* Glow pulse effect on avatar */
.avatar-wrap.glow-active .avatar-inner {
  animation: avatar-glow-pulse 3s ease-in-out infinite;
}

.av-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
  display: block;
  border-radius: 50%;
}

.scan-line {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 0%, transparent 48%,
    rgba(0,229,255,0.08) 50%,
    transparent 52%, transparent 100%
  );
  animation: scan 3s linear infinite;
  pointer-events: none;
}

.av-name-row { display: flex; align-items: center; justify-content: center; }

.av-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--cy);
  text-shadow: 0 0 10px var(--cy-glow);
  background: none;
  border: none;
  cursor: pointer;
  padding: 3px 10px;
  border-radius: 3px;
  transition: background 0.15s;
  font-family: inherit;
}

.av-name:hover {
  background: rgba(0,229,255,0.08);
}

.av-name-input {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--cy);
  background: rgba(0,229,255,0.07);
  border: 1px solid var(--cy);
  border-radius: 3px;
  padding: 3px 10px;
  text-align: center;
  outline: none;
  width: 130px;
  font-family: inherit;
}

.av-mode {
  font-size: 9.5px;
  letter-spacing: 1.5px;
  color: var(--muted);
  text-transform: uppercase;
}

/* Avatar selector */
.av-selector { width: 100%; }

.av-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.av-thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: rgba(0,229,255,0.03);
  border: 1px solid var(--pborder);
  border-radius: 5px;
  padding: 6px 3px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.av-thumb:hover {
  border-color: rgba(0,229,255,0.35);
  background: rgba(0,229,255,0.07);
}

.av-thumb.active {
  border-color: var(--cy);
  background: rgba(0,229,255,0.1);
  box-shadow: 0 0 8px rgba(0,229,255,0.2);
}

.av-thumb img {
  width: 44px; height: 44px;
  object-fit: cover;
  object-position: top;
  border-radius: 50%;
  border: 1px solid rgba(0,229,255,0.15);
}

.av-thumb.active img {
  border-color: var(--cy);
  box-shadow: 0 0 6px rgba(0,229,255,0.4);
}

.av-thumb span {
  font-size: 15px;
  line-height: 1.3;
  color: var(--text2);
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Avatar Effects */
.av-effects {
  width: 100%;
  border: 1px solid rgba(0,229,255,0.08);
  border-radius: 4px;
  padding: 10px;
  background: rgba(0,229,255,0.015);
}

/* Voice Config */
.voice-cfg-block { border-color: rgba(168,85,247,0.18); background: rgba(168,85,247,0.02); }

/* AI Config */
.ai-cfg-block { border-color: rgba(0,229,255,0.18); background: rgba(0,229,255,0.02); }

.api-check-btn {
  margin-top: 10px;
  width: 100%;
  padding: 5px 0;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--cy);
  background: rgba(0,229,255,0.06);
  border: 1px solid rgba(0,229,255,0.3);
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.api-check-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.12);
  border-color: rgba(0,229,255,0.6);
}
.api-check-btn:disabled { opacity: 0.5; cursor: default; }

.api-status-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.api-status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.api-status-name {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: 1px;
  color: var(--muted);
}
.api-status-val {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: 1px;
  font-weight: 600;
}

.vc-rows { display: flex; flex-direction: column; gap: 7px; }

.vc-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vc-lbl {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: 1.5px;
  color: var(--muted);
  white-space: nowrap;
  width: 70px;
  flex-shrink: 0;
}
.vc-lbl-wide {
  width: 128px;
  letter-spacing: 0.8px;
  white-space: normal;
}

.vc-select,
.vc-input {
  flex: 1;
  min-width: 0;
  background: rgba(0,0,20,0.6);
  border: 1px solid rgba(168,85,247,0.25);
  border-radius: 3px;
  color: var(--pu);
  font-family: inherit;
  font-size: 18px;
  line-height: 1.6;
  letter-spacing: 1px;
  padding: 4px 7px;
  outline: none;
  transition: border-color 0.15s;
}
.vc-select:focus,
.vc-input:focus {
  border-color: var(--pu);
  box-shadow: 0 0 6px rgba(168,85,247,0.3);
}
.vc-select option { background: #040d1a; }
.vc-input::placeholder { color: var(--muted); }
.vc-note {
  flex: 1;
  min-width: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.35;
  letter-spacing: 0.8px;
}
.vc-current {
  color: var(--cy);
  font-weight: 700;
  text-shadow: 0 0 7px rgba(0,229,255,0.35);
}
.vc-warn {
  color: #fb923c;
  text-shadow: 0 0 7px rgba(251,146,60,0.35);
}

.router-state-block {
  border-color: rgba(0,229,255,0.24);
  background:
    linear-gradient(135deg, rgba(0,229,255,0.055), rgba(168,85,247,0.035)),
    rgba(2,9,18,0.42);
}

.router-state-grid {
  display: grid;
  gap: 8px;
}

.router-state-section-title {
  color: rgba(204,232,240,0.72);
  font-size: 11px;
  line-height: 1.3;
  letter-spacing: 1.8px;
  font-weight: 800;
}

.router-state-divider {
  height: 1px;
  margin: 4px 0;
  background: linear-gradient(90deg, transparent, rgba(0,229,255,0.28), transparent);
}

.router-state-row,
.router-state-reason {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
  padding: 7px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.router-state-reason {
  align-items: start;
  border-bottom: 0;
}

.router-state-label {
  color: rgba(204,232,240,0.5);
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 1.2px;
  text-transform: uppercase;
}

.router-state-value,
.router-state-reason span:last-child {
  min-width: 0;
  color: var(--cy);
  font-size: 13px;
  line-height: 1.45;
  letter-spacing: 0.5px;
  overflow-wrap: anywhere;
}

.router-state-value.intent {
  color: #34d399;
  font-weight: 800;
  text-shadow: 0 0 9px rgba(52,211,153,0.35);
}

.router-state-value.source-gemini {
  color: #a78bfa;
  text-shadow: 0 0 9px rgba(167,139,250,0.35);
}

.router-state-value.source-rules {
  color: #00e5ff;
  text-shadow: 0 0 9px rgba(0,229,255,0.35);
}

.router-state-value.confidence-high {
  color: #34d399;
  font-weight: 800;
  text-shadow: 0 0 9px rgba(52,211,153,0.36);
}

.router-state-value.confidence-mid {
  color: #facc15;
  font-weight: 800;
  text-shadow: 0 0 9px rgba(250,204,21,0.34);
}

.router-state-value.confidence-low {
  color: #f43f5e;
  font-weight: 800;
  text-shadow: 0 0 9px rgba(244,63,94,0.36);
}

.router-state-muted {
  color: rgba(204,232,240,0.42);
  text-shadow: none;
}


/* Stats */
.char-stats { display: flex; flex-direction: column; gap: 9px; }

.stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-lbl {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: 1.5px;
  color: var(--text2);
  width: 66px;
  flex-shrink: 0;
}

.bar-wrap {
  flex: 1;
  height: 4px;
  background: rgba(0,229,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}

.bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
}

.battery-bar  { background: linear-gradient(90deg, #34d399, #00e5ff); }
.trust-bar    { background: linear-gradient(90deg, #00e5ff, #818cf8); }
.affection-bar{ background: linear-gradient(90deg, #e879f9, #f43f5e); }

.stat-num {
  font-size: 15px;
  line-height: 1.4;
  color: var(--cy);
  min-width: 28px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.mood-row { justify-content: space-between; }

.mood-val {
  font-size: 20px;
  line-height: 1.35;
  font-weight: 700;
  letter-spacing: 1.5px;
  transition: color 0.4s, text-shadow 0.4s;
}

/* Log */
.char-log {
  border: 1px solid rgba(0,229,255,0.08);
  border-radius: 4px;
  padding: 10px;
  background: rgba(0,229,255,0.02);
}

.log-title {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: 2px;
  color: var(--muted);
  margin-bottom: 7px;
}

.log-entry {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 16px;
  line-height: 1.9;
  color: var(--text2);
  padding: 3px 0;
  letter-spacing: 0.5px;
}

.ld {
  width: 5px; height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ld.ok      { background: var(--green); box-shadow: 0 0 4px var(--green); }
.ld.warn    { background: var(--orange); box-shadow: 0 0 4px var(--orange); animation: blink 1.2s ease-in-out infinite; }
.ld.off     { background: var(--dim); }

/* ============================================================
   MIDDLE: CONTROL PANEL
   ============================================================ */
.control-panel { padding: 14px; gap: 12px; }

/* Long Memory block */
.lm-block {
  border: 1px solid rgba(0,229,255,0.12);
  border-radius: 4px;
  background: rgba(0,229,255,0.03);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lm-label {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: 1.2px;
  color: var(--cy);
  opacity: 0.75;
}
.lm-update-btn {
  font-size: 14px;
  line-height: 1.4;
  letter-spacing: 0.8px;
  font-family: inherit;
  padding: 2px 7px;
  background: rgba(0,229,255,0.06);
  border: 1px solid rgba(0,229,255,0.2);
  border-radius: 3px;
  color: rgba(0,229,255,0.65);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.lm-update-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.14);
  color: rgba(0,229,255,0.9);
}
.lm-update-btn:disabled { opacity: 0.35; cursor: default; }
.lm-text {
  font-size: 16px;
  line-height: 1.9;
  color: rgba(200,240,255,0.75);
  white-space: pre-wrap;
  margin: 0;
  font-family: inherit;
}
.lm-empty {
  font-size: 16px;
  line-height: 1.6;
  color: var(--muted);
  margin: 0;
  text-align: center;
  padding: 2px 0;
}

.memory-viewer-block {
  border: 1px solid rgba(0,229,255,0.12);
  border-radius: 4px;
  background: rgba(0,229,255,0.025);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mv-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mv-tab {
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  letter-spacing: 1.2px;
  padding: 3px 9px;
  border: 1px solid rgba(0,229,255,0.24);
  border-radius: 3px;
  background: rgba(0,229,255,0.06);
  color: rgba(0,229,255,0.72);
  cursor: pointer;
}

.mv-tab.active {
  color: var(--cy);
  background: rgba(0,229,255,0.12);
  box-shadow: inset 0 -1px 0 rgba(0,229,255,0.55);
}

.mv-tab:hover:not(:disabled),
.mv-refresh:hover:not(:disabled) {
  background: rgba(0,229,255,0.16);
  color: rgba(0,229,255,0.95);
}

.mv-tab:disabled,
.mv-refresh:disabled {
  opacity: 0.45;
  cursor: default;
}

.mv-count {
  font-size: 13px;
  line-height: 1.4;
  color: var(--muted);
  margin-left: auto;
}

.mv-search-row {
  display: flex;
  gap: 6px;
}

.mv-search {
  min-width: 0;
  flex: 1;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  padding: 5px 7px;
  border: 1px solid rgba(0,229,255,0.16);
  border-radius: 3px;
  background: rgba(0,0,0,0.22);
  color: rgba(220,250,255,0.86);
  outline: none;
}

.mv-search:focus {
  border-color: rgba(0,229,255,0.45);
  box-shadow: 0 0 8px rgba(0,229,255,0.14);
}

.mv-refresh {
  width: 30px;
  flex: 0 0 30px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  border: 1px solid rgba(0,229,255,0.2);
  border-radius: 3px;
  background: rgba(0,229,255,0.06);
  color: rgba(0,229,255,0.72);
  cursor: pointer;
}

.mv-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  max-height: 240px;
  overflow: auto;
  padding-right: 2px;
}

.mv-entry {
  border: 1px solid rgba(0,229,255,0.1);
  border-radius: 4px;
  background: rgba(0,0,0,0.18);
  padding: 7px 8px;
}

.mv-entry-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.mv-importance {
  font-size: 12px;
  line-height: 1.3;
  color: rgba(255,208,90,0.85);
}

.mv-date {
  font-size: 12px;
  line-height: 1.3;
  color: var(--muted);
}

.mv-content {
  font-size: 15px;
  line-height: 1.55;
  color: rgba(220,250,255,0.82);
  overflow-wrap: anywhere;
}

.mv-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.mv-tag {
  font-size: 12px;
  line-height: 1.3;
  color: rgba(0,229,255,0.62);
}

.mv-empty {
  font-size: 15px;
  line-height: 1.6;
  color: var(--muted);
  margin: 0;
  text-align: center;
  padding: 6px 0;
}

.cognitive-monitor-block {
  border: 1px solid rgba(167,139,250,0.18);
  border-radius: 4px;
  background: rgba(167,139,250,0.025);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cm-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cm-tab {
  font-size: 14px;
  line-height: 1.4;
  letter-spacing: 1.1px;
  padding: 3px 9px;
  border: 1px solid rgba(167,139,250,0.28);
  border-radius: 3px;
  color: rgba(210,195,255,0.84);
  background: rgba(167,139,250,0.08);
}

.cm-tab.active {
  box-shadow: inset 0 -1px 0 rgba(167,139,250,0.6);
}

.cm-sub {
  margin-left: auto;
  font-size: 12px;
  line-height: 1.3;
  color: var(--muted);
}

.cm-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.cm-cell {
  min-width: 0;
  border: 1px solid rgba(0,229,255,0.08);
  border-radius: 4px;
  background: rgba(0,0,0,0.16);
  padding: 6px 7px;
}

.cm-cell:first-child {
  grid-column: 1 / -1;
}

.cm-label,
.cm-section-label {
  display: block;
  font-size: 12px;
  line-height: 1.35;
  color: var(--muted);
  letter-spacing: 0.7px;
  margin-bottom: 3px;
}

.cm-value {
  display: block;
  font-size: 16px;
  line-height: 1.35;
  color: rgba(220,250,255,0.86);
  overflow-wrap: anywhere;
}

.cm-value.pos { color: rgba(74,222,128,0.9); }
.cm-value.neg { color: rgba(244,63,94,0.9); }

.cm-section {
  border-top: 1px solid rgba(0,229,255,0.08);
  padding-top: 7px;
}

.cm-memory-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 130px;
  overflow: auto;
}

.cm-memory-entry {
  display: grid;
  grid-template-columns: 46px 1fr;
  gap: 6px;
  align-items: start;
  font-size: 13px;
  line-height: 1.45;
}

.cm-memory-imp {
  color: rgba(255,208,90,0.82);
}

.cm-memory-text {
  color: rgba(220,250,255,0.78);
  overflow-wrap: anywhere;
}

.cm-empty,
.cm-note {
  font-size: 14px;
  line-height: 1.55;
  color: var(--muted);
  margin: 0;
}

.cm-note {
  color: rgba(210,195,255,0.78);
}

.reflection-diary-block {
  border: 1px solid rgba(74,222,128,0.16);
  border-radius: 4px;
  background: rgba(74,222,128,0.02);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rd-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rd-tab {
  font-size: 14px;
  line-height: 1.4;
  letter-spacing: 1.1px;
  padding: 3px 9px;
  border: 1px solid rgba(74,222,128,0.24);
  border-radius: 3px;
  color: rgba(150,245,190,0.84);
  background: rgba(74,222,128,0.06);
}

.rd-tab.active {
  box-shadow: inset 0 -1px 0 rgba(74,222,128,0.5);
}

.rd-refresh {
  width: 30px;
  margin-left: auto;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  border: 1px solid rgba(74,222,128,0.22);
  border-radius: 3px;
  background: rgba(74,222,128,0.06);
  color: rgba(150,245,190,0.8);
  cursor: pointer;
}

.rd-refresh:hover:not(:disabled) {
  background: rgba(74,222,128,0.14);
  color: rgba(180,255,210,0.95);
}

.rd-refresh:disabled {
  opacity: 0.45;
  cursor: default;
}

.rd-date {
  font-size: 12px;
  line-height: 1.35;
  color: var(--muted);
  letter-spacing: 0.8px;
}

.rd-section {
  border-top: 1px solid rgba(0,229,255,0.07);
  padding-top: 7px;
}

.rd-label {
  display: block;
  font-size: 12px;
  line-height: 1.35;
  color: var(--muted);
  letter-spacing: 0.7px;
  margin-bottom: 3px;
}

.rd-text,
.rd-note,
.rd-empty {
  font-size: 14px;
  line-height: 1.55;
  color: rgba(220,250,255,0.78);
  margin: 0;
  overflow-wrap: anywhere;
}

.rd-text.muted,
.rd-empty {
  color: var(--muted);
}

.rd-empty {
  text-align: center;
  padding: 6px 0;
}

.rd-learned-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rd-learned {
  font-size: 13px;
  line-height: 1.45;
  color: rgba(220,250,255,0.76);
  overflow-wrap: anywhere;
}

.rd-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.rd-metric:first-child {
  grid-column: 1 / -1;
}

.rd-metric {
  border: 1px solid rgba(0,229,255,0.08);
  border-radius: 4px;
  background: rgba(0,0,0,0.16);
  padding: 6px 7px;
  min-width: 0;
}

.rd-value {
  display: block;
  font-size: 15px;
  line-height: 1.35;
  color: rgba(220,250,255,0.86);
  overflow-wrap: anywhere;
}

.rd-value.pos { color: rgba(74,222,128,0.9); }
.rd-value.neg { color: rgba(244,63,94,0.9); }

.rd-note {
  color: rgba(150,245,190,0.78);
}

.personality-evolution-block {
  border: 1px solid rgba(255,208,90,0.18);
  border-radius: 4px;
  background: rgba(255,208,90,0.025);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pe-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pe-tab {
  font-size: 14px;
  line-height: 1.4;
  letter-spacing: 1.1px;
  padding: 3px 9px;
  border: 1px solid rgba(255,208,90,0.26);
  border-radius: 3px;
  color: rgba(255,222,130,0.86);
  background: rgba(255,208,90,0.07);
}

.pe-tab.active {
  box-shadow: inset 0 -1px 0 rgba(255,208,90,0.55);
}

.pe-refresh {
  width: 30px;
  margin-left: auto;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  border: 1px solid rgba(255,208,90,0.24);
  border-radius: 3px;
  background: rgba(255,208,90,0.06);
  color: rgba(255,222,130,0.82);
  cursor: pointer;
}

.pe-refresh:hover:not(:disabled) {
  background: rgba(255,208,90,0.14);
  color: rgba(255,235,170,0.98);
}

.pe-refresh:disabled {
  opacity: 0.45;
  cursor: default;
}

.pe-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.pe-row {
  display: grid;
  grid-template-columns: 74px 1fr 28px 18px;
  align-items: center;
  gap: 7px;
}

.pe-name {
  font-size: 12px;
  line-height: 1.35;
  color: rgba(220,250,255,0.74);
  overflow: hidden;
  text-overflow: ellipsis;
}

.pe-bar-track {
  height: 6px;
  border: 1px solid rgba(255,208,90,0.14);
  border-radius: 3px;
  background: rgba(0,0,0,0.24);
  overflow: hidden;
}

.pe-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(255,208,90,0.35), rgba(74,222,128,0.82));
  box-shadow: 0 0 7px rgba(255,208,90,0.28);
}

.pe-value {
  font-size: 12px;
  line-height: 1.35;
  color: rgba(255,222,130,0.86);
  text-align: right;
}

.pe-arrow {
  font-size: 14px;
  line-height: 1.2;
  color: var(--muted);
  text-align: center;
}

.pe-arrow.pos { color: rgba(74,222,128,0.92); }
.pe-arrow.neg { color: rgba(244,63,94,0.9); }

.pe-updated,
.pe-empty {
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
  margin: 0;
}

.pe-empty {
  text-align: center;
  padding: 6px 0;
}

/* Radar chart */
.radar-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 0;
  border: 1px solid rgba(0,229,255,0.08);
  border-radius: 6px;
  background: rgba(0,229,255,0.015);
}

.radar-svg {
  width: 270px;
  height: 270px;
}

/* Sliders */
.sliders-section { gap: 0; }
.sliders-section .section-lbl { margin-bottom: 5px; }

.slider-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 0;
  position: relative;
  border-bottom: 1px solid rgba(0,229,255,0.04);
}

.slider-label-group {
  display: flex;
  flex-direction: column;
  width: 80px;
  flex-shrink: 0;
  gap: 2px;
}

.slider-lbl {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1.5px;
  line-height: 1.3;
}

.slider-sub {
  font-size: 13px;
  line-height: 1.4;
  color: var(--muted);
  letter-spacing: 0.5px;
}

.slider-track-outer { flex: 1; min-width: 0; }

/* Custom slider */
.cyber-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  background: linear-gradient(
    90deg,
    var(--sc) var(--pct),
    rgba(0,229,255,0.1) var(--pct)
  );
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.cyber-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 13px; height: 13px;
  border-radius: 50%;
  background: var(--sc);
  border: 2px solid rgba(0,0,20,0.8);
  box-shadow: 0 0 6px var(--sc);
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.cyber-slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 10px var(--sc), 0 0 20px var(--sc);
}

.cyber-slider::-moz-range-thumb {
  width: 13px; height: 13px;
  border-radius: 50%;
  background: var(--sc);
  border: 2px solid rgba(0,0,20,0.8);
  box-shadow: 0 0 6px var(--sc);
  cursor: pointer;
}

.slider-val {
  font-size: 15px;
  line-height: 1.4;
  font-weight: 700;
  min-width: 28px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Slider tooltip */
.slider-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  background: rgba(2,9,18,0.96);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 4px;
  padding: 7px 10px;
  display: flex;
  align-items: baseline;
  gap: 7px;
  z-index: 100;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.6), 0 0 12px rgba(0,229,255,0.1);
  pointer-events: none;
}

.tt-key {
  font-size: 13px;
  line-height: 1.4;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: var(--cy);
  flex-shrink: 0;
}

.tt-sep { color: var(--muted); font-size: 13px; line-height: 1.4; }

.tt-desc {
  font-size: 14px;
  color: var(--text2);
  letter-spacing: 0.3px;
  line-height: 1.6;
}

/* Toggles */
.toggle-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 5px 0;
}

.toggle-cb { display: none; }

.toggle-track {
  width: 34px; height: 18px;
  background: rgba(0,229,255,0.07);
  border: 1px solid var(--pborder);
  border-radius: 9px;
  position: relative;
  transition: all 0.2s;
  flex-shrink: 0;
}

.toggle-cb:checked + .toggle-track {
  background: rgba(0,229,255,0.18);
  border-color: var(--cy);
  box-shadow: 0 0 8px rgba(0,229,255,0.25);
}

.toggle-thumb {
  position: absolute;
  top: 3px; left: 3px;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--muted);
  transition: all 0.2s;
}

.toggle-cb:checked + .toggle-track .toggle-thumb {
  left: 19px;
  background: var(--cy);
  box-shadow: 0 0 6px var(--cy);
}

.toggle-lbl {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: 1px;
  color: var(--text2);
}

.toggle-cb:checked + .toggle-track + .toggle-lbl {
  color: var(--cy);
}

/* Presets — 5 columns for 15 items = 3 rows */
.preset-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.preset-btn {
  font-family: inherit;
  font-size: 10px;
  letter-spacing: 0.8px;
  font-weight: 600;
  padding: 8px 4px;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 3px;
  color: var(--text2);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preset-btn:hover {
  border-color: var(--pc, var(--cy));
  color: var(--pc, var(--cy));
  background: color-mix(in srgb, var(--pc, var(--cy)) 10%, transparent);
}

.preset-btn.active {
  border-color: var(--pc, var(--cy));
  color: var(--pc, var(--cy));
  background: color-mix(in srgb, var(--pc, var(--cy)) 14%, transparent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--pc, var(--cy)) 30%, transparent);
  font-weight: 700;
}

/* Custom Profile Editor */
.custom-profile-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(167,139,250,0.18);
}

.cp-editor-hd {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: 2px;
  color: #a78bfa;
  margin-bottom: 12px;
}

.cp-dup-btn {
  font-family: inherit;
  font-size: 9px;
  letter-spacing: 1px;
  padding: 5px 10px;
  background: rgba(167,139,250,0.08);
  border: 1px solid rgba(167,139,250,0.3);
  border-radius: 3px;
  color: #a78bfa;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}
.cp-dup-btn:hover {
  background: rgba(167,139,250,0.18);
  border-color: rgba(167,139,250,0.6);
}
.cp-dup-standalone {
  display: block;
  width: 100%;
  margin-top: 8px;
  text-align: center;
}

.cp-toggle-btn {
  width: 100%;
  margin: 8px 0;
  padding: 8px 12px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  letter-spacing: 1.2px;
  color: rgba(0,229,255,0.78);
  background: rgba(0,229,255,0.06);
  border: 1px solid rgba(0,229,255,0.24);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.cp-toggle-btn:hover {
  color: var(--cy);
  background: rgba(0,229,255,0.12);
  border-color: rgba(0,229,255,0.42);
}

/* Save Slots */
.cp-slots {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid rgba(167,139,250,0.12);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cp-slots-hd {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: 2px;
  color: var(--muted);
  margin-bottom: 2px;
}

.cp-slot-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.cp-slot-label {
  font-size: 9px;
  letter-spacing: 1px;
  color: #a78bfa;
  width: 42px;
  flex-shrink: 0;
}

.cp-slot-name {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cp-slot-btn {
  font-family: inherit;
  font-size: 9px;
  letter-spacing: 1px;
  padding: 3px 9px;
  border-radius: 3px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s, border-color 0.12s;
}

.cp-save {
  background: rgba(167,139,250,0.08);
  border: 1px solid rgba(167,139,250,0.28);
  color: #a78bfa;
}
.cp-save:hover {
  background: rgba(167,139,250,0.18);
  border-color: rgba(167,139,250,0.55);
}

.cp-load {
  background: rgba(0,229,255,0.07);
  border: 1px solid rgba(0,229,255,0.22);
  color: var(--cy);
}
.cp-load:hover:not(:disabled) {
  background: rgba(0,229,255,0.15);
  border-color: rgba(0,229,255,0.45);
}
.cp-slot-btn:disabled {
  opacity: 0.28;
  cursor: default;
}

.cp-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cp-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.cp-lbl {
  font-size: 16px;
  line-height: 1.4;
  letter-spacing: 0.5px;
  color: #a78bfa;
  width: 44px;
  flex-shrink: 0;
  padding-top: 7px;
  text-align: right;
}

.cp-input {
  flex: 1;
  min-width: 0;
  background: rgba(0,0,20,0.5);
  border: 1px solid rgba(167,139,250,0.3);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 18px;
  letter-spacing: 0;
  padding: 6px 10px;
  line-height: 1.65;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.cp-input:focus {
  border-color: rgba(167,139,250,0.7);
  box-shadow: 0 0 8px rgba(167,139,250,0.25);
}

.cp-input:disabled {
  opacity: 0.45;
  cursor: default;
  border-color: rgba(167,139,250,0.12);
}

.cp-input::placeholder { color: var(--muted); font-size: 16px; }

.cp-textarea {
  resize: vertical;
  min-height: 64px;
  line-height: 1.75;
}

/* ============================================================
   RIGHT: CHAT PANEL
   ============================================================ */
.chat-panel {
  padding: 0;
  gap: 0;
  overflow: hidden;
}

.chat-panel .panel-hd {
  padding: 12px 14px 10px;
  margin-bottom: 0;
}

/* Mood bar */
.chat-mood-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  border-bottom: 1px solid rgba(0,229,255,0.08);
  overflow: hidden;
  flex-shrink: 0;
}

.cmb-fill {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.cmb-label {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--muted);
  flex-shrink: 0;
}

.cmb-name {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--text);
}

.cmb-sep { color: var(--muted); font-size: 11px; }

.cmb-mood {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.5px;
  transition: color 0.4s;
}

/* Messages */
.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 24px;

  overflow-y: auto;
  padding: 18px;

  display: flex;
  flex-direction: column;
  gap: 16px;

  scrollbar-width: thin;
  scrollbar-color: var(--dim) transparent;
}

.msg-wrap {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  max-width: 85%;
}

.msg-wrap.user {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.msg-wrap.error {
  align-self: center;
  max-width: 90%;
  justify-content: center;
}

.msg-av {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.ai-av {
  background: var(--bg2);
  border: 1.5px solid rgba(0,229,255,0.45);
  overflow: hidden;
  box-shadow:
    0 0 0 2px rgba(0,229,255,0.07),
    0 0 14px rgba(0,229,255,0.32),
    0 0 30px rgba(0,229,255,0.1);
}

.ai-av img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
  border-radius: 50%;
}

.user-av {
  background: rgba(168,85,247,0.12);
  border: 1.5px solid rgba(168,85,247,0.55);
  color: var(--pu);
  box-shadow:
    0 0 0 2px rgba(168,85,247,0.07),
    0 0 14px rgba(168,85,247,0.3),
    0 0 30px rgba(168,85,247,0.1);
}

.msg-bubble {
  background: linear-gradient(145deg, rgba(0,229,255,0.08) 0%, rgba(0,229,255,0.03) 100%);
  border: 1px solid rgba(0,229,255,0.22);
  border-radius: 18px 18px 18px 4px;
  padding: 10px 14px;
  max-width: 100%;
  position: relative;
  box-shadow: 0 0 14px rgba(0,229,255,0.1), inset 0 1px 0 rgba(0,229,255,0.07);
}

.msg-wrap.user .msg-bubble {
  background: linear-gradient(145deg, rgba(168,85,247,0.11) 0%, rgba(168,85,247,0.04) 100%);
  border-color: rgba(168,85,247,0.32);
  border-radius: 18px 18px 4px 18px;
  text-align: right;
  box-shadow: 0 0 14px rgba(168,85,247,0.12), inset 0 1px 0 rgba(168,85,247,0.08);
}

.msg-text {
  font-size: 18px;
  color: var(--text);
  line-height: 1.85;
  letter-spacing: 0.3px;
  word-break: break-word;
  white-space: pre-wrap;
}

.editorial-speaker {
  margin-bottom: 5px;
  color: var(--cy);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.internal-discussion {
  margin-bottom: 10px;
  border: 1px solid rgba(167,139,250,0.24);
  border-radius: 8px;
  background: rgba(167,139,250,0.045);
  overflow: hidden;
}

.internal-discussion summary {
  padding: 7px 10px;
  color: #c4b5fd;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
  cursor: pointer;
  user-select: none;
}

.internal-discussion-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 0 10px 9px;
}

.internal-discussion-entry {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 8px;
  border-left: 2px solid rgba(167,139,250,0.55);
  background: rgba(15,23,42,0.38);
}

.internal-discussion-avatar {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(167,139,250,0.35);
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.internal-discussion-content {
  min-width: 0;
}

.internal-discussion-speaker {
  margin-bottom: 3px;
  color: #a78bfa;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.internal-discussion-text {
  color: rgba(226,232,240,0.82);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.msg-image {
  display: block;
  width: min(100%, 420px);
  margin-top: 10px;
  border-radius: 10px;
  border: 1px solid rgba(0,229,255,0.25);
  background: rgba(0,0,0,0.18);
}

.error-bubble {
  background: linear-gradient(145deg, rgba(251,146,60,0.12) 0%, rgba(251,146,60,0.05) 100%);
  border: 1px solid rgba(251,146,60,0.45) !important;
  border-radius: 12px !important;
  text-align: center;
  box-shadow: 0 0 14px rgba(251,146,60,0.15);
}

.error-icon {
  display: block;
  font-size: 18px;
  margin-bottom: 4px;
  color: #fb923c;
}

.error-text {
  color: #fb923c !important;
  font-size: 14px;
}

.msg-time {
  font-size: 10px;
  color: var(--muted);
  margin-top: 6px;
  letter-spacing: 0.5px;
  text-align: right;
}

/* Thinking bubble */
.msg-bubble.thinking {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 14px 18px;
  min-width: 64px;
  border-radius: 18px 18px 18px 4px;
}

.dot-bounce {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--cy);
  box-shadow: 0 0 5px var(--cy);
  animation: bounce 0.9s ease-in-out infinite;
}

/* Image Prompt Box */
.img-prompt-box {
  margin-top: 10px;
  padding: 8px 10px;
  background: rgba(168,85,247,0.07);
  border: 1px solid rgba(168,85,247,0.3);
  border-radius: 8px;
}
.img-prompt-hd {
  font-size: 8px;
  letter-spacing: 1.5px;
  color: rgba(168,85,247,0.7);
  margin-bottom: 5px;
}
.img-prompt-text {
  font-size: 10px;
  color: rgba(200,180,255,0.85);
  line-height: 1.5;
  word-break: break-all;
}
.img-prompt-copy {
  margin-top: 6px;
  font-size: 9px;
  letter-spacing: 1px;
  color: rgba(168,85,247,0.8);
  background: transparent;
  border: 1px solid rgba(168,85,247,0.3);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.img-prompt-copy:hover {
  background: rgba(168,85,247,0.15);
}

/* Manga Mode sections */
.manga-sec {
  margin-top: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  border-left: 2px solid;
}
.manga-sec-hd {
  font-size: 8px;
  letter-spacing: 1.8px;
  margin-bottom: 4px;
  opacity: 0.6;
}
.manga-sec-body {
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}
.manga-sec-scene  { background: rgba(0,229,255,0.05); border-color: rgba(0,229,255,0.3); }
.manga-sec-scene  .manga-sec-hd { color: var(--cy); }
.manga-sec-panel  { background: rgba(168,85,247,0.05); border-color: rgba(168,85,247,0.3); }
.manga-sec-panel  .manga-sec-hd { color: rgba(168,85,247,0.8); }
.manga-sec-prompt { background: rgba(251,191,36,0.05); border-color: rgba(251,191,36,0.3); }
.manga-sec-prompt .manga-sec-hd { color: rgba(251,191,36,0.8); }
.manga-sec-prompt .manga-sec-body { font-size: 10px; color: rgba(200,180,255,0.8); word-break: break-all; }

/* ── 4コマ YAML 表示 ───────────────────────────────────────────── */
.lab-yaml-display {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lab-yaml-title-card,
.lab-yaml-character-card,
.lab-yaml-page-card,
.lab-yaml-scene-card {
  border: 1px solid rgba(0,229,255,0.16);
  background: rgba(2,8,23,0.55);
  border-radius: 8px;
}

.lab-yaml-title-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-color: rgba(251,191,36,0.28);
  background: linear-gradient(135deg, rgba(251,191,36,0.08), rgba(0,229,255,0.04));
}

.lab-yaml-badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: #fbbf24;
  border: 1px solid rgba(251,191,36,0.35);
  background: rgba(251,191,36,0.1);
  border-radius: 4px;
  padding: 3px 6px;
}

.lab-yaml-title {
  font-size: 14px;
  font-weight: 800;
  color: #f8fafc;
  letter-spacing: 0.04em;
}

.lab-yaml-sub {
  margin-top: 2px;
  font-size: 9px;
  color: rgba(148,163,184,0.8);
  letter-spacing: 1.2px;
}

.lab-yaml-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.lab-yaml-character-card {
  padding: 9px 10px;
  border-color: rgba(168,85,247,0.24);
  background: rgba(168,85,247,0.045);
}

.lab-yaml-card-hd,
.lab-yaml-page-hd,
.lab-yaml-scene-hd {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: rgba(0,229,255,0.75);
}

.lab-yaml-character-name {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 800;
  color: #e9d5ff;
}

.lab-yaml-character-visual {
  margin-top: 5px;
  font-size: 11.5px;
  line-height: 1.6;
  color: rgba(226,232,240,0.88);
  white-space: pre-wrap;
}

.lab-yaml-explanation {
  padding: 8px 10px;
  border-left: 2px solid rgba(148,163,184,0.4);
  background: rgba(100,116,139,0.06);
  color: rgba(203,213,225,0.82);
  font-size: 11.5px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.lab-yaml-page-card {
  padding: 9px;
  border-color: rgba(0,229,255,0.18);
}

.lab-yaml-page-hd {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2px 8px;
  color: rgba(0,229,255,0.82);
}

.lab-yaml-layout {
  color: #fbbf24;
  border: 1px solid rgba(251,191,36,0.24);
  background: rgba(251,191,36,0.06);
  border-radius: 999px;
  padding: 2px 7px;
}

.lab-yaml-scenes {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.lab-yaml-scene-card {
  padding: 8px 10px;
  border-left: 2px solid rgba(34,211,238,0.55);
}

.lab-yaml-scene-text {
  margin-top: 5px;
  font-size: 12.5px;
  line-height: 1.65;
  color: #e2e8f0;
  white-space: pre-wrap;
}

.lab-yaml-dialogue {
  margin-top: 6px;
  padding: 5px 7px;
  border-radius: 5px;
  background: rgba(251,191,36,0.06);
  color: #fde68a;
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.lab-yaml-prompt-fold {
  margin-top: 7px;
  border-top: 1px solid rgba(100,116,139,0.16);
  padding-top: 5px;
}

.lab-yaml-prompt-fold summary {
  cursor: pointer;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: rgba(168,85,247,0.82);
  user-select: none;
}

.lab-yaml-prompt-text {
  margin-top: 6px;
  font-size: 10.5px;
  line-height: 1.55;
  color: rgba(200,180,255,0.82);
  word-break: break-word;
  white-space: pre-wrap;
}

.yonkoma-display {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.yonkoma-preamble { margin-bottom: 2px; }
.yonkoma-postamble { margin-top: 2px; }

.yonkoma-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: rgba(251,191,36,0.05);
  border: 1px solid rgba(251,191,36,0.22);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #fbbf24;
  letter-spacing: 0.02em;
}
.yonkoma-title-badge {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 1.2px;
  padding: 2px 5px;
  background: rgba(251,191,36,0.12);
  border: 1px solid rgba(251,191,36,0.3);
  border-radius: 3px;
  color: #f59e0b;
  flex-shrink: 0;
}

.yonkoma-panels {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.yonkoma-panel {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 10px;
  background: rgba(0,229,255,0.025);
  border: 1px solid rgba(0,229,255,0.1);
  border-left: 2px solid rgba(0,229,255,0.35);
  border-radius: 4px;
}
.yonkoma-panel-main {
  display: flex;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.yonkoma-panel-num {
  font-size: 11px;
  font-weight: 700;
  color: var(--cy, #00e5ff);
  opacity: 0.65;
  white-space: nowrap;
  padding-top: 1px;
  min-width: 22px;
}
.yonkoma-panel-fields {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.yonkoma-panel-actions {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex-shrink: 0;
}
.ypb {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.4px;
  font-family: inherit;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  white-space: nowrap;
}
.ypb:disabled { opacity: 0.35; cursor: not-allowed; }
.ypb-regen {
  color: #a78bfa;
  background: rgba(167,139,250,0.06);
  border: 1px solid rgba(167,139,250,0.22);
}
.ypb-regen:hover:not(:disabled) {
  background: rgba(167,139,250,0.14);
  border-color: rgba(167,139,250,0.48);
}
.ypb-img {
  color: #22d3ee;
  background: rgba(34,211,238,0.05);
  border: 1px solid rgba(34,211,238,0.2);
}
.ypb-img:hover:not(:disabled) {
  background: rgba(34,211,238,0.12);
  border-color: rgba(34,211,238,0.44);
}
.yonkoma-field {
  font-size: 11.5px;
  line-height: 1.55;
}
.yonkoma-field-key {
  font-size: 8.5px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #4b5563;
  margin-right: 6px;
}
.yonkoma-field-val {
  color: #cbd5e1;
}

.yonkoma-code-wrap {
  border: 1px solid rgba(100,116,139,0.18);
  border-radius: 6px;
  overflow: hidden;
}
.yonkoma-code-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 10px;
  background: rgba(100,116,139,0.07);
  border-bottom: 1px solid rgba(100,116,139,0.13);
}
.yonkoma-code-label {
  font-size: 8.5px;
  letter-spacing: 1.5px;
  color: #4b5563;
  font-weight: 600;
}
.yonkoma-code-btns {
  display: flex;
  gap: 4px;
}
.yonkoma-copy-btn {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: #22d3ee;
  background: transparent;
  border: 1px solid rgba(34,211,238,0.22);
  border-radius: 3px;
  padding: 1px 8px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s;
}
.yonkoma-copy-btn:hover {
  background: rgba(34,211,238,0.1);
  border-color: rgba(34,211,238,0.45);
}
.yonkoma-dl-btn {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: #34d399;
  background: transparent;
  border: 1px solid rgba(52,211,153,0.22);
  border-radius: 3px;
  padding: 1px 8px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s;
}
.yonkoma-dl-btn:hover {
  background: rgba(52,211,153,0.1);
  border-color: rgba(52,211,153,0.45);
}
.yonkoma-code {
  margin: 0;
  padding: 10px 12px;
  background: rgba(0,0,0,0.35);
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.65;
  color: #94a3b8;
  overflow-x: auto;
  white-space: pre;
}

.studio-btn {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 6px 10px;
  font-size: 10px;
  letter-spacing: 1px;
  color: rgba(251,191,36,0.85);
  background: rgba(251,191,36,0.05);
  border: 1px solid rgba(251,191,36,0.3);
  border-radius: 4px;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s, border-color 0.15s;
}
.studio-btn:hover {
  background: rgba(251,191,36,0.12);
  border-color: rgba(251,191,36,0.5);
}

.manga-send-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 3px 10px;
  font-size: 10px;
  font-family: inherit;
  letter-spacing: 1px;
  font-weight: 600;
  color: var(--pu);
  background: rgba(168,85,247,0.05);
  border: 1px solid rgba(168,85,247,0.25);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.manga-send-btn:hover:not(:disabled) {
  background: rgba(168,85,247,0.12);
  border-color: rgba(168,85,247,0.5);
}
.manga-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.manga-send-btn.loading {
  color: var(--cy);
  border-color: rgba(0,229,255,0.3);
}

.msg-action-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.speak-send-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 10px;
  letter-spacing: 1.2px;
  font-family: inherit;
  font-weight: 600;
  color: #38bdf8;
  background: rgba(56,189,248,0.06);
  border: 1px solid rgba(56,189,248,0.25);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.speak-send-btn:hover {
  background: rgba(56,189,248,0.12);
  border-color: rgba(56,189,248,0.5);
}

.yaml-send-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 10px;
  letter-spacing: 1.2px;
  font-family: inherit;
  font-weight: 600;
  color: #34d399;
  background: rgba(52,211,153,0.06);
  border: 1px solid rgba(52,211,153,0.25);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.yaml-send-btn:hover:not(:disabled) {
  background: rgba(52,211,153,0.12);
  border-color: rgba(52,211,153,0.5);
}
.yaml-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.yaml-send-btn.loading {
  color: var(--cy);
  border-color: rgba(0,229,255,0.3);
}

/* Reference image strip (above chat input) */
.character-registry-panel {
  border-top: 1px solid rgba(52,211,153,0.16);
  background: rgba(52,211,153,0.025);
}

.character-register-fields {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(140px, 1fr) auto;
  gap: 6px;
  padding: 7px 12px 9px;
}

.character-register-input {
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid rgba(52,211,153,0.2);
  border-radius: 4px;
  outline: none;
  background: rgba(2,8,23,0.72);
  color: var(--text);
  font: inherit;
  font-size: 10px;
}

.character-register-input:focus {
  border-color: rgba(52,211,153,0.55);
}

.character-register-button {
  justify-content: center;
  color: #6ee7b7;
  border-color: rgba(52,211,153,0.3);
  background: rgba(52,211,153,0.08);
}

.registered-character-chip {
  display: grid;
  grid-template-columns: 52px minmax(140px, 1fr) minmax(120px, 0.8fr) auto;
  align-items: center;
  width: min(100%, 720px);
  max-width: none;
}

.registered-character-chip .ref-img-thumb {
  grid-row: 1;
}

@media (max-width: 900px) {
  .character-register-fields {
    grid-template-columns: 1fr 1fr;
  }

  .character-register-button {
    grid-column: 1 / -1;
  }

  .registered-character-chip {
    grid-template-columns: 48px minmax(0, 1fr) auto;
  }

  .registered-character-chip .ref-img-note {
    grid-column: 2;
  }
}

.ref-section-label {
  padding: 4px 12px 0;
  color: #34d399;
  background: rgba(52,211,153,0.03);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.2px;
}
.ref-section-label.story {
  color: #a78bfa;
  background: rgba(167,139,250,0.03);
}
.ref-img-strip {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 12px 4px;
  border-top: 1px solid rgba(52,211,153,0.15);
  background: rgba(52,211,153,0.03);
  flex-shrink: 0;
}
.ref-img-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(52,211,153,0.06);
  border: 1px solid rgba(52,211,153,0.2);
  border-radius: 4px;
  padding: 4px 6px;
}
.ref-img-thumb {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid rgba(52,211,153,0.2);
  flex-shrink: 0;
}
.ref-registry-badge {
  padding: 2px 5px;
  border-radius: 3px;
  background: rgba(0,229,255,0.08);
  border: 1px solid rgba(0,229,255,0.3);
  color: #7dd3fc;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  flex-shrink: 0;
}
.ref-img-note {
  width: 120px;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(52,211,153,0.25);
  color: var(--text);
  font-size: 11px;
  font-family: inherit;
  padding: 2px 4px;
  outline: none;
}
.ref-img-note::placeholder { color: var(--muted); font-size: 10px; }
.ref-img-remove {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 2px;
  line-height: 1;
  transition: color 0.15s;
  flex-shrink: 0;
}
.ref-img-remove:hover { color: #f87171; }

.story-ref-strip {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 12px;
  border-top: 1px solid rgba(167,139,250,0.15);
  background: rgba(167,139,250,0.03);
  flex-shrink: 0;
}
.story-ref-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 320px;
  padding: 5px 7px;
  border: 1px solid rgba(167,139,250,0.25);
  border-radius: 4px;
  background: rgba(167,139,250,0.07);
}
.story-ref-chip.active {
  border-color: rgba(167,139,250,0.65);
  box-shadow: 0 0 8px rgba(167,139,250,0.14);
}
.story-ref-kind {
  color: #c4b5fd;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.8px;
}
.story-ref-name {
  overflow: hidden;
  color: var(--text);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.story-ref-active,
.story-ref-use {
  color: #c4b5fd;
  font-family: inherit;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.6px;
}
.story-ref-use {
  padding: 2px 4px;
  border: 1px solid rgba(167,139,250,0.3);
  border-radius: 2px;
  background: transparent;
  cursor: pointer;
}
.story-ref-use:hover {
  background: rgba(167,139,250,0.15);
}

.character-analysis-status {
  padding: 4px 12px;
  border-top: 1px solid rgba(251,191,36,0.12);
  background: rgba(251,191,36,0.04);
  color: rgba(251,191,36,0.82);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.character-analysis-status.ready {
  border-color: rgba(52,211,153,0.18);
  background: rgba(52,211,153,0.05);
  color: #6ee7b7;
}

.ref-quick-actions {
  display: flex;
  gap: 6px;
  padding: 4px 12px 5px;
  background: rgba(52,211,153,0.03);
  border-top: 1px solid rgba(52,211,153,0.08);
  flex-shrink: 0;
}

.yonkoma-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 11px;
  font-size: 10px;
  font-family: inherit;
  letter-spacing: 1px;
  font-weight: 600;
  color: #34d399;
  background: rgba(52,211,153,0.06);
  border: 1px solid rgba(52,211,153,0.28);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
}
.yonkoma-btn:hover:not(:disabled) {
  background: rgba(52,211,153,0.14);
  border-color: rgba(52,211,153,0.55);
  box-shadow: 0 0 8px rgba(52,211,153,0.15);
}
.yonkoma-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.yonkoma-icon {
  font-size: 9px;
  letter-spacing: -1px;
  opacity: 0.8;
}

/* REF upload button inside chat-input-area */
.ref-upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px 7px;
  font-size: 9px;
  letter-spacing: 1px;
  font-family: inherit;
  font-weight: 600;
  color: #34d399;
  background: rgba(52,211,153,0.06);
  border: 1px solid rgba(52,211,153,0.25);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s, border-color 0.12s;
  align-self: stretch;
}
.ref-upload-btn:hover:not(.disabled) {
  background: rgba(52,211,153,0.12);
  border-color: rgba(52,211,153,0.5);
}
.ref-upload-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.story-ref-upload-btn {
  color: #a78bfa;
  background: rgba(167,139,250,0.06);
  border-color: rgba(167,139,250,0.25);
}
.story-ref-upload-btn:hover {
  background: rgba(167,139,250,0.12);
  border-color: rgba(167,139,250,0.5);
}

/* ============================================================
   BEST SCENE SELECTOR
   ============================================================ */
.best-scene-btn {
  font-size: 9px;
  letter-spacing: 1.5px;
  font-family: inherit;
  color: var(--muted);
  border: 1px solid var(--muted);
  background: transparent;
  padding: 2px 8px;
  border-radius: 2px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
}
.best-scene-btn:hover {
  color: rgba(251,191,36,0.9);
  border-color: rgba(251,191,36,0.6);
  background: rgba(251,191,36,0.06);
}
.best-scene-btn.active {
  color: rgba(251,191,36,1);
  border-color: rgba(251,191,36,0.7);
  background: rgba(251,191,36,0.1);
  box-shadow: 0 0 6px rgba(251,191,36,0.25);
}

.diary-btn {
  font-size: 9px;
  letter-spacing: 1.5px;
  font-family: inherit;
  color: var(--muted);
  border: 1px solid var(--muted);
  background: transparent;
  padding: 2px 8px;
  border-radius: 2px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
  flex-shrink: 0;
}
.diary-btn:hover:not(:disabled) {
  color: #34d399;
  border-color: #34d399;
  background: rgba(52,211,153,0.07);
}
.diary-btn:disabled,
.diary-btn.loading {
  opacity: 0.45;
  cursor: not-allowed;
}

.bs-panel {
  flex-shrink: 0;
  border: 1px solid rgba(251,191,36,0.3);
  border-radius: 4px;
  background: rgba(251,191,36,0.04);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bs-hd {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(251,191,36,0.15);
}
.bs-star  { color: rgba(251,191,36,0.9); font-size: 11px; }
.bs-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgba(251,191,36,0.95);
  text-shadow: 0 0 8px rgba(251,191,36,0.35);
}
.bs-sub {
  font-size: 8.5px;
  color: var(--muted);
  letter-spacing: 0.8px;
}
.bs-flex  { flex: 1; }
.bs-close-btn {
  font-size: 10px;
  color: var(--muted);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: color 0.15s;
}
.bs-close-btn:hover { color: rgba(244,63,94,0.8); }

.bs-empty {
  font-size: 12px;
  color: var(--muted);
  padding: 8px 4px;
  letter-spacing: 0.5px;
}

.bs-scene {
  border: 1px solid rgba(251,191,36,0.15);
  border-radius: 4px;
  background: rgba(0,5,18,0.4);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bs-scene-hd {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.bs-rank {
  font-size: 10px;
  font-weight: 700;
  color: rgba(251,191,36,0.9);
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.bs-score-badge {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 2px;
  background: rgba(251,191,36,0.08);
  border: 1px solid rgba(251,191,36,0.25);
  color: rgba(251,191,36,0.7);
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.bs-tag {
  font-size: 8px;
  padding: 1px 5px;
  border-radius: 2px;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}
.bs-tag:nth-child(1) { background: rgba(0,229,255,0.08);  border: 1px solid rgba(0,229,255,0.2);  color: var(--cy); }
.bs-tag:nth-child(2) { background: rgba(168,85,247,0.08); border: 1px solid rgba(168,85,247,0.2); color: var(--pu); }
.bs-tag:nth-child(3) { background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.2); color: #34d399; }
.bs-tag:nth-child(4) { background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.2); color: rgba(251,191,36,0.85); }

.bs-excerpt {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bs-user,
.bs-ai {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text2);
  padding: 4px 8px;
  border-radius: 3px;
  word-break: break-all;
}
.bs-user { background: rgba(0,229,255,0.04);  border-left: 2px solid rgba(0,229,255,0.2); }
.bs-ai   { background: rgba(168,85,247,0.04); border-left: 2px solid rgba(168,85,247,0.2); }

/* Input area */
.chat-input-area {
  display: flex;
  gap: 8px;
  padding: 18px 20px;
  border-top: 1px solid var(--pborder);
  background: rgba(0,5,18,0.6);
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 18px;
  padding: 10px 12px;
  resize: none;
  outline: none;
  line-height: 1.55;
  min-height: 46px;
  transition: border-color 0.15s;
}

.chat-input:focus {
  border-color: rgba(0,229,255,0.35);
  box-shadow: 0 0 8px rgba(0,229,255,0.1);
}

.chat-input::placeholder { color: var(--muted); font-size: 15px; }

.reset-chat-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  height: auto;
  align-self: stretch;
  background: rgba(255,80,80,0.06);
  border: 1px solid rgba(255,80,80,0.22);
  border-radius: 4px;
  color: rgba(255,110,110,0.6);
  font-size: 12px;
  font-family: inherit;
  letter-spacing: 0.08em;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
  flex-shrink: 0;
}
.reset-chat-btn:hover:not(:disabled) {
  background: rgba(255,80,80,0.14);
  border-color: rgba(255,80,80,0.45);
  color: rgba(255,130,130,0.9);
}
.reset-chat-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.send-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  height: auto;
  align-self: stretch;
  background: rgba(0,229,255,0.1);
  border: 1px solid rgba(0,229,255,0.3);
  border-radius: 4px;
  color: var(--cy);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 1.5px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.18);
  box-shadow: 0 0 12px rgba(0,229,255,0.25);
}

.send-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

/* ============================================================
   PROMPT MONITOR
   ============================================================ */
.prompt-monitor {
  border-top: 1px solid var(--pborder);
  background: rgba(2,5,18,0.88);
  padding: 8px 16px;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.prompt-monitor::before {
  content: '';
  position: absolute;
  top: -1px; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--pu) 40%, var(--cy) 70%, transparent 100%);
  opacity: 0.35;
}

.pm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.pm-diamond { color: var(--pu); font-size: 10px; }

.pm-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--pu);
  text-shadow: 0 0 8px var(--pu-glow);
}

.pm-sub {
  font-size: 9.5px;
  color: var(--muted);
  letter-spacing: 1px;
}

.pm-line { flex: 1; height: 1px; background: var(--pborder); }

.pm-badge {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--green);
  border: 1px solid rgba(52,211,153,0.25);
  padding: 2px 7px;
  border-radius: 2px;
  animation: blink 2s ease-in-out infinite;
}

.pm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.param-chip {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.1);
  border-radius: 3px;
  padding: 3px 8px;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.param-chip.hi {
  background: rgba(168,85,247,0.05);
  border-color: rgba(168,85,247,0.15);
}

.pk { color: var(--cc, var(--cy)); letter-spacing: 0.5px; }
.peq { color: var(--muted); }
.pv { color: var(--text); font-weight: 600; }

.param-chip.hi .pk { color: var(--pu); }

/* ============================================================
   RIGHT PANEL — CHARACTER VIEWER
   ============================================================ */
.char-viewer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 0 16px;
  border-bottom: 1px solid rgba(0,229,255,0.12);
}

.cv-avatar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Larger ring for the viewer */
.cv-avatar-ring {
  width: 200px; height: 200px;
  border-radius: 50%;
  padding: 3px;
  background: conic-gradient(var(--cy) 0%, var(--pu) 50%, var(--cy) 100%);
  animation: ring-spin 8s linear infinite;
  flex-shrink: 0;
}

.cv-avatar-wrap.glow-active .avatar-inner {
  animation: avatar-glow-pulse 3s ease-in-out infinite;
}

/* Larger name in the viewer */
.cv-name-large {
  font-size: 22px;
  letter-spacing: 3px;
  text-shadow: 0 0 18px var(--cy-glow), 0 0 40px rgba(0,229,255,0.1);
}

/* Speaking indicator */
.cv-speaking {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
  padding: 5px 16px;
  border-radius: 14px;
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.08);
  transition: border-color 0.3s, background 0.3s, box-shadow 0.3s;
}

.cv-speaking.active {
  border-color: rgba(0,229,255,0.38);
  background: rgba(0,229,255,0.09);
  box-shadow: 0 0 16px rgba(0,229,255,0.14);
}

.cv-speak-label {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--cy);
  text-shadow: 0 0 8px var(--cy-glow);
  font-weight: 600;
}

.cv-standby {
  font-size: 10px;
  letter-spacing: 2.5px;
  color: var(--muted);
}

/* Voice progress bar */
.cv-voice-wrap {
  width: 100%;
  padding: 0 4px;
}

.cv-voice-label {
  font-size: 8.5px;
  letter-spacing: 2px;
  color: var(--muted);
  margin-bottom: 5px;
}

.cv-voice-track {
  width: 100%;
  height: 4px;
  background: rgba(0,229,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}

.cv-voice-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--cy), var(--pu));
  border-radius: 2px;
}

.cv-voice-fill.speaking {
  animation: voice-wave 1.4s ease-in-out infinite;
}

/* Sub-section header spacing inside right-panel */
.cv-sub-hd {
  margin-top: 6px;
}

/* ============================================================
   ANIMATIONS
   ============================================================ */
@keyframes hex-pulse {
  0%, 100% { filter: drop-shadow(0 0 6px rgba(0,229,255,0.5)); }
  50%       { filter: drop-shadow(0 0 14px rgba(0,229,255,0.9)); }
}

@keyframes dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.7); }
}

@keyframes ring-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@keyframes avatar-glow-pulse {
  0%, 100% {
    box-shadow: 0 0 6px rgba(0,229,255,0.2), inset 0 0 6px rgba(0,229,255,0.05);
  }
  50% {
    box-shadow: 0 0 22px rgba(0,229,255,0.55), 0 0 40px rgba(0,229,255,0.15), inset 0 0 14px rgba(0,229,255,0.12);
  }
}

@keyframes scan {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(200%); }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); opacity: 0.6; }
  50%       { transform: translateY(-5px); opacity: 1; }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

@keyframes voice-wave {
  0%   { width: 8%;  }
  20%  { width: 55%; }
  40%  { width: 28%; }
  60%  { width: 78%; }
  80%  { width: 42%; }
  100% { width: 8%;  }
}

/* ============================================================
   LAYOUT SWITCH (header toggle)
   ============================================================ */
.layout-switch {
  display: flex;
  min-height: 34px;
  border: 1px solid rgba(0,229,255,0.24);
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(0,229,255,0.035);
  box-sizing: border-box;
  position: relative;
  z-index: 4;
  pointer-events: auto;
}

.ls-btn {
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 1.25px;
  color: rgba(138,180,194,0.82);
  background: transparent;
  border: none;
  padding: 0 12px;
  min-height: 34px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  border-right: 1px solid rgba(0,229,255,0.16);
  box-sizing: border-box;
  pointer-events: auto;
}

.ls-btn:last-child { border-right: none; }

.ls-btn:hover {
  background: rgba(0,229,255,0.08);
  color: var(--cy);
}

.ls-btn.active {
  background: rgba(0,229,255,0.14);
  color: var(--cy);
  text-shadow: 0 0 6px rgba(0,229,255,0.3);
}

/* ============================================================
   2COL: LARGE CHARACTER VIEWER
   ============================================================ */
.char-viewer-large {
  flex: 1.4;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  gap: 0;
  overflow: hidden;
}

/* Viewer type tabs in panel-hd */
.cv-type-tabs {
  display: flex;
  gap: 4px;
}

.cv-tab {
  font-family: inherit;
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--muted);
  background: rgba(0,229,255,0.03);
  border: 1px solid var(--pborder);
  padding: 3px 9px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s;
}

.cv-tab.active,
.cv-tab:not([disabled]):hover {
  color: var(--cy);
  border-color: var(--cy);
  background: rgba(0,229,255,0.08);
  text-shadow: 0 0 6px var(--cy-glow);
}

.cv-tab[disabled]:not(.active) {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ⚙ 設定ボタン — PNG選択中のみ表示される区切り付きタブ */
.cv-tab-settings {
  margin-left: 6px;
  padding-left: 8px;
  border-left: 1px solid rgba(0,229,255,0.20);
  color: rgba(0,229,255,0.55);
}
.cv-tab-settings.active {
  color: rgba(251,191,36,0.90);
  border-color: rgba(251,191,36,0.45);
  background: rgba(251,191,36,0.07);
  text-shadow: 0 0 6px rgba(251,191,36,0.50);
}

/* ============================================================
   PNG-TUBER 設定パネル — ビューア上に重なるオーバーレイ
   ============================================================ */
.png-settings-panel {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  max-height: calc(100% - 16px);
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 20;
  background: rgba(4, 8, 18, 0.88);
  border: 1px solid rgba(0,229,255,0.22);
  border-radius: 4px;
  backdrop-filter: blur(6px);
}

.psp-title {
  font-size: 9px;
  letter-spacing: 1.8px;
  color: var(--cy);
  text-shadow: 0 0 6px var(--cy-glow);
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0,229,255,0.15);
  flex-shrink: 0;
}

.psp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
}

.psp-label {
  font-size: 9px;
  letter-spacing: 1.2px;
  color: var(--muted);
  width: 52px;
  flex-shrink: 0;
}

.psp-slider {
  flex: 1;
  height: 3px;
  accent-color: var(--cy);
  cursor: pointer;
}

.psp-val {
  font-size: 9px;
  color: var(--text2);
  width: 36px;
  text-align: right;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.psp-avatars {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.psp-av-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--pborder);
  background: var(--bg2);
  cursor: pointer;
  padding: 1px;
  transition: border-color 0.15s;
  overflow: hidden;
}
.psp-av-btn:hover   { border-color: var(--cy); }
.psp-av-btn.active  { border-color: var(--cy); box-shadow: 0 0 6px var(--cy-glow); }

.psp-av-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  object-position: top;
}

.psp-toggles {
  gap: 12px;
  flex-wrap: wrap;
}

.psp-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  font-size: 9px;
  letter-spacing: 1.2px;
  color: var(--muted);
}
.psp-toggle input[type="checkbox"] {
  accent-color: var(--cy);
  width: 13px;
  height: 13px;
  cursor: pointer;
}
.psp-toggle:has(input:checked) span {
  color: var(--cy);
}

.psp-select {
  flex: 1;
}

/* Large stage area */
.cvl-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 24px 0 16px;
  min-height: 0;
}

/* Spinning conic ring — large version */
.cvl-ring {
  width: min(360px, 55vh);
  height: min(360px, 55vh);
  border-radius: 50%;
  padding: 4px;
  background: conic-gradient(var(--cy) 0%, var(--pu) 50%, var(--cy) 100%);
  animation: ring-spin 10s linear infinite;
  flex-shrink: 0;
}

/* Glow when glowPulse is on */
.cvl-stage.glow-active .cvl-inner {
  animation: avatar-glow-pulse 3s ease-in-out infinite;
}

.cvl-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg2);
  position: relative;
  border: 1px solid rgba(0,229,255,0.22);
}

.cvl-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
  display: block;
  border-radius: 50%;
}

/* Thinking dots overlay on large viewer */
.cvl-thinking-overlay {
  position: absolute;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  background: rgba(2,9,18,0.75);
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--pborder);
}

/* Info bar at bottom of 2col viewer */
.cvl-info-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 4px 4px;
  border-top: 1px solid var(--pborder);
  flex-wrap: wrap;
}

.cvl-name-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 90px;
}

.cvl-name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2.5px;
  color: var(--cy);
  text-shadow: 0 0 12px var(--cy-glow);
  line-height: 1;
}

.cvl-mode {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--muted);
  text-transform: uppercase;
}

.cvl-status-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 80px;
}

.cvl-mood {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.5px;
}

.cvl-speak-badge {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--pu);
  text-shadow: 0 0 8px var(--pu-glow);
  animation: blink 0.9s ease-in-out infinite;
}

.cvl-standby {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--muted);
}

.cvl-bars {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 120px;
}

.cvl-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cvl-bar-lbl {
  font-size: 8.5px;
  letter-spacing: 1.5px;
  color: var(--muted);
  width: 44px;
  flex-shrink: 0;
}

.cvl-bar-track {
  flex: 1;
  height: 3px;
  background: rgba(0,229,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}

.cvl-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.cvl-bar-val {
  font-size: 9px;
  color: var(--text2);
  width: 22px;
  text-align: right;
  flex-shrink: 0;
}

/* ============================================================
   PNG-TUBER STAGE — 2COL-only
   ============================================================ */
.cvl-png-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding: 16px;
}

/* PNGTuberViewer のルート要素が cvl-png-stage を埋める */
.cvl-png-stage :global(.png-tuber-wrap) {
  flex: 1;
  min-height: 0;
}

/* ============================================================
   VRM STAGE — 2COL-only
   ============================================================ */
.cvl-vrm-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* AvatarViewer が cvl-vrm-stage を埋める */
.cvl-vrm-stage :global(.vrm-wrap) {
  flex: 1;
  min-height: 0;
}

/* VRM ファイル読み込みバー */
.vrm-load-row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-top: 1px solid rgba(0,229,255,0.08);
}

.vrm-file-btn {
  cursor: pointer;
  font-family: inherit;
  font-size: 9px;
  letter-spacing: 1.4px;
  color: var(--cy);
  background: rgba(0,229,255,0.06);
  border: 1px solid rgba(0,229,255,0.25);
  padding: 4px 10px;
  border-radius: 3px;
  transition: background 0.15s, border-color 0.15s;
  user-select: none;
}
.vrm-file-btn:hover {
  background: rgba(0,229,255,0.14);
  border-color: rgba(0,229,255,0.55);
}

.vrm-loaded-badge {
  font-size: 8px;
  letter-spacing: 1.2px;
  color: #34d399;
  text-shadow: 0 0 8px #34d39960;
}

/* ============================================================
   PNGTUBER — 2COL-only avatar animations
   ============================================================ */

/* 瞬き: 目の位置(上30%)を起点に一瞬潰す */
.cvl-img.png-blink {
  animation: pngtuber-blink 0.12s ease-in-out;
  transform-origin: 50% 30%;
}

/* 口パク: 縦方向の小さいバウンス（発話感） */
.cvl-img.png-speaking {
  animation: pngtuber-speak 0.28s ease-in-out infinite;
}

/* Thinking オーバーレイ: 紫グローを cvl-inner の上に重ねる */
.png-think-overlay {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  animation: pngtuber-think-glow 0.85s ease-in-out infinite;
}

@keyframes pngtuber-blink {
  0%, 100% { transform: scaleY(1);    }
  40%, 60% { transform: scaleY(0.04); }
}

@keyframes pngtuber-speak {
  0%   { transform: translateY(0)    scaleY(1);    }
  20%  { transform: translateY(-3px) scaleY(1.01); }
  50%  { transform: translateY(0)    scaleY(0.99); }
  80%  { transform: translateY(-2px) scaleY(1.01); }
  100% { transform: translateY(0)    scaleY(1);    }
}

@keyframes pngtuber-think-glow {
  0%, 100% {
    box-shadow: inset 0 0 0 2px rgba(168,85,247,0.18),
                0 0 10px rgba(168,85,247,0.12);
    background: rgba(168,85,247,0.01);
  }
  50% {
    box-shadow: inset 0 0 0 3px rgba(168,85,247,0.65),
                0 0 32px rgba(168,85,247,0.32);
    background: rgba(168,85,247,0.05);
  }
}

/* ============================================================
   COMPARE MODE TOGGLE
   ============================================================ */
.compare-toggle-btn {
  font-size: 9px;
  letter-spacing: 1.5px;
  font-family: inherit;
  color: var(--muted);
  border: 1px solid var(--muted);
  background: transparent;
  padding: 2px 8px;
  border-radius: 2px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
}
.compare-toggle-btn:hover {
  color: var(--cy);
  border-color: var(--cy);
  background: var(--cy-dim);
}
.compare-toggle-btn.active {
  color: #a78bfa;
  border-color: #a78bfa;
  background: rgba(167,139,250,0.12);
  box-shadow: 0 0 6px rgba(167,139,250,0.3);
}

/* ============================================================
   COMPARE PANEL
   ============================================================ */
.cmp-panel {
  flex-shrink: 0;
  border: 1px solid rgba(167,139,250,0.25);
  border-radius: 4px;
  background: rgba(167,139,250,0.04);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cmp-hd {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(167,139,250,0.15);
}
.cmp-diamond { color: #a78bfa; font-size: 10px; }
.cmp-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #a78bfa;
  text-shadow: 0 0 8px rgba(167,139,250,0.4);
}
.cmp-badge {
  font-size: 8px;
  letter-spacing: 1px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 2px;
}
.cmp-badge.ts { background: rgba(0,229,255,0.15); color: var(--cy); border: 1px solid rgba(0,229,255,0.3); }
.cmp-badge.py { background: rgba(167,139,250,0.15); color: #a78bfa; border: 1px solid rgba(167,139,250,0.3); }
.cmp-badge.sm { font-size: 7px; padding: 1px 4px; }
.cmp-vs { font-size: 8px; color: var(--muted); letter-spacing: 1px; }
.cmp-flex { flex: 1; }
.cmp-sub { font-size: 8.5px; color: var(--muted); letter-spacing: 1px; }

.cmp-input-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.cmp-input {
  flex: 1;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 5px 8px;
  border-radius: 3px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.cmp-input:focus {
  border-color: rgba(167,139,250,0.5);
  box-shadow: 0 0 6px rgba(167,139,250,0.2);
}
.cmp-input::placeholder { color: var(--muted); }
.cmp-run-btn {
  font-size: 9px;
  letter-spacing: 1.5px;
  font-family: inherit;
  padding: 5px 12px;
  border-radius: 3px;
  border: 1px solid #a78bfa;
  background: rgba(167,139,250,0.12);
  color: #a78bfa;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
}
.cmp-run-btn:hover:not(:disabled) {
  background: rgba(167,139,250,0.22);
  box-shadow: 0 0 8px rgba(167,139,250,0.3);
}
.cmp-run-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.cmp-tested {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
}
.ct-label { color: var(--muted); letter-spacing: 1px; }
.ct-text { color: var(--text2); font-style: italic; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.ct-trust { color: var(--cy); letter-spacing: 1px; flex-shrink: 0; }

.cmp-error {
  font-size: 9.5px;
  color: var(--red);
  padding: 4px 8px;
  background: rgba(244,63,94,0.08);
  border: 1px solid rgba(244,63,94,0.2);
  border-radius: 3px;
}

.cmp-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.cmp-col {
  padding: 8px 10px;
  border-radius: 3px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ts-side { background: rgba(0,229,255,0.04); border: 1px solid rgba(0,229,255,0.12); }
.py-side { background: rgba(167,139,250,0.04); border: 1px solid rgba(167,139,250,0.12); }

.cmp-col-hd {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: var(--text2);
  display: flex;
  align-items: center;
  gap: 5px;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  margin-bottom: 3px;
}
.cmp-emotion {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--ec);
  text-shadow: 0 0 10px var(--ec);
  text-transform: uppercase;
}
.cmp-conf {
  font-size: 11px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.cmp-detail {
  font-size: 9px;
  color: var(--muted);
  letter-spacing: 0.5px;
}
.cmp-extra {
  font-size: 9px;
  color: var(--muted);
  font-style: italic;
}
.cmp-delta { font-size: 10px; letter-spacing: 1px; }
.cmp-delta.pos { color: var(--green); }
.cmp-delta.neg { color: var(--red); }
.cmp-fallback {
  font-size: 8px;
  padding: 1px 5px;
  border-radius: 2px;
  background: rgba(251,146,60,0.15);
  border: 1px solid rgba(251,146,60,0.3);
  color: var(--orange);
  letter-spacing: 1px;
  align-self: flex-start;
}
.cmp-empty { font-size: 10px; color: var(--muted); font-style: italic; }

.cmp-verdict {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  background: rgba(244,63,94,0.08);
  border: 1px solid rgba(244,63,94,0.2);
  color: var(--red);
}
.cmp-verdict.match {
  background: rgba(52,211,153,0.08);
  border-color: rgba(52,211,153,0.2);
  color: var(--green);
}
.cv-detail {
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.5px;
  color: var(--text2);
}
.cmp-log-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
.cmp-log-count {
  font-size: 9px;
  letter-spacing: 1px;
  color: var(--muted);
  margin-right: auto;
}
.cmp-log-num {
  color: #a78bfa;
  font-weight: 700;
}
.cmp-log-btn {
  font-size: 9px;
  letter-spacing: 1px;
  font-family: inherit;
  padding: 2px 8px;
  border-radius: 2px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text2);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.cmp-log-btn:not(:disabled):hover {
  color: var(--cy);
  border-color: var(--cy);
  background: var(--cy-dim);
}
.cmp-log-btn:disabled { opacity: 0.35; cursor: default; }
.cmp-log-btn.cmp-log-clear:not(:disabled):hover {
  color: var(--red);
  border-color: var(--red);
  background: rgba(244,63,94,0.08);
}

/* ============================================================
   BATCH TEST TOGGLE
   ============================================================ */
.batch-toggle-btn {
  font-size: 9px;
  letter-spacing: 1.5px;
  font-family: inherit;
  color: var(--muted);
  border: 1px solid var(--muted);
  background: transparent;
  padding: 2px 8px;
  border-radius: 2px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
}
.batch-toggle-btn:hover {
  color: var(--green);
  border-color: var(--green);
  background: rgba(52,211,153,0.08);
}
.batch-toggle-btn.active {
  color: var(--green);
  border-color: var(--green);
  background: rgba(52,211,153,0.12);
  box-shadow: 0 0 6px rgba(52,211,153,0.3);
}

/* ============================================================
   BATCH TEST PANEL
   ============================================================ */
.batch-panel {
  flex-shrink: 0;
  border: 1px solid rgba(52,211,153,0.2);
  border-radius: 4px;
  background: rgba(52,211,153,0.03);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.batch-hd {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(52,211,153,0.12);
}
.batch-diamond { color: var(--green); font-size: 10px; }
.batch-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--green);
  text-shadow: 0 0 8px rgba(52,211,153,0.4);
}
.batch-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.batch-file-label {
  font-size: 9px;
  letter-spacing: 1px;
  font-family: inherit;
  padding: 4px 10px;
  border-radius: 3px;
  border: 1px solid var(--green);
  background: rgba(52,211,153,0.08);
  color: var(--green);
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
}
.batch-file-label:hover { background: rgba(52,211,153,0.15); box-shadow: 0 0 6px rgba(52,211,153,0.2); }
.batch-file-input { display: none; }
.batch-progress { font-size: 9px; color: var(--muted); letter-spacing: 0.5px; }
.batch-done { font-size: 9px; color: var(--green); letter-spacing: 0.5px; }
.batch-prog-bar {
  height: 3px;
  background: rgba(52,211,153,0.15);
  border-radius: 2px;
  overflow: hidden;
}
.batch-prog-fill {
  height: 100%;
  background: var(--green);
  border-radius: 2px;
  transition: width 0.1s;
}
.batch-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.batch-stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 3px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
}
.bsi-label { font-size: 8px; letter-spacing: 0.5px; color: var(--muted); }
.bsi-val { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text); }
.bsi-val.ts { color: var(--cy); }
.bsi-val.py { color: #a78bfa; }
.batch-label-table {
  border: 1px solid var(--border);
  border-radius: 3px;
  overflow: hidden;
}
.blt-hd {
  display: grid;
  grid-template-columns: 1fr 40px 50px 50px;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(255,255,255,0.04);
  font-size: 8px;
  letter-spacing: 1px;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}
.blt-row {
  display: grid;
  grid-template-columns: 1fr 40px 50px 50px;
  gap: 6px;
  padding: 4px 8px;
  font-size: 9px;
  border-bottom: 1px solid var(--border);
}
.blt-row:last-child { border-bottom: none; }
.blt-label { color: var(--text2); letter-spacing: 0.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.blt-n { color: var(--muted); text-align: right; }
.blt-acc { text-align: right; font-variant-numeric: tabular-nums; }
.blt-acc.ts { color: var(--cy); }
.blt-acc.py { color: #a78bfa; }
.batch-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
}

/* ============================================================
   DEBUG PANEL
   ============================================================ */
.dbg-panel {
  margin-top: 18px;
  padding-top: 10px;
  border-top: 1px solid rgba(167,139,250,0.15);
}

.dbg-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: Consolas, monospace;
  font-size: 10px;
  letter-spacing: 2px;
  color: rgba(167,139,250,0.45);
  padding: 2px 0 4px;
  transition: color 0.15s;
}
.dbg-toggle:hover { color: #a78bfa; }

.dbg-chevron { font-size: 8px; }

.dbg-body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.dbg-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-family: Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
}

.dbg-lbl {
  flex-shrink: 0;
  width: 56px;
  font-size: 10px;
  letter-spacing: 0.5px;
  color: rgba(167,139,250,0.45);
  padding-top: 1px;
}

.dbg-val {
  flex: 1;
  min-width: 0;
  color: rgba(200,220,255,0.7);
  word-break: break-all;
}

.dbg-em {
  color: rgba(0,229,255,0.65);
  font-size: 10px;
}

.dbg-prompt {
  font-size: 10px;
  color: rgba(134,239,172,0.7);
  white-space: pre-wrap;
  line-height: 1.6;
}

.dbg-section-hd {
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid rgba(167,139,250,0.1);
  font-size: 9px;
  letter-spacing: 2px;
  color: rgba(167,139,250,0.35);
}

.dbg-style {
  color: rgba(251,191,36,0.8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dbg-hi {
  color: rgba(0,229,255,0.9);
}

/* ============================================================
   EMOTION FEEDBACK SECTION
   ============================================================ */
.ef-section {
  margin-top: 12px;
  padding: 10px 12px;
  background: rgba(0,229,255,0.03);
  border: 1px solid rgba(0,229,255,0.1);
  border-radius: 4px;
}

.ef-header {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
}

.ef-diamond {
  font-size: 9px;
  color: var(--cy);
  opacity: 0.7;
}

.ef-title {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: 2px;
  color: var(--cy);
  opacity: 0.75;
  text-transform: uppercase;
}

.ef-spacer { flex: 1; }

.ef-analyzing {
  font-size: 14px;
  line-height: 1.4;
  color: #a78bfa;
  letter-spacing: 1px;
  animation: pulse-opacity 1.2s ease-in-out infinite;
}

@keyframes pulse-opacity {
  0%, 100% { opacity: 0.5; }
  50%       { opacity: 1;   }
}

.ef-toggle-btn {
  padding: 2px 10px;
  background: rgba(0,229,255,0.06);
  border: 1px solid rgba(0,229,255,0.18);
  border-radius: 3px;
  color: var(--muted);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  letter-spacing: 1.5px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.ef-toggle-btn:hover {
  background: rgba(0,229,255,0.12);
  color: var(--cy);
  border-color: rgba(0,229,255,0.4);
}
.ef-toggle-btn.active {
  background: rgba(0,229,255,0.14);
  color: var(--cy);
  border-color: rgba(0,229,255,0.5);
  box-shadow: 0 0 6px rgba(0,229,255,0.2);
}

.ef-empty {
  font-size: 16px;
  line-height: 1.6;
  color: var(--muted);
  text-align: center;
  padding: 6px 0;
  letter-spacing: 0.5px;
}

.ef-log {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ef-entry {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 3px;
  padding: 6px 8px;
}

.ef-entry-top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 3px;
}

.ef-detected {
  font-size: 16px;
  line-height: 1.4;
  font-weight: 600;
  color: #a78bfa;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.ef-conf {
  font-size: 14px;
  line-height: 1.4;
  color: var(--muted);
}

.ef-dt {
  font-size: 14px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(255,255,255,0.04);
}
.ef-dt.pos { color: #34d399; background: rgba(52,211,153,0.1); }
.ef-dt.neg { color: #f43f5e; background: rgba(244,63,94,0.1);  }

.ef-fallback {
  font-size: 12px;
  line-height: 1.4;
  letter-spacing: 1px;
  color: #fb923c;
  opacity: 0.7;
}

.ef-ts {
  margin-left: auto;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted);
  opacity: 0.6;
}

.ef-snippet {
  font-size: 14px;
  line-height: 1.5;
  color: rgba(200,220,255,0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
  font-style: italic;
}

.ef-applied {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.ef-chip {
  font-size: 13px;
  line-height: 1.4;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(255,255,255,0.05);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
}
.ef-chip.pos { color: #34d399; background: rgba(52,211,153,0.08);  }
.ef-chip.neg { color: #f43f5e; background: rgba(244,63,94,0.08); }

.ef-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.05);
}

.ef-count {
  font-size: 13px;
  line-height: 1.4;
  color: var(--muted);
  letter-spacing: 0.5px;
}

.ef-clear-btn {
  padding: 2px 8px;
  background: transparent;
  border: 1px solid rgba(244,63,94,0.2);
  border-radius: 3px;
  color: rgba(244,63,94,0.5);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  letter-spacing: 1px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.ef-clear-btn:hover {
  background: rgba(244,63,94,0.08);
  color: #f43f5e;
  border-color: rgba(244,63,94,0.4);
}

.vision-btn {
  display: flex;
  align-items: center;
  justify-content: center;

  min-width: 58px;
  height: 42px;

  padding: 6px 10px;

  font-size: 11px;
  letter-spacing: 1px;
  font-family: inherit;
  font-weight: 700;

  color: #ff66ff;

  background: rgba(255, 0, 255, 0.08);

  border: 1px solid rgba(255, 0, 255, 0.35);
  border-radius: 6px;

  cursor: pointer;

  transition:
    background 0.15s,
    border-color 0.15s,
    transform 0.12s;

  flex-shrink: 0;
}

.vision-btn:hover:not(:disabled) {
  background: rgba(255, 0, 255, 0.18);
  border-color: rgba(255, 0, 255, 0.8);

  transform: translateY(-1px);
}

.vision-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Character Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-window {
  background: #0d0d1a;
  border: 1px solid rgba(0, 229, 255, 0.4);
  border-radius: 14px;
  padding: 36px 44px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: min(900px, 96vw);
  max-height: 92vh;
  overflow-y: auto;
  position: relative;
}

.modal-x-btn {
  position: absolute;
  top: 14px;
  right: 16px;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(0,229,255,0.28);
  border-radius: 50%;
  color: rgba(0,229,255,0.8);
  background: rgba(0,229,255,0.06);
  font: inherit;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.modal-x-btn:hover {
  color: var(--cy);
  background: rgba(0,229,255,0.14);
  border-color: rgba(0,229,255,0.48);
}

.modal-avatar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(0, 229, 255, 0.15);
  width: 100%;
}

.modal-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(0, 229, 255, 0.5);
  box-shadow: 0 0 20px rgba(0, 229, 255, 0.25);
}

.modal-char-name {
  color: #e2e8f0;
  font-size: 18px;
  letter-spacing: 0.1em;
}

.modal-title {
  color: #00e5ff;
  font-size: 14px;
  letter-spacing: 0.15em;
  margin: 0;
}

.modal-close-btn {
  background: rgba(0, 229, 255, 0.08);
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 4px;
  color: #00e5ff;
  font-size: 12px;
  padding: 6px 20px;
  cursor: pointer;
}

.modal-close-btn:hover {
  background: rgba(0, 229, 255, 0.18);
}

.modal-avatar-upload {
  font-size: 10px;
  letter-spacing: 1.5px;
  color: rgba(0, 229, 255, 0.6);
  border: 1px solid rgba(0, 229, 255, 0.25);
  border-radius: 4px;
  padding: 4px 14px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.modal-avatar-upload:hover {
  color: #00e5ff;
  border-color: rgba(0, 229, 255, 0.6);
}

.modal-voice-sep {
  width: 100%;
  border-top: 1px solid rgba(0, 229, 255, 0.15);
  margin-top: 4px;
}

.modal-vc-rows {
  width: 100%;
}

.modal-slider {
  flex: 1;
  accent-color: #00e5ff;
  cursor: pointer;
}

.modal-slider-val {
  font-size: 12px;
  color: #00e5ff;
  min-width: 32px;
  text-align: right;
}

/* ── Modal scoped overrides (main page は影響なし) ── */
.modal-window .section-lbl {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: 2.5px;
  padding-bottom: 10px;
  width: 100%;
  text-align: left;
}

.modal-window .preset-btn {
  font-size: 12px;
  padding: 10px 6px;
}

.modal-window .cp-row {
  gap: 14px;
  padding: 5px 0;
  width: 100%;
}

.modal-window .cp-lbl {
  font-size: 16px;
  line-height: 1.4;
  width: 60px;
  padding-top: 10px;
}

.modal-window .cp-input {
  font-size: 18px;
  line-height: 1.65;
  padding: 9px 12px;
}

.modal-window .cp-textarea {
  min-height: 150px;
  font-size: 18px;
  line-height: 1.75;
}

.modal-window .cp-input::placeholder {
  font-size: 16px;
}

.persona-generator {
  width: 100%;
  border: 1px solid rgba(167,139,250,0.24);
  border-radius: 6px;
  background: rgba(167,139,250,0.045);
  padding: 12px;
}

.persona-generator-hd {
  font-size: 13px;
  line-height: 1.4;
  letter-spacing: 1.5px;
  color: #c4b5fd;
  margin-bottom: 8px;
}

.persona-generator-row {
  display: flex;
  gap: 10px;
}

.persona-generator-input {
  min-width: 0;
}

.persona-generator-btn {
  flex: 0 0 auto;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.4;
  letter-spacing: 0.5px;
  padding: 9px 14px;
  border: 1px solid rgba(167,139,250,0.42);
  border-radius: 5px;
  color: #d8b4fe;
  background: rgba(167,139,250,0.1);
  cursor: pointer;
}

.persona-generator-btn:hover:not(:disabled) {
  border-color: rgba(167,139,250,0.72);
  background: rgba(167,139,250,0.18);
}

.persona-generator-btn:disabled {
  opacity: 0.42;
  cursor: default;
}

.persona-generator-error {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: #fb7185;
}

.modal-window .modal-close-btn {
  font-size: 13px;
  padding: 9px 32px;
  border-radius: 6px;
  margin-top: 8px;
}

.modal-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 8px;
}

.modal-cancel-btn {
  color: rgba(200,240,255,0.72);
  border-color: rgba(200,240,255,0.22);
  background: rgba(200,240,255,0.04);
}

.modal-save-btn {
  color: var(--cy);
  border-color: rgba(0,229,255,0.45);
  background: rgba(0,229,255,0.12);
}
</style>

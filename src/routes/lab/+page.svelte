<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createVoiceEngine } from '$lib/api/voiceEngine';
  import { PROVIDER_MODELS, PROVIDER_OPTIONS, type AIProvider } from '$lib/config/models';
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
    specialMode:     boolean;
    shortChat:       boolean;
    autoTalk:        boolean;
    imagePromptMode: boolean;
    referenceMode:   boolean;
    mangaMode:       boolean;
  };

  type AvatarEffects = {
    rotate: boolean;
    glowPulse: boolean;
  };

  type ChatMessage = {
    role: 'user' | 'assistant'
    text: string;
    time: string;
    avatar?: string;
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
    androidMode: true, nightMode: false, specialMode: false,
    shortChat: false, autoTalk: false, imagePromptMode: false, referenceMode: false, mangaMode: false,
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
    dataUrl: string;  // compressed thumbnail
    note:    string;  // user-editable description injected into YAML
  };

  let referenceImages = $state<ReferenceImage[]>([]);
  let yamlConverting  = $state(false);
  let visionScanning  = $state(false);
  let visionContext   = $state('');

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
  type VoiceEngineType = 'elevenlabs' | 'voicevox' | 'colab-tts' | 'piper' | 'none';
  let voiceEngine = $state<VoiceEngineType>('voicevox');
  let voice       = $state('irodori-tts-500m-v3');
  let speakerId   = $state(20);
  let voiceId     = $state('');
  let voiceSpeed  = $state(1.0);
  let voicePitch  = $state(0);

  // ============================================================
  // AI config — sessionStore で一元管理
  // ============================================================

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
  let autoNightMode = $derived(
    (() => {
      void currentTime;
      const h = new Date().getHours();
      return h >= 23 || h < 5;
    })()
  );
  let autoSpecialMode = $derived(
    emotion.trust >= 70 ||
    emotion.affection >= 70 ||
    longMemory.trim().length > 0 ||
    memoryViewerItems.length > 0
  );
  let effectiveToggles = $derived({
    ...toggles,
    nightMode: autoNightMode,
    specialMode: autoSpecialMode,
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
    window.open('/studio', '_blank');
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

  async function convertToManga(msg: ChatMessage): Promise<void> {
    if (mangaConverting) return;
    mangaConverting = msg.time;
    try {
      let panels: MangaImportPanel[];

      // Fast path: already a manga-mode message — extract [prompt] directly
      const parsed = parseMangaResponse(msg.text);
      if (parsed) {
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
          .join('\n');

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
          body: JSON.stringify({ provider, model, systemPrompt: convSystemPrompt, userMessage: contextText }),
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
        }));
      }
      window.open('/studio', '_blank');
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
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
      img.src = url;
    });
  }

  async function handleReferenceImageUpload(e: Event): Promise<void> {
  const input = e.currentTarget as HTMLInputElement;
  const files = Array.from(input.files ?? []);

  input.value = '';

  for (const file of files) {
    if (referenceImages.length >= 2) break;

    const dataUrl = await createLabThumbnail(file);

    const name = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[_-]/g, ' ');

    referenceImages.push({
      name,
      dataUrl,
      note: ''
    });
  }
}

function removeReferenceImage(i: number): void {
  referenceImages.splice(i, 1);
}
    

  async function analyzeReferenceImage() {
    visionScanning = true;
  if (referenceImages.length === 0) {
    console.warn('[Vision] reference image not found');
    return;
  }

  const image = referenceImages[0];

  console.log('[Vision] analyzing image:', image.name);

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message:
        'この画像を詳しく説明してください。キャラクターの髪型、服装、色、表情、世界観を分析してください。',
      images: [image.dataUrl]
    })
  });

  const data = await response.json();
  const text = (data.text ?? '') as string;
  if (text) visionContext = text;
  console.log('[Vision result]', data);

  visionScanning = false;
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
    return /さっきの画像|最後に生成した画像|前に描いた|前描いた|前の画像|生成した画像/.test(text);
  }

  async function buildVisionReferenceImages(text: string): Promise<ReferenceImage[]> {
    const refs: ReferenceImage[] = [...referenceImages];
    if (!wantsImageMemoryReference(text)) return refs;

    try {
      const latest = await getLatestImageMemory();
      if (latest?.imageUrl?.startsWith('data:')) {
        refs.push({
          name: 'Image Memory',
          dataUrl: latest.imageUrl,
          note: latest.imagePrompt,
        });
      }
    } catch (error) {
      console.warn('[Lab] image memory reference load failed:', error);
    }

    return refs;
  }

  async function convertToYaml(msg: ChatMessage): Promise<void> {
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
        ? `\n[参照キャラクター]\n${referenceImages.map((r, i) => `キャラクター${i === 0 ? 'A' : 'B'}: ${r.note || r.name}`).join('\n')}`
        : '';
      const visionSection = visionContext
        ? `\n[VISION解析結果]\n${visionContext}`
        : '';

      const sysPrompt = [
        'あなたはマンガ制作アシスタントAIです。',
        '以下の会話から、マルチページ漫画プロジェクトのJSONを生成してください。',
        '必ず以下のJSON形式のみを出力し、他のテキストは一切出力しないこと:',
        '{',
        '  "pages": [',
        '    {',
        '      "layout": "4panel",',
        '      "panels": [',
        '        { "scene": "コマ1の内容（日本語）", "dialogue": ["キャラ名: セリフ", "キャラ名: セリフ"], "prompt": "コマ1の詳細英語プロンプト" },',
        '        { "scene": "コマ2の内容（日本語）", "dialogue": ["キャラ名: セリフ"], "prompt": "コマ2の詳細英語プロンプト" },',
        '        { "scene": "コマ3の内容（日本語）", "dialogue": ["キャラ名: セリフ", "キャラ名: セリフ"], "prompt": "コマ3の詳細英語プロンプト" },',
        '        { "scene": "コマ4の内容（日本語）", "dialogue": ["キャラ名: セリフ"], "prompt": "コマ4の詳細英語プロンプト" }',
        '      ]',
        '    }',
        '  ],',
        '  "refs": {',
        '    "a": "キャラクターAの英語外見タグ（カンマ区切り）",',
        '    "b": "キャラクターBの英語外見タグ（存在しない場合は省略）"',
        '  }',
        '}',
        'layoutは "single" / "2panel" / "3vertical" / "4panel" から最適なものを選ぶこと。',
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
      ].join('\n');

      const provider = $sessionStore.provider === 'onair' ? 'claude' : $sessionStore.provider;
      const model    = $sessionStore.provider === 'onair' ? 'claude-haiku-4-5-20251001' : ($sessionStore.model || undefined);

      const res = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, systemPrompt: sysPrompt, userMessage: contextText + refContext + visionSection }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
      const data = await res.json();
      const raw  = (data.text ?? '') as string;

      type YamlPage = { layout: string; prompt?: string; panels: { scene?: string; dialogue?: string[]; prompt: string }[] };
      type YamlParsed = { pages: YamlPage[]; refs?: { a?: string; b?: string } };
      let parsed: YamlParsed;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
      } catch {
        parsed = { pages: [{ layout: '4panel', prompt: msg.text.slice(0, 200), panels: [{ prompt: msg.text.slice(0, 300) }] }] };
      }

      const yamlData = {
        ...parsed,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        sourceText: msg.text.slice(0, 60),
      };

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(YAML_IMPORT_KEY, JSON.stringify(yamlData));
        } catch {
          try {
            localStorage.setItem(YAML_IMPORT_KEY, JSON.stringify({ ...yamlData, referenceImages: undefined }));
          } catch { /* quota */ }
        }
        try {
          const lines: string[] = ['pages:'];
          for (const page of parsed.pages) {
            lines.push(`  - layout: ${page.layout}`);
            lines.push('    panels:');
            for (const panel of page.panels) {
              const esc = (s: string) => s.replace(/\n/g, ' ').replace(/"/g, '\\"').trim();
              if (panel.scene) {
                lines.push(`      - scene: "${esc(panel.scene)}"`);
                if (panel.dialogue && panel.dialogue.length > 0) {
                  const dlStr = JSON.stringify(panel.dialogue).replace(/\n/g, ' ').replace(/"/g, '\\"');
                  lines.push(`        dialogue: "${dlStr}"`);
                }
                lines.push(`        prompt: "${esc(panel.prompt)}"`);
              } else {
                lines.push(`      - prompt: "${esc(panel.prompt)}"`);
              }
            }
          }
          if (parsed.refs) {
            lines.push('refs:');
            if (parsed.refs.a) lines.push(`  a: "${parsed.refs.a.replace(/"/g, '\\"')}"`);
            if (parsed.refs.b) lines.push(`  b: "${parsed.refs.b.replace(/"/g, '\\"')}"`);
          }
          localStorage.setItem('studio-yaml', lines.join('\n').trim());
        } catch { /* quota */ }
      }
      window.open('/studio', '_blank');
    } catch (e) {
      console.error('[Lab] convertToYaml:', e);
    } finally {
      yamlConverting = false;
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
        body: JSON.stringify({ provider, model, systemPrompt: sysPrompt, userMessage: logText }),
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
      window.open('/studio', '_blank');
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
    if (t.specialMode)
      lines.push('\n【特別モード】返答の先頭に「【特別対応】」と付けること。');

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
    if (t.specialMode) base = `【特別対応】${base}`;

    return base;
  }

  // ============================================================
  // Chat
  // ============================================================
  function isImageGenerationRequest(text: string): boolean {
    return text.includes('\u63cf\u3044\u3066');
  }

  async function generateImageFromLabChat(prompt: string): Promise<void> {
    const provider = 'openai';
    const model = 'gpt-image-2';
    const selectedModel = 'openai/GPT Image 2';

    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          size: '1024x1024',
          model,
          selectedModel,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const imageUrl = typeof data?.url === 'string' ? data.url : '';
      if (!imageUrl) throw new Error('No image URL');

      void saveImageMemory({
        imageUrl,
        imagePrompt: prompt,
        provider,
        model,
      }).catch((error) => {
        console.warn('[Lab] image memory save failed:', error);
      });

      messages = [
        ...messages,
        { role: 'ai', text: 'IMAGE GENERATED', time: getTime(), avatar: selectedAvatar, imageUrl, imagePrompt: prompt },
      ];
    } catch (err) {
      console.error('[Lab] image generation fail:', err);
      messages = [...messages, { role: 'error', text: 'Image generation failed.', time: getTime() }];
    } finally {
      isThinking = false;
      setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
    }
  }

  async function sendYonkomaPrompt() {
    yonkomaGenerating = true;
    inputText = 'この画像のキャラを使って4コマ漫画のYAMLを作って。\nギャグ寄り、キャラの個性を活かして。';
    console.log('[yonkoma] prompt:', inputText);
    try { await sendMessage(); } finally { yonkomaGenerating = false; }
  }

  async function sendMessage() {
    const text = inputText.trim();
    if (!text || isThinking) return;
    inputText = '';
    messages = [...messages, { role: 'user', text, time: getTime() }];
    if (isImageGenerationRequest(text)) {
      isThinking = true;
      await generateImageFromLabChat(text);
      return;
    }
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
    let aiText: string;
    let responseMemoryDebug: {
      retrievedMemories?: Array<Omit<MemoryViewerItem, 'createdAt'> & { timestamp?: string; createdAt?: string }>;
    } | undefined;
    try {
      let res: Response;
      if ($sessionStore.provider === 'onair') {
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
        _fd.append('provider', $sessionStore.provider);
        if ($sessionStore.model) _fd.append('model', $sessionStore.model);
        _fd.append('systemPrompt', _sysPrompt);
        _fd.append('userMessage', text);
        for (let _i = 0; _i < visionReferenceImages.length; _i++) {
          _fd.append(`image_${_i}`, dataUrlToBlob(visionReferenceImages[_i].dataUrl), `ref_${_i}.jpg`);
          if (visionReferenceImages[_i].note) _fd.append(`note_${_i}`, visionReferenceImages[_i].note);
        }
        res = await fetch('/api/lab-chat', { method: 'POST', body: _fd });
      }
      if (!res.ok) {
        let userMsg = 'APIエラーが発生しました。しばらく後に再試行してください。';
        if (res.status === 429) {
          userMsg = '無料枠の上限に達しました。しばらく待ってから再試行してください。';
        } else {
          try {
            const errData = await res.json();
            if (errData?.message) userMsg = errData.message;
          } catch { /* ignore */ }
        }
        console.error('[Lab] response fail: HTTP', res.status, userMsg);
        messages = [...messages, { role: 'error', text: userMsg, time: getTime() }];
        isThinking = false;
        setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
        return;
      }
      const data = await res.json();
      if (data.failover) {
        failoverNotice = 'Gemini 失敗 → OpenAI へ自動切替しました';
        setTimeout(() => { failoverNotice = null; }, 5000);
      }
      responseMemoryDebug = data.memory;
      aiText = $sessionStore.provider === 'onair' ? data.reply : data.text;
      lastResponseMs   = Date.now() - _reqStart;
      lastSentImages   = visionReferenceImages.length;
      lastUsedProvider = data.provider  ?? $sessionStore.provider;
      lastUsedModel    = data.actualModel ?? $sessionStore.model ?? null;
      console.log('[Lab] response success — provider:', lastUsedProvider, 'model:', lastUsedModel, 'images_sent:', lastSentImages);
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

    consumeAndroidBattery(1, 'chat_reply');
    aiText = `${aiText}${getAndroidBatteryWarning()}`;
    messages = [...messages, { role: 'ai', text: aiText, time: getTime(), avatar: selectedAvatar, imagePrompt: undefined }];
    addMemory('assistant', aiText);
    updateEmotionFromReply(aiText);
    const aiEmotion = analyzeEmotionTS(aiText).emotion;
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
          voiceEngine,
          voice,
          voiceId: voiceId || undefined,
          speakerId,
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
    { key: 'mangaMode'   as const, label: '漫画制作モード', icon: '⬛' },
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
      .filter(m => m.role !== 'error' && !m.isGreeting) // エラー・起動挨拶は保存しない
      .slice(-HISTORY_MAX);                              // 最新 50 件に制限
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
            provider:     $sessionStore.provider,
            model:        $sessionStore.model || undefined,
            systemPrompt: buildLabSystemPrompt() + '\n\n【自発発話モード】ユーザーへの自然な話しかけです。1〜2文で。[IDLE_NOTICE] の内容に沿って発話してください。',
            userMessage:  buildProactiveTrigger(charName),
          }),
        });
      }
      if (res.ok) {
        const data    = await res.json();
        const aiText: string = ($sessionStore.provider === 'onair' ? data.reply : data.text) ?? '';
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
              const eng = createVoiceEngine({ voiceEngine, voice, voiceId: voiceId || undefined, speakerId });
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
        {#each messages as msg (msg.time + msg.role + msg.text.slice(0, 8))}
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
                    alt={charName}
                    onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }}
                  />
                </div>
              {/if}
              <div class="msg-bubble">
                {#if parseYonkomaYaml(msg.text) !== null}
                  {@const _y = parseYonkomaYaml(msg.text)!}
                  <div class="yonkoma-display">
                    {#if _y.preamble}<div class="msg-text yonkoma-preamble">{_y.preamble}</div>{/if}
                    {#if _y.title}
                      <div class="yonkoma-title">
                        <span class="yonkoma-title-badge">4コマ</span>{_y.title}
                      </div>
                    {/if}
                    {#if _y.panels.length > 0}
                      <div class="yonkoma-panels">
                        {#each _y.panels as panel}
                          <div class="yonkoma-panel">
                            <div class="yonkoma-panel-main">
                              <div class="yonkoma-panel-num">▪ {panel.num}</div>
                              <div class="yonkoma-panel-fields">
                                {#each panel.fields as f}
                                  <div class="yonkoma-field">
                                    <span class="yonkoma-field-key">{f.key}</span><span class="yonkoma-field-val">{f.value}</span>
                                  </div>
                                {/each}
                              </div>
                            </div>
                            <div class="yonkoma-panel-actions">
                              <button class="ypb ypb-regen" onclick={() => regenerateYonkomaPanel(panel.num, _y.title, panel.fields)} disabled={isThinking} title="このコマを再生成">↺ 再生成</button>
                              <button class="ypb ypb-img" onclick={() => sendPanelToStudio(panel, _y.title)} title="Image Studioで画像化">◈ 画像化</button>
                            </div>
                          </div>
                        {/each}
                      </div>
                    {/if}
                    <div class="yonkoma-code-wrap">
                      <div class="yonkoma-code-hd">
                        <span class="yonkoma-code-label">YAML</span>
                        <div class="yonkoma-code-btns">
                          <button class="yonkoma-copy-btn" onclick={() => navigator.clipboard.writeText(_y.yaml)}>⎘ COPY</button>
                          <button class="yonkoma-dl-btn" onclick={() => downloadYonkomaYaml(_y.yaml, _y.title)}>↓ DL</button>
                        </div>
                      </div>
                      <pre class="yonkoma-code">{_y.yaml}</pre>
                    </div>
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
                {#if msg.role === 'ai' && !msg.isGreeting}
                  <div class="msg-action-row">
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

      <!-- Reference image thumbnails strip -->
      {#if referenceImages.length > 0}
        <div class="ref-img-strip">
          {#each referenceImages as ref, i}
            <div class="ref-img-chip">
              {#if ref.dataUrl}
                <img src={ref.dataUrl} alt={ref.name} class="ref-img-thumb" />
              {/if}
              <input
                type="text"
                class="ref-img-note"
                placeholder={ref.name}
                bind:value={ref.note}
              />
              <button class="ref-img-remove" onclick={() => removeReferenceImage(i)} title="削除">✕</button>
            </div>
          {/each}
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

      

      <!-- Input -->
      <div class="chat-input-area">
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <label class="ref-upload-btn" title="参照画像をアップロード（最大2枚）" class:disabled={referenceImages.length >= 2}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <path d="M3 15l5-5 4 4 3-3 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
          </svg>
          REF
          <input
            type="file"
            accept="image/*"
            multiple
            style="display:none"
            disabled={referenceImages.length >= 2}
            onchange={handleReferenceImageUpload}
          />
        </label>
        <button
          class="vision-btn"
          onclick={analyzeReferenceImage}
          disabled={referenceImages.length === 0}
        >
          {#if visionScanning}
            SCANNING...
          {:else}
            VISION
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
              <input type="checkbox" class="toggle-cb" bind:checked={toggles[item.key]} />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
              <span class="toggle-lbl">{item.label}</span>
            </label>
          {/each}
        </div>
      </div>

      <div class="ctrl-section">
        <div class="section-lbl">QUICK ACTIONS</div>
        <button class="studio-btn" onclick={() => window.open('/studio', '_blank')}>
          ◼ Open Image Studio
        </button>
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
          {#if voiceEngine === 'colab-tts'}
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
        <div class="log-entry">
          <span class="ld {effectiveToggles.specialMode ? 'special' : 'off'}"></span>
          Adaptive Response {effectiveToggles.specialMode ? 'AUTO' : 'STANDBY'}
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
              <span class="dbg-val {effectiveToggles.nightMode ? 'dbg-hi' : ''}">{effectiveToggles.nightMode ? 'AUTO' : 'OFF'}</span>
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
        <span class="pv">{effectiveToggles.specialMode ? 'adaptive' : effectiveToggles.nightMode ? 'night' : 'normal'}</span>
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
.ld.special { background: var(--pu); box-shadow: 0 0 4px var(--pu); }

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

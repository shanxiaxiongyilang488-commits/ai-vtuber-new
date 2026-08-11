<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import CharacterVoiceDesign from '$lib/components/voice/CharacterVoiceDesign.svelte';

  // 'character' = Character Voice Design (クラウドTTS専用モード。ローカルBridge不要)
  type VoiceMode = 'design' | 'clone' | 'lora' | 'character';
  type GyaruDialect = 'standard' | 'kansai' | 'kanazawa';
  type GyaruEra = 'modern' | '90s';
  type VoiceAgeBand = 'jc' | 'jk' | 'jd';
  type RadarAxis = {
    label: string;
    description: string;
  };

  type GyaruTuning = {
    version: 4;
    basePitch: number;
    tempo: number;
    energy: number;
    breathiness: number;
    forwardTwang: number;
    nasality: number;
    formantShift: number;
    brightness: number;
    body: number;
    presence: number;
    dynamics: number;
    roughness?: number;
    rhythmSwing?: number;
    endingDrop?: number;
    humanize?: number;
    tension?: number;
    familiarity?: number;
    charaLevel?: number;
    kogyaruPerformance?: number;
    pitchVariation: number;
    articulation: number;
    vowelStretch: number;
    dialectStrength: number;
    dialectStyle: GyaruDialect;
    era: GyaruEra;
    paletteId?: string;
    mapColor?: string;
    mapX?: number;
    mapY?: number;
  };

  type LegacyGyaruTuningV3 = {
    version: 3;
    basePitch: number;
    tempo: number;
    energy: number;
    breathiness: number;
    forwardTwang: number;
    nasality: number;
    pitchVariation: number;
    articulation: number;
    vowelStretch: number;
    dialectStrength: number;
    dialectStyle: GyaruDialect;
    era: GyaruEra;
    paletteId?: string;
    mapColor?: string;
    mapX?: number;
    mapY?: number;
  };

  type LegacyGyaruTuningV2 = {
    version: 2;
    basePitch: number;
    tempo: number;
    energy: number;
    breathiness: number;
    nasality: number;
    pitchVariation: number;
    articulation: number;
    vowelStretch: number;
    dialectStrength: number;
    dialectStyle: GyaruDialect;
    era: GyaruEra;
    paletteId?: string;
    mapColor?: string;
    mapX?: number;
    mapY?: number;
  };

  type LegacyGyaruTuningV1 = {
    version: 1;
    youth: number;
    flashy: number;
    lazy: number;
    nasal: number;
    pitchSwing: number;
    dialect: number;
    dialectStyle: GyaruDialect;
    era: GyaruEra;
    paletteId?: string;
  };
  type StoredVoiceTuning =
    | GyaruTuning
    | LegacyGyaruTuningV3
    | LegacyGyaruTuningV2
    | LegacyGyaruTuningV1;
  type PersonaKind = 'honors' | 'neutral' | 'spontaneous';
  type VoiceDirectorStylePack = 'natural' | 'gyaru' | 'idol' | 'cool' | 'narrator' | 'android';
  type VoiceDirectorParameter =
    | 'basePitch'
    | 'tempo'
    | 'energy'
    | 'breathiness'
    | 'forwardTwang'
    | 'nasality'
    | 'formantShift'
    | 'brightness'
    | 'body'
    | 'presence'
    | 'dynamics'
    | 'roughness'
    | 'rhythmSwing'
    | 'endingDrop'
    | 'humanize'
    | 'tension'
    | 'familiarity'
    | 'charaLevel'
    | 'kogyaruPerformance'
    | 'pitchVariation'
    | 'articulation'
    | 'vowelStretch';
  type VoiceDirectorRecipe = {
    summary: string;
    stylePack: VoiceDirectorStylePack;
    voiceAgeBand: VoiceAgeBand;
    dialectStyle: GyaruDialect;
    dialectStrength: number;
    parameters: Record<VoiceDirectorParameter, number>;
    performanceCue: string;
    interpretation: string[];
    cautions: string[];
  };

  type PersonaTuning = {
    version: 1;
    kind: PersonaKind;
    mapX: number;
    mapY: number;
    mapColor: string;
    articulation: number;
    rhythmStability: number;
    pausePlanning: number;
    prosodyChaos: number;
    vowelStretch: number;
    reactionIntensity: number;
    hesitation: number;
    endingControl: number;
    comparisonId?: string;
  };

  type VoicePalette = {
    id: string;
    name: string;
    description: string;
    color: string;
    accent: string;
    profile: Omit<GyaruTuning, 'paletteId'>;
  };

  type CharacterVoiceConfig = {
    engine: string;
    mode: VoiceMode;
    model: string;
    caption?: string;
    speed?: number;
    autoSpeak?: boolean;
  };

  type CharacterEntry = {
    id: string;
    name: string;
    role: string;
    voice?: CharacterVoiceConfig | null;
  };

  type VoiceCandidate = {
    id: string;
    characterName: string;
    text: string;
    displayText?: string;
    performanceCue?: string;
    caption: string;
    seed: string | null;
    seconds: number | null;
    steps: number;
    cfgCaptionScale?: number;
    pitchSemitones?: number;
    tempoRate?: number;
    formantRatio?: number;
    brightnessDb?: number;
    bodyDb?: number;
    presenceDb?: number;
    compressorRatio?: number;
    roughnessAmount?: number;
    rhythmSwingAmount?: number;
    endingDropAmount?: number;
    humanizeAmount?: number;
    fileName: string;
    audioUrl: string;
    createdAt: string;
    memo: string;
    checkpoint: string;
    generationTimeMs: number;
    modelReloaded: boolean;
    mode?: VoiceMode;
    voiceAgeBand?: VoiceAgeBand;
    voiceTuning?: StoredVoiceTuning;
    personaTuning?: PersonaTuning;
  };

  type VoiceModelOption = {
    id: string;
    label: string;
    source: 'default' | 'env' | 'local';
    note?: string;
  };

  type VoiceBackend = 'local' | 'colab';

  const stylePresets: {
    id: string;
    caption: string;
    sampleText?: string;
    captionScale?: string;
  }[] = [
    {
      id: 'choberiba gyaru',
      caption:
        '1990年代後半の渋谷のコギャルを思わせる、若々しいギャル声。'
        + 'かったるそうで少し機嫌が悪いが、棒読みにはせず、派手でチャラいノリを強く出す。'
        + '声は中高音で薄く軽く、強く鼻にかかった甘く明るい声質。'
        + '語頭に軽く息を混ぜるが、かすれ、しわがれ、ボーカルフライは入れない。'
        + '母音を「えぇ〜」「さぁ〜」「だるくなぁい？」のように大きく引き伸ばし、'
        + 'フレーズごとにピッチを派手に上下させる。疑問や相づちの語尾はいったん強く上げ、'
        + '文全体の最後だけ力を抜いてだらっと下げる。'
        + '子音は少し崩してルーズにし、言葉ごとに不規則な間を置き、'
        + '親しい友達へ面倒くさそうに絡むような、省エネだが表情豊かな話し方にする。'
        + '明るいアイドル声、現代的な元気な配信者口調、年配女性の低く太い声にはしない。',
      sampleText:
        'えぇ〜、今日マジだるくなぁい？ てかさぁ、そのコーデ、チョベリグじゃん？ '
        + 'え、やばぁ。うちもう歩くのかったるいしぃ。雨とかマジ、チョベリバなんですけどぉ〜。',
      captionScale: '5.8',
    },
    {
      id: 'kanazawa gyaru MAX',
      caption:
        'とても若々しくハイテンションなギャル声。'
        + '子ども声にはせず、声の響きは軽く明るく透明感があり、かなり高めで、'
        + '胸の低い響きが少ない、少し鼻にかかった甘く派手な声質。'
        + '低く太い声や、落ち着いた年配話者の語り口にはせず、若い友達同士の近い距離感で話す。'
        + '母音を軽く伸ばし、語尾を跳ね上げ、ピッチ変化とリアクションをかなり大きくする。'
        + 'セリフに書かれた北陸・金沢の言い回しを保ちつつ、現代的なノリで少し早口に話す。',
      sampleText:
        'え、ちょっこ見て！ 今日のコーデ、すっごい盛れとるげんて。'
        + 'めっちゃいいがいね！ そんなかわいいがん、どこで見つけたが？ '
        + '今度うちも連れてってまっし〜！',
      captionScale: '5.5',
    },
    {
      id: 'kansai gyaru MAX',
      caption:
        '関西出身のハイテンションで若々しいギャル声。自然な関西弁のアクセントで話す。'
        + 'かなり高めで、少し鼻にかかった甘く派手な声質。母音を軽く伸ばし、語尾を強く跳ね上げる。'
        + 'ピッチ変化と抑揚、リアクションをかなり大きくし、親しい友達との雑談のように'
        + 'ノリよく早口で話す。笑顔を感じる話し方で、距離感は近く、自信たっぷり。',
      sampleText:
        'え、ちょ待って！ 今日のコーデ、ガチで盛れすぎちゃう？ めっちゃかわいいやん！ '
        + 'うち、テンション爆上がりなんやけど〜！',
      captionScale: '5.5',
    },
    {
      id: 'gyaru MAX',
      caption:
        'ハイテンションで若々しい渋谷系ギャル声。かなり高めで、少し鼻にかかった甘く派手な声質。'
        + '母音を軽く伸ばし、語尾を強く跳ね上げる。ピッチ変化と抑揚をかなり大きく、リアクションも大きく、'
        + '親友との雑談のようにノリよく早口で話す。笑顔を感じる話し方で、距離感は近く、'
        + '自信たっぷりで小悪魔っぽい。',
      sampleText:
        'え、待って！ 今日のコーデ、ガチで盛れすぎじゃない？ めっちゃかわいいんだけど〜！ 最高すぎ！',
      captionScale: '5.5',
    },
    {
      id: 'gyaru',
      caption:
        '若々しく明るい、エネルギッシュなギャル声。やや高めで少し鼻にかかった軽い声質。'
        + '抑揚とピッチ変化を大きく、語尾を軽く上げ、親しい友達と盛り上がるような'
        + 'くだけたノリで、笑顔と自信を感じさせながらテンポよく少し早口で話す。',
      sampleText: 'ねえ聞いて！ 今日のコーデ、マジで盛れてない？ めっちゃテンション上がるんだけど！',
    },
    { id: 'anime girl', caption: 'アニメ調の若い女性の声。明るく表情豊かで、親しみやすい。' },
    { id: 'cute idol', caption: '可愛いアイドルの声。華やかで甘く、笑顔で元気に話す。' },
    { id: 'sleepy android', caption: '眠たげなアンドロイドの声。無機質で静か、少し息が抜けた話し方。' },
    { id: 'calm android', caption: '落ち着いたアンドロイドの声。安定したトーンで、感情を抑えて丁寧に話す。' },
    { id: 'energetic idol', caption: 'エネルギッシュなアイドルの声。高揚感があり、テンポよく明るく話す。' },
    { id: 'soft voice', caption: '柔らかい声。近い距離感で、優しく穏やかに話す。' },
    { id: 'mature woman', caption: '大人の女性の声。落ち着きがあり、低めで上品に話す。' },
    { id: 'high pitch', caption: '高めの声。軽く澄んだ響きで、可愛らしく話す。' },
    { id: 'low energy', caption: '低エネルギーの声。控えめで淡々と、少し疲れた雰囲気で話す。' },
  ];

  const DESIGNER_MODEL_STORAGE_KEY = 'voice-lab:model:kizuna-voice-designer';
  const VOICE_AGE_OPTIONS: { id: VoiceAgeBand; label: string; range: string; description: string }[] = [
    { id: 'jc', label: 'JC', range: '13–15', description: '中学生年代の軽く未成熟な声' },
    { id: 'jk', label: 'JK', range: '16–18', description: '高校生年代の明るく若い声' },
    { id: 'jd', label: 'JD', range: '18–22', description: '大学生年代の自然な若者声' },
  ];
  const VOICE_DIRECTOR_PARAMETERS: { key: VoiceDirectorParameter; label: string }[] = [
    { key: 'basePitch', label: '声の高さ' },
    { key: 'tempo', label: '話す速さ' },
    { key: 'energy', label: '勢い' },
    { key: 'breathiness', label: '息感' },
    { key: 'forwardTwang', label: '前響き' },
    { key: 'nasality', label: '鼻声' },
    { key: 'formantShift', label: '声道サイズ' },
    { key: 'brightness', label: '明るさ' },
    { key: 'body', label: '声の太さ' },
    { key: 'presence', label: '近さ' },
    { key: 'dynamics', label: '音量差' },
    { key: 'roughness', label: 'ざらつき' },
    { key: 'rhythmSwing', label: '話速の揺れ' },
    { key: 'endingDrop', label: '語尾下げ' },
    { key: 'humanize', label: '機械感補正' },
    { key: 'tension', label: 'テンション' },
    { key: 'familiarity', label: '心理的距離' },
    { key: 'charaLevel', label: 'チャラさ' },
    { key: 'kogyaruPerformance', label: '90s演技' },
    { key: 'pitchVariation', label: '抑揚' },
    { key: 'articulation', label: '滑舌' },
    { key: 'vowelStretch', label: '母音伸ばし' },
  ];
  const VOICE_IMPRESSION_AXES: RadarAxis[] = [
    { label: '若さ', description: '若々しさ・声の軽さ' },
    { label: '明るさ', description: '高域の明るさ・声の抜け' },
    { label: '細さ', description: '声の細さ・胴鳴りの軽さ' },
    { label: '鼻声', description: '鼻腔寄りの響き' },
    { label: '勢い', description: '声の押し出し・エネルギー' },
    { label: '表情', description: '抑揚・声色の動き' },
  ];
  const DELIVERY_IMPRESSION_AXES: RadarAxis[] = [
    { label: '早口', description: '話す速さ' },
    { label: 'だるさ', description: 'かったるさ・脱力感' },
    { label: '跳ね', description: 'ピッチの跳ね上がり' },
    { label: '崩し', description: '子音の崩し・ルーズさ' },
    { label: '母音', description: '母音・語尾の伸ばし' },
    { label: '反応', description: 'リアクションの強さ' },
  ];
  const VOICE_PALETTES: VoicePalette[] = [
    {
      id: 'choberiba-magenta',
      name: 'CHOBERIBA MAGENTA',
      description: '90s・チャラい・かったるい',
      color: '#f43f8d',
      accent: '#a855f7',
      profile: {
        version: 4, basePitch: 82, tempo: 50, energy: 72, breathiness: 38,
        forwardTwang: 85, nasality: 35, pitchVariation: 85, articulation: 30, vowelStretch: 90,
        formantShift: 70, brightness: 78, body: 35, presence: 70, dynamics: 62,
        charaLevel: 88, kogyaruPerformance: 92, tension: 90, familiarity: 94,
        dialectStrength: 8, dialectStyle: 'standard', era: '90s',
      },
    },
    {
      id: 'shibuya-pink',
      name: 'SHIBUYA PINK',
      description: '現代・超ハイテンション',
      color: '#fb4fb7',
      accent: '#ff8bd5',
      profile: {
        version: 4, basePitch: 90, tempo: 82, energy: 95, breathiness: 18,
        forwardTwang: 92, nasality: 26, pitchVariation: 95, articulation: 70, vowelStretch: 68,
        formantShift: 82, brightness: 90, body: 20, presence: 85, dynamics: 80,
        charaLevel: 76, kogyaruPerformance: 0, tension: 96, familiarity: 90,
        dialectStrength: 5, dialectStyle: 'standard', era: 'modern',
      },
    },
    {
      id: 'lazy-lilac',
      name: 'LAZY LILAC',
      description: '気だるい・甘い・ルーズ',
      color: '#c084fc',
      accent: '#818cf8',
      profile: {
        version: 4, basePitch: 78, tempo: 32, energy: 45, breathiness: 45,
        forwardTwang: 72, nasality: 28, pitchVariation: 68, articulation: 25, vowelStretch: 85,
        formantShift: 68, brightness: 62, body: 38, presence: 50, dynamics: 35,
        charaLevel: 92, kogyaruPerformance: 86, tension: 32, familiarity: 88,
        dialectStrength: 5, dialectStyle: 'standard', era: '90s',
      },
    },
    {
      id: 'neon-aqua',
      name: 'NEON AQUA',
      description: '若い・軽い・キレのある声',
      color: '#22d3ee',
      accent: '#38bdf8',
      profile: {
        version: 4, basePitch: 86, tempo: 78, energy: 82, breathiness: 12,
        forwardTwang: 88, nasality: 12, pitchVariation: 82, articulation: 80, vowelStretch: 35,
        formantShift: 78, brightness: 88, body: 24, presence: 88, dynamics: 68,
        charaLevel: 64, kogyaruPerformance: 0, tension: 86, familiarity: 62,
        dialectStrength: 5, dialectStyle: 'standard', era: 'modern',
      },
    },
    {
      id: 'midnight-violet',
      name: 'MIDNIGHT VIOLET',
      description: '低め・チャラい・夜のノリ',
      color: '#7c3aed',
      accent: '#ec4899',
      profile: {
        version: 4, basePitch: 68, tempo: 42, energy: 58, breathiness: 40,
        forwardTwang: 70, nasality: 24, pitchVariation: 72, articulation: 35, vowelStretch: 78,
        formantShift: 55, brightness: 55, body: 55, presence: 55, dynamics: 45,
        charaLevel: 86, kogyaruPerformance: 80, tension: 48, familiarity: 92,
        dialectStrength: 5, dialectStyle: 'standard', era: '90s',
      },
    },
    {
      id: 'soft-peach',
      name: 'SOFT PEACH',
      description: '親しみ・柔らかいギャル',
      color: '#fb7185',
      accent: '#fdba74',
      profile: {
        version: 4, basePitch: 82, tempo: 65, energy: 72, breathiness: 28,
        forwardTwang: 65, nasality: 16, pitchVariation: 70, articulation: 65, vowelStretch: 50,
        formantShift: 68, brightness: 65, body: 40, presence: 60, dynamics: 45,
        charaLevel: 24, kogyaruPerformance: 0, tension: 58, familiarity: 56,
        dialectStrength: 5, dialectStyle: 'standard', era: 'modern',
      },
    },
    {
      id: 'kanazawa-gold',
      name: 'KANAZAWA GOLD',
      description: '金沢弁・若い・華やか',
      color: '#fbbf24',
      accent: '#f97316',
      profile: {
        version: 4, basePitch: 88, tempo: 74, energy: 86, breathiness: 18,
        forwardTwang: 86, nasality: 20, pitchVariation: 85, articulation: 70, vowelStretch: 55,
        formantShift: 80, brightness: 82, body: 28, presence: 78, dynamics: 72,
        charaLevel: 72, kogyaruPerformance: 0, tension: 88, familiarity: 82,
        dialectStrength: 90, dialectStyle: 'kanazawa', era: 'modern',
      },
    },
    {
      id: 'kansai-orange',
      name: 'KANSAI ORANGE',
      description: '関西弁・ノリ・強い抑揚',
      color: '#f97316',
      accent: '#ef4444',
      profile: {
        version: 4, basePitch: 84, tempo: 88, energy: 94, breathiness: 14,
        forwardTwang: 88, nasality: 22, pitchVariation: 92, articulation: 75, vowelStretch: 50,
        formantShift: 76, brightness: 84, body: 32, presence: 82, dynamics: 78,
        charaLevel: 80, kogyaruPerformance: 0, tension: 94, familiarity: 90,
        dialectStrength: 85, dialectStyle: 'kansai', era: 'modern',
      },
    },
  ];
  const PRESET_PALETTE: Record<string, string> = {
    'choberiba gyaru': 'choberiba-magenta',
    'kanazawa gyaru MAX': 'kanazawa-gold',
    'kansai gyaru MAX': 'kansai-orange',
    'gyaru MAX': 'shibuya-pink',
    gyaru: 'soft-peach',
  };

  // --- form state -------------------------------------------------------
  let characters = $state<CharacterEntry[]>([]);
  let selectedCharacterId = $state('');
  let mode = $state<VoiceMode>('design');
  let voiceCaption = $state('');
  // Irodori系モデルは日本語文中の英字を正しく読めないため、サンプルはカタカナ表記にする。
  let sampleText = $state('こんにちは。ボイスラボで作成した声のテストです。');
  let dialogueInstruction = $state('');
  let isGeneratingDialogue = $state(false);
  let dialogueError = $state<string | null>(null);
  let dialogueModel = $state('');
  let dialogueDisplayText = $state('');
  let dialoguePerformanceCue = $state('');
  let voiceDirectorInstruction = $state('');
  let voiceDirectorRecipe = $state<VoiceDirectorRecipe | null>(null);
  let voiceDirectorModel = $state('');
  let voiceDirectorError = $state<string | null>(null);
  let isDirectingVoice = $state(false);
  let candidateName = $state('');
  let cloneModel = $state('');
  let loraModel = $state('');
  let autoSpeak = $state(false);

  // --- resources --------------------------------------------------------
  let candidates = $state<VoiceCandidate[]>([]);
  let keptVoices = $state<string[]>([]);
  let loras = $state<string[]>([]);
  let bridgeReachable = $state(false);
  let bridgeInfo = $state('');
  let designerModels = $state<VoiceModelOption[]>([]);
  let designerModel = $state('');

  // --- advanced ---------------------------------------------------------
  let voiceSeed = $state('');
  let voiceSeconds = $state('');
  let voiceSteps = $state('20');
  let voiceCaptionScale = $state('4.0');
  let voiceSpeed = $state('1.0');
  let voiceAgeBand = $state<VoiceAgeBand>('jk');
  let tunerBasePitch = $state(82);
  let tunerTempo = $state(50);
  let tunerEnergy = $state(72);
  let tunerBreathiness = $state(38);
  let tunerForwardTwang = $state(85);
  let tunerNasality = $state(20);
  let tunerFormantShift = $state(70);
  let tunerBrightness = $state(78);
  let tunerBody = $state(35);
  let tunerPresence = $state(70);
  let tunerDynamics = $state(62);
  let tunerRoughness = $state(18);
  let tunerRhythmSwing = $state(52);
  let tunerEndingDrop = $state(58);
  let tunerHumanize = $state(72);
  let tunerTension = $state(92);
  let tunerFamiliarity = $state(92);
  let tunerCharaLevel = $state(88);
  let tunerKogyaruPerformance = $state(92);
  let tunerPitchVariation = $state(85);
  let tunerArticulation = $state(30);
  let tunerVowelStretch = $state(90);
  let tunerEra = $state<GyaruEra>('90s');
  let colorMapX = $state(0.7);
  let colorMapY = $state(0);
  let colorMapColor = $state(colorFromMapPosition(0.7, 0));
  let colorMapDragging = $state(false);
  let isPreviewingColorMap = $state(false);
  let colorMapPreviewError = $state<string | null>(null);
  let colorMapAudioContext: AudioContext | null = null;
  let colorMapAudioSource: AudioBufferSourceNode | null = null;
  let colorMapFallbackAudio: HTMLAudioElement | null = null;
  let tunerLinked = $state(false);
  let personaMapX = $state(0);
  let personaMapY = $state(0);
  let personaMapColor = $state('#f8fafc');
  let personaMapDragging = $state(false);
  let personaLinked = $state(false);
  let personaABResults = $state<VoiceCandidate[]>([]);
  let voiceBackend = $state<VoiceBackend>('local');
  let localVoiceUrl = $state('http://127.0.0.1:7860');
  let colabVoiceUrl = $state('');
  let settingsMessage = $state<string | null>(null);

  // --- status -----------------------------------------------------------
  let isGenerating = $state(false);
  let elapsedSec = $state(0);
  let generateError = $state<string | null>(null);
  let statusMessage = $state<string | null>(null);
  let candidatesError = $state<string | null>(null);
  let busyCandidateId = $state<string | null>(null);
  let editingCandidateId = $state<string | null>(null);
  let savingCandidateId = $state<string | null>(null);
  let candidateMemoDraft = $state('');
  let candidateEditError = $state<string | null>(null);
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;

  const selectedCharacter = $derived(characters.find((entry) => entry.id === selectedCharacterId) ?? null);
  const currentVoice = $derived(selectedCharacter?.voice ?? null);
  const currentTuning = $derived.by(() => currentGyaruTuning());
  const currentVoiceImpression = $derived.by(() => voiceImpressionValues(currentTuning));
  const currentDeliveryImpression = $derived.by(() => deliveryImpressionValues(currentTuning));
  const currentPersonaTuning = $derived.by(() => personaTuningFromPosition(personaMapX, personaMapY));
  const colorMapLocation = $derived.by(() => describeColorMapLocation(colorMapX, colorMapY));

  const canGenerate = $derived.by(() => {
    if (isGenerating || !selectedCharacter || !sampleText.trim()) return false;
    if (mode === 'design') return Boolean(voiceCaption.trim() && designerModel);
    if (mode === 'clone') return Boolean(cloneModel);
    return Boolean(loraModel);
  });

  const canApplyForm = $derived.by(() => {
    if (!selectedCharacter) return false;
    if (mode === 'design') return Boolean(voiceCaption.trim());
    if (mode === 'clone') return Boolean(cloneModel);
    return Boolean(loraModel);
  });

  function parsedSpeed(): number {
    const parsed = Number(voiceSpeed);
    return Number.isFinite(parsed) && parsed > 0.25 && parsed < 4 ? parsed : 1;
  }

  function countSpeechCharacters(value: string) {
    return Array.from(value.replace(/\s+/g, '')).length;
  }

  function clampTunerValue(value: number) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function pitchSemitonesFromLevel(value: number) {
    const normalized = (clampTunerValue(value) - 50) / 50;
    // 大きな高域シフトは金属的になりやすいため、上側を特に抑える。
    return normalized >= 0 ? normalized * 2 : normalized * 2.5;
  }

  function tempoRateFromLevel(value: number) {
    return 0.78 + (clampTunerValue(value) / 100) * 0.5;
  }

  function formantRatioFromLevel(value: number) {
    return 0.94 + (clampTunerValue(value) / 100) * 0.12;
  }

  function brightnessDbFromLevel(value: number) {
    return ((clampTunerValue(value) - 50) / 50) * 6;
  }

  function bodyDbFromLevel(value: number) {
    return ((clampTunerValue(value) - 50) / 50) * 4;
  }

  function presenceDbFromLevel(value: number) {
    return ((clampTunerValue(value) - 50) / 50) * 4;
  }

  function dynamicsRatioFromLevel(value: number) {
    return 1 + (clampTunerValue(value) / 100) * 2.5;
  }

  function resolvedCharaLevel(profile: Pick<GyaruTuning, 'charaLevel' | 'era'>) {
    return clampTunerValue(profile.charaLevel ?? (profile.era === '90s' ? 72 : 58));
  }

  function charaBalanceFromLevel(value: number) {
    return (clampTunerValue(value) - 50) / 50;
  }

  function resolvedKogyaruPerformance(profile: Pick<GyaruTuning, 'kogyaruPerformance' | 'era'>) {
    return clampTunerValue(profile.kogyaruPerformance ?? (profile.era === '90s' ? 78 : 0));
  }

  function resolvedRoughness(profile: Pick<GyaruTuning, 'roughness' | 'era'>) {
    return clampTunerValue(profile.roughness ?? (profile.era === '90s' ? 18 : 8));
  }

  function resolvedRhythmSwing(profile: Pick<GyaruTuning, 'rhythmSwing' | 'era'>) {
    return clampTunerValue(profile.rhythmSwing ?? (profile.era === '90s' ? 52 : 24));
  }

  function resolvedEndingDrop(profile: Pick<GyaruTuning, 'endingDrop' | 'era'>) {
    return clampTunerValue(profile.endingDrop ?? (profile.era === '90s' ? 58 : 24));
  }

  function resolvedHumanize(profile: Pick<GyaruTuning, 'humanize'>) {
    return clampTunerValue(profile.humanize ?? 72);
  }

  function humanizePitchRetention(profile: GyaruTuning) {
    return Math.round((1 - (resolvedHumanize(profile) / 100) * 0.22) * 100);
  }

  function humanizeFormantRetention(profile: GyaruTuning) {
    return Math.round((1 - (resolvedHumanize(profile) / 100) * 0.6) * 100);
  }

  function humanizeTextureRetention(profile: GyaruTuning) {
    return Math.round((1 - (resolvedHumanize(profile) / 100) * 0.75) * 100);
  }

  function resolvedTension(profile: Pick<GyaruTuning, 'tension' | 'era'>) {
    return clampTunerValue(profile.tension ?? (profile.era === '90s' ? 72 : 68));
  }

  function resolvedFamiliarity(profile: Pick<GyaruTuning, 'familiarity' | 'era'>) {
    return clampTunerValue(profile.familiarity ?? (profile.era === '90s' ? 78 : 68));
  }

  function positiveMacroBalance(value: number) {
    return Math.max(0, (clampTunerValue(value) - 50) / 50);
  }

  function tensionPitchBoost(profile: GyaruTuning) {
    return positiveMacroBalance(resolvedTension(profile)) * 0.3;
  }

  function tensionTempoBoostPercent(profile: GyaruTuning) {
    return positiveMacroBalance(resolvedTension(profile)) * 6;
  }

  function tensionPresenceBoost(profile: GyaruTuning) {
    return positiveMacroBalance(resolvedTension(profile)) * 0.45;
  }

  function tensionSwingFloor(profile: GyaruTuning) {
    return clampTunerValue(positiveMacroBalance(resolvedTension(profile)) * 70);
  }

  function tensionEndingRetention(profile: GyaruTuning) {
    return clampTunerValue((1 - positiveMacroBalance(resolvedTension(profile)) * 0.75) * 100);
  }

  function familiarityPitchBoost(profile: GyaruTuning) {
    return positiveMacroBalance(resolvedFamiliarity(profile)) * 0.12;
  }

  function familiarityTempoBoostPercent(profile: GyaruTuning) {
    return positiveMacroBalance(resolvedFamiliarity(profile)) * 1.5;
  }

  function familiarityPresenceBoost(profile: GyaruTuning) {
    return positiveMacroBalance(resolvedFamiliarity(profile)) * 0.3;
  }

  function pitchSemitonesForTuning(profile: GyaruTuning) {
    const balance = charaBalanceFromLevel(resolvedCharaLevel(profile));
    const hyperTension = Math.max(0, charaBalanceFromLevel(resolvedTension(profile)));
    const tooClose = Math.max(0, charaBalanceFromLevel(resolvedFamiliarity(profile)));
    return pitchSemitonesFromLevel(profile.basePitch)
      - Math.max(0, balance) * 0.45
      + Math.max(0, -balance) * 0.25
      + hyperTension * 0.3
      + tooClose * 0.12;
  }

  function tempoRateForTuning(profile: GyaruTuning) {
    const balance = charaBalanceFromLevel(resolvedCharaLevel(profile));
    const hyperTension = Math.max(0, charaBalanceFromLevel(resolvedTension(profile)));
    const tooClose = Math.max(0, charaBalanceFromLevel(resolvedFamiliarity(profile)));
    return tempoRateFromLevel(profile.tempo)
      * (1 - Math.max(0, balance) * 0.025)
      * (1 + hyperTension * 0.06)
      * (1 + tooClose * 0.015);
  }

  function formantRatioForTuning(profile: GyaruTuning) {
    const balance = charaBalanceFromLevel(resolvedCharaLevel(profile));
    return formantRatioFromLevel(profile.formantShift)
      - Math.max(0, balance) * 0.006
      + Math.max(0, -balance) * 0.004;
  }

  function brightnessDbForTuning(profile: GyaruTuning) {
    return brightnessDbFromLevel(profile.brightness)
      - charaBalanceFromLevel(resolvedCharaLevel(profile)) * 0.5;
  }

  function bodyDbForTuning(profile: GyaruTuning) {
    return bodyDbFromLevel(profile.body)
      + charaBalanceFromLevel(resolvedCharaLevel(profile)) * 0.35;
  }

  function presenceDbForTuning(profile: GyaruTuning) {
    return presenceDbFromLevel(profile.presence)
      + Math.max(0, charaBalanceFromLevel(resolvedCharaLevel(profile))) * 0.35
      + Math.max(0, charaBalanceFromLevel(resolvedTension(profile))) * 0.45
      + Math.max(0, charaBalanceFromLevel(resolvedFamiliarity(profile))) * 0.3;
  }

  function dynamicsRatioForTuning(profile: GyaruTuning) {
    return dynamicsRatioFromLevel(profile.dynamics)
      + Math.max(0, charaBalanceFromLevel(resolvedCharaLevel(profile))) * 0.15
      + Math.max(0, charaBalanceFromLevel(resolvedTension(profile))) * 0.1;
  }

  function hslToHex(hue: number, saturation: number, lightness: number) {
    const s = saturation / 100;
    const l = lightness / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const segment = ((hue % 360) + 360) % 360 / 60;
    const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
    const [red, green, blue] = segment < 1
      ? [chroma, secondary, 0]
      : segment < 2
        ? [secondary, chroma, 0]
        : segment < 3
          ? [0, chroma, secondary]
          : segment < 4
            ? [0, secondary, chroma]
            : segment < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
    const match = l - chroma / 2;
    return `#${[red, green, blue]
      .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
      .join('')}`;
  }

  function colorFromMapPosition(x: number, y: number) {
    const radius = Math.min(1, Math.hypot(x, y));
    const angle = Math.atan2(y, x) * 180 / Math.PI;
    const hue = (angle + 150 + 360) % 360;
    return hslToHex(hue, 92, 97 - radius * 47);
  }

  function tuningFromMapPosition(x: number, y: number): GyaruTuning {
    const radius = Math.min(1, Math.hypot(x, y));
    return {
      version: 4,
      basePitch: clampTunerValue(50 + x * 45),
      tempo: clampTunerValue(50 - y * 45),
      energy: clampTunerValue(50 - y * 32 + radius * 10),
      breathiness: clampTunerValue(28 + y * 26 - x * 8),
      forwardTwang: clampTunerValue(55 + x * 25 + radius * 15),
      // 鼻声は補助成分に限定。色の明るさはforwardTwangで作る。
      nasality: clampTunerValue(8 + Math.max(0, x) * 12 + radius * 8),
      formantShift: clampTunerValue(50 + x * 34 - y * 5),
      brightness: clampTunerValue(50 + x * 34 - y * 8 + radius * 6),
      body: clampTunerValue(50 - x * 32 + y * 10),
      presence: clampTunerValue(42 + x * 20 - y * 8 + radius * 28),
      dynamics: clampTunerValue(28 - y * 18 + radius * 48),
      roughness: clampTunerValue(tunerRoughness),
      rhythmSwing: clampTunerValue(tunerRhythmSwing),
      endingDrop: clampTunerValue(tunerEndingDrop),
      humanize: clampTunerValue(tunerHumanize),
      tension: clampTunerValue(tunerTension),
      familiarity: clampTunerValue(tunerFamiliarity),
      charaLevel: clampTunerValue(tunerCharaLevel),
      kogyaruPerformance: tunerEra === '90s' ? clampTunerValue(tunerKogyaruPerformance) : 0,
      pitchVariation: clampTunerValue(42 + radius * 53),
      articulation: clampTunerValue(52 - y * 22 + x * 8),
      vowelStretch: clampTunerValue(28 + y * 48 + radius * 15),
      dialectStrength: 0,
      dialectStyle: 'standard',
      era: tunerEra,
      paletteId: 'color-wheel',
      mapColor: colorFromMapPosition(x, y),
      mapX: x,
      mapY: y,
    };
  }

  const VOICE_MAP_MAX_RADIUS = 0.94;

  function normalizeVoiceMapPosition(x: number, y: number) {
    const safeX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    const safeY = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
    const length = Math.hypot(safeX, safeY);
    if (length <= VOICE_MAP_MAX_RADIUS || length === 0) {
      return { x: safeX, y: safeY };
    }
    const scale = VOICE_MAP_MAX_RADIUS / length;
    return { x: safeX * scale, y: safeY * scale };
  }

  function describeColorMapLocation(x: number, y: number) {
    const normalized = normalizeVoiceMapPosition(x, y);
    const radius = Math.min(1, Math.hypot(normalized.x, normalized.y));
    const angle = (Math.atan2(normalized.y, normalized.x) * 180 / Math.PI + 360) % 360;
    const zone = angle < 22.5 || angle >= 337.5
      ? 'AQUA'
      : angle < 67.5
        ? 'BLUE'
        : angle < 112.5
          ? 'VIOLET'
          : angle < 157.5
            ? 'MAGENTA'
            : angle < 202.5
              ? 'CORAL'
              : angle < 247.5
                ? 'AMBER'
                : angle < 292.5
                  ? 'LIME'
                  : 'MINT';
    const pitch = normalized.x >= 0.62
      ? 'かなり高い声'
      : normalized.x >= 0.22
        ? '高めの声'
        : normalized.x <= -0.62
          ? 'かなり低い声'
          : normalized.x <= -0.22
            ? '低めの声'
            : '中間の高さ';
    const tempo = normalized.y <= -0.62
      ? 'かなり早口'
      : normalized.y <= -0.22
        ? 'やや早口'
        : normalized.y >= 0.62
          ? 'かなりゆっくり'
          : normalized.y >= 0.22
            ? 'ややゆっくり'
            : '標準速度';
    const depth = radius < 0.18
      ? '中心・ニュートラル'
      : radius < 0.48
        ? '内周・変化弱め'
        : radius < 0.76
          ? '中周・変化はっきり'
          : '外周・変化強め';

    return {
      zone,
      pitch,
      tempo,
      depth,
      x: Math.round(normalized.x * 100),
      y: Math.round(normalized.y * 100),
      radius: Math.round(radius * 100),
    };
  }

  function applyColorMapPoint(x: number, y: number) {
    const normalized = normalizeVoiceMapPosition(x, y);
    setGyaruTuning(tuningFromMapPosition(normalized.x, normalized.y));
    applyGyaruTuner();
    statusMessage = `VOICE COLOR MAPPED: ${colorMapColor}`;
  }

  function updateColorMapFromPointer(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    const x = (event.clientX - (rect.left + rect.width / 2)) / radius;
    const y = (event.clientY - (rect.top + rect.height / 2)) / radius;
    applyColorMapPoint(x, y);
  }

  function startColorMapDrag(event: PointerEvent) {
    colorMapDragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    updateColorMapFromPointer(event);
  }

  function moveColorMapDrag(event: PointerEvent) {
    if (colorMapDragging) updateColorMapFromPointer(event);
  }

  function stopColorMapDrag() {
    colorMapDragging = false;
  }

  function moveColorMapWithKeyboard(event: KeyboardEvent) {
    const step = event.shiftKey ? 0.15 : 0.05;
    let nextX = colorMapX;
    let nextY = colorMapY;
    if (event.key === 'ArrowLeft') nextX -= step;
    else if (event.key === 'ArrowRight') nextX += step;
    else if (event.key === 'ArrowUp') nextY -= step;
    else if (event.key === 'ArrowDown') nextY += step;
    else return;
    event.preventDefault();
    applyColorMapPoint(nextX, nextY);
  }

  function personaColorFromPosition(x: number, y: number) {
    const radius = Math.min(1, Math.hypot(x, y));
    const hue = x < -0.05 ? 190 : x > 0.05 ? 330 : 270;
    return hslToHex(hue, 88, 97 - radius * 47);
  }

  function personaTuningFromPosition(x: number, y: number): PersonaTuning {
    const length = Math.hypot(x, y);
    const normalizedX = length > 1 ? x / length : x;
    const normalizedY = length > 1 ? y / length : y;
    const kind: PersonaKind = normalizedX <= -0.2
      ? 'honors'
      : normalizedX >= 0.2
        ? 'spontaneous'
        : 'neutral';
    return {
      version: 1,
      kind,
      mapX: normalizedX,
      mapY: normalizedY,
      mapColor: personaColorFromPosition(normalizedX, normalizedY),
      articulation: clampTunerValue(65 - normalizedX * 28),
      rhythmStability: clampTunerValue(65 - normalizedX * 32 + normalizedY * 8),
      pausePlanning: clampTunerValue(65 - normalizedX * 30 + normalizedY * 10),
      prosodyChaos: clampTunerValue(48 + normalizedX * 38 - normalizedY * 15),
      vowelStretch: clampTunerValue(42 + normalizedX * 35 + normalizedY * 10),
      reactionIntensity: clampTunerValue(55 + normalizedX * 20 - normalizedY * 35),
      hesitation: clampTunerValue(40 + normalizedX * 38 + normalizedY * 8),
      endingControl: clampTunerValue(65 - normalizedX * 35 + normalizedY * 8),
    };
  }

  function personaLabel(profile: PersonaTuning) {
    if (profile.kind === 'honors') return 'HONORS GYARU';
    if (profile.kind === 'spontaneous') return 'SPONTANEOUS GYARU';
    return 'NEUTRAL GYARU';
  }

  function buildPersonaPrompt(profile: PersonaTuning) {
    const articulation = profile.articulation >= 70
      ? '子音と語頭を明瞭にし、早口でも一語ずつ聞き取りやすく発音する'
      : profile.articulation >= 45
        ? '発音は自然な会話程度に少し崩す'
        : '子音を軽く脱落させ、親しい友達との会話のようにルーズに発音する';
    const rhythm = profile.rhythmStability >= 70
      ? 'テンポを安定させ、文節と意味の切れ目に計画的な短い間を置く'
      : profile.rhythmStability >= 45
        ? '自然な会話リズムで話す'
        : '急に早くなったり一瞬止まったりする、衝動的で不規則なリズムにする';
    const prosody = profile.prosodyChaos >= 70
      ? '強調箇所を限定せず、反応するたびにピッチを大きく跳ねさせる'
      : profile.prosodyChaos >= 45
        ? '重要語に会話らしい抑揚を付ける'
        : '強調する言葉を選び、抑揚を制御して落ち着いて話す';
    const endings = profile.endingControl >= 70
      ? '語尾を短く明確に着地させ、文を最後まで言い切る'
      : profile.endingControl >= 45
        ? '語尾は自然に上げ下げする'
        : '語尾を長く伸ばしたり跳ね上げたりして、思いつきで話す感じを出す';
    const reaction = profile.reactionIntensity >= 70
      ? 'リアクションは大きく即発的で、驚きや楽しさを声にすぐ出す'
      : profile.reactionIntensity >= 40
        ? '親しい友達へ話す程度の自然なリアクションにする'
        : 'リアクションを抑え、自信のある落ち着いた調子にする';
    const persona = profile.kind === 'honors'
      ? '頭の回転が速く、要点を整理して話す優等生ギャルの演技'
      : profile.kind === 'spontaneous'
        ? '考えるより先に感情が声へ出る、天真爛漫でおバカかわいいギャルの演技'
        : '知的すぎず衝動的すぎない、自然なギャルの演技';

    return [
      `${persona}。${articulation}。${rhythm}。`,
      `${prosody}。${endings}。${reaction}。`,
      '入力されたセリフの単語は変更せず、フィラーや笑い声など新しい言葉を追加しない。',
    ].join('\n');
  }

  function applyPersonaMapPoint(x: number, y: number) {
    const profile = personaTuningFromPosition(x, y);
    personaMapX = profile.mapX;
    personaMapY = profile.mapY;
    personaMapColor = profile.mapColor;
    personaLinked = true;
    statusMessage = `PERSONA MAPPED: ${personaLabel(profile)}`;
  }

  function updatePersonaMapFromPointer(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    applyPersonaMapPoint(
      (event.clientX - (rect.left + rect.width / 2)) / radius,
      (event.clientY - (rect.top + rect.height / 2)) / radius,
    );
  }

  function startPersonaMapDrag(event: PointerEvent) {
    personaMapDragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    updatePersonaMapFromPointer(event);
  }

  function movePersonaMapDrag(event: PointerEvent) {
    if (personaMapDragging) updatePersonaMapFromPointer(event);
  }

  function stopPersonaMapDrag() {
    personaMapDragging = false;
  }

  function movePersonaMapWithKeyboard(event: KeyboardEvent) {
    const step = event.shiftKey ? 0.15 : 0.05;
    let nextX = personaMapX;
    let nextY = personaMapY;
    if (event.key === 'ArrowLeft') nextX -= step;
    else if (event.key === 'ArrowRight') nextX += step;
    else if (event.key === 'ArrowUp') nextY -= step;
    else if (event.key === 'ArrowDown') nextY += step;
    else return;
    event.preventDefault();
    applyPersonaMapPoint(nextX, nextY);
  }

  function currentGyaruTuning(): GyaruTuning {
    return {
      version: 4,
      basePitch: clampTunerValue(tunerBasePitch),
      tempo: clampTunerValue(tunerTempo),
      energy: clampTunerValue(tunerEnergy),
      breathiness: clampTunerValue(tunerBreathiness),
      forwardTwang: clampTunerValue(tunerForwardTwang),
      nasality: clampTunerValue(tunerNasality),
      formantShift: clampTunerValue(tunerFormantShift),
      brightness: clampTunerValue(tunerBrightness),
      body: clampTunerValue(tunerBody),
      presence: clampTunerValue(tunerPresence),
      dynamics: clampTunerValue(tunerDynamics),
      roughness: clampTunerValue(tunerRoughness),
      rhythmSwing: clampTunerValue(tunerRhythmSwing),
      endingDrop: clampTunerValue(tunerEndingDrop),
      humanize: clampTunerValue(tunerHumanize),
      tension: clampTunerValue(tunerTension),
      familiarity: clampTunerValue(tunerFamiliarity),
      charaLevel: clampTunerValue(tunerCharaLevel),
      kogyaruPerformance: tunerEra === '90s' ? clampTunerValue(tunerKogyaruPerformance) : 0,
      pitchVariation: clampTunerValue(tunerPitchVariation),
      articulation: clampTunerValue(tunerArticulation),
      vowelStretch: clampTunerValue(tunerVowelStretch),
      dialectStrength: 0,
      dialectStyle: 'standard',
      era: tunerEra,
      paletteId: 'color-wheel',
      mapColor: colorMapColor,
      mapX: colorMapX,
      mapY: colorMapY,
    };
  }

  function setGyaruTuning(profile: GyaruTuning) {
    tunerBasePitch = profile.basePitch;
    tunerTempo = profile.tempo;
    tunerEnergy = profile.energy;
    tunerBreathiness = profile.breathiness;
    tunerForwardTwang = profile.forwardTwang;
    tunerNasality = profile.nasality;
    tunerFormantShift = profile.formantShift;
    tunerBrightness = profile.brightness;
    tunerBody = profile.body;
    tunerPresence = profile.presence;
    tunerDynamics = profile.dynamics;
    tunerRoughness = resolvedRoughness(profile);
    tunerRhythmSwing = resolvedRhythmSwing(profile);
    tunerEndingDrop = resolvedEndingDrop(profile);
    tunerHumanize = resolvedHumanize(profile);
    tunerTension = resolvedTension(profile);
    tunerFamiliarity = resolvedFamiliarity(profile);
    tunerCharaLevel = resolvedCharaLevel(profile);
    tunerKogyaruPerformance = resolvedKogyaruPerformance(profile);
    tunerPitchVariation = profile.pitchVariation;
    tunerArticulation = profile.articulation;
    tunerVowelStretch = profile.vowelStretch;
    tunerEra = profile.era;
    const derivedX = Math.max(-1, Math.min(1, (profile.basePitch - 50) / 45));
    const derivedY = Math.max(-1, Math.min(1, (50 - profile.tempo) / 45));
    const mapPosition = normalizeVoiceMapPosition(
      typeof profile.mapX === 'number' ? profile.mapX : derivedX,
      typeof profile.mapY === 'number' ? profile.mapY : derivedY,
    );
    colorMapX = mapPosition.x;
    colorMapY = mapPosition.y;
    colorMapColor = profile.mapColor ?? colorFromMapPosition(colorMapX, colorMapY);
  }

  function markTunerDirty() {
    tunerLinked = false;
  }

  function applyCharaAttitude() {
    tunerCharaLevel = clampTunerValue(tunerCharaLevel);
    applyGyaruTuner();
    statusMessage = `ATTITUDE APPLIED: ${tunerCharaLevel <= 35 ? 'CUTE' : tunerCharaLevel >= 72 ? 'CHARA' : 'MIX'}`;
  }

  function applyKogyaruPerformance() {
    tunerKogyaruPerformance = clampTunerValue(tunerKogyaruPerformance);
    applyGyaruTuner();
    statusMessage = `90s PERFORMANCE APPLIED: ${tunerKogyaruPerformance}`;
  }

  function applyVoiceDetail() {
    tunerRoughness = clampTunerValue(tunerRoughness);
    tunerRhythmSwing = clampTunerValue(tunerRhythmSwing);
    tunerEndingDrop = clampTunerValue(tunerEndingDrop);
    tunerHumanize = clampTunerValue(tunerHumanize);
    applyGyaruTuner();
    statusMessage = 'VOICE DETAIL DSP APPLIED';
  }

  function applyTension() {
    tunerTension = clampTunerValue(tunerTension);
    applyGyaruTuner();
    statusMessage = `TENSION APPLIED: ${tunerTension >= 85 ? 'HYPER PUSH' : tunerTension >= 60 ? 'HIGH' : 'LOW KEY'}`;
  }

  function applyFamiliarity() {
    tunerFamiliarity = clampTunerValue(tunerFamiliarity);
    applyGyaruTuner();
    statusMessage = `PERSONAL SPACE APPLIED: ${tunerFamiliarity >= 85 ? 'TOO CLOSE' : tunerFamiliarity >= 60 ? 'FRIENDLY' : 'RESERVED'}`;
  }

  function normalizeVoiceTuning(profile: StoredVoiceTuning): GyaruTuning {
    if (profile.version === 4) {
      return {
        ...profile,
        roughness: resolvedRoughness(profile),
        rhythmSwing: resolvedRhythmSwing(profile),
        endingDrop: resolvedEndingDrop(profile),
        humanize: resolvedHumanize(profile),
        tension: resolvedTension(profile),
        familiarity: resolvedFamiliarity(profile),
        charaLevel: resolvedCharaLevel(profile),
        kogyaruPerformance: resolvedKogyaruPerformance(profile),
      };
    }
    if (profile.version === 3) {
      return {
        ...profile,
        version: 4,
        formantShift: clampTunerValue(50 + (profile.basePitch - 50) * 0.72),
        brightness: clampTunerValue(28 + profile.forwardTwang * 0.68),
        body: clampTunerValue(76 - profile.basePitch * 0.52),
        presence: clampTunerValue(25 + profile.forwardTwang * 0.62),
        dynamics: clampTunerValue(18 + profile.energy * 0.62),
        roughness: profile.era === '90s' ? 18 : 8,
        rhythmSwing: profile.era === '90s' ? 52 : 24,
        endingDrop: profile.era === '90s' ? 58 : 24,
        tension: profile.era === '90s' ? 72 : 68,
        familiarity: profile.era === '90s' ? 78 : 68,
        charaLevel: profile.era === '90s' ? 72 : 58,
        kogyaruPerformance: profile.era === '90s' ? 78 : 0,
      };
    }
    if (profile.version === 2) {
      return normalizeVoiceTuning({
        ...profile,
        version: 3,
        // 旧NASALには前方共鳴の意図も混ざっていたため、TWANGへ移して鼻声を弱める。
        forwardTwang: clampTunerValue(45 + profile.nasality * 0.55),
        nasality: Math.min(35, clampTunerValue(profile.nasality * 0.35)),
      });
    }
    return normalizeVoiceTuning({
      version: 3,
      basePitch: clampTunerValue(40 + profile.youth * 0.45),
      tempo: clampTunerValue(55 + profile.flashy * 0.25 - profile.lazy * 0.45),
      energy: clampTunerValue(profile.flashy * 0.65 + (100 - profile.lazy) * 0.35),
      breathiness: clampTunerValue(profile.lazy * 0.7),
      forwardTwang: clampTunerValue(45 + profile.nasal * 0.55),
      nasality: Math.min(35, clampTunerValue(profile.nasal * 0.35)),
      pitchVariation: clampTunerValue(profile.pitchSwing),
      articulation: clampTunerValue(90 - profile.lazy * 0.72),
      vowelStretch: clampTunerValue(profile.flashy * 0.48 + profile.lazy * 0.42),
      dialectStrength: clampTunerValue(profile.dialect),
      dialectStyle: profile.dialectStyle,
      era: profile.era,
      paletteId: profile.paletteId,
    });
  }

  function findVoicePalette(id: string | undefined) {
    return VOICE_PALETTES.find((palette) => palette.id === id);
  }

  function paletteName(profile: StoredVoiceTuning) {
    if ((profile.version === 2 || profile.version === 3 || profile.version === 4) && profile.mapColor) return `VOICE MAP ${profile.mapColor}`;
    return findVoicePalette(profile.paletteId)?.name ?? 'CUSTOM COLOR';
  }

  function paletteDescription(profile: StoredVoiceTuning) {
    if ((profile.version === 2 || profile.version === 3 || profile.version === 4) && profile.mapColor) {
      return `PITCH ${profile.basePitch} / TEMPO ${profile.tempo}`;
    }
    return findVoicePalette(profile.paletteId)?.description ?? '保存されたカスタム配色';
  }

  function tuningColor(profile: StoredVoiceTuning) {
    if ((profile.version === 2 || profile.version === 3 || profile.version === 4) && /^#[0-9a-f]{6}$/i.test(profile.mapColor ?? '')) {
      return profile.mapColor as string;
    }
    return findVoicePalette(profile.paletteId)?.color ?? '#64748b';
  }

  function tuningAccent(profile: StoredVoiceTuning) {
    if ((profile.version === 2 || profile.version === 3 || profile.version === 4) && /^#[0-9a-f]{6}$/i.test(profile.mapColor ?? '')) {
      return '#ffffff';
    }
    return findVoicePalette(profile.paletteId)?.accent ?? '#94a3b8';
  }

  function buildGyaruTunerPrompt(profile: GyaruTuning): string {
    const basePitch = profile.basePitch >= 70
      ? '基準ピッチは高め。声を口先の前方へ集め、胸の低い響きと声の太さを抑え、薄く軽い明るさを保つ'
      : profile.basePitch >= 40
        ? '基準ピッチは中高域。声を前方へ響かせ、無理に作らない自然な同年代の軽さにする'
        : '基準ピッチはやや低めだが、胸声を使わず、細く軽い若者の響きを残す';
    const tempo = profile.tempo >= 70
      ? '話速は速めで、短い反応語を小気味よくつなぐ'
      : profile.tempo >= 40
        ? '話速は自然な会話速度で、フレーズ間に短い間を置く'
        : '話速は遅めで、語中に気だるい間を置く。ただし引き延ばしすぎて不自然にしない';
    const energy = profile.energy >= 70
      ? '発声エネルギーとリアクションを大きくし、笑顔と自信を強く感じさせる'
      : profile.energy >= 40
        ? '声量感は中程度で、親しい友達へ話す自然な熱量にする'
        : '声量感を抑え、省エネでかったるい雰囲気にする。ただし無感情な棒読みにはしない';
    const breathiness = profile.breathiness >= 65
      ? '軽い息を多めに混ぜるが、しわがれ声、乾いたハスキー声、酒焼けした声にはしない'
      : profile.breathiness >= 30
        ? '息を少し混ぜた柔らかく軽い声質にする。かすれや声の老成感は出さない'
      : '息漏れを抑え、芯のあるクリアな発声にする';
    const forwardTwang = profile.forwardTwang >= 75
      ? '明るい前方共鳴と軽いtwangを強め、声を口先へ集めて細く鋭い抜けを作る。ただし鼻づまり声にはしない'
      : profile.forwardTwang >= 40
        ? '声を前方へ自然に響かせ、若々しい明るさと軽い抜けを保つ'
        : '前方共鳴は控えめにするが、胸の低い響きや声の太さは増やさない';
    const nasality = profile.nasality >= 28
      ? '鼻腔の響きは軽いアクセントとしてだけ加え、鼻づまり、こもり、乾いた鼻声には絶対にしない'
      : profile.nasality >= 15
        ? 'ごく薄い鼻腔成分だけを加え、母音の明瞭さを保つ'
      : '鼻声は使わず、澄んだ声質にする';
    const formant = profile.formantShift >= 68
      ? '声道サイズを少し小さく感じさせ、若く小ぶりな声の輪郭にする'
      : profile.formantShift <= 35
        ? '声道サイズを少し大きく感じさせ、低めで広い響きにする'
        : '声道サイズは自然な中間に保つ';
    const brightness = profile.brightness >= 68
      ? '高域の明るさと抜けを強め、曇りを減らす'
      : profile.brightness <= 35
        ? '高域を柔らかくして、暗めで丸い質感にする'
        : '音色の明るさは自然な中間にする';
    const body = profile.body >= 68
      ? '低域の胴鳴りを少し増やして厚みを出す'
      : profile.body <= 35
        ? '低域の胴鳴りを抑え、細く軽い声にする'
        : '声の厚みは自然な中間にする';
    const presence = profile.presence >= 68
      ? '中高域の存在感と子音の近さを強める'
      : profile.presence <= 35
        ? '中高域を少し引かせ、遠く柔らかい質感にする'
        : '存在感は自然な中間にする';
    const dynamics = profile.dynamics >= 68
      ? '音量差を軽く整え、小声と強調語をどちらも前へ出す'
      : profile.dynamics <= 35
        ? '自然な音量差を広めに残す'
        : '音量差を穏やかに整える';
    const charaLevel = resolvedCharaLevel(profile);
    const attitude = charaLevel >= 72
      ? [
          '可愛いアイドル声ではなく、街で友達としゃべるチャラいギャルの態度にする。',
          '平均ピッチを上げすぎず、語頭は少し気だるく入り、子音を軽く崩す。',
          'フレーズ内でピッチを滑らせ、語尾は軽く落とすか跳ねる。ごく軽いハスキー感とボーカルフライを自然に混ぜる。',
          '鼻声・濁った喉声・機械的な歪み・アニメ声・接客用の笑顔声にはしない。',
        ].join('')
      : charaLevel <= 35
        ? [
            '親しみやすい可愛いギャルにする。',
            '発音を比較的きれいに保ち、明るく素直な語尾と軽い笑顔を感じさせる。',
            '幼いアニメ声や作りすぎたアイドル声にはしない。',
          ].join('')
        : [
            '可愛さとチャラさを半々にし、友達同士の自然な距離感で話す。',
            '発音を少しだけ崩し、フレーズごとのピッチ移動と語尾変化を入れる。',
          ].join('');
    const kogyaruPerformance = resolvedKogyaruPerformance(profile);
    const performanceSequence = profile.era === '90s' && kogyaruPerformance >= 35
      ? [
          `90s KOGYARU PERFORMANCE ${kogyaruPerformance}/100。発話を均一に読まず、ひとつのセリフ内で三段階に演じる。`,
          'PHASE 1 PICKUP: 語頭は中低めのピッチで少し気だるく入り、最初の短い句の後にごく短い間を置く。',
          'PHASE 2 HIT: 中央の強調語へ向かって一時的に加速し、その語だけピッチと音圧を素早く跳ね上げる。全文を高音にしない。',
          'PHASE 3 DROP: 語尾の母音を少し伸ばしてから雑に落とすか、短く跳ねて切る。毎回同じ上昇語尾にしない。',
          '句読点を演技境界として使う。ただし文章にない笑い声、フィラー、掛け声、余分な声を最後へ追加しない。',
          '平成後期ではなく1990年代後半の仲間内のコギャル会話。上品、丁寧、アイドル、ナレーションの均一なリズムを避ける。',
        ].join('')
      : '発話内の速度とピッチは自然に変化させるが、過剰な時代演技は付けない。';
    const pitchVariation = profile.pitchVariation >= 75
      ? 'フレーズごとの高低差を大きくし、強調語で急に上げ下げする。語尾は上げ一辺倒にせず、上げ下げを混ぜる'
      : profile.pitchVariation >= 35
        ? '会話らしい自然な抑揚を付け、重要語を軽く跳ね上げる'
        : 'ピッチ変化は控えめだが、無感情な一定音程にはしない';
    const articulation = profile.articulation >= 70
      ? '子音と語頭を明瞭にし、速くても言葉を聞き取りやすく発音する'
      : profile.articulation >= 40
        ? '発音は自然な会話程度に少し崩す'
        : '子音を軽く崩してルーズに発音する。ただし単語が判別できる明瞭さは残す';
    const vowelStretch = profile.vowelStretch >= 70
      ? '強調する母音と語尾を大胆に伸ばし、伸ばす長さにばらつきを付ける'
      : profile.vowelStretch >= 35
        ? '一部の母音と語尾だけを軽く伸ばす'
        : '母音の間延びを抑え、語尾を短く切る';
    const era = profile.era === '90s'
      ? '1990年代後半の渋谷系コギャルを思わせる、チョベリバ世代の古めで派手なノリ'
      : '現代の若いギャルらしい親しみやすいノリ';
    const tension = resolvedTension(profile);
    const tensionDirection = tension >= 85
      ? 'テンションを爆発的に高くする。「ねぇねぇ！」と高く強く畳みかけ、相手の返事を待たず、次の言葉へ食い気味につなぐ。早口でも子音は少し崩し、アイドルの整った元気さではなく、距離感が近く強引に誘うチャラいノリにする。'
      : tension >= 60
        ? 'テンションは高め。リアクションを素早くし、強調語でピッチを跳ね上げて会話を前へ押す。'
        : 'テンションは控えめ。間を長めに取り、反応を急がず、語尾の力を少し抜く。';
    const familiarity = resolvedFamiliarity(profile);
    const familiarityDirection = familiarity >= 85
      ? '心理的な距離を異様に近くする。初対面でも昔からの友達のように話し、相手の名前や「ねぇ」「てかさ」を近い距離から差し込み、勝手に同意を取り、軽く品評し、返事を待たず会話へ巻き込む。嫌悪や威圧ではなく、陽気だが少し鼻につく馴れ馴れしさにする。'
      : familiarity >= 60
        ? '親しい友達へ話す距離感にし、相づちと呼びかけを自然に増やす。'
        : '相手との距離を保ち、呼びかけや決めつけを控える。';
    const deliveryDetail = [
      `TENSION / HYPER PUSH ${tension}/100。${tensionDirection}`,
      `PERSONAL SPACE / TOO CLOSE ${familiarity}/100。${familiarityDirection}`,
      `VOICE TEXTURE ${resolvedRoughness(profile)}/100。値が高いほど、声帯の軽いざらつきとエッジを足す。ただし機械的な歪みやしわがれ声にはしない。`,
      `RHYTHM SWING ${resolvedRhythmSwing(profile)}/100。値が高いほど、フレーズ内の速度をわずかに揺らして均一な棒読みにしない。`,
      `ENDING DROP ${resolvedEndingDrop(profile)}/100。値が高いほど、文末だけ力を抜いてピッチを自然に落とす。全文を低くしない。`,
      `HUMANIZE / 機械感補正 ${resolvedHumanize(profile)}/100。声の高さと若さは保ちながら、金属的な高域、過剰なフォルマント移動、均一な加工感を抑える。`,
    ].join('');

    return [
      `${era}。${voiceAgePrompt(voiceAgeBand)}`,
      `${basePitch}。${tempo}。${energy}。`,
      `${breathiness}。${forwardTwang}。${nasality}。`,
      `${formant}。${brightness}。${body}。${presence}。${dynamics}。`,
      `CUTE-CHARA ${charaLevel}/100。${attitude}`,
      performanceSequence,
      `${pitchVariation}。${articulation}。${vowelStretch}。`,
      deliveryDetail,
      '入力されたセリフの言葉とアクセントを尊重し、方言や語尾を追加・変更しない。',
      '親しい同年代の友達へ話す近い距離感にする。中年女性、母性的なおばさん声、太い胸声、艶のある熟女声、落ち着いた接客口調、ナレーター、アニメの作り声にはしない。',
    ].join('\n');
  }

  function voiceAgeLabel(value: VoiceAgeBand | undefined) {
    const option = VOICE_AGE_OPTIONS.find((item) => item.id === value);
    return option ? `${option.label} ${option.range}` : 'JK 16–18';
  }

  function voiceAgePrompt(value: VoiceAgeBand) {
    if (value === 'jc') {
      return [
        '13〜15歳の女子中学生年代を想定した、軽く未成熟で若い自然声にする。',
        '声のサイズを小さめにし、明るい前方共鳴と細い芯を保つ。',
        '成人女性の太い胸声、豊かな低音、艶、母性的な響き、接客口調には絶対にしない。',
        '幼児声や甲高いアニメ声にはせず、実在する中学生同士の会話らしくする。',
      ].join('');
    }
    if (value === 'jd') {
      return [
        '18〜22歳の女子大学生年代を想定した、若さが明確な自然声にする。',
        '社会人女性の落ち着きや完成されたナレーション声ではなく、友達同士の軽い学生らしい響きにする。',
        '胸声、低音の厚み、艶、母性的な響きを抑え、明るく前方へ集めた細い声を保つ。',
      ].join('');
    }
    return [
      '16〜18歳の女子高校生年代を想定した、明るく軽い自然声にする。',
      '声のサイズは小さめで、前方共鳴、細い芯、少し不安定な若い響きを保つ。',
      '成人女性の太い胸声、豊かな低音、艶、母性的な響き、接客口調には絶対にしない。',
      '幼児声や甲高いアニメ声にはせず、実在する高校生同士の会話らしくする。',
    ].join('');
  }

  function applyGyaruTuner() {
    const profile = currentGyaruTuning();
    voiceCaption = buildGyaruTunerPrompt(profile);
    voiceCaptionScale = Math.min(
      6,
      4
        + ((profile.energy + profile.pitchVariation) / 2) * 0.018
        + resolvedKogyaruPerformance(profile) * 0.005,
    ).toFixed(1);
    tunerLinked = true;
    statusMessage = 'GYARU TUNER APPLIED TO CAPTION';
  }

  function voiceImpressionValues(profile: StoredVoiceTuning): number[] {
    const value = normalizeVoiceTuning(profile);
    const youth = value.formantShift * 0.4
      + value.brightness * 0.25
      + value.basePitch * 0.2
      + (100 - value.body) * 0.15;
    const bright = value.brightness * 0.55
      + value.presence * 0.25
      + value.formantShift * 0.2;
    const thin = (100 - value.body) * 0.45
      + value.formantShift * 0.25
      + value.brightness * 0.2
      + value.breathiness * 0.1;
    const nasal = Math.min(100, (value.nasality / 35) * 100);
    const energy = value.energy * 0.6
      + value.presence * 0.25
      + value.dynamics * 0.15;
    const expressive = value.pitchVariation * 0.45
      + value.dynamics * 0.25
      + value.energy * 0.2
      + value.vowelStretch * 0.05
      + resolvedRoughness(value) * 0.05;
    return [youth, bright, thin, nasal, energy, expressive].map(clampTunerValue);
  }

  function deliveryImpressionValues(profile: StoredVoiceTuning): number[] {
    const value = normalizeVoiceTuning(profile);
    const chara = resolvedCharaLevel(value);
    const performance = resolvedKogyaruPerformance(value);
    const tension = resolvedTension(value);
    const familiarity = resolvedFamiliarity(value);
    const lazy = (100 - value.articulation) * 0.4
      + value.breathiness * 0.2
      + value.vowelStretch * 0.15
      + chara * 0.15
      + resolvedEndingDrop(value) * 0.1;
    const bounce = value.pitchVariation * 0.35
      + value.dynamics * 0.2
      + value.energy * 0.15
      + resolvedRhythmSwing(value) * 0.15
      + tension * 0.15;
    const slur = (100 - value.articulation) * 0.65
      + value.vowelStretch * 0.2
      + chara * 0.15;
    const reaction = value.pitchVariation * 0.2
      + value.energy * 0.18
      + value.dynamics * 0.12
      + performance * 0.13
      + tension * 0.22
      + familiarity * 0.15;
    const effectiveFast = value.tempo * 0.7 + tension * 0.3;
    return [effectiveFast, lazy, bounce, slur, value.vowelStretch, reaction].map(clampTunerValue);
  }

  function radarPoint(value: number, index: number, axisCount: number, radius = 56, center = 80) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axisCount;
    const distance = radius * (clampTunerValue(value) / 100);
    return `${center + Math.cos(angle) * distance},${center + Math.sin(angle) * distance}`;
  }

  function radarPolygon(values: number[], radius = 56) {
    return values.map((value, index) => radarPoint(value, index, values.length, radius)).join(' ');
  }

  function radarGrid(level: number, axisCount: number, radius = 56) {
    return Array.from({ length: axisCount }, (_, index) => radarPoint(level, index, axisCount, radius)).join(' ');
  }

  function radarAxisEnd(index: number, axisCount: number, radius = 56) {
    return radarPoint(100, index, axisCount, radius);
  }

  function radarLabelPoint(index: number, axisCount: number, radius = 70) {
    return radarPoint(100, index, axisCount, radius);
  }

  function candidateTitle(item: VoiceCandidate) {
    return item.memo || `${item.characterName} / ${item.mode ?? 'design'}`;
  }

  function candidateMode(item: VoiceCandidate): VoiceMode {
    return item.mode ?? 'design';
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString('ja-JP');
  }

  function describeVoice(voice: CharacterVoiceConfig | null) {
    if (!voice) return 'NOT CONFIGURED';
    const parts = [`mode=${voice.mode}`];
    if (voice.model) parts.push(`model=${voice.model}`);
    if (voice.speed && voice.speed !== 1) parts.push(`speed=${voice.speed}`);
    if (voice.autoSpeak) parts.push('autoSpeak');
    return parts.join(' / ');
  }

  function syncAutoSpeakFromCharacter() {
    autoSpeak = Boolean(selectedCharacter?.voice?.autoSpeak);
  }

  // --- loading ----------------------------------------------------------
  async function loadCharacters() {
    try {
      const res = await fetch('/api/characters');
      if (!res.ok) throw new Error(`characters load failed (${res.status})`);
      const data = (await res.json()) as { characters?: CharacterEntry[] };
      characters = data.characters ?? [];
      if (!selectedCharacterId && characters.length > 0) {
        selectedCharacterId = characters[0].id;
      }
      syncAutoSpeakFromCharacter();
    } catch (e) {
      console.error('[voice-lab] characters load failed:', e);
    }
  }

  async function loadCandidates() {
    try {
      const res = await fetch('/api/voice/designer');
      if (!res.ok) throw new Error(`candidates load failed (${res.status})`);
      const data = (await res.json()) as { items?: VoiceCandidate[] };
      candidates = data.items ?? [];
      candidatesError = null;
    } catch (e) {
      console.error('[voice-lab] candidates load failed:', e);
      candidatesError = e instanceof Error ? e.message : 'candidates load failed';
    }
  }

  async function loadBridgeResources() {
    try {
      const res = await fetch('/api/voice/candidates');
      if (!res.ok) throw new Error(`bridge status failed (${res.status})`);
      const data = (await res.json()) as {
        bridge?: { reachable?: boolean; backend?: string | null; device?: string | null; loras?: string[] };
        keptVoices?: string[];
      };
      bridgeReachable = Boolean(data.bridge?.reachable);
      bridgeInfo = bridgeReachable
        ? `${data.bridge?.backend ?? '?'} / ${data.bridge?.device ?? '?'}`
        : 'OFFLINE';
      loras = data.bridge?.loras ?? [];
      keptVoices = data.keptVoices ?? [];
      if (!cloneModel && keptVoices.length > 0) cloneModel = keptVoices[0];
      if (!loraModel && loras.length > 0) loraModel = loras[0];
    } catch (e) {
      console.error('[voice-lab] bridge status failed:', e);
      bridgeReachable = false;
      bridgeInfo = 'OFFLINE';
    }
  }

  async function loadDesignerModels() {
    try {
      const res = await fetch('/api/voice/models');
      if (!res.ok) throw new Error(`model scan failed (${res.status})`);
      const data = (await res.json()) as { engines?: { id: string; models: VoiceModelOption[] }[] };
      designerModels = data.engines?.find((engine) => engine.id === 'kizuna-voice-designer')?.models ?? [];
      const saved = localStorage.getItem(DESIGNER_MODEL_STORAGE_KEY);
      designerModel = saved && designerModels.some((model) => model.id === saved)
        ? saved
        : (designerModels[0]?.id ?? '');
    } catch (e) {
      console.error('[voice-lab] model scan failed:', e);
    }
  }

  async function loadEndpointSettings() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error(`settings load failed (${res.status})`);
      const data = (await res.json()) as {
        voice?: { backend?: string; localUrl?: string; colabUrl?: string };
      };
      voiceBackend = data.voice?.backend === 'colab' ? 'colab' : 'local';
      localVoiceUrl = data.voice?.localUrl || 'http://127.0.0.1:7860';
      colabVoiceUrl = data.voice?.colabUrl || '';
    } catch (e) {
      console.error('[voice-lab] settings load failed:', e);
    }
  }

  async function saveEndpointSettings() {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: {
            backend: voiceBackend,
            localUrl: localVoiceUrl.trim(),
            colabUrl: colabVoiceUrl.trim(),
          },
        }),
      });
      if (!res.ok) throw new Error(`settings save failed (${res.status})`);
      settingsMessage = `ENDPOINT SAVED: ${voiceBackend.toUpperCase()}`;
    } catch (e) {
      settingsMessage = e instanceof Error ? e.message : 'endpoint save failed';
    }
  }

  onMount(() => {
    loadCharacters();
    loadCandidates();
    loadBridgeResources();
    loadDesignerModels();
    loadEndpointSettings();
  });

  onDestroy(() => {
    if (elapsedTimer) clearInterval(elapsedTimer);
    stopColorMapAudio();
    void colorMapAudioContext?.close();
  });

  // --- actions ----------------------------------------------------------
  function startElapsed() {
    elapsedSec = 0;
    elapsedTimer = setInterval(() => (elapsedSec += 1), 1000);
  }

  function stopElapsed() {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  function captionWithPersona(baseCaption: string, persona: PersonaTuning | undefined) {
    return persona ? `${baseCaption}\n${buildPersonaPrompt(persona)}` : baseCaption;
  }

  function captionWithDialoguePerformance(baseCaption: string) {
    const cue = dialoguePerformanceCue.trim();
    return cue
      ? `${baseCaption}\nDIALOGUE PERFORMANCE CUE: ${cue}`
      : baseCaption;
  }

  function voiceDirectorParameters(profile: GyaruTuning): Record<VoiceDirectorParameter, number> {
    return {
      basePitch: profile.basePitch,
      tempo: profile.tempo,
      energy: profile.energy,
      breathiness: profile.breathiness,
      forwardTwang: profile.forwardTwang,
      nasality: profile.nasality,
      formantShift: profile.formantShift,
      brightness: profile.brightness,
      body: profile.body,
      presence: profile.presence,
      dynamics: profile.dynamics,
      roughness: resolvedRoughness(profile),
      rhythmSwing: resolvedRhythmSwing(profile),
      endingDrop: resolvedEndingDrop(profile),
      humanize: resolvedHumanize(profile),
      tension: resolvedTension(profile),
      familiarity: resolvedFamiliarity(profile),
      charaLevel: resolvedCharaLevel(profile),
      kogyaruPerformance: resolvedKogyaruPerformance(profile),
      pitchVariation: profile.pitchVariation,
      articulation: profile.articulation,
      vowelStretch: profile.vowelStretch,
    };
  }

  function voiceDirectorStyleLabel(value: VoiceDirectorStylePack) {
    return {
      natural: '自然会話',
      gyaru: 'ギャル',
      idol: 'アイドル',
      cool: 'クール',
      narrator: 'ナレーター',
      android: 'アンドロイド',
    }[value];
  }

  function voiceDirectorDialectLabel(value: GyaruDialect) {
    return {
      standard: '標準語',
      kansai: '関西弁',
      kanazawa: '金沢弁',
    }[value];
  }

  function voiceDirectorChanges(recipe: VoiceDirectorRecipe) {
    const before = voiceDirectorParameters(currentTuning);
    return VOICE_DIRECTOR_PARAMETERS
      .map(({ key, label }) => ({
        key,
        label,
        before: before[key],
        after: recipe.parameters[key],
        delta: recipe.parameters[key] - before[key],
      }))
      .filter((entry) => Math.abs(entry.delta) >= 3)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  function levelDescription(value: number, low: string, middle: string, high: string) {
    return value >= 68 ? high : value <= 32 ? low : middle;
  }

  function buildVoiceDirectorCaption(recipe: VoiceDirectorRecipe, profile: GyaruTuning) {
    if (recipe.stylePack === 'gyaru') {
      return [
        buildGyaruTunerPrompt(profile),
        `VOICE DIRECTOR: ${recipe.summary}`,
        `PERFORMANCE: ${recipe.performanceCue}`,
      ].join('\n');
    }

    const styleDirection: Record<Exclude<VoiceDirectorStylePack, 'gyaru'>, string> = {
      natural: '作り声にせず、同年代の相手へ話す自然な会話声',
      idol: '明るく整った、聞き取りやすいアイドル系の発声',
      cool: '抑制があり、芯の通ったクールな会話声',
      narrator: '情報を明瞭に届ける、安定したナレーション発声',
      android: '均整の取れたタイミングを持つ、無機質寄りのアンドロイド発声',
    };

    return [
      `${voiceDirectorStyleLabel(recipe.stylePack)}スタイル。${styleDirection[recipe.stylePack]}`,
      voiceAgePrompt(recipe.voiceAgeBand),
      `VOICE DIRECTOR: ${recipe.summary}`,
      [
        `声の高さは${levelDescription(profile.basePitch, '低め', '中程度', '高め')}`,
        `話速は${levelDescription(profile.tempo, 'ゆっくり', '自然', '速め')}`,
        `勢いは${levelDescription(profile.energy, '控えめ', '自然', '強め')}`,
        `声の明るさは${levelDescription(profile.brightness, '暗め', '自然', '明るめ')}`,
        `声の太さは${levelDescription(profile.body, '細め', '中程度', '太め')}`,
        `抑揚は${levelDescription(profile.pitchVariation, '小さく', '自然に', '大きく')}`,
      ].join('。') + '。',
      `息感 ${profile.breathiness}/100、前方共鳴 ${profile.forwardTwang}/100、鼻声 ${profile.nasality}/100、滑舌 ${profile.articulation}/100。`,
      `PERFORMANCE: ${recipe.performanceCue}`,
      '入力されたセリフの言葉、アクセント、方言を尊重し、文章にない笑い声、フィラー、掛け声、余分な声を追加しない。',
    ].join('\n');
  }

  async function directVoiceFromInstruction() {
    if (isDirectingVoice || !voiceDirectorInstruction.trim()) return;
    isDirectingVoice = true;
    voiceDirectorError = null;

    try {
      const res = await fetch('/api/voice/director', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: voiceDirectorInstruction.trim(),
          voiceAgeBand,
          currentParameters: voiceDirectorParameters(currentTuning),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        recipe?: VoiceDirectorRecipe;
        model?: string;
        message?: string;
      };
      if (!res.ok || !data.recipe) {
        throw new Error(data.message || `声の指示を解釈できませんでした (${res.status})`);
      }
      voiceDirectorRecipe = data.recipe;
      voiceDirectorModel = data.model ?? '';
      statusMessage = `VOICE DIRECTOR READY${voiceDirectorModel ? ` / ${voiceDirectorModel}` : ''}`;
    } catch (caught) {
      voiceDirectorError = caught instanceof Error ? caught.message : '声の指示を解釈できませんでした';
    } finally {
      isDirectingVoice = false;
    }
  }

  function applyVoiceDirectorRecipe() {
    if (!voiceDirectorRecipe) return;
    const recipe = voiceDirectorRecipe;
    const nextEra: GyaruEra = recipe.stylePack === 'gyaru'
      && recipe.parameters.kogyaruPerformance >= 35
      ? '90s'
      : 'modern';
    const profile: GyaruTuning = {
      ...currentGyaruTuning(),
      ...recipe.parameters,
      version: 4,
      dialectStyle: recipe.dialectStyle,
      dialectStrength: recipe.dialectStrength,
      era: nextEra,
      paletteId: 'voice-director',
      mapX: undefined,
      mapY: undefined,
      mapColor: undefined,
    };

    setGyaruTuning(profile);
    voiceAgeBand = recipe.voiceAgeBand;
    voiceCaption = buildVoiceDirectorCaption(recipe, profile);
    dialoguePerformanceCue = recipe.performanceCue;
    voiceCaptionScale = Math.min(
      6,
      4 + ((profile.energy + profile.pitchVariation) / 2) * 0.018,
    ).toFixed(1);
    tunerLinked = true;
    statusMessage = `VOICE DIRECTOR APPLIED: ${voiceDirectorStyleLabel(recipe.stylePack)}`;
  }

  async function generateDialogue() {
    if (isGeneratingDialogue || !selectedCharacter) return;
    isGeneratingDialogue = true;
    dialogueError = null;

    try {
      const res = await fetch('/api/voice/dialogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterName: selectedCharacter.name,
          characterRole: selectedCharacter.role,
          instruction: dialogueInstruction.trim(),
          voiceAgeBand,
          personaKind: personaLinked ? currentPersonaTuning.kind : 'neutral',
          era: tunerEra,
          charaLevel: resolvedCharaLevel(currentTuning),
          kogyaruPerformance: resolvedKogyaruPerformance(currentTuning),
          tension: resolvedTension(currentTuning),
          familiarity: resolvedFamiliarity(currentTuning),
          voiceCaption: voiceCaption.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        displayText?: string;
        speechText?: string;
        performanceCue?: string;
        model?: string;
        message?: string;
      };
      const speechText = data.speechText || data.text || '';
      if (!res.ok || !speechText) {
        throw new Error(data.message || `セリフ生成に失敗しました (${res.status})`);
      }
      dialogueDisplayText = data.displayText || speechText;
      dialoguePerformanceCue = data.performanceCue || '';
      sampleText = speechText;
      dialogueModel = data.model ?? '';
      statusMessage = `AI DIALOGUE READY${dialogueModel ? ` / ${dialogueModel}` : ''}`;
    } catch (caught) {
      dialogueError = caught instanceof Error ? caught.message : 'セリフ生成に失敗しました';
    } finally {
      isGeneratingDialogue = false;
    }
  }

  async function readVoiceGenerationError(res: Response) {
    const detail = await res
      .json()
      .then((data: { error?: string; detail?: string }) => data.detail || data.error || '')
      .catch(() => '');
    return detail || `voice generation failed (${res.status})`;
  }

  async function requestDesignerCandidate(input: {
    caption: string;
    memo: string;
    seed: string;
    persona?: PersonaTuning;
  }): Promise<VoiceCandidate> {
    if (!selectedCharacter) throw new Error('character is not selected');
    const res = await fetch('/api/voice/designer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterName: selectedCharacter.name,
        text: sampleText.trim(),
        displayText: dialogueDisplayText.trim() || undefined,
        performanceCue: dialoguePerformanceCue.trim() || undefined,
        caption: captionWithDialoguePerformance(input.caption),
        model: designerModel,
        seed: input.seed,
        seconds: voiceSeconds.trim(),
        steps: voiceSteps.trim() || '20',
        cfgCaptionScale: voiceCaptionScale.trim() || '4.0',
        memo: input.memo,
        voiceTuning: tunerLinked ? currentGyaruTuning() : undefined,
        personaTuning: input.persona,
        voiceAgeBand,
      }),
    });
    if (!res.ok) throw new Error(await readVoiceGenerationError(res));
    const data = (await res.json()) as { libraryEntry?: VoiceCandidate };
    if (!data.libraryEntry) throw new Error('voice candidate was not returned');
    return data.libraryEntry;
  }

  function stopColorMapAudio() {
    if (colorMapAudioSource) {
      try {
        colorMapAudioSource.stop();
      } catch {
        // The previous source may already have naturally finished.
      }
      colorMapAudioSource = null;
    }
    if (colorMapFallbackAudio) {
      colorMapFallbackAudio.pause();
      colorMapFallbackAudio = null;
    }
  }

  async function prepareColorMapAudioContext() {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    colorMapAudioContext ??= new AudioContextClass();
    if (colorMapAudioContext.state === 'suspended') {
      await colorMapAudioContext.resume();
    }
    return colorMapAudioContext;
  }

  async function playColorMapCandidate(entry: VoiceCandidate, preparedContext: AudioContext | null) {
    const audioUrl = `${entry.audioUrl}?t=${encodeURIComponent(entry.createdAt)}`;
    if (!preparedContext) {
      stopColorMapAudio();
      colorMapFallbackAudio = new Audio(audioUrl);
      await colorMapFallbackAudio.play();
      return;
    }

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) throw new Error(`preview audio load failed (${audioResponse.status})`);
    const audioBuffer = await preparedContext.decodeAudioData(await audioResponse.arrayBuffer());
    stopColorMapAudio();
    const source = preparedContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(preparedContext.destination);
    source.onended = () => {
      if (colorMapAudioSource === source) colorMapAudioSource = null;
    };
    colorMapAudioSource = source;
    source.start();
  }

  async function previewColorMapVoice(event: MouseEvent) {
    event.stopPropagation();
    if (isPreviewingColorMap || !canGenerate || !selectedCharacter || mode !== 'design') return;

    // Resume audio during the actual click so delayed generation can still play automatically.
    const preparedContext = await prepareColorMapAudioContext().catch(() => null);
    isPreviewingColorMap = true;
    isGenerating = true;
    generateError = null;
    colorMapPreviewError = null;
    statusMessage = `MAP PREVIEW GENERATING: ${colorMapLocation.zone}`;
    startElapsed();

    try {
      const persona = personaLinked ? currentPersonaTuning : undefined;
      const entry = await requestDesignerCandidate({
        caption: captionWithPersona(voiceCaption.trim(), persona),
        memo: `MAP ${colorMapLocation.zone} / X ${colorMapLocation.x} Y ${colorMapLocation.y}`,
        seed: voiceSeed.trim(),
        persona,
      });
      candidates = [entry, ...candidates.filter((item) => item.id !== entry.id)];
      await playColorMapCandidate(entry, preparedContext);
      statusMessage = `MAP PREVIEW PLAYING: ${colorMapLocation.zone} / ${colorMapLocation.pitch} / ${colorMapLocation.tempo}`;
    } catch (caught) {
      console.error('[voice-lab] map preview failed:', caught);
      colorMapPreviewError = caught instanceof Error ? caught.message : 'マップ位置の音声を再生できませんでした';
      generateError = colorMapPreviewError;
    } finally {
      stopElapsed();
      isGenerating = false;
      isPreviewingColorMap = false;
    }
  }

  async function generateVoice() {
    if (!canGenerate || !selectedCharacter) return;

    isGenerating = true;
    generateError = null;
    statusMessage = null;
    startElapsed();

    try {
      if (mode === 'design') {
        const persona = personaLinked ? currentPersonaTuning : undefined;
        const entry = await requestDesignerCandidate({
          caption: captionWithPersona(voiceCaption.trim(), persona),
          memo: candidateName.trim(),
          seed: voiceSeed.trim(),
          persona,
        });
        candidates = [entry, ...candidates.filter((item) => item.id !== entry.id)];
      } else {
        const res = await fetch('/api/voice/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterName: selectedCharacter.name,
            text: sampleText.trim(),
            mode,
            model: mode === 'clone' ? cloneModel : loraModel,
            caption: voiceCaption.trim(),
            speed: parsedSpeed(),
            memo: candidateName.trim(),
          }),
        });
        if (!res.ok) throw new Error(await readVoiceGenerationError(res));
        const data = (await res.json()) as { libraryEntry?: VoiceCandidate };
        if (data.libraryEntry) {
          candidates = [data.libraryEntry, ...candidates.filter((item) => item.id !== data.libraryEntry?.id)];
        } else {
          await loadCandidates();
        }
      }
      statusMessage = `CANDIDATE ADDED (${elapsedSec}s)`;
    } catch (e) {
      console.error('[voice-lab] generate failed:', e);
      generateError = e instanceof Error ? e.message : 'voice generation failed';
    } finally {
      stopElapsed();
      isGenerating = false;
    }
  }

  async function generatePersonaAB() {
    if (!canGenerate || !selectedCharacter || mode !== 'design') return;

    isGenerating = true;
    generateError = null;
    statusMessage = 'A/B 1/2: HONORS GYARU';
    personaABResults = [];
    startElapsed();

    const sharedSeed = voiceSeed.trim()
      || String(Math.floor(Math.random() * 2_000_000_000) + 1);
    const comparisonId = `persona-ab-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const honors: PersonaTuning = {
      ...personaTuningFromPosition(-0.88, personaMapY),
      kind: 'honors',
      comparisonId,
    };
    const spontaneous: PersonaTuning = {
      ...personaTuningFromPosition(0.88, personaMapY),
      kind: 'spontaneous',
      comparisonId,
    };
    const baseName = candidateName.trim();
    const results: VoiceCandidate[] = [];

    try {
      const first = await requestDesignerCandidate({
        caption: captionWithPersona(voiceCaption.trim(), honors),
        memo: baseName ? `${baseName} / 優等生` : '優等生ギャル A',
        seed: sharedSeed,
        persona: honors,
      });
      results.push(first);
      statusMessage = 'A/B 2/2: SPONTANEOUS GYARU';

      const second = await requestDesignerCandidate({
        caption: captionWithPersona(voiceCaption.trim(), spontaneous),
        memo: baseName ? `${baseName} / おバカ` : 'おバカギャル B',
        seed: sharedSeed,
        persona: spontaneous,
      });
      results.push(second);
      personaABResults = results;
      candidates = [
        ...results,
        ...candidates.filter((item) => !results.some((result) => result.id === item.id)),
      ];
      statusMessage = `A/B READY — SAME SEED ${sharedSeed} (${elapsedSec}s)`;
    } catch (e) {
      if (results.length > 0) {
        candidates = [
          ...results,
          ...candidates.filter((item) => !results.some((result) => result.id === item.id)),
        ];
      }
      console.error('[voice-lab] persona A/B failed:', e);
      generateError = e instanceof Error ? e.message : 'persona A/B generation failed';
    } finally {
      stopElapsed();
      isGenerating = false;
    }
  }

  async function putCharacterVoice(payload: Record<string, unknown>): Promise<CharacterEntry> {
    if (!selectedCharacter) throw new Error('character is not selected');
    const res = await fetch(`/api/characters/${encodeURIComponent(selectedCharacter.id)}/voice`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { character?: CharacterEntry; message?: string };
    if (!res.ok || !data.character) {
      throw new Error(data.message || `voice update failed (${res.status})`);
    }
    characters = characters.map((entry) => (entry.id === data.character?.id ? data.character : entry));
    return data.character;
  }

  async function adoptCandidate(item: VoiceCandidate) {
    if (!selectedCharacter || busyCandidateId) return;

    busyCandidateId = item.id;
    generateError = null;
    statusMessage = null;

    try {
      const base = {
        engine: 'irodori',
        speed: parsedSpeed(),
        autoSpeak,
      };
      const itemMode = candidateMode(item);
      let payload: Record<string, unknown>;

      if (itemMode === 'design') {
        // design 候補は wav を kept voice として登録し clone モードで採用する
        // (bridge の design 直接合成は 30 秒固定生成で CPU では実用外のため)。
        payload = {
          voice: { ...base, mode: 'design', model: '', caption: item.caption },
          keptVoice: {
            sourceAudioUrl: item.audioUrl,
            text: item.text,
            name: `${selectedCharacter.id}_${item.id.slice(0, 8)}`,
          },
        };
      } else {
        payload = {
          voice: {
            ...base,
            mode: itemMode,
            model: item.checkpoint,
            ...(item.caption ? { caption: item.caption } : {}),
          },
        };
      }

      const character = await putCharacterVoice(payload);
      statusMessage = `ADOPTED: ${candidateTitle(item)} → ${character.name}`;
      if (itemMode === 'design') await loadBridgeResources();
    } catch (e) {
      console.error('[voice-lab] adopt failed:', e);
      generateError = e instanceof Error ? e.message : 'adopt failed';
    } finally {
      busyCandidateId = null;
    }
  }

  async function deleteCandidate(item: VoiceCandidate) {
    if (busyCandidateId) return;
    if (!confirm(`候補「${candidateTitle(item)}」を削除しますか?`)) return;

    busyCandidateId = item.id;
    try {
      const res = await fetch(`/api/voice/candidates?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `delete failed (${res.status})`);
      }
      candidates = candidates.filter((entry) => entry.id !== item.id);
      statusMessage = `DELETED: ${candidateTitle(item)}`;
    } catch (e) {
      console.error('[voice-lab] delete failed:', e);
      generateError = e instanceof Error ? e.message : 'delete failed';
    } finally {
      busyCandidateId = null;
    }
  }

  function toggleCandidateEditor(item: VoiceCandidate) {
    if (editingCandidateId === item.id) {
      editingCandidateId = null;
      candidateEditError = null;
      return;
    }
    editingCandidateId = item.id;
    candidateMemoDraft = item.memo ?? '';
    candidateEditError = null;
  }

  async function saveCandidateName(item: VoiceCandidate) {
    if (savingCandidateId) return;
    savingCandidateId = item.id;
    candidateEditError = null;

    try {
      const res = await fetch('/api/voice/candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, memo: candidateMemoDraft }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        libraryEntry?: VoiceCandidate;
        error?: string;
      };
      if (!res.ok || !data.libraryEntry) {
        throw new Error(data.error || `candidate update failed (${res.status})`);
      }

      candidates = candidates.map((entry) => (
        entry.id === data.libraryEntry?.id ? data.libraryEntry : entry
      ));
      statusMessage = `CANDIDATE UPDATED: ${candidateTitle(data.libraryEntry)}`;
      editingCandidateId = null;
    } catch (e) {
      candidateEditError = e instanceof Error ? e.message : 'candidate update failed';
    } finally {
      savingCandidateId = null;
    }
  }

  async function applyFormToCharacter() {
    if (!canApplyForm || busyCandidateId) return;

    generateError = null;
    statusMessage = null;
    try {
      const voice = {
        engine: 'irodori',
        mode,
        model: mode === 'clone' ? cloneModel : mode === 'lora' ? loraModel : '',
        ...(voiceCaption.trim() ? { caption: voiceCaption.trim() } : {}),
        speed: parsedSpeed(),
        autoSpeak,
      };
      const character = await putCharacterVoice({ voice });
      statusMessage = `VOICE APPLIED: ${character.name}`;
    } catch (e) {
      console.error('[voice-lab] apply failed:', e);
      generateError = e instanceof Error ? e.message : 'apply failed';
    }
  }

  function applyStylePreset(preset: (typeof stylePresets)[number]) {
    // 複数の相反するプリセットを連結すると conditioning が弱まるため、プリセットは置換する。
    voiceCaption = preset.caption;
    if (preset.sampleText) sampleText = preset.sampleText;
    voiceCaptionScale = preset.captionScale ?? '4.0';
    const palette = findVoicePalette(PRESET_PALETTE[preset.id]);
    if (palette) setGyaruTuning({ ...palette.profile, paletteId: palette.id });
    tunerLinked = Boolean(palette);
  }

  function saveDesignerModel() {
    if (designerModel) localStorage.setItem(DESIGNER_MODEL_STORAGE_KEY, designerModel);
  }
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="voice-shell">
  <div class="grid-bg" aria-hidden="true"></div>
  <div class="scanlines" aria-hidden="true"></div>

  <main class="voice-lab">
    <header class="lab-header">
      <a href="/" class="back-link">← CENTRAL TERMINAL</a>
      <div class="title-block">
        <h1>VOICE LAB</h1>
        <p>CREATE / COMPARE / ADOPT CHARACTER VOICES</p>
      </div>
      <div class="status">
        <span class:offline={!bridgeReachable}></span>
        BRIDGE {bridgeReachable ? bridgeInfo : 'OFFLINE'}
      </div>
    </header>

    <section class="workspace">
      <!-- ============ LEFT: CREATE ============ -->
      <div class="panel create-panel">
        <div class="panel-header">
          <span>CREATE VOICE</span>
          <b>{isGenerating ? `GENERATING ${elapsedSec}s` : 'READY'}</b>
        </div>

        <label>
          <span>Character</span>
          <select bind:value={selectedCharacterId} onchange={syncAutoSpeakFromCharacter}>
            {#each characters as character}
              <option value={character.id}>{character.name} ({character.id})</option>
            {/each}
          </select>
        </label>

        <div class="mode-bar" role="tablist" aria-label="production mode">
          <button class:active={mode === 'design'} onclick={() => (mode = 'design')}>IRODORI</button>
          <button class:active={mode === 'clone'} onclick={() => (mode = 'clone')}>HONOKA</button>
          <button class:active={mode === 'lora'} onclick={() => (mode = 'lora')}>LORA</button>
          <button class:active={mode === 'character'} onclick={() => (mode = 'character')}>CLOUD</button>
        </div>

        {#if mode === 'character'}
          <CharacterVoiceDesign
            characterId={selectedCharacterId}
            characterName={selectedCharacter?.name ?? ''}
          />
        {:else}
        {#if mode !== 'design' && !bridgeReachable}
          <div class="warn-box">Voice Bridge (port 8791) が起動していません。run_voice_bridge.bat を実行してください。</div>
        {/if}

        {#if mode === 'clone'}
          <label>
            <span>Kept Voice</span>
            <select bind:value={cloneModel} disabled={keptVoices.length === 0}>
              {#each keptVoices as name}
                <option value={name}>{name}</option>
              {/each}
            </select>
          </label>
          {#if keptVoices.length === 0}
            <div class="hint-line">kept voice がありません。design 候補を採用すると自動登録されます。</div>
          {/if}
        {:else if mode === 'lora'}
          <label>
            <span>LoRA Model</span>
            <select bind:value={loraModel} disabled={loras.length === 0}>
              {#each loras as name}
                <option value={name}>{name}</option>
              {/each}
            </select>
          </label>
          {#if loras.length === 0}
            <div class="hint-line">学習済み LoRA がありません。</div>
          {/if}
        {/if}

        <label>
          <span>Voice Caption {mode === 'design' ? '(required)' : '(optional)'}</span>
          <textarea
            bind:value={voiceCaption}
            oninput={markTunerDirty}
            rows="3"
            placeholder="声質・話し方・距離感を記述"
          ></textarea>
        </label>

        {#if mode === 'design'}
          <section class="voice-director" aria-label="自然言語による声の調整">
            <div class="voice-director-head">
              <div>
                <b>VOICE DIRECTOR</b>
                <span>自然な指示を、LoRAなしで声の設計図へ変換</span>
              </div>
              {#if voiceDirectorModel}
                <small>{voiceDirectorModel}</small>
              {/if}
            </div>
            <div class="voice-director-input">
              <textarea
                bind:value={voiceDirectorInstruction}
                rows="2"
                maxlength="800"
                placeholder="例：若く明るいJKの声。鼻声は弱め、少し早口で抑揚を大きく。テンションは高いけど機械っぽくしない"
              ></textarea>
              <button
                type="button"
                onclick={directVoiceFromInstruction}
                disabled={isDirectingVoice || !voiceDirectorInstruction.trim()}
              >
                {isDirectingVoice ? 'INTERPRETING...' : '指示を解釈'}
              </button>
            </div>
            <p>現在値を基準に解釈します。まだパレットには反映されません。</p>
            {#if voiceDirectorError}
              <div class="error-box">{voiceDirectorError}</div>
            {/if}
            {#if voiceDirectorRecipe}
              <div class="voice-director-preview">
                <div class="director-summary">
                  <b>{voiceDirectorRecipe.summary}</b>
                  <div>
                    <span>{voiceDirectorStyleLabel(voiceDirectorRecipe.stylePack)}</span>
                    <span>{voiceAgeLabel(voiceDirectorRecipe.voiceAgeBand)}</span>
                    <span>
                      {voiceDirectorDialectLabel(voiceDirectorRecipe.dialectStyle)}
                      {voiceDirectorRecipe.dialectStrength > 0 ? ` ${voiceDirectorRecipe.dialectStrength}` : ''}
                    </span>
                  </div>
                </div>
                <div class="director-changes">
                  {#if voiceDirectorChanges(voiceDirectorRecipe).length}
                    {#each voiceDirectorChanges(voiceDirectorRecipe).slice(0, 10) as change}
                      <span class:director-up={change.delta > 0} class:director-down={change.delta < 0}>
                        <small>{change.label}</small>
                        <b>{change.before} → {change.after}</b>
                      </span>
                    {/each}
                  {:else}
                    <span class="director-no-change">大きく変更するパラメータはありません</span>
                  {/if}
                </div>
                <div class="director-cue">
                  <small>PERFORMANCE CUE</small>
                  <span>{voiceDirectorRecipe.performanceCue}</span>
                </div>
                {#if voiceDirectorRecipe.interpretation.length}
                  <ul class="director-notes">
                    {#each voiceDirectorRecipe.interpretation as note}
                      <li>{note}</li>
                    {/each}
                  </ul>
                {/if}
                {#if voiceDirectorRecipe.cautions.length}
                  <div class="director-cautions">
                    {#each voiceDirectorRecipe.cautions as caution}
                      <span>△ {caution}</span>
                    {/each}
                  </div>
                {/if}
                <button type="button" class="director-apply" onclick={applyVoiceDirectorRecipe}>
                  この設計図をパレットへ反映
                </button>
              </div>
            {/if}
          </section>

          <section class="voice-age-selector" aria-label="声の年齢層">
            <div class="voice-age-heading">
              <b>VOICE AGE</b>
              <span>成人声化を防ぎ、生成時の声齢を固定</span>
            </div>
            <div class="voice-age-options">
              {#each VOICE_AGE_OPTIONS as option}
                <button
                  type="button"
                  class:active={voiceAgeBand === option.id}
                  onclick={() => (voiceAgeBand = option.id)}
                  title={option.description}
                >
                  <b>{option.label}</b>
                  <span>{option.range}</span>
                  <small>{option.description}</small>
                </button>
              {/each}
            </div>
          </section>

          <div class="style-preset-row">
            {#each stylePresets as preset}
              <button onclick={() => applyStylePreset(preset)} title={preset.caption}>{preset.id}</button>
            {/each}
          </div>

          <section class="gyaru-tuner" aria-label="ギャル声チューナー">
            <div class="tuner-head">
              <div>
                <b>VOICE COLOR PALETTE</b>
                <span>色を声の質感へマッピング</span>
              </div>
              <span class:tuner-applied={tunerLinked} class="tuner-state">
                {tunerLinked ? 'APPLIED' : 'EDITED'}
              </span>
            </div>

            <div class="tuner-layout">
              <div class="radar-suite">
                <div class="radar-card">
                  <div class="radar-title">
                    <b>声質マップ</b>
                    <span>VOICE IMPRESSION</span>
                  </div>
                  <svg class="tuner-radar" viewBox="0 0 160 160" role="img" aria-label="声質の聴感パラメータ">
                    {#each [25, 50, 75, 100] as level}
                      <polygon class="radar-grid" points={radarGrid(level, VOICE_IMPRESSION_AXES.length)}></polygon>
                    {/each}
                    {#each VOICE_IMPRESSION_AXES as axis, index}
                      <line class="radar-axis" x1="80" y1="80" x2={radarAxisEnd(index, VOICE_IMPRESSION_AXES.length).split(',')[0]} y2={radarAxisEnd(index, VOICE_IMPRESSION_AXES.length).split(',')[1]}></line>
                      <text
                        class="radar-label"
                        x={radarLabelPoint(index, VOICE_IMPRESSION_AXES.length).split(',')[0]}
                        y={radarLabelPoint(index, VOICE_IMPRESSION_AXES.length).split(',')[1]}
                      >{axis.label}</text>
                    {/each}
                    <polygon class="radar-value" points={radarPolygon(currentVoiceImpression)}></polygon>
                    {#each currentVoiceImpression as value, index}
                      <circle
                        class="radar-dot"
                        cx={radarPoint(value, index, currentVoiceImpression.length).split(',')[0]}
                        cy={radarPoint(value, index, currentVoiceImpression.length).split(',')[1]}
                        r="2.2"
                      ></circle>
                    {/each}
                  </svg>
                  <div class="radar-metrics">
                    {#each VOICE_IMPRESSION_AXES as axis, index}
                      <span title={axis.description}>{axis.label} <b>{currentVoiceImpression[index]}</b></span>
                    {/each}
                  </div>
                </div>

                <div class="radar-card delivery-radar-card">
                  <div class="radar-title">
                    <b>話し方マップ</b>
                    <span>DELIVERY STYLE</span>
                  </div>
                  <svg class="tuner-radar" viewBox="0 0 160 160" role="img" aria-label="発話演技の聴感パラメータ">
                    {#each [25, 50, 75, 100] as level}
                      <polygon class="radar-grid" points={radarGrid(level, DELIVERY_IMPRESSION_AXES.length)}></polygon>
                    {/each}
                    {#each DELIVERY_IMPRESSION_AXES as axis, index}
                      <line class="radar-axis" x1="80" y1="80" x2={radarAxisEnd(index, DELIVERY_IMPRESSION_AXES.length).split(',')[0]} y2={radarAxisEnd(index, DELIVERY_IMPRESSION_AXES.length).split(',')[1]}></line>
                      <text
                        class="radar-label"
                        x={radarLabelPoint(index, DELIVERY_IMPRESSION_AXES.length).split(',')[0]}
                        y={radarLabelPoint(index, DELIVERY_IMPRESSION_AXES.length).split(',')[1]}
                      >{axis.label}</text>
                    {/each}
                    <polygon class="radar-value delivery-radar-value" points={radarPolygon(currentDeliveryImpression)}></polygon>
                    {#each currentDeliveryImpression as value, index}
                      <circle
                        class="radar-dot delivery-radar-dot"
                        cx={radarPoint(value, index, currentDeliveryImpression.length).split(',')[0]}
                        cy={radarPoint(value, index, currentDeliveryImpression.length).split(',')[1]}
                        r="2.2"
                      ></circle>
                    {/each}
                  </svg>
                  <div class="radar-metrics">
                    {#each DELIVERY_IMPRESSION_AXES as axis, index}
                      <span title={axis.description}>{axis.label} <b>{currentDeliveryImpression[index]}</b></span>
                    {/each}
                  </div>
                </div>

                <div class="radar-caption">0＝弱い / 100＝強い ・ 選択色 {colorMapColor}</div>
              </div>

              <div class="voice-color-map-panel">
                <div class="voice-color-wheel-shell">
                  <span class="map-label map-label-top">早口</span>
                  <span class="map-label map-label-right">高い声</span>
                  <span class="map-label map-label-bottom">ゆっくり</span>
                  <span class="map-label map-label-left">低い声</span>
                  <div
                    class="voice-color-wheel"
                    style={`--mapped-color: ${colorMapColor}`}
                    role="slider"
                    tabindex="0"
                    aria-label="声のピッチと話速を選ぶカラーマップ"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={currentTuning.basePitch}
                    aria-valuetext={`pitch ${currentTuning.basePitch}, tempo ${currentTuning.tempo}`}
                    onpointerdown={startColorMapDrag}
                    onpointermove={moveColorMapDrag}
                    onpointerup={stopColorMapDrag}
                    onpointercancel={stopColorMapDrag}
                    onkeydown={moveColorMapWithKeyboard}
                  >
                    <span class="map-crosshair map-crosshair-x"></span>
                    <span class="map-crosshair map-crosshair-y"></span>
                    <button
                      type="button"
                      class="color-map-pointer"
                      style={`left: ${(colorMapX + 1) * 50}%; top: ${(colorMapY + 1) * 50}%; --mapped-color: ${colorMapColor}`}
                      title={`${colorMapLocation.zone}の声を生成して再生`}
                      aria-label={`${colorMapLocation.pitch}、${colorMapLocation.tempo}の声を生成して再生`}
                      disabled={!canGenerate || isPreviewingColorMap}
                      onpointerdown={(event) => event.stopPropagation()}
                      onclick={previewColorMapVoice}
                    >
                      <span aria-hidden="true"></span>
                    </button>
                  </div>
                </div>

                <div class="color-map-location" style={`--location-color: ${colorMapColor}`}>
                  <div class="location-name">
                    <small>VOICE LOCATION</small>
                    <b>{colorMapLocation.zone}</b>
                    <span>{colorMapLocation.depth}</span>
                  </div>
                  <div class="location-details">
                    <span>{colorMapLocation.pitch}</span>
                    <span>{colorMapLocation.tempo}</span>
                    <span>X {colorMapLocation.x >= 0 ? '+' : ''}{colorMapLocation.x}</span>
                    <span>Y {colorMapLocation.y >= 0 ? '+' : ''}{colorMapLocation.y}</span>
                    <span>強度 {colorMapLocation.radius}%</span>
                  </div>
                  <p>
                    {isPreviewingColorMap
                      ? `この位置の声を生成中… ${elapsedSec}s`
                      : '丸いポインタの▶を押すと、この位置の声を生成して自動再生します。'}
                  </p>
                </div>
                {#if colorMapPreviewError}
                  <div class="error-box">{colorMapPreviewError}</div>
                {/if}

                <div class="mapped-primary">
                  <span>
                    声の高さ
                    <b>{pitchSemitonesForTuning(currentTuning) >= 0 ? '+' : ''}{pitchSemitonesForTuning(currentTuning).toFixed(1)} st</b>
                  </span>
                  <span>話す速さ <b>{tempoRateForTuning(currentTuning).toFixed(2)}×</b></span>
                </div>
                <div class="mapped-secondary">
                  <span>勢い {currentTuning.energy}</span>
                  <span>息感 {currentTuning.breathiness}</span>
                  <span>前響き {currentTuning.forwardTwang}</span>
                  <span>鼻声 {currentTuning.nasality}</span>
                  <span>声道サイズ {formantRatioForTuning(currentTuning).toFixed(3)}×</span>
                  <span>明るさ {brightnessDbForTuning(currentTuning) >= 0 ? '+' : ''}{brightnessDbForTuning(currentTuning).toFixed(1)}dB</span>
                  <span>声の太さ {bodyDbForTuning(currentTuning) >= 0 ? '+' : ''}{bodyDbForTuning(currentTuning).toFixed(1)}dB</span>
                  <span>近さ・存在感 {presenceDbForTuning(currentTuning) >= 0 ? '+' : ''}{presenceDbForTuning(currentTuning).toFixed(1)}dB</span>
                  <span>音量差 {dynamicsRatioForTuning(currentTuning).toFixed(1)}:1</span>
                  <span>抑揚 {currentTuning.pitchVariation}</span>
                  <span>滑舌 {currentTuning.articulation}</span>
                </div>
                <div class="tension-control">
                  <div class="tension-head">
                    <span>LOW KEY</span>
                    <b>TENSION {tunerTension}</b>
                    <span>HYPER PUSH</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    bind:value={tunerTension}
                    oninput={applyTension}
                    aria-label="テンションと強引な誘いの強さ"
                  />
                  <p>
                    {tunerTension >= 85
                      ? '「ねぇねぇ！」と畳みかけ、返事を待たず食い気味に誘う。'
                      : tunerTension >= 60
                        ? '反応を速くし、強調語を跳ね上げて会話を押す。'
                        : '間を長めに取り、落ち着いた反応にする。'}
                  </p>
                  <div class="macro-effects">
                    <div class="macro-effect-row">
                      <b>VOICE EFFECTS</b>
                      <span>PITCH <strong>+{tensionPitchBoost(currentTuning).toFixed(2)}st</strong></span>
                      <span>TEMPO <strong>+{tensionTempoBoostPercent(currentTuning).toFixed(1)}%</strong></span>
                      <span>PRESENCE <strong>+{tensionPresenceBoost(currentTuning).toFixed(2)}dB</strong></span>
                      <span>SWING MIN <strong>{tensionSwingFloor(currentTuning)}</strong></span>
                      <span>ENDING RETAIN <strong>{tensionEndingRetention(currentTuning)}%</strong></span>
                    </div>
                    <div class="macro-effect-row dialogue-effect-row">
                      <b>DIALOGUE EFFECTS</b>
                      {#if tunerTension >= 85}
                        <span>ねぇねぇ連打</span><span>返事待ちなし</span><span>食い気味</span><span>語尾上げ</span>
                      {:else if tunerTension >= 60}
                        <span>即反応</span><span>強調語ジャンプ</span><span>短い間</span>
                      {:else}
                        <span>長い間</span><span>低反応</span><span>語尾脱力</span>
                      {/if}
                    </div>
                  </div>
                </div>
                <div class="familiarity-control">
                  <div class="familiarity-head">
                    <span>RESERVED</span>
                    <b>PERSONAL SPACE {tunerFamiliarity}</b>
                    <span>TOO CLOSE</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    bind:value={tunerFamiliarity}
                    oninput={applyFamiliarity}
                    aria-label="馴れ馴れしさと心理的距離の近さ"
                  />
                  <p>
                    {tunerFamiliarity >= 85
                      ? '初対面でも友達扱い。勝手に同意を取り、返事を待たず巻き込む。'
                      : tunerFamiliarity >= 60
                        ? '親しい友達の距離感で、呼びかけと相づちを増やす。'
                        : '相手との距離を保ち、決めつけや割り込みを控える。'}
                  </p>
                  <div class="macro-effects">
                    <div class="macro-effect-row">
                      <b>VOICE EFFECTS</b>
                      <span>PITCH <strong>+{familiarityPitchBoost(currentTuning).toFixed(2)}st</strong></span>
                      <span>TEMPO <strong>+{familiarityTempoBoostPercent(currentTuning).toFixed(1)}%</strong></span>
                      <span>PRESENCE <strong>+{familiarityPresenceBoost(currentTuning).toFixed(2)}dB</strong></span>
                      <span>NASAL <strong>NO CHANGE</strong></span>
                    </div>
                    <div class="macro-effect-row dialogue-effect-row">
                      <b>DIALOGUE EFFECTS</b>
                      {#if tunerFamiliarity >= 85}
                        <span>直接呼びかけ</span><span>勝手に同意</span><span>軽く品評</span><span>返事待ちなし</span>
                      {:else if tunerFamiliarity >= 60}
                        <span>友達口調</span><span>呼びかけ増加</span><span>相づち増加</span>
                      {:else}
                        <span>距離を保つ</span><span>決めつけ抑制</span><span>割り込み抑制</span>
                      {/if}
                    </div>
                  </div>
                </div>
                <div class="voice-detail-dsp">
                  <div class="voice-detail-head">
                    <b>VOICE DETAIL DSP</b>
                    <span>音そのものへ反映</span>
                  </div>
                  <label class="humanize-detail">
                    <span><b>HUMANIZE / 機械感補正</b><small>金属的な高域と加工の癖を自然側へ戻す</small></span>
                    <input type="range" min="0" max="100" step="1" bind:value={tunerHumanize} oninput={applyVoiceDetail} />
                    <strong>{tunerHumanize}</strong>
                  </label>
                  <div class="humanize-effects">
                    <span>PITCH保持 {humanizePitchRetention(currentTuning)}%</span>
                    <span>FORMANT保持 {humanizeFormantRetention(currentTuning)}%</span>
                    <span>TEXTURE保持 {humanizeTextureRetention(currentTuning)}%</span>
                    <span>{tunerHumanize >= 55 ? '高域スムージング ON' : '高域スムージング LIGHT'}</span>
                  </div>
                  <label>
                    <span><b>TEXTURE</b><small>軽いざらつき・声帯エッジ</small></span>
                    <input type="range" min="0" max="100" step="1" bind:value={tunerRoughness} oninput={applyVoiceDetail} />
                    <strong>{tunerRoughness}</strong>
                  </label>
                  <label>
                    <span><b>RHYTHM SWING</b><small>均一な話速を崩す</small></span>
                    <input type="range" min="0" max="100" step="1" bind:value={tunerRhythmSwing} oninput={applyVoiceDetail} />
                    <strong>{tunerRhythmSwing}</strong>
                  </label>
                  <label>
                    <span><b>ENDING DROP</b><small>文末だけ力を抜いて落とす</small></span>
                    <input type="range" min="0" max="100" step="1" bind:value={tunerEndingDrop} oninput={applyVoiceDetail} />
                    <strong>{tunerEndingDrop}</strong>
                  </label>
                </div>
                <div class="attitude-control">
                  <div class="attitude-head">
                    <span>CUTE</span>
                    <b>ATTITUDE {resolvedCharaLevel(currentTuning)}</b>
                    <span>CHARA</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    bind:value={tunerCharaLevel}
                    oninput={applyCharaAttitude}
                    aria-label="可愛いギャルとチャラいギャルのバランス"
                  />
                  <p>
                    {resolvedCharaLevel(currentTuning) >= 72
                      ? '低めの平均ピッチ・崩した子音・かったるい語頭・語尾スライド'
                      : resolvedCharaLevel(currentTuning) <= 35
                        ? '明るい語尾・比較的きれいな発音・親しみやすい笑顔感'
                        : '可愛さとストリート感を半々にした自然なギャル'}
                  </p>
                </div>
                {#if tunerEra === '90s'}
                  <div class="kogyaru-performance">
                    <div class="performance-head">
                      <div>
                        <b>90s KOGYARU PERFORMANCE</b>
                        <span>フレーズ内の演技シーケンス</span>
                      </div>
                      <strong>{resolvedKogyaruPerformance(currentTuning)}</strong>
                    </div>
                    <div class="performance-phases" aria-hidden="true">
                      <span><i>1</i><b>PICKUP</b><small>気だるく入る</small></span>
                      <span><i>2</i><b>HIT</b><small>加速して跳ねる</small></span>
                      <span><i>3</i><b>DROP</b><small>伸ばして落とす</small></span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      bind:value={tunerKogyaruPerformance}
                      oninput={applyKogyaruPerformance}
                      aria-label="90年代コギャル発話シーケンスの強さ"
                    />
                    <p>句読点を演技境界に使います。文章にない笑い声や余計な語尾は追加しません。</p>
                  </div>
                {/if}
              </div>
            </div>

            <p class="tuner-note">
              色からPITCH・TEMPOに加えてFORMANT・BRIGHT・BODY・PRESENCE・DYNAMICを実音響処理します。90s PERFORMANCEはCaption conditioningで発話内の演技差を作ります。NASALは8〜28（チョベリバのみ最大35）に制限します。
            </p>
          </section>

          <section
            class="persona-tuner"
            style={`--persona-color: ${personaMapColor}`}
            aria-label="ギャル人格演技マップ"
          >
            <div class="tuner-head">
              <div>
                <b>話し方・性格マップ</b>
                <span>声質を固定して発話演技だけを変える</span>
              </div>
              <span class:persona-applied={personaLinked} class="persona-state">
                {personaLinked ? personaLabel(currentPersonaTuning) : 'NEUTRAL'}
              </span>
            </div>

            <div class="persona-map-layout">
              <div class="persona-map-shell">
                <span class="persona-label persona-label-top">反応が大きい</span>
                <span class="persona-label persona-label-right">自由・突発的</span>
                <span class="persona-label persona-label-bottom">落ち着き</span>
                <span class="persona-label persona-label-left">計画的・制御</span>
                <div
                  class="persona-color-map"
                  style={`--persona-color: ${personaMapColor}`}
                  role="slider"
                  tabindex="0"
                  aria-label="優等生ギャルとおバカギャルの発話演技マップ"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={Math.round((personaMapX + 1) * 50)}
                  aria-valuetext={personaLabel(currentPersonaTuning)}
                  onpointerdown={startPersonaMapDrag}
                  onpointermove={movePersonaMapDrag}
                  onpointerup={stopPersonaMapDrag}
                  onpointercancel={stopPersonaMapDrag}
                  onkeydown={movePersonaMapWithKeyboard}
                >
                  <span class="persona-map-axis persona-map-axis-x"></span>
                  <span class="persona-map-axis persona-map-axis-y"></span>
                  <span
                    class="persona-map-pointer"
                    style={`left: ${(personaMapX + 1) * 50}%; top: ${(personaMapY + 1) * 50}%; --persona-color: ${personaMapColor}`}
                  ></span>
                </div>
              </div>

              <div class="persona-map-readout">
                <b>{personaLabel(currentPersonaTuning)}</b>
                <div>
                  <span>ARTICULATION {currentPersonaTuning.articulation}</span>
                  <span>RHYTHM {currentPersonaTuning.rhythmStability}</span>
                  <span>PAUSE PLAN {currentPersonaTuning.pausePlanning}</span>
                  <span>PROSODY CHAOS {currentPersonaTuning.prosodyChaos}</span>
                  <span>VOWEL {currentPersonaTuning.vowelStretch}</span>
                  <span>REACTION {currentPersonaTuning.reactionIntensity}</span>
                  <span>HESITATION {currentPersonaTuning.hesitation}</span>
                  <span>ENDING CTRL {currentPersonaTuning.endingControl}</span>
                </div>
              </div>
            </div>

            <button
              class="persona-ab-btn"
              onclick={generatePersonaAB}
              disabled={!canGenerate}
            >
              {isGenerating ? `GENERATING A/B... ${elapsedSec}s` : 'GENERATE SAME-SEED A/B'}
            </button>
            <p class="tuner-note">
              A/Bは同じセリフ・Seed・ピッチ・話速で、優等生演技とおバカ演技だけを順番に生成します。
            </p>
          </section>
        {/if}

        <section class="dialogue-generator" aria-label="AIセリフ生成">
          <div class="dialogue-generator-head">
            <div>
              <b>AI DIALOGUE WRITER</b>
              <span>表示文・発話文・演技指示を分離</span>
            </div>
            <div class="dialogue-writer-badges">
              <small>CHAT GYARU</small>
              {#if dialogueModel}
                <small>{dialogueModel}</small>
              {/if}
            </div>
          </div>
          <div class="dialogue-generator-controls">
            <textarea
              bind:value={dialogueInstruction}
              rows="2"
              maxlength="500"
              placeholder="任意：金沢弁で放課後の話／雨の日にかったるそう／新作コスメの話 など。空欄なら完全おまかせ"
            ></textarea>
            <button
              type="button"
              onclick={generateDialogue}
              disabled={isGeneratingDialogue || !selectedCharacter}
            >
              {isGeneratingDialogue ? 'WRITING...' : 'AIにセリフを考えてもらう'}
            </button>
          </div>
          <p>
            現在の{voiceAgeLabel(voiceAgeBand)}・{personaLinked ? personaLabel(currentPersonaTuning) : 'NEUTRAL GYARU'}・{tunerEra === '90s' ? '90s' : '現代'}を反映します。
            生成後のセリフは下欄で自由に修正できます。
          </p>
          {#if dialogueError}
            <div class="error-box">{dialogueError}</div>
          {/if}
          {#if dialogueDisplayText || dialoguePerformanceCue}
            <div class="dialogue-script-stack">
              <label>
                <span>DISPLAY TEXT <small>配信画面用・←ｗを残す</small></span>
                <textarea bind:value={dialogueDisplayText} rows="2" maxlength="240"></textarea>
              </label>
              <label>
                <span>PERFORMANCE CUE <small>VoiceDesignへ渡す演技指示</small></span>
                <textarea bind:value={dialoguePerformanceCue} rows="2" maxlength="300"></textarea>
              </label>
            </div>
          {/if}
        </section>

        <label>
          <span>TTS SPEECH TEXT <small>記号を除いた実際の読み上げ文</small></span>
          <textarea bind:value={sampleText} rows="3" placeholder="生成するセリフを入力"></textarea>
        </label>
        {#if mode === 'design'}
          <div class="hint-line">
            {voiceSeconds.trim() ? `${voiceSeconds.trim()}s MANUAL` : 'AUTO DURATION (caption-aware)'}
            / {countSpeechCharacters(sampleText)} chars — セリフの口調も声の演技に影響します
          </div>
        {/if}

        <label>
          <span>Candidate Name</span>
          <input bind:value={candidateName} placeholder="候補の名前 (例: リセア案A・低め)" />
        </label>

        <button class="generate-btn" onclick={generateVoice} disabled={!canGenerate}>
          {isGenerating ? `GENERATING... ${elapsedSec}s` : 'GENERATE VOICE'}
        </button>

        {#if generateError}
          <div class="error-box">{generateError}</div>
        {/if}
        {#if statusMessage}
          <div class="ok-box">{statusMessage}</div>
        {/if}

        <details class="advanced">
          <summary>ADVANCED SETTINGS</summary>
          <div class="advanced-body">
            <label>
              <span>Engine</span>
              <input
                readonly
                value={mode === 'design' ? 'Irodori VoiceDesign (Gradio)' : 'Voice Bridge (FastAPI :8791)'}
              />
            </label>

            <label>
              <span>Designer Model</span>
              <select bind:value={designerModel} onchange={saveDesignerModel} disabled={designerModels.length === 0}>
                {#each designerModels as model}
                  <option value={model.id}>{model.label}</option>
                {/each}
              </select>
            </label>
            {#if designerModels.find((model) => model.id === designerModel)?.note}
              <p class="hint-line">{designerModels.find((model) => model.id === designerModel)?.note}</p>
            {/if}

            <div class="field-grid">
              <label>
                <span>Backend</span>
                <select bind:value={voiceBackend}>
                  <option value="local">Local</option>
                  <option value="colab">Colab</option>
                </select>
              </label>
              <label class="span-2">
                <span>Endpoint</span>
                {#if voiceBackend === 'colab'}
                  <input bind:value={colabVoiceUrl} placeholder="https://xxxxx.trycloudflare.com" />
                {:else}
                  <input bind:value={localVoiceUrl} placeholder="http://127.0.0.1:7860" />
                {/if}
              </label>
            </div>
            <div class="actions">
              <button onclick={saveEndpointSettings}>SAVE ENDPOINT</button>
              {#if settingsMessage}
                <span>{settingsMessage}</span>
              {/if}
            </div>

            <div class="field-grid">
              <label>
                <span>Seed</span>
                <input bind:value={voiceSeed} inputmode="numeric" placeholder="blank = random" />
              </label>
              <label>
                <span>Seconds</span>
                <input bind:value={voiceSeconds} inputmode="decimal" placeholder="Auto" />
              </label>
              <label>
                <span>Steps</span>
                <input bind:value={voiceSteps} inputmode="numeric" placeholder="20" />
              </label>
              <label>
                <span>Caption Guidance</span>
                <input bind:value={voiceCaptionScale} inputmode="decimal" placeholder="4.0" />
              </label>
              <label>
                <span>Speed</span>
                <input bind:value={voiceSpeed} inputmode="decimal" placeholder="1.0" />
              </label>
            </div>
          </div>
        </details>
        {/if}
      </div>

      <!-- ============ RIGHT: CANDIDATES ============ -->
      <div class="panel candidates-panel">
        <div class="panel-header">
          <span>VOICE CANDIDATES</span>
          <div class="header-actions">
            <b>{candidates.length}</b>
            <button class="mini-btn" onclick={loadCandidates}>REFRESH</button>
          </div>
        </div>

        {#if candidatesError}
          <div class="error-box">{candidatesError}</div>
        {:else if candidates.length === 0}
          <div class="empty-box">NO CANDIDATES — 左のフォームから声を生成してください</div>
        {:else}
          {#if personaABResults.length === 2}
            <section class="persona-ab-result">
              <div class="persona-ab-head">
                <b>PERSONA A/B — SAME VOICE CONDITIONS</b>
                <span>SEED {personaABResults[0].seed ?? '-'}</span>
              </div>
              <div class="persona-ab-grid">
                {#each personaABResults as item}
                  <article class="persona-ab-card" data-kind={item.personaTuning?.kind ?? 'neutral'}>
                    <div>
                      <b>{item.personaTuning ? personaLabel(item.personaTuning) : candidateTitle(item)}</b>
                      <span>{item.personaTuning?.kind === 'honors' ? '優等生ギャル' : 'おバカギャル'}</span>
                    </div>
                    <audio src={`${item.audioUrl}?t=${item.createdAt}`} controls preload="metadata"></audio>
                    {#if item.personaTuning}
                      <div class="persona-ab-metrics">
                        <span>CLARITY {item.personaTuning.articulation}</span>
                        <span>RHYTHM {item.personaTuning.rhythmStability}</span>
                        <span>REACTION {item.personaTuning.reactionIntensity}</span>
                        <span>CHAOS {item.personaTuning.prosodyChaos}</span>
                      </div>
                    {/if}
                  </article>
                {/each}
              </div>
            </section>
          {/if}
          <div class="candidate-list">
            {#each candidates as item (item.id)}
              <div class="candidate-card">
                <div class="candidate-head">
                  <b>{candidateTitle(item)}</b>
                  <span class="mode-tag" data-mode={candidateMode(item)}>{candidateMode(item).toUpperCase()}</span>
                </div>
                <div class="candidate-meta">
                  <span>{formatDate(item.createdAt)}</span>
                  {#if item.personaTuning}
                    <span class="persona-meta" data-kind={item.personaTuning.kind}>{personaLabel(item.personaTuning)}</span>
                  {/if}
                  {#if item.voiceAgeBand}
                    <span class="voice-age-meta">{voiceAgeLabel(item.voiceAgeBand)}</span>
                  {/if}
                  {#if item.checkpoint && candidateMode(item) !== 'design'}
                    <span>{item.checkpoint}</span>
                  {/if}
                  {#if item.seconds}
                    <span>{item.seconds}s</span>
                  {:else if candidateMode(item) === 'design'}
                    <span>AUTO DURATION</span>
                  {/if}
                  {#if item.steps && candidateMode(item) === 'design'}
                    <span>{item.steps} steps</span>
                  {/if}
                  {#if item.cfgCaptionScale !== undefined && candidateMode(item) === 'design'}
                    <span>CAPTION CFG {item.cfgCaptionScale}</span>
                  {/if}
                  {#if item.pitchSemitones !== undefined}
                    <span>PITCH {item.pitchSemitones >= 0 ? '+' : ''}{item.pitchSemitones.toFixed(1)} st</span>
                  {/if}
                  {#if item.tempoRate !== undefined}
                    <span>TEMPO {item.tempoRate.toFixed(2)}×</span>
                  {/if}
                  {#if item.formantRatio !== undefined}
                    <span>FORMANT {item.formantRatio.toFixed(3)}×</span>
                  {/if}
                  {#if item.brightnessDb !== undefined}
                    <span>BRIGHT {item.brightnessDb >= 0 ? '+' : ''}{item.brightnessDb.toFixed(1)}dB</span>
                  {/if}
                  {#if item.humanizeAmount !== undefined}
                    <span>HUMANIZE {Math.round(item.humanizeAmount * 100)}</span>
                  {/if}
                </div>
                <audio src={`${item.audioUrl}?t=${item.createdAt}`} controls preload="none"></audio>
                <div class="candidate-actions">
                  <button
                    class="adopt-btn"
                    onclick={() => adoptCandidate(item)}
                    disabled={!selectedCharacter || busyCandidateId !== null}
                  >
                    {busyCandidateId === item.id ? 'APPLYING...' : `ADOPT → ${selectedCharacter?.name ?? '-'}`}
                  </button>
                  <button
                    class="details-btn"
                    onclick={() => toggleCandidateEditor(item)}
                    disabled={savingCandidateId !== null}
                  >
                    {editingCandidateId === item.id ? 'CLOSE' : 'DETAILS / EDIT'}
                  </button>
                  <button
                    class="delete-btn"
                    onclick={() => deleteCandidate(item)}
                    disabled={busyCandidateId !== null}
                  >
                    DELETE
                  </button>
                </div>
                {#if editingCandidateId === item.id}
                  <div class="candidate-editor">
                    <label>
                      <span>Candidate Name</span>
                      <input
                        bind:value={candidateMemoDraft}
                        maxlength="120"
                        placeholder={`${item.characterName} / ${candidateMode(item)}`}
                      />
                    </label>
                    <div class="candidate-editor-actions">
                      <button
                        class="save-name-btn"
                        onclick={() => saveCandidateName(item)}
                        disabled={savingCandidateId !== null}
                      >
                        {savingCandidateId === item.id ? 'SAVING...' : 'SAVE NAME'}
                      </button>
                    </div>
                    {#if candidateEditError}
                      <div class="error-box">{candidateEditError}</div>
                    {/if}
                    <label>
                      <span>Voice Caption / Prompt</span>
                      <textarea readonly rows="7" value={item.caption || '(none)'}></textarea>
                    </label>
                    <label>
                      <span>TTS Speech Text</span>
                      <textarea readonly rows="4" value={item.text}></textarea>
                    </label>
                    {#if item.displayText}
                      <label>
                        <span>Display Text</span>
                        <textarea readonly rows="3" value={item.displayText}></textarea>
                      </label>
                    {/if}
                    {#if item.performanceCue}
                      <label>
                        <span>Performance Cue</span>
                        <textarea readonly rows="3" value={item.performanceCue}></textarea>
                      </label>
                    {/if}
                    {#if item.personaTuning}
                      <div class="candidate-persona-detail" data-kind={item.personaTuning.kind}>
                        <b>{personaLabel(item.personaTuning)}</b>
                        <span>ARTICULATION {item.personaTuning.articulation}</span>
                        <span>RHYTHM {item.personaTuning.rhythmStability}</span>
                        <span>PAUSE {item.personaTuning.pausePlanning}</span>
                        <span>CHAOS {item.personaTuning.prosodyChaos}</span>
                        <span>VOWEL {item.personaTuning.vowelStretch}</span>
                        <span>REACTION {item.personaTuning.reactionIntensity}</span>
                        <span>HESITATION {item.personaTuning.hesitation}</span>
                        <span>ENDING {item.personaTuning.endingControl}</span>
                      </div>
                    {/if}
                    {#if item.voiceTuning}
                      <div class="candidate-tuning">
                        <div class="candidate-radar-wrap">
                          <svg class="tuner-radar candidate-radar" viewBox="0 0 160 160" role="img" aria-label="保存されたギャル声パラメータ">
                            {#each [25, 50, 75, 100] as level}
                              <polygon class="radar-grid" points={radarGrid(level, VOICE_IMPRESSION_AXES.length)}></polygon>
                            {/each}
                            {#each VOICE_IMPRESSION_AXES as axis, index}
                              <line class="radar-axis" x1="80" y1="80" x2={radarAxisEnd(index, VOICE_IMPRESSION_AXES.length).split(',')[0]} y2={radarAxisEnd(index, VOICE_IMPRESSION_AXES.length).split(',')[1]}></line>
                              <text
                                class="radar-label"
                                x={radarLabelPoint(index, VOICE_IMPRESSION_AXES.length).split(',')[0]}
                                y={radarLabelPoint(index, VOICE_IMPRESSION_AXES.length).split(',')[1]}
                              >{axis.label}</text>
                            {/each}
                            <polygon class="radar-value" points={radarPolygon(voiceImpressionValues(item.voiceTuning))}></polygon>
                          </svg>
                        </div>
                        <div class="candidate-tuning-values">
                          <div
                            class="candidate-palette-chip"
                            style={`--palette-color: ${tuningColor(item.voiceTuning)}; --palette-accent: ${tuningAccent(item.voiceTuning)}`}
                          >
                            <i></i>
                            <span>
                              <b>{paletteName(item.voiceTuning)}</b>
                              <small>{paletteDescription(item.voiceTuning)}</small>
                            </span>
                          </div>
                          <span class="candidate-color-tag">{item.voiceTuning.era === '90s' ? '90s チョベリバ' : '現代ギャル'}</span>
                          <span class="candidate-color-tag">TWANG {normalizeVoiceTuning(item.voiceTuning).forwardTwang}</span>
                          <span class="candidate-color-tag">NASAL {normalizeVoiceTuning(item.voiceTuning).nasality}</span>
                          <span class="candidate-color-tag">FORMANT {normalizeVoiceTuning(item.voiceTuning).formantShift}</span>
                          <span class="candidate-color-tag">BRIGHT {normalizeVoiceTuning(item.voiceTuning).brightness}</span>
                          <span class="candidate-color-tag">BODY {normalizeVoiceTuning(item.voiceTuning).body}</span>
                          <span class="candidate-color-tag">PRESENCE {normalizeVoiceTuning(item.voiceTuning).presence}</span>
                          <span class="candidate-color-tag">DYNAMIC {normalizeVoiceTuning(item.voiceTuning).dynamics}</span>
                          <span class="candidate-color-tag">TEXTURE {resolvedRoughness(normalizeVoiceTuning(item.voiceTuning))}</span>
                          <span class="candidate-color-tag">SWING {resolvedRhythmSwing(normalizeVoiceTuning(item.voiceTuning))}</span>
                          <span class="candidate-color-tag">ENDING {resolvedEndingDrop(normalizeVoiceTuning(item.voiceTuning))}</span>
                          <span class="candidate-color-tag">TENSION {resolvedTension(normalizeVoiceTuning(item.voiceTuning))}</span>
                          <span class="candidate-color-tag">TOO CLOSE {resolvedFamiliarity(normalizeVoiceTuning(item.voiceTuning))}</span>
                          <span class="candidate-color-tag">CHARA {resolvedCharaLevel(normalizeVoiceTuning(item.voiceTuning))}</span>
                          {#if normalizeVoiceTuning(item.voiceTuning).era === '90s'}
                            <span class="candidate-color-tag">90s PERF {resolvedKogyaruPerformance(normalizeVoiceTuning(item.voiceTuning))}</span>
                          {/if}
                          <span class="candidate-color-tag">ACOUSTIC MAP</span>
                        </div>
                      </div>
                    {/if}
                    <div class="candidate-detail-grid">
                      <span>VOICE AGE</span><b>{voiceAgeLabel(item.voiceAgeBand)}</b>
                      <span>SEED</span><b>{item.seed ?? 'random'}</b>
                      <span>CHECKPOINT</span><b>{item.checkpoint || '-'}</b>
                      <span>GENERATION</span><b>{Math.round(item.generationTimeMs / 1000)}s</b>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <!-- ============ BOTTOM: CURRENT VOICE ============ -->
    <section class="panel current-panel">
      <div class="panel-header">
        <span>CURRENT VOICE</span>
        <b>{selectedCharacter ? selectedCharacter.name : 'NO CHARACTER'}</b>
      </div>

      <div class="current-grid">
        <div class="current-info">
          <div class="current-line" class:unset={!currentVoice}>{describeVoice(currentVoice)}</div>
          {#if currentVoice?.caption}
            <p class="current-caption">{currentVoice.caption}</p>
          {/if}
        </div>

        <div class="current-actions">
          <label class="check-line">
            <input type="checkbox" bind:checked={autoSpeak} />
            <span>AUTO SPEAK</span>
          </label>
          <button class="apply-btn" onclick={applyFormToCharacter} disabled={!canApplyForm || busyCandidateId !== null}>
            APPLY TO CHARACTER
          </button>
        </div>
      </div>
    </section>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #030712 !important;
    color: #e2e8f0;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    min-height: 100%;
    height: auto !important;
    overflow-x: hidden;
    overflow-y: auto !important;
  }

  :global(html),
  :global(#app) {
    min-height: 100%;
    height: auto !important;
    overflow-y: auto !important;
  }

  :global(*, *::before, *::after) {
    box-sizing: border-box;
    letter-spacing: 0;
  }

  .voice-shell {
    position: relative;
    min-height: 100vh;
    overflow-x: hidden;
    background:
      radial-gradient(circle at 50% -12%, rgba(56, 189, 248, 0.18), transparent 38%),
      radial-gradient(circle at 92% 74%, rgba(168, 85, 247, 0.14), transparent 34%),
      linear-gradient(180deg, #020617 0%, #030712 55%, #050816 100%);
  }

  .grid-bg,
  .scanlines {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }

  .grid-bg {
    z-index: 0;
    background-image:
      linear-gradient(rgba(56, 189, 248, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(56, 189, 248, 0.045) 1px, transparent 1px),
      linear-gradient(rgba(168, 85, 247, 0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(168, 85, 247, 0.025) 1px, transparent 1px);
    background-size: 56px 56px, 56px 56px, 14px 14px, 14px 14px;
  }

  .scanlines {
    z-index: 3;
    opacity: 0.45;
    background: repeating-linear-gradient(0deg, rgba(255,255,255,0.018), rgba(255,255,255,0.018) 1px, transparent 1px, transparent 4px);
  }

  .voice-lab {
    position: relative;
    z-index: 2;
    width: min(1560px, calc(100vw - 48px));
    margin: 0 auto;
    padding: 26px 0 40px;
    display: grid;
    gap: 18px;
  }

  /* ---------- header ---------- */
  .lab-header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 18px;
    padding: 16px 22px;
    border: 1px solid rgba(56, 189, 248, 0.24);
    background: linear-gradient(120deg, rgba(8, 15, 32, 0.82), rgba(12, 12, 34, 0.76));
    box-shadow: 0 18px 48px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.06);
  }

  .back-link {
    color: #67e8f9;
    text-decoration: none;
    border: 1px solid rgba(56, 189, 248, 0.24);
    background: rgba(8, 18, 36, 0.58);
    padding: 9px 13px;
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
  }

  .title-block {
    display: flex;
    align-items: baseline;
    gap: 16px;
    min-width: 0;
  }

  .title-block h1 {
    margin: 0;
    font-family: 'Orbitron', sans-serif;
    font-size: 30px !important;
    line-height: 1;
    color: transparent;
    background: linear-gradient(90deg, #38bdf8, #818cf8 46%, #c084fc);
    -webkit-background-clip: text;
    background-clip: text;
    filter: drop-shadow(0 0 18px rgba(56,189,248,0.5));
  }

  .title-block p {
    margin: 0;
    color: rgba(148, 163, 184, 0.68);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: rgba(203, 213, 225, 0.66);
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    white-space: nowrap;
  }

  .status span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 12px #38bdf8;
  }

  .status span.offline {
    background: #f87171;
    box-shadow: 0 0 12px #f87171;
  }

  /* ---------- layout ---------- */
  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 11fr) minmax(0, 9fr);
    gap: 18px;
    align-items: start;
  }

  .panel {
    border: 1px solid rgba(56, 189, 248, 0.2);
    background: rgba(8, 15, 32, 0.72);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
    padding: 20px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    color: rgba(148, 163, 184, 0.7);
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    margin-bottom: 16px;
  }

  .panel-header b {
    color: #67e8f9;
  }

  .header-actions {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  /* ---------- create panel ---------- */
  .create-panel {
    display: grid;
    gap: 14px;
    align-content: start;
  }

  .mode-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }

  .mode-bar button {
    min-height: 46px;
    padding: 10px;
    border: 1px solid rgba(56, 189, 248, 0.24);
    background: rgba(56, 189, 248, 0.055);
    color: rgba(203, 213, 225, 0.72);
    font-family: 'Orbitron', sans-serif;
    font-size: 12px !important;
    cursor: pointer;
  }

  .mode-bar button.active {
    border-color: rgba(192, 132, 252, 0.58);
    background: rgba(168, 85, 247, 0.16);
    color: #e9d5ff;
    box-shadow: 0 0 20px rgba(168, 85, 247, 0.18);
  }

  .style-preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .voice-director {
    display: grid;
    gap: 10px;
    padding: 14px;
    border: 1px solid rgba(34, 211, 238, 0.32);
    background:
      radial-gradient(circle at 100% 0%, rgba(168, 85, 247, 0.15), transparent 40%),
      linear-gradient(135deg, rgba(8, 47, 73, 0.34), rgba(30, 27, 75, 0.38)),
      rgba(2, 6, 23, 0.74);
    box-shadow: inset 0 0 24px rgba(34, 211, 238, 0.04);
  }

  .voice-director-head,
  .voice-director-head > div {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .voice-director-head {
    justify-content: space-between;
  }

  .voice-director-head b {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 13px !important;
    letter-spacing: 0.08em;
  }

  .voice-director-head span,
  .voice-director > p {
    color: rgba(148, 163, 184, 0.75);
    font-size: 10px !important;
  }

  .voice-director-head small {
    padding: 3px 6px;
    border: 1px solid rgba(192, 132, 252, 0.35);
    color: #d8b4fe;
    font-family: 'Orbitron', sans-serif;
    font-size: 7px !important;
  }

  .voice-director-input {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 170px;
    gap: 10px;
  }

  .voice-director-input textarea {
    min-height: 72px;
    resize: vertical;
  }

  .voice-director-input button,
  .director-apply {
    border: 1px solid rgba(34, 211, 238, 0.42);
    background: linear-gradient(135deg, rgba(8, 47, 73, 0.72), rgba(88, 28, 135, 0.62));
    color: #cffafe;
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    cursor: pointer;
  }

  .voice-director-input button:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .voice-director > p {
    margin: -2px 0 0;
  }

  .voice-director-preview {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(192, 132, 252, 0.32);
    background: rgba(2, 6, 23, 0.56);
  }

  .director-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .director-summary > b {
    color: #e9d5ff;
    font-size: 13px !important;
  }

  .director-summary > div,
  .director-changes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .director-summary span {
    padding: 4px 7px;
    border: 1px solid rgba(34, 211, 238, 0.28);
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 7px !important;
  }

  .director-changes > span {
    display: grid;
    gap: 2px;
    min-width: 92px;
    padding: 6px 8px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.62);
  }

  .director-changes small {
    color: rgba(148, 163, 184, 0.72);
    font-size: 8px !important;
  }

  .director-changes b {
    color: #e2e8f0;
    font-family: 'Orbitron', sans-serif;
    font-size: 8px !important;
  }

  .director-changes .director-up b {
    color: #67e8f9;
  }

  .director-changes .director-down b {
    color: #f9a8d4;
  }

  .director-no-change {
    color: rgba(148, 163, 184, 0.72);
    font-size: 9px !important;
  }

  .director-cue {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    padding: 8px;
    border-left: 2px solid #c084fc;
    background: rgba(88, 28, 135, 0.13);
  }

  .director-cue small {
    color: #c4b5fd;
    font-family: 'Orbitron', sans-serif;
    font-size: 7px !important;
  }

  .director-cue span,
  .director-notes,
  .director-cautions {
    color: rgba(226, 232, 240, 0.78);
    font-size: 9px !important;
    line-height: 1.55;
  }

  .director-notes {
    margin: 0;
    padding-left: 18px;
  }

  .director-cautions {
    display: grid;
    gap: 3px;
    color: #fde68a;
  }

  .director-apply {
    min-height: 42px;
  }

  .voice-age-selector {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(56, 189, 248, 0.22);
    background:
      radial-gradient(circle at 15% 0%, rgba(34, 211, 238, 0.1), transparent 38%),
      rgba(2, 6, 23, 0.5);
  }

  .voice-age-heading {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .voice-age-heading b {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 12px !important;
    letter-spacing: 0.08em;
  }

  .voice-age-heading span {
    color: rgba(148, 163, 184, 0.76);
    font-size: 11px !important;
  }

  .voice-age-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .voice-age-options button {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 2px 8px;
    min-height: 68px;
    padding: 9px 10px;
    border: 1px solid rgba(56, 189, 248, 0.22);
    background: rgba(15, 23, 42, 0.72);
    color: rgba(203, 213, 225, 0.78);
    text-align: left;
    cursor: pointer;
  }

  .voice-age-options button > b {
    color: #e2e8f0;
    font-family: 'Orbitron', sans-serif;
    font-size: 16px !important;
  }

  .voice-age-options button > span {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .voice-age-options button > small {
    grid-column: 1 / -1;
    color: rgba(148, 163, 184, 0.76);
    font-size: 10px !important;
  }

  .voice-age-options button.active {
    border-color: rgba(192, 132, 252, 0.72);
    background: linear-gradient(135deg, rgba(34, 211, 238, 0.13), rgba(168, 85, 247, 0.18));
    box-shadow: inset 0 0 18px rgba(168, 85, 247, 0.1);
  }

  .style-preset-row button {
    padding: 6px 10px;
    border: 1px solid rgba(56, 189, 248, 0.22);
    background: rgba(56, 189, 248, 0.045);
    color: rgba(203, 213, 225, 0.74);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    cursor: pointer;
  }

  .dialogue-generator {
    display: grid;
    gap: 10px;
    padding: 14px;
    border: 1px solid rgba(34, 211, 238, 0.28);
    background:
      radial-gradient(circle at 0% 0%, rgba(34, 211, 238, 0.11), transparent 40%),
      linear-gradient(135deg, rgba(8, 47, 73, 0.25), rgba(46, 16, 101, 0.2));
  }

  .dialogue-generator-head,
  .dialogue-generator-head > div {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .dialogue-generator-head {
    justify-content: space-between;
  }

  .dialogue-generator-head b {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 12px !important;
    letter-spacing: 0.08em;
  }

  .dialogue-generator-head span,
  .dialogue-generator-head small,
  .dialogue-generator > p {
    color: rgba(148, 163, 184, 0.78);
    font-size: 10px !important;
  }

  .dialogue-generator-head small {
    font-family: 'Orbitron', sans-serif;
  }

  .dialogue-writer-badges {
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .dialogue-writer-badges small {
    padding: 3px 6px;
    border: 1px solid rgba(244, 114, 182, 0.32);
    color: #f9a8d4;
  }

  .dialogue-generator-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: stretch;
  }

  .dialogue-generator-controls textarea {
    min-height: 64px;
    resize: vertical;
  }

  .dialogue-generator-controls button {
    min-width: 190px;
    padding: 10px 14px;
    border: 1px solid rgba(103, 232, 249, 0.5);
    background: linear-gradient(135deg, rgba(8, 145, 178, 0.23), rgba(124, 58, 237, 0.24));
    color: #cffafe;
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    cursor: pointer;
  }

  .dialogue-generator-controls button:disabled {
    cursor: wait;
    opacity: 0.5;
  }

  .dialogue-generator > p {
    margin: 0;
    line-height: 1.6;
  }

  .dialogue-script-stack {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding-top: 2px;
  }

  .dialogue-script-stack label {
    padding: 9px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(2, 6, 23, 0.38);
  }

  .dialogue-script-stack label:first-child {
    border-color: rgba(244, 114, 182, 0.24);
  }

  .dialogue-script-stack label:last-child {
    border-color: rgba(34, 211, 238, 0.24);
  }

  .dialogue-script-stack label span {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .dialogue-script-stack label small,
  label > span small {
    color: rgba(148, 163, 184, 0.62);
    font-family: inherit;
    font-size: 8px !important;
  }

  .gyaru-tuner {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid rgba(192, 132, 252, 0.34);
    background:
      radial-gradient(circle at 18% 30%, rgba(56, 189, 248, 0.1), transparent 34%),
      linear-gradient(135deg, rgba(12, 19, 42, 0.92), rgba(31, 14, 52, 0.72));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
  }

  .tuner-head,
  .tuner-head > div {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tuner-head {
    justify-content: space-between;
  }

  .tuner-head b {
    color: #e9d5ff;
    font-family: 'Orbitron', sans-serif;
    font-size: 13px !important;
    letter-spacing: 0.08em;
  }

  .tuner-head div span {
    color: rgba(148, 163, 184, 0.74);
    font-size: 11px !important;
  }

  .tuner-state {
    padding: 3px 7px;
    border: 1px solid rgba(251, 191, 36, 0.34);
    color: #fde68a;
    font-family: 'Orbitron', sans-serif;
    font-size: 8px !important;
  }

  .tuner-state.tuner-applied {
    border-color: rgba(34, 211, 238, 0.42);
    color: #67e8f9;
  }

  .tuner-layout {
    display: grid;
    grid-template-columns: minmax(340px, 0.95fr) minmax(330px, 1.05fr);
    gap: 16px;
    align-items: center;
  }

  .radar-suite {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    min-width: 0;
  }

  .radar-card {
    display: grid;
    justify-items: center;
    min-width: 0;
    padding: 9px 7px 8px;
    border: 1px solid rgba(192, 132, 252, 0.2);
    background: rgba(2, 6, 23, 0.34);
  }

  .delivery-radar-card {
    border-color: rgba(34, 211, 238, 0.2);
  }

  .radar-title {
    display: flex;
    width: 100%;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    font-family: 'Orbitron', sans-serif;
  }

  .radar-title b {
    color: #e9d5ff;
    font-size: 8px !important;
  }

  .radar-title span {
    color: rgba(203, 213, 225, 0.54);
    font-size: 7px !important;
  }

  .tuner-radar {
    display: block;
    width: 100%;
    max-width: 180px;
    overflow: visible;
  }

  .radar-grid,
  .radar-axis {
    fill: rgba(56, 189, 248, 0.025);
    stroke: rgba(125, 211, 252, 0.2);
    stroke-width: 0.8;
  }

  .radar-axis {
    fill: none;
  }

  .radar-value {
    fill: rgba(192, 132, 252, 0.22);
    stroke: #c084fc;
    stroke-width: 1.7;
    filter: drop-shadow(0 0 4px rgba(192, 132, 252, 0.55));
  }

  .radar-dot {
    fill: #67e8f9;
    stroke: rgba(8, 15, 32, 0.9);
    stroke-width: 1;
  }

  .delivery-radar-value {
    fill: rgba(34, 211, 238, 0.18);
    stroke: #22d3ee;
    filter: drop-shadow(0 0 4px rgba(34, 211, 238, 0.5));
  }

  .delivery-radar-dot {
    fill: #f0abfc;
  }

  .radar-label {
    fill: rgba(203, 213, 225, 0.78);
    font-family: 'Orbitron', sans-serif;
    font-size: 6.5px !important;
    text-anchor: middle;
    dominant-baseline: middle;
  }

  .radar-metrics {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px;
  }

  .radar-metrics span {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    padding: 3px 4px;
    border: 1px solid rgba(148, 163, 184, 0.1);
    color: rgba(203, 213, 225, 0.54);
    font-family: 'Orbitron', sans-serif;
    font-size: 5.5px !important;
  }

  .radar-metrics b {
    color: #67e8f9;
    font-size: 6px !important;
  }

  .radar-caption {
    grid-column: 1 / -1;
    margin-top: -2px;
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 8px !important;
    text-align: center;
  }

  .voice-color-map-panel {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .voice-color-wheel-shell {
    position: relative;
    width: min(100%, 330px);
    margin: 12px auto;
    padding: 24px;
  }

  .voice-color-wheel {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    background:
      radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0.92) 6%, rgba(255,255,255,0.48) 34%, transparent 70%),
      conic-gradient(
        from -30deg,
        #ffef37,
        #73e52e,
        #00d89c,
        #00bddd,
        #2473ef,
        #5635dd,
        #a620cf,
        #ef168f,
        #ff3434,
        #ff9f1c,
        #ffef37
      );
    border: 1px solid rgba(255,255,255,0.48);
    box-shadow:
      0 18px 38px rgba(0,0,0,0.34),
      0 0 28px color-mix(in srgb, var(--mapped-color, #c084fc) 18%, transparent);
    cursor: pointer;
    touch-action: none;
    outline: none;
  }

  .voice-color-wheel:focus-visible {
    box-shadow: 0 0 0 3px rgba(103, 232, 249, 0.42), 0 18px 38px rgba(0,0,0,0.34);
  }

  .map-crosshair {
    position: absolute;
    display: block;
    pointer-events: none;
    background: rgba(255,255,255,0.22);
  }

  .map-crosshair-x {
    left: 8%;
    right: 8%;
    top: 50%;
    height: 1px;
  }

  .map-crosshair-y {
    top: 8%;
    bottom: 8%;
    left: 50%;
    width: 1px;
  }

  .color-map-pointer {
    position: absolute;
    z-index: 3;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 3px solid #ffffff;
    border-radius: 50%;
    background: var(--mapped-color);
    box-shadow: 0 0 0 2px rgba(2, 6, 23, 0.82), 0 0 18px rgba(255,255,255,0.72);
    transform: translate(-50%, -50%);
    cursor: pointer;
    pointer-events: auto;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }

  .color-map-pointer > span {
    display: block;
    width: 0;
    height: 0;
    margin-left: 2px;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    border-left: 8px solid rgba(2, 6, 23, 0.86);
    filter: drop-shadow(0 0 2px rgba(255,255,255,0.4));
  }

  .color-map-pointer:hover:not(:disabled),
  .color-map-pointer:focus-visible {
    transform: translate(-50%, -50%) scale(1.14);
    box-shadow: 0 0 0 3px rgba(2, 6, 23, 0.86), 0 0 24px rgba(255,255,255,0.92);
    outline: none;
  }

  .color-map-pointer:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .color-map-location {
    display: grid;
    gap: 8px;
    padding: 11px 12px;
    border: 1px solid color-mix(in srgb, var(--location-color) 52%, rgba(103, 232, 249, 0.2));
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--location-color) 10%, transparent), transparent 58%),
      rgba(2, 6, 23, 0.52);
  }

  .location-name {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }

  .location-name small {
    color: rgba(148, 163, 184, 0.72);
    font-family: 'Orbitron', sans-serif;
    font-size: 7px !important;
    letter-spacing: 0.08em;
  }

  .location-name b {
    color: var(--location-color);
    font-family: 'Orbitron', sans-serif;
    font-size: 13px !important;
    text-shadow: 0 0 12px color-mix(in srgb, var(--location-color) 68%, transparent);
  }

  .location-name span {
    color: rgba(226, 232, 240, 0.72);
    font-size: 9px !important;
  }

  .location-details {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .location-details span {
    padding: 4px 6px;
    border: 1px solid rgba(103, 232, 249, 0.16);
    color: rgba(207, 250, 254, 0.78);
    font-size: 8px !important;
  }

  .color-map-location p {
    margin: 0;
    color: rgba(148, 163, 184, 0.72);
    font-size: 8px !important;
    line-height: 1.5;
  }

  .map-label {
    position: absolute;
    color: rgba(203, 213, 225, 0.8);
    font-family: 'Orbitron', sans-serif;
    font-size: 7px !important;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }

  .map-label-top {
    top: 0;
    left: 50%;
    transform: translateX(-50%);
  }

  .map-label-right {
    right: -10px;
    top: 50%;
    transform: translateY(-50%);
  }

  .map-label-bottom {
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
  }

  .map-label-left {
    left: -5px;
    top: 50%;
    transform: translateY(-50%);
  }

  .mapped-primary,
  .mapped-secondary {
    display: grid;
    gap: 8px;
  }

  .mapped-primary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mapped-primary span {
    display: flex;
    justify-content: space-between;
    padding: 9px 11px;
    border: 1px solid rgba(56, 189, 248, 0.22);
    background: rgba(2, 6, 23, 0.52);
    color: rgba(203, 213, 225, 0.68);
    font-family: 'Orbitron', sans-serif;
    font-size: 8px !important;
  }

  .mapped-primary b {
    color: #67e8f9;
    font-size: 12px !important;
  }

  .mapped-secondary {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .mapped-secondary span {
    padding: 5px 6px;
    border: 1px solid rgba(192, 132, 252, 0.18);
    color: rgba(203, 213, 225, 0.66);
    font-family: 'Orbitron', sans-serif;
    font-size: 6px !important;
    text-align: center;
  }

  .tension-control,
  .familiarity-control {
    display: grid;
    gap: 7px;
    padding: 11px 12px;
    border: 1px solid rgba(244, 63, 141, 0.42);
    background:
      linear-gradient(90deg, rgba(30, 41, 59, 0.55), rgba(244, 63, 141, 0.16)),
      rgba(2, 6, 23, 0.52);
    box-shadow: inset 0 0 22px rgba(244, 63, 141, 0.05);
  }

  .familiarity-control {
    border-color: rgba(251, 191, 36, 0.36);
    background:
      linear-gradient(90deg, rgba(30, 41, 59, 0.55), rgba(251, 191, 36, 0.12)),
      rgba(2, 6, 23, 0.52);
    box-shadow: inset 0 0 22px rgba(251, 191, 36, 0.04);
  }

  .tension-head,
  .familiarity-head {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    color: rgba(203, 213, 225, 0.56);
    font-family: 'Orbitron', sans-serif;
    font-size: 7px !important;
  }

  .tension-head b,
  .familiarity-head b {
    color: #fb7185;
    font-size: 10px !important;
    text-align: center;
    text-shadow: 0 0 10px rgba(244, 63, 141, 0.6);
  }

  .familiarity-head b {
    color: #fbbf24;
    text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
  }

  .tension-head span:last-child,
  .familiarity-head span:last-child {
    color: #f9a8d4;
    text-align: right;
  }

  .familiarity-head span:last-child {
    color: #fde68a;
  }

  .tension-control input[type='range'],
  .familiarity-control input[type='range'] {
    width: 100%;
    accent-color: #f43f8d;
  }

  .familiarity-control input[type='range'] {
    accent-color: #fbbf24;
  }

  .tension-control p,
  .familiarity-control p {
    margin: 0;
    color: rgba(251, 207, 232, 0.68);
    font-size: 9px !important;
    line-height: 1.5;
  }

  .familiarity-control p {
    color: rgba(254, 243, 199, 0.68);
  }

  .macro-effects {
    display: grid;
    gap: 6px;
    padding-top: 2px;
  }

  .macro-effect-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
  }

  .macro-effect-row > b {
    flex: 0 0 92px;
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 6px !important;
    letter-spacing: 0.06em;
  }

  .macro-effect-row > span {
    padding: 3px 5px;
    border: 1px solid rgba(34, 211, 238, 0.16);
    background: rgba(2, 6, 23, 0.42);
    color: rgba(203, 213, 225, 0.66);
    font-family: 'Orbitron', sans-serif;
    font-size: 5.5px !important;
  }

  .macro-effect-row strong {
    color: #67e8f9;
    font-size: 6px !important;
  }

  .dialogue-effect-row > b {
    color: #f9a8d4;
  }

  .dialogue-effect-row > span {
    border-color: rgba(244, 114, 182, 0.18);
    color: rgba(251, 207, 232, 0.76);
    font-family: inherit;
    font-size: 8px !important;
  }

  .voice-detail-dsp {
    display: grid;
    gap: 7px;
    padding: 10px 12px;
    border: 1px solid rgba(34, 211, 238, 0.24);
    background: rgba(2, 6, 23, 0.5);
  }

  .voice-detail-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-family: 'Orbitron', sans-serif;
  }

  .voice-detail-head b {
    color: #67e8f9;
    font-size: 9px !important;
  }

  .voice-detail-head span {
    color: rgba(203, 213, 225, 0.52);
    font-size: 7px !important;
  }

  .voice-detail-dsp label {
    display: grid;
    grid-template-columns: minmax(126px, 0.8fr) minmax(130px, 1.2fr) 28px;
    align-items: center;
    gap: 9px;
  }

  .voice-detail-dsp label > span {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .voice-detail-dsp label b,
  .voice-detail-dsp label strong {
    color: #e9d5ff;
    font-family: 'Orbitron', sans-serif;
    font-size: 7px !important;
  }

  .voice-detail-dsp label small {
    color: rgba(203, 213, 225, 0.48);
    font-size: 8px !important;
  }

  .voice-detail-dsp label strong {
    color: #67e8f9;
    text-align: right;
  }

  .voice-detail-dsp input[type='range'] {
    width: 100%;
    accent-color: #22d3ee;
  }

  .voice-detail-dsp .humanize-detail {
    padding: 8px;
    border: 1px solid rgba(52, 211, 153, 0.32);
    background: linear-gradient(90deg, rgba(6, 78, 59, 0.24), rgba(8, 47, 73, 0.18));
  }

  .voice-detail-dsp .humanize-detail b,
  .voice-detail-dsp .humanize-detail strong {
    color: #6ee7b7;
  }

  .voice-detail-dsp .humanize-detail input[type='range'] {
    accent-color: #34d399;
  }

  .humanize-effects {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 0 2px 3px;
  }

  .humanize-effects span {
    padding: 3px 5px;
    border: 1px solid rgba(52, 211, 153, 0.18);
    color: rgba(167, 243, 208, 0.74);
    font-family: 'Orbitron', sans-serif;
    font-size: 6px !important;
  }

  .attitude-control {
    display: grid;
    gap: 7px;
    padding: 10px 12px;
    border: 1px solid rgba(244, 114, 182, 0.32);
    background:
      linear-gradient(90deg, rgba(125, 211, 252, 0.09), rgba(244, 114, 182, 0.12)),
      rgba(2, 6, 23, 0.58);
  }

  .attitude-head {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    color: rgba(203, 213, 225, 0.62);
    font-family: 'Orbitron', sans-serif;
    font-size: 7px !important;
  }

  .attitude-head b {
    color: #f0abfc;
    font-size: 9px !important;
    text-align: center;
  }

  .attitude-head span:last-child {
    text-align: right;
  }

  .attitude-control input[type='range'] {
    width: 100%;
    height: 5px;
    margin: 0;
    accent-color: #f472b6;
    cursor: pointer;
  }

  .attitude-control p {
    margin: 0;
    color: rgba(203, 213, 225, 0.72);
    font-size: 9px !important;
    text-align: center;
  }

  .kogyaru-performance {
    display: grid;
    gap: 9px;
    padding: 11px 12px;
    border: 1px solid rgba(251, 191, 36, 0.36);
    background:
      linear-gradient(135deg, rgba(244, 63, 141, 0.1), rgba(251, 191, 36, 0.08)),
      rgba(2, 6, 23, 0.62);
  }

  .performance-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .performance-head > div {
    display: grid;
    gap: 2px;
  }

  .performance-head b,
  .performance-head strong {
    color: #fde68a;
    font-family: 'Orbitron', sans-serif;
    font-size: 9px !important;
  }

  .performance-head span,
  .kogyaru-performance > p {
    color: rgba(203, 213, 225, 0.64);
    font-size: 8px !important;
  }

  .performance-head strong {
    font-size: 15px !important;
  }

  .performance-phases {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .performance-phases span {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1px 5px;
    align-items: center;
    padding: 7px;
    border: 1px solid rgba(251, 191, 36, 0.2);
    background: rgba(15, 23, 42, 0.52);
  }

  .performance-phases i {
    grid-row: 1 / 3;
    color: #f472b6;
    font-family: 'Orbitron', sans-serif;
    font-size: 14px !important;
    font-style: normal;
  }

  .performance-phases b {
    color: #fef3c7;
    font-family: 'Orbitron', sans-serif;
    font-size: 7px !important;
  }

  .performance-phases small {
    color: rgba(203, 213, 225, 0.58);
    font-size: 7px !important;
  }

  .kogyaru-performance input[type='range'] {
    width: 100%;
    height: 5px;
    margin: 0;
    accent-color: #fbbf24;
    cursor: pointer;
  }

  .kogyaru-performance > p {
    margin: 0;
    text-align: center;
  }

  .tuner-note {
    margin: -5px 0 0;
    color: rgba(148, 163, 184, 0.68);
    font-size: 11px !important;
  }

  .persona-tuner {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid rgba(34, 211, 238, 0.28);
    background:
      radial-gradient(circle at 18% 28%, rgba(34, 211, 238, 0.1), transparent 34%),
      radial-gradient(circle at 82% 72%, rgba(244, 114, 182, 0.1), transparent 34%),
      rgba(8, 15, 32, 0.78);
  }

  .persona-state {
    padding: 3px 7px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    color: rgba(203, 213, 225, 0.72);
    font-family: 'Orbitron', sans-serif;
    font-size: 7px !important;
  }

  .persona-state.persona-applied {
    border-color: color-mix(in srgb, var(--persona-color, #c084fc) 45%, transparent);
    color: #e9d5ff;
  }

  .persona-map-layout {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(210px, 0.72fr);
    gap: 20px;
    align-items: center;
  }

  .persona-map-shell {
    position: relative;
    width: min(100%, 350px);
    margin: 10px auto;
    padding: 24px 42px;
  }

  .persona-color-map {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    background:
      radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0.94) 8%, rgba(255,255,255,0.32) 42%, transparent 72%),
      linear-gradient(to bottom, rgba(250, 204, 21, 0.3), transparent 48%, rgba(99, 102, 241, 0.26)),
      linear-gradient(90deg, #06b6d4 0%, #e2e8f0 50%, #f43f8d 100%);
    border: 1px solid rgba(255,255,255,0.4);
    box-shadow: 0 16px 34px rgba(0,0,0,0.3), 0 0 24px color-mix(in srgb, var(--persona-color) 18%, transparent);
    cursor: pointer;
    touch-action: none;
    outline: none;
  }

  .persona-color-map:focus-visible {
    box-shadow: 0 0 0 3px rgba(103, 232, 249, 0.42), 0 16px 34px rgba(0,0,0,0.3);
  }

  .persona-map-axis {
    position: absolute;
    display: block;
    background: rgba(255,255,255,0.24);
    pointer-events: none;
  }

  .persona-map-axis-x {
    left: 7%;
    right: 7%;
    top: 50%;
    height: 1px;
  }

  .persona-map-axis-y {
    top: 7%;
    bottom: 7%;
    left: 50%;
    width: 1px;
  }

  .persona-map-pointer {
    position: absolute;
    width: 21px;
    height: 21px;
    border: 3px solid #ffffff;
    border-radius: 50%;
    background: var(--persona-color);
    box-shadow: 0 0 0 2px rgba(2, 6, 23, 0.85), 0 0 18px rgba(255,255,255,0.75);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .persona-label {
    position: absolute;
    color: rgba(203, 213, 225, 0.78);
    font-family: 'Orbitron', sans-serif;
    font-size: 7px !important;
    white-space: nowrap;
  }

  .persona-label-top {
    top: 0;
    left: 50%;
    transform: translateX(-50%);
  }

  .persona-label-right {
    right: -10px;
    top: 50%;
    transform: translateY(-50%);
    color: #f9a8d4;
  }

  .persona-label-bottom {
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
  }

  .persona-label-left {
    left: -4px;
    top: 50%;
    transform: translateY(-50%);
    color: #67e8f9;
  }

  .persona-map-readout {
    display: grid;
    gap: 10px;
  }

  .persona-map-readout > b {
    color: color-mix(in srgb, var(--persona-color, #c084fc) 65%, #ffffff);
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
  }

  .persona-map-readout > div {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  .persona-map-readout span {
    padding: 6px 7px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(2, 6, 23, 0.48);
    color: rgba(203, 213, 225, 0.7);
    font-family: 'Orbitron', sans-serif;
    font-size: 6px !important;
  }

  .persona-ab-btn {
    min-height: 44px;
    border: 1px solid rgba(103, 232, 249, 0.42);
    background: linear-gradient(90deg, rgba(6, 182, 212, 0.16), rgba(255,255,255,0.04) 50%, rgba(244, 63, 141, 0.16));
    color: #f1f5f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    font-weight: 700;
    cursor: pointer;
  }

  .persona-ab-btn:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  label {
    display: grid;
    gap: 6px;
    color: #94a3b8;
    font-size: 14px !important;
  }

  label span {
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    color: rgba(203, 213, 225, 0.64);
  }

  input,
  select,
  textarea {
    width: 100%;
    border: 1px solid rgba(56, 189, 248, 0.18);
    background: rgba(2, 6, 23, 0.68);
    color: #cbd5e1;
    padding: 11px 13px;
    font: inherit;
    min-height: 42px;
  }

  select {
    appearance: none;
  }

  input[readonly] {
    color: rgba(203, 213, 225, 0.66);
  }

  textarea {
    resize: vertical;
    min-height: 72px;
  }

  .hint-line {
    color: rgba(148, 163, 184, 0.74);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .generate-btn {
    min-height: 58px;
    border: 1px solid rgba(192, 132, 252, 0.55);
    background: linear-gradient(120deg, rgba(56, 189, 248, 0.14), rgba(168, 85, 247, 0.2));
    color: #e9d5ff;
    font-family: 'Orbitron', sans-serif;
    font-size: 16px !important;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 0 26px rgba(168, 85, 247, 0.2);
  }

  .generate-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    box-shadow: none;
  }

  .advanced {
    border: 1px solid rgba(56, 189, 248, 0.14);
    background: rgba(2, 6, 23, 0.4);
  }

  .advanced summary {
    padding: 12px 14px;
    color: rgba(148, 163, 184, 0.8);
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    cursor: pointer;
    user-select: none;
  }

  .advanced-body {
    display: grid;
    gap: 12px;
    padding: 4px 14px 16px;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .field-grid .span-2 {
    grid-column: span 3;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .actions button,
  .mini-btn {
    border: 1px solid rgba(168, 85, 247, 0.36);
    background: rgba(168, 85, 247, 0.08);
    color: #c084fc;
    font-family: 'Orbitron', sans-serif;
    padding: 9px 14px;
    font-size: 11px !important;
    cursor: pointer;
  }

  .actions span {
    color: rgba(148, 163, 184, 0.74);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .mini-btn {
    padding: 7px 10px;
    font-size: 10px !important;
  }

  /* ---------- candidates ---------- */
  .candidates-panel {
    display: grid;
    align-content: start;
    gap: 12px;
  }

  .persona-ab-result {
    display: grid;
    gap: 10px;
    margin-bottom: 14px;
    padding: 12px;
    border: 1px solid rgba(192, 132, 252, 0.3);
    background: linear-gradient(110deg, rgba(6, 182, 212, 0.08), rgba(244, 63, 141, 0.08));
  }

  .persona-ab-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-family: 'Orbitron', sans-serif;
  }

  .persona-ab-head b {
    color: #e9d5ff;
    font-size: 9px !important;
  }

  .persona-ab-head span {
    color: rgba(148, 163, 184, 0.72);
    font-size: 8px !important;
  }

  .persona-ab-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .persona-ab-card {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(2, 6, 23, 0.58);
  }

  .persona-ab-card[data-kind='honors'] {
    border-color: rgba(34, 211, 238, 0.4);
  }

  .persona-ab-card[data-kind='spontaneous'] {
    border-color: rgba(244, 114, 182, 0.4);
  }

  .persona-ab-card > div:first-child {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
  }

  .persona-ab-card b {
    color: #e2e8f0;
    font-family: 'Orbitron', sans-serif;
    font-size: 8px !important;
  }

  .persona-ab-card > div:first-child span {
    color: rgba(203, 213, 225, 0.7);
    font-size: 10px !important;
  }

  .persona-ab-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
  }

  .persona-ab-metrics span {
    color: rgba(148, 163, 184, 0.72);
    font-family: 'Orbitron', sans-serif;
    font-size: 6px !important;
  }

  .candidate-list {
    display: grid;
    gap: 12px;
    max-height: 720px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .candidate-card {
    display: grid;
    gap: 9px;
    border: 1px solid rgba(56, 189, 248, 0.18);
    background: rgba(2, 6, 23, 0.5);
    padding: 12px;
  }

  .candidate-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .candidate-head b {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 13px !important;
    overflow-wrap: anywhere;
  }

  .mode-tag {
    flex-shrink: 0;
    padding: 3px 8px;
    font-family: 'Orbitron', sans-serif;
    font-size: 9px !important;
    color: #e9d5ff;
    border: 1px solid rgba(192, 132, 252, 0.4);
    background: rgba(168, 85, 247, 0.12);
  }

  .mode-tag[data-mode='clone'] {
    color: #a5f3fc;
    border-color: rgba(56, 189, 248, 0.4);
    background: rgba(56, 189, 248, 0.1);
  }

  .mode-tag[data-mode='lora'] {
    color: #bbf7d0;
    border-color: rgba(74, 222, 128, 0.4);
    background: rgba(74, 222, 128, 0.1);
  }

  .candidate-meta {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    color: rgba(148, 163, 184, 0.72);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .voice-age-meta {
    color: #67e8f9;
    border: 1px solid rgba(34, 211, 238, 0.34);
    padding: 1px 6px;
  }

  .persona-meta {
    padding: 2px 5px;
    border: 1px solid rgba(148, 163, 184, 0.22);
  }

  .persona-meta[data-kind='honors'] {
    color: #67e8f9;
    border-color: rgba(34, 211, 238, 0.36);
  }

  .persona-meta[data-kind='spontaneous'] {
    color: #f9a8d4;
    border-color: rgba(244, 114, 182, 0.36);
  }

  audio {
    width: 100%;
    height: 38px;
  }

  .candidate-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 10px;
  }

  .adopt-btn {
    min-height: 42px;
    border: 1px solid rgba(56, 189, 248, 0.45);
    background: rgba(56, 189, 248, 0.12);
    color: #a5f3fc;
    font-family: 'Orbitron', sans-serif;
    font-size: 12px !important;
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .adopt-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .delete-btn {
    min-height: 42px;
    padding: 0 14px;
    border: 1px solid rgba(248, 113, 113, 0.32);
    background: rgba(127, 29, 29, 0.14);
    color: #fca5a5;
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    cursor: pointer;
  }

  .delete-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .details-btn,
  .save-name-btn {
    min-height: 42px;
    padding: 0 14px;
    border: 1px solid rgba(192, 132, 252, 0.42);
    background: rgba(168, 85, 247, 0.1);
    color: #e9d5ff;
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    cursor: pointer;
  }

  .details-btn:disabled,
  .save-name-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .candidate-editor {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid rgba(192, 132, 252, 0.25);
    background: rgba(15, 23, 42, 0.68);
  }

  .candidate-editor label {
    gap: 6px;
  }

  .candidate-editor textarea[readonly] {
    color: rgba(226, 232, 240, 0.88);
    background: rgba(2, 6, 23, 0.74);
    resize: vertical;
  }

  .candidate-editor-actions {
    display: flex;
    justify-content: flex-end;
  }

  .candidate-tuning {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr);
    gap: 14px;
    align-items: center;
    padding: 10px 12px;
    border: 1px solid rgba(192, 132, 252, 0.22);
    background: rgba(76, 29, 149, 0.08);
  }

  .candidate-persona-detail {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 7px;
    padding: 10px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(2, 6, 23, 0.5);
  }

  .candidate-persona-detail > b {
    grid-column: 1 / -1;
    color: #e9d5ff;
    font-family: 'Orbitron', sans-serif;
    font-size: 9px !important;
  }

  .candidate-persona-detail[data-kind='honors'] {
    border-color: rgba(34, 211, 238, 0.3);
  }

  .candidate-persona-detail[data-kind='spontaneous'] {
    border-color: rgba(244, 114, 182, 0.3);
  }

  .candidate-persona-detail span {
    color: rgba(203, 213, 225, 0.7);
    font-family: 'Orbitron', sans-serif;
    font-size: 6px !important;
  }

  .candidate-radar-wrap {
    display: grid;
    place-items: center;
  }

  .candidate-radar {
    max-width: 155px;
  }

  .candidate-tuning-values {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 10px;
    font-family: 'Orbitron', sans-serif;
  }

  .candidate-palette-chip {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 9px;
    border: 1px solid color-mix(in srgb, var(--palette-color) 45%, transparent);
    background: linear-gradient(90deg, color-mix(in srgb, var(--palette-color) 13%, transparent), transparent);
  }

  .candidate-palette-chip > i {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--palette-color), var(--palette-accent));
    box-shadow: 0 0 16px color-mix(in srgb, var(--palette-color) 48%, transparent);
  }

  .candidate-palette-chip > span {
    display: grid;
    gap: 3px;
  }

  .candidate-palette-chip b {
    color: color-mix(in srgb, var(--palette-color) 75%, #ffffff);
    font-size: 9px !important;
  }

  .candidate-palette-chip small {
    color: rgba(203, 213, 225, 0.68);
    font-size: 8px !important;
  }

  .candidate-color-tag {
    padding: 5px 7px;
    border: 1px solid rgba(56, 189, 248, 0.18);
    color: rgba(203, 213, 225, 0.75);
    font-size: 8px !important;
    text-align: center;
  }

  .save-name-btn {
    min-height: 36px;
  }

  .candidate-detail-grid {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 6px 12px;
    padding-top: 4px;
    font-family: 'Orbitron', sans-serif;
    font-size: 9px !important;
  }

  .candidate-detail-grid span {
    color: rgba(148, 163, 184, 0.7);
  }

  .candidate-detail-grid b {
    color: rgba(203, 213, 225, 0.86);
    overflow-wrap: anywhere;
  }

  /* ---------- current voice ---------- */
  .current-panel {
    display: grid;
    gap: 8px;
  }

  .current-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px;
    align-items: center;
  }

  .current-info {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .current-line {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 15px !important;
    overflow-wrap: anywhere;
  }

  .current-line.unset {
    color: rgba(148, 163, 184, 0.6);
  }

  .current-caption {
    margin: 0;
    color: rgba(203, 213, 225, 0.72);
    font-size: 13px !important;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .current-actions {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .check-line {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }

  .check-line input {
    width: 18px;
    height: 18px;
    min-height: 0;
    accent-color: #38bdf8;
  }

  .apply-btn {
    min-height: 52px;
    padding: 0 26px;
    border: 1px solid rgba(192, 132, 252, 0.55);
    background: linear-gradient(120deg, rgba(56, 189, 248, 0.14), rgba(168, 85, 247, 0.2));
    color: #e9d5ff;
    font-family: 'Orbitron', sans-serif;
    font-size: 14px !important;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .apply-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  /* ---------- boxes ---------- */
  .error-box {
    border: 1px solid rgba(248, 113, 113, 0.28);
    background: rgba(127, 29, 29, 0.16);
    color: #fecaca;
    padding: 12px;
    font-size: 13px !important;
    white-space: pre-wrap;
  }

  .warn-box {
    border: 1px solid rgba(250, 204, 21, 0.28);
    background: rgba(113, 63, 18, 0.18);
    color: #fde68a;
    padding: 12px;
    font-size: 13px !important;
  }

  .ok-box {
    border: 1px solid rgba(56, 189, 248, 0.24);
    background: rgba(56, 189, 248, 0.07);
    color: #a5f3fc;
    padding: 12px;
    font-size: 13px !important;
  }

  .empty-box {
    border: 1px solid rgba(56, 189, 248, 0.14);
    background: rgba(2, 6, 23, 0.42);
    color: rgba(148, 163, 184, 0.76);
    padding: 16px;
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
  }

  @media (max-width: 980px) {
    .workspace {
      grid-template-columns: 1fr;
    }

    .lab-header {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .field-grid {
      grid-template-columns: 1fr 1fr;
    }

    .field-grid .span-2 {
      grid-column: span 1;
    }

    .current-grid {
      grid-template-columns: 1fr;
    }

    .tuner-layout,
    .candidate-tuning,
    .persona-map-layout {
      grid-template-columns: 1fr;
    }

    .persona-ab-grid {
      grid-template-columns: 1fr;
    }

  }

  @media (max-width: 620px) {
    .radar-suite {
      grid-template-columns: 1fr;
    }

    .dialogue-script-stack {
      grid-template-columns: 1fr;
    }

    .dialogue-generator-controls {
      grid-template-columns: 1fr;
    }

    .dialogue-generator-controls button {
      min-width: 0;
    }

    .candidate-persona-detail {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .persona-map-shell {
      padding-inline: 34px;
    }
  }
</style>

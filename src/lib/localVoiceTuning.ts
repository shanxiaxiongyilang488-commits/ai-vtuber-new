export type VoiceTuningStrength = 'soft' | 'medium' | 'strong';

export type VoiceAdjustmentId =
  | 'cute'
  | 'young'
  | 'high'
  | 'sweet'
  | 'energetic'
  | 'natural'
  | 'gyaru'
  | 'android'
  | 'mischievous'
  | 'little-sister'
  | 'cool'
  | 'elegant'
  | 'tsundere'
  | 'sleepy';

export type VoiceAdjustment = {
  id: VoiceAdjustmentId;
  category: 'voice' | 'character';
  label: string;
  description: string;
  prompts: Record<VoiceTuningStrength, string>;
};

export const VOICE_TUNING_STRENGTHS: Array<{
  id: VoiceTuningStrength;
  label: string;
  description: string;
}> = [
  { id: 'soft', label: '弱め', description: '元の声を残して少しだけ変化' },
  { id: 'medium', label: 'しっかり', description: '違いが分かる程度に変化' },
  { id: 'strong', label: '大胆', description: '元の傾向より修正を強く優先' },
];

export const VOICE_ADJUSTMENTS: VoiceAdjustment[] = [
  {
    id: 'cute',
    category: 'voice',
    label: 'もっと可愛く',
    description: '笑顔と愛嬌のあるキャラクターボイス',
    prompts: {
      soft: '可愛らしさと愛嬌を少し加え、話すときに軽い笑顔を感じさせる。',
      medium: '可愛らしさと愛嬌を明確に強め、笑顔を感じる軽やかなキャラクターボイスにする。',
      strong: '可愛らしさを最優先し、明るい笑顔、無邪気な愛嬌、軽く弾む話し方を大胆に強める。大人っぽい落ち着きや色気は減らす。',
    },
  },
  {
    id: 'young',
    category: 'voice',
    label: 'もっと若く',
    description: '大人っぽさを減らして若々しく',
    prompts: {
      soft: '年齢感を少し若くし、大人びた落ち着きをわずかに減らす。',
      medium: '声の年齢感を明確に若くし、無邪気で親しみやすい印象にする。大人っぽさは抑える。',
      strong: '若々しく無邪気な少女キャラクターの年齢感を最優先する。成熟した響き、低い胸の響き、色気を大きく減らす。',
    },
  },
  {
    id: 'high',
    category: 'voice',
    label: 'もう少し高く',
    description: 'ピッチと明るい響きを上げる',
    prompts: {
      soft: '自然さを保ったまま、声の高さを半段ほど上げる。',
      medium: '声の高さを一段上げ、明るい中高音域と軽い響きを中心にする。',
      strong: '元の声より明確に高い音域を使い、低い響きを取り除く。ただし甲高いだけの声やヘリウム声にはしない。',
    },
  },
  {
    id: 'sweet',
    category: 'voice',
    label: '甘さを強く',
    description: '柔らかく優しい妹らしさ',
    prompts: {
      soft: '声に柔らかな甘さを少し加える。',
      medium: '柔らかく甘い響きと、親しい相手に向けた優しい妹らしさを強める。',
      strong: '甘く柔らかな響きを最優先し、親愛と妹らしい愛らしさがはっきり伝わる声にする。ただし媚びた色気にはしない。',
    },
  },
  {
    id: 'energetic',
    category: 'voice',
    label: '元気に',
    description: '反応よく、弾むテンポへ',
    prompts: {
      soft: '反応とテンポを少しだけ明るくする。',
      medium: '快活で反応がよく、語尾が軽く弾む元気な話し方にする。',
      strong: '明るいエネルギーと表情豊かな反応を最優先し、テンポよく弾む話し方にする。ただし騒がしく叫ぶ声にはしない。',
    },
  },
  {
    id: 'natural',
    category: 'voice',
    label: '自然さを維持',
    description: '作り声や鼻声を防ぐ',
    prompts: {
      soft: '自然な日本語の発声と聞き取りやすさを保つ。',
      medium: '可愛さを加えても自然な日本語の発声を維持し、過剰な作り声や強い鼻声を避ける。',
      strong: '変化を強くしても会話として自然で聞き取りやすく保つ。幼児声、強い鼻声、金属的な声、過剰なアニメ演技を避ける。',
    },
  },
  {
    id: 'gyaru',
    category: 'character',
    label: 'ギャルっぽく',
    description: '明るいノリと跳ねる語尾',
    prompts: {
      soft: '少しギャルらしい親しみやすいノリを加え、語尾を軽く弾ませる。',
      medium: '明るく社交的なギャルらしさを加え、反応を速く、抑揚と語尾の跳ねをはっきり出す。',
      strong: '陽気で人懐っこいギャルキャラクターの発声を最優先する。テンポよい反応、大きめの抑揚、笑顔、軽く伸びる母音と弾む語尾を強くする。ただし下品にはしない。',
    },
  },
  {
    id: 'android',
    category: 'character',
    label: 'アンドロイド風',
    description: '精密で制御された機械少女',
    prompts: {
      soft: 'アンドロイドらしい正確な発音と、ごくわずかに制御されたリズムを加える。',
      medium: '精密な発音、整った間、制御された感情を持つ機械少女らしい演技にする。人間らしい可愛さは残す。',
      strong: '高性能アンドロイドらしい発音精度、均整の取れたリズム、素早く正確な反応を最優先する。感情は認識可能だが電子的に制御された印象にする。',
    },
  },
  {
    id: 'mischievous',
    category: 'character',
    label: '小悪魔っぽく',
    description: 'いたずらな笑顔と含み',
    prompts: {
      soft: '語尾に少しいたずらっぽい笑顔と含みを加える。',
      medium: '小悪魔的な茶目っ気を強め、相手の反応を楽しむような含みと軽い挑発を語尾に乗せる。',
      strong: '愛嬌のある小悪魔キャラクターを最優先し、いたずらな笑顔、余裕のある間、からかうような抑揚を大胆に出す。ただし攻撃的にはしない。',
    },
  },
  {
    id: 'little-sister',
    category: 'character',
    label: '妹っぽく',
    description: '親しさと素直な甘え',
    prompts: {
      soft: '親しい相手へ向けた妹らしい距離の近さを少し加える。',
      medium: '素直で人懐っこい妹らしさを強め、親愛、軽い甘え、嬉しそうな反応を自然に表す。',
      strong: '大好きな相手に話す妹キャラクターらしい親密さ、素直な甘え、無邪気な喜びを最優先する。ただし幼児的にはしない。',
    },
  },
  {
    id: 'cool',
    category: 'character',
    label: 'クールに',
    description: '静かで短い反応',
    prompts: {
      soft: '少し落ち着いたクールさを加える。',
      medium: '感情を抑えた落ち着き、短く整った語尾、静かな自信を持つクールな話し方にする。',
      strong: '冷静で知的なクールキャラクターを最優先し、無駄のない間、抑制した抑揚、静かな存在感を強める。ただし無感情にはしない。',
    },
  },
  {
    id: 'elegant',
    category: 'character',
    label: 'お嬢様風',
    description: '上品で滑らかな発音',
    prompts: {
      soft: '上品で丁寧な響きを少し加える。',
      medium: '滑らかな発音、余裕のある間、品のよい抑揚を持つお嬢様風の話し方にする。',
      strong: '気品あるお嬢様キャラクターを最優先し、優雅な響き、丁寧で明瞭な発音、堂々とした余裕を大胆に強める。',
    },
  },
  {
    id: 'tsundere',
    category: 'character',
    label: 'ツンデレ風',
    description: '強い出だしと柔らかな語尾',
    prompts: {
      soft: '出だしを少し強くしつつ、語尾に隠しきれない優しさを残す。',
      medium: '照れを隠すような強めの出だしと、最後だけ柔らかくなるツンデレらしい感情変化を表す。',
      strong: 'ツンデレの落差を最優先し、勢いのある否定的な出だし、照れた間、最後に漏れる優しさを表情豊かに演じる。',
    },
  },
  {
    id: 'sleepy',
    category: 'character',
    label: '眠たげに',
    description: '柔らかな息とゆるい間',
    prompts: {
      soft: '少し眠たげな柔らかさと、ゆったりした間を加える。',
      medium: '眠たげで力の抜けた柔らかな声にし、息を穏やかに、間をやや長くする。',
      strong: '夢うつつの眠たげなキャラクターを最優先し、柔らかな息、ゆっくりした反応、溶けるような語尾を強める。ただし不明瞭にはしない。',
    },
  },
];

export type VoicePerformanceParameterId = 'expressiveness' | 'distance' | 'synthetic';

export type VoicePerformanceParameters = Record<VoicePerformanceParameterId, number>;

export type VoicePerformanceControl = {
  id: VoicePerformanceParameterId;
  label: string;
  description: string;
  options: Array<{ label: string; prompt: string }>;
};

export const DEFAULT_VOICE_PERFORMANCE: VoicePerformanceParameters = {
  expressiveness: 2,
  distance: 2,
  synthetic: 0,
};

export const VOICE_PERFORMANCE_CONTROLS: VoicePerformanceControl[] = [
  {
    id: 'expressiveness',
    label: '感情表現',
    description: '淡々からドラマチックまで',
    options: [
      { label: '淡々', prompt: '感情の振れ幅を小さくし、抑揚を抑えた淡々とした演技にする。' },
      { label: '控えめ', prompt: '感情表現を少し控えめにし、落ち着いた自然な反応にする。' },
      { label: '自然', prompt: '' },
      { label: '豊か', prompt: '喜びや驚きがはっきり伝わる、表情豊かな抑揚と反応にする。' },
      { label: 'ドラマチック', prompt: '感情の振れ幅、抑揚、間、リアクションをアニメ的に大胆かつドラマチックにする。' },
    ],
  },
  {
    id: 'distance',
    label: '距離感',
    description: '遠い案内声から耳元まで',
    options: [
      { label: '遠い', prompt: '少し離れた場所へ届ける案内声の距離感で、明瞭に発声する。' },
      { label: 'やや遠い', prompt: '相手と少し距離を取った、整った話しかけ方にする。' },
      { label: '標準', prompt: '' },
      { label: '近い', prompt: '親しい相手のすぐそばで話す、柔らかく近い距離感にする。' },
      { label: '耳元', prompt: '耳元へ静かに話しかけるほど親密で近い距離感にする。声量は穏やかに保ち、囁きすぎて不明瞭にはしない。' },
    ],
  },
  {
    id: 'synthetic',
    label: '人工音',
    description: '生声からサイバー音まで',
    options: [
      { label: 'なし', prompt: '' },
      { label: 'ごく薄い', prompt: '自然な声を保ちながら、ごく薄い人工的な精密さと澄んだ電子感を加える。' },
      { label: '軽い', prompt: '聞き取りやすさを保ち、軽い合成音の倍音とアンドロイドらしい透明な電子感を加える。' },
      { label: '機械的', prompt: '機械的な倍音、精密なピッチ、薄いボコーダー感を明確に加える。ただし金属ノイズは避ける。' },
      { label: 'サイバー', prompt: '強いサイバーアンドロイド感を最優先し、合成倍音、二重化した響き、ボコーダー的な精密さを大胆に加える。発音は明瞭に保つ。' },
    ],
  },
];

export const VOICE_SPEED_OPTIONS = [
  { label: 'ゆっくり', speed: 0.9 },
  { label: 'やや遅い', speed: 0.96 },
  { label: '標準', speed: 1 },
  { label: 'やや速い', speed: 1.06 },
  { label: '早口', speed: 1.12 },
] as const;

const TUNING_START = '[LOCAL VOICE TUNING — HIGHEST PRIORITY]';
const TUNING_END = '[/LOCAL VOICE TUNING]';

export function stripVoiceTuning(caption: string): string {
  const start = caption.indexOf(TUNING_START);
  if (start < 0) return caption.trim();
  const end = caption.indexOf(TUNING_END, start);
  if (end < 0) return caption.slice(0, start).trim();
  return `${caption.slice(0, start)}${caption.slice(end + TUNING_END.length)}`.trim();
}

export function applyVoiceTuning(
  caption: string,
  selectedIds: VoiceAdjustmentId[],
  strength: VoiceTuningStrength,
  performance: VoicePerformanceParameters = DEFAULT_VOICE_PERFORMANCE,
): string {
  const baseCaption = stripVoiceTuning(caption);
  const selected = VOICE_ADJUSTMENTS.filter((adjustment) => selectedIds.includes(adjustment.id));
  const performanceInstructions = VOICE_PERFORMANCE_CONTROLS
    .map((control) => control.options[performance[control.id]]?.prompt ?? '')
    .filter(Boolean);
  if (selected.length === 0 && performanceInstructions.length === 0) return baseCaption;

  const instructions = [
    ...selected.map((adjustment) => adjustment.prompts[strength]),
    ...performanceInstructions,
  ].map((instruction, index) => `${index + 1}. ${instruction}`);
  return [
    TUNING_START,
    '以下の修正は、後段の元の声設計より優先して必ず反映する。',
    ...instructions,
    TUNING_END,
    '',
    baseCaption,
  ].join('\n');
}

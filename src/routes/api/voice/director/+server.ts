import { error, json } from '@sveltejs/kit';
import { chatOpenAIWithModel, OPENAI_DEFAULT_MODEL } from '$lib/providers/openai';
import { readSettings } from '$lib/server/settings';
import type { RequestHandler } from './$types';

const PARAMETER_KEYS = [
  'basePitch',
  'tempo',
  'energy',
  'breathiness',
  'forwardTwang',
  'nasality',
  'formantShift',
  'brightness',
  'body',
  'presence',
  'dynamics',
  'roughness',
  'rhythmSwing',
  'endingDrop',
  'humanize',
  'tension',
  'familiarity',
  'charaLevel',
  'kogyaruPerformance',
  'pitchVariation',
  'articulation',
  'vowelStretch',
] as const;

type ParameterKey = (typeof PARAMETER_KEYS)[number];
type VoiceAgeBand = 'jc' | 'jk' | 'jd';
type StylePack = 'natural' | 'gyaru' | 'idol' | 'cool' | 'narrator' | 'android';
type DialectStyle = 'standard' | 'kansai' | 'kanazawa';

type DirectorRecipe = {
  summary: string;
  stylePack: StylePack;
  voiceAgeBand: VoiceAgeBand;
  dialectStyle: DialectStyle;
  dialectStrength: number;
  parameters: Record<ParameterKey, number>;
  performanceCue: string;
  interpretation: string[];
  cautions: string[];
};

function cleanInput(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? Array.from(value.trim()).slice(0, maxLength).join('')
    : '';
}

function clamp(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, Math.round(number)))
    : fallback;
}

function cleanLine(value: unknown, fallback: string, maxLength = 240): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return Array.from(cleaned || fallback).slice(0, maxLength).join('');
}

function cleanLines(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const lines = value
    .map((entry) => cleanLine(entry, '', 120))
    .filter(Boolean)
    .slice(0, 6);
  return lines.length ? lines : fallback;
}

function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T)
    ? value as T
    : fallback;
}

function currentParameters(value: unknown): Record<ParameterKey, number> {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(
    PARAMETER_KEYS.map((key) => [key, clamp(source[key], 50)]),
  ) as Record<ParameterKey, number>;
}

function parseRecipe(raw: string, current: Record<ParameterKey, number>): DirectorRecipe | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
    const rawParameters = parsed.parameters && typeof parsed.parameters === 'object'
      ? parsed.parameters as Record<string, unknown>
      : {};
    const parameters = Object.fromEntries(
      PARAMETER_KEYS.map((key) => [key, clamp(rawParameters[key], current[key])]),
    ) as Record<ParameterKey, number>;

    // Extreme post-processing shifts easily sound metallic. Keep the director in the useful zone;
    // the manual controls remain available when the user deliberately wants an extreme setting.
    parameters.nasality = Math.min(parameters.nasality, 35);
    parameters.roughness = Math.min(parameters.roughness, 55);
    parameters.basePitch = Math.max(8, Math.min(92, parameters.basePitch));
    parameters.tempo = Math.max(12, Math.min(94, parameters.tempo));
    parameters.formantShift = Math.max(12, Math.min(90, parameters.formantShift));

    return {
      summary: cleanLine(parsed.summary, '現在の声を基準に話し方を調整'),
      stylePack: choice(
        parsed.stylePack,
        ['natural', 'gyaru', 'idol', 'cool', 'narrator', 'android'] as const,
        'natural',
      ),
      voiceAgeBand: choice(parsed.voiceAgeBand, ['jc', 'jk', 'jd'] as const, 'jk'),
      dialectStyle: choice(
        parsed.dialectStyle,
        ['standard', 'kansai', 'kanazawa'] as const,
        'standard',
      ),
      dialectStrength: clamp(parsed.dialectStrength, 0),
      parameters,
      performanceCue: cleanLine(
        parsed.performanceCue,
        '現在の声質を保ち、自然な会話の間と抑揚で話す。',
      ),
      interpretation: cleanLines(parsed.interpretation, ['現在値を基準に解釈しました。']),
      cautions: cleanLines(parsed.cautions, []),
    };
  } catch {
    return null;
  }
}

function applyInstructionGuardrails(recipe: DirectorRecipe, instruction: string): DirectorRecipe {
  const parameters = { ...recipe.parameters };
  const asksForLowNasality = /鼻声.{0,6}(?:弱|控|抑|なし|無し|少な)/u.test(instruction);
  const avoidsMachineTone = /(?:機械|ロボット|金属).{0,8}(?:っぽく|的に|感を).{0,8}(?:しない|避け|抑|なし)/u.test(instruction)
    || /(?:機械|ロボット|金属)(?:っぽくない|的でない|感なし)/u.test(instruction);
  const asksForYouth = /(?:若い|若く|幼め|JK|ＪＫ|JC|ＪＣ|学生).{0,12}(?:声|感じ|自然)?/u.test(instruction);

  if (asksForLowNasality) parameters.nasality = Math.min(parameters.nasality, 15);
  if (avoidsMachineTone) {
    parameters.nasality = Math.min(parameters.nasality, 22);
    parameters.roughness = Math.min(parameters.roughness, 28);
    parameters.formantShift = Math.max(22, Math.min(84, parameters.formantShift));
    parameters.humanize = Math.max(parameters.humanize, 78);
  }
  if (recipe.voiceAgeBand === 'jc' || recipe.voiceAgeBand === 'jk' || asksForYouth) {
    parameters.body = Math.min(parameters.body, 45);
    parameters.roughness = Math.min(parameters.roughness, 32);
  }

  const addedCautions = [
    ...(asksForLowNasality && recipe.parameters.nasality > parameters.nasality
      ? ['「鼻声は弱め」を優先し、機械感防止のため鼻声を15以下に制限しました。']
      : []),
    ...(avoidsMachineTone && (
      recipe.parameters.roughness > parameters.roughness
      || recipe.parameters.nasality > parameters.nasality
    )
      ? ['機械感を避けるため、鼻声とざらつきの上限を抑えました。']
      : []),
  ];

  return {
    ...recipe,
    parameters,
    cautions: [...recipe.cautions, ...addedCautions].slice(0, 6),
  };
}

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const instruction = cleanInput(body.instruction, 800);
  if (!instruction) throw error(400, '声の指示を入力してください');

  const current = currentParameters(body.currentParameters);
  const currentAge = choice(body.voiceAgeBand, ['jc', 'jk', 'jd'] as const, 'jk');
  const settings = await readSettings();
  if (!settings.openai.key) throw error(500, 'OpenAI API key 未設定');

  const systemPrompt = [
    'あなたは音声合成システムのVOICE DIRECTORです。',
    '利用者の自然言語指示を、声質と発話演技の数値レシピへ変換します。',
    'これは推論時の制御であり、話者ごとのLoRA学習は行いません。',
    '現在値を基準にし、指示されていない項目は極力維持してください。',
    '話者の本人性、声質、発話演技、方言を別の要素として扱ってください。',
    '方言は明示された場合だけ指定し、声質パラメータには混ぜません。',
    '実在人物・既存キャラクター名が含まれる場合、完全な声真似ではなく、年齢感・高さ・明るさ・速度・抑揚など一般的特徴へ分解してください。',
    '若い声では、成人女性化を避けるためbodyとroughnessを上げすぎず、nasalityは必要最小限にします。',
    '極端なピッチ、フォルマント、鼻声は機械感を生むため避けます。',
    '出力は指定されたJSONオブジェクト1個だけ。Markdownや説明文は禁止です。',
  ].join('\n');

  const parameterGuide = [
    'basePitch=声の高さ',
    'tempo=話す速さ',
    'energy=声の勢い',
    'breathiness=息感',
    'forwardTwang=前方への響き',
    'nasality=鼻声',
    'formantShift=声道の小ささ・若さ',
    'brightness=明るさ',
    'body=声の太さ',
    'presence=近さ・存在感',
    'dynamics=音量差',
    'roughness=ざらつき',
    'rhythmSwing=話速の揺れ',
    'endingDrop=語尾を下げる強さ',
    'humanize=機械感補正。高いほど加工による金属感を抑える',
    'tension=テンション',
    'familiarity=心理的距離の近さ',
    'charaLevel=可愛い寄り0〜チャラい寄り100',
    'kogyaruPerformance=90年代コギャル発話構造',
    'pitchVariation=抑揚',
    'articulation=滑舌',
    'vowelStretch=母音・語尾の伸ばし',
  ].join(', ');

  const userMessage = [
    `利用者の指示: ${instruction}`,
    `現在の声齢: ${currentAge}`,
    `現在のパラメータ: ${JSON.stringify(current)}`,
    `パラメータ定義: ${parameterGuide}`,
    '0は弱い、100は強い。全parameterキーを必ず返してください。',
    'stylePackは natural / gyaru / idol / cool / narrator / android のいずれか。',
    'voiceAgeBandは jc / jk / jd、dialectStyleは standard / kansai / kanazawa。',
    'dialectStrengthは方言の強さ。方言指定がなければ0。',
    '次のJSON形式だけを返してください:',
    JSON.stringify({
      summary: '短い日本語の要約',
      stylePack: 'natural',
      voiceAgeBand: currentAge,
      dialectStyle: 'standard',
      dialectStrength: 0,
      parameters: current,
      performanceCue: '生成時に使う日本語の演技指示',
      interpretation: ['何をどう解釈したか'],
      cautions: ['機械感や声齢についての注意。なければ空配列'],
    }),
  ].join('\n');

  try {
    const model = settings.openai.model || OPENAI_DEFAULT_MODEL;
    const result = await chatOpenAIWithModel({
      apiKey: settings.openai.key,
      model,
      systemPrompt,
      userMessage,
      maxTokens: 1800,
    });
    const parsedRecipe = parseRecipe(result.text, current);
    if (!parsedRecipe) throw new Error('有効な音声レシピが返されませんでした');
    const recipe = applyInstructionGuardrails(parsedRecipe, instruction);
    return json({ recipe, model: result.model });
  } catch (caught) {
    throw error(502, caught instanceof Error ? caught.message : '声の指示を解釈できませんでした');
  }
};

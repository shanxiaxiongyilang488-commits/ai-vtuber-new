import { classifyIntentAI, setAIIntentClassifier, type AIIntentClassifier } from './aiIntentRouter';
import { routerStateStore } from './stores/routerStateStore';

export type IntentType =
  | 'chat'
  | 'image'
  | 'manga'
  | 'yaml'
  | 'memory'
  | 'voice';

export type ImageIntentSubtype =
  | 'illustration'
  | 'character_sheet'
  | 'setting_sheet'
  | 'manga_page'
  | 'poster'
  | 'cover';

export interface IntentResult {
  intent: IntentType;
  subtype?: string;
  confidence: number;
  reason?: string;
  source?: 'rules' | 'gemini';
}

export interface IntentClassifier {
  name: string;
  classify(message: string): Promise<IntentResult>;
}

const RULE_CONFIDENCE_THRESHOLD = 0.8;

const IMAGE_GENERATION_KEYWORDS = [
  '描いて',
  'イラスト',
  '画像生成',
  '立ち絵',
  'キャラデザ',
  '設定画',
  '資料集',
  'キャラクターシート',
  'デザインシート',
  '4コマ',
  '漫画',
  'マンガ',
  'ポスター',
  '表紙',
  '一枚絵',
];

const IMAGE_REQUEST_OBJECT_KEYWORDS = [
  '画像',
  '絵',
  'イラスト',
  '立ち絵',
  'キャラデザ',
  '設定画',
  '資料集',
  'キャラクターシート',
  'デザインシート',
  '4コマ',
  '漫画',
  'マンガ',
  'ポスター',
  '表紙',
  '一枚絵',
];

const IMAGE_REQUEST_ACTION_PATTERN = /(作って|作成して|生成して|出して|お願い|ください|ほしい|欲しい)/;
const DRAW_REQUEST_PATTERN = /(描いて|描いてください|描いてくれる|描いてほしい|描いて欲しい|描ける|描けますか|描き起こして)/;
const YAML_PATTERN = /(ya?ml|構造化|yaml化|studioへ送る|スタジオへ送る)/i;
const MEMORY_PATTERN = /(覚えておいて|記憶しておいて|メモしておいて|覚えて|記憶して|メモして|忘れないで|remember)/i;
const VOICE_PATTERN = /(音声生成|音声を作って|声を作って|読み上げて|喋って|しゃべって|発話して|voice|tts)/i;
const MANGA_PATTERN = /(4コマ|漫画|マンガ|ネーム|コマ割り|漫画化|manga)/i;

function normalizeMessage(message: string): string {
  return message.replace(/\s+/g, '').trim();
}

function hasAny(normalized: string, keywords: string[]): boolean {
  return keywords.some((keyword) => normalized.includes(keyword));
}

function firstMatch(normalized: string, keywords: string[]): string | undefined {
  return keywords.find((keyword) => normalized.includes(keyword));
}

function regexMatch(normalized: string, pattern: RegExp): string | undefined {
  return normalized.match(pattern)?.[0];
}

function classifyImageSubtype(normalized: string): ImageIntentSubtype {
  if (/(資料集|キャラクターシート|キャラクター設定|設定資料|デザインシート|三面図|立ち絵差分)/.test(normalized)) {
    return 'character_sheet';
  }
  if (/(設定画|世界観設定|背景設定|小物設定|美術設定)/.test(normalized)) {
    return 'setting_sheet';
  }
  if (/(4コマ|漫画|マンガ|漫画ページ|manga)/i.test(normalized)) {
    return 'manga_page';
  }
  if (/ポスター/.test(normalized)) {
    return 'poster';
  }
  if (/表紙/.test(normalized)) {
    return 'cover';
  }
  return 'illustration';
}

function classifyImageIntent(normalized: string): IntentResult | null {
  if (YAML_PATTERN.test(normalized)) return null;

  const keywordMatch = hasAny(normalized, IMAGE_GENERATION_KEYWORDS);
  const drawMatch = DRAW_REQUEST_PATTERN.test(normalized);
  const objectActionMatch = hasAny(normalized, IMAGE_REQUEST_OBJECT_KEYWORDS)
    && IMAGE_REQUEST_ACTION_PATTERN.test(normalized);

  if (!keywordMatch && !drawMatch && !objectActionMatch) return null;

  return {
    intent: 'image',
    subtype: classifyImageSubtype(normalized),
    confidence: objectActionMatch || drawMatch ? 0.95 : 0.9,
    reason: objectActionMatch
      ? `${firstMatch(normalized, IMAGE_REQUEST_OBJECT_KEYWORDS) ?? '画像対象'} + ${regexMatch(normalized, IMAGE_REQUEST_ACTION_PATTERN) ?? '作成依頼'} を検出`
      : `${regexMatch(normalized, DRAW_REQUEST_PATTERN) ?? firstMatch(normalized, IMAGE_GENERATION_KEYWORDS) ?? '画像生成語'} を検出`,
    source: 'rules',
  };
}

export function classifyIntentByRules(message: string): IntentResult {
  const normalized = normalizeMessage(message);
  if (!normalized) return { intent: 'chat', confidence: 0.5, reason: '入力が空です', source: 'rules' };

  if (MEMORY_PATTERN.test(normalized)) {
    return { intent: 'memory', confidence: 0.9, reason: `${regexMatch(normalized, MEMORY_PATTERN) ?? '記憶語'} を検出`, source: 'rules' };
  }

  if (VOICE_PATTERN.test(normalized)) {
    return { intent: 'voice', confidence: 0.9, reason: `${regexMatch(normalized, VOICE_PATTERN) ?? '音声語'} を検出`, source: 'rules' };
  }

  if (YAML_PATTERN.test(normalized)) {
    return {
      intent: 'yaml',
      subtype: MANGA_PATTERN.test(normalized) ? 'manga_yaml' : undefined,
      confidence: 0.92,
      reason: `${regexMatch(normalized, YAML_PATTERN) ?? 'YAML語'} を検出`,
      source: 'rules',
    };
  }

  const imageIntent = classifyImageIntent(normalized);
  if (imageIntent) return imageIntent;

  if (MANGA_PATTERN.test(normalized) && IMAGE_REQUEST_ACTION_PATTERN.test(normalized)) {
    return {
      intent: 'manga',
      subtype: 'manga_story',
      confidence: 0.82,
      reason: `${regexMatch(normalized, MANGA_PATTERN) ?? '漫画語'} + ${regexMatch(normalized, IMAGE_REQUEST_ACTION_PATTERN) ?? '作成依頼'} を検出`,
      source: 'rules',
    };
  }

  return { intent: 'chat', confidence: 0.55, reason: '高信頼度のルールに一致しませんでした', source: 'rules' };
}

export const ruleBasedClassifier: IntentClassifier = {
  name: 'rule-based',
  classify(message: string) {
    return Promise.resolve(classifyIntentByRules(message));
  },
};

export function setIntentClassifier(classifier: IntentClassifier | null): void {
  setAIIntentClassifier(classifier as AIIntentClassifier | null);
}

export async function classifyIntent(message: string): Promise<IntentResult> {
  const ruleResult = classifyIntentByRules(message);
  if (ruleResult.confidence >= RULE_CONFIDENCE_THRESHOLD) {
    routerStateStore.set(ruleResult);
    return ruleResult;
  }

  const aiResult = await classifyIntentAI(message);
  routerStateStore.set(aiResult);
  return aiResult;
}

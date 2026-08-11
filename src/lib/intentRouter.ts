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
  action?: string;
  generate_image?: boolean;
  generate_yaml?: boolean;
  generate_manga?: boolean;
  subtype?: string;
  confidence: number;
  reason?: string;
  source?: 'rules' | 'openai';
  matched_rule?: string;
  matched_keywords?: string[];
  negative_keywords?: string[];
  score_breakdown?: Record<string, number | boolean | string>;
}

export interface IntentClassifier {
  name: string;
  classify(message: string): Promise<IntentResult>;
}

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
const MANGA_DISCUSSION_PATTERN = /(漫画ネタ|漫画のアイデア|漫画アイデア|漫画案|漫画の展開|漫画展開|漫画会議|漫画プロット|編集会議|脚本)/i;
const MANGA_PAGE_REQUEST_PATTERN = /((?:漫画|マンガ)化(?:して|する|してください)?|(?:1|１)ページ(?:の)?(?:漫画|マンガ)(?:化(?:して)?|にして)|(?:漫画|マンガ|4コマ)(?:を)?(?:描いて|生成して)|ya?mlから(?:漫画|マンガ|4コマ)(?:を)?生成して)/i;

const YAML_INPUT_PATTERN = /(?:この)?ya?ml(?:に従って|を使って|で|から|に基づいて|を元に|をもとに)/i;
const YAML_VISUAL_OUTPUT_PATTERN = /(?:(?:1|１)ページ)?(?:漫画|4コマ|マンガ|画像|image)(?:を)?(?:生成|作成|作って|描いて|画像化)/i;
const GENERATION_NEGATIVE_KEYWORDS = [
  '生成しない',
  '画像生成しない',
  '作成しない',
  '描かない',
  '出力しない',
  '漫画化しない',
  'YAML化しない',
  '資料集化しない',
] as const;

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

function allKeywordMatches(normalized: string, keywords: string[]): string[] {
  return Array.from(new Set(keywords.filter((keyword) => normalized.includes(keyword))));
}

export function findGenerationNegativeKeywords(message: string): string[] {
  const normalized = normalizeMessage(message).toLocaleLowerCase('ja-JP');
  const matches = GENERATION_NEGATIVE_KEYWORDS
    .filter((keyword) => normalized.includes(keyword.toLocaleLowerCase('ja-JP')))
    .sort((left, right) => right.length - left.length);
  return matches.filter((keyword, index) =>
    !matches.slice(0, index).some((specific) =>
      specific.toLocaleLowerCase('ja-JP').includes(keyword.toLocaleLowerCase('ja-JP')),
    ),
  );
}

function applyGenerationNegationGuard(message: string, result: IntentResult): IntentResult {
  const negativeKeywords = findGenerationNegativeKeywords(message);
  if (negativeKeywords.length === 0) return result;

  return {
    ...result,
    generate_image: false,
    generate_manga: false,
    generate_yaml: false,
    negative_keywords: Array.from(new Set([
      ...(result.negative_keywords ?? []),
      ...negativeKeywords,
    ])),
    score_breakdown: {
      ...(result.score_breakdown ?? {}),
      generation_negation_guard: true,
      forced_generate_image: false,
      forced_generate_manga: false,
      forced_generate_yaml: false,
    },
    reason: `${result.reason ?? ''} 生成否定表現（${negativeKeywords.join('、')}）を検出したため生成フラグを無効化`.trim(),
  };
}

function buildRuleImageTrace(message: string, result: IntentResult) {
  const normalized = normalizeMessage(message);
  const generationKeywords = allKeywordMatches(normalized, IMAGE_GENERATION_KEYWORDS);
  const objectKeywords = allKeywordMatches(normalized, IMAGE_REQUEST_OBJECT_KEYWORDS);
  const actionKeyword = regexMatch(normalized, IMAGE_REQUEST_ACTION_PATTERN);
  const drawKeyword = regexMatch(normalized, DRAW_REQUEST_PATTERN);
  const mangaPageKeyword = regexMatch(normalized, MANGA_PAGE_REQUEST_PATTERN);
  const yamlInputKeyword = regexMatch(normalized, YAML_INPUT_PATTERN);
  const yamlVisualKeyword = regexMatch(normalized, YAML_VISUAL_OUTPUT_PATTERN);
  const yamlKeyword = regexMatch(normalized, YAML_PATTERN);
  const mangaDiscussionKeyword = regexMatch(normalized, MANGA_DISCUSSION_PATTERN);
  const memoryKeyword = regexMatch(normalized, MEMORY_PATTERN);
  const voiceKeyword = regexMatch(normalized, VOICE_PATTERN);
  const yamlDirectImage = regexMatch(normalized, /(?:この)?ya?ml(?:を)?画像化/i)
    ?? regexMatch(normalized, /ya?mlから画像生成/i);

  let matchedRule = 'generic_image_keyword';
  if (mangaPageKeyword) matchedRule = 'manga_page_request';
  else if ((yamlInputKeyword && yamlVisualKeyword) || yamlDirectImage) matchedRule = 'yaml_visual_output';
  else if (objectKeywords.length > 0 && actionKeyword) matchedRule = 'image_object_plus_generation_action';
  else if (drawKeyword) matchedRule = 'explicit_draw_request';

  const matchedKeywords = Array.from(new Set([
    ...generationKeywords,
    ...objectKeywords,
    actionKeyword,
    drawKeyword,
    mangaPageKeyword,
    yamlInputKeyword,
    yamlVisualKeyword,
    yamlDirectImage,
  ].filter((value): value is string => Boolean(value))));
  const negativeKeywords = Array.from(new Set([
    ...findGenerationNegativeKeywords(message),
    mangaDiscussionKeyword ? `discussion_only:${mangaDiscussionKeyword}` : '',
    memoryKeyword ? `memory_priority:${memoryKeyword}` : '',
    voiceKeyword ? `voice_priority:${voiceKeyword}` : '',
    yamlKeyword && !yamlVisualKeyword && !yamlDirectImage ? `yaml_without_visual_request:${yamlKeyword}` : '',
  ].filter(Boolean)));

  return {
    source: 'rules',
    final_intent: result.intent,
    matched_rule: matchedRule,
    matched_keywords: matchedKeywords,
    negative_keywords: negativeKeywords,
    score_breakdown: {
      base_score: 0.55,
      image_generation_keyword: generationKeywords.length > 0 ? 0.35 : 0,
      image_object_plus_action: objectKeywords.length > 0 && Boolean(actionKeyword) ? 0.4 : 0,
      explicit_draw_request: drawKeyword ? 0.4 : 0,
      manga_page_request: mangaPageKeyword ? 0.44 : 0,
      yaml_visual_output: (yamlInputKeyword && yamlVisualKeyword) || yamlDirectImage ? 0.44 : 0,
      negative_condition_count: negativeKeywords.length,
      selected_confidence: result.confidence,
      reason: result.reason ?? '',
    },
  };
}

function buildFinalImageTrace(message: string, result: IntentResult) {
  if (result.source === 'rules') return buildRuleImageTrace(message, result);
  return {
    source: result.source ?? 'unknown',
    final_intent: result.intent,
    matched_rule: result.matched_rule || result.action || 'openai_semantic_classification',
    matched_keywords: result.matched_keywords ?? [],
    negative_keywords: result.negative_keywords ?? [],
    score_breakdown: {
      ...(result.score_breakdown ?? {}),
      generate_image: result.generate_image ?? false,
      generate_yaml: result.generate_yaml ?? false,
      generate_manga: result.generate_manga ?? false,
      selected_confidence: result.confidence,
      reason: result.reason ?? '',
    },
  };
}

function classifyImageSubtype(normalized: string): ImageIntentSubtype {
  if (/(資料集|キャラクターシート|キャラクター設定|設定資料|デザインシート|三面図|立ち絵差分)/.test(normalized)) {
    return 'character_sheet';
  }
  if (/(設定画|世界観設定|背景設定|小物設定|美術設定)/.test(normalized)) {
    return 'setting_sheet';
  }
  if (MANGA_PAGE_REQUEST_PATTERN.test(normalized)) {
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

  if (MANGA_DISCUSSION_PATTERN.test(normalized) && !MANGA_PAGE_REQUEST_PATTERN.test(normalized)) {
    return {
      intent: 'chat',
      confidence: 0.99,
      reason: `${regexMatch(normalized, MANGA_DISCUSSION_PATTERN) ?? '漫画相談語'} は制作命令ではないためchat`,
      source: 'rules',
    };
  }

  if (MANGA_PAGE_REQUEST_PATTERN.test(normalized)) {
    return {
      intent: 'manga',
      action: 'generate_manga_page',
      subtype: 'manga_page',
      generate_image: true,
      generate_manga: true,
      confidence: 0.99,
      reason: `${regexMatch(normalized, MANGA_PAGE_REQUEST_PATTERN) ?? '漫画制作命令'} を検出`,
      source: 'rules',
    };
  }

  if (
    (YAML_INPUT_PATTERN.test(normalized) && YAML_VISUAL_OUTPUT_PATTERN.test(normalized))
    || /(?:この)?ya?ml(?:を)?画像化/i.test(normalized)
    || /ya?mlから画像生成/i.test(normalized)
  ) {
    return {
      intent: 'image',
      subtype: /(?:漫画|4コマ|マンガ)/.test(normalized) ? 'manga_page' : 'illustration',
      confidence: 0.99,
      reason: 'YAMLを入力として使う画像生成要求を検出',
      source: 'rules',
    };
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

export async function classifyIntent(
  message: string,
): Promise<IntentResult> {
  const ruleResult = applyGenerationNegationGuard(message, classifyIntentByRules(message));
  console.log('[RULE_ROUTER_RESULT]', ruleResult);

  try {
    const openAIResult = applyGenerationNegationGuard(message, await classifyIntentAI(message));
    console.log('[OPENAI_ROUTER_RESULT]', openAIResult);
    console.log('[FINAL_ROUTER_RESULT]', openAIResult);
    if (openAIResult.intent === 'image') {
      console.log('[INTENT_TRACE]', buildFinalImageTrace(message, openAIResult));
    }
    routerStateStore.set(openAIResult);
    return openAIResult;
  } catch (error) {
    console.warn('[OPENAI_ROUTER_FALLBACK_TO_RULES]', error);
    console.log('[OPENAI_ROUTER_RESULT]', {
      result: null,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log('[FINAL_ROUTER_RESULT]', ruleResult);
    if (ruleResult.intent === 'image') {
      console.log('[INTENT_TRACE]', buildFinalImageTrace(message, ruleResult));
    }
    routerStateStore.set(ruleResult);
    return ruleResult;
  }
}

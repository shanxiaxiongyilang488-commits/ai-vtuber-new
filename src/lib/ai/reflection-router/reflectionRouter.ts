import type { ReflectionDecision, ReflectionMode, ReflectionRouterInput } from './types';

const DEEP_TERMS = /(?:なぜ|理由|比較|分析|設計|慎重|じっくり|詳しく|矛盾|検証|どう思う|決めたい|選びたい|将来|実装方針|メリット|デメリット)/u;
const DEEP_TERM_MATCHES = /(?:なぜ|理由|比較|分析|設計|慎重|じっくり|詳しく|矛盾|検証|どう思う|決めたい|選びたい|将来|実装方針|メリット|デメリット)/gu;
const THINK_TERMS = /(?:相談|迷って|悩んで|覚えて|思い出|前に|どうすれば|考えて|判断して|おすすめ)/u;
const MEMORY_TERMS = /(?:覚えて|思い出|前に|以前|記憶|この前|昨日|履歴)/u;
const FAST_TERMS = /(?:すぐ|短く|一言|即答|簡潔に|はいかいいえ)/u;
const LIGHT_TERMS = /^(?:おはよう|こんにちは|こんばんは|ありがとう|了解|わかった|うん|はい|いいえ|ただいま|おやすみ)[！!？?。…\s]*$/u;

const MODE_BUDGETS: Record<ReflectionMode, ReflectionDecision['memoryBudget']> = {
  fast: { shortTermMessages: 4, retrievedMemories: 1 },
  think: { shortTermMessages: 12, retrievedMemories: 3 },
  deep: { shortTermMessages: 24, retrievedMemories: 5 },
};

const MODE_MAX_TOKENS: Record<ReflectionMode, number> = {
  fast: 1536,
  think: 2048,
  deep: 3072,
};

function scoreInput(input: ReflectionRouterInput): number {
  const text = input.text.normalize('NFKC').trim();
  let score = input.tendency === 'quick' ? -1 : input.tendency === 'reflective' ? 1 : 0;

  if (LIGHT_TERMS.test(text) || text.length <= 5) score -= 1;
  if (FAST_TERMS.test(text)) score -= 2;
  if (THINK_TERMS.test(text)) score += 1;
  if (DEEP_TERMS.test(text)) score += 2;
  if ((text.match(DEEP_TERM_MATCHES) ?? []).length >= 2) score += 1;
  if (text.length >= 80) score += 1;
  if (text.length >= 180) score += 1;
  if ((text.match(/[？?]/g) ?? []).length >= 2) score += 1;
  if (text.split(/\r?\n/u).filter(Boolean).length >= 3) score += 1;
  return score;
}

function modeFromScore(score: number): ReflectionMode {
  if (score <= 0) return 'fast';
  if (score <= 2) return 'think';
  return 'deep';
}

export function decideReflection(input: ReflectionRouterInput): ReflectionDecision {
  const mode = modeFromScore(scoreInput(input));
  const wantsMemory = input.memoryEnabled !== false && MEMORY_TERMS.test(input.text);
  const uiState = mode === 'fast'
    ? 'responding'
    : wantsMemory
      ? 'remembering'
      : mode === 'deep'
        ? 'deep-thinking'
        : 'weighing';
  const uiLabel = uiState === 'responding'
    ? 'すぐ答えます'
    : uiState === 'remembering'
      ? '思い出しています'
      : uiState === 'deep-thinking'
        ? '深く考えています'
        : '迷っています';

  return {
    mode,
    uiState,
    uiLabel,
    memoryBudget: MODE_BUDGETS[mode],
    maxTokens: MODE_MAX_TOKENS[mode],
    ...(input.voiceLive && mode === 'think' ? { filler: 'うーん……ちょっと考えるね。' } : {}),
    ...(input.voiceLive && mode === 'deep' ? { filler: 'ちょっと待ってね。ちゃんと考えてみるから。' } : {}),
    backend: 'rules',
  };
}

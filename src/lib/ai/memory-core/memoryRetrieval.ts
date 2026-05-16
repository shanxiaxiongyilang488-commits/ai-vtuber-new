import type { LongTermMemory, MemorySearchInput, MemorySearchResult } from './types';

const TOKEN_RE = /[\p{L}\p{N}_ーぁ-んァ-ヶ一-龠]+/gu;
const JAPANESE_RE = /[ぁ-んァ-ヶ一-龠ー]/u;
const MIN_RELEVANCE_SCORE = 12;

type QueryTerm = {
  text: string;
  weight: number;
};

function tokenize(text: string): string[] {
  return Array.from(new Set((text.toLowerCase().match(TOKEN_RE) ?? []).filter((token) => token.length >= 2)));
}

function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[「」『』"'`]/g, '')
    .replace(/(について|とは|って|ですか|だっけ|教えて|覚えてる|覚えて|知ってる|知って|何|なに|どれ|どんな|は|が|を|に|の)$/u, '')
    .trim();
}

function buildJapaneseNgrams(token: string): QueryTerm[] {
  if (!JAPANESE_RE.test(token) || token.length < 4) return [];

  const terms: QueryTerm[] = [];
  const maxLength = Math.min(12, token.length);
  for (let length = 3; length <= maxLength; length += 1) {
    for (let start = 0; start <= token.length - length; start += 1) {
      const text = normalizeTerm(token.slice(start, start + length));
      if (text.length >= 3) {
        terms.push({ text, weight: Math.min(5, length) });
      }
    }
  }
  return terms;
}

function buildQueryTerms(query: string): QueryTerm[] {
  const terms = new Map<string, number>();

  for (const token of tokenize(query)) {
    const normalized = normalizeTerm(token);
    if (normalized.length >= 2) {
      terms.set(normalized, Math.max(terms.get(normalized) ?? 0, Math.min(6, normalized.length)));
    }

    for (const ngram of buildJapaneseNgrams(token)) {
      terms.set(ngram.text, Math.max(terms.get(ngram.text) ?? 0, ngram.weight));
    }
  }

  return Array.from(terms, ([text, weight]) => ({ text, weight }));
}

function recencyScore(timestamp: string): number {
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return 0;
  const days = Math.max(0, (Date.now() - time) / 86_400_000);
  if (days <= 1) return 2;
  if (days <= 7) return 1.5;
  if (days <= 30) return 1;
  if (days <= 180) return 0.5;
  return 0;
}

function scoreMemory(memory: LongTermMemory, queryTerms: QueryTerm[], characterId?: string): number {
  if (queryTerms.length === 0) return 0;

  const memoryText = `${memory.title} ${memory.content} ${memory.tags.join(' ')}`.toLowerCase();
  const matchedTerms = queryTerms.filter((term) => memoryText.includes(term.text));
  const relevanceScore = matchedTerms.reduce((total, term) => total + term.weight, 0);
  const tagMatches = memory.tags.filter((tag) => queryTerms.some((term) => tag.toLowerCase().includes(term.text))).length;
  const scopeBonus = memory.scope === 'character' && memory.characterId === characterId ? 0.75 : 0;

  if (matchedTerms.length === 0 && tagMatches === 0) {
    return 0;
  }

  return (
    relevanceScore * 2 +
    tagMatches * 3 +
    Math.min(10, Math.max(0, memory.importance)) * 0.25 +
    recencyScore(memory.timestamp) * 0.5 +
    scopeBonus
  );
}

export function searchMemories(input: MemorySearchInput): MemorySearchResult[] {
  const queryTerms = buildQueryTerms(input.query);
  const limit = Math.max(1, Math.min(5, input.limit ?? 5));
  const candidates = [
    ...input.sharedMemories.filter((memory) => memory.scope === 'shared'),
    ...input.characterMemories.filter(
      (memory) => memory.scope === 'character' && (!input.characterId || memory.characterId === input.characterId)
    ),
  ];

  return candidates
    .map((memory) => ({ memory, score: scoreMemory(memory, queryTerms, input.characterId) }))
    .filter((result) => result.score >= MIN_RELEVANCE_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function splitSearchResults(results: MemorySearchResult[]): {
  sharedMemories: LongTermMemory[];
  characterMemories: LongTermMemory[];
} {
  return {
    sharedMemories: results.filter((result) => result.memory.scope === 'shared').map((result) => result.memory),
    characterMemories: results.filter((result) => result.memory.scope === 'character').map((result) => result.memory),
  };
}

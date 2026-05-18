import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyEvolutionRules } from '$lib/ai/personalityEvolution';

type ReflectionMessage = {
  role: 'user' | 'assistant' | 'ai' | 'error';
  text: string;
};

type ReflectionDiary = {
  summary: string;
  learned: string[];
  emotion: string;
  trust_delta: number;
  affection_delta: number;
  note: string;
};

type ReflectionRequest = {
  messages?: ReflectionMessage[];
  emotion?: string;
  trust_delta?: number;
  affection_delta?: number;
  note?: string;
};

const REFLECTION_DIR = join(process.cwd(), 'data', 'reflection');

function ensureReflectionDir(): void {
  if (!existsSync(REFLECTION_DIR)) {
    mkdirSync(REFLECTION_DIR, { recursive: true });
  }
}

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readDiary(fileName: string): ReflectionDiary | null {
  try {
    const parsed = JSON.parse(readFileSync(join(REFLECTION_DIR, fileName), 'utf-8')) as ReflectionDiary;
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      learned: Array.isArray(parsed.learned) ? parsed.learned.filter((item): item is string => typeof item === 'string') : [],
      emotion: typeof parsed.emotion === 'string' ? parsed.emotion : 'neutral',
      trust_delta: Number(parsed.trust_delta) || 0,
      affection_delta: Number(parsed.affection_delta) || 0,
      note: typeof parsed.note === 'string' ? parsed.note : '',
    };
  } catch {
    return null;
  }
}

function extractLearned(messages: ReflectionMessage[]): string[] {
  return messages
    .filter((message) => message.role === 'user')
    .map((message) => message.text.trim())
    .filter((text) => /好き|苦手|嫌い|覚えて|記憶|名前|誕生日|趣味|仕事|目標|予定/u.test(text))
    .map((text) => text.replace(/^(覚えておいて|覚えて|記憶しておいて|記憶して|メモしておいて|メモして)[。、,，.:：\s]*/u, '').trim())
    .filter(Boolean)
    .slice(-8);
}

function buildSummary(messages: ReflectionMessage[]): string {
  const recent = messages
    .filter((message) => message.role !== 'error' && message.text.trim())
    .slice(-8)
    .map((message) => `${message.role === 'user' ? 'User' : 'AI'}: ${message.text.trim()}`);
  if (recent.length === 0) return '会話記録はまだありません。';

  const joined = recent.join(' / ');
  return joined.length > 360 ? `${joined.slice(0, 360)}...` : joined;
}

function latestDiary(): { date: string; diary: ReflectionDiary } | null {
  ensureReflectionDir();
  const files = readdirSync(REFLECTION_DIR)
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/u.test(file))
    .sort();
  const latest = files[files.length - 1];
  if (!latest) return null;
  const diary = readDiary(latest);
  return diary ? { date: latest.replace(/\.json$/u, ''), diary } : null;
}

export const GET: RequestHandler = async () => {
  return json({ reflection: latestDiary() });
};

export const POST: RequestHandler = async ({ request }) => {
  ensureReflectionDir();
  const body = await request.json().catch(() => ({})) as ReflectionRequest;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const fileName = `${todayKey()}.json`;
  const existing = readDiary(fileName);
  const learned = Array.from(new Set([...(existing?.learned ?? []), ...extractLearned(messages)])).slice(-12);

  const diary: ReflectionDiary = {
    summary: buildSummary(messages),
    learned,
    emotion: body.emotion || existing?.emotion || 'neutral',
    trust_delta: (existing?.trust_delta ?? 0) + (Number(body.trust_delta) || 0),
    affection_delta: (existing?.affection_delta ?? 0) + (Number(body.affection_delta) || 0),
    note: body.note || existing?.note || '—',
  };

  writeFileSync(join(REFLECTION_DIR, fileName), JSON.stringify(diary, null, 2), 'utf-8');
  const evolution = applyEvolutionRules({
    emotion: diary.emotion,
    trust_delta: Number(body.trust_delta) || 0,
    affection_delta: Number(body.affection_delta) || 0,
    learned: extractLearned(messages),
    note: diary.note,
  });

  return json({ reflection: { date: todayKey(), diary }, evolution });
};

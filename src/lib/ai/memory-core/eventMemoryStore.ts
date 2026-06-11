import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InternalEvent, InternalEventContext } from './types';

const MEMORY_DIR = join(process.cwd(), 'data', 'memory');
const EVENT_FILE = join(MEMORY_DIR, 'events.json');
const EVENT_LIMIT = 30;

type LegacyMemoryEvent = {
  id?: string;
  with?: string;
  topic?: string;
  activity?: string;
  result?: string;
  emotion?: string;
  timestamp?: string;
  participants?: unknown;
  summary?: string;
  source?: unknown;
  rawPreview?: string;
};

function ensureMemoryDir(): void {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function cleanText(value: string, limit: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizeParticipants(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return Array.from(new Set(values.map((item) => cleanText(String(item), 60)).filter(Boolean))).slice(0, 8);
}

function normalizeSource(value: unknown): InternalEvent['source'] {
  return value === 'vision' || value === 'idea' || value === 'yaml' || value === 'manga'
    ? value
    : 'chat';
}

function normalizeEvent(value: LegacyMemoryEvent): InternalEvent {
  const participants = normalizeParticipants(value.participants);
  if (participants.length === 0 && value.with) participants.push(cleanText(value.with, 60));
  const legacySummary = [value.activity, value.result].filter(Boolean).join('して、');
  return {
    id: value.id || crypto.randomUUID(),
    participants: participants.length > 0 ? participants : ['不明'],
    topic: cleanText(value.topic || '会話', 160),
    summary: cleanText(value.summary || legacySummary || '会話を行った', 240),
    source: normalizeSource(value.source),
    emotion: value.emotion ? cleanText(value.emotion, 100) : undefined,
    rawPreview: value.rawPreview ? cleanText(value.rawPreview, 500) : undefined,
    timestamp: value.timestamp || new Date().toISOString(),
  };
}

export function loadMemoryEvents(limit = 10): InternalEvent[] {
  try {
    if (!existsSync(EVENT_FILE)) return [];
    const parsed = JSON.parse(readFileSync(EVENT_FILE, 'utf-8')) as LegacyMemoryEvent[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEvent)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function saveMemoryEvent(event: InternalEvent): InternalEvent {
  const normalized = normalizeEvent(event);
  const existing = loadMemoryEvents(EVENT_LIMIT);
  const next = [normalized, ...existing.filter((item) => item.id !== normalized.id)].slice(0, EVENT_LIMIT);
  ensureMemoryDir();
  writeFileSync(EVENT_FILE, JSON.stringify(next, null, 2), 'utf-8');
  return normalized;
}

export function createInternalEvent(input: {
  participants: string[];
  topic: string;
  summary: string;
  source: InternalEvent['source'];
  emotion?: string;
  rawPreview?: string;
}): InternalEvent {
  return normalizeEvent({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...input,
  });
}

function inferTopic(userInput: string): string {
  const compact = cleanText(userInput, 160);
  const analysisMatch = compact.match(/^(.+?)(?:を|について)分析/u);
  if (analysisMatch) return `${cleanText(analysisMatch[1], 100)}分析`;
  return compact
    .replace(/(?:してください|してほしい|お願い(?:します)?|教えて(?:ください)?)[。！!]?$/u, '')
    .replace(/[。！!？?]+$/u, '')
    .trim()
    .slice(0, 120);
}

function inferSummary(userInput: string, assistantReply: string): string {
  const compact = assistantReply.replace(/```[\s\S]*?```/g, '構造化データを生成').replace(/\s+/g, ' ').trim();
  const countMatch = compact.match(/([0-9０-９]+)\s*(件|個|つ|選)/u);
  if (countMatch) return `${inferTopic(userInput)}について${countMatch[1]}${countMatch[2]}生成した`;
  if (/YAML|構造化データ/u.test(compact)) return `${inferTopic(userInput)}をYAML化した`;
  if (/画像.*生成|IMAGE GENERATED/iu.test(compact)) return `${inferTopic(userInput)}の画像を生成した`;
  const sentence = compact.split(/[。！？!?]/u).find((part) => part.trim().length >= 4);
  return cleanText(sentence || `${inferTopic(userInput)}について話した`, 180);
}

function inferEmotion(userInput: string, assistantReply: string): string {
  const text = `${userInput}\n${assistantReply}`;
  if (/気になる|分析|調べ|なぜ|どうして|面白/u.test(text)) return 'curiosity +2';
  if (/ありがとう|嬉し|よかった|成功|できた/u.test(text)) return 'joy +2';
  if (/心配|不安|困|失敗/u.test(text)) return 'concern +1';
  if (/怒|ひどい|嫌/u.test(text)) return 'anger +1';
  return 'interest +1';
}

export function createMemoryEventFromTurn(input: {
  characterId?: string;
  characterName?: string;
  userInput: string;
  assistantReply: string;
  context?: InternalEventContext;
}): InternalEvent {
  return normalizeEvent({
    id: crypto.randomUUID(),
    participants: input.context?.participants
      ?? [input.characterName || input.characterId || '不明', 'RootS'],
    topic: input.context?.topic || inferTopic(input.userInput),
    summary: input.context?.summary || inferSummary(input.userInput, input.assistantReply),
    source: input.context?.source || 'chat',
    emotion: input.context?.emotion || inferEmotion(input.userInput, input.assistantReply),
    rawPreview: input.context?.rawPreview || input.userInput,
    timestamp: new Date().toISOString(),
  });
}

export function createVisionInternalEvent(input: {
  participants: string[];
  topic: string;
  internalDialogue: Record<string, string>;
  analysisSummary: string;
  emotion?: string;
}): InternalEvent {
  const dialogueSummary = input.participants
    .map((participant) => {
      const line = input.internalDialogue[participant];
      const statement = cleanText(line, 100).replace(/[。．.!！?？]+$/, '');
      return statement ? `${participant}は${statement}` : '';
    })
    .filter(Boolean)
    .join('。');
  return normalizeEvent({
    id: crypto.randomUUID(),
    participants: input.participants,
    topic: input.topic,
    summary: [dialogueSummary, cleanText(input.analysisSummary, 160)].filter(Boolean).join('。'),
    source: 'vision',
    emotion: input.emotion || 'curiosity +2',
    rawPreview: Object.entries(input.internalDialogue)
      .map(([participant, line]) => `${participant}: ${line}`)
      .join('\n'),
    timestamp: new Date().toISOString(),
  });
}

export function formatMemoryEvents(events: InternalEvent[]): string {
  if (events.length === 0) return 'InternalEventなし';
  return events.map((event) => [
    `- participants: ${event.participants.join(', ')}`,
    `  topic: ${event.topic}`,
    `  summary: ${event.summary}`,
    `  source: ${event.source}`,
    event.emotion ? `  emotion: ${event.emotion}` : '',
    `  timestamp: ${event.timestamp}`,
  ].filter(Boolean).join('\n')).join('\n');
}

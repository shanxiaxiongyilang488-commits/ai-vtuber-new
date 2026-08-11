export interface TimelineEntry {
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  importance: number;
  category?: string;
}

export interface TimelineSummary {
  period: string;
  dateRange: string;
  entries: TimelineEntry[];
  summary: string[];
}

type TimelineSource = { role: 'user' | 'assistant' | 'system'; content: string; timestamp: string };

const EXCLUDED = /^(おはよう|こんにちは|こんばんは|ただいま|おやすみ|元気[？?]?|テスト)[！!？?。\s]*$/u;

function importanceOf(content: string): number {
  if (EXCLUDED.test(content.trim())) return 0.05;
  if (/(yaml|漫画|マンガ|画像|image|gemini|nano|on air|vtuber|設定|プロジェクト|制作|実験)/iu.test(content)) return 0.8;
  return 0.4;
}

function categoryOf(content: string): string {
  if (/(yaml|漫画|マンガ|comic)/iu.test(content)) return '漫画制作';
  if (/(画像|image|生成|ref)/iu.test(content)) return '画像生成';
  if (/(gemini|nano|実験)/iu.test(content)) return 'AI実験';
  if (/(on air|vtuber|配信)/iu.test(content)) return 'AI VTuber研究';
  if (/(設定|キャラ|character)/iu.test(content)) return 'キャラクター設定';
  if (/(コード|実装|修正|テスト|bug)/iu.test(content)) return '開発作業';
  return '会話・作業';
}

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(date);
}

function displayDate(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function toEntries(logs: TimelineSource[]): TimelineEntry[] {
  return logs.flatMap((log): TimelineEntry[] => {
    if (log.role === 'system') return [];
    const importance = importanceOf(log.content);
    if (importance < 0.3) return [];
    return [{ timestamp: log.timestamp, role: log.role, content: log.content, importance, category: categoryOf(log.content) }];
  });
}

function summarize(entries: TimelineEntry[]): string[] {
  return Array.from(new Set(entries.map((entry) => entry.category ?? '会話・作業'))).slice(0, 6);
}

function build(period: string, start: Date, end: Date, logs: TimelineSource[]): TimelineSummary {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const entries = toEntries(logs).filter((entry) => {
    const at = Date.parse(entry.timestamp);
    return Number.isFinite(at) && at >= startMs && at < endMs;
  });
  return { period, dateRange: `${displayDate(start)}〜${displayDate(new Date(endMs - 1))}`, entries, summary: summarize(entries) };
}

function tokyoStart(day: Date): Date {
  const key = dateKey(day);
  return new Date(`${key}T00:00:00+09:00`);
}

export function getTodayTimeline(logs: TimelineSource[], now = new Date()): TimelineSummary {
  const start = tokyoStart(now); const end = new Date(start.getTime() + 86_400_000);
  return build('今日', start, end, logs);
}

export function getYesterdayTimeline(logs: TimelineSource[], now = new Date()): TimelineSummary {
  const end = tokyoStart(now); const start = new Date(end.getTime() - 86_400_000);
  return build('昨日', start, end, logs);
}

export function getThisWeekTimeline(logs: TimelineSource[], now = new Date()): TimelineSummary {
  const today = tokyoStart(now); const offset = (new Date(today.getTime() + 9 * 3_600_000).getUTCDay() + 6) % 7;
  return build('今週', new Date(today.getTime() - offset * 86_400_000), new Date(now.getTime() + 1), logs);
}

export function getLastWeekTimeline(logs: TimelineSource[], now = new Date()): TimelineSummary {
  const end = tokyoStart(now); const offset = (new Date(end.getTime() + 9 * 3_600_000).getUTCDay() + 6) % 7;
  const lastEnd = new Date(end.getTime() - offset * 86_400_000); const start = new Date(lastEnd.getTime() - 7 * 86_400_000);
  return build('先週', start, lastEnd, logs);
}

export function getThisMonthTimeline(logs: TimelineSource[], now = new Date()): TimelineSummary {
  const key = dateKey(now); const start = new Date(`${key.slice(0, 8)}01T00:00:00+09:00`);
  return build('今月', start, new Date(now.getTime() + 1), logs);
}

export function getRecentTimeline(logs: TimelineSource[], now = new Date()): TimelineSummary {
  return build('最近', new Date(now.getTime() - 7 * 86_400_000), new Date(now.getTime() + 1), logs);
}

export function getTimelineForQuery(query: string, logs: TimelineSource[], now = new Date()): TimelineSummary | null {
  if (query.includes('先週')) return getLastWeekTimeline(logs, now);
  if (query.includes('今週')) return getThisWeekTimeline(logs, now);
  if (query.includes('今月')) return getThisMonthTimeline(logs, now);
  if (query.includes('今日')) return getTodayTimeline(logs, now);
  if (query.includes('昨日')) return getYesterdayTimeline(logs, now);
  if (query.includes('最近') || query.includes('振り返り') || query.includes('まとめ') || query.includes('何してた') || query.includes('何やってた')) return getRecentTimeline(logs, now);
  return null;
}

import {
  getThisWeekTimeline,
  getTodayTimeline,
  getYesterdayTimeline,
  type TimelineSummary,
} from './timelineCore';

export interface DailyReport {
  date: string;
  title: string;
  summary: string[];
  keywords: string[];
  mood: 'productive' | 'creative' | 'research' | 'relaxed';
}

function moodFor(keywords: string[]): DailyReport['mood'] {
  if (keywords.some((keyword) => /AI実験|研究/u.test(keyword))) return 'research';
  if (keywords.some((keyword) => /画像生成|漫画制作|キャラクター/u.test(keyword))) return 'creative';
  if (keywords.some((keyword) => /開発/u.test(keyword))) return 'productive';
  return 'relaxed';
}

function titleFor(keywords: string[], mood: DailyReport['mood'], period: string): string {
  if (keywords.includes('AI実験')) return 'AI実験の日';
  if (keywords.includes('画像生成')) return 'ミケと画像生成した日';
  if (keywords.includes('AI VTuber研究')) return 'AI VTuberを整理した日';
  if (keywords.includes('漫画制作')) return '漫画制作を進めた日';
  if (mood === 'productive') return '開発を進めた日';
  return period === '今週' ? '今週のまとめ' : 'ゆっくり話した日';
}

/** Build a report solely from a Timeline Core result; no Memory Core or raw log access. */
export function generateDailyReport(timeline: TimelineSummary): DailyReport {
  const keywords = timeline.summary.slice(0, 6);
  const mood = moodFor(keywords);
  return {
    date: timeline.dateRange,
    title: titleFor(keywords, mood, timeline.period),
    summary: keywords.map((keyword) => `・${keyword}`),
    keywords,
    mood,
  };
}

export function getTodaySummary(logs: Parameters<typeof getTodayTimeline>[0], now = new Date()): DailyReport {
  return generateDailyReport(getTodayTimeline(logs, now));
}

export function getYesterdaySummary(logs: Parameters<typeof getYesterdayTimeline>[0], now = new Date()): DailyReport {
  return generateDailyReport(getYesterdayTimeline(logs, now));
}

export function getWeeklySummary(logs: Parameters<typeof getThisWeekTimeline>[0], now = new Date()): DailyReport {
  return generateDailyReport(getThisWeekTimeline(logs, now));
}

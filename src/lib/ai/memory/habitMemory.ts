const STORAGE_KEY = 'lab-habit';

type HabitCounts = {
  morning:   number;   // 5–10
  noon:      number;   // 11–15
  evening:   number;   // 16–19
  night:     number;   // 20–21
  latenight: number;   // 22–4
};

type TimeBucket = keyof HabitCounts;

const BUCKET_LABELS: Record<TimeBucket, string> = {
  morning: '朝', noon: '昼', evening: '夕方', night: '夜', latenight: '深夜',
};

function getTimeBucket(hour: number): TimeBucket {
  if (hour >= 5  && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'noon';
  if (hour >= 16 && hour < 20) return 'evening';
  if (hour >= 20 && hour < 22) return 'night';
  return 'latenight';
}

function defaultCounts(): HabitCounts {
  return { morning: 0, noon: 0, evening: 0, night: 0, latenight: 0 };
}

function load(): HabitCounts {
  if (typeof localStorage === 'undefined') return defaultCounts();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultCounts(), ...JSON.parse(raw) } : defaultCounts();
  } catch {
    return defaultCounts();
  }
}

function save(counts: HabitCounts): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch { /* fail silently */ }
}

export function recordVisit(now: Date): void {
  const counts = load();
  counts[getTimeBucket(now.getHours())]++;
  save(counts);
}

export function getHabitHint(now: Date): string {
  const counts = load();
  const total  = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < 5) return '';

  const entries = Object.entries(counts) as [TimeBucket, number][];
  const [topBucket, topCount] = entries.reduce((a, b) => b[1] > a[1] ? b : a);
  const ratio = topCount / total;
  if (ratio < 0.4) return '';

  const topLabel     = BUCKET_LABELS[topBucket];
  const currentBucket = getTimeBucket(now.getHours());
  const currentLabel  = BUCKET_LABELS[currentBucket];

  if (currentBucket === topBucket) {
    return `ユーザーはよく${topLabel}に来る習慣があります。「また${topLabel}に来たね」など自然に一言触れてください。`;
  }
  if (ratio >= 0.6) {
    return `ユーザーはいつも${topLabel}に来ますが、今日は${currentLabel}に来ました。「今日は珍しい時間に来たね」と自然に触れてください。`;
  }
  return '';
}

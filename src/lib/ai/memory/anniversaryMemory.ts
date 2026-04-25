const STORAGE_KEY = 'lab-stats';

type Stats = {
  totalTalks: number;
  firstTalkAt: string;
  lastTalkDate: string;
  streakDays: number;
  claimed: string[];
};

const TALKS_MILESTONES  = [10, 50, 100, 300];
const STREAK_MILESTONES = [3, 7, 14, 30];
const DAYS_MILESTONES   = [7, 30, 100, 365];

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultStats(): Stats {
  return { totalTalks: 0, firstTalkAt: new Date().toISOString(), lastTalkDate: '', streakDays: 0, claimed: [] };
}

function load(): Stats {
  if (typeof localStorage === 'undefined') return defaultStats();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultStats(), ...JSON.parse(raw) } : defaultStats();
  } catch {
    return defaultStats();
  }
}

function save(s: Stats): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* fail silently */ }
}

export function recordTalk(): void {
  const stats = load();
  const today = toDateStr(new Date());
  stats.totalTalks++;
  if (stats.lastTalkDate !== today) {
    const yesterday = toDateStr(new Date(Date.now() - 86_400_000));
    stats.streakDays = stats.lastTalkDate === yesterday ? stats.streakDays + 1 : 1;
    stats.lastTalkDate = today;
  }
  save(stats);
}

export function getAnniversaryHint(): string {
  const stats = load();
  const { totalTalks, firstTalkAt, streakDays, claimed } = stats;
  const daysSince = Math.floor((Date.now() - new Date(firstTalkAt).getTime()) / 86_400_000);

  const claim = (key: string, hint: string): string => {
    if (claimed.includes(key)) return '';
    stats.claimed.push(key);
    save(stats);
    return hint;
  };

  for (const n of TALKS_MILESTONES) {
    if (totalTalks >= n) {
      const h = claim(`talks-${n}`, `${n}回会話しました。記念として自然に一言添えてください。例：「${n}回も話してくれたんだね。嬉しい。」`);
      if (h) return h;
    }
  }
  for (const n of STREAK_MILESTONES) {
    if (streakDays >= n) {
      const h = claim(`streak-${n}`, `${n}日連続で話してくれています。連続記念として自然に一言添えてください。例：「${n}日も続けて来てくれてるね。」`);
      if (h) return h;
    }
  }
  for (const n of DAYS_MILESTONES) {
    if (daysSince >= n) {
      const h = claim(`days-${n}`, `出会ってから${n}日が経ちます。記念として自然に一言添えてください。例：「もう${n}日経ったんだね。早いな。」`);
      if (h) return h;
    }
  }
  return '';
}

// ── Daily Mood Drift ──────────────────────────────────────────────
const DRIFT_DATE_KEY = 'lab-drift-date';

export function computeDailyDrift(now: Date): number {
  // 日付シードによる決定論的ベース変動 ±3
  const doy  = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const base = ((doy * 13 + now.getFullYear() * 7) % 7) - 3;

  // 曜日補正: 土日 +2、月 -1
  const dow    = now.getDay();
  const dowMod = (dow === 0 || dow === 6) ? 2 : (dow === 1) ? -1 : 0;

  // 前日の会話量補正: 昨日アクティブ +1 / streak 切れ -2
  const stats     = load();
  const yesterday = toDateStr(new Date(now.getTime() - 86_400_000));
  const activeMod = stats.lastTalkDate === yesterday ? 1
    : (stats.streakDays === 0 && stats.lastTalkDate !== toDateStr(now)) ? -2 : 0;

  return base + dowMod + activeMod;
}

export function shouldApplyDrift(now: Date): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(DRIFT_DATE_KEY) !== toDateStr(now);
}

export function markDriftApplied(now: Date): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(DRIFT_DATE_KEY, toDateStr(now));
}

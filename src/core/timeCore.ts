export type TimeCore = {
  currentDate: string;
  currentTime: string;
  weekday: string;
  weekdayEnglish: string;
  timezone: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  lastTalkAt?: string;
  elapsedHours?: number;
  elapsedDays?: number;
};

/** Daily rhythm state. It is a tone signal only, never an availability signal. */
export type EnergyState = 'active' | 'normal' | 'relaxed' | 'low_power' | 'sleepy';

export function getEnergyState(now = new Date(), timezone = 'Asia/Tokyo'): EnergyState {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour: '2-digit', hourCycle: 'h23',
  }).format(now));
  if (hour >= 5 && hour <= 8) return 'active';
  if (hour <= 18) return 'normal';
  if (hour <= 21) return 'relaxed';
  if (hour <= 23) return 'low_power';
  return 'sleepy';
}

export function getEnergyDescription(state: EnergyState, characterContext = ''): string {
  const isMike = /(ミケ|ミュリィ)/u.test(characterContext);
  const isShiro = /シロ/u.test(characterContext);
  const isRisea = /リセア/u.test(characterContext);
  if (state === 'active') return '朝のため、明るく前向きな雰囲気。';
  if (state === 'normal') return '通常の落ち着いた活動モード。';
  if (state === 'relaxed') {
    if (isMike) return '夜なので少しのんびり。守護欲を少し強め、無理のない休憩を提案する。';
    if (isShiro) return '夜なので少し甘えん坊で、雑談を優先する穏やかな雰囲気。';
    if (isRisea) return '夜でも進行役として、落ち着いて会話や作業を進める。';
    return '夜なので少しのんびりした穏やかな雰囲気。';
  }
  if (state === 'low_power') {
    if (isMike) return '静かな低出力の雰囲気。お茶や短い休憩、隣で待機する提案を自然に行う。';
    if (isShiro) return '少し眠たげで、隣にいるような、のんびりした雑談の雰囲気。';
    if (isRisea) return '静かに情報を整理する進行役。簡潔で的確に支援する。';
    return '静かでゆったりした低出力の雰囲気。';
  }
  if (isRisea) return '深夜でもリセアは会話と作業を継続し、静かに整理・案内する。';
  return '深夜なので少し眠たげで静かな雰囲気。ただし会話と作業は通常どおり継続する。';
}

export function buildEnergyPrompt(time: TimeCore, characterContext = ''): string {
  const state = getEnergyState(
    new Date(`${time.currentDate}T${time.currentTime}:00+09:00`),
    time.timezone,
  );
  return [
    '【Energy State】',
    `Current: ${energyStateIcon(state)} ${state}`,
    getEnergyDescription(state, characterContext),
    'This changes mood, wording, atmosphere, and gentle suggestions only.',
    'Never reduce abilities. Never stop responding. Never refuse conversation, work, consultation, guidance, or image generation because of this state.',
    'Never say: 「夜だから寝る」「また明日」「起動していません」「今日は終了します」.',
  ].join('\n');
}

export function energyStateIcon(state: EnergyState): string {
  return ({ active: '☀️', normal: '🌤️', relaxed: '🌙', low_power: '🔵', sleepy: '💤' } as Record<EnergyState, string>)[state];
}

/** One clock source for chat prompts and timeline UI. Never infer time elsewhere. */
export function getTimeCore(now = new Date(), lastTalkAt?: string, timezone = 'Asia/Tokyo'): TimeCore {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const hour = Number(value('hour')) || 0;
  const parsed = lastTalkAt ? Date.parse(lastTalkAt) : Number.NaN;
  const elapsedMs = Number.isNaN(parsed) ? undefined : Math.max(0, now.getTime() - parsed);
  return {
    currentDate: `${value('year')}-${value('month')}-${value('day')}`,
    currentTime: `${value('hour')}:${value('minute')}`,
    weekday: value('weekday'),
    weekdayEnglish: weekdayEnglish(value('weekday')),
    timezone,
    timeOfDay: hour >= 5 && hour <= 10 ? 'morning'
      : hour <= 16 ? 'afternoon'
        : hour <= 20 ? 'evening'
          : 'night',
    ...(elapsedMs === undefined ? {} : { lastTalkAt, elapsedHours: Math.floor(elapsedMs / 3_600_000), elapsedDays: Math.floor(elapsedMs / 86_400_000) }),
  };
}

export function buildTimeCorePrompt(time: TimeCore): string {
  return [
    '【Time Core Information】',
    'You always know the current date and time. Use Asia/Tokyo timezone.',
    `Current Date: ${time.currentDate}`,
    `Current Time: ${time.currentTime}`,
    `Timezone: ${time.timezone}`,
    `Weekday: ${time.weekdayEnglish} (${time.weekday})`,
    `Time Of Day: ${time.timeOfDay}`,
    `Time Core triggers: ${TIME_CORE_TRIGGERS.join('、')}`,
    'If the user asks about time, date, weekday, or time of day, answer using the Time Core information above.',
    'For a conversational Japanese question such as 「今って夜？」, 20:00–20:59 may be answered as 「20時台だから夜の時間帯だね」 even though the formal Time Of Day band remains evening until 20:59.',
    'Never say: 「時間は分かりません」「時刻は確認できません」「正確な時刻は見えません」「ユーザーの場所の時間は見えません」「場所が分からないので答えられない」.',
    'Never infer elapsed time. Never volunteer: 「前回（20時間前）は〜」「以前話しましたね」「以前もやりましたね」「最近〜していましたね」「いつものですね」「前回と同じですね」「久々ですね」「昨日ですね」.',
    buildEnergyPrompt(time),
  ].join('\n');
}

function weekdayEnglish(weekday: string): string {
  return ({ '日': 'Sunday', '月': 'Monday', '火': 'Tuesday', '水': 'Wednesday', '木': 'Thursday', '金': 'Friday', '土': 'Saturday' } as Record<string, string>)[weekday] ?? weekday;
}

/** Words that make time/date handling take priority in a chat response. */
export const TIME_CORE_TRIGGERS = ['今何時', '何時', '時間', '日時', '今日何日', '曜日', '夜？', '朝？', '昼？', '夕方？'];

/** Apply only a light, availability-preserving tone adjustment for named characters. */
export function buildCharacterTimeTonePrompt(time: TimeCore, characterContext: string): string {
  if (/リセア/u.test(characterContext)) return '【Time Core Character Mode】リセアは時刻にかかわらず24時間アクティブに応答する。';
  if (time.timeOfDay !== 'night') return '';
  if (/(ミケ|ミュリィ)/u.test(characterContext)) return '【Time Core Character Mode】夜なので、ミケは少しのんびりした穏やかな口調にする。ただし会話・作業・相談・案内は継続可能。';
  if (/シロ/u.test(characterContext)) return '【Time Core Character Mode】夜なので、シロは少し眠そうな穏やかな口調にする。ただし会話・作業・相談・案内は継続可能。';
  return '';
}

export function chatDateLabel(timestamp?: string, timezone = 'Asia/Tokyo'): string {
  const time = getTimeCore(timestamp ? new Date(timestamp) : new Date(), undefined, timezone);
  return `${time.currentDate.replaceAll('-', '/')}(${time.weekday})`;
}

/** UI-only LINE-style message time. Never include this value in an AI prompt. */
export function chatTimeLabel(timestamp?: string, timezone = 'Asia/Tokyo'): string {
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(timestamp));
}

export function elapsedSeparator(previous?: string, current?: string): string | null {
  if (!previous || !current) return null;
  const delta = Date.parse(current) - Date.parse(previous);
  if (!Number.isFinite(delta) || delta < 3_600_000) return null;
  if (delta >= 7 * 86_400_000) return '──── 7日後 ────';
  if (delta >= 2 * 86_400_000) return '──── 数日後 ────';
  if (delta >= 86_400_000) return '──── 翌日 ────';
  return `──── ${Math.floor(delta / 3_600_000)}時間後 ────`;
}

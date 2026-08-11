/** Shared activity policy. `sleep` is an exceptional, coordinated state. */
export const CHARACTER_ACTIVITY_STATES = ['active', 'creative', 'relaxed', 'sleepy', 'sleep'] as const;
export type CharacterActivityState = (typeof CHARACTER_ACTIVITY_STATES)[number];
export type ActivityCharacter = 'risea' | 'shiro' | 'mike';

const PRIORITY: ActivityCharacter[] = ['risea', 'shiro', 'mike'];
const SOFT_REST_WORDS = ['眠い', '充電ポッド', 'おやすみ', '休みたい', '待機します'];
const EXPLICIT_SLEEP_WORDS = ['スリープに入って', '睡眠モードに入って'];

export interface ActivityStateInput {
  userText: string;
  currentTheme: 'creative' | 'casual' | 'rest';
  brainEnergy: number;
  hour?: number;
}

/** Time only supports a decision; it never causes sleep on its own. */
export function preferredActivityState(input: ActivityStateInput): CharacterActivityState {
  const text = input.userText ?? '';
  const hour = input.hour ?? new Date().getHours();
  const isLateNight = hour >= 22 || hour < 5;
  const hasSoftRestWord = SOFT_REST_WORDS.some((word) => text.includes(word));
  const hasExplicitSleepRequest = EXPLICIT_SLEEP_WORDS.some((word) => text.includes(word));

  if (hasExplicitSleepRequest && input.currentTheme === 'rest' && input.brainEnergy <= 10 && isLateNight) return 'sleep';
  if (input.currentTheme === 'creative') return 'creative';
  if (input.currentTheme === 'rest' || hasSoftRestWord) return input.brainEnergy <= 25 ? 'sleepy' : 'relaxed';
  return 'active';
}

/** Enforces: Risea stays active; at most one of the remaining roster may sleep. */
export function resolveActivityStates(desired: Partial<Record<ActivityCharacter, CharacterActivityState>>): Record<ActivityCharacter, CharacterActivityState> {
  const states: Record<ActivityCharacter, CharacterActivityState> = {
    risea: desired.risea ?? 'active', shiro: desired.shiro ?? 'active', mike: desired.mike ?? 'active',
  };
  // The priority anchor is always available for conversation, work, advice, or guidance.
  if (states.risea === 'sleep') states.risea = 'active';
  let sleeperKept = false;
  for (const character of PRIORITY.slice(1)) {
    if (states[character] !== 'sleep') continue;
    if (!sleeperKept) sleeperKept = true;
    else states[character] = 'relaxed';
  }
  return states;
}

export const SLEEP_CLOSING_PHRASES = ['今日は寝ます', '今日は休みます', 'また明日まで待機します', 'しばらく眠ります'];
export const RESTING_PHRASING = ['少しのんびりモードに入りますね', '今日は静かに過ごしたい気分です', '隣で待機してますね', '必要になったらいつでも呼んでください'];

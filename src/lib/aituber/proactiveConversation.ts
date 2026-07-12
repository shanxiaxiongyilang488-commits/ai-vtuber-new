import type { CharacterRuntimeSnapshot, ProactiveSettings } from './types.ts';

export type ProactiveSkipReason =
  | 'disabled'
  | 'no_character'
  | 'page_hidden'
  | 'busy'
  | 'idle_delay'
  | 'cooldown'
  | 'hourly_limit'
  | 'awaiting_user';

export interface ProactiveGuardInput {
  runtime: CharacterRuntimeSnapshot;
  settings: ProactiveSettings;
  now: number;
  pageHidden: boolean;
  busy: boolean;
}

export function evaluateProactiveEligibility(input: ProactiveGuardInput): { eligible: boolean; reason?: ProactiveSkipReason } {
  const { runtime, settings, now } = input;
  if (!settings.enabled) return { eligible: false, reason: 'disabled' };
  if (!runtime.characterId) return { eligible: false, reason: 'no_character' };
  if (input.pageHidden && !settings.speakWhenHidden) return { eligible: false, reason: 'page_hidden' };
  if (input.busy || runtime.state !== 'idle') return { eligible: false, reason: 'busy' };
  if (runtime.awaitingUserAfterProactive) return { eligible: false, reason: 'awaiting_user' };
  if (now - runtime.lastUserActivityAt < settings.idleDelayMs) return { eligible: false, reason: 'idle_delay' };
  if (runtime.lastProactiveAt !== null && now - runtime.lastProactiveAt < settings.cooldownMs) return { eligible: false, reason: 'cooldown' };
  if (runtime.proactiveTimestamps.filter((time) => time > now - 3_600_000).length >= settings.maxPerHour) {
    return { eligible: false, reason: 'hourly_limit' };
  }
  return { eligible: true };
}


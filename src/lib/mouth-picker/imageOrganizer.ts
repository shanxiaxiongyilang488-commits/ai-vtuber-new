import type { AutoFrameResult } from './classification.ts';

export type OrganizerEyeState = 'open' | 'closed';
export type OrganizerMouthState = 'closed' | 'half' | 'open';

export interface OrganizerAnalysis {
  eye: OrganizerEyeState;
  mouth: OrganizerMouthState;
  confidence: number;
}

export type OrganizerStateKey = `eye_${'open' | 'close'}_mouth_${'close' | 'half' | 'open'}`;

export const ORGANIZER_STATE_KEYS: readonly OrganizerStateKey[] = [
  'eye_open_mouth_close',
  'eye_open_mouth_half',
  'eye_open_mouth_open',
  'eye_close_mouth_close',
  'eye_close_mouth_half',
  'eye_close_mouth_open',
];

export function organizerAnalysisFromAuto(result: AutoFrameResult): OrganizerAnalysis {
  return {
    eye: result.eyes === 'eyes_closed' ? 'closed' : 'open',
    mouth:
      result.mouth === 'mouth_open'
        ? 'open'
        : result.mouth === 'mouth_half'
          ? 'half'
          : 'closed',
    confidence: Math.max(0, Math.min(1, result.confidence)),
  };
}

export function organizerStateKeyOf(result: Pick<OrganizerAnalysis, 'eye' | 'mouth'>): OrganizerStateKey {
  const eye = result.eye === 'closed' ? 'close' : result.eye;
  return `eye_${eye}_mouth_${result.mouth === 'closed' ? 'close' : result.mouth}`;
}

export function safeCharacterName(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
  return normalized || 'character';
}

export function organizerFilename(characterName: string, result: Pick<OrganizerAnalysis, 'eye' | 'mouth'>): string {
  const eye = result.eye === 'closed' ? 'close' : result.eye;
  const mouth = result.mouth === 'closed' ? 'close' : result.mouth;
  return `${safeCharacterName(characterName)}_eye_${eye}_mouth_${mouth}.png`;
}

export function organizerCoverage(results: readonly OrganizerAnalysis[]): Record<OrganizerStateKey, boolean> {
  const present = new Set(results.map(organizerStateKeyOf));
  return Object.fromEntries(ORGANIZER_STATE_KEYS.map((key) => [key, present.has(key)])) as Record<OrganizerStateKey, boolean>;
}

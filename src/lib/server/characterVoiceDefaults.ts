import { createHash } from 'node:crypto';

export type DefaultCharacterVoiceConfig = {
  engine: string;
  mode: 'design';
  model: string;
  caption: string;
  speed: number;
  autoSpeak: boolean;
};

const DEFAULT_CHARACTER_VOICE_CAPTION = [
  'A clear, warm, natural Japanese character voice recorded dry and close.',
  'Keep one consistent speaker identity across every utterance.',
  'Use friendly conversational pacing and accurate, unhurried pronunciation.',
].join(' ');

/** Default voice used for every newly-created character until it gets a custom clone/design. */
export function createDefaultCharacterVoice(characterId: string): DefaultCharacterVoiceConfig {
  const normalizedId = characterId.trim().toLowerCase() || 'character';
  return {
    engine: 'irodori',
    mode: 'design',
    model: `default-${normalizedId}`,
    caption: DEFAULT_CHARACTER_VOICE_CAPTION,
    speed: 1,
    autoSpeak: true,
  };
}

/** Stable per-character seed keeps generated design voices distinct and repeatable. */
export function stableCharacterVoiceSeed(characterId: string, voiceIdentity = ''): number {
  const digest = createHash('sha256')
    .update(`${characterId.trim().toLowerCase()}\0${voiceIdentity}`)
    .digest();
  return (digest.readUInt32LE(0) & 0x7fffffff) || 1;
}

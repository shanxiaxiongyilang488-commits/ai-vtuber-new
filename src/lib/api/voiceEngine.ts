import type { VoiceEngine } from '$lib/types/character';

export interface IVoiceEngine {
  speak(text: string, characterId: 'char1' | 'char2'): Promise<void>;
  stop(): void;
}

// -------------------------------------------------------------------
// No-op engine
// -------------------------------------------------------------------
export class NoVoiceEngine implements IVoiceEngine {
  async speak(_text: string, _characterId: 'char1' | 'char2'): Promise<void> {
    // intentionally empty
  }
  stop(): void {
    // intentionally empty
  }
}

// -------------------------------------------------------------------
// Factory
// -------------------------------------------------------------------
export function createVoiceEngine(engine: VoiceEngine): IVoiceEngine {
  switch (engine) {
    case 'voicevox':
      console.warn('[VoiceEngine] VoiceVox not yet implemented → silent');
      return new NoVoiceEngine();
    case 'piper':
      console.warn('[VoiceEngine] Piper not yet implemented → silent');
      return new NoVoiceEngine();
    case 'elevenlabs':
      console.warn('[VoiceEngine] ElevenLabs not yet implemented → silent');
      return new NoVoiceEngine();
    case 'none':
    default:
      return new NoVoiceEngine();
  }
}

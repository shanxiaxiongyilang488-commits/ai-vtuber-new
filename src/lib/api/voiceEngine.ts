import type { VoiceEngine } from '$lib/types/character';

export function createVoiceEngine(character: {
  voiceEngine: VoiceEngine;
  voiceId?: string;
  speakerId?: number;
}) {
  const { voiceEngine: engine, voiceId, speakerId } = character;

  return {
    async speak(text: string) {
      if (!text) return;
      if (engine === 'none') return;

      if (engine === 'elevenlabs') {
        try {
          const res = await fetch('/api/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voiceId: voiceId || '' })
          });
          if (!res.ok) { console.error('ElevenLabs failed:', res.status); return; }
          const blob = await res.blob();
          await new Audio(URL.createObjectURL(blob)).play();
        } catch (e) {
          console.error('ElevenLabs error:', e);
        }
        return;
      }

      if (engine === 'voicevox') {
        try {
          const speaker = speakerId ?? 1;
          const queryRes = await fetch(
            `http://localhost:50021/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
            { method: 'POST' }
          );
          if (!queryRes.ok) { console.error('VoiceVox query failed'); return; }
          const query = await queryRes.json();
          const audioRes = await fetch(
            `http://localhost:50021/synthesis?speaker=${speaker}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) }
          );
          if (!audioRes.ok) { console.error('VoiceVox synthesis failed'); return; }
          await new Audio(URL.createObjectURL(await audioRes.blob())).play();
        } catch (e) {
          console.error('VoiceVox error:', e);
        }
        return;
      }
    }
  };
}

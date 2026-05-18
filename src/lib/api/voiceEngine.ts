import type { VoiceEngine } from '$lib/types/character';

/** audio.play() 開始〜終了まで待機し、onStart/onEnd を正確なタイミングで発火する */
function playAudio(
  url: string,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const audio = new Audio(url);
    const finish = () => { onEnd?.(); resolve(); };
    audio.addEventListener('play',   () => onStart?.(), { once: true });
    audio.addEventListener('ended',  finish,            { once: true });
    audio.addEventListener('pause',  finish,            { once: true });
    audio.addEventListener('error',  finish,            { once: true });
    audio.play().catch(finish); // autoplay ブロック等でも onEnd を呼ぶ
  });
}

export function createVoiceEngine(character: {
  voiceEngine: VoiceEngine;
  voice?: string;
  voiceId?: string;
  speakerId?: number;
}) {
  const { voiceEngine: engine, voice, voiceId, speakerId } = character;

  return {
    async speak(
      text: string,
      options?: { onStart?: () => void; onEnd?: () => void },
    ) {
      if (!text) return;
      if (engine === 'none') return;
      const { onStart, onEnd } = options ?? {};

      if (engine === 'elevenlabs') {
        try {
          const res = await fetch('/api/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voiceId: voiceId || '' })
          });
          if (!res.ok) { console.error('ElevenLabs failed:', res.status); return; }
          const url = URL.createObjectURL(await res.blob());
          await playAudio(url, onStart, onEnd);
        } catch (e) {
          console.error('ElevenLabs error:', e);
        }
        return;
      }

      if (engine === 'colab-tts') {
        try {
          const res = await fetch('/api/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              provider: 'colab-tts',
              voice,
              voiceId: voiceId || ''
            })
          });
          if (!res.ok) { console.error('Colab TTS failed:', res.status); return; }
          const url = URL.createObjectURL(await res.blob());
          await playAudio(url, onStart, onEnd);
        } catch (e) {
          console.error('Colab TTS error:', e);
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
          const url = URL.createObjectURL(await audioRes.blob());
          await playAudio(url, onStart, onEnd);
        } catch (e) {
          console.error('VoiceVox error:', e);
        }
        return;
      }
    }
  };
}

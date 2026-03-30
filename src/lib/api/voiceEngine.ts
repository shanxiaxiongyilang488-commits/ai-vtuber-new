export function createVoiceEngine(
  engine: string,
  voiceId?: string,
  speakerId?: number
) {
  return {
    async speak(text: string) {
      if (!text) return;
      if (engine === 'none') return;

      // =========================
      // 🔊 ElevenLabs
      // =========================
      if (engine === 'elevenlabs') {
        try {
          const res = await fetch('/api/speak', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              text,
              voiceId: voiceId || 'EXAVITQu4vr4xnSDxMaL'
            })
          });

          if (!res.ok) {
            console.error('ElevenLabs failed');
            return;
          }

          const blob = await res.blob();
          const url = URL.createObjectURL(blob);

          const audio = new Audio(url);
          await audio.play();
        } catch (e) {
          console.error('ElevenLabs error:', e);
        }
      }

      // =========================
      // 🔊 VoiceVox（ローカル）
      // =========================
      if (engine === 'voicevox') {
        try {
          const speaker = speakerId ?? 1;

          const queryRes = await fetch(
            `http://localhost:50021/audio_query?text=${encodeURIComponent(
              text
            )}&speaker=${speaker}`,
            { method: 'POST' }
          );

          if (!queryRes.ok) {
            console.error('VoiceVox query failed');
            return;
          }

          const query = await queryRes.json();

          const audioRes = await fetch(
            `http://localhost:50021/synthesis?speaker=${speaker}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(query)
            }
          );

          if (!audioRes.ok) {
            console.error('VoiceVox synthesis failed');
            return;
          }

          const blob = await audioRes.blob();
          const url = URL.createObjectURL(blob);

          const audio = new Audio(url);
          await audio.play();
        } catch (e) {
          console.error('VoiceVox error:', e);
        }
      }
    }
  };
}
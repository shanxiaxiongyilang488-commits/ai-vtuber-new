import type { Character } from '$lib/types/character';

export type IrodoriVoiceContext = {
  speaker?: string;
  character?: Pick<Character, 'name' | 'voice' | 'voiceId'> | null;
  voice?: string;
  emotion?: string;
  voiceColorMapping?: unknown;
};

export type IrodoriSpeakOptions = {
  context?: IrodoriVoiceContext;
  onStart?: () => void;
  onEnd?: () => void;
};

type IrodoriSpeakPayload = {
  text: string;
  provider: 'irodori-tts';
  characterName?: string;
  voice: string;
};

function resolveVoice(context?: IrodoriVoiceContext): string {
  return context?.voice || context?.character?.voice || 'none';
}

function buildIrodoriPayload(text: string, context?: IrodoriVoiceContext): IrodoriSpeakPayload {
  return {
    text,
    provider: 'irodori-tts',
    characterName: context?.speaker || context?.character?.name,
    voice: resolveVoice(context),
  };
}

function playAudioBlob(blob: Blob, options?: Pick<IrodoriSpeakOptions, 'onStart' | 'onEnd'>): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      URL.revokeObjectURL(url);
      options?.onEnd?.();
      resolve();
    };

    audio.addEventListener('play', () => options?.onStart?.(), { once: true });
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('pause', finish, { once: true });
    audio.addEventListener('error', finish, { once: true });
    audio.play().catch(finish);
  });
}

export async function speakIrodoriText(text: string, options?: IrodoriSpeakOptions): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const res = await fetch('/api/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildIrodoriPayload(trimmed, options?.context)),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Irodori TTS failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }

  await playAudioBlob(await res.blob(), options);
}

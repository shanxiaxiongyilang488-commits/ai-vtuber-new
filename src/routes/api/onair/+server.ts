import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProviderKey } from '$lib/server/settings';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const message = body.message ?? '';

    const apiKey = await getProviderKey('openai');

    if (!apiKey) {
      return json({ error: 'OpenAI API key が未設定です' }, { status: 500 });
    }

    console.log('[onair] dynamic import start');
    const packageName = '@aituber-onair/core';
    const mod = await import(/* @vite-ignore */ packageName);
    console.log('[onair] mod keys:', Object.keys(mod));
    const { AITuberOnAirCore, AITuberOnAirCoreEvent } = mod;
    console.log('[onair] AITuberOnAirCore:', typeof AITuberOnAirCore, 'Event:', AITuberOnAirCoreEvent);

    const aituber = new AITuberOnAirCore({
      chatProvider: 'openai',
      apiKey,
      model: 'gpt-4o-mini',
      chatOptions: {
        systemPrompt: 'あなたは親しみやすいAI VTuberです。明るく自然に会話してください。',
        responseLength: 'short',
      },
    });
    console.log('[onair] aituber created, calling processChat with:', message);

    const TIMEOUT_MS = 10_000;

    const responsePromise = new Promise<string>((resolve, reject) => {
      aituber.once(AITuberOnAirCoreEvent.ASSISTANT_RESPONSE, (data: any) => {
        console.log('[onair] ASSISTANT_RESPONSE data keys:', Object.keys(data ?? {}));
        console.log('[onair] screenplay:', data?.screenplay);
        const text: string = data.screenplay?.text ?? '';
        if (!text) {
          reject(new Error('No response from OnAir Core'));
        } else {
          resolve(text);
        }
      });
      aituber.once(AITuberOnAirCoreEvent.ERROR, (err: unknown) => {
        console.error('[onair] ERROR event:', err);
        reject(new Error(String(err)));
      });
      aituber.processChat(message);
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('No response from OnAir Core')), TIMEOUT_MS)
    );

    const reply = await Promise.race([responsePromise, timeoutPromise]);

    return json({
      ok: true,
      mode: 'onair-core',
      reply
    });
  } catch (error) {
    console.error('[onair] caught error:', error);
    if (error instanceof Error) {
      console.error('[onair] error.message:', error.message);
      console.error('[onair] error.stack:', error.stack);
    }

    const message_text = error instanceof Error ? error.message : 'OnAir API エラー';
    return json(
      {
        ok: false,
        error: message_text
      },
      { status: 500 }
    );
  }
};

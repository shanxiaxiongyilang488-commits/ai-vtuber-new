import { json } from '@sveltejs/kit';
import { testMiniMaxH3Connection } from '$lib/server/minimaxH3';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    await testMiniMaxH3Connection();
    return json({ ok: true, provider: 'minimax', model: 'MiniMax-H3' });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'MiniMax H3 connection test failed.';
    return json({ ok: false, provider: 'minimax', model: 'MiniMax-H3', message }, { status: 502 });
  }
};

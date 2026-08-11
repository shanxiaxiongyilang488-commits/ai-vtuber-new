import { json } from '@sveltejs/kit';
import {
  answerVoiceSituationQuiz,
  createVoiceSituationQuiz,
  getActiveVoiceSituationQuiz,
} from '$lib/server/voiceSituationQuiz';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const characterId = url.searchParams.get('characterId')?.trim() ?? '';
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });
  return json({ active: getActiveVoiceSituationQuiz(characterId) }, { headers: { 'Cache-Control': 'no-store' } });
};

export const POST: RequestHandler = async ({ request }) => {
  let body: { action?: unknown; characterId?: unknown; answer?: unknown; speechText?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });

  try {
    if (action === 'create') {
      const quiz = createVoiceSituationQuiz(
        characterId,
        typeof body.speechText === 'string' ? body.speechText : undefined,
      );
      return json({ success: true, ...quiz }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (action === 'answer') {
      const result = answerVoiceSituationQuiz(characterId, typeof body.answer === 'string' ? body.answer : '');
      if (!result) return json({ message: 'active voice quiz not found' }, { status: 404 });
      return json({ success: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return json({ message: 'action must be create or answer' }, { status: 400 });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
};

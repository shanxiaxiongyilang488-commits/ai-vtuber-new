import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadRiseaEvolution } from '$lib/ai/personalityEvolution';

export const GET: RequestHandler = async () => {
  return json({ evolution: loadRiseaEvolution() });
};

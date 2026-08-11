import { json, type RequestHandler } from '@sveltejs/kit';
import { readBrainHealth } from '$lib/server/brainProtection';

export const GET: RequestHandler = async () => {
  try {
    return json(readBrainHealth());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

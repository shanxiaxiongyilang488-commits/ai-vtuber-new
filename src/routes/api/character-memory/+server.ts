import { json, type RequestHandler } from '@sveltejs/kit';
import { listMemoryCharacters } from '$lib/server/characterMemory';

export const GET: RequestHandler = async () => {
  try {
    return json({ characters: listMemoryCharacters() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

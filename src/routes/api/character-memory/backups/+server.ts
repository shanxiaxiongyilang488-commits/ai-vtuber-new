import { json, type RequestHandler } from '@sveltejs/kit';
import { listBrainBackups, readBrainHealth } from '$lib/server/brainProtection';

export const GET: RequestHandler = async () => {
  try {
    return json({
      backups: listBrainBackups(),
      health: readBrainHealth(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

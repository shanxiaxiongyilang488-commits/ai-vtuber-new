import { json, type RequestHandler } from '@sveltejs/kit';
import { restoreBrainFromBackup } from '$lib/server/brainProtection';

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const filename = typeof body.filename === 'string'
    ? body.filename.trim()
    : typeof body.backup === 'string'
      ? body.backup.trim()
      : '';
  if (!filename) return json({ message: 'backup filename is required' }, { status: 400 });

  try {
    const health = restoreBrainFromBackup(filename);
    return json({ ok: true, restoredFrom: filename, health, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'backup not found' ? 404 : 400 });
  }
};

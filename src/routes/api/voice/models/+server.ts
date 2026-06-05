import { json } from '@sveltejs/kit';
import { getVoiceModelGroups, resolveIrodoriRoot } from '$lib/server/irodoriModels';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const { env } = await import('$env/dynamic/private');

  return json(
    {
      irodoriRoot: resolveIrodoriRoot(env),
      engines: getVoiceModelGroups(env),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
};

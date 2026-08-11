import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readDailyVideoUsage } from '$lib/server/videoUsage';

export const GET: RequestHandler = async () => json({ usage: await readDailyVideoUsage() }, { headers: { 'Cache-Control': 'no-store' } });

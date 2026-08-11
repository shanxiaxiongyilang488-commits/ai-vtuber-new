import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => json({
  message: 'Reflection/deep reasoning is disabled. Chat continues through the existing AI provider route.',
}, { status: 410 });

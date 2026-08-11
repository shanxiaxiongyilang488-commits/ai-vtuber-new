import { json, type RequestHandler } from '@sveltejs/kit';
import { getRecentTimeline } from '../../../core/timelineCore';
import { loadTimelineMessages } from '$lib/ai/memory-core/shortTermMemory';

export const GET: RequestHandler = () => json({ timeline: getRecentTimeline(loadTimelineMessages()) });

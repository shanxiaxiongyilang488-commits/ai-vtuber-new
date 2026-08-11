import { json, type RequestHandler } from '@sveltejs/kit';
import { getTodaySummary, getWeeklySummary, getYesterdaySummary } from '../../../core/dailyCore';
import { loadTimelineMessages } from '$lib/ai/memory-core/shortTermMemory';

export const GET: RequestHandler = () => {
  const logs = loadTimelineMessages();
  return json({
    today: getTodaySummary(logs),
    yesterday: getYesterdaySummary(logs),
    weekly: getWeeklySummary(logs),
  });
};

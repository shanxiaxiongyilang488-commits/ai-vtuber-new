import fs from 'node:fs/promises';
import path from 'node:path';

export type DailyVideoUsage = { date: string; generationCount: number; estimatedCostUsd: number };
const USAGE_PATH = path.join(process.cwd(), 'data', 'video-usage.json');
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });

export async function readDailyVideoUsage(): Promise<DailyVideoUsage> {
  try {
    const value = JSON.parse(await fs.readFile(USAGE_PATH, 'utf8')) as DailyVideoUsage;
    return value.date === today() ? value : { date: today(), generationCount: 0, estimatedCostUsd: 0 };
  } catch {
    return { date: today(), generationCount: 0, estimatedCostUsd: 0 };
  }
}

export async function recordVideoUsage(estimatedCostUsd: number): Promise<DailyVideoUsage> {
  const current = await readDailyVideoUsage();
  const next = { date: today(), generationCount: current.generationCount + 1, estimatedCostUsd: Number((current.estimatedCostUsd + estimatedCostUsd).toFixed(4)) };
  await fs.mkdir(path.dirname(USAGE_PATH), { recursive: true });
  await fs.writeFile(USAGE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log('[FAL_VIDEO_USAGE]', next);
  return next;
}

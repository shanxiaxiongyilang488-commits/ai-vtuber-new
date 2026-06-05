import fs from 'node:fs/promises';
import path from 'node:path';

type MediaUsageState = {
  imageGenerationCount: number;
  estimatedImageCostTotal: number;
};

const USAGE_PATH = path.join(process.cwd(), 'data', 'media-usage.json');
const DEFAULT_USAGE: MediaUsageState = {
  imageGenerationCount: 0,
  estimatedImageCostTotal: 0,
};

async function readUsage(): Promise<MediaUsageState> {
  try {
    const raw = await fs.readFile(USAGE_PATH, 'utf-8');
    const data = JSON.parse(raw) as Partial<MediaUsageState>;
    return {
      imageGenerationCount: Number.isFinite(data.imageGenerationCount) ? data.imageGenerationCount ?? 0 : 0,
      estimatedImageCostTotal: Number.isFinite(data.estimatedImageCostTotal) ? data.estimatedImageCostTotal ?? 0 : 0,
    };
  } catch {
    return DEFAULT_USAGE;
  }
}

async function writeUsage(usage: MediaUsageState): Promise<void> {
  await fs.mkdir(path.dirname(USAGE_PATH), { recursive: true });
  await fs.writeFile(USAGE_PATH, `${JSON.stringify(usage, null, 2)}\n`, 'utf-8');
}

export async function recordImageGenerationUsage(input: {
  provider: string;
  model: string;
  estimatedCost: number;
}): Promise<MediaUsageState> {
  const current = await readUsage();
  const next = {
    imageGenerationCount: current.imageGenerationCount + 1,
    estimatedImageCostTotal: Number((current.estimatedImageCostTotal + input.estimatedCost).toFixed(6)),
  };
  await writeUsage(next);
  console.log('[IMAGE_COST_ESTIMATE]');
  console.log('provider:', input.provider);
  console.log('model:', input.model);
  console.log('estimated_cost:', `$${input.estimatedCost.toFixed(4)}`);
  console.log('cumulative_generations:', next.imageGenerationCount);
  console.log('estimated_cost_total:', `$${next.estimatedImageCostTotal.toFixed(4)}`);
  return next;
}

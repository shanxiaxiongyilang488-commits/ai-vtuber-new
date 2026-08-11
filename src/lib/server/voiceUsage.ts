import fs from 'node:fs/promises';
import path from 'node:path';
import type { VoiceUsageSummary } from '$lib/voiceDesign';

/**
 * Character Voice Design のコスト・生成量記録。
 * mediaUsage.ts と同じ data/*.json 方式 (media-usage とは別ファイルで独立管理)。
 */

const USAGE_PATH = path.join(process.cwd(), 'data', 'voice-usage.json');

const DEFAULT_USAGE: VoiceUsageSummary = {
	generationCount: 0,
	candidateCount: 0,
	previewCharCount: 0,
	estimatedCostTotalUsd: 0,
};

export async function readVoiceUsage(): Promise<VoiceUsageSummary> {
	try {
		const raw = await fs.readFile(USAGE_PATH, 'utf-8');
		const data = JSON.parse(raw) as Partial<VoiceUsageSummary>;
		return {
			generationCount: Number.isFinite(data.generationCount) ? data.generationCount ?? 0 : 0,
			candidateCount: Number.isFinite(data.candidateCount) ? data.candidateCount ?? 0 : 0,
			previewCharCount: Number.isFinite(data.previewCharCount) ? data.previewCharCount ?? 0 : 0,
			estimatedCostTotalUsd: Number.isFinite(data.estimatedCostTotalUsd) ? data.estimatedCostTotalUsd ?? 0 : 0,
		};
	} catch {
		return { ...DEFAULT_USAGE };
	}
}

export async function recordVoiceUsage(input: {
	provider: string;
	model: string;
	candidates: number;
	previewChars: number;
	estimatedCostUsd: number;
}): Promise<VoiceUsageSummary> {
	const current = await readVoiceUsage();
	const next: VoiceUsageSummary = {
		generationCount: current.generationCount + 1,
		candidateCount: current.candidateCount + input.candidates,
		previewCharCount: current.previewCharCount + input.previewChars,
		estimatedCostTotalUsd: Number((current.estimatedCostTotalUsd + input.estimatedCostUsd).toFixed(6)),
	};
	await fs.mkdir(path.dirname(USAGE_PATH), { recursive: true });
	await fs.writeFile(USAGE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
	console.log('[VOICE_COST_ESTIMATE]', {
		provider: input.provider,
		model: input.model,
		candidates: input.candidates,
		previewChars: input.previewChars,
		estimatedCost: `$${input.estimatedCostUsd.toFixed(5)}`,
		cumulativeGenerations: next.generationCount,
		estimatedCostTotal: `$${next.estimatedCostTotalUsd.toFixed(4)}`,
	});
	return next;
}

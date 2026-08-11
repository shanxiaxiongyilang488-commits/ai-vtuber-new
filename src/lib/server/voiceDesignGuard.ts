import { estimateVoiceDesignCost, isWithinBudget, type VoiceDesignBudget, type VoiceDesignEstimate } from '$lib/voiceDesignCost';
import { readVoiceUsage } from '$lib/server/voiceUsage';
import type { VoiceProviderPricing } from '$lib/server/voiceProviders/types';

/**
 * Voice Design 生成の安全ガード。
 * 1) 生成は既定で無効。env VOICE_DESIGN_ENABLED=1 を設定した場合のみ許可。
 *    (2026-07-11 の $12 課金事故を受けた措置)
 * 2) 累計コスト + 今回推定額が予算上限 (VOICE_DESIGN_BUDGET_USD, 既定 $6.5 ≒ 1000円) を
 *    超える生成はブロックする。
 */

const DEFAULT_BUDGET_USD = 6.5;

export type VoiceDesignGuardResult =
	| { allowed: true; estimate: VoiceDesignEstimate; budget: VoiceDesignBudget; enabled: true }
	| { allowed: false; status: number; message: string; estimate: VoiceDesignEstimate; budget: VoiceDesignBudget; enabled: boolean };

export async function isVoiceDesignEnabled(): Promise<boolean> {
	const { env } = await import('$env/dynamic/private');
	return env.VOICE_DESIGN_ENABLED === '1' || env.VOICE_DESIGN_ENABLED?.toLowerCase() === 'true';
}

export async function resolveVoiceDesignBudget(): Promise<VoiceDesignBudget> {
	const { env } = await import('$env/dynamic/private');
	const fromEnv = Number(env.VOICE_DESIGN_BUDGET_USD ?? '');
	const limitUsd = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_BUDGET_USD;
	const usage = await readVoiceUsage();
	return {
		limitUsd,
		usedUsd: usage.estimatedCostTotalUsd,
		remainingUsd: Number((limitUsd - usage.estimatedCostTotalUsd).toFixed(6)),
	};
}

/** 生成前ガード。allowed=false のときは provider を呼んではならない。 */
export async function guardVoiceDesignGeneration(
	pricing: VoiceProviderPricing,
	previewCharsPerVoice: number,
	voiceCount: number,
): Promise<VoiceDesignGuardResult> {
	const estimate = estimateVoiceDesignCost(pricing, previewCharsPerVoice, voiceCount);
	const budget = await resolveVoiceDesignBudget();
	const enabled = await isVoiceDesignEnabled();
	if (!enabled) {
		return {
			allowed: false,
			status: 403,
			message: 'Voice Design生成は現在無効化されています (env VOICE_DESIGN_ENABLED=1 で有効化)。',
			estimate,
			budget,
			enabled: false,
		};
	}
	if (!isWithinBudget(budget, estimate.totalUsd)) {
		return {
			allowed: false,
			status: 403,
			message: `予算上限を超えるためブロックしました。推定 $${estimate.totalUsd.toFixed(4)} / 残り予算 $${budget.remainingUsd.toFixed(4)} (上限 $${budget.limitUsd})。`,
			estimate,
			budget,
			enabled: true,
		};
	}
	return { allowed: true, estimate, budget, enabled: true };
}

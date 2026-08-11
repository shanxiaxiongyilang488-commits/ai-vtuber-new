import { json, type RequestHandler } from '@sveltejs/kit';
import { estimateVoiceDesignCost, isWithinBudget } from '$lib/voiceDesignCost';
import { getVoiceDesignProvider, listVoiceDesignProviders } from '$lib/server/voiceProviders/registry';
import { isVoiceDesignEnabled, resolveVoiceDesignBudget } from '$lib/server/voiceDesignGuard';

/**
 * 生成前のコスト見積もり (実APIは一切呼ばない)。
 * UIの確認ダイアログ・予算表示・Provider比較に使う。
 * GET /api/voice/estimate?chars=30&count=3[&provider=...]
 */
export const GET: RequestHandler = async ({ url }) => {
	const chars = Math.max(0, Number(url.searchParams.get('chars') ?? '0') || 0);
	const count = Math.max(0, Number(url.searchParams.get('count') ?? '0') || 0);
	const providerName = url.searchParams.get('provider')?.trim() || undefined;

	const provider = await getVoiceDesignProvider(providerName);
	const pricing = provider.getPricing();
	const estimate = estimateVoiceDesignCost(pricing, chars, count);
	const budget = await resolveVoiceDesignBudget();
	const enabled = await isVoiceDesignEnabled();

	const providers = (await listVoiceDesignProviders()).map((item) => {
		const itemPricing = item.getPricing();
		return {
			pricing: itemPricing,
			estimate: estimateVoiceDesignCost(itemPricing, chars, count),
		};
	});

	return json({
		provider: pricing.provider,
		model: pricing.model,
		pricing,
		estimate,
		budget,
		enabled,
		allowed: enabled && isWithinBudget(budget, estimate.totalUsd),
		providers,
		timestamp: new Date().toISOString(),
	}, { headers: { 'Cache-Control': 'no-store' } });
};

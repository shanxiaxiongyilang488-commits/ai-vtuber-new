/** @deprecated VideoStoryCard uses the provider-neutral /api/video FAL router. */
import { error } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';

const VIDU_TEXT_TO_VIDEO_MODEL = 'fal-ai/vidu/q3/text-to-video';
const VIDU_IMAGE_TO_VIDEO_MODEL = 'fal-ai/vidu/q3/image-to-video';

type ViduJob = {
	statusUrl: string;
	responseUrl: string;
};
type ViduDebugMetadata = {
	imageSource?: string;
	messageId?: string;
	referenceImageFileName?: string | null;
};

const jobs = new Map<string, ViduJob>();

function videoUrlFrom(result: unknown): string {
	const data = result as Record<string, any>;
	return String(
		data?.video?.url
		?? data?.videos?.[0]?.url
		?? data?.output?.video?.url
		?? data?.url
		?? '',
	);
}

export async function startViduJob(prompt: string, imageUrl = '', debug: ViduDebugMetadata = {}): Promise<string> {
	const falKey = await getProviderKey('fal');
	if (!falKey) throw error(500, 'FAL API key is not configured');

	const hasImageUrl = Boolean(imageUrl);
	const model = hasImageUrl ? VIDU_IMAGE_TO_VIDEO_MODEL : VIDU_TEXT_TO_VIDEO_MODEL;
	const url = `https://queue.fal.run/${model}`;
	const payload = {
		prompt,
		duration: '5',
		generate_audio: false,
		...(hasImageUrl ? { image_url: imageUrl } : {}),
	};
	console.log('[VIDU_FAL_REQUEST]', {
		model,
		url,
		payload,
		billable: true,
	});
	console.log('[VIDU_FAL_DEBUG]', {
		model,
		imageToVideo: hasImageUrl,
		textToVideo: !hasImageUrl,
		imageUrl,
		imageSource: debug.imageSource ?? '',
		messageId: debug.messageId ?? '',
		referenceImageFileName: debug.referenceImageFileName ?? null,
	});

	const response = await fetch(url, {
		method: 'POST',
		headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
	if (!response.ok) {
		const responseBody = await response.text();
		console.error('[VIDU_FAL_START_ERROR]', { status: response.status, body: responseBody });
		throw error(response.status >= 500 ? 500 : 400, `Vidu FAL API error:\nHTTP: ${response.status}\n\nBody:\n${responseBody}`);
	}

	const queued = await response.json() as { request_id?: string; status_url?: string; response_url?: string };
	if (!queued.request_id || !queued.status_url || !queued.response_url) throw error(500, 'Invalid Vidu queue response');

	jobs.set(queued.request_id, { statusUrl: queued.status_url, responseUrl: queued.response_url });
	console.log('[VIDU_FAL_JOB_STARTED]', { jobId: queued.request_id, billable: true });
	return queued.request_id;
}

export async function getViduJob(jobId: string): Promise<{ status: string; progress: number; url?: string; message?: string }> {
	const job = jobs.get(jobId);
	if (!job) throw error(404, 'Vidu job was not found');
	const falKey = await getProviderKey('fal');
	if (!falKey) throw error(500, 'FAL API key is not configured');

	const statusResponse = await fetch(job.statusUrl, { headers: { Authorization: `Key ${falKey}` } });
	if (!statusResponse.ok) {
		const responseBody = await statusResponse.text();
		console.error('[VIDU_FAL_STATUS_ERROR]', { status: statusResponse.status, body: responseBody });
		throw error(500, `Vidu status error:\nHTTP: ${statusResponse.status}\n\nBody:\n${responseBody}`);
	}
	const statusData = await statusResponse.json() as { status?: string; error?: unknown };
	const status = statusData.status ?? 'IN_PROGRESS';
	if (status === 'FAILED') {
		jobs.delete(jobId);
		throw error(500, `Vidu generation failed: ${JSON.stringify(statusData.error ?? statusData)}`);
	}
	if (status !== 'COMPLETED') return { status, progress: status === 'IN_QUEUE' ? 20 : 60 };

	const resultResponse = await fetch(job.responseUrl, { headers: { Authorization: `Key ${falKey}` } });
	if (!resultResponse.ok) {
		const responseBody = await resultResponse.text();
		console.error('[VIDU_FAL_RESULT_ERROR]', { status: resultResponse.status, body: responseBody });
		throw error(500, `Vidu result error:\nHTTP: ${resultResponse.status}\n\nBody:\n${responseBody}`);
	}
	const url = videoUrlFrom(await resultResponse.json());
	if (!url) throw error(500, 'Vidu completed without a video URL');

	jobs.delete(jobId);
	return { status: 'COMPLETED', progress: 100, url };
}

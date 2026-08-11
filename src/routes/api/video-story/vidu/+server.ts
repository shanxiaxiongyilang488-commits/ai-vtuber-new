import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startViduJob } from '$lib/server/viduJobs';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null) as {
		prompt?: unknown;
		image_url?: unknown;
		image_source?: unknown;
		message_id?: unknown;
		reference_image_file_name?: unknown;
	} | null;
	const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
	if (!prompt) throw error(400, 'Video prompt is required');
	const imageUrl = typeof body?.image_url === 'string' ? body.image_url.trim() : '';
	return json({
		jobId: await startViduJob(prompt, imageUrl, {
			imageSource: typeof body?.image_source === 'string' ? body.image_source : '',
			messageId: typeof body?.message_id === 'string' ? body.message_id : '',
			referenceImageFileName: typeof body?.reference_image_file_name === 'string' ? body.reference_image_file_name : null,
		}),
		status: 'IN_QUEUE',
		progress: 20,
	});
};

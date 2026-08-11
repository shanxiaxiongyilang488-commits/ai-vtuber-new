import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getViduJob } from '$lib/server/viduJobs';

export const GET: RequestHandler = async ({ params }) => json(await getViduJob(params.jobId));

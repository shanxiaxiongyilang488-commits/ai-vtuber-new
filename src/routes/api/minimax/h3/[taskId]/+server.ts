import { json } from '@sveltejs/kit';
import { cancelMiniMaxH3Task, queryMiniMaxH3Task } from '$lib/server/minimaxH3';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    return json(await queryMiniMaxH3Task(params.taskId));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'MiniMax H3 task query failed.';
    return json({ ok: false, message }, { status: 502 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    return json(await cancelMiniMaxH3Task(params.taskId));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'MiniMax H3 task cancellation failed.';
    return json({ ok: false, message }, { status: 502 });
  }
};

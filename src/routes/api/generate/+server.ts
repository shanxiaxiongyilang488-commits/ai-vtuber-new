import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface GenerateRequest {
  prompt:    string;
  dialogue?: string;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  if (!body.prompt?.trim()) throw error(400, 'prompt is required');

  console.log(`[api/generate] prompt="${body.prompt.slice(0, 80)}"`);

  const res = await fetch('http://localhost:5173/api/studio/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ prompt: body.prompt.trim() }),
  });

  const data = await res.json();
  return json({ image: data.url ?? data.image });
};

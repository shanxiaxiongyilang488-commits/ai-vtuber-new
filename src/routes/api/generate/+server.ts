import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface GenerateRequest {
  prompt:   string;
  negative: string;
}

console.log("generate API called");

export const POST: RequestHandler = async ({ request }) => {
  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  if (!body.prompt?.trim()) throw error(400, 'prompt is required');

  console.log(`[api/generate] prompt="${body.prompt.slice(0, 80)}" negative="${body.negative.slice(0, 60)}"`);

  return json({
  image: "https://placehold.co/512x512?text=Generated"
});
};

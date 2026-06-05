import type { RequestHandler } from './$types';
import { POST as generatePost } from '../../generate/+server';

export const POST: RequestHandler = (event) => {
  return generatePost(event as unknown as Parameters<typeof generatePost>[0]);
};

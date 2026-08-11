import { findOutputString, runRunpodInteractive } from '$lib/server/runpodClient';
import { imageUrlForRunpod, persistRunpodVideoBase64 } from '$lib/server/runpodMedia';
import { resolveRunpodH3PodUrl } from '$lib/server/runpodPod';

export type RunpodH3Input = {
  prompt: string;
  duration: number;
  mode: 't2v' | 'i2v' | 'r2v';
  imageUrl?: string;
  imageUrls?: string[];
  aspectRatio?: string;
  seed?: number;
};

export async function generateRunpodH3(
  credentials: { apiKey: string; endpointId: string },
  input: RunpodH3Input,
  requestUrl: URL,
  eventFetch: typeof fetch,
): Promise<{ url: string; jobId?: string; output: unknown }> {
  const imageValues = input.imageUrl
    ? [input.imageUrl]
    : (input.imageUrls ?? []).slice(0, 9);
  const imageUrls = await Promise.all(
    imageValues.map((value) => imageUrlForRunpod(value, requestUrl, eventFetch)),
  );
  const job = await runRunpodInteractive(credentials, {
    task: 'video.generate',
    model: 'MiniMax-H3',
    prompt: input.prompt,
    duration: input.duration,
    mode: input.mode,
    aspectRatio: input.aspectRatio ?? '16:9',
    ...(typeof input.seed === 'number' ? { seed: input.seed } : {}),
    ...(imageUrls.length === 1 ? { imageUrl: imageUrls[0] } : {}),
    ...(imageUrls.length > 1 ? { imageUrls } : {}),
  }, 3 * 60 * 60_000);
  const videoUrl = findOutputString(job.output, ['video_url', 'videoUrl', 'url']);
  const videoBase64 = findOutputString(job.output, ['video_base64', 'videoBase64']);
  const url = videoUrl || (videoBase64 ? await persistRunpodVideoBase64(videoBase64) : '');
  if (!url) throw new Error(`RunPod MiniMax H3 job ${job.id ?? '(unknown)'} completed without video.`);
  return { url, jobId: job.id, output: job.output };
}

export async function generateRunpodPodH3(
  pod: { podId: string; token: string },
  input: RunpodH3Input,
  requestUrl: URL,
  eventFetch: typeof fetch,
): Promise<{ url: string; promptId?: string; output: unknown }> {
  const imageValues = input.imageUrl
    ? [input.imageUrl]
    : (input.imageUrls ?? []).slice(0, 9);
  const imageUrls = await Promise.all(
    imageValues.map((value) => imageUrlForRunpod(value, requestUrl, eventFetch)),
  );
  const baseUrl = resolveRunpodH3PodUrl(pod.podId);
  const response = await fetch(`${baseUrl}/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${pod.token.trim()}`,
    },
    body: JSON.stringify({
      input: {
        task: 'video.generate',
        model: 'MiniMax-H3',
        prompt: input.prompt,
        duration: input.duration,
        mode: input.mode,
        aspectRatio: input.aspectRatio ?? '16:9',
        ...(typeof input.seed === 'number' ? { seed: input.seed } : {}),
        ...(imageUrls.length === 1 ? { imageUrl: imageUrls[0] } : {}),
        ...(imageUrls.length > 1 ? { imageUrls } : {}),
      },
    }),
    signal: AbortSignal.timeout(3 * 60 * 60_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim();
    throw new Error(`RunPod H3 Pod HTTP ${response.status}${detail ? `: ${detail.slice(0, 1000)}` : ''}`);
  }
  const body = await response.json() as { output?: unknown };
  const output = body.output;
  const videoUrl = findOutputString(output, ['video_url', 'videoUrl', 'url']);
  const videoBase64 = findOutputString(output, ['video_base64', 'videoBase64']);
  const url = videoUrl || (videoBase64 ? await persistRunpodVideoBase64(videoBase64) : '');
  if (!url) throw new Error('RunPod MiniMax H3 Pod completed without video.');
  const promptId = findOutputString(output, ['prompt_id', 'promptId']);
  return { url, ...(promptId ? { promptId } : {}), output };
}

export async function warmRunpodH3(
  credentials: { apiKey: string; endpointId: string },
): Promise<{ jobId?: string; output: unknown }> {
  const job = await runRunpodInteractive(credentials, {
    task: 'video.warmup',
    model: 'MiniMax-H3',
    mode: 'r2v',
  }, 15 * 60_000);
  return { jobId: job.id, output: job.output };
}

export async function prepareRunpodH3(
  credentials: { apiKey: string; endpointId: string },
): Promise<{ jobId?: string; output: unknown }> {
  const job = await runRunpodInteractive(credentials, {
    task: 'video.prepare',
    model: 'MiniMax-H3',
    includeRef2va: true,
  }, 3 * 60 * 60_000);
  return { jobId: job.id, output: job.output };
}

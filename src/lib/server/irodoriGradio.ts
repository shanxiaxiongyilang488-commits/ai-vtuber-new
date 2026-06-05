import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export type IrodoriGenerateOptions = {
  text: string;
  outputDir: string;
  publicBasePath: string;
  baseUrl?: string;
  model: string;
  caption?: string;
  voice?: string;
};

type GradioFile = {
  path?: string;
  url?: string;
  orig_name?: string;
  mime_type?: string;
};

function sanitizeText(value: string): string {
  return value.replace(/[\uD800-\uDFFF]/g, '\uFFFD').trim();
}

function resolveBaseUrl(baseUrl?: string): string {
  return (baseUrl || 'http://127.0.0.1:7861').replace(/\/+$/, '');
}

function buildGeneratePayload(text: string, model: string): unknown[] {
  return [
    model,
    'cpu',
    'fp32',
    'cpu',
    'fp32',
    text,
    null,
    null,
    '',
    40,
    1,
    '',
    '',
    1,
    'linear',
    -1,
    'independent',
    3,
    5,
    '',
    0.5,
    1,
    true,
    '',
    '',
    '',
    '',
    '0.9',
    '',
    '',
  ];
}

function buildVoiceDesignPayload(text: string, caption: string, model: string): unknown[] {
  return [
    model,
    'cpu',
    'fp32',
    'cpu',
    'fp32',
    text,
    caption,
    null,
    40,
    1,
    '',
    '',
    1,
    'linear',
    -1,
    'independent',
    3,
    5,
    5,
    '',
    0.5,
    1,
    true,
    '',
    '',
    '',
    '',
    '',
    '0.9',
    '',
  ];
}

function parseSseData(body: string): unknown[] {
  const dataLines = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  for (let i = dataLines.length - 1; i >= 0; i -= 1) {
    const line = dataLines[i];
    if (line === 'null') continue;

    try {
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { data?: unknown[] }).data)) {
        return (parsed as { data: unknown[] }).data;
      }
    } catch {
      // Keep looking for the final JSON data line.
    }
  }

  throw new Error('Irodori Gradio response did not include result data');
}

function findAudioFile(value: unknown): GradioFile | null {
  if (!value) return null;

  if (typeof value === 'object') {
    const candidate = value as GradioFile;
    if (typeof candidate.path === 'string' || typeof candidate.url === 'string') return candidate;

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findAudioFile(item);
        if (found) return found;
      }
    } else {
      for (const item of Object.values(value)) {
        const found = findAudioFile(item);
        if (found) return found;
      }
    }
  }

  return null;
}

async function copyAudioFile(file: GradioFile, outputPath: string, baseUrl: string): Promise<void> {
  if (file.path) {
    await writeFile(outputPath, await readFile(file.path));
    return;
  }

  if (file.url) {
    const url = file.url.startsWith('http') ? file.url : `${baseUrl}${file.url}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`failed to download Irodori audio: HTTP ${res.status}`);
    await writeFile(outputPath, new Uint8Array(await res.arrayBuffer()));
    return;
  }

  throw new Error('Irodori audio file path was not returned');
}

export async function generateIrodoriSample(options: IrodoriGenerateOptions): Promise<{ audioUrl: string }> {
  const text = sanitizeText(options.text);
  if (!text) throw new Error('text is required');
  const model = sanitizeText(options.model);
  if (!model) throw new Error('model is required');
  const caption = sanitizeText(options.caption ?? '');
  const voice = sanitizeText(options.voice ?? '');

  const baseUrl = resolveBaseUrl(options.baseUrl);
  const callUrl = `${baseUrl}/gradio_api/call/_run_generation`;
  const payload = caption
    ? buildVoiceDesignPayload(text, caption, model)
    : buildGeneratePayload(text, model);
  const requestBody = { data: payload };

  console.log('[IRODORI REQUEST]', callUrl);
  console.log('[IRODORI TEXT]', text);
  console.log('[IRODORI CAPTION]', caption);
  console.log('[IRODORI VOICE]', voice);
  console.log('[IRODORI REQUEST JSON]', JSON.stringify(requestBody, null, 2));
  const callRes = await fetch(callUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  console.log('[IRODORI RESPONSE]', callRes.status);

  if (!callRes.ok) {
    const detail = await callRes.text().catch(() => '');
    throw new Error(`Irodori Gradio call failed: HTTP ${callRes.status}${detail ? ` ${detail}` : ''}`);
  }

  const callData = (await callRes.json()) as { event_id?: string };
  if (!callData.event_id) {
    throw new Error('Irodori Gradio did not return event_id');
  }

  const resultUrl = `${baseUrl}/gradio_api/call/_run_generation/${callData.event_id}`;
  console.log('[IRODORI REQUEST]', resultUrl);
  const resultRes = await fetch(resultUrl);
  console.log('[IRODORI RESPONSE]', resultRes.status);
  if (!resultRes.ok) {
    const detail = await resultRes.text().catch(() => '');
    throw new Error(`Irodori Gradio result failed: HTTP ${resultRes.status}${detail ? ` ${detail}` : ''}`);
  }

  const result = parseSseData(await resultRes.text());
  const audioFile = findAudioFile(result);
  if (!audioFile) throw new Error('Irodori Gradio did not return generated audio');

  await mkdir(options.outputDir, { recursive: true });
  const fileName = `${randomUUID()}.wav`;
  const outputPath = path.join(options.outputDir, fileName);
  await copyAudioFile(audioFile, outputPath, baseUrl);

  const outputStat = await stat(outputPath);
  if (outputStat.size === 0) throw new Error('empty wav output');

  return { audioUrl: `${options.publicBasePath.replace(/\/+$/, '')}/${fileName}` };
}

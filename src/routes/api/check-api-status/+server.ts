import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProviderKey, readSettings } from '$lib/server/settings';

type StatusResult =
  | 'OK'
  | 'Missing API Key'
  | 'Unauthorized'
  | 'Quota'
  | 'Error'
  | 'LM Studio Offline'
  | 'Ollama OK'
  | 'Ollama Offline';

async function checkOpenAI(): Promise<StatusResult> {
  const apiKey = await getProviderKey('openai');
  if (!apiKey) return 'Missing API Key';
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401) return 'Unauthorized';
    if (res.status === 429) return 'Quota';
    if (res.ok) return 'OK';
    return 'Error';
  } catch {
    return 'Error';
  }
}

async function checkGemini(): Promise<StatusResult> {
  const apiKey = await getProviderKey('gemini');
  if (!apiKey) return 'Missing API Key';
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (res.status === 400 || res.status === 403) return 'Unauthorized';
    if (res.status === 429) return 'Quota';
    if (res.ok) return 'OK';
    return 'Error';
  } catch {
    return 'Error';
  }
}

async function checkGrok(): Promise<StatusResult> {
  const settings = await readSettings();
  const apiKey = settings.grok.apiKey || await getProviderKey('grok');
  if (!apiKey) return 'Missing API Key';
  try {
    const baseUrl = (settings.grok.baseUrl || 'https://api.x.ai/v1').replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) return 'Unauthorized';
    if (res.status === 429) return 'Quota';
    if (res.ok) return 'OK';
    return 'Error';
  } catch {
    return 'Error';
  }
}

async function checkClaude(): Promise<StatusResult> {
  const apiKey = await getProviderKey('anthropic');
  if (!apiKey) return 'Missing API Key';
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    if (res.status === 401) return 'Unauthorized';
    if (res.status === 429) return 'Quota';
    if (res.ok) return 'OK';
    return 'Error';
  } catch {
    return 'Error';
  }
}

async function checkElevenLabs(): Promise<StatusResult> {
  const apiKey = await getProviderKey('elevenlabs');
  if (!apiKey) return 'Missing API Key';
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': apiKey },
    });
    if (res.status === 401 || res.status === 403) return 'Unauthorized';
    if (res.status === 429) return 'Quota';
    if (res.ok) return 'OK';
    return 'Error';
  } catch {
    return 'Error';
  }
}

async function checkLMStudio(): Promise<StatusResult> {
  try {
    const res = await fetch('http://127.0.0.1:1234/v1/models', {
      headers: { Authorization: 'Bearer lm-studio' },
    });
    return res.ok ? 'OK' : 'LM Studio Offline';
  } catch {
    return 'LM Studio Offline';
  }
}

async function checkOllama(): Promise<StatusResult> {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags');
    return res.ok ? 'Ollama OK' : 'Ollama Offline';
  } catch {
    return 'Ollama Offline';
  }
}

export const GET: RequestHandler = async () => {
  const [openai, grok, gemini, claude, elevenlabs, lmstudio, ollama] = await Promise.all([
    checkOpenAI(),
    checkGrok(),
    checkGemini(),
    checkClaude(),
    checkElevenLabs(),
    checkLMStudio(),
    checkOllama(),
  ]);
  return json({ openai, grok, gemini, claude, anthropic: claude, elevenlabs, lmstudio, ollama });
};

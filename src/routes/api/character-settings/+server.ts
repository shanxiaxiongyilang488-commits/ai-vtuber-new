import { json, type RequestHandler } from '@sveltejs/kit';
import {
  AI_PROVIDERS,
  getCharacterSettings,
  saveCharacterSetting,
} from '$lib/server/characterSettings';

export const GET: RequestHandler = async () => {
  return json({ settings: getCharacterSettings(), providers: AI_PROVIDERS });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const id = String(body?.id ?? '');
    // `provider` is the legacy Brain AI field. New clients may send brainAI
    // inside aiProfile, while old clients continue to send provider only.
    const provider = String(body?.provider ?? body?.aiProfile?.brainAI ?? '');
    const setting = saveCharacterSetting(id, provider, body?.aiProfile);
    return json({ id: id.trim().toLowerCase(), setting });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: 400 });
  }
};

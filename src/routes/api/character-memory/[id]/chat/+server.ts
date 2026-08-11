import { json, type RequestHandler } from '@sveltejs/kit';
import { appendMemoryMessage, clearMemoryMessageProductionState, clearMemoryMessages, updateMemoryMessageText } from '$lib/server/characterMemory';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
    const body = await request.json();
    const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl : '';
    const referenceImages: string[] = Array.isArray(body?.referenceImages)
      ? body.referenceImages.filter((value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())).map((value: string) => value.trim())
      : [];
    if (/data:image\//iu.test(String(body?.text ?? '')) || /data:image\//iu.test(imageUrl) || referenceImages.some((image) => /data:image\//iu.test(image))) {
      return json({ message: 'inline base64 image data is not allowed in chat history' }, { status: 400 });
    }
    if (
      (body?.role !== 'user' && body?.role !== 'assistant')
      || typeof body?.text !== 'string'
      || (!body.text.trim() && !imageUrl.trim() && referenceImages.length === 0)
    ) {
      return json({ message: 'role and text (or imageUrl) are required' }, { status: 400 });
    }
    const entry = appendMemoryMessage(params.id, {
      role: body.role,
      text: body.text,
      imageUrl,
      referenceImages,
      storyCard: body.storyCard,
      videoPackage: body.videoPackage,
      motionPrompt: body.motionPrompt,
      aiModels: body.aiModels,
      voiceDirection: body.voiceDirection,
    });
    return json({ messages: entry.messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

export const DELETE: RequestHandler = async ({ params, url }) => {
  try {
    if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
	if (url.searchParams.get('production') === '1') {
	  const { entry, deleted } = clearMemoryMessageProductionState(params.id);
	  return json({ messages: entry.messages, deleted });
	}
    const entry = clearMemoryMessages(params.id);
	return json({ messages: entry.messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
    const body = await request.json();
    if (typeof body?.messageId !== 'string' || typeof body?.text !== 'string') {
      return json({ message: 'messageId and text are required' }, { status: 400 });
    }
    if (/data:image\//iu.test(body.text)) {
      return json({ message: 'inline base64 image data is not allowed in chat history' }, { status: 400 });
    }
    const referenceImages: string[] | undefined = Array.isArray(body?.referenceImages)
      ? body.referenceImages.filter((value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())).map((value: string) => value.trim())
      : undefined;
    if (referenceImages?.some((image) => /data:image\//iu.test(image))) {
      return json({ message: 'inline base64 image data is not allowed in chat history' }, { status: 400 });
    }
    const entry = updateMemoryMessageText(params.id, body.messageId, body.text, body.storyCard, body.motionPrompt, body.videoPackage, referenceImages);
    return json({ messages: entry.messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' || message === 'message not found' ? 404 : 400 });
  }
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { saveMemoryReviewRecords, type MemoryReviewCandidateInput } from '$lib/server/characterMemory';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function saveComment(saved: Array<{ title: string }>, summary?: string, reflectionComment?: string): string {
  const firstTitle = saved[0]?.title ?? '';
  const seed = `${firstTitle}:${summary ?? ''}:${reflectionComment ?? ''}`.length % 4;
  if (saved.length === 0) return '今回は、覚えるものはありませんでした。';
  if (saved.length === 1) {
    return [
      `「${firstTitle}」のこと、忘れないように記憶しました。`,
      `次に話すとき、「${firstTitle}」の続きから始められそうです。`,
      `これは大事そうなので、「${firstTitle}」として覚えておきますね。`,
      `「${firstTitle}」を、わたしの記憶にしまっておきました。`,
    ][seed];
  }
  return [
    `${saved.length}件、忘れないように記憶しました。次に話すときに役立てます。`,
    `今日の大事なことを${saved.length}件覚えました。続きから話せそうです。`,
    `${saved.length}件を記憶にしまっておきました。ちゃんと次へつなげますね。`,
    `大切そうなことを${saved.length}件、わたしの記憶として残しました。`,
  ][seed];
}

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
  const source = body.source;
  const candidates = Array.isArray(body.candidates)
    ? body.candidates.map(asRecord) as MemoryReviewCandidateInput[]
    : [];
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });
  if (source !== 'memory-review') return json({ message: 'source must be memory-review' }, { status: 400 });
  if (candidates.length === 0) return json({ message: 'candidates are required' }, { status: 400 });

  try {
	const { entry, saved } = saveMemoryReviewRecords(characterId, candidates, body.technicalEvidence);
    const timestamp = new Date().toISOString();
    return json({
      ok: true,
      savedCount: saved.length,
      saved,
      comment: saveComment(
        saved,
        typeof body.summary === 'string' ? body.summary : undefined,
        typeof body.reflectionComment === 'string' ? body.reflectionComment : undefined,
      ),
      timestamp,
      updatedAt: entry.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

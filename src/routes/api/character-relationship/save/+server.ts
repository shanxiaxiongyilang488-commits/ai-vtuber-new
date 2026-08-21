import { json, type RequestHandler } from '@sveltejs/kit';
import { saveRelationshipItems, type RelationshipUpdateInput } from '$lib/server/characterMemory';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function saveComment(saved: Array<{ key: string; value: string }>, summary?: string): string {
  if (saved.length === 0) return '今日は関係性として覚えることはありませんでした。';
  const first = saved[0];
  const seed = `${first.key}:${first.value}:${summary ?? ''}:${saved.length}`.length % 4;
  if (saved.length === 1) {
    return [
      `${first.key}のこと、次に話すときも思い出せるように覚えました。`,
      `${first.value}という理解を、私の中に残しておきます。`,
      `RootSさんのことを少しわかれた気がします。${first.key}、覚えました。`,
      `次の会話で自然につなげられるように、${first.key}を覚えておきます。`,
    ][seed];
  }
  return [
    `${saved.length}件、RootSさんへの理解として覚えました。`,
    `今日わかったことを${saved.length}件、関係性の記憶に残しました。`,
    `次に話すときのために、RootSさんのことを${saved.length}件覚えました。`,
    `少しずつ、RootSさんの大事にしていることが見えてきました。${saved.length}件覚えました。`,
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
  const updates = Array.isArray(body.updates)
    ? body.updates.map(asRecord) as RelationshipUpdateInput[]
    : [];
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });
  if (source !== 'relationship-review') return json({ message: 'source must be relationship-review' }, { status: 400 });
  if (updates.length === 0) return json({ message: 'updates are required' }, { status: 400 });

  try {
    const { entry, saved } = saveRelationshipItems(characterId, updates);
    const timestamp = new Date().toISOString();
    return json({
      ok: true,
      savedCount: saved.length,
      saved,
      comment: saveComment(saved, typeof body.summary === 'string' ? body.summary : undefined),
      timestamp,
      updatedAt: entry.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};

import { json } from '@sveltejs/kit';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_PACKAGE_BYTES = 80 * 1024 * 1024;
const SAFE_MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export async function POST({ request }) {
  try {
    const data = await request.formData();
    const packageFile = data.get('file');
    const requestedName = String(data.get('name') ?? '').trim().replace(/\.purupuru$/i, '');

    if (!(packageFile instanceof File)) {
      return json({ ok: false, error: '.purupuru ファイルが送信されていません。' }, { status: 400 });
    }
    if (!SAFE_MODEL_NAME.test(requestedName)) {
      return json(
        { ok: false, error: 'ファイル名は半角英数字・ハイフン・アンダースコア（64文字以内）で指定してください。' },
        { status: 400 }
      );
    }
    if (packageFile.size === 0 || packageFile.size > MAX_PACKAGE_BYTES) {
      return json({ ok: false, error: '.purupuru ファイルは 1 byte 以上 80 MB 以下にしてください。' }, { status: 400 });
    }

    const bytes = new Uint8Array(await packageFile.arrayBuffer());
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      return json({ ok: false, error: '有効な .purupuru（ZIP）ファイルではありません。' }, { status: 400 });
    }

    const fileName = `${requestedName}.purupuru`;
    const outputDir = path.resolve(process.cwd(), 'static', 'purupuru');
    const outputPath = path.join(outputDir, fileName);
    const publicUrl = `/purupuru/${encodeURIComponent(fileName)}`;

    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, bytes);

    const savedFile = await stat(outputPath);
    if (!savedFile.isFile() || savedFile.size !== bytes.byteLength) {
      throw new Error('保存後のファイル確認に失敗しました。');
    }

    console.info(`[PURUPURU EXPORT]\nsaved:\n${outputPath}\n\npublic url:\n${publicUrl}`);

    return json({
      ok: true,
      exists: true,
      fileName,
      staticPath: `static/purupuru/${fileName}`,
      url: publicUrl,
      size: savedFile.size
    });
  } catch (error) {
    console.error('[PURUPURU_SAVE_FAILED]', error);
    return json(
      { ok: false, error: error instanceof Error ? error.message : '.purupuru の保存に失敗しました。' },
      { status: 500 }
    );
  }
}

import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import type { TagMap, ExportManifest } from '$lib/types/mouth-picker';

export async function POST({ request }) {
  try {
    const body = await request.json();
    const tags: TagMap = body.tags ?? {};

    if (Object.keys(tags).length === 0) {
      return json({ ok: false, error: 'no tags provided' }, { status: 400 });
    }

    const root = process.cwd();
    const framesDir = path.join(root, 'static', 'frames');
    const exportBase = path.join(root, 'static', 'mouth-picker-export');

    const shapes = ['close', 'mid', 'open'] as const;

    // 出力ディレクトリをクリア＆再作成
    for (const shape of shapes) {
      const dir = path.join(exportBase, shape);
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
      }
      fs.mkdirSync(dir, { recursive: true });
    }

    // タグ付きフレームをコピー
    const manifest: Partial<ExportManifest> = {};
    for (const [filename, shape] of Object.entries(tags)) {
      const src = path.join(framesDir, filename);
      if (!fs.existsSync(src)) continue;

      const destDir = path.join(exportBase, shape);
      const destName = shape === 'mid' ? 'mouth_mid.png'
                     : shape === 'open' ? 'mouth_open.png'
                     : 'mouth_close.png';
      const dest = path.join(destDir, destName);
      fs.copyFileSync(src, dest);
      manifest[shape] = `/mouth-picker-export/${shape}/${destName}`;
    }

    // マニフェスト JSON を書き出し（会話UI連携用）
    const manifestPath = path.join(exportBase, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    return json({ ok: true, manifest });

  } catch (e) {
    return json({ ok: false, error: String(e) }, { status: 500 });
  }
}

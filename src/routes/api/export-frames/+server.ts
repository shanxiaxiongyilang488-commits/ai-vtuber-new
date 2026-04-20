import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export async function POST({ request }) {
  try {
    const data = await request.formData();
    const file = data.get('file');

    if (!(file instanceof File)) {
      return json({ ok: false, error: 'file not found' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const root = process.cwd();
    const uploadDir = path.join(root, 'static', 'temp');
    const outputDir = path.join(root, 'static', 'frames');

    fs.mkdirSync(uploadDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    // 古いframesを全削除
    for (const file of fs.readdirSync(outputDir)) {
      fs.unlinkSync(path.join(outputDir, file));
    }

    const inputPath = path.join(uploadDir, file.name);
    fs.writeFileSync(inputPath, buffer);

    const outputPattern = path.join(outputDir, 'frame_%04d.png');

    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-vf', 'fps=30',
        outputPattern
      ]);

      ff.on('close', (code) => {
        if (code === 0) resolve(true);
        else reject(new Error('ffmpeg failed'));
      });
    });

    return json({
      ok: true,
      folder: '/frames/'
    });

  } catch (e) {
    return json({
      ok: false,
      error: String(e)
    }, { status: 500 });
  }
}
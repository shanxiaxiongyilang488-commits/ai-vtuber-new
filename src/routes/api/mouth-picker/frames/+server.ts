import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

export function GET() {
  const framesDir = path.join(process.cwd(), 'static', 'frames');

  try {
    if (!fs.existsSync(framesDir)) {
      return json({ files: [], count: 0 });
    }

    const files = fs.readdirSync(framesDir)
      .filter((f) => f.endsWith('.png'))
      .sort();

    return json({ files, count: files.length });
  } catch (e) {
    return json({ files: [], count: 0, error: String(e) });
  }
}

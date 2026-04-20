import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import path from 'path';

export async function POST() {
  try {
    const root = process.cwd();

    const pyPath = 'python';

    const scriptPath = path.join(root, 'tools', 'pick_mouth.py');

    const result = await new Promise<string>((resolve, reject) => {
      const py = spawn(pyPath, [scriptPath], {
        cwd: root
      });

      let output = '';
      let error = '';

      py.stdout.on('data', (data) => {
        output += data.toString();
      });

      py.stderr.on('data', (data) => {
        error += data.toString();
      });

      py.on('close', (code) => {
        if (code === 0) resolve(output);
        else reject(error);
      });
    });

    const close =
      result.match(/close:\s*(.+)/)?.[1]?.trim() ?? 'not found';

    const mid =
      result.match(/mid\s*:\s*(.+)/)?.[1]?.trim() ?? 'not found';

    const open =
      result.match(/open\s*:\s*(.+)/)?.[1]?.trim() ?? 'not found';

    return json({
      ok: true,
      close,
      mid,
      open
    });
  } catch (e) {
    return json({
      ok: false,
      error: String(e)
    });
  }
}
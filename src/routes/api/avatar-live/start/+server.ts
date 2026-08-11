import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { Socket } from 'node:net';
import { dirname, join } from 'node:path';
import { json, type RequestHandler } from '@sveltejs/kit';

const AVATAR_MODES: Record<string, { script: string; port: number; url: string }> = {
  PNGTuber: { script: 'avatar:pngtuber', port: 5181, url: 'http://127.0.0.1:5181' },
  VRM: { script: 'avatar:vrm', port: 5182, url: 'http://127.0.0.1:5182' },
  Live2D: { script: 'avatar:live2d', port: 5183, url: 'http://127.0.0.1:5183' },
  PuruPuru: { script: 'avatar:purupuru', port: 5184, url: 'http://127.0.0.1:5184' },
  Inochi2D: { script: 'avatar:inochi2d', port: 5185, url: 'http://127.0.0.1:5185' },
};

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    socket.setTimeout(600);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function waitForPort(port: number, timeoutMs = 60000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function startVoiceBridgeIfNeeded(): void {
  const launcher = join(process.cwd(), 'python', 'voice_bridge', 'run_voice_bridge.bat');
  if (!existsSync(launcher)) return;

  const child = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', launcher], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    shell: false,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function resolveNpmRunCommand(script: string): { command: string; args: string[] } {
  if (process.platform !== 'win32') {
    return { command: 'npm', args: ['run', script] };
  }

  const npmCliCandidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const npmCli = npmCliCandidates.find((candidate) => existsSync(candidate));
  if (npmCli) {
    return { command: process.execPath, args: [npmCli, 'run', script] };
  }

  return { command: 'npm.cmd', args: ['run', script] };
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({})) as { mode?: unknown };
    const mode = typeof body.mode === 'string' ? body.mode : '';
    const config = AVATAR_MODES[mode];
    if (!config) return json({ message: 'unknown avatar mode' }, { status: 400 });

    if (!(await isPortOpen(8791))) {
      startVoiceBridgeIfNeeded();
    }

    if (await isPortOpen(config.port)) {
      return json({ ok: true, alreadyRunning: true, url: config.url });
    }

    const logDir = join(process.cwd(), '.avatar-live');
    mkdirSync(logDir, { recursive: true });
    const logFile = join(logDir, `${mode.toLowerCase()}.log`);
    const logStream = createWriteStream(logFile, { flags: 'a' });
    logStream.write(`\n[${new Date().toISOString()}] starting npm run ${config.script}\n`);

    const { command, args } = resolveNpmRunCommand(config.script);
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      detached: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout?.pipe(logStream, { end: false });
    child.stderr?.pipe(logStream, { end: false });
    child.once('error', (error) => {
      logStream.write(`[${new Date().toISOString()}] spawn error: ${error.message}\n`);
    });
    child.once('exit', (code, signal) => {
      logStream.write(`[${new Date().toISOString()}] exited code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
    });
    child.unref();

    if (await waitForPort(config.port)) {
      return json({ ok: true, started: true, ready: true, url: config.url });
    }

    return json(
      {
        message: `${mode} server did not become ready. See ${logFile}`,
        logFile,
      },
      { status: 500 },
    );
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
};

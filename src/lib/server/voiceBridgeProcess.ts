import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_VDC_ROOT = 'E:\\AI\\Voice-Design-Cloner';
const DEFAULT_IRODORI_ROOT = 'E:\\Irodori-TTS\\Irodori-TTS';
const DEFAULT_HF_HOME = 'E:\\huggingface';
const DEFAULT_TEMP_ROOT = 'E:\\TEMP';
const DEFAULT_LOCAL_CACHE_ROOT = 'E:\\AI-Local-Cache';
const DEFAULT_IRODORI_V4_CHECKPOINT =
  'E:\\AI-Local-Models\\Irodori-v4-int8\\model.safetensors';
const DEFAULT_STARTUP_TIMEOUT_MS = 300_000;
const DEFAULT_IDLE_SHUTDOWN_MS = 60_000;

let startupPromise: Promise<void> | null = null;
let managedBridgePid: number | null = null;
let idleShutdownTimer: ReturnType<typeof setTimeout> | null = null;

/** Resolve the local VDC workspace without requiring the lightweight bridge to be running. */
export function resolveVoiceBridgeVdcRoot(
  env: Record<string, string | undefined>,
): string | null {
  const candidate = env.VDC_ROOT?.trim() || DEFAULT_VDC_ROOT;
  return existsSync(path.join(candidate, 'modules', 'model_manager.py')) ? candidate : null;
}

function timeoutMs(env: Record<string, string | undefined>): number {
  const value = Number(env.VOICE_BRIDGE_STARTUP_TIMEOUT_MS ?? '');
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_STARTUP_TIMEOUT_MS;
  return Math.min(600_000, Math.max(30_000, Math.round(value)));
}

function idleShutdownMs(env: Record<string, string | undefined>): number {
  const value = Number(env.VOICE_BRIDGE_IDLE_SHUTDOWN_MS ?? '');
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_IDLE_SHUTDOWN_MS;
  return Math.min(30 * 60_000, Math.max(10_000, Math.round(value)));
}

function cancelIdleShutdown(): void {
  if (!idleShutdownTimer) return;
  clearTimeout(idleShutdownTimer);
  idleShutdownTimer = null;
}

function stopManagedBridge(): void {
  cancelIdleShutdown();
  const pid = managedBridgePid;
  managedBridgePid = null;
  if (!pid) return;

  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    killer.unref();
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // It may already have exited by the time the idle timer fires.
    }
  }
}

async function bridgeIsHealthy(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) return false;
    const data = await response.json() as { status?: unknown };
    return data.status === 'ok';
  } catch {
    return false;
  }
}

function isLocalBridge(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
  } catch {
    return false;
  }
}

function resolvePython(env: Record<string, string | undefined>, vdcRoot: string): string {
  const candidates = [
    env.VOICE_BRIDGE_PYTHON?.trim(),
    path.join(env.IRODORI_ROOT?.trim() || DEFAULT_IRODORI_ROOT, '.venv', 'Scripts', 'python.exe'),
    path.join(vdcRoot, 'venv', 'Scripts', 'python.exe'),
    path.join(vdcRoot, '.venv', 'Scripts', 'python.exe'),
    path.join(homedir(), '.vdc-engines', 'Irodori-TTS', '.venv', 'Scripts', 'python.exe'),
  ].filter((value): value is string => Boolean(value));
  const selected = candidates.find((candidate) => existsSync(candidate));
  if (!selected) {
    throw new Error('ローカル音声エンジン用のPythonが見つかりません。Irodoriのセットアップを確認してください。');
  }
  return selected;
}

function localVoiceEnvironment(
  env: Record<string, string | undefined>,
  vdcRoot: string,
): NodeJS.ProcessEnv {
  const localCacheRoot = env.AI_LOCAL_CACHE_ROOT?.trim() || DEFAULT_LOCAL_CACHE_ROOT;
  const hfHome = env.HF_HOME?.trim() || DEFAULT_HF_HOME;
  const tempRoot = env.AI_VOICE_TEMP_ROOT?.trim() || DEFAULT_TEMP_ROOT;
  const values: NodeJS.ProcessEnv = {
    ...process.env,
    ...env,
    AI_LOCAL_CACHE_ROOT: localCacheRoot,
    AI_VOICE_TEMP_ROOT: tempRoot,
    VDC_ROOT: vdcRoot,
    IRODORI_ROOT: env.IRODORI_ROOT?.trim() || DEFAULT_IRODORI_ROOT,
    IRODORI_V4_CHECKPOINT: env.IRODORI_V4_CHECKPOINT?.trim() || DEFAULT_IRODORI_V4_CHECKPOINT,
    IRODORI_DESIGN_CHECKPOINT: env.IRODORI_DESIGN_CHECKPOINT?.trim() || DEFAULT_IRODORI_V4_CHECKPOINT,
    HF_HOME: hfHome,
    HUGGINGFACE_HUB_CACHE: env.HUGGINGFACE_HUB_CACHE?.trim() || path.join(hfHome, 'hub'),
    TORCH_HOME: env.TORCH_HOME?.trim() || path.join(localCacheRoot, 'torch'),
    XDG_CACHE_HOME: env.XDG_CACHE_HOME?.trim() || path.join(localCacheRoot, 'xdg'),
    PYTHONPYCACHEPREFIX: env.PYTHONPYCACHEPREFIX?.trim() || path.join(localCacheRoot, 'pycache'),
    NUMBA_CACHE_DIR: env.NUMBA_CACHE_DIR?.trim() || path.join(localCacheRoot, 'numba'),
    TRITON_CACHE_DIR: env.TRITON_CACHE_DIR?.trim() || path.join(localCacheRoot, 'triton'),
    CUDA_CACHE_PATH: env.CUDA_CACHE_PATH?.trim() || path.join(localCacheRoot, 'cuda'),
    UV_CACHE_DIR: env.UV_CACHE_DIR?.trim() || path.join(localCacheRoot, 'uv'),
    PIP_CACHE_DIR: env.PIP_CACHE_DIR?.trim() || path.join(localCacheRoot, 'pip'),
    TEMP: tempRoot,
    TMP: tempRoot,
    TMPDIR: tempRoot,
    HF_HUB_OFFLINE: env.HF_HUB_OFFLINE?.trim() || '1',
  };
  for (const dir of [
    localCacheRoot,
    hfHome,
    values.HUGGINGFACE_HUB_CACHE,
    values.TORCH_HOME,
    values.XDG_CACHE_HOME,
    values.PYTHONPYCACHEPREFIX,
    values.NUMBA_CACHE_DIR,
    values.TRITON_CACHE_DIR,
    values.CUDA_CACHE_PATH,
    values.UV_CACHE_DIR,
    values.PIP_CACHE_DIR,
    values.TEMP,
  ]) {
    if (dir) mkdirSync(dir, { recursive: true });
  }
  return values;
}

async function startAndWait(
  baseUrl: string,
  env: Record<string, string | undefined>,
): Promise<void> {
  if (!isLocalBridge(baseUrl)) {
    throw new Error(`Voice Bridgeが停止しています。外部URLは自動起動できません: ${baseUrl}`);
  }

  const vdcRoot = resolveVoiceBridgeVdcRoot(env) ?? (env.VDC_ROOT?.trim() || DEFAULT_VDC_ROOT);
  const serverPath = path.resolve(process.cwd(), 'python', 'voice_bridge', 'server.py');
  const modelManagerPath = path.join(vdcRoot, 'modules', 'model_manager.py');
  if (!existsSync(serverPath)) throw new Error(`Voice Bridgeサーバーが見つかりません: ${serverPath}`);
  if (!existsSync(modelManagerPath)) throw new Error(`Voice-Design-Clonerが見つかりません: ${vdcRoot}`);

  const python = resolvePython(env, vdcRoot);
  const voiceEnv = localVoiceEnvironment(env, vdcRoot);
  const bridgeUrl = new URL(baseUrl);
  const port = bridgeUrl.port || '8791';
  const logDir = path.resolve(process.cwd(), 'data', 'logs');
  mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'voice-bridge.log');
  const logFd = openSync(logPath, 'a');

  let childExited = false;
  let exitCode: number | null = null;
  let spawnError = '';
  try {
    const child = spawn(python, [serverPath], {
      cwd: process.cwd(),
      detached: true,
      windowsHide: true,
      env: { ...voiceEnv, VOICE_BRIDGE_PORT: port },
      stdio: ['ignore', logFd, logFd],
    });
    managedBridgePid = child.pid ?? null;
    child.once('exit', (code) => {
      childExited = true;
      exitCode = code;
      if (managedBridgePid === child.pid) managedBridgePid = null;
    });
    child.once('error', (error) => {
      childExited = true;
      spawnError = error.message;
    });
    child.unref();
  } finally {
    closeSync(logFd);
  }

  const deadline = Date.now() + timeoutMs(env);
  while (Date.now() < deadline) {
    if (await bridgeIsHealthy(baseUrl)) return;
    if (childExited) {
      throw new Error(`ローカル音声エンジンが起動途中で停止しました（${spawnError || `終了コード: ${exitCode ?? '不明'}`}）。ログ: ${logPath}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
  }
  throw new Error(`ローカル音声エンジンの起動が時間内に完了しませんでした。ログ: ${logPath}`);
}

/**
 * Make the local Voice Bridge available before a synthesis request.
 * Concurrent requests share one startup attempt so several buttons cannot
 * accidentally launch several heavyweight model processes.
 */
export async function ensureVoiceBridge(
  baseUrl: string,
  env: Record<string, string | undefined>,
): Promise<void> {
  cancelIdleShutdown();
  if (await bridgeIsHealthy(baseUrl)) return;
  if (!startupPromise) {
    startupPromise = startAndWait(baseUrl, env).finally(() => {
      startupPromise = null;
    });
  }
  await startupPromise;
}

/**
 * Release a bridge started by this app after a short idle window. Cached WAV
 * playback does not need the model, so keeping its ~10 GB commit resident is
 * unnecessary between generations. Manually started bridge processes are not
 * touched because their PID is never registered here.
 */
export function scheduleManagedVoiceBridgeShutdown(
  env: Record<string, string | undefined>,
): void {
  if (!managedBridgePid) return;
  cancelIdleShutdown();
  idleShutdownTimer = setTimeout(stopManagedBridge, idleShutdownMs(env));
  idleShutdownTimer.unref?.();
}

export async function voiceBridgeIsHealthy(baseUrl: string): Promise<boolean> {
  return bridgeIsHealthy(baseUrl);
}

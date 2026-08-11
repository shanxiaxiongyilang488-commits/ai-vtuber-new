import { error, json, type RequestHandler } from '@sveltejs/kit';
import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

type Probe = {
	format?: { duration?: string };
	streams?: Array<{ codec_type?: string; width?: number; height?: number; r_frame_rate?: string }>;
};

function run(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { windowsHide: true });
		let stderr = '';
		child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
		child.on('error', reject);
		child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} failed (${code}): ${stderr.slice(-800)}`)));
	});
}

function runText(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { windowsHide: true });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
		child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
		child.on('error', reject);
		child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`ffprobe failed (${code}): ${stderr.slice(-800)}`)));
	});
}

export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const file = form.get('video');
	const isMp4 = file instanceof File && (/\.mp4$/i.test(file.name) || file.type === 'video/mp4');
	if (!(file instanceof File) || !isMp4) throw error(400, 'MP4ファイルを選択してください。');
	if (file.size > 500 * 1024 * 1024) throw error(413, '動画は500MB以下にしてください。');

	const videoId = `scanner_${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}`;
	const scanDir = path.join(process.cwd(), 'data', 'character_scanner', videoId);
	const frameDir = path.join(process.cwd(), 'data', 'video_frames', videoId);
	const sourcePath = path.join(scanDir, 'source.mp4');
	await Promise.all([mkdir(scanDir, { recursive: true }), mkdir(frameDir, { recursive: true })]);
	await writeFile(sourcePath, Buffer.from(await file.arrayBuffer()));

	try {
		const probe = JSON.parse(await runText('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', sourcePath])) as Probe;
		const video = probe.streams?.find((stream) => stream.codec_type === 'video');
		if (!video) throw new Error('映像ストリームが見つかりません。');
		const duration = Math.max(0, Number.parseFloat(probe.format?.duration ?? '0'));
		const [numerator, denominator] = (video.r_frame_rate ?? '0/1').split('/').map(Number);
		const fps = denominator ? numerator / denominator : 0;
		const framePattern = path.join(frameDir, 'frame_%03d.jpg');

		// Character Scanner contract: exactly one sample per second, capped at 20 saved frames.
		await run('ffmpeg', [
			'-y', '-i', sourcePath,
			'-vf', "fps=1,scale='min(1280,iw)':-2",
			'-frames:v', '20',
			'-q:v', '3',
			framePattern,
		]);
		const frameNames = (await readdir(frameDir)).filter((name) => /^frame_\d{3}\.jpg$/.test(name)).sort().slice(0, 20);
		if (frameNames.length === 0) throw new Error('フレームを抽出できませんでした。');
		const metadata = {
			videoId,
			fileName: file.name,
			duration: Number(duration.toFixed(3)),
			fps: Number(fps.toFixed(3)),
			resolution: `${video.width ?? 0}x${video.height ?? 0}`,
			intervalSeconds: 1,
			frameCount: frameNames.length,
			maxFrames: 20,
		};
		await writeFile(path.join(scanDir, 'manifest.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
		return json({
			ok: true,
			videoId,
			metadata,
			frames: frameNames.map((name, index) => ({
				name,
				second: index,
				url: `/api/video-analysis/${encodeURIComponent(videoId)}/frames/${name}`,
			})),
			frameUrls: frameNames.map((name) => `/api/video-analysis/${encodeURIComponent(videoId)}/frames/${name}`),
		});
	} catch (cause) {
		console.error('[CHARACTER_SCANNER_FFMPEG_ERROR]', cause);
		throw error(500, cause instanceof Error ? cause.message : 'Character Scannerのフレーム抽出に失敗しました。FFmpeg/ffprobeを確認してください。');
	}
};

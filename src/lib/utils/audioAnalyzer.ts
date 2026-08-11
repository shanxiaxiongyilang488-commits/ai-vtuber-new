export type VolumeAnalyzer = {
  start: () => Promise<void>;
  stop: () => void;
  destroy: () => void;
};

export function createVolumeAnalyzer(
  audio: HTMLMediaElement,
  options: { onVolume: (volume: number) => void },
): VolumeAnalyzer {
  let context: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let frame = 0;

  function measure(): void {
    if (!analyser) return;
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const normalized = (sample - 128) / 128;
      sum += normalized * normalized;
    }
    options.onVolume(Math.sqrt(sum / samples.length));
    frame = requestAnimationFrame(measure);
  }

  return {
    async start() {
      if (!context) {
        context = new AudioContext();
        analyser = context.createAnalyser();
        analyser.fftSize = 256;
        source = context.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(context.destination);
      }
      await context.resume();
      cancelAnimationFrame(frame);
      measure();
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      options.onVolume(0);
    },
    destroy() {
      cancelAnimationFrame(frame);
      source?.disconnect();
      analyser?.disconnect();
      void context?.close();
      source = null;
      analyser = null;
      context = null;
    },
  };
}

export type VoiceOutputEffectMode = 'off' | 'android-soft' | 'android-clear';

export interface VoiceOutputEffectPreset {
  mode: VoiceOutputEffectMode;
  label: string;
  description: string;
  dryGain: number;
  wetGain: number;
  bandpassHz: number;
  bandpassQ: number;
  delaySeconds: number;
}

const PRESETS: Record<VoiceOutputEffectMode, VoiceOutputEffectPreset> = {
  off: {
    mode: 'off',
    label: 'OFF',
    description: '加工せず原音のまま再生します',
    dryGain: 1,
    wetGain: 0,
    bandpassHz: 0,
    bandpassQ: 0,
    delaySeconds: 0,
  },
  'android-soft': {
    mode: 'android-soft',
    label: 'やさしい',
    description: '原音を保ったまま、ごく薄いデジタル感を加えます',
    dryGain: 0.96,
    wetGain: 0.07,
    bandpassHz: 2_600,
    bandpassQ: 0.72,
    delaySeconds: 0.011,
  },
  'android-clear': {
    mode: 'android-clear',
    label: 'くっきり',
    description: '短い帯域反射音を少し強め、アンドロイド感を明確にします',
    dryGain: 0.9,
    wetGain: 0.14,
    bandpassHz: 2_100,
    bandpassQ: 0.82,
    delaySeconds: 0.018,
  },
};

const MODE_ORDER: VoiceOutputEffectMode[] = ['off', 'android-soft', 'android-clear'];

export function getVoiceOutputEffectPreset(mode: VoiceOutputEffectMode): VoiceOutputEffectPreset {
  return PRESETS[mode];
}

export function parseVoiceOutputEffectMode(value: unknown): VoiceOutputEffectMode {
  return typeof value === 'string' && MODE_ORDER.includes(value as VoiceOutputEffectMode)
    ? value as VoiceOutputEffectMode
    : 'off';
}

export function nextVoiceOutputEffectMode(mode: VoiceOutputEffectMode): VoiceOutputEffectMode {
  return MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
}

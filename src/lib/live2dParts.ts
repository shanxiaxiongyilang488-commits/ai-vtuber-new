export type Live2DPartState = {
  detected: boolean;
  status?: 'missing' | 'candidate' | 'ready';
  bbox?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  assetPath?: string;
  note?: string;
};

export type Live2DPartsData = {
  character: {
    id: string;
  };
  sourceImage?: {
    fileName: string;
    mimeType: string;
    dataUrl: string;
    uploadedAt: string;
  };
  analyzedAt: string;
  parts: {
    face: Live2DPartState;
    hair: {
      front: Live2DPartState;
      side: Live2DPartState;
      back: Live2DPartState;
    };
    eyes: {
      left: Live2DPartState;
      right: Live2DPartState;
    };
    mouth: {
      closed: Live2DPartState;
      open: Live2DPartState;
    };
    eyebrows: {
      left: Live2DPartState;
      right: Live2DPartState;
    };
    body: Live2DPartState;
    accessories: {
      detected: boolean;
      items: string[];
      itemStates?: Record<string, Live2DPartState>;
    };
  };
};

export function createInitialLive2DParts(characterId: string): Live2DPartsData {
  const detected = { detected: true };
  return {
    character: { id: characterId },
    analyzedAt: new Date().toISOString(),
    parts: {
      face: detected,
      hair: {
        front: detected,
        side: detected,
        back: detected,
      },
      eyes: {
        left: detected,
        right: detected,
      },
      mouth: {
        closed: detected,
        open: { detected: false },
      },
      eyebrows: {
        left: detected,
        right: detected,
      },
      body: detected,
      accessories: {
        detected: true,
        items: ['メカ耳', '尻尾'],
        itemStates: {
          メカ耳: detected,
          尻尾: detected,
        },
      },
    },
  };
}

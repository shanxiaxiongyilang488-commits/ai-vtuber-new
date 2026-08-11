/*
 * MediaPipe Face Landmarker のブラウザ専用ラッパー。
 * wasm/モデルは static/mediapipe/ から読む(オフラインで動作)。
 * 判定ロジック本体は classification.ts(純粋関数)側。
 */
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { classifyBlendshapes, NO_FACE_RESULT } from './classification.ts';
import type { AutoFrameResult } from './classification.ts';

const ASSET_BASE = '/mediapipe';
const MODEL_URL = `${ASSET_BASE}/face_landmarker.task`;

type DetectInput = Parameters<FaceLandmarker['detect']>[0];

export class FaceAutoClassifier {
  private landmarker: FaceLandmarker | null = null;

  async init(): Promise<void> {
    if (this.landmarker) return;
    if (typeof window === 'undefined') throw new Error('自動分類はブラウザでのみ実行できます。');
    const fileset = await FilesetResolver.forVisionTasks(ASSET_BASE);
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
  }

  classify(image: DetectInput): AutoFrameResult {
    if (!this.landmarker) throw new Error('FaceAutoClassifier.init() を先に呼んでください。');
    const detection = this.landmarker.detect(image);
    const categories = detection.faceBlendshapes?.[0]?.categories;
    if (!categories?.length) return { ...NO_FACE_RESULT };
    const scores: Record<string, number> = {};
    for (const category of categories) scores[category.categoryName] = category.score;
    return classifyBlendshapes(scores);
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}

import { LabPoint, MSTTier, UndertoneClass } from "../types";

/** sRGB → CIE L*a*b* (D65 illuminant) — IEC 61966-2-1 / ISO 11664-3 */
export function srgbToLab(r255: number, g255: number, b255: number): LabPoint {
  const linearise = (c: number): number => {
    const n = c / 255;
    return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  const rL = linearise(r255);
  const gL = linearise(g255);
  const bL = linearise(b255);

  // sRGB → XYZ (D65 illuminant matrix)
  const X = rL * 0.4124564 + gL * 0.3575761 + bL * 0.1804375;
  const Y = rL * 0.2126729 + gL * 0.7151522 + bL * 0.0721750;
  const Z = rL * 0.0193339 + gL * 0.1191920 + bL * 0.9503041;

  const f = (t: number) =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

  const fx = f(X / 0.95047);
  const fy = f(Y / 1.00000);
  const fz = f(Z / 1.08883);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** L* value → Monk Skin Tone tier (1 = lightest, 10 = deepest) */
export function labToMST(lab: LabPoint): MSTTier {
  const { L } = lab;
  if (L > 88) return 1;
  if (L > 80) return 2;
  if (L > 72) return 3;
  if (L > 64) return 4;
  if (L > 56) return 5;
  if (L > 48) return 6;
  if (L > 40) return 7;
  if (L > 32) return 8;
  if (L > 24) return 9;
  return 10;
}

/** a*, b* axes → undertone class + unit vector [warm, cool, olive] */
export function labToUndertone(lab: LabPoint): {
  cls: UndertoneClass;
  vector: [number, number, number];
} {
  const { a, b } = lab;
  const warm  = Math.max(0, b / 30);
  const cool  = Math.max(0, -a / 20);
  const olive = Math.max(0, (b - a * 0.5) / 25);
  const total = warm + cool + olive + 0.001;
  const vec: [number, number, number] = [warm / total, cool / total, olive / total];

  let cls: UndertoneClass = "neutral";
  if (vec[0] > 0.55)      cls = b > 18 ? "golden_warm" : "warm";
  else if (vec[1] > 0.55) cls = a < -5 ? "pink_cool"   : "cool";
  else if (vec[2] > 0.45) cls = "olive";

  return { cls, vector: vec };
}

export interface ColorAnalysisResult {
  skinLab: LabPoint;
  mstTier: MSTTier;
  undertoneClass: UndertoneClass;
  undertoneVector: [number, number, number];
}

/**
 * Samples bilateral cheek zones across sampleFrames video frames,
 * then returns the median Lab — robust against blink / motion artefacts.
 */
export async function extractSkinColor(
  videoElement: HTMLVideoElement,
  sampleFrames = 15
): Promise<ColorAnalysisResult> {
  const canvas = document.createElement("canvas");
  canvas.width  = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext("2d")!;
  const labSamples: LabPoint[] = [];

  for (let i = 0; i < sampleFrames; i++) {
    await new Promise<void>((res) => setTimeout(res, 400));
    ctx.drawImage(videoElement, 0, 0);

    // Left cheek and right cheek zones (avoids nose specular highlight)
    const regions = [
      ctx.getImageData(canvas.width * 0.2, canvas.height * 0.4, 40, 40),
      ctx.getImageData(canvas.width * 0.6, canvas.height * 0.4, 40, 40),
    ];

    for (const region of regions) {
      const d = region.data;
      let R = 0, G = 0, B = 0, count = 0;
      for (let j = 0; j < d.length; j += 4) {
        R += d[j]; G += d[j + 1]; B += d[j + 2]; count++;
      }
      labSamples.push(srgbToLab(R / count, G / count, B / count));
    }
  }

  const median = (vals: number[]) =>
    vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)];

  const skinLab: LabPoint = {
    L: median(labSamples.map((l) => l.L)),
    a: median(labSamples.map((l) => l.a)),
    b: median(labSamples.map((l) => l.b)),
  };

  const mstTier = labToMST(skinLab);
  const { cls: undertoneClass, vector: undertoneVector } = labToUndertone(skinLab);

  return { skinLab, mstTier, undertoneClass, undertoneVector };
}

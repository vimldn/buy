export type MSTTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type UndertoneClass =
  | "warm"
  | "cool"
  | "neutral"
  | "olive"
  | "pink_cool"
  | "golden_warm";

export interface LabPoint {
  L: number;
  a: number;
  b: number;
}

export interface OxidationProfile {
  fresh: LabPoint;
  oxidized: LabPoint;
  oxidation_delta_e?: number;
}

export interface ShadeResult {
  colorMetricId: string;
  sku: string;
  brand: string;
  productName: string;
  shadeName: string;
  finish: string;
  coverage: string;
  oxidation: OxidationProfile;
  mstTier: MSTTier;
  undertoneClass: UndertoneClass;
  affiliateUrl: string;
  imageUrl: string;
  deltaEFresh: number;
  deltaEOxidized: number;
  deltaEWear: number;
  undertoneScore: number;
  confidencePct: number;
  explanation: string;
}

export interface ScanState {
  status:
    | "idle"
    | "requesting_camera"
    | "scanning"
    | "analysing"
    | "complete"
    | "error";
  liqaPass: boolean;
  lightingScore: number;
  positionScore: number;
  shadowWarning: boolean;
  skinLab?: LabPoint;
  mstDetected?: MSTTier;
  undertoneDetected?: UndertoneClass;
  undertoneVector?: [number, number, number];
  errorMessage?: string;
}

export type FunnelTier = "text" | "ai" | "vto";

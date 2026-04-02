import React from "react";
import { ScanState } from "../types";

interface Props {
  lightingScore: number;
  positionScore: number;
  shadowWarning: boolean;
  liqaPass: boolean;
  scanProgress: number;
  status: ScanState["status"];
}

function GuidanceIndicator({
  label, score, warn,
}: { label: string; score: number; warn?: boolean }) {
  const pct   = Math.round(score * 100);
  const color = warn || pct < 50
    ? "bg-red-500"
    : pct < 80
    ? "bg-amber-400"
    : "bg-emerald-400";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs font-mono text-white/80">
        <span>{label}</span>
        <span>{warn ? "⚠" : `${pct}%`}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function AIScannerOverlay({
  lightingScore, positionScore, shadowWarning, liqaPass, scanProgress, status,
}: Props) {
  const guidanceMessage = shadowWarning
    ? "Move away from direct shadows"
    : lightingScore < 0.5
    ? "Find brighter, even lighting"
    : positionScore < 0.7
    ? "Centre your face in the oval"
    : liqaPass
    ? "Hold still — scanning…"
    : "Adjusting…";

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between p-6 pointer-events-none">
      {/* Face guide oval */}
      <div
        className="absolute top-[12%] left-1/2 -translate-x-1/2 rounded-full border-4 transition-colors duration-500"
        style={{
          width: "52%", height: "60%",
          borderColor: liqaPass ? "#4ade80" : shadowWarning ? "#f87171" : "#fbbf24",
          boxShadow: liqaPass
            ? "0 0 0 4px rgba(74,222,128,0.25)"
            : "0 0 0 4px rgba(251,191,36,0.25)",
        }}
      />

      <div className="relative z-10 bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2 mt-2">
        <p className="text-white text-sm font-medium text-center tracking-wide">
          {guidanceMessage}
        </p>
      </div>

      <div className="relative z-10 w-full max-w-xs bg-black/60 backdrop-blur-sm rounded-2xl p-4 flex flex-col gap-3">
        <GuidanceIndicator label="Lighting"    score={lightingScore} />
        <GuidanceIndicator label="Position"    score={positionScore} />
        <GuidanceIndicator label="Shadow-free" score={shadowWarning ? 0.1 : 1} warn={shadowWarning} />

        {status === "scanning" && (
          <div className="mt-1">
            <div className="flex justify-between text-xs text-white/60 mb-1">
              <span>Analysing 10-second scan</span>
              <span>{scanProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-pink-400 transition-all duration-500"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {liqaPass && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full px-2 py-0.5 font-mono">
              ✓ LIQA PASS
            </span>
          )}
          <span className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5 font-mono">
            D65 Normalising
          </span>
        </div>
      </div>
    </div>
  );
}

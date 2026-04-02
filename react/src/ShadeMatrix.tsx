import React, { useRef, useState, useCallback, useEffect } from "react";
import { ScanState, ShadeResult, FunnelTier } from "./types";
import { useLIQA } from "./hooks/useLIQA";
import { extractSkinColor } from "./hooks/useColorAnalysis";
import { AIScannerOverlay } from "./components/AIScannerOverlay";
import { MatchCard } from "./components/MatchCard";
import { TierSelector } from "./components/TierSelector";

export default function ShadeMatrix() {
  const [tier, setTier]             = useState<FunnelTier>("ai");
  const [scanState, setScanState]   = useState<ScanState>({
    status: "idle", liqaPass: false, lightingScore: 0,
    positionScore: 0, shadowWarning: false,
  });
  const [matches, setMatches]         = useState<ShadeResult[]>([]);
  const [scanProgress, setScanProgress] = useState(0);
  const [textQuery, setTextQuery]     = useState("");

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { liqaResult, startAnalysis, stopAnalysis } = useLIQA(videoRef);

  // Pipe LIQA result into scan state on every frame
  useEffect(() => {
    if (scanState.status === "scanning") {
      setScanState((prev) => ({
        ...prev,
        liqaPass:      liqaResult.pass,
        lightingScore: liqaResult.lightingScore,
        positionScore: liqaResult.positionScore,
        shadowWarning: liqaResult.shadowWarning,
      }));
    }
  }, [liqaResult, scanState.status]);

  const doAnalysis = useCallback(async () => {
    setScanState((s) => ({ ...s, status: "analysing" }));
    try {
      const result = await extractSkinColor(videoRef.current!, 15);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setScanState((s) => ({
        ...s, status: "complete",
        skinLab:           result.skinLab,
        mstDetected:       result.mstTier,
        undertoneDetected: result.undertoneClass,
        undertoneVector:   result.undertoneVector,
      }));
      // POST to /api/match — wire up your Next.js / FastAPI route here
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skinLab:         result.skinLab,
          mstTier:         result.mstTier,
          undertoneClass:  result.undertoneClass,
          undertoneVector: result.undertoneVector,
          topN: 5,
        }),
      });
      const data = await res.json();
      setMatches(data.matches ?? []);
    } catch {
      setScanState((s) => ({
        ...s, status: "error",
        errorMessage: "Analysis failed. Please retry.",
      }));
    }
  }, []);

  const startScan = useCallback(async () => {
    try {
      setScanState((s) => ({ ...s, status: "requesting_camera" }));
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScanState((s) => ({ ...s, status: "scanning" }));
      startAnalysis();

      let progress = 0;
      const interval = setInterval(() => {
        progress += 1;
        setScanProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          stopAnalysis();
          doAnalysis();
        }
      }, 100);
    } catch {
      setScanState((s) => ({
        ...s, status: "error",
        errorMessage: "Camera access denied. Please allow camera permissions.",
      }));
    }
  }, [startAnalysis, stopAnalysis, doAnalysis]);

  const resetScan = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setScanState({
      status: "idle", liqaPass: false, lightingScore: 0,
      positionScore: 0, shadowWarning: false,
    });
    setMatches([]);
    setScanProgress(0);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">

        {/* Header */}
        <div className="text-center">
          <p className="text-[10px] tracking-[0.3em] text-violet-400/70 uppercase mb-1">
            Scientific Shade Matrix
          </p>
          <h1 className="text-2xl font-black tracking-tight">Your Perfect Foundation</h1>
          <p className="text-sm text-white/40 mt-1">CIEDE2000 · MST Scale · Oxidation-Aware</p>
        </div>

        <TierSelector active={tier} onChange={(t) => { resetScan(); setTier(t); }} />

        {/* ── AI Scan Tier ── */}
        {tier === "ai" && (
          <div className="flex flex-col gap-4">

            {["scanning", "requesting_camera"].includes(scanState.status) && (
              <div className="relative rounded-3xl overflow-hidden bg-black aspect-[3/4]">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <AIScannerOverlay
                  lightingScore={scanState.lightingScore}
                  positionScore={scanState.positionScore}
                  shadowWarning={scanState.shadowWarning}
                  liqaPass={scanState.liqaPass}
                  scanProgress={scanProgress}
                  status={scanState.status}
                />
              </div>
            )}

            {scanState.status === "analysing" && (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="w-16 h-16 rounded-full border-4 border-violet-500/30 border-t-violet-500 animate-spin" />
                <p className="text-white/60 text-sm">Applying D65 normalisation…</p>
              </div>
            )}

            {scanState.status === "idle" && (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="w-24 h-24 rounded-full bg-violet-600/20 border-2 border-violet-500/30 flex items-center justify-center text-4xl">
                  ◉
                </div>
                <div className="text-center">
                  <p className="font-semibold text-white">Start 10-Second Scan</p>
                  <p className="text-sm text-white/40 mt-1">
                    Multi-spectral analysis detects your MST tier and undertone
                  </p>
                </div>
                <button
                  onClick={startScan}
                  className="w-full max-w-xs py-4 rounded-2xl bg-violet-600 hover:bg-violet-500 font-bold text-white transition-colors shadow-lg shadow-violet-500/25"
                >
                  Begin Scan →
                </button>
              </div>
            )}

            {scanState.status === "error" && (
              <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 text-center">
                <p className="text-red-400 text-sm">{scanState.errorMessage}</p>
                <button onClick={resetScan} className="mt-3 text-sm text-white/60 underline">
                  Try again
                </button>
              </div>
            )}

            {scanState.status === "complete" && scanState.skinLab && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 flex gap-4 items-center">
                <div className="flex flex-col gap-1 flex-1">
                  <p className="text-[11px] text-white/40 uppercase tracking-widest">Skin Profile Detected</p>
                  <p className="font-semibold">MST-{scanState.mstDetected}</p>
                  <p className="text-sm text-white/60 capitalize">
                    {scanState.undertoneDetected?.replace("_", " ")} undertone
                  </p>
                  <p className="text-[11px] font-mono text-white/30 mt-1">
                    L* {scanState.skinLab.L.toFixed(1)} · a* {scanState.skinLab.a.toFixed(1)} · b* {scanState.skinLab.b.toFixed(1)}
                  </p>
                </div>
                <button
                  onClick={resetScan}
                  className="text-xs text-white/40 border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/30 transition"
                >
                  Rescan
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Text Match Tier ── */}
        {tier === "text" && (
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={textQuery}
              onChange={(e) => setTextQuery(e.target.value)}
              placeholder='e.g. "MAC NC30" or "Fenty 230N"'
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition"
            />
            <button
              onClick={() => {/* wire to /api/text-match */}}
              className="py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 font-bold text-white transition-colors"
            >
              Find Matches →
            </button>
          </div>
        )}

        {/* ── AR VTO Tier ── */}
        {tier === "vto" && (
          <div className="rounded-3xl bg-white/3 border border-white/10 flex flex-col items-center gap-3 py-14 px-6 text-center">
            <span className="text-5xl">✦</span>
            <p className="font-semibold text-white">AR Virtual Try-On</p>
            <p className="text-sm text-white/40">
              Hyper-realistic overlay including oxidised 2-hour wear preview.
              Requires WebXR-compatible device.
            </p>
            <button className="mt-2 px-6 py-3 rounded-xl bg-violet-600/50 text-violet-200 text-sm font-medium border border-violet-500/30">
              Launch AR (Beta) →
            </button>
          </div>
        )}

        {/* ── Match Results ── */}
        {matches.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-white/40 uppercase tracking-widest">
              Top {matches.length} Matches · Sorted by CIEDE2000 Wear Score
            </p>
            {matches.map((m, i) => (
              <MatchCard key={m.colorMetricId} result={m} rank={i + 1} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

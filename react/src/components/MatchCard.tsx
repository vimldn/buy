import React, { useState } from "react";
import { ShadeResult } from "../types";

function DeltaEBadge({ value, label }: { value: number; label: string }) {
  const color =
    value < 1.5 ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/10"
    : value < 3 ? "text-amber-400 border-amber-400/40 bg-amber-400/10"
    :             "text-red-400 border-red-400/40 bg-red-400/10";
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 text-center ${color}`}>
      <p className="text-[10px] opacity-70 uppercase tracking-widest">{label}</p>
      <p className="text-lg font-bold font-mono leading-tight">ΔE {value.toFixed(2)}</p>
    </div>
  );
}

function ConfidenceRing({ pct }: { pct: number }) {
  const r = 24, circ = 2 * Math.PI * r;
  const fill  = (pct / 100) * circ;
  const color = pct > 90 ? "#4ade80" : pct > 75 ? "#fbbf24" : "#f87171";
  return (
    <div className="relative flex items-center justify-center w-16 h-16">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} strokeWidth="4" stroke="rgba(255,255,255,0.1)" fill="none" />
        <circle
          cx="32" cy="32" r={r} strokeWidth="4" stroke={color} fill="none"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <span className="absolute text-sm font-bold text-white">{Math.round(pct)}%</span>
    </div>
  );
}

export function MatchCard({ result, rank }: { result: ShadeResult; rank: number }) {
  const [expanded, setExpanded] = useState(rank === 1);

  const swatchBg = `hsl(${30 + result.oxidation.fresh.b * 1.5}, ${
    20 + result.oxidation.fresh.a * 2
  }%, ${result.oxidation.fresh.L * 0.9}%)`;

  return (
    <div className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
      rank === 1
        ? "border-violet-500/50 bg-violet-500/5"
        : "border-white/10 bg-white/3 hover:border-white/20"
    }`}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-4 p-4 text-left"
      >
        <span className="text-3xl font-black text-white/20 w-6 shrink-0">
          {rank === 1 ? "★" : rank}
        </span>
        <div
          className="w-12 h-12 rounded-xl shrink-0 border border-white/20 shadow-inner"
          style={{ backgroundColor: swatchBg }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-white/50 uppercase tracking-widest truncate">{result.brand}</p>
          <p className="text-white font-semibold leading-tight truncate">{result.shadeName}</p>
          <p className="text-[11px] text-white/40 capitalize">{result.finish} · {result.coverage}</p>
        </div>
        <ConfidenceRing pct={result.confidencePct} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4 border-t border-white/5 pt-4">
          <div className="grid grid-cols-3 gap-2">
            <DeltaEBadge value={result.deltaEFresh}    label="Fresh"    />
            <DeltaEBadge value={result.deltaEOxidized} label="2hr Wear" />
            <DeltaEBadge value={result.deltaEWear}     label="True Wear"/>
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-white/50 mb-1">
              <span>Undertone Match</span>
              <span className="capitalize">{result.undertoneClass}</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-pink-400 via-amber-300 to-yellow-400"
                style={{ width: `${result.undertoneScore * 100}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <p className="text-[11px] text-white/40 uppercase tracking-widest mb-1">Why this match</p>
            <p className="text-sm text-white/80 leading-relaxed">{result.explanation}</p>
          </div>

          <div className="flex gap-3 items-center">
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-lg border border-white/20" style={{ backgroundColor: swatchBg }} />
              <span className="text-[10px] text-white/40">Fresh</span>
            </div>
            <div className="text-white/20 text-lg">→</div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-lg border border-white/20" style={{
                backgroundColor: `hsl(${28 + result.oxidation.oxidized.b * 1.5}, ${
                  22 + result.oxidation.oxidized.a * 2
                }%, ${result.oxidation.oxidized.L * 0.88}%)`,
              }} />
              <span className="text-[10px] text-white/40">2hr Wear</span>
            </div>
            <p className="text-[11px] text-white/40 ml-2 flex-1">
              ΔE {result.oxidation.oxidation_delta_e?.toFixed(2) ?? "—"} oxidation shift
            </p>
          </div>

          <a
            href={result.affiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
          >
            Shop This Shade →
          </a>
        </div>
      )}
    </div>
  );
}

import React from "react";
import { FunnelTier } from "../types";

const TIERS: { id: FunnelTier; label: string; icon: string }[] = [
  { id: "text", label: "Text Match", icon: "⌨" },
  { id: "ai",   label: "AI Scan",    icon: "◉" },
  { id: "vto",  label: "AR Try-On",  icon: "✦" },
];

export function TierSelector({
  active,
  onChange,
}: {
  active: FunnelTier;
  onChange: (t: FunnelTier) => void;
}) {
  return (
    <div className="flex rounded-2xl bg-white/5 border border-white/10 p-1 gap-1">
      {TIERS.map(({ id, label, icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-sm font-medium transition-all ${
            active === id
              ? "bg-violet-600 text-white shadow-lg shadow-violet-500/25"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          <span>{icon}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

# Scientific Shade Matrix

> AI-driven foundation matching using CIEDE2000 colour science, the Monk Skin Tone scale, and oxidation modelling — a full replacement for crowdsourced shade databases.

## Project Structure

```
shade-matrix/
├── python/
│   └── ciede2000_engine.py         # Full CIEDE2000 matching engine + oxidation model
├── sql/
│   └── shade_matrix_schema.sql     # PostgreSQL 16 schema (pgvector + HNSW indexes)
├── react/
│   └── src/
│       ├── types/index.ts                    # Shared domain types
│       ├── hooks/
│       │   ├── useLIQA.ts                    # Live Image Quality Assurance hook
│       │   └── useColorAnalysis.ts           # sRGB → Lab + MST + undertone
│       ├── components/
│       │   ├── AIScannerOverlay.tsx          # Real-time scan guidance UI
│       │   ├── MatchCard.tsx                 # Explainability result card
│       │   └── TierSelector.tsx              # Three-tier funnel switcher
│       └── ShadeMatrix.tsx                   # Root orchestrator component
└── docs/
    └── architecture.md                       # Full technical blueprint
```

## Quick Start

### Python Matching Engine
```bash
pip install numpy scipy
python python/ciede2000_engine.py
```

### Database Setup
```bash
# Requires PostgreSQL 16+ with pgvector extension
psql -U postgres -d your_db -f sql/shade_matrix_schema.sql
```

### React App
```bash
cd react
npm install          # or: pnpm install / yarn
npm run dev
```
**Requirements:** React 18, TypeScript 5, Tailwind CSS v3

---

## Key Concepts

| Term | Meaning |
|---|---|
| **CIEDE2000** | Perceptually-uniform colour difference formula (IEC 61966) |
| **ΔE₀₀ < 1.5** | Below human perceptual threshold — shades are a match |
| **OxidationProfile** | Every shade has two Lab points: T=0 (fresh) and T=120 min |
| **TrueWear Score** | `0.35 × ΔE_fresh + 0.65 × ΔE_oxidized` |
| **MST Scale** | Monk Skin Tone (10 tiers) — replaces the Fitzpatrick scale |
| **LIQA** | Live Image Quality Assurance — gates the scan until conditions are safe |
| **D65** | Standard daylight illuminant used for white-balance normalisation |
| **HNSW** | Hierarchical Navigable Small World — ANN index for pgvector |
| **Undertone Vector** | `[warm, cool, olive]` unit vector; cosine similarity used for undertone matching |

---

## Architecture Decisions

- **pgvector over Pinecone** for MVP — reduces infra cost; migrate at 10M+ shades
- **Median sampling** over single-frame capture for skin Lab extraction (robust to blinks/motion)
- **65/35 oxidized/fresh weighting** in TrueWear score — reflects real-world wear experience
- **Trust scoring** on `color_metrics` enables a supervised learning loop from purchase/return signals
- **Entity Resolution** via `ΔE₀₀ < 1.5` gate, not shade name — solves the "Ivory" ambiguity problem

---

## API Contract

`POST /api/match`
```json
{
  "skinLab":         { "L": 62.4, "a": 14.1, "b": 18.7 },
  "mstTier":         5,
  "undertoneClass":  "golden_warm",
  "undertoneVector": [0.7, 0.1, 0.2],
  "topN":            5
}
```
Response: `{ matches: ShadeResult[] }`

---

## Production Roadmap

- [ ] Replace heuristic LIQA with compiled ONNX face quality model (TFLite / WASM)
- [ ] Add WebXR + MediaPipe FaceMesh for AR Tier 3 overlay
- [ ] Sigmoid oxidation curve per formula base type (silicone vs water vs oil)
- [ ] Row-Level Security policies for B2B tenant isolation
- [ ] Spectrophotometer lab pipeline to upgrade `brand_submitted` shades to `lab_verified`
- [ ] Partition `match_results` by month for analytics query performance
- [ ] Kalman filter for temporal smoothing on skin Lab samples

---

## Confidence Thresholds

| ΔE₀₀ | Meaning |
|---|---|
| < 1.0 | Imperceptible — perfect match |
| 1.0 – 1.5 | Perceptible on very close inspection — excellent match |
| 1.5 – 3.0 | Noticeable on careful observation — good match |
| 3.0 – 6.0 | Clearly different on a glance — marginal |
| > 6.0 | Distinct colours — rejected by matching engine |

---

## License

MIT

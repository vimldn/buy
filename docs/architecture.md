# Architecture Overview

## 1. Color Science

- **Color space:** CIE L\*a\*b\* — perceptually uniform, meaning mathematical distance equals human-perceived difference
- **Distance metric:** CIEDE2000 (ΔE₀₀) — accounts for the eye's non-linear sensitivity to hue/saturation vs lightness
- **Perceptual thresholds:** <1.5 imperceptible · 1.5–3 acceptable · >3 noticeable mismatch · >6 rejected

## 2. Oxidation Model

**Time-Varying Coordinate System:** every shade carries two Lab anchors.

```
OxidationProfile {
  fresh:    LabPoint  // T = 0 min  (what you see in the pan)
  oxidized: LabPoint  // T = 120 min (what you wear all day)
}
```

**TrueWear Score** = `0.35 × ΔE_fresh + 0.65 × ΔE_oxidized`

Oxidized is weighted higher because it represents the majority of real-world wear experience.

## 3. Skin Analysis Pipeline

```
Camera stream (10s)
  → LIQA gate (lighting > 0.5, shadow < 20%, position OK)
  → 15 frames × bilateral cheek sampling (avoids nose specular)
  → Median Lab across all frames (blink-robust)
  → sRGB → XYZ (D65 Bradford matrix) → L*a*b*
  → MST tier (L* thresholds, MST-1 through MST-10)
  → Undertone vector ([warm, cool, olive] via a*, b* decomposition)
```

## 4. Matching Pipeline

```
User skin Lab + undertone vector + MST tier
  → pgvector HNSW ANN: top 20 candidates by L2(lab_vec_fresh)
  → Python re-rank: full CIEDE2000 + undertone cosine similarity
  → Composite score = 0.60 × TrueWear_ΔE + 0.40 × (1 - undertone_sim) × 6
  → Sort ascending → top N results with explanation strings
```

## 5. Database

- **pgvector HNSW** index (m=16, ef_construction=200): sub-millisecond ANN across millions of shades
- **Retrieve-then-rerank:** SQL retrieves top 20 by L2 distance; Python applies full CIEDE2000
- **Entity resolution:** `shade_equivalences` table; ΔE₀₀ < 1.5 = perceptually identical regardless of brand name
- **Trust scoring:** `lab_verified`=1.0, `brand_submitted`=0.7, `ai_estimated`=0.5; feeds learning loop

## 6. B2B SaaS Layer

- **Shade Gap Analytics view:** MST coverage per brand (how many shades per tier)
- **Tenant isolation:** `api_key_hash` + CORS `widget_domains` allowlist
- **Widget embed:** `<ShadeMatrixWidget tenantId="..." />` drops into any retailer site

## 7. Learning Loop

```
User purchases → user_purchased = TRUE
User keeps it  → user_returned  = FALSE   (positive signal)
User rates 5★  → user_rating    = 5       (strong positive)

Accumulated positive signals → trigger spectrophotometer lab verification
→ data_source upgrades to 'lab_verified' → trust_score = 1.0
→ shade moves up in ranking for similar future users
```

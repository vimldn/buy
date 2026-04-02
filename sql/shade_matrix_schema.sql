-- =============================================================================
-- SCIENTIFIC SHADE MATRIX — PostgreSQL Schema v1.0
-- =============================================================================
-- Engine  : PostgreSQL 16+  (pgvector extension for L*a*b* semantic search)
-- Naming  : snake_case throughout; UUIDs as primary keys for microservice safety
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";       -- ANN search on Lab vectors
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Fuzzy shade-name search

-- ---------------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------------

CREATE TYPE finish_type AS ENUM (
    'matte', 'dewy', 'satin', 'natural', 'luminous', 'velvet'
);

CREATE TYPE coverage_type AS ENUM (
    'sheer', 'light', 'buildable', 'medium', 'full'
);

CREATE TYPE formula_base_type AS ENUM (
    'silicone', 'water', 'oil', 'hybrid', 'powder'
);

CREATE TYPE mst_tier AS ENUM (
    'MST_1', 'MST_2', 'MST_3', 'MST_4',  'MST_5',
    'MST_6', 'MST_7', 'MST_8', 'MST_9',  'MST_10'
);

CREATE TYPE undertone_class AS ENUM (
    'warm', 'cool', 'neutral', 'olive', 'pink_cool', 'golden_warm'
);

CREATE TYPE data_source_type AS ENUM (
    'lab_verified',     -- Gold standard: spectrophotometer measurement
    'brand_submitted',  -- Brand provided values (lower trust score)
    'ai_estimated',     -- Derived by vision model from product image
    'crowdsourced'      -- Community-verified (legacy fallback)
);

-- ---------------------------------------------------------------------------
-- 1. BRANDS
-- ---------------------------------------------------------------------------

CREATE TABLE brands (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug            VARCHAR(80)  NOT NULL UNIQUE,
    name            VARCHAR(160) NOT NULL,
    country_origin  CHAR(2),                          -- ISO 3166-1 alpha-2
    tier            VARCHAR(20)  DEFAULT 'mainstream', -- 'luxury' | 'drugstore'
    retailer_api_id VARCHAR(100),                     -- Sephora / Ulta product API ref
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. PRODUCTS
-- ---------------------------------------------------------------------------

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id        UUID         NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    sku             VARCHAR(80)  NOT NULL,
    name            VARCHAR(200) NOT NULL,
    category        VARCHAR(60)  NOT NULL DEFAULT 'foundation',
    finish          finish_type  NOT NULL,
    coverage        coverage_type NOT NULL,
    formula_base    formula_base_type,
    spf             SMALLINT     CHECK (spf IS NULL OR spf BETWEEN 0 AND 100),
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    affiliate_url   TEXT,
    retailer_price  NUMERIC(8,2),
    currency        CHAR(3)      DEFAULT 'GBP',
    image_url       TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (brand_id, sku)
);

-- ---------------------------------------------------------------------------
-- 3. COLOR METRICS  (the heart of the schema)
-- ---------------------------------------------------------------------------

CREATE TABLE color_metrics (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    shade_name      VARCHAR(120) NOT NULL,
    shade_name_norm VARCHAR(120) GENERATED ALWAYS AS (
                        lower(trim(shade_name))
                    ) STORED,              -- Normalised for entity resolution

    -- ── Ground-truth L*a*b* at T=0 (fresh application) ──────────────────────
    lab_L_fresh     NUMERIC(6,3) NOT NULL CHECK (lab_L_fresh BETWEEN 0 AND 100),
    lab_a_fresh     NUMERIC(6,3) NOT NULL CHECK (lab_a_fresh BETWEEN -128 AND 128),
    lab_b_fresh     NUMERIC(6,3) NOT NULL CHECK (lab_b_fresh BETWEEN -128 AND 128),

    -- ── Oxidized L*a*b* at T=120 min ─────────────────────────────────────────
    lab_L_oxidized  NUMERIC(6,3)          CHECK (lab_L_oxidized BETWEEN 0 AND 100),
    lab_a_oxidized  NUMERIC(6,3)          CHECK (lab_a_oxidized BETWEEN -128 AND 128),
    lab_b_oxidized  NUMERIC(6,3)          CHECK (lab_b_oxidized BETWEEN -128 AND 128),

    -- ── pgvector columns for ANN search ──────────────────────────────────────
    -- Stored as 3-dim vectors; index will use HNSW for sub-ms retrieval
    lab_vec_fresh    vector(3),           -- [L, a, b] at T=0
    lab_vec_oxidized vector(3),           -- [L, a, b] at T=120

    -- ── Undertone ─────────────────────────────────────────────────────────────
    undertone_class    undertone_class,
    undertone_vector   vector(3),         -- [warm_cool, olive_pink, neutral] unit vec

    -- ── MST classification ────────────────────────────────────────────────────
    mst_tier           mst_tier NOT NULL,
    mst_tier_secondary mst_tier,          -- Transition shades may span two tiers

    -- ── Provenance ────────────────────────────────────────────────────────────
    data_source        data_source_type NOT NULL DEFAULT 'brand_submitted',
    trust_score        NUMERIC(4,3)     NOT NULL DEFAULT 0.5
                           CHECK (trust_score BETWEEN 0 AND 1),
    -- trust_score: lab_verified=1.0 | brand_submitted=0.7 | ai_estimated=0.5

    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Derived column trigger: keep lab_vec_fresh in sync with scalar columns
CREATE OR REPLACE FUNCTION sync_lab_vectors()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.lab_vec_fresh    := ARRAY[NEW.lab_L_fresh,    NEW.lab_a_fresh,    NEW.lab_b_fresh   ]::vector;
    NEW.lab_vec_oxidized := ARRAY[NEW.lab_L_oxidized, NEW.lab_a_oxidized, NEW.lab_b_oxidized]::vector;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_lab_vectors
    BEFORE INSERT OR UPDATE ON color_metrics
    FOR EACH ROW EXECUTE FUNCTION sync_lab_vectors();

-- ---------------------------------------------------------------------------
-- 4. INGREDIENT / FORMULA REGISTRY  (INCI-compliant)
-- ---------------------------------------------------------------------------

CREATE TABLE ingredients (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inci_name   VARCHAR(200) NOT NULL UNIQUE,   -- Official INCI name
    cas_number  VARCHAR(20),                    -- CAS registry number
    is_allergen BOOLEAN DEFAULT FALSE,
    is_comedogenic_risk BOOLEAN DEFAULT FALSE,
    ewg_score   SMALLINT CHECK (ewg_score BETWEEN 1 AND 10)
);

CREATE TABLE product_ingredients (
    product_id    UUID     NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    ingredient_id UUID     NOT NULL REFERENCES ingredients(id),
    position      SMALLINT NOT NULL,   -- Descending concentration (INCI list order)
    PRIMARY KEY (product_id, ingredient_id)
);

-- ---------------------------------------------------------------------------
-- 5. USER SCAN SESSIONS  (the AI Lighting Solver output)
-- ---------------------------------------------------------------------------

CREATE TABLE scan_sessions (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID,       -- NULL for anonymous / guest sessions
    session_token    VARCHAR(64) NOT NULL UNIQUE,

    -- ── Skin analysis result ──────────────────────────────────────────────────
    skin_lab_L       NUMERIC(6,3) CHECK (skin_lab_L BETWEEN 0 AND 100),
    skin_lab_a       NUMERIC(6,3) CHECK (skin_lab_a BETWEEN -128 AND 128),
    skin_lab_b       NUMERIC(6,3) CHECK (skin_lab_b BETWEEN -128 AND 128),
    skin_lab_vector  vector(3),

    mst_tier_detected   mst_tier,
    undertone_detected  undertone_class,
    undertone_vector    vector(3),

    -- ── Scan quality metadata ─────────────────────────────────────────────────
    lighting_quality_score  NUMERIC(4,3) CHECK (lighting_quality_score BETWEEN 0 AND 1),
    white_balance_applied   BOOLEAN DEFAULT FALSE,
    d65_normalised          BOOLEAN DEFAULT FALSE,
    liqa_pass               BOOLEAN DEFAULT FALSE,   -- Live Image Quality Assurance

    -- ── Device / environment ──────────────────────────────────────────────────
    device_os        VARCHAR(30),
    ambient_lux      NUMERIC(7,2),   -- Lux reading at scan time if available
    scan_duration_ms INTEGER,

    expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 6. MATCH RESULTS  (persisted for analytics and feedback loop)
-- ---------------------------------------------------------------------------

CREATE TABLE match_results (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_session_id  UUID        NOT NULL REFERENCES scan_sessions(id),
    color_metric_id  UUID        NOT NULL REFERENCES color_metrics(id),

    rank             SMALLINT    NOT NULL CHECK (rank BETWEEN 1 AND 20),
    delta_e_fresh    NUMERIC(6,3) NOT NULL,
    delta_e_oxidized NUMERIC(6,3) NOT NULL,
    delta_e_wear     NUMERIC(6,3) NOT NULL,
    undertone_score  NUMERIC(4,3) NOT NULL,
    composite_score  NUMERIC(6,3) NOT NULL,
    confidence_pct   NUMERIC(5,2) NOT NULL,
    explanation_text TEXT,

    -- ── User feedback (for supervised learning loop) ──────────────────────────
    user_purchased   BOOLEAN,
    user_rating      SMALLINT    CHECK (user_rating BETWEEN 1 AND 5),
    user_returned    BOOLEAN,     -- Return signal → key accuracy metric
    feedback_at      TIMESTAMPTZ,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 7. B2B WIDGET TENANTS  (SaaS layer)
-- ---------------------------------------------------------------------------

CREATE TABLE tenants (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(200) NOT NULL,
    slug            VARCHAR(80)  NOT NULL UNIQUE,
    api_key_hash    VARCHAR(64)  NOT NULL,   -- bcrypt hash; never store plaintext
    plan            VARCHAR(30)  NOT NULL DEFAULT 'starter',
    monthly_scans   INTEGER      DEFAULT 5000,
    widget_domains  TEXT[],      -- Allowlist for CORS
    shade_gap_report BOOLEAN     DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE tenant_brand_access (
    tenant_id  UUID NOT NULL REFERENCES tenants(id),
    brand_id   UUID NOT NULL REFERENCES brands(id),
    PRIMARY KEY (tenant_id, brand_id)
);

-- Shade Gap Analytics: which MST tiers lack shade options per brand
CREATE VIEW shade_gap_analysis AS
SELECT
    b.name                         AS brand,
    b.id                           AS brand_id,
    cm.mst_tier,
    COUNT(DISTINCT cm.id)          AS shade_count,
    AVG(cm.trust_score)            AS avg_trust_score,
    MIN(cm.lab_L_fresh)            AS lightest_L,
    MAX(cm.lab_L_fresh)            AS deepest_L
FROM brands b
JOIN products p    ON p.brand_id   = b.id
JOIN color_metrics cm ON cm.product_id = p.id
GROUP BY b.name, b.id, cm.mst_tier
ORDER BY b.name, cm.mst_tier;

-- ---------------------------------------------------------------------------
-- 8. ENTITY RESOLUTION — Shade Name Deduplication
-- ---------------------------------------------------------------------------

-- When two shades have the same normalised name across brands,
-- entity resolution ignores the name and uses ΔE₀₀ < 1.5 as the truth signal.

CREATE TABLE shade_equivalences (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_a_id UUID NOT NULL REFERENCES color_metrics(id),
    metric_b_id UUID NOT NULL REFERENCES color_metrics(id),
    delta_e_00  NUMERIC(6,3) NOT NULL,
    confirmed   BOOLEAN DEFAULT FALSE,   -- FALSE = algorithmic, TRUE = lab-verified
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    CHECK (metric_a_id < metric_b_id)    -- Prevent duplicate pairs
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

-- ANN index on fresh Lab vector (HNSW — best recall for cosine / L2 proximity)
CREATE INDEX idx_cm_lab_vec_fresh
    ON color_metrics USING hnsw (lab_vec_fresh vector_l2_ops)
    WITH (m = 16, ef_construction = 200);

CREATE INDEX idx_cm_lab_vec_oxidized
    ON color_metrics USING hnsw (lab_vec_oxidized vector_l2_ops)
    WITH (m = 16, ef_construction = 200);

-- Trigram index for fuzzy shade-name search / entity resolution
CREATE INDEX idx_cm_shade_name_trgm
    ON color_metrics USING gin (shade_name_norm gin_trgm_ops);

-- Standard B-tree indexes
CREATE INDEX idx_cm_mst_tier          ON color_metrics (mst_tier);
CREATE INDEX idx_cm_undertone_class   ON color_metrics (undertone_class);
CREATE INDEX idx_cm_data_source       ON color_metrics (data_source);
CREATE INDEX idx_products_brand       ON products (brand_id);
CREATE INDEX idx_match_session        ON match_results (scan_session_id);
CREATE INDEX idx_match_confidence     ON match_results (confidence_pct DESC);
CREATE INDEX idx_scan_user            ON scan_sessions (user_id);
CREATE INDEX idx_scan_token           ON scan_sessions (session_token);

-- ---------------------------------------------------------------------------
-- NEAREST-NEIGHBOUR HELPER FUNCTION
-- (Called by API layer; replace Python loop for high-throughput B2B requests)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION find_shade_candidates(
    p_lab_fresh    vector(3),
    p_lab_oxidized vector(3),
    p_mst_tier     mst_tier    DEFAULT NULL,
    p_finish       finish_type DEFAULT NULL,
    p_limit        INTEGER     DEFAULT 20
)
RETURNS TABLE (
    color_metric_id  UUID,
    product_id       UUID,
    shade_name       VARCHAR,
    l2_dist_fresh    FLOAT,
    l2_dist_oxidized FLOAT
)
LANGUAGE sql STABLE AS $$
    SELECT
        cm.id                                                   AS color_metric_id,
        cm.product_id,
        cm.shade_name,
        (cm.lab_vec_fresh    <-> p_lab_fresh)::FLOAT            AS l2_dist_fresh,
        (cm.lab_vec_oxidized <-> p_lab_oxidized)::FLOAT         AS l2_dist_oxidized
    FROM color_metrics cm
    JOIN products p ON p.id = cm.product_id
    WHERE
        (p_mst_tier IS NULL OR cm.mst_tier = p_mst_tier)
        AND (p_finish IS NULL OR p.finish = p_finish)
        AND cm.lab_vec_fresh IS NOT NULL
    ORDER BY cm.lab_vec_fresh <-> p_lab_fresh
    LIMIT p_limit;
$$;

-- ---------------------------------------------------------------------------
-- SAMPLE SEED DATA (for CI / local dev)
-- ---------------------------------------------------------------------------

INSERT INTO brands (slug, name, country_origin, tier)
VALUES
    ('luminatech',  'LuminaTech Beauty',       'US', 'luxury'),
    ('dew-lab',     'Dew Lab Cosmetics',        'GB', 'mainstream'),
    ('nyxpro',      'NYX Professional Makeup',  'US', 'drugstore');

COMMENT ON TABLE color_metrics       IS 'Ground-truth L*a*b* measurements for every shade. The core truth table of the Scientific Shade Matrix.';
COMMENT ON TABLE shade_equivalences  IS 'Algorithmically-resolved duplicate shades across brands. ΔE₀₀ < 1.5 = perceptually identical.';
COMMENT ON VIEW  shade_gap_analysis  IS 'B2B Shade Gap Analytics — reveals which MST tiers are underserved per brand.';

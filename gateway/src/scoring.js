require('dotenv').config();


const mode = (process.env.GATEWAY_MODE || 'adaptive').toLowerCase();
if (!['adaptive', 'static'].includes(mode)) {
  throw new Error(`GATEWAY_MODE must be "adaptive" or "static", got "${mode}"`);
}


const disabledRules = new Set(
  (process.env.DISABLED_RULES || '')
    .split(',')
    .map((rule) => rule.trim().toUpperCase())
    .filter(Boolean)
);

const ruleWeights = {
  R1: Number(process.env.R1_WEIGHT || 50),
  R2: Number(process.env.R2_WEIGHT || 50),
  R3: Number(process.env.R3_WEIGHT || 30),
  R4: Number(process.env.R4_BASE_WEIGHT || 40),
  R5: Number(process.env.R5_WEIGHT || 35),
};

const r3 = {
  windowSeconds: Number(process.env.R3_WINDOW_SECONDS || 10),
  threshold: Number(process.env.R3_THRESHOLD || 60),
};


const r4 = {
  windowSeconds: Number(process.env.R4_WINDOW_SECONDS || 600),
  threshold: Number(process.env.R4_THRESHOLD || 5),
  exponentialFactor: Number(process.env.R4_EXPONENTIAL_FACTOR || 2),
};

const tierBounds = {
  t1Max: Number(process.env.TIER1_MAX || 30),
  t2Max: Number(process.env.TIER2_MAX || 60),
  t3Max: Number(process.env.TIER3_MAX || 85),
};

const tiers = [
  { id: 'T1', label: 'Normal', min: 0, max: tierBounds.t1Max, rateLimitPct: 100 },
  { id: 'T2', label: 'Elevated', min: tierBounds.t1Max + 1, max: tierBounds.t2Max, rateLimitPct: 50 },
  { id: 'T3', label: 'High', min: tierBounds.t2Max + 1, max: tierBounds.t3Max, rateLimitPct: 10 },
  { id: 'T4', label: 'Critical', min: tierBounds.t3Max + 1, max: Infinity, rateLimitPct: 0 },
];

function tierForScore(score) {
  return tiers.find((tier) => score >= tier.min && score <= tier.max) || tiers[tiers.length - 1];
}


const blocklistTtlSeconds = Number(process.env.BLOCKLIST_TTL_SECONDS || 600);

const t2DelayMs = Number(process.env.T2_DELAY_MS || 150);

const t3ForwardRatio = Number(process.env.T3_FORWARD_RATIO || 0.1);
const t3DelayMs = Number(process.env.T3_DELAY_MS || 750);

module.exports = {
  mode,
  disabledRules,
  ruleWeights,
  r3,
  r4,
  tierBounds,
  tiers,
  tierForScore,
  blocklistTtlSeconds,
  t2DelayMs,
  t3ForwardRatio,
  t3DelayMs,
};

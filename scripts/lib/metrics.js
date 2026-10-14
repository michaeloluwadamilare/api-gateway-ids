function runIsFlagged(observations) {
  return observations.some((obs) => obs.detected);
}

// runs: [{ label, groundTruthPositive: bool, observations: [...] }]
function computeConfusionMatrix(runs) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (const run of runs) {
    const flagged = runIsFlagged(run.observations);
    if (run.groundTruthPositive && flagged) tp++;
    else if (run.groundTruthPositive && !flagged) fn++;
    else if (!run.groundTruthPositive && flagged) fp++;
    else tn++;
  }

  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn); // detection rate
  const f1 = precision === null || recall === null || precision + recall === 0
    ? null
    : (2 * precision * recall) / (precision + recall);
  const falsePositiveRate = fp + tn === 0 ? null : fp / (fp + tn);

  const totalLegitimateRequests = runs
    .filter((r) => !r.groundTruthPositive)
    .reduce((sum, r) => sum + r.observations.length, 0);
  const falsePositiveRequests = runs
    .filter((r) => !r.groundTruthPositive)
    .reduce((sum, r) => sum + r.observations.filter((o) => o.detected).length, 0);
  const falsePositivesPer1000 = totalLegitimateRequests === 0
    ? null
    : (falsePositiveRequests / totalLegitimateRequests) * 1000;

  return {
    tp, fp, fn, tn,
    precision, recall, f1, falsePositiveRate, falsePositivesPer1000,
    totalRuns: runs.length,
  };
}


function effectiveF1(confusion) {
  if (confusion.f1 !== null) return confusion.f1;
  return confusion.tp === 0 && confusion.fn > 0 ? 0 : null;
}

function computeRequestLevelConfusionMatrix(runs) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (const run of runs) {
    for (const obs of run.observations) {
      if (run.groundTruthPositive && obs.detected) tp++;
      else if (run.groundTruthPositive && !obs.detected) fn++;
      else if (!run.groundTruthPositive && obs.detected) fp++;
      else tn++;
    }
  }

  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 = precision === null || recall === null || precision + recall === 0
    ? null
    : (2 * precision * recall) / (precision + recall);
  const falsePositiveRate = fp + tn === 0 ? null : fp / (fp + tn);

  return { tp, fp, fn, tn, precision, recall, f1, falsePositiveRate };
}


function timeToDetect(run) {
  const startedAt = run.observations[0]?.timestamp ? new Date(run.observations[0].timestamp).getTime() : null;
  const firstDetectedIndex = run.observations.findIndex((obs) => obs.detected);
  if (firstDetectedIndex === -1) return { requests: null, ms: null };

  const detectedAt = new Date(run.observations[firstDetectedIndex].timestamp).getTime();
  return {
    requests: firstDetectedIndex + 1,
    ms: startedAt === null ? null : detectedAt - startedAt,
  };
}

function latencyPercentile(observations, p) {
  const sorted = observations.map((o) => o.latencyMs).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function mean(values) {
  const nums = values.filter((v) => typeof v === 'number');
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(values) {
  const nums = values.filter((v) => typeof v === 'number');
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const variance = nums.reduce((sum, v) => sum + (v - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}


function percentile(values, p) {
  const nums = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const idx = Math.min(nums.length - 1, Math.ceil((p / 100) * nums.length) - 1);
  return nums[Math.max(0, idx)];
}

function median(values) {
  return percentile(values, 50);
}

module.exports = {
  runIsFlagged,
  computeConfusionMatrix,
  effectiveF1,
  computeRequestLevelConfusionMatrix,
  timeToDetect,
  latencyPercentile,
  mean,
  stddev,
  percentile,
  median,
};

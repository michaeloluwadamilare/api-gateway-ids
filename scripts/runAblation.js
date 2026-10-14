const fs = require('fs');
const path = require('path');

const { setGatewayConfig } = require('./lib/gatewayControl');
const { runCondition } = require('./runExperiment');
const { effectiveF1 } = require('./lib/metrics');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const RULES = ['R1', 'R2', 'R3', 'R4', 'R5'];

async function main() {
  const repetitions = Number(process.argv[2] || 5);
  const report = { generatedAt: new Date().toISOString(), repetitions, baseline: {}, ablations: [] };

  console.log('=== Baseline: Condition C, all rules enabled ===');
  for (const ruleId of RULES) {
    report.baseline[ruleId] = await runCondition('C', ruleId, repetitions, { runLabel: `ablation-baseline-${ruleId}` });
  }

  for (const disabledRule of RULES) {
    console.log(`\n=== Ablation: ${disabledRule} disabled ===`);

    const perCategory = {};
    for (const ruleId of RULES) {
      const result = await runCondition('C', ruleId, repetitions, {
        disabledRules: disabledRule,
        runLabel: `ablation-no-${disabledRule}-${ruleId}`,
      });

      const baselineF1 = effectiveF1(report.baseline[ruleId].confusion);
      const resultF1 = effectiveF1(result.confusion);
      const f1Delta = baselineF1 === null || resultF1 === null ? null : baselineF1 - resultF1;
      const baselineReqF1 = effectiveF1(report.baseline[ruleId].requestLevelConfusion);
      const resultReqF1 = effectiveF1(result.requestLevelConfusion);
      const requestLevelF1Delta = baselineReqF1 === null || resultReqF1 === null ? null : baselineReqF1 - resultReqF1;
      perCategory[ruleId] = { ...result, f1Delta, requestLevelF1Delta };
      console.log(
        `  disabled=${disabledRule} category=${ruleId}: f1=${resultF1} (baseline ${baselineF1}, delta ${f1Delta}) | request-level f1=${resultReqF1} (baseline ${baselineReqF1}, delta ${requestLevelF1Delta})`
      );
    }

    report.ablations.push({ disabledRule, perCategory });
  }

  // restore full-rule adaptive mode afterwards
  await setGatewayConfig({ gatewayMode: 'adaptive', disabledRules: '', runLabel: '' });

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `ablation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nAblation report written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

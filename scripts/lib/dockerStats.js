const { execFile } = require('child_process');

function statSnapshot(containerName) {
  return new Promise((resolve) => {
    execFile(
      'docker',
      ['stats', '--no-stream', '--format', '{{.CPUPerc}}\t{{.MemUsage}}', containerName],
      (err, stdout) => {
        if (err) return resolve(null);
        const [cpu, mem] = stdout.trim().split('\t');
        resolve({ cpuPercent: parseFloat(cpu), memUsage: mem });
      }
    );
  });
}

async function sampleOverWindow(containerName, durationMs, intervalMs = 1000) {
  const samples = [];
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    const snap = await statSnapshot(containerName);
    if (snap) samples.push(snap);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const cpuValues = samples.map((s) => s.cpuPercent).filter((v) => !Number.isNaN(v));
  return {
    samples,
    meanCpuPercent: cpuValues.length ? cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length : null,
    maxCpuPercent: cpuValues.length ? Math.max(...cpuValues) : null,
    lastMemUsage: samples.length ? samples[samples.length - 1].memUsage : null,
  };
}

module.exports = { sampleOverWindow };

import { Together } from "together-ai";

const MODELS = [
  { name: "nvidia/parakeet-tdt-0.6b-v3", label: "NEW  (parakeet-tdt-0.6b-v3)" },
  { name: "openai/whisper-large-v3",      label: "OLD  (whisper-large-v3)" },
];

const AUDIO_FILES = [
  "https://whisper-test.t3.tigrisfiles.io/Andrej_Karpathy_From_Vibe_Coding.mp3",
  "https://whisper-test.t3.tigrisfiles.io/Skill_Issue_Andrej_Karpathy.mp3",
];
const RUNS = 5;

const client = new Together({ apiKey: process.env.TOGETHER_API_KEY });

async function transcribe(model, audioFile) {
  const start = performance.now();
  try {
    const res = await client.audio.transcriptions.create({
      file: audioFile,
      // @ts-ignore
      model,
      language: "en",
    });
    const elapsed = (performance.now() - start) / 1000;
    return { ok: true, elapsed, text: res.text };
  } catch (err) {
    const elapsed = (performance.now() - start) / 1000;
    return { ok: false, elapsed, error: `${err.status ?? "ERR"}: ${err.error?.error?.message ?? err.message}` };
  }
}

console.log(`Runs per model per file: ${RUNS}\n`);

for (const audioUrl of AUDIO_FILES) {
  const fileName = audioUrl.split("/").pop();
  console.log("═".repeat(70));
  console.log(`FILE: ${fileName}`);
  console.log(`URL:  ${audioUrl}`);
  console.log("─".repeat(70));

  async function runModel({ name, label }) {
    const logs = [];
    const times = [];
    let lastText = "";
    let errors = 0;

    for (let i = 1; i <= RUNS; i++) {
      const result = await transcribe(name, audioUrl);
      if (result.ok) {
        times.push(result.elapsed);
        lastText = result.text;
        logs.push(`  [${label.trim()}] Run ${i}/${RUNS} ... ${result.elapsed.toFixed(2)}s`);
      } else {
        errors++;
        logs.push(`  [${label.trim()}] Run ${i}/${RUNS} ... ERROR (${result.elapsed.toFixed(2)}s) — ${result.error}`);
      }
    }

    let stat;
    if (times.length === 0) {
      stat = { label, avg: null, min: null, max: null, stddev: null, errors, sample: "all runs failed" };
    } else {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      const stddev = Math.sqrt(times.map(t => (t - avg) ** 2).reduce((a, b) => a + b, 0) / times.length);
      stat = { label, avg, min, max, stddev, errors, sample: lastText.slice(0, 120) };
    }
    return { name, stat, logs };
  }

  console.log(`\nRunning both models in parallel...`);
  const allResults = await Promise.all(MODELS.map(runModel));

  for (const { logs } of allResults) logs.forEach(l => console.log(l));

  const results = Object.fromEntries(allResults.map(({ name, stat }) => [name, stat]));

  console.log("\n" + "─".repeat(70));
  console.log("SUMMARY\n");

  const sorted = Object.values(results).sort((a, b) => {
    if (a.avg === null) return 1;
    if (b.avg === null) return -1;
    return a.avg - b.avg;
  });
  for (const r of sorted) {
    const errNote = r.errors > 0 ? `  ⚠ ${r.errors}/${RUNS} runs failed` : "";
    console.log(`${r.label}${errNote}`);
    if (r.avg !== null) {
      console.log(`  avg: ${r.avg.toFixed(2)}s  |  min: ${r.min.toFixed(2)}s  |  max: ${r.max.toFixed(2)}s  |  stddev: ${r.stddev.toFixed(2)}s  (${RUNS - r.errors}/${RUNS} ok)`);
      console.log(`  sample: "${r.sample}..."`);
    } else {
      console.log(`  all ${RUNS} runs failed`);
    }
    console.log();
  }

  const valid = sorted.filter(r => r.avg !== null);
  if (valid.length === 2) {
    const [faster, slower] = valid;
    const speedup = (slower.avg / faster.avg).toFixed(2);
    console.log(`Winner: ${faster.label.trim()} is ${speedup}x faster on average\n`);
  } else {
    console.log(`Not enough successful runs to compare.\n`);
  }
}

// 使い方: APP_MODE=live npx tsx scripts/run-radar.ts [slug,slug] [--no-discover]
import { loadStore, saveStore } from "../src/lib/store";
import { runPipeline } from "../src/lib/pipeline";
import { getProviders } from "../src/lib/providers";
import { resetRunBudget, usageSnapshot } from "../src/lib/providers/budget";
import { getMode } from "../src/lib/mode";

async function main() {
  const args = process.argv.slice(2);
  const companies = args.find((a) => !a.startsWith("--"))?.split(",");
  const round = Number(args.find((a) => a.startsWith("--round="))?.split("=")[1] ?? 1);
  resetRunBudget();
  const s = loadStore();
  const t0 = Date.now();
  const run = await runPipeline(s, getProviders({ demoRound: round }), { companies, discover: !args.includes("--no-discover"), trigger: args.includes("--weekly") ? "weekly" : "manual" });
  saveStore(s);
  console.log(JSON.stringify({ mode: getMode(), run: run.status, stats: run.stats, calls: usageSnapshot(), seconds: Math.round((Date.now() - t0) / 1000) }));
  for (const a of s.assessments.slice(-5)) console.log(a.companySlug, a.stage, a.motions.join("|"), Object.entries(a.signalStatus).filter(([, v]) => v.status !== "unconfirmed").map(([k, v]) => `${k}=${v.status}`).join(" "));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });

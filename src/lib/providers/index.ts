import { getMode, liveBlockers } from "../mode";
import { createDemoFetchProvider, createDemoJudgeProvider } from "./demo";
import { createJevProvider } from "./jev";
import { createNimbleProvider } from "./nimble";
import type { FetchProvider, JudgeProvider } from "./types";

export function getProviders(opts: { demoRound?: number } = {}): { fetch: FetchProvider; judge: JudgeProvider } {
  if (getMode() === "demo") return { fetch: createDemoFetchProvider(opts.demoRound ?? 1), judge: createDemoJudgeProvider() };
  const b = liveBlockers();
  if (b.length) throw new Error(`ライブモードで実行できません: ${b.join(" / ")}`);
  return { fetch: createNimbleProvider(), judge: createJevProvider() };
}

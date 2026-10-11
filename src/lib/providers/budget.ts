import { judgingConfig } from "../config";

export class BudgetExceededError extends Error {
  constructor(public provider: string) {
    super(`${provider} usage limit per run reached / 利用上限に達しました`);
  }
}

const runCounts = new Map<string, number>();
export function resetRunBudget() {
  runCounts.clear();
}
export function usageSnapshot() {
  return Object.fromEntries(runCounts);
}

/** 1回の実行あたりの呼び出し上限を守る */
export async function consumeBudget(provider: "nimble" | "jev") {
  const L = judgingConfig.limits;
  const perRun = provider === "nimble" ? L.nimbleCallsPerRun : L.jevCallsPerRun;
  const n = runCounts.get(provider) ?? 0;
  if (n >= perRun) throw new BudgetExceededError(provider);
  runCounts.set(provider, n + 1);
}

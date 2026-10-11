import path from "node:path";

export type AppMode = "demo" | "live";

export function getMode(): AppMode {
  return process.env.APP_MODE === "live" ? "live" : "demo";
}

export function liveKeyStatus() {
  return {
    nimble: Boolean(process.env.NIMBLE_API_KEY?.trim()),
    jev: Boolean(process.env.TYPESAFE_API_KEY?.trim()),
  };
}

/** ライブモードでキーが揃っていない場合の理由（画面表示用。キーの値は出さない） */
export function liveBlockers(): string[] {
  if (getMode() !== "live") return [];
  const k = liveKeyStatus();
  const out: string[] = [];
  if (!k.nimble) out.push("NIMBLE_API_KEY が未設定です");
  if (!k.jev) out.push("TYPESAFE_API_KEY が未設定です");
  return out;
}

export function databaseUrl(mode: AppMode = getMode()): string {
  if (process.env.DATABASE_URL_OVERRIDE) return process.env.DATABASE_URL_OVERRIDE;
  const env = mode === "live" ? process.env.LIVE_DATABASE_URL : process.env.DEMO_DATABASE_URL;
  if (env) return env;
  return "file:" + path.join(process.cwd(), "data", mode === "live" ? "live.db" : "demo.db");
}

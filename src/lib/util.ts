import { createHash } from "node:crypto";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** 秘密情報らしき文字列をログ・画面・DBに残さないためのマスク */
export function redact(input: unknown): string {
  let s = input instanceof Error ? `${input.name}: ${input.message}` : String(input);
  for (const k of ["NIMBLE_API_KEY", "TYPESAFE_API_KEY"]) {
    const v = process.env[k];
    if (v && v.length > 6) s = s.split(v).join("***");
  }
  return s.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer ***").slice(0, 2000);
}

/** 同時実行数と最小間隔を守る簡易リミッタ */
export function createLimiter(concurrency: number, minIntervalMs: number) {
  let active = 0;
  let last = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const run = queue.shift()!;
    const wait = Math.max(0, last + minIntervalMs - Date.now());
    last = Date.now() + wait;
    setTimeout(run, wait);
  };
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}

export const daysBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 86400000;

export const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "不明";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "不明";
  return x.toISOString().slice(0, 10);
};

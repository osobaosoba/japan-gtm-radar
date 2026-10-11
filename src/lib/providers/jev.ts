import { TypeSafeClient, noul, choice, RateLimitError, AuthenticationError, APITimeoutError } from "@typesafe-ai/sdk";
import { judgingConfig } from "../config";
import { createLimiter, redact } from "../util";
import { consumeBudget } from "./budget";
import type { JudgeAnswer, JudgeProvider, JudgeQuestion } from "./types";

// 公式: https://docs.typesafe.ai/api  (POST /v1/systemone, TYPESAFE_API_KEY)
const L = judgingConfig.limits;
const limit = createLimiter(L.concurrency, L.minIntervalMs);

export class JudgeError extends Error {
  constructor(public kind: "rate_limited" | "auth" | "timeout" | "budget" | "unknown", message: string) {
    super(message);
  }
}

export function createJevProvider(): JudgeProvider {
  const model = process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest";
  // apiKey は SDK が環境変数 TYPESAFE_API_KEY から読む
  const client = new TypeSafeClient({
    timeout: L.jevTimeoutMs,
    retry: { maxRetries: L.maxRetries },
    logLevel: "off",
    defaultModel: model,
  });
  return {
    name: "jev",
    model,
    async ask(state, qs) {
      await consumeBudget("jev");
      const questions: Record<string, ReturnType<typeof noul> | ReturnType<typeof choice>> = {};
      for (const [k, q] of Object.entries(qs)) {
        questions[k] = q.type === "noul" ? noul(q.prompt) : choice(q.prompt, q.options);
      }
      try {
        const r = await limit(() => client.systemOne({ state: state as never, questions, model }));
        const answers: Record<string, JudgeAnswer> = {};
        for (const [k, a] of Object.entries(r.answers as unknown as Record<string, Record<string, unknown>>)) {
          if (a.type === "noul") answers[k] = { type: "noul", noul: Number(a.noul) };
          else
            answers[k] = {
              type: "choice",
              choice: String(a.choice),
              confidence: Number(a.confidence),
              probabilities: (a.probabilities ?? {}) as Record<string, number>,
            };
        }
        return { model: r.model, answers, usage: (r.usage ?? {}) as unknown as Record<string, unknown> };
      } catch (e) {
        if (e instanceof RateLimitError) throw new JudgeError("rate_limited", redact(e));
        if (e instanceof AuthenticationError) throw new JudgeError("auth", redact(e));
        if (e instanceof APITimeoutError) throw new JudgeError("timeout", redact(e));
        throw new JudgeError("unknown", redact(e));
      }
    },
  };
}

export type { JudgeQuestion };

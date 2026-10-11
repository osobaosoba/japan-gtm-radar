import Nimble, {
  APIConnectionTimeoutError,
  APIConnectionError,
  AuthenticationError,
  RateLimitError,
  APIError,
} from "@nimble-way/nimble-js";
import { judgingConfig } from "../config";
import { createLimiter, redact } from "../util";
import { BudgetExceededError, consumeBudget } from "./budget";
import type { ExtractResult, FetchErrorKind, FetchProvider, SearchResult } from "./types";

// 公式: https://docs.nimbleway.com/nimble-sdk/sdks/node  (POST /v2/extract, POST /v2/search, Bearer NIMBLE_API_KEY)
const L = judgingConfig.limits;
const limit = createLimiter(L.concurrency, L.minIntervalMs);

function classify(e: unknown): { kind: FetchErrorKind; httpStatus: number | null } {
  if (e instanceof BudgetExceededError) return { kind: "budget", httpStatus: null };
  if (e instanceof APIConnectionTimeoutError) return { kind: "timeout", httpStatus: null };
  if (e instanceof APIConnectionError) return { kind: "connection", httpStatus: null };
  if (e instanceof RateLimitError) return { kind: "rate_limited", httpStatus: 429 };
  if (e instanceof AuthenticationError) return { kind: "auth", httpStatus: 401 };
  if (e instanceof APIError) return { kind: e.status === 404 ? "not_found" : "http_error", httpStatus: e.status ?? null };
  return { kind: "unknown", httpStatus: null };
}

export function createNimbleProvider(): FetchProvider {
  // apiKey は SDK が環境変数 NIMBLE_API_KEY から読む。SDK の自動再試行（429/5xx/接続エラー）を使う。
  const client = new Nimble({ timeout: L.nimbleTimeoutMs, maxRetries: L.maxRetries });
  return {
    name: "nimble",
    async extract(url, { render }): Promise<ExtractResult> {
      try {
        await consumeBudget("nimble");
        const r = await limit(() => client.extract.run({ url, formats: ["markdown", "html"], render }));
        const code = r.status_code ?? null;
        if (r.status !== "success" || (code !== null && code >= 400)) {
          return {
            ok: false,
            kind: code === 404 ? "not_found" : "http_error",
            message: `Nimble extract status=${r.status} http=${code ?? "-"}`,
            httpStatus: code,
            taskId: r.task_id ?? null,
          };
        }
        const text = (url.includes("api.ashbyhq.com") ? r.data.html || r.data.markdown : r.data.markdown || r.data.html) || "";
        return { ok: true, text, finalUrl: r.url || url, httpStatus: code, taskId: r.task_id ?? null };
      } catch (e) {
        const c = classify(e);
        return { ok: false, ...c, message: redact(e), taskId: null };
      }
    },
    async search(query, o): Promise<SearchResult> {
      try {
        await consumeBudget("nimble");
        const r = await limit(() =>
          client.search({
            query,
            max_results: o.maxResults,
            country: o.country,
            locale: o.locale,
            search_depth: o.searchDepth as "lite",
            output_format: "markdown",
          }),
        );
        return {
          ok: true,
          requestId: r.request_id ?? null,
          hits: r.results.map((h) => ({ url: h.url, title: h.title ?? "", description: h.description ?? "", content: h.content ?? "" })),
        };
      } catch (e) {
        return { ok: false, kind: classify(e).kind, message: redact(e) };
      }
    },
  };
}

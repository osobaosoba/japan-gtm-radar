/* eslint-disable @typescript-eslint/no-explicit-any -- Clay API responses are untyped JSON */
import type { ClayAdapter, ClayPerson, ClayRequestPayload } from "./types";

const BASE = "https://api.clay.com/public/v0";

function key(): string {
  const k = process.env.CLAY_PUBLIC_API_KEY?.trim();
  if (!k) throw new Error("CLAY_PUBLIC_API_KEY が未設定です");
  return k;
}

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", "clay-api-key": key(), ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {}
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

export function describeHttpError(status: number, body: any): string {
  const msg = typeof body === "object" && body?.message ? String(body.message).slice(0, 200) : "";
  const kind =
    status === 401 || status === 403 ? "認証・権限エラー" :
    status === 402 ? "プランの上限（検索件数・クレジット）" :
    status === 404 ? "見つからない・使えないエンドポイント" :
    status === 400 || status === 409 || status === 422 ? "リクエストの内容エラー" :
    status === 429 ? "レート制限" :
    status >= 500 ? "Clay側の一時的なエラー" : "想定外のエラー";
  return `${kind}（HTTP ${status}）${msg ? `: ${msg}` : ""}`;
}

const q = (s: string) => `"${s.replace(/["\\]/g, "")}"`;

/** Clayの検索クエリ：名指しした日本の会社に今いて、日本にいて、役職が近い人（1社あたりの人数に上限） */
export function buildPeopleQuery(p: ClayRequestPayload): string {
  const c = p.personCriteria;
  const domains = c.companies.map((x) => q(x.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, ""))).join(", ");
  const titles = c.titleKeywords.map(q).join(", ");
  return `select from people where clay.filter_to_companies((${domains})) and location_country = ${q(c.country)} and experiences.any(is_current = true and job_title is_similar_to (${titles})) limit ${Math.max(1, Math.floor(c.maxPerCompany))} by clay_company_id`;
}

export function mapPerson(r: any, retrievedAt: string, country: string): ClayPerson {
  const exp = Array.isArray(r?.matched_experiences) ? r.matched_experiences[0] : undefined;
  const loc = String(r?.location?.name ?? exp?.location ?? "");
  const inCountry = new RegExp(country, "i").test(loc) || (country === "Japan" && /日本|東京/.test(loc));
  const unknowns = ["Work email (not fetched)", "Whether they influence the decision"];
  if (!inCountry) unknowns.unshift("Whether they're based in Japan");
  return {
    name: String(r?.name ?? "(no name)"),
    title: String(exp?.title ?? "") || "(no title)",
    company: String(exp?.company ?? "") || "(no company)",
    location: loc || "unknown location",
    locationBasis: inCountry ? "clay_location" : "unknown",
    profileUrl: r?.linkedin_url ?? undefined,
    emailStatus: "not_requested",
    provider: "Clay Searches（people）",
    retrievedAt,
    unknowns,
  };
}

/**
 * Clay Public API の Searches（people）で、選んだ入り方で会うべき日本側の担当者の候補を探す。
 * start = 検索を作る（受付）、poll = 1ページ目を取る。
 */
export function createLiveClayAdapter(): ClayAdapter {
  return {
    name: "clay-public-api",
    async start(payload) {
      try {
        const r = await call("/search/query-mode", { method: "POST", body: JSON.stringify({ query: buildPeopleQuery(payload) }) });
        if (r.status >= 300 || !r.body?.search_id) return { ok: false, error: describeHttpError(r.status, r.body) };
        return { ok: true, externalRunId: String(r.body.search_id) };
      } catch (e) {
        return { ok: false, error: `接続エラー: ${(e as Error).name === "AbortError" ? "タイムアウト" : (e as Error).message}` };
      }
    },
    async poll(searchId, payload) {
      try {
        const r = await call(`/search/query-mode/${encodeURIComponent(searchId)}/run`, {
          method: "POST",
          body: JSON.stringify({ limit: payload.personCriteria.maxPeople }),
        });
        if (r.status === 202) return { status: "running" };
        if (r.status >= 300) return { status: "failed", error: describeHttpError(r.status, r.body) };
        const at = new Date().toISOString();
        const people = (Array.isArray(r.body?.data) ? r.body.data : []).slice(0, payload.personCriteria.maxPeople).map((x: any) => mapPerson(x, at, payload.personCriteria.country));
        return {
          status: people.length ? "partial" : "complete",
          people,
          usage: { results: people.length, note: `${people.length} Search result(s), counted toward the plan's search quota. Check credit use via /credits/balance before/after.` },
        };
      } catch (e) {
        return { status: "failed", error: `接続エラー: ${(e as Error).message}` };
      }
    },
  };
}

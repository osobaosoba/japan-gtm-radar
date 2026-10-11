import fs from "node:fs";
import path from "node:path";
import type { FetchProvider, HeuristicFn, JudgeAnswer, JudgeProvider, JudgeQuestion } from "./types";

/**
 * デモモード専用。外部APIを呼ばず fixtures/demo/round{N}.json の架空データを返す。
 * ライブDBには書き込まれない（DBファイルがモードごとに別）。
 */
interface Fixture {
  extract: Record<string, { status: number; text?: string; error?: string }>;
  search: Record<string, { url: string; title: string; description: string; content: string }[]>;
}

export function loadFixture(round: number): Fixture {
  const p = path.join(process.cwd(), "fixtures", "demo", `round${round}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as Fixture;
}

export function createDemoFetchProvider(round: number): FetchProvider {
  const fx = loadFixture(round);
  return {
    name: "demo-fixture",
    async extract(url) {
      const e = fx.extract[url];
      if (!e) return { ok: false, kind: "not_found", message: "デモデータにURLがありません", httpStatus: 404, taskId: null };
      if (e.error) return { ok: false, kind: e.error === "timeout" ? "timeout" : "http_error", message: `デモ: ${e.error}`, httpStatus: e.status || null, taskId: null };
      if (e.status >= 400) return { ok: false, kind: e.status === 404 ? "not_found" : "http_error", message: `HTTP ${e.status}`, httpStatus: e.status, taskId: null };
      return { ok: true, text: e.text ?? "", finalUrl: url, httpStatus: e.status, taskId: `demo-${round}` };
    },
    async search(query) {
      return { ok: true, hits: fx.search[query] ?? [], requestId: `demo-${round}` };
    },
  };
}

const has = (t: string, re: RegExp) => re.test(t);
const noul = (v: number): JudgeAnswer => ({ type: "noul", noul: v });
function choice(options: Record<string, string>, pick: string, conf: number): JudgeAnswer {
  const keys = Object.keys(options);
  const rest = (1 - conf) / Math.max(1, keys.length - 1);
  const probabilities = Object.fromEntries(keys.map((k) => [k, k === pick ? conf : rest]));
  return { type: "choice", choice: pick, confidence: conf, probabilities };
}

const SIGNAL_RE: Record<string, RegExp> = {
  jobs: /(求人|募集職種|職種:|Account Executive|Engineer|Manager|Japan.*(role|position))/i,
  japanese_support: /(日本語(版|ページ|ドキュメント|対応|UI)|お問い合わせ|日本のお客様)/,
  events: /(登壇|カンファレンス|ハッカソン|協賛|出展|ミートアップ|イベント)/,
  media_visit: /(インタビュー|取材|来日|に聞く)/,
  ambassador: /(アンバサダー)/,
  ads: /(広告|キャンペーン|プロモーション)/,
  partners: /(提携|パートナー|共同開発|販売代理|導入支援|出資)/,
  customers: /(導入|採用した|PoC|試験(利用|導入)|実証)/,
  local_presence: /(東京オフィス|日本法人|拠点|カントリーマネージャー|日本代表|子会社化|買収)/,
};

/** デモ用のキーワード規則。実判定(Jev)の代わりに、同じ質問IDへ同じ型で答える */
export const demoHeuristic: HeuristicFn = (state, questions) => {
  const tc = state.target_company as { name: string; exclude_terms?: string[] };
  const ev = (state.evidence ?? {}) as { text?: string; title?: string };
  const ch = (state.change ?? {}) as { after?: string };
  const facts = JSON.stringify(state.facts ?? []) + JSON.stringify(state.confirmed_signals ?? {});
  const t = `${ev.title ?? ""}\n${ev.text ?? ""}\n${ch.after ?? ""}`;
  const vague = has(t, /(とみられる|関係者によると|噂)/);
  const intent = has(t, /(予定|計画|検討|募集|予告|今後|開設へ|目指す|開催予定|応募)/);
  const expand = has(t, /(拡大|増員|2拠点目|第2弾|さらに|継続して|追加で)/);
  const out: Record<string, JudgeAnswer> = {};
  for (const [id, q] of Object.entries(questions) as [string, JudgeQuestion][]) {
    const opts = q.type === "choice" ? q.options : {};
    if (id === "is_target") {
      const other = (tc.exclude_terms ?? []).some((x) => t.includes(x));
      out[id] = noul(other ? 0.06 : t.includes(tc.name) ? 0.92 : 0.5);
    } else if (id === "japan_scope") {
      if (has(t, /(APAC|アジア太平洋)/) && !has(t, /(日本法人|東京オフィス|国内)/)) out[id] = choice(opts, "apac_shared", 0.72);
      else if (has(t, /(日本|国内|東京|大阪|Japan|Tokyo)/)) out[id] = choice(opts, "japan_specific", 0.88);
      else if (has(t, /[\u3040-\u30ff]/)) out[id] = choice(opts, "global_generic", 0.66);
      else out[id] = choice(opts, "not_related", 0.8);
    } else if (id.startsWith("sig_")) {
      const s = id.slice(4);
      out[id] = noul(SIGNAL_RE[s]?.test(t) ? (vague ? 0.6 : 0.9) : 0.08);
    } else if (id.startsWith("st_")) {
      out[id] = choice(opts, expand ? "continued_expanded" : intent ? "intent_plan" : "executed", vague ? 0.3 : 0.82);
    } else if (id === "job_japan_role") out[id] = noul(has(t, /(Japan|Tokyo|日本|東京)/) ? 0.9 : 0.2);
    else if (id === "job_japanese_required") out[id] = noul(has(t, /(Japanese|日本語)/) ? 0.85 : 0.15);
    else if (id === "dedicated_team") out[id] = noul(has(t, /(日本チーム|日本専任|日本担当)/) ? 0.8 : 0.12);
    else if (id === "jp_contact") out[id] = noul(has(t, /(日本のお客様|国内向け|お問い合わせ)/) ? 0.75 : 0.15);
    else if (id === "amb_actual") out[id] = noul(has(t, /(就任|として活動|さんが)/) ? 0.8 : 0.1);
    else if (id === "ad_targeted") out[id] = noul(has(t, /(広告|キャンペーン)/) ? 0.7 : 0.1);
    else if (id === "partner_type")
      out[id] = choice(opts, has(t, /出資/) && !has(t, /提携/) ? "investor_only" : has(t, /共同開発/) ? "co_development" : has(t, /導入支援/) ? "implementation_support" : "sales_partnership", 0.8);
    else if (id === "customer_stage")
      out[id] = choice(opts, has(t, /出資/) && !has(t, /導入/) ? "not_customer" : has(t, /(検討|計画)/) ? "plan" : has(t, /(試験|PoC|実証)/) ? "trial" : has(t, /(削減|向上|%)/) ? "production_outcome" : "production", 0.78);
    else if (id === "event_role") out[id] = choice(opts, intent ? "upcoming" : has(t, /登壇/) ? "speaker" : has(t, /(協賛|出展)/) ? "sponsor" : "host", 0.75);
    else if (id === "media_kind") out[id] = choice(opts, has(t, /来日/) ? "executive_visit" : has(t, /(インタビュー|取材|に聞く)/) ? "direct_interview" : "secondhand", 0.75);
    else if (id === "presence_kind")
      out[id] = choice(opts, intent ? "plan_only" : has(t, /(子会社化|買収)/) ? "acquisition" : has(t, /日本法人/) ? "entity" : has(t, /(カントリーマネージャー|日本代表)/) ? "japan_lead" : "office", 0.8);
    else if (id === "diff_meaningful") out[id] = noul((ch.after ?? "").length > 40 && has(ch.after ?? "", /(日本|国内|東京|Japan)/) ? 0.82 : 0.2);
    else if (id === "stage") {
      const cs = JSON.stringify(state.confirmed_signals ?? {});
      const exec = (cs.match(/実行確認|継続・拡大確認/g) ?? []).length;
      const pick = cs.includes("継続・拡大確認") && exec >= 4 ? "expansion" : exec >= 3 ? "launch" : exec >= 1 ? "preparation" : "exploration";
      out[id] = choice(opts, pick, exec === 2 ? 0.3 : 0.7);
    } else if (id === "motion_direct") out[id] = noul(has(facts, /(東京オフィス|日本法人|カントリーマネージャー|Account Executive)/) ? 0.8 : 0.2);
    else if (id === "motion_partner") out[id] = noul(has(facts, /(販売|代理|パートナー)/) ? 0.75 : 0.15);
    else if (id === "motion_codev") out[id] = noul(has(facts, /共同開発/) ? 0.8 : 0.1);
    else if (id === "motion_dev_community") out[id] = noul(has(facts, /(ハッカソン|ミートアップ|アンバサダー|開発者)/) ? 0.75 : 0.15);
    else if (id === "motion_self_serve") out[id] = noul(has(facts, /(無料|サインアップ|セルフ)/) ? 0.7 : 0.2);
    else out[id] = q.type === "noul" ? noul(0.5) : choice(opts, Object.keys(opts)[0], 0.3);
  }
  return out;
};

export function createDemoJudgeProvider(): JudgeProvider {
  return {
    name: "demo-heuristic",
    model: "demo-heuristic-v1",
    async ask(state, questions) {
      return { model: "demo-heuristic-v1", answers: demoHeuristic(state, questions), usage: {} };
    },
  };
}

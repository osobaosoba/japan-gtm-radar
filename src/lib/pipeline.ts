import { judgingConfig, seedCompanies } from "./config";
import { canonicalUrl, diffLines, excerptAround, fingerprint, normalizeText, parsePublishedDate, selectRelevantText, similarity } from "./normalize";
import { diffJobs, parseAshbyJobs } from "./jobs";
import { SIGNALS, STATUS_RANK, SIGNAL_EN, STATUS_EN, STAGE_EN, type Signal, type SignalStatus } from "./labels";
import { companyAssessmentQuestions, DIFF_QUESTION, evidenceClassificationQuestions, signalDetailQuestions } from "./questions";
import type { FetchProvider, JudgeAnswer, JudgeProvider, JudgeQuestion } from "./providers/types";
import { newId, type CompanyRec, type EvidenceRec, type SignalRec, type SourceRec, type Store } from "./store";
import { redact, sha256 } from "./util";

const T = judgingConfig.thresholds;
const L = judgingConfig.limits;
const V = judgingConfig.questionSetVersion;
const now = () => new Date().toISOString();

export function seedStore(s: Store) {
  for (const c of seedCompanies) {
    if (!s.companies.find((x) => x.slug === c.slug))
      s.companies.push({ slug: c.slug, name: c.name, website: c.website, category: c.category, disambiguation: c.disambiguation, aliases: c.aliases, excludeTerms: c.excludeTerms });
    for (const src of c.sources) {
      if (!s.sources.find((x) => x.companySlug === c.slug && x.url === src.url))
        s.sources.push({ id: newId("src"), companySlug: c.slug, url: src.url, label: src.label, kind: src.kind, format: (src as { format?: string }).format ?? "markdown", reliability: src.reliability, origin: "seed", status: "active", consecutiveFailures: 0 });
    }
  }
}

function addFeed(s: Store, f: Omit<import("./store").FeedRec, "id">) {
  if (s.feed.some((x) => x.dedupeKey === f.dedupeKey)) return;
  s.feed.push({ id: newId("feed"), ...f });
}

function reliabilityFor(url: string, company: CompanyRec): string {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return "unknown"; }
  const own = new URL(company.website).hostname.replace(/^www\./, "");
  if (host === own || host.endsWith("." + own) || host.includes("ashbyhq.com")) return "official";
  if (/prtimes\.jp|businesswire|prnewswire/.test(host)) return "primary_third_party";
  if (/nikkei|itmedia|impress|nikkan|bridge|techcrunch|businessinsider|forbes|diamond|toyokeizai|asahi|yomiuri|mainichi|zdnet|ascii|wired|bloomberg|reuters|cnbc|newspicks/.test(host)) return "media";
  return "unknown";
}

function addEvidence(s: Store, e: Omit<EvidenceRec, "id" | "canonicalUrl" | "relevance">): { ev: EvidenceRec; created: boolean } {
  const existing = s.evidence.find((x) => x.companySlug === e.companySlug && x.fingerprint === e.fingerprint);
  if (existing) return { ev: existing, created: false };
  const ev: EvidenceRec = { id: newId("ev"), canonicalUrl: canonicalUrl(e.url), relevance: "pending", ...e };
  // 同一発表の転載を除去（別URLで本文がほぼ同じ）
  if (ev.origin === "discovery") {
    const dup = s.evidence.find((x) => x.companySlug === ev.companySlug && x.origin === "discovery" && !x.duplicateOfId && x.canonicalUrl !== ev.canonicalUrl && similarity(x.content, ev.content) >= T.duplicateSimilarity);
    if (dup) { ev.duplicateOfId = dup.id; ev.relevance = "duplicate"; }
  }
  s.evidence.push(ev);
  return { ev, created: true };
}

// ---------------- 監視（登録済みURLの定期取得） ----------------
export async function monitorSource(s: Store, src: SourceRec, fetch: FetchProvider) {
  const company = s.companies.find((c) => c.slug === src.companySlug)!;
  const startedAt = now();
  const r = await fetch.extract(src.url, { render: false });
  src.lastAttemptAt = startedAt;
  const runId = newId("fr");
  if (!r.ok) {
    // 取得失敗は「情報なし」「撤退」とは扱わない。最後に成功した日時(lastSuccessAt)は保持する
    src.lastError = `${r.kind}: ${r.message}`;
    src.consecutiveFailures++;
    src.lastHttpStatus = r.httpStatus;
    s.fetchRuns.push({ id: runId, companySlug: src.companySlug, sourceId: src.id, kind: "monitor", provider: fetch.name, request: { url: src.url }, status: "error", httpStatus: r.httpStatus, taskId: r.taskId, error: r.message, startedAt, finishedAt: now() });
    return { status: "error" as const };
  }
  const prevRunHad404 = src.lastHttpStatus === 404;
  src.lastSuccessAt = now();
  src.lastError = undefined;
  src.consecutiveFailures = 0;
  src.lastHttpStatus = r.httpStatus;

  let norm: string;
  let jobs: ReturnType<typeof parseAshbyJobs> | null = null;
  if (src.format === "ashby_json") {
    try {
      jobs = parseAshbyJobs(r.text);
    } catch (e) {
      src.lastError = `parse_error: ${redact(e)}`;
      s.fetchRuns.push({ id: runId, companySlug: src.companySlug, sourceId: src.id, kind: "monitor", provider: fetch.name, request: { url: src.url }, status: "error", error: "JSON parse error", startedAt, finishedAt: now() });
      return { status: "error" as const };
    }
    norm = jobs.map((j) => `${j.externalId}\t${j.contentHash}\t${j.title}\t${j.location}`).sort().join("\n");
  } else {
    norm = normalizeText(r.text);
  }
  const nh = sha256(norm);
  const prev = [...s.snapshots].reverse().find((x) => x.sourceId === src.id);
  if (prev && prev.normalizedHash === nh) {
    s.fetchRuns.push({ id: runId, companySlug: src.companySlug, sourceId: src.id, kind: "monitor", provider: fetch.name, request: { url: src.url }, status: "unchanged", httpStatus: r.httpStatus, taskId: r.taskId, snapshotId: prev.id, startedAt, finishedAt: now() });
    return { status: "unchanged" as const };
  }
  const snap = { id: newId("snap"), sourceId: src.id, url: r.finalUrl, normalizedText: norm.slice(0, 400000), normalizedHash: nh, contentHash: sha256(r.text), fetchedAt: now() };
  s.snapshots.push(snap);
  s.fetchRuns.push({ id: runId, companySlug: src.companySlug, sourceId: src.id, kind: "monitor", provider: fetch.name, request: { url: src.url }, status: "success", httpStatus: r.httpStatus, taskId: r.taskId, snapshotId: snap.id, resultCount: jobs?.length, startedAt, finishedAt: now() });
  const baseline = !prev;

  if (jobs) {
    const openPrev = s.jobs.filter((j) => j.sourceId === src.id && j.status === "open");
    const d = diffJobs(openPrev, jobs);
    let judged = 0;
    for (const j of jobs) {
      const old = s.jobs.find((x) => x.sourceId === src.id && x.externalId === j.externalId);
      const before = old?.description;
      if (old) Object.assign(old, { title: j.title, location: j.location, url: j.url, description: j.description, contentHash: j.contentHash, japanRelated: j.japanRelated, status: "open", lastSeenAt: now() });
      else s.jobs.push({ sourceId: src.id, companySlug: src.companySlug, externalId: j.externalId, title: j.title, location: j.location, url: j.url, description: j.description, publishedAt: j.publishedAt?.toISOString() ?? null, contentHash: j.contentHash, japanRelated: j.japanRelated, status: "open", firstSeenAt: now(), lastSeenAt: now() });
      if (!j.japanRelated) continue;
      const isAdded = d.added.includes(j);
      const isChanged = d.changed.includes(j);
      if (!baseline && !isAdded && !isChanged) continue;
      if (judged++ >= L.maxJobsJudgedPerSource) continue;
      const content = `Job title: ${j.title}\nLocation: ${j.location}\nDepartment: ${j.department}\n\n${j.description}`.slice(0, L.maxStateChars);
      const { ev } = addEvidence(s, { companySlug: src.companySlug, sourceId: src.id, snapshotId: snap.id, origin: "job_posting", url: j.url || src.url, title: `${j.title} (${j.location})`, excerpt: `${j.title} — ${j.location}`, content, publishedAt: j.publishedAt?.toISOString() ?? null, fetchedAt: snap.fetchedAt, reliability: src.reliability, fingerprint: `job:${j.externalId}:${j.contentHash}`, isBaseline: baseline });
      if (!baseline && isAdded) addFeed(s, { companySlug: src.companySlug, type: "job_added", title: `Japan-related job added: ${j.title}`, summary: `${j.location}. A posting is not proof of a completed hire. / 求人掲載は採用完了を意味しません`, signal: "jobs", evidenceId: ev.id, url: j.url, before: "(not listed)", after: `${j.title} — ${j.location}`, dedupeKey: `job_added:${src.id}:${j.externalId}`, occurredAt: snap.fetchedAt });
      if (!baseline && isChanged) addFeed(s, { companySlug: src.companySlug, type: "job_changed", title: `Job description changed: ${j.title}`, summary: j.location, signal: "jobs", evidenceId: ev.id, url: j.url, before: (before ?? "").slice(0, 1500), after: j.description.slice(0, 1500), dedupeKey: `job_changed:${src.id}:${j.externalId}:${j.contentHash}`, occurredAt: snap.fetchedAt });
    }
    for (const c of d.closed) {
      const rec = s.jobs.find((x) => x.sourceId === src.id && x.externalId === c.externalId)!;
      rec.status = "closed";
      rec.closedSeenAt = now();
      if (rec.japanRelated) addFeed(s, { companySlug: src.companySlug, type: "job_closed", title: `Japan-related job no longer listed: ${rec.title}`, summary: "Closed listing does not imply the role was filled. / 掲載終了は採用完了を意味しません", signal: "jobs", url: rec.url, before: `${rec.title} — ${rec.location}`, after: "(not listed)", dedupeKey: `job_closed:${src.id}:${c.externalId}:${snap.id}`, occurredAt: snap.fetchedAt });
    }
    if (baseline) addFeed(s, { companySlug: src.companySlug, type: "baseline", title: `Started monitoring ${src.label}`, summary: `${jobs.length} open roles, ${jobs.filter((j) => j.japanRelated).length} Japan-related. First snapshot — no past changes are inferred.`, url: src.url, dedupeKey: `baseline:${src.id}`, occurredAt: snap.fetchedAt });
    return { status: "success" as const };
  }

  // 通常ページ
  const relevant = selectRelevantText(norm, L.maxStateChars);
  const jpRatio = (t: string) => { const ls = t.split("\n"); return ls.filter((l) => /[\u3040-\u30ff]/.test(l)).length / Math.max(1, ls.length); };
  if (baseline) {
    if (relevant) addEvidence(s, { companySlug: src.companySlug, sourceId: src.id, snapshotId: snap.id, origin: "page", url: src.url, title: src.label, excerpt: excerptAround(relevant), content: relevant, publishedAt: null, fetchedAt: snap.fetchedAt, reliability: src.reliability, fingerprint: `page:${src.id}:${nh}`, isBaseline: !prevRunHad404 });
    if (prevRunHad404 && jpRatio(norm) > 0.4)
      addFeed(s, { companySlug: src.companySlug, type: "jp_page_new", title: `Japanese page now live: ${src.url}`, summary: "Previously returned HTTP 404; now serves Japanese content. Translation alone does not imply a Japan team.", url: src.url, before: "HTTP 404", after: excerptAround(relevant), dedupeKey: `jp_page_new:${src.id}`, occurredAt: snap.fetchedAt });
    addFeed(s, { companySlug: src.companySlug, type: "baseline", title: `Started monitoring ${src.label}`, summary: "First snapshot saved. No past changes are inferred.", url: src.url, dedupeKey: `baseline:${src.id}`, occurredAt: snap.fetchedAt });
    return { status: "success" as const };
  }
  const d = diffLines(prev!.normalizedText, norm);
  if (d.changedChars < T.meaningfulDiffMinChars) return { status: "success" as const }; // 体裁・ナビの揺れはフィードに出さない
  const after = d.added.join("\n").slice(0, 3000);
  const before = d.removed.join("\n").slice(0, 3000);
  addEvidence(s, { companySlug: src.companySlug, sourceId: src.id, snapshotId: snap.id, origin: "page_diff", url: src.url, title: `${src.label} (changed)`, excerpt: excerptAround(after || before), content: after || before, beforeText: before, afterText: after, publishedAt: null, fetchedAt: snap.fetchedAt, reliability: src.reliability, fingerprint: `diff:${prev!.normalizedHash}:${nh}`, isBaseline: false });
  void company;
  return { status: "success" as const };
}

// ---------------- 発見（新しい情報源の検索） ----------------
export async function discoverCompany(s: Store, company: CompanyRec, fetch: FetchProvider) {
  const firstTime = !s.fetchRuns.some((f) => f.companySlug === company.slug && f.kind === "discovery" && f.status === "success");
  const D = judgingConfig.discovery;
  for (const tpl of D.queryTemplates) {
    const query = tpl.replace("{name}", company.name);
    const startedAt = now();
    const r = await fetch.search(query, { maxResults: D.maxResultsPerQuery, country: D.country, locale: D.locale, searchDepth: D.searchDepth });
    if (!r.ok) {
      s.fetchRuns.push({ id: newId("fr"), companySlug: company.slug, kind: "discovery", provider: fetch.name, request: { query }, status: "error", error: r.message, startedAt, finishedAt: now() });
      continue;
    }
    s.fetchRuns.push({ id: newId("fr"), companySlug: company.slug, kind: "discovery", provider: fetch.name, request: { query }, status: "success", resultCount: r.hits.length, startedAt, finishedAt: now() });
    for (const h of r.hits) {
      const content = `${h.title}\n${h.description}\n${h.content}`.slice(0, L.maxStateChars);
      addEvidence(s, { companySlug: company.slug, origin: "discovery", url: h.url, title: h.title, excerpt: (h.description || h.content).slice(0, 240), content, publishedAt: parsePublishedDate(h.description || h.content)?.toISOString() ?? null, fetchedAt: now(), reliability: reliabilityFor(h.url, company), fingerprint: `disc:${canonicalUrl(h.url)}`, isBaseline: firstTime });
    }
  }
}

// ---------------- 判定（Jev） ----------------
async function ask(s: Store, judge: JudgeProvider, company: CompanyRec, scope: string, evidenceId: string | undefined, state: Record<string, unknown>, questions: Record<string, JudgeQuestion>) {
  const inputHash = sha256(JSON.stringify({ state, questions }));
  const cached = s.judgments.find((j) => j.scope === scope && j.inputHash === inputHash && j.questionSetVersion === V && j.provider === judge.name && !j.error);
  if (cached) return { id: cached.id, answers: cached.answers as Record<string, JudgeAnswer>, cached: true };
  const id = newId("jr");
  try {
    const r = await judge.ask(state, questions);
    s.judgments.push({ id, companySlug: company.slug, evidenceId, scope, provider: judge.name, model: r.model, questionSetVersion: V, inputHash, state, questions, answers: r.answers, usage: r.usage, createdAt: now() });
    return { id, answers: r.answers, cached: false };
  } catch (e) {
    s.judgments.push({ id, companySlug: company.slug, evidenceId, scope, provider: judge.name, model: judge.model, questionSetVersion: V, inputHash, state, questions, answers: {}, usage: {}, error: redact(e), createdAt: now() });
    return null;
  }
}

const n = (a: JudgeAnswer | undefined) => (a?.type === "noul" ? a.noul : 0);
const c = (a: JudgeAnswer | undefined) => (a?.type === "choice" ? a : null);

export async function judgeEvidence(s: Store, ev: EvidenceRec, judge: JudgeProvider) {
  if (ev.duplicateOfId || ev.judgedVersion === V) return;
  const company = s.companies.find((x) => x.slug === ev.companySlug)!;
  const state: Record<string, unknown> = {
    target_company: { name: company.name, website: company.website, category: company.category, disambiguation: company.disambiguation, exclude_terms: company.excludeTerms },
    evidence: { url: ev.url, title: ev.title, source_type: ev.origin, published_at: ev.publishedAt ?? "unknown", text: ev.content.slice(0, L.maxStateChars) },
  };
  if (ev.origin === "page_diff") state.change = { before: ev.beforeText ?? "", after: ev.afterText ?? "" };
  const qa = { ...evidenceClassificationQuestions(SIGNALS), ...(ev.origin === "page_diff" ? DIFF_QUESTION : {}) };
  const a = await ask(s, judge, company, "evidence", ev.id, state, qa);
  if (!a) return; // 判定失敗は保留のまま（次回再試行）
  ev.targetProb = n(a.answers.is_target);
  const scope = c(a.answers.japan_scope);
  ev.japanScope = scope?.choice;
  ev.japanScopeConfidence = scope?.confidence;
  ev.judgedVersion = V;
  if (ev.targetProb < T.targetCompanyMin - T.targetCompanyReviewBand) { ev.relevance = "excluded_other_company"; return; }
  if (scope?.choice === "not_related" && (scope.confidence ?? 0) >= T.japanRelevantMin) { ev.relevance = "not_japan"; return; }
  ev.relevance = ev.targetProb < T.targetCompanyMin ? "review" : "relevant";

  if (ev.origin === "page_diff") {
    const meaningful = n(a.answers.diff_meaningful) >= 0.5;
    if (meaningful) addFeed(s, { companySlug: ev.companySlug, type: "page_changed", title: `Page content changed: ${ev.title}`, summary: ev.excerpt, evidenceId: ev.id, url: ev.url, before: ev.beforeText, after: ev.afterText, dedupeKey: `page_changed:${ev.fingerprint}`, occurredAt: ev.fetchedAt });
  }

  const present = SIGNALS.filter((sg) => n(a.answers[`sig_${sg}`]) >= T.signalPresentMin - T.signalReviewBand);
  if (!present.length) return;
  const qb: Record<string, JudgeQuestion> = {};
  for (const sg of present) Object.assign(qb, signalDetailQuestions(sg));
  const b = await ask(s, judge, company, "evidence_detail", ev.id, state, qb);
  if (!b) return;
  for (const sg of present) {
    const rec = buildSignal(ev, sg, n(a.answers[`sig_${sg}`]), b.answers, [a.id, b.id]);
    if (rec) {
      s.signals = s.signals.filter((x) => !(x.evidenceId === ev.id && x.signal === sg && x.reviewState !== "corrected"));
      s.signals.push(rec);
    }
  }
  if (!ev.isBaseline && ev.origin === "discovery" && ev.relevance === "relevant")
    addFeed(s, { companySlug: ev.companySlug, type: "discovery", title: `New source found: ${ev.title}`, summary: ev.excerpt, signal: present[0], evidenceId: ev.id, url: ev.url, dedupeKey: `discovery:${ev.canonicalUrl}`, occurredAt: ev.fetchedAt });
}

function buildSignal(ev: EvidenceRec, sg: Signal, presentProb: number, ans: Record<string, JudgeAnswer>, judgmentIds: string[]): SignalRec | null {
  const st = c(ans[`st_${sg}`]);
  let status = (st?.choice ?? "executed") as SignalStatus;
  const notes: string[] = [];
  const reasons: string[] = [];
  const detail: Record<string, unknown> = {};
  const d = (k: string) => c(ans[k])?.choice;
  switch (sg) {
    case "jobs":
      detail.japan_role = n(ans.job_japan_role); detail.japanese_required = n(ans.job_japanese_required);
      if (status === "continued_expanded") status = "executed";
      if (ev.origin === "job_posting" && status === "intent_plan") status = "executed";
      notes.push("A job posting shows hiring intent/activity, not a completed hire. / 求人掲載は採用完了ではない");
      if (n(ans.job_japan_role) < T.jobJapanRoleMin) reasons.push("Unclear whether the role covers Japan");
      break;
    case "japanese_support":
      detail.dedicated_team = n(ans.dedicated_team); detail.jp_contact = n(ans.jp_contact);
      if (n(ans.dedicated_team) < T.dedicatedTeamMin) notes.push("Translated pages alone do not imply a Japan-dedicated team. / 翻訳ページのみで日本専任体制は推定しない");
      break;
    case "ambassador":
      detail.actual = n(ans.amb_actual);
      if (n(ans.amb_actual) < 0.5) { status = "intent_plan"; notes.push("Only recruitment copy; no confirmed ambassador. / 募集ページのみ。実在は未確認"); }
      break;
    case "partners": {
      const pt = d("partner_type"); detail.partner_type = pt;
      if (pt === "investor_only" || pt === "customer_only") return null; // 投資家・顧客を提携先と混同しない
      break;
    }
    case "customers": {
      const cs = d("customer_stage"); detail.customer_stage = cs;
      if (cs === "not_customer") return null; // 提携先・投資家を顧客と混同しない
      if (cs === "plan") status = "intent_plan";
      if (cs === "trial") { if (status === "continued_expanded") status = "executed"; notes.push("Trial / PoC, not production. / 試験利用（本番導入ではない）"); }
      break;
    }
    case "events": {
      const er = d("event_role"); detail.event_role = er;
      if (er === "upcoming") status = "intent_plan";
      if (er === "mention_only") reasons.push("Role at the event is unclear");
      break;
    }
    case "media_visit": detail.media_kind = d("media_kind"); if (d("media_kind") === "secondhand") reasons.push("Second-hand coverage, not a direct interview"); break;
    case "local_presence": detail.presence_kind = d("presence_kind"); if (d("presence_kind") === "plan_only") status = "intent_plan"; break;
    case "ads": detail.ad_targeted = n(ans.ad_targeted); break;
  }
  if (presentProb < T.signalPresentMin + T.signalReviewBand && presentProb >= T.signalPresentMin - T.signalReviewBand) reasons.push(`Signal presence is borderline (${presentProb.toFixed(2)})`);
  if ((st?.confidence ?? 0) < T.statusConfidenceMin) reasons.push(`Low status confidence (${(st?.confidence ?? 0).toFixed(2)})`);
  if (ev.relevance === "review") reasons.push(`Unclear whether this is the same company (${(ev.targetProb ?? 0).toFixed(2)})`);
  if (ev.japanScope === "global_generic" && sg !== "japanese_support") reasons.push("Content looks global, not Japan-specific");
  if (ev.publishedAt && (Date.now() - new Date(ev.publishedAt).getTime()) / 86400000 > T.staleDays) notes.push("Old evidence; current activity is not confirmed. / 古い証拠のため現在の活動は未確認");
  const dates = `published ${ev.publishedAt ? ev.publishedAt.slice(0, 10) : "unknown"}, fetched ${ev.fetchedAt.slice(0, 10)}`;
  const detailTxt = Object.entries(detail).filter(([, v]) => typeof v === "string").map(([, v]) => v).join(", ");
  return {
    id: newId("sig"), companySlug: ev.companySlug, evidenceId: ev.id, judgmentIds, signal: sg, presentProb, status, statusConfidence: st?.confidence ?? 0, scope: ev.japanScope ?? "unknown", detail,
    fact: `${SIGNAL_EN[sg]}: "${ev.title}"${detailTxt ? ` [${detailTxt}]` : ""} — ${dates}`,
    inference: `${STATUS_EN[status]}${notes.length ? ` (${notes[0].split(" / ")[0]})` : ""}`,
    notes, needsReview: reasons.length > 0, reviewReasons: reasons, reviewState: reasons.length ? "pending" : "auto", createdAt: now(),
  };
}

// ---------------- 会社単位の集約 ----------------
const NEXT_CHECK: Record<Signal, string> = {
  jobs: "Check ATS boards for Japan-located or Japanese-speaking roles",
  japanese_support: "Check for Japanese docs, product UI, and a Japan contact desk",
  events: "Check Japanese conference/hackathon sponsor and speaker lists",
  media_visit: "Search Japanese media for direct interviews or executive visits",
  ambassador: "Look for named community ambassadors active in Japan",
  ads: "Check ad libraries for Japan-targeted ads",
  partners: "Check Japanese SIers/resellers' press releases",
  customers: "Search for Japanese customer case studies (trial vs production)",
  local_presence: "Check corporate registry (gBizINFO) for a Japanese entity / office",
};

export async function assessCompany(s: Store, company: CompanyRec, judge: JudgeProvider) {
  const sigs = s.signals.filter((x) => x.companySlug === company.slug && x.reviewState !== "rejected");
  const counted = sigs.filter((x) => !x.needsReview || x.reviewState === "accepted" || x.reviewState === "corrected");
  const evById = new Map(s.evidence.map((e) => [e.id, e]));
  const signalStatus: Record<string, { status: string; evidenceIds: string[]; stale: boolean; pending: number }> = {};
  for (const sg of SIGNALS) {
    const xs = counted.filter((x) => x.signal === sg);
    let best: SignalStatus = "unconfirmed";
    for (const x of xs) { const st = (x.reviewedStatus ?? x.status) as SignalStatus; if (STATUS_RANK[st] > STATUS_RANK[best]) best = st; }
    const execUrls = new Set(xs.filter((x) => STATUS_RANK[(x.reviewedStatus ?? x.status) as SignalStatus] >= 2).map((x) => evById.get(x.evidenceId)?.canonicalUrl));
    if (best === "executed" && execUrls.size >= 3 && sg !== "jobs") best = "continued_expanded";
    const stale = xs.length > 0 && xs.every((x) => x.notes.some((nn) => nn.startsWith("Old evidence")));
    signalStatus[sg] = { status: best, evidenceIds: xs.map((x) => x.evidenceId), stale, pending: sigs.filter((x) => x.signal === sg && x.needsReview && x.reviewState === "pending").length };
  }
  const facts = counted
    .sort((a, b) => STATUS_RANK[(b.reviewedStatus ?? b.status) as SignalStatus] - STATUS_RANK[(a.reviewedStatus ?? a.status) as SignalStatus])
    .slice(0, 25)
    .map((x) => ({ text: x.fact, evidenceId: x.evidenceId }));
  const inputHash = sha256(JSON.stringify({ signalStatus, facts: facts.map((f) => f.text), V }));
  const last = [...s.assessments].reverse().find((x) => x.companySlug === company.slug);
  if (last && last.inputHash === inputHash) return last; // 同じ証拠なら判定履歴を増やさない

  const confirmed = Object.entries(signalStatus).filter(([, v]) => v.status !== "unconfirmed");
  let stage = "undetermined";
  let stageCandidate: string | undefined;
  let stageConfidence: number | undefined;
  let motions: string[] = [];
  let judgmentId: string | undefined;
  const reasons: string[] = [];
  const counter: string[] = [];
  if (confirmed.length) {
    const state = {
      target_company: { name: company.name, category: company.category },
      confirmed_signals: Object.fromEntries(confirmed.map(([k, v]) => [SIGNAL_EN[k as Signal], STATUS_EN[v.status as SignalStatus]])),
      unconfirmed_signals: Object.entries(signalStatus).filter(([, v]) => v.status === "unconfirmed").map(([k]) => SIGNAL_EN[k as Signal]),
      facts: facts.map((f) => f.text),
    };
    const r = await ask(s, judge, company, "company", undefined, state, companyAssessmentQuestions());
    if (r) {
      judgmentId = r.id;
      const st = c(r.answers.stage);
      stageCandidate = st?.choice; stageConfidence = st?.confidence;
      if (st && st.confidence >= T.stageConfidenceMin) stage = st.choice;
      else reasons.push(`Low stage confidence (${(st?.confidence ?? 0).toFixed(2)})`);
      motions = (["direct", "partner", "codev", "dev_community", "self_serve"] as const).filter((m) => n(r.answers[`motion_${m}`]) >= T.motionMin);
      // 決定的な上限: 証拠が足りない段階を名乗らせない
      const rank = (k: string) => STATUS_RANK[(signalStatus[k]?.status ?? "unconfirmed") as SignalStatus];
      const anyExec = Object.keys(signalStatus).some((k) => rank(k) >= 2);
      const sellingProof = ["local_presence", "customers", "partners"].some((k) => rank(k) >= 2);
      const cap = (to: string, why: string) => { if (stage !== "undetermined" && ["exploration", "preparation", "launch", "expansion"].indexOf(stage) > ["exploration", "preparation", "launch", "expansion"].indexOf(to)) { counter.push(`Model suggested ${STAGE_EN[stage as "launch"]}, capped to ${STAGE_EN[to as "launch"]}: ${why}`); stage = to; } };
      if (!anyExec) cap("exploration", "no executed signal");
      if (!sellingProof) cap("preparation", "no executed local presence, customer or partner");
      if (!Object.values(signalStatus).some((v) => v.status === "continued_expanded")) cap("launch", "no continued/expanded signal");
    } else reasons.push("Judgment call failed; stage left undetermined");
  }
  if (!motions.length) motions = ["undetermined"];
  const unconf = Object.entries(signalStatus).filter(([, v]) => v.status === "unconfirmed").map(([k]) => k as Signal);
  for (const [k, v] of Object.entries(signalStatus)) if (v.stale) counter.push(`${SIGNAL_EN[k as Signal]}: only old evidence`);
  const notesAll = [...new Set(counted.flatMap((x) => x.notes))];
  counter.push(...notesAll);
  if (unconf.length) counter.push(`Unconfirmed (not zero — just not observed yet): ${unconf.map((u) => SIGNAL_EN[u]).join(", ")}`);
  const failing = s.sources.filter((x) => x.companySlug === company.slug && x.lastError);
  if (failing.length) counter.push(`${failing.length} source(s) failed to fetch — absence is NOT inferred`);
  const pending = sigs.filter((x) => x.needsReview && x.reviewState === "pending").length;
  if (pending) reasons.push(`${pending} signal judgment(s) awaiting review`);
  const hypothesis = confirmed.length
    ? `${company.name} reads as "${STAGE_EN[stage as "launch"]}" in Japan, based on ${confirmed.map(([k, v]) => `${SIGNAL_EN[k as Signal]} (${STATUS_EN[v.status as SignalStatus]})`).join(", ")}.`
    : `No Japan-related signal confirmed yet for ${company.name}. Stage is undetermined (not "zero").`;
  const nextChecks = [
    ...Object.entries(signalStatus).filter(([, v]) => v.status === "intent_plan").map(([k]) => `Confirm execution of ${SIGNAL_EN[k as Signal]} (currently intent/plan only)`),
    ...unconf.slice(0, 5).map((u) => NEXT_CHECK[u]),
  ];
  const rec = { id: newId("as"), companySlug: company.slug, inputHash, judgmentId, stage, stageCandidate, stageConfidence, motions, signalStatus, facts, hypothesis, counterpoints: counter, nextChecks, needsReview: reasons.length > 0, reviewReasons: reasons, createdAt: now() };
  if (last) {
    if (last.stage !== stage) addFeed(s, { companySlug: company.slug, type: "stage_changed", title: `Estimated GTM stage: ${STAGE_EN[last.stage as "launch"]} → ${STAGE_EN[stage as "launch"]}`, summary: hypothesis, before: last.stage, after: stage, dedupeKey: `stage:${company.slug}:${last.id}:${stage}`, occurredAt: rec.createdAt });
    for (const sg of SIGNALS) {
      const b = last.signalStatus[sg]?.status ?? "unconfirmed"; const a2 = signalStatus[sg].status;
      if (STATUS_RANK[a2 as SignalStatus] > STATUS_RANK[b as SignalStatus])
        addFeed(s, { companySlug: company.slug, type: "signal_upgraded", title: `${SIGNAL_EN[sg]}: ${STATUS_EN[b as SignalStatus]} → ${STATUS_EN[a2 as SignalStatus]}`, summary: facts.find((f) => signalStatus[sg].evidenceIds.includes(f.evidenceId))?.text ?? "", signal: sg, evidenceId: signalStatus[sg].evidenceIds[0], before: STATUS_EN[b as SignalStatus], after: STATUS_EN[a2 as SignalStatus], dedupeKey: `sigup:${company.slug}:${sg}:${a2}:${last.id}`, occurredAt: rec.createdAt });
    }
  }
  s.assessments.push(rec);
  return rec;
}

export async function runPipeline(s: Store, p: { fetch: FetchProvider; judge: JudgeProvider }, opts: { companies?: string[]; discover?: boolean; trigger?: string } = {}) {
  seedStore(s);
  const run = { id: newId("run"), trigger: opts.trigger ?? "manual", startedAt: now(), status: "running", stats: {} as Record<string, unknown> };
  s.runs.push(run);
  const companies = s.companies.filter((x) => !opts.companies?.length || opts.companies.includes(x.slug));
  await Promise.all(companies.map(async (co) => {
    for (const src of s.sources.filter((x) => x.companySlug === co.slug && x.status === "active")) await monitorSource(s, src, p.fetch);
    if (opts.discover !== false) await discoverCompany(s, co, p.fetch);
    const pending = s.evidence.filter((e) => e.companySlug === co.slug && !e.duplicateOfId && e.judgedVersion !== V);
    await Promise.all(pending.map((e) => judgeEvidence(s, e, p.judge)));
    await assessCompany(s, co, p.judge);
  }));
  run.status = s.fetchRuns.some((f) => f.startedAt >= run.startedAt && f.status === "error") ? "partial" : "success";
  (run as { finishedAt?: string }).finishedAt = now();
  run.stats = { evidence: s.evidence.length, signals: s.signals.length, feed: s.feed.length };
  return run;
}

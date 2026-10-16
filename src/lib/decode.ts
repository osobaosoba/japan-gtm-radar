import fs from "node:fs";
import selfProfile from "../../config/startup-profile.json";
import { DEMO_PROFILES, type StartupProfile } from "./clay/demo-profiles";
import type { ClayAdapter, ClayRequestPayload, ClayRunRec, ClayRunStatus } from "./clay/types";
import { SIGNAL_EN, SIGNAL_LABEL, type Signal } from "./labels";
import { newId, type AssessmentRec, type CompanyRec, type Store } from "./store";
import { sha256 } from "./util";

export type { StartupProfile };
export const LIMITS = { maxPeoplePerRun: 3, maxPeoplePerCompany: 1, maxRunsPerDay: 10 };

/** 相手の会社。Clayには会社のドメインで渡す（同名の会社を拾わないため） */
export interface TargetCompany { name: string; domain: string; why: string }

const T = (name: string, domain: string, why: string): TargetCompany => ({ name, domain, why });
/** 狙う業種ごとの、直接売りに行く相手の大手（Clayの業種名で引く） */
const INDUSTRY_TARGETS: Record<string, TargetCompany[]> = {
  Telecommunications: [T("NTT Docomo Business", "ntt.com", "major telco (enterprise)"), T("KDDI", "kddi.com", "major telco"), T("SoftBank", "softbank.jp", "major telco")],
  Insurance: [T("Tokio Marine", "tokiomarinehd.com", "major P&C insurer"), T("Sompo", "sompo-hd.com", "major P&C insurer"), T("MS&AD", "ms-ad-hd.com", "major P&C insurer")],
  Banking: [T("MUFG", "mufg.jp", "megabank"), T("SMBC Group", "smfg.co.jp", "megabank"), T("Mizuho", "mizuho-fg.co.jp", "megabank")],
  "Financial Services": [T("Nomura", "nomura.com", "major securities firm"), T("Daiwa Securities", "daiwa-grp.jp", "major securities firm")],
};

export const CLAY_STATUS_LABEL: Record<ClayRunStatus | "not_run", string> = {
  not_run: "Not run / 未調査",
  queued: "Queued / 受付済み",
  running: "Running / 実行中",
  complete: "Complete / 完了",
  partial: "Partial / 一部取得",
  failed: "Failed / 失敗",
  skipped_review: "Skipped: not enough evidence / 根拠不足",
};

export function profiles(mode: Store["mode"]): StartupProfile[] {
  if (mode === "demo") return DEMO_PROFILES;
  const override = process.env.STARTUP_PROFILE_PATH;
  return [(override ? JSON.parse(fs.readFileSync(override, "utf8")) : selfProfile) as StartupProfile];
}

const latestAssessment = (s: Store, slug: string): AssessmentRec | undefined =>
  s.assessments.filter((a) => a.companySlug === slug).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

/* ---------- ① Decode the trend：同業がどの順番で何をしたか ---------- */

export interface PeerStep {
  evidenceId: string;
  signal: string;
  label: string;
  labelJa: string;
  kind?: string;
  date: string | null;
  fetchedAt: string;
  title: string;
  url: string;
  fact: string;
  inference: string;
  notes: string[];
  needsReview: boolean;
}

export interface PeerPlaybook {
  company: CompanyRec;
  stage: string;
  motions: string[];
  steps: PeerStep[];
  pendingReview: number;
  usable: boolean;
  issues: string[];
}

const KIND_LABEL: Record<string, string> = {
  sales_partnership: "resale partner",
  co_development: "co-development",
  entity: "Japan entity",
  office: "office / team",
};

/** Radarの最新の判定に含まれる根拠だけで、時系列の動きを作る（同名企業として外された根拠は入らない） */
export function peerPlaybook(s: Store, slug: string): PeerPlaybook | null {
  const company = s.companies.find((c) => c.slug === slug);
  if (!company) return null;
  const a = latestAssessment(s, slug);
  const ids = new Set<string>();
  for (const f of a?.facts ?? []) ids.add(f.evidenceId);
  for (const st of Object.values(a?.signalStatus ?? {})) if (st.status !== "unconfirmed" && !st.stale) st.evidenceIds.forEach((x) => ids.add(x));
  const seen = new Set<string>();
  const steps: PeerStep[] = [];
  for (const id of ids) {
    const e = s.evidence.find((x) => x.id === id);
    const sig = s.signals.filter((x) => x.evidenceId === id).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
    if (!e || !sig || sig.status === "unconfirmed") continue;
    const kind = String(sig.detail?.partner_type ?? sig.detail?.presence_kind ?? "") || undefined;
    const k = `${sig.signal}|${kind}|${e.title.slice(0, 24)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    steps.push({
      evidenceId: id,
      signal: sig.signal,
      label: `${SIGNAL_EN[sig.signal as Signal] ?? sig.signal}${kind && KIND_LABEL[kind] ? ` (${KIND_LABEL[kind]})` : ""}`,
      labelJa: SIGNAL_LABEL[sig.signal as Signal] ?? sig.signal,
      kind,
      date: e.publishedAt ?? null,
      fetchedAt: e.fetchedAt,
      title: e.title,
      url: e.url,
      fact: sig.fact,
      inference: sig.inference,
      notes: sig.notes,
      needsReview: sig.needsReview && sig.reviewState === "pending",
    });
  }
  steps.sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999"));
  const issues: string[] = [];
  if (!a) issues.push("No Radar assessment yet");
  if (!steps.length) issues.push("No confirmed Japan activity (possible same-name companies are excluded)");
  return {
    company,
    stage: a?.stage ?? "undetermined",
    motions: a?.motions ?? [],
    steps,
    pendingReview: steps.filter((x) => x.needsReview).length,
    usable: steps.length > 0,
    issues,
  };
}

export const allPlaybooks = (s: Store) => s.companies.map((c) => peerPlaybook(s, c.slug)).filter((x): x is PeerPlaybook => Boolean(x));

/* ---------- ② Decode the path：自社に合いそうな入り方 ---------- */

export type PathId = "partner_resale" | "codev" | "local_direct";

export interface EntryPath {
  id: PathId;
  label: string;
  labelJa: string;
  summary: string;
  peers: { company: CompanyRec; steps: PeerStep[] }[];
  fit: string[];
  caveats: string[];
  who: { titleKeywords: string[]; companies: TargetCompany[]; why: string };
  firstAsk: string;
}

const PATH_DEF: Record<PathId, Omit<EntryPath, "peers" | "fit" | "caveats" | "who"> & { match: (x: PeerStep) => boolean; titles: string[]; targets?: TargetCompany[]; why: string; caveat: string }> = {
  partner_resale: {
    id: "partner_resale",
    label: "Partner-led resale",
    labelJa: "大手の販売パートナー経由で入る",
    summary: "A large Japanese telco or system integrator (SIer) resells you to its existing enterprise customers.",
    match: (x) => x.signal === "partners" && x.kind === "sales_partnership",
    titles: ["Head of Alliances", "Alliance Manager", "Strategic Partnerships", "Partner Business Development"],
    targets: [
      T("KDDI", "kddi.com", "major telco with an enterprise sales network"),
      T("NTT DATA", "nttdata.com", "major SIer"),
      T("Fujitsu", "fujitsu.com", "major SIer"),
      T("NEC", "nec.com", "major SIer"),
      T("SoftBank", "softbank.jp", "major telco — already Sierra's resale partner, i.e. works with a competitor"),
    ],
    why: "Your peer entered through a resale partnership with a large Japanese company. Start with alliance leads at potential resale partners.",
    caveat: "A partner is not a customer. Time from announcement to actual sales is unknown.",
    firstAsk: "Do you have a program for reselling overseas generative-AI products?",
  },
  codev: {
    id: "codev",
    label: "Co-development",
    labelJa: "日本企業と共同開発して入る",
    summary: "Build a Japanese-language, Japan-specific version with a large Japanese company and ship it as part of their offering.",
    match: (x) => x.signal === "partners" && x.kind === "co_development",
    titles: ["Generative AI", "AI Strategy", "AI Business", "Digital Innovation"],
    targets: [
      T("NTT DATA", "nttdata.com", "major SIer"),
      T("NEC", "nec.com", "major SIer"),
      T("Hitachi", "hitachi.com", "major SIer"),
      T("Nomura Research Institute", "nri.com", "major SIer / consultancy"),
      T("Fujitsu", "fujitsu.com", "major SIer — already Cohere's co-development partner, i.e. works with a competitor"),
    ],
    why: "Your peer entered by co-developing with a Japanese SIer. Start with generative-AI business and product leads.",
    caveat: "Co-development is not revenue. Whether you can sell under your own brand needs separate checking.",
    firstAsk: "Are you looking for co-development partners for Japanese-language or industry-specific AI?",
  },
  local_direct: {
    id: "local_direct",
    label: "Local entity + direct sales",
    labelJa: "日本に拠点を置いて直接売る",
    summary: "Set up a Japan entity or office, hire Japan sales, and sell directly to your target industries.",
    match: (x) => x.signal === "jobs" || (x.signal === "local_presence" && (x.kind === "entity" || x.kind === "office")),
    titles: ["Head of Digital Transformation", "Customer Experience", "Chief Digital Officer", "CIO"],
    why: "Your peers set up a Japan entity/office and hired for Japan. Start with digital-transformation and CX leaders at large companies in your target industries.",
    caveat: "A job posting is not a completed hire. A registered entity does not mean revenue in Japan.",
    firstAsk: "Is there budget for this problem this fiscal year, and who decides?",
  },
};

/** 自分で選んだ近い会社の、根拠のある動きだけから入り方を出す。根拠がなければ何も出さない */
export function entryPaths(s: Store, profile: StartupProfile): { paths: EntryPath[]; blocked: string[] } {
  const books = profile.peers.map((p) => peerPlaybook(s, p)).filter((x): x is PeerPlaybook => Boolean(x));
  const usable = books.filter((b) => b.usable);
  if (!profile.peers.length) return { paths: [], blocked: ["No peers selected yet (peers in config/startup-profile.json)"] };
  if (!usable.length) {
    return {
      paths: [],
      blocked: [
        `None of your peers (${books.map((b) => b.company.name).join(", ") || profile.peers.join(", ")}) has confirmed Japan activity`,
        ...books.flatMap((b) => b.issues.map((i) => `${b.company.name}: ${i}`)),
      ],
    };
  }
  const paths: EntryPath[] = [];
  for (const def of Object.values(PATH_DEF)) {
    const peers = usable.map((b) => ({ company: b.company, steps: b.steps.filter(def.match) })).filter((x) => x.steps.length);
    if (!peers.length) continue;
    const steps = peers.flatMap((x) => x.steps);
    const pending = steps.filter((x) => x.needsReview).length;
    const caveats = [def.caveat];
    if (peers.length === 1) caveats.push(`Only one peer example (${peers[0].company.name})`);
    if (pending) caveats.push(`${pending} piece(s) of evidence not yet human-reviewed`);
    paths.push({
      id: def.id,
      label: def.label,
      labelJa: def.labelJa,
      summary: def.summary,
      peers,
      fit: peers.map((x) => `${x.company.name}, a peer you selected, entered this way (${x.steps.length} evidence items)`),
      caveats,
      who: { titleKeywords: def.titles, companies: (def.targets ?? profile.targetIndustries.flatMap((i) => INDUSTRY_TARGETS[i] ?? [])).slice(0, 5), why: def.why },
      firstAsk: def.firstAsk,
    });
  }
  return { paths, blocked: paths.length ? [] : ["Your peers' activity doesn't match any entry path"] };
}

/** 監視しているすべての会社で、入り方ごとにどの会社が当てはまるか（トレンド） */
export function trendByPath(s: Store) {
  const usable = allPlaybooks(s).filter((b) => b.usable);
  return Object.values(PATH_DEF).map((def) => ({
    id: def.id,
    label: def.label,
    companies: usable.filter((b) => b.steps.some(def.match)).map((b) => ({ name: b.company.name, first: b.steps.filter(def.match)[0] })),
  }));
}

/* ---------- ③ Decode the people：Clayで日本側の会うべき人を探す ---------- */

export const subjectKey = (profileId: string, pathId: string) => `${profileId}:${pathId}`;

export function buildClayPayload(s: Store, profile: StartupProfile, pathId: string): ClayRequestPayload | null {
  const path = entryPaths(s, profile).paths.find((x) => x.id === pathId);
  if (!path || !path.who.companies.length) return null;
  const steps = path.peers.flatMap((p) => p.steps.map((st) => ({ p, st }))).slice(0, 5);
  const personCriteria = { country: "Japan", companies: path.who.companies.map(({ name, domain }) => ({ name, domain })), titleKeywords: path.who.titleKeywords, maxPerCompany: LIMITS.maxPeoplePerCompany, maxPeople: LIMITS.maxPeoplePerRun };
  const researchAsk = `Find the first Japan-side people to meet for "${path.label}"`;
  const key = subjectKey(profile.id, pathId);
  const dedupeKey = sha256(JSON.stringify({ key, ev: steps.map((x) => x.st.evidenceId).sort(), personCriteria, researchAsk })).slice(0, 24);
  return {
    subjectKey: key,
    profile: { name: profile.name, category: profile.category, targetIndustries: profile.targetIndustries },
    path: { id: path.id, label: path.label },
    peerEvidence: steps.map(({ p, st }) => ({ company: p.company.name, url: st.url, publishedAt: st.date, fetchedAt: st.fetchedAt, fact: st.fact, inference: st.inference, caveats: st.notes })),
    personCriteria,
    researchAsk,
    dedupeKey,
  };
}

/** dedupeKeyを渡すと、今の根拠・条件で実行したものだけを返す（条件が変わった前の結果は出さない） */
export const latestClayRun = (s: Store, key: string, dedupeKey?: string): ClayRunRec | undefined =>
  s.clayRuns.filter((r) => r.subjectKey === key && (!dedupeKey || r.dedupeKey === dedupeKey)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

export type StartResult =
  | { kind: "started" | "reused"; run: ClayRunRec }
  | { kind: "blocked"; reasons: string[] }
  | { kind: "unavailable"; reason: string };

const ACTIVE: ClayRunStatus[] = ["queued", "running", "complete", "partial"];

/** 選んだ入り方についてだけ実行。同じ根拠・同じ条件なら新しく実行しない（タイムアウト後の二重実行も防ぐ） */
export async function startClayRun(s: Store, profile: StartupProfile, pathId: string, adapter: ClayAdapter | null, at = new Date()): Promise<StartResult> {
  if (!adapter) return { kind: "unavailable", reason: "CLAY_PUBLIC_API_KEY is not set, so Clay can't run" };
  const { blocked } = entryPaths(s, profile);
  if (blocked.length) return { kind: "blocked", reasons: blocked };
  const payload = buildClayPayload(s, profile, pathId);
  if (!payload) return { kind: "blocked", reasons: ["This path has no evidence or no target companies (e.g. target industries not set)"] };
  const existing = s.clayRuns.find((r) => r.dedupeKey === payload.dedupeKey && r.adapter === adapter.name && ACTIVE.includes(r.status));
  if (existing) return { kind: "reused", run: existing };
  const day = at.toISOString().slice(0, 10);
  const today = s.clayRuns.filter((r) => r.adapter === adapter.name && r.createdAt.startsWith(day)).length;
  if (adapter.name === "clay-public-api" && today >= LIMITS.maxRunsPerDay) return { kind: "unavailable", reason: `Daily Clay run limit reached (${LIMITS.maxRunsPerDay})` };
  const now = at.toISOString();
  const run: ClayRunRec = { id: newId("clay"), subjectKey: payload.subjectKey, adapter: adapter.name, dedupeKey: payload.dedupeKey, payload, status: "queued", people: [], createdAt: now, updatedAt: now };
  s.clayRuns.push(run);
  const r = await adapter.start(payload);
  if (!r.ok) {
    run.status = "failed";
    run.error = r.error;
  } else {
    run.externalRunId = r.externalRunId;
    run.acceptedAt = now;
  }
  run.updatedAt = new Date().toISOString();
  return { kind: "started", run };
}

export async function pollClayRun(run: ClayRunRec, adapter: ClayAdapter | null): Promise<ClayRunRec> {
  if (!adapter || !run.externalRunId || !["queued", "running"].includes(run.status)) return run;
  const r = await adapter.poll(run.externalRunId, run.payload);
  run.status = r.status;
  if (r.people) run.people = r.people;
  if (r.error) run.error = r.error;
  if (r.usage) run.usage = r.usage;
  if (!["queued", "running"].includes(r.status)) run.completedAt = new Date().toISOString();
  run.updatedAt = new Date().toISOString();
  return run;
}

/* ---------- ④ Decode the message：根拠のある事実だけで文案を作る ---------- */

export interface MessageDraft {
  to?: string;
  ja: string;
  en: string;
  evidence: { company: string; title: string; url: string; date: string | null }[];
  placeholders: string[];
}

const ph = (v: string | undefined, label: string) => (v?.trim() ? v.trim() : `[${label}]`);
const plain = (n: string) => n.replace(/\s*(（架空）|\(fictional\))/g, "");
const JA_ASK: Record<PathId, string> = {
  partner_resale: "海外の生成AI製品を販売代理店として扱う枠組みの有無",
  codev: "日本語・業界向けAIの共同開発パートナーを探されているか",
  local_direct: "この課題への今年度のご予算と、ご判断される方",
};

/** English first (for the user); the Japanese version is what goes to a Japanese contact. Only cites Radar evidence */
export function messageDraft(s: Store, profile: StartupProfile, pathId: string, run?: ClayRunRec): MessageDraft | null {
  const path = entryPaths(s, profile).paths.find((x) => x.id === pathId);
  if (!path) return null;
  const ref = path.peers[0];
  const st = ref.steps.find((x) => !x.needsReview) ?? ref.steps[0];
  const person = run?.people[0];
  const me = profile.name ? plain(profile.name) : "[Company]";
  const peer = plain(ref.company.name);
  const when = st.date ? ` (${st.date.slice(0, 10)})` : "";
  const en = [
    `Hi ${person ? plain(person.name).split(" ")[0] : "[Name]"},`,
    ``,
    `I'm ${ph(profile.senderName, "Your name")}, ${ph(profile.senderTitle, "Title")} at ${me}. We build ${profile.oneLiner || "[one-line product description]"}. ${profile.proofPoints[0] ?? "[Proof point — facts only]"}.`,
    `AI companies are entering Japan through ${path.label.toLowerCase()} — for example ${peer}${when} (source: ${st.url}).`,
    `We're exploring Japan too, and would love to ask: ${path.firstAsk}`,
    `Would you have 30 minutes for a call?`,
    ``,
    ph(profile.senderName, "Your name"),
  ].join("\n");
  const ja = [
    person ? `${plain(person.name)}様` : "[ご担当者名]様",
    ``,
    `はじめまして。${me}の${ph(profile.senderName, "お名前")}と申します。${profile.oneLinerJa || "[製品の一言説明（日本語）]"}を提供しております。${profile.proofPoints[0] ? "[実績（日本語）]" : "[実績（事実だけ）]"}。`,
    `${peer}${when}のように、海外のAI企業が${path.labelJa}動きが出ています（出典：${st.url}）。`,
    `弊社も日本での展開を検討しており、${JA_ASK[path.id]}について伺えればと存じます。`,
    `30分ほどお時間をいただけますと幸いです。`,
    ``,
    `${ph(profile.senderName, "お名前")}（${ph(profile.senderTitle, "役職")}）`,
  ].join("\n");
  const placeholders = [...new Set([...(en.match(/\[[^\]]+\]/g) ?? []), ...(ja.match(/\[[^\]]+\]/g) ?? [])].map((x) => x.slice(1, -1)))];
  return {
    to: person ? `${person.name} — ${person.title} @ ${person.company}` : undefined,
    ja,
    en,
    evidence: [{ company: ref.company.name, title: st.title, url: st.url, date: st.date }],
    placeholders,
  };
}

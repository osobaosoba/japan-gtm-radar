import type { ClayRunRec } from "./clay/types";
import fs from "node:fs";
import path from "node:path";
import { getMode, type AppMode } from "./mode";

export interface CompanyRec { slug: string; name: string; website: string; category: string; categoryEn?: string; disambiguation: string; aliases: string[]; excludeTerms: string[] }
export interface SourceRec { id: string; companySlug: string; url: string; label: string; kind: string; format: string; reliability: string; origin: string; status: string; lastAttemptAt?: string; lastSuccessAt?: string; lastError?: string; consecutiveFailures: number; lastHttpStatus?: number | null; intervalHours?: number }
export interface FetchRunRec { id: string; companySlug: string; sourceId?: string; kind: "discovery" | "monitor"; provider: string; request: Record<string, unknown>; status: "success" | "unchanged" | "error"; httpStatus?: number | null; taskId?: string | null; error?: string; resultCount?: number; snapshotId?: string; startedAt: string; finishedAt: string }
export interface SnapshotRec { id: string; sourceId: string; url: string; normalizedText: string; normalizedHash: string; contentHash: string; fetchedAt: string }
export interface EvidenceRec { id: string; companySlug: string; sourceId?: string; snapshotId?: string; origin: string; url: string; canonicalUrl: string; title: string; excerpt: string; content: string; beforeText?: string; afterText?: string; publishedAt?: string | null; fetchedAt: string; reliability: string; fingerprint: string; duplicateOfId?: string; relevance: string; isBaseline: boolean; targetProb?: number; japanScope?: string; japanScopeConfidence?: number; judgedVersion?: string }
export interface JudgmentRec { id: string; companySlug: string; evidenceId?: string; scope: string; provider: string; model: string; questionSetVersion: string; inputHash: string; state: unknown; questions: unknown; answers: unknown; usage: unknown; error?: string; createdAt: string }
export interface SignalRec { id: string; companySlug: string; evidenceId: string; judgmentIds: string[]; signal: string; presentProb: number; status: string; statusConfidence: number; scope: string; detail: Record<string, unknown>; fact: string; inference: string; notes: string[]; needsReview: boolean; reviewReasons: string[]; reviewState: string; reviewedStatus?: string; createdAt: string }
export interface AssessmentRec { id: string; companySlug: string; inputHash: string; judgmentId?: string; stage: string; stageCandidate?: string; stageConfidence?: number; motions: string[]; signalStatus: Record<string, { status: string; evidenceIds: string[]; stale: boolean; pending: number }>; facts: { text: string; evidenceId: string }[]; hypothesis: string; counterpoints: string[]; nextChecks: string[]; needsReview: boolean; reviewReasons: string[]; createdAt: string }
export interface FeedRec { id: string; companySlug: string; type: string; title: string; summary: string; signal?: string; evidenceId?: string; url?: string; before?: string; after?: string; dedupeKey: string; occurredAt: string }
export interface JobRec { sourceId: string; companySlug: string; externalId: string; title: string; location: string; url: string; description: string; publishedAt?: string | null; contentHash: string; japanRelated: boolean; status: "open" | "closed"; firstSeenAt: string; lastSeenAt: string; closedSeenAt?: string }
export interface ReviewRec { id: string; targetType: string; targetId: string; field: string; before: string; after: string; note: string; createdAt: string }
export interface RunRec { id: string; trigger: string; startedAt: string; finishedAt?: string; status: string; stats: Record<string, unknown> }

export interface Store {
  mode: AppMode;
  companies: CompanyRec[];
  sources: SourceRec[];
  fetchRuns: FetchRunRec[];
  snapshots: SnapshotRec[];
  evidence: EvidenceRec[];
  judgments: JudgmentRec[];
  signals: SignalRec[];
  assessments: AssessmentRec[];
  feed: FeedRec[];
  jobs: JobRec[];
  reviews: ReviewRec[];
  runs: RunRec[];
  clayRuns: ClayRunRec[];
}

export const emptyStore = (mode: AppMode): Store => ({ mode, companies: [], sources: [], fetchRuns: [], snapshots: [], evidence: [], judgments: [], signals: [], assessments: [], feed: [], jobs: [], reviews: [], runs: [], clayRuns: [] });

/** demo と live は別ファイル。混在しない */
export function storePath(mode: AppMode = getMode()) {
  return process.env.STORE_PATH_OVERRIDE || path.join(process.cwd(), "data", `${mode}.json`);
}

export function loadStore(mode: AppMode = getMode()): Store {
  const p = storePath(mode);
  if (!fs.existsSync(p)) return emptyStore(mode);
  return { ...emptyStore(mode), ...(JSON.parse(fs.readFileSync(p, "utf8")) as Store), mode };
}

export function saveStore(s: Store) {
  const p = storePath(s.mode);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p + ".tmp", JSON.stringify(s));
  fs.renameSync(p + ".tmp", p);
}

let seq = 0;
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

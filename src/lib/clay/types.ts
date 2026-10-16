/** Clayに渡すデータ。自社プロフィール・選んだ入り方・その根拠（同業の動き）・人物の検索条件 */
export interface ClayRequestPayload {
  subjectKey: string;
  profile: { name: string; category: string; targetIndustries: string[] };
  path: { id: string; label: string };
  peerEvidence: {
    company: string;
    url: string;
    publishedAt: string | null;
    fetchedAt: string;
    fact: string;
    inference: string;
    caveats: string[];
  }[];
  personCriteria: {
    country: string;
    companies: { name: string; domain: string }[];
    titleKeywords: string[];
    maxPerCompany: number;
    maxPeople: number;
  };
  researchAsk: string;
  dedupeKey: string;
}

export type ClayRunStatus = "queued" | "running" | "complete" | "partial" | "failed" | "skipped_review";
export type VerificationState = "verified" | "unverified" | "not_found" | "not_requested";

export interface ClayPerson {
  name: string;
  title: string;
  company: string;
  location: string;
  /** 日本にいる根拠。Clayの勤務地だけなら location_only */
  locationBasis: "clay_location" | "unknown";
  profileUrl?: string;
  workEmail?: string;
  emailStatus: VerificationState;
  provider: string;
  retrievedAt: string;
  unknowns: string[];
}

export interface ClayRunRec {
  id: string;
  subjectKey: string;
  adapter: "demo-sample" | "clay-public-api";
  dedupeKey: string;
  payload: ClayRequestPayload;
  status: ClayRunStatus;
  acceptedAt?: string;
  completedAt?: string;
  externalRunId?: string;
  people: ClayPerson[];
  error?: string;
  usage?: { results?: number; note: string };
  createdAt: string;
  updatedAt: string;
}

export interface ClayAdapter {
  name: ClayRunRec["adapter"];
  start(payload: ClayRequestPayload): Promise<{ ok: true; externalRunId: string } | { ok: false; error: string }>;
  poll(
    externalRunId: string,
    payload: ClayRequestPayload
  ): Promise<{ status: ClayRunStatus; people?: ClayPerson[]; error?: string; usage?: ClayRunRec["usage"] }>;
}

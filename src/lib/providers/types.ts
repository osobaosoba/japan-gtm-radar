export type FetchErrorKind = "timeout" | "rate_limited" | "auth" | "not_found" | "http_error" | "connection" | "budget" | "unknown";

export type ExtractResult =
  | { ok: true; text: string; finalUrl: string; httpStatus: number | null; taskId: string | null }
  | { ok: false; kind: FetchErrorKind; message: string; httpStatus: number | null; taskId: string | null };

export interface SearchHit {
  url: string;
  title: string;
  description: string;
  content: string;
}

export type SearchResult =
  | { ok: true; hits: SearchHit[]; requestId: string | null }
  | { ok: false; kind: FetchErrorKind; message: string };

export interface FetchProvider {
  name: "nimble" | "demo-fixture";
  extract(url: string, opts: { render: boolean }): Promise<ExtractResult>;
  search(query: string, opts: { maxResults: number; country: string; locale: string; searchDepth: string }): Promise<SearchResult>;
}

export type JudgeQuestion =
  | { type: "noul"; prompt: string }
  | { type: "choice"; prompt: string; options: Record<string, string> };

export type JudgeAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> };

export interface JudgeResult {
  model: string;
  answers: Record<string, JudgeAnswer>;
  usage: Record<string, unknown>;
}

export interface JudgeProvider {
  name: "jev" | "demo-heuristic";
  model: string;
  ask(state: Record<string, unknown>, questions: Record<string, JudgeQuestion>, heuristics?: HeuristicFn): Promise<JudgeResult>;
}

/** デモモード用。質問IDごとにキーワード規則で回答を返す */
export type HeuristicFn = (state: Record<string, unknown>, questions: Record<string, JudgeQuestion>) => Record<string, JudgeAnswer>;

import { sha256 } from "./util";

const NAV_LINE = /^(\*|-|\d+\.)?\s*\[?(skip to|sign in|log ?in|ログイン|サインイン|メニュー|menu|cookie|クッキー|privacy|プライバシー|terms|利用規約|©|copyright|all rights reserved)/i;

/**
 * 差分比較用に本文を正規化する。
 * ナビゲーション・リンクだけの行・画像・日時表記など、意味のない揺れを除く。
 */
export function normalizeText(raw: string): string {
  const lines = raw
    .replace(/\r/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // 画像
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // リンクはテキストだけ残す
    .split("\n")
    .map((l) => l.replace(/[\s\u3000]+/g, " ").replace(/^[#>*\-\d.\s]+/, "").trim())
    .filter((l) => l.length > 0)
    .filter((l) => !NAV_LINE.test(l))
    .filter((l) => l.split(" ").length > 2 || /[\u3040-\u30ff\u4e00-\u9fff]/.test(l) && l.length > 6)
    .map((l) => l.replace(/\b\d{4}-\d{2}-\d{2}T[\d:.+Z-]+\b/g, "").trim());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    if (seen.has(l)) continue;
    seen.add(l);
    out.push(l);
  }
  return out.join("\n");
}

export const normalizedHash = (raw: string) => sha256(normalizeText(raw));

export interface LineDiff {
  added: string[];
  removed: string[];
  changedChars: number;
}

/** 行集合の差分（順序入れ替えは変化とみなさない） */
export function diffLines(before: string, after: string): LineDiff {
  const b = new Set(before.split("\n").filter(Boolean));
  const a = new Set(after.split("\n").filter(Boolean));
  const added = [...a].filter((l) => !b.has(l));
  const removed = [...b].filter((l) => !a.has(l));
  const changedChars = [...added, ...removed].reduce((n, l) => n + l.length, 0);
  return { added, removed, changedChars };
}

export const JAPAN_KEYWORDS = [
  "日本", "国内", "東京", "大阪", "株式会社", "合同会社", "Japan", "Japanese", "Tokyo", "Osaka", "APAC", "Asia Pacific", "アジア太平洋", "円",
];

const hasJapanese = (s: string) => /[\u3040-\u30ff]/.test(s);

export function mentionsJapan(s: string): boolean {
  return JAPAN_KEYWORDS.some((k) => s.includes(k)) || hasJapanese(s);
}

/**
 * Jevに渡す本文を選ぶ。日本関連の段落を優先し、文字数上限内に収める
 * （状態が長いと精度が落ちるため: Jev 1.13 jaggedness）。
 */
export function selectRelevantText(text: string, maxChars: number): string {
  const lines = text.split("\n").filter(Boolean);
  const jpPage = lines.filter(hasJapanese).length > lines.length * 0.4;
  const picked: string[] = [];
  let n = 0;
  for (const l of lines) {
    if (!jpPage && !JAPAN_KEYWORDS.some((k) => l.includes(k))) continue;
    if (n + l.length > maxChars) break;
    picked.push(l);
    n += l.length + 1;
  }
  return picked.join("\n");
}

export function excerptAround(text: string, maxLen = 220): string {
  const lines = text.split("\n").filter(Boolean);
  const hit = lines.find((l) => JAPAN_KEYWORDS.some((k) => l.includes(k))) ?? lines[0] ?? "";
  return hit.length > maxLen ? hit.slice(0, maxLen) + "…" : hit;
}

export function canonicalUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    for (const p of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/.test(p)) x.searchParams.delete(p);
    x.hostname = x.hostname.replace(/^www\./, "");
    return x.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

function shingles(s: string, k = 4): Set<string> {
  const t = s.replace(/\s+/g, "").toLowerCase();
  const out = new Set<string>();
  for (let i = 0; i + k <= t.length; i++) out.add(t.slice(i, i + k));
  return out;
}

/** 転載判定用の類似度（文字4-gramのJaccard） */
export function similarity(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export const fingerprint = (s: string) => sha256(s.replace(/\s+/g, "").toLowerCase().slice(0, 4000));

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** 検索結果スニペット先頭の「May 31, 2026 - 」や「2026年5月31日」から発表日を取り出す */
export function parsePublishedDate(text: string): Date | null {
  const en = text.match(/^\s*([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}), (\d{4})/);
  if (en && MONTHS[en[1].toLowerCase()]) return new Date(Date.UTC(+en[3], MONTHS[en[1].toLowerCase()] - 1, +en[2]));
  const ja = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (ja) return new Date(Date.UTC(+ja[1], +ja[2] - 1, +ja[3]));
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  return null;
}

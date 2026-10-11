import { sha256 } from "./util";

export interface ParsedJob {
  externalId: string;
  title: string;
  location: string;
  department: string;
  url: string;
  description: string;
  publishedAt: Date | null;
  contentHash: string;
  japanRelated: boolean;
}

const JP_LOC = /(Japan|Tokyo|Osaka|日本|東京|大阪|JP\b)/i;

export function isJapanRelatedJob(j: { title: string; location: string; description: string }): boolean {
  return JP_LOC.test(j.location) || JP_LOC.test(j.title) || /Japanese|日本語/.test(j.title);
}

const stripHtml = (h: string) =>
  h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();

/** Ashby公開求人API（posting-api/job-board）のJSONを解析する */
export function parseAshbyJobs(raw: string): ParsedJob[] {
  const data = parseLooseJson(raw) as { jobs?: Array<Record<string, unknown>> };
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const secondary = Array.isArray(j.secondaryLocations)
        ? (j.secondaryLocations as Array<{ location?: string }>).map((s) => s.location).filter(Boolean)
        : [];
      const addr = (j.address as { postalAddress?: { addressCountry?: string } } | undefined)?.postalAddress?.addressCountry;
      const location = [j.location as string, ...secondary, addr].filter(Boolean).join(" / ");
      const description = stripHtml(String(j.descriptionHtml ?? j.descriptionPlain ?? ""));
      const title = String(j.title ?? "");
      const base = { title, location, description };
      return {
        externalId: String(j.id ?? j.jobUrl),
        title,
        location,
        department: String(j.department ?? j.team ?? ""),
        url: String(j.jobUrl ?? ""),
        description,
        publishedAt: j.publishedAt ? new Date(String(j.publishedAt)) : null,
        contentHash: sha256(`${title}\n${location}\n${description}`),
        japanRelated: isJapanRelatedJob(base) || /日本|Japan/.test(description.slice(0, 600)),
      };
    });
}

const decode = (t: string) => t.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Nimble の返却(markdown/html)に埋まった JSON を取り出す */
export function parseLooseJson(raw: string): unknown {
  const candidates = [
    raw,
    raw.replace(/\\([\[\]_*`#()!<>{}+\-.|~])/g, "$1"),
    decode(raw.replace(/<[^>]+>/g, "")),
  ];
  for (const c of candidates) {
    const a = c.indexOf("{");
    const b = c.lastIndexOf("}");
    if (a < 0 || b < a) continue;
    try {
      return JSON.parse(c.slice(a, b + 1));
    } catch {
      /* next */
    }
  }
  throw new Error("JSON not found in fetched content");
}

export interface JobDiff {
  added: ParsedJob[];
  changed: ParsedJob[];
  closed: { externalId: string; title: string }[];
  unchanged: ParsedJob[];
}

export function diffJobs(
  previousOpen: { externalId: string; title: string; contentHash: string }[],
  current: ParsedJob[],
): JobDiff {
  const prev = new Map(previousOpen.map((p) => [p.externalId, p]));
  const cur = new Map(current.map((c) => [c.externalId, c]));
  const added: ParsedJob[] = [];
  const changed: ParsedJob[] = [];
  const unchanged: ParsedJob[] = [];
  for (const c of current) {
    const p = prev.get(c.externalId);
    if (!p) added.push(c);
    else if (p.contentHash !== c.contentHash) changed.push(c);
    else unchanged.push(c);
  }
  const closed = previousOpen.filter((p) => !cur.has(p.externalId)).map((p) => ({ externalId: p.externalId, title: p.title }));
  return { added, changed, closed, unchanged };
}

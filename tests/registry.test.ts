import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { diffEntities, matchesCompany, parseHoujinSearch } from "@/lib/registry";
import { intervalHoursFor, isDue, monitorSource, seedStore } from "@/lib/pipeline";
import { emptyStore, type SourceRec } from "@/lib/store";
import type { FetchProvider } from "@/lib/providers/types";

const md = fs.readFileSync(path.join(__dirname, "fixtures", "houjin-corgi.md"), "utf8");
const harvey = `[法人番号：50104030388132026/08/12に新規設立（法人番号登録）\n\n## Harvey AI Japan合同会社\n\n東京都港区赤坂1丁目11番44号赤坂インターシティ5F\n\n業界未設定](https://houjin.jp/c/5010403038813)\n`;

describe("parseHoujinSearch", () => {
  it("extracts corporate number, name, address and registry event", () => {
    const es = parseHoujinSearch(md);
    expect(es).toHaveLength(3);
    expect(es[0]).toMatchObject({ corporateNumber: "1012301014866", name: "Corgi one株式会社", address: "東京都町田市南町田5丁目17番1-605号", eventDate: "2026-06-02", event: "新規設立（法人番号登録）", url: "https://houjin.jp/c/1012301014866" });
    expect(es[2]).toMatchObject({ eventDate: "2026-01-21", event: "所在地変更" });
  });

  it("returns nothing for an empty result page", () => {
    expect(parseHoujinSearch("の企業一覧\n\n1\\-0件を表示\n\n全0件")).toEqual([]);
  });

  it("matches names after width/case normalization", () => {
    const [e] = parseHoujinSearch(harvey.replace("Harvey AI Japan", "Ｈａｒｖｅｙ ＡＩ Ｊａｐａｎ"));
    expect(matchesCompany(e, ["Harvey"])).toBe(true);
    expect(matchesCompany(e, ["Sierra"])).toBe(false);
    expect(matchesCompany({ ...e, name: "Sierra Wireless Japan株式会社" }, ["Sierra"], ["Sierra Wireless"])).toBe(false);
  });

  it("diffs by corporate number", () => {
    const prev = parseHoujinSearch(md);
    const next = parseHoujinSearch(md + harvey);
    const d = diffEntities(prev, next);
    expect(d.added.map((e) => e.corporateNumber)).toEqual(["5010403038813"]);
    expect(d.changed).toEqual([]);
  });
});

describe("monitoring frequency", () => {
  const src = (p: Partial<SourceRec>): SourceRec => ({ id: "s", companySlug: "c", url: "u", label: "l", kind: "official_page", format: "markdown", reliability: "official", origin: "seed", status: "active", consecutiveFailures: 0, ...p });

  it("uses daily for registries and job boards, weekly otherwise", () => {
    expect(intervalHoursFor("corporate_registry")).toBe(24);
    expect(intervalHoursFor("careers_ats")).toBe(24);
    expect(intervalHoursFor("official_page")).toBe(168);
  });

  it("is due when never fetched, after the interval, or after an error", () => {
    const at = new Date("2026-10-12T00:00:00Z");
    expect(isDue(src({}), at)).toBe(true);
    expect(isDue(src({ kind: "corporate_registry", lastAttemptAt: "2026-10-11T12:00:00Z" }), at)).toBe(false);
    expect(isDue(src({ kind: "corporate_registry", lastAttemptAt: "2026-10-11T00:00:00Z" }), at)).toBe(true);
    expect(isDue(src({ lastAttemptAt: "2026-10-09T00:00:00Z" }), at)).toBe(false);
    expect(isDue(src({ lastAttemptAt: "2026-10-11T23:00:00Z", lastError: "timeout" }), at)).toBe(true);
  });
});

describe("registry monitoring", () => {
  const provider = (text: () => string): FetchProvider => ({
    name: "demo-fixture",
    extract: async (url) => ({ ok: true, text: text(), finalUrl: url, httpStatus: 200, taskId: null }),
    search: async () => ({ ok: true, hits: [], requestId: "x" }),
  });

  it("stores a baseline, skips unchanged pages, and feeds new entities", async () => {
    const s = emptyStore("demo");
    seedStore(s);
    const reg = s.sources.find((x) => x.companySlug === "corgi" && x.format === "houjin_search")!;
    expect(reg.intervalHours).toBe(24);
    let page = md;
    const p = provider(() => page);

    expect((await monitorSource(s, reg, p)).status).toBe("success");
    const base = s.evidence.filter((e) => e.origin === "registry");
    expect(base).toHaveLength(3);
    expect(base.every((e) => e.isBaseline)).toBe(true);
    expect(s.feed.filter((f) => f.type === "registry_entity_added")).toHaveLength(0);

    expect((await monitorSource(s, reg, p)).status).toBe("unchanged");

    page = md + harvey.replace(/Harvey AI Japan/g, "Corgi Japan");
    expect((await monitorSource(s, reg, p)).status).toBe("success");
    const added = s.feed.filter((f) => f.type === "registry_entity_added");
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ signal: "local_presence", url: "https://houjin.jp/c/5010403038813" });
    const ev = s.evidence.find((e) => e.id === added[0].evidenceId)!;
    expect(ev).toMatchObject({ origin: "registry", isBaseline: false, publishedAt: "2026-08-12", relevance: "pending" });
  });
});

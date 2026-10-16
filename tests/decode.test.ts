import { describe, expect, it, vi } from "vitest";
import { createDemoClayAdapter } from "../src/lib/clay/demo";
import { DEMO_PROFILES } from "../src/lib/clay/demo-profiles";
import { buildPeopleQuery, describeHttpError, mapPerson } from "../src/lib/clay/live";
import type { ClayAdapter } from "../src/lib/clay/types";
import { buildClayPayload, entryPaths, messageDraft, peerPlaybook, pollClayRun, startClayRun } from "../src/lib/decode";
import { emptyStore, type Store } from "../src/lib/store";

const NOW = "2026-10-11T00:00:00.000Z";
function store(): Store {
  const s = emptyStore("demo");
  const co = (slug: string, name: string) => ({ slug, name, website: `https://${slug}.example`, category: "AI", disambiguation: "", aliases: [], excludeTerms: [] });
  s.companies.push(co("sierra", "Sierra"), co("cohere", "Cohere"), co("corgi", "Corgi"), co("braintrust", "Braintrust"), co("elevenlabs", "ElevenLabs"));
  const ev = (id: string, slug: string, title: string, publishedAt: string | null) =>
    ({ id, companySlug: slug, origin: "page", url: `https://news.example/${id}`, canonicalUrl: `https://news.example/${id}`, title, excerpt: "", content: "", publishedAt, fetchedAt: NOW, reliability: "media", fingerprint: id, relevance: "relevant", isBaseline: false });
  const sig = (evidenceId: string, slug: string, signal: string, detail: Record<string, unknown>, needsReview = false) =>
    ({ id: `sig_${evidenceId}`, companySlug: slug, evidenceId, judgmentIds: [], signal, presentProb: 0.9, status: "executed", statusConfidence: 0.9, scope: "japan_specific", detail, fact: `fact ${evidenceId}`, inference: "Executed", notes: [], needsReview, reviewReasons: [], reviewState: needsReview ? "pending" : "auto", createdAt: NOW });
  s.evidence.push(ev("e1", "sierra", "ソフトバンクとSierra、販売代理店契約", "2026-07-17"), ev("e2", "sierra", "Sierra launches in Japan", "2026-05-12"), ev("e3", "cohere", "富士通とCohere、共同開発", "2024-07-16"), ev("e4", "corgi", "株式会社CORGI（同名）", "2022-03-01"));
  s.signals.push(sig("e1", "sierra", "partners", { partner_type: "sales_partnership" }), sig("e2", "sierra", "local_presence", { presence_kind: "office" }, true), sig("e3", "cohere", "partners", { partner_type: "co_development" }), sig("e4", "corgi", "local_presence", { presence_kind: "entity" }));
  const as = (slug: string, ids: string[], facts: string[]) => ({ id: `as_${slug}`, companySlug: slug, inputHash: "", stage: "launch", motions: [], signalStatus: { partners: { status: ids.length ? "executed" : "unconfirmed", evidenceIds: ids, stale: false, pending: 0 } }, facts: facts.map((evidenceId) => ({ text: "", evidenceId })), hypothesis: "", counterpoints: [], nextChecks: [], needsReview: false, reviewReasons: [], createdAt: NOW });
  s.assessments.push(as("sierra", ["e1", "e2"], ["e1"]), as("cohere", ["e3"], ["e3"]), as("corgi", [], []), as("braintrust", [], []));
  return s;
}
const [cx, llm, insure] = DEMO_PROFILES;

describe("Decode Japan", () => {
  it("builds a dated peer timeline from the latest assessment only (same-name evidence excluded)", () => {
    const s = store();
    expect(peerPlaybook(s, "sierra")!.steps.map((x) => x.date)).toEqual(["2026-05-12", "2026-07-17"]);
    expect(peerPlaybook(s, "corgi")!.usable).toBe(false);
  });

  it("proposes paths only from peers' evidence", () => {
    const s = store();
    expect(entryPaths(s, cx).paths.map((p) => p.id)).toEqual(["partner_resale", "local_direct"]);
    expect(entryPaths(s, llm).paths.map((p) => p.id)).toEqual(["codev"]);
    const local = entryPaths(s, cx).paths.find((p) => p.id === "local_direct")!;
    expect(local.caveats.join()).toContain("not yet human-reviewed");
    expect(entryPaths(s, cx).paths[0].caveats.join()).toContain("A partner is not a customer");
  });

  it("insufficient evidence: no path, no Clay, no message", async () => {
    const s = store();
    expect(entryPaths(s, insure).paths).toEqual([]);
    expect(entryPaths(s, insure).blocked.length).toBeGreaterThan(0);
    expect((await startClayRun(s, insure, "partner_resale", createDemoClayAdapter())).kind).toBe("blocked");
    expect(messageDraft(s, insure, "partner_resale")).toBeNull();
  });

  it("demo adapter returns labelled fictional samples without network", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const s = store();
    const a = createDemoClayAdapter();
    const r = await startClayRun(s, cx, "partner_resale", a);
    if (r.kind !== "started") throw new Error(r.kind);
    await pollClayRun(r.run, a);
    expect(r.run.status).toBe("partial");
    expect(r.run.people.every((p) => p.name.includes("fictional") && p.provider.includes("sample"))).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not run twice for the same evidence and conditions, including after a timeout", async () => {
    const s = store();
    const slow: ClayAdapter = { name: "clay-public-api", start: vi.fn(async () => ({ ok: true as const, externalRunId: "search_1" })), poll: vi.fn(async () => ({ status: "running" as const })) };
    const r1 = await startClayRun(s, cx, "partner_resale", slow);
    if (r1.kind === "started") await pollClayRun(r1.run, slow);
    expect((await startClayRun(s, cx, "partner_resale", slow)).kind).toBe("reused");
    expect(slow.start).toHaveBeenCalledTimes(1);
  });

  it("records failures as failed (not 'not found') and allows retry", async () => {
    const s = store();
    const bad: ClayAdapter = { name: "clay-public-api", start: vi.fn(async () => ({ ok: false as const, error: describeHttpError(402, { message: "limit" }) })), poll: vi.fn() };
    const r = await startClayRun(s, llm, "codev", bad);
    expect(r.kind === "started" && r.run.status).toBe("failed");
    expect(r.kind === "started" && r.run.error).toContain("402");
    expect((await startClayRun(s, llm, "codev", bad)).kind).toBe("started");
  });

  it("without a key the live adapter is unavailable", async () => {
    expect((await startClayRun(store(), cx, "partner_resale", null)).kind).toBe("unavailable");
  });

  it("payload carries peer evidence, criteria and a stable dedupe key", () => {
    const s = store();
    const p = buildClayPayload(s, cx, "partner_resale")!;
    expect(p.peerEvidence[0].url).toContain("news.example");
    expect(p.personCriteria.country).toBe("Japan");
    expect(buildClayPayload(s, cx, "partner_resale")!.dedupeKey).toBe(p.dedupeKey);
    const query = buildPeopleQuery(p);
    expect(query).toContain('clay.filter_to_companies(("kddi.com", "nttdata.com", "fujitsu.com", "nec.com", "softbank.jp"))');
    expect(query).toContain('location_country = "Japan"');
    expect(query).toContain("limit 1 by clay_company_id");
    const direct = buildClayPayload(s, cx, "local_direct")!;
    expect(direct.personCriteria.companies.map((c) => c.domain)).toEqual(["ntt.com", "kddi.com", "softbank.jp", "tokiomarinehd.com", "sompo-hd.com"]);
  });

  it("message cites the peer evidence and uses placeholders instead of invented claims", () => {
    const m = messageDraft(store(), cx, "partner_resale")!;
    expect(m.ja).toContain("出典：https://news.example/e1");
    expect(m.en).toContain("https://news.example/e1");
    expect(m.placeholders).toEqual(expect.arrayContaining(["Your name", "Proof point — facts only", "Name", "ご担当者名", "実績（事実だけ）"]));
    expect(m.en).not.toContain("fictional");
    expect(m.evidence[0].url).toBe("https://news.example/e1");
  });

  it("live mapping flags people whose location is not in Japan", () => {
    const p = mapPerson({ name: "A B", location: { name: "London" }, matched_experiences: [{ title: "Alliance", company: "X" }] }, NOW, "Japan");
    expect(p.unknowns).toContain("Whether they're based in Japan");
    expect(p.emailStatus).toBe("not_requested");
  });
});

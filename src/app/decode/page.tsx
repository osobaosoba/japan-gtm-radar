import Link from "next/link";
import { getClayAdapter } from "@/lib/clay";
import {
  CLAY_STATUS_LABEL, LIMITS, allPlaybooks, buildClayPayload, entryPaths, latestClayRun, messageDraft, profiles, subjectKey, trendByPath,
} from "@/lib/decode";
import { getMode } from "@/lib/mode";
import { loadStore } from "@/lib/store";
import { STAGE_EN, type Stage } from "@/lib/labels";
import { seedCompanies } from "@/lib/config";
import { d } from "../ui";
import { refreshClay, runClay } from "./actions";
import { CopyButton } from "./copy";

export const dynamic = "force-dynamic";

const EMAIL: Record<string, string> = { verified: "Verified", unverified: "Unverified", not_found: "Not found", not_requested: "Not fetched" };

export default async function Decode({ searchParams }: { searchParams: Promise<{ profile?: string; path?: string }> }) {
  const sp = await searchParams;
  const s = loadStore();
  const demo = getMode() === "demo";
  const list = profiles(s.mode);
  const profile = list.find((p) => p.id === sp.profile) ?? list[0];
  const books = allPlaybooks(s);
  const trend = trendByPath(s);
  const { paths, blocked } = entryPaths(s, profile);
  const path = paths.find((p) => p.id === sp.path) ?? paths[0];
  const key = path ? subjectKey(profile.id, path.id) : "";
  const payload = path ? buildClayPayload(s, profile, path.id) : null;
  const run = payload ? latestClayRun(s, key, payload.dedupeKey) : undefined;
  const staleRun = payload && !run ? latestClayRun(s, key) : undefined;
  const draft = path ? messageDraft(s, profile, path.id, run) : null;
  const canRun = Boolean(getClayAdapter());
  const href = (p: string, pa?: string) => `/decode?profile=${p}${pa ? `&path=${pa}` : ""}`;
  return (
    <>
      <h1>Decode Japan <span className="muted" style={{ fontSize: 16 }}>日本を読み解く</span></h1>
      <div className="sub">
        For AI startups planning to enter Japan. Decode how peers actually entered (evidence from the Radar), which path fits you, who to meet on the Japan side, and what to say. You make the call.
      </div>

      <div className="card">
        <b>Your company:</b>
        {list.map((p) => (
          <Link key={p.id} href={href(p.id)} className={`chip ${p.id === profile.id ? "on" : ""}`}>{p.name || "(not set: config/startup-profile.json)"}</Link>
        ))}
        {profile.fictional && <span className="pill sample">Fictional demo company</span>}
        <div className="muted" style={{ marginTop: 6 }}>
          {profile.oneLiner || "Product: not set"} · Category: {profile.category || "not set"} · Target industries: {profile.targetIndustries.join(", ") || "not set"} · Peers you picked: {profile.peers.join(", ") || "none"}
        </div>
      </div>

      <section className="card layer radar">
        <div className="layer-h">① Decode the trend — what peers did in Japan, in order (Radar evidence)</div>
        <table>
          <thead><tr><th>Company</th><th>Stage</th><th>Japan activity (oldest first, by publication date)</th></tr></thead>
          <tbody>
            {books.map((b) => (
              <tr key={b.company.slug} className={profile.peers.includes(b.company.slug) ? "hl" : ""}>
                <td><Link href={`/companies/${b.company.slug}`}>{b.company.name}</Link>{profile.peers.includes(b.company.slug) && <div className="pill sample">Your peer</div>}<div className="muted">{seedCompanies.find((c) => c.slug === b.company.slug)?.categoryEn ?? b.company.category}</div></td>
                <td><span className="pill stage">{STAGE_EN[b.stage as Stage]}</span>{b.pendingReview > 0 && <div className="pill review">Needs review: {b.pendingReview}</div>}</td>
                <td>
                  {!b.usable && <span className="muted">{b.issues.join("／")}</span>}
                  <div className="steps">
                    {b.steps.slice(0, 12).map((st) => (
                      <a key={st.evidenceId} href={st.url} target="_blank" className={`step ${st.needsReview ? "pending" : ""}`} title={`${st.labelJa}\nFact: ${st.fact}\nInference: ${st.inference}`}>
                        <span className="muted">{st.date ? d(st.date) : "date unknown"}</span> {st.label}
                      </a>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 8 }}>
          <b>Entry paths seen so far:</b> 
          {trend.map((t) => <span key={t.id} className="muted" style={{ marginRight: 12 }}>{t.label}: {t.companies.map((c) => c.name).join(", ") || "no examples yet"}</span>)}
        </div>
        <div className="muted">Dashed = not yet human-reviewed. Hover a chip for the fact vs. inference.</div>
      </section>

      <section className="card layer hyp">
        <div className="layer-h">② Decode the path — entry paths that may fit you (inference; you decide)</div>
        {blocked.length > 0 && (
          <div className="card block">
            <b>No path suggested</b> — not enough evidence.
            <ul className="tight">{blocked.map((x) => <li key={x}>{x}</li>)}</ul>
            Next: pick different peers, or add your peers to the Radar&apos;s monitoring.
          </div>
        )}
        {paths.map((p) => (
          <div key={p.id} className={`ev path ${path?.id === p.id ? "on" : ""}`}>
            <Link href={href(profile.id, p.id)}><b>{p.label}</b> <span className="muted">{p.labelJa}</span></Link>
            {path?.id === p.id && <span className="pill live-clay">Selected</span>}
            <div>{p.summary}</div>
            <div><span className="tag fact">Evidence</span> {p.peers.flatMap((x) => x.steps.slice(0, 2).map((st) => (
              <a key={st.evidenceId} href={st.url} target="_blank" style={{ marginRight: 10 }}>{x.company.name}: {st.title.slice(0, 50)} ({st.date ? d(st.date) : "date unknown"})</a>
            )))}</div>
            <div><span className="tag infer">Why it may fit</span> {p.fit.join(" / ")}</div>
            <div className="muted">Caveats: {p.caveats.join(" / ")}</div>
          </div>
        ))}
      </section>

      <section className="card layer clay">
        <div className="layer-h">
          ③ Decode the people — who to meet on the Japan side (Clay) {run && <span className={`pill clay-${run.status}`}>{CLAY_STATUS_LABEL[run.status]}</span>}
          {(run?.adapter === "demo-sample" || (demo && !run && path)) && <span className="pill sample">Clay demo sample — not real Clay results</span>}
          {run?.adapter === "clay-public-api" && <span className="pill live-clay">Real results from the Clay Public API</span>}
        </div>
        {!path && <div className="muted">No entry path, so Clay is not run.</div>}
        {path && (
          <div>
            Who to look for: {path.who.why}
            <div><b>Target companies:</b> {path.who.companies.length ? path.who.companies.map((c) => <span key={c.domain} className="chip" title={c.domain}>{c.name}<span className="muted"> — {c.why}</span></span>) : "No target industries set, so no target companies"}</div>
            <div className="muted">Criteria: currently at the companies above · based in Japan · titles {path.who.titleKeywords.join(", ")} · up to {LIMITS.maxPeoplePerCompany} per company · max {LIMITS.maxPeoplePerRun} people</div>
          </div>
        )}
        {path && !run && (
          <div style={{ marginTop: 6 }}>
            {staleRun ? `Previous result (${d(staleRun.createdAt)}) is hidden because the evidence or criteria changed. ` : "Not searched yet. "}
            {canRun ? <form action={runClay.bind(null, profile.id, path.id)} style={{ display: "inline" }}><button className="btn primary">Find people with Clay</button></form> : "(CLAY_PUBLIC_API_KEY is not set)"}
          </div>
        )}
        {run && (
          <>
            <div className="muted">Accepted {run.acceptedAt ? d(run.acceptedAt) : "—"} · Completed {run.completedAt ? d(run.completedAt) : "—"} · Via {run.adapter === "demo-sample" ? "demo sample (no external call)" : "Clay Public API (Searches: people)"}</div>
            {run.error && <div className="warn">Error: {run.error}</div>}
            {["queued", "running"].includes(run.status) && <form action={refreshClay.bind(null, profile.id, path!.id)}><button className="btn">Check results</button></form>}
            {run.people.length === 0 && ["complete", "partial"].includes(run.status) && <div className="warn">No matching people found. We never make people up.</div>}
            {run.people.length > 0 && (
              <table>
                <thead><tr><th>Name</th><th>Title</th><th>Company</th><th>Location</th><th>Profile</th><th>Work email</th><th>Source / retrieved</th><th>Unknowns</th></tr></thead>
                <tbody>
                  {run.people.map((p) => (
                    <tr key={p.name + p.company}>
                      <td>{p.name}</td><td>{p.title}</td><td>{p.company}</td>
                      <td>{p.location}<div className="muted">{p.locationBasis === "clay_location" ? "basis: Clay location" : "Japan location unconfirmed"}</div></td>
                      <td>{p.profileUrl ? <a href={p.profileUrl} target="_blank">Open</a> : "none"}</td>
                      <td>{p.workEmail ?? "—"} <span className={`pill e-${p.emailStatus}`}>{EMAIL[p.emailStatus]}</span></td>
                      <td className="muted">{p.provider}<br />{d(p.retrievedAt)}</td>
                      <td className="muted">{p.unknowns.join(" / ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {run.usage && <div className="muted">Usage: {run.usage.note}</div>}
          </>
        )}
        {payload && (
          <details style={{ marginTop: 8 }}>
            <summary>Preview of the data sent to Clay (dedupe key {payload.dedupeKey})</summary>
            <pre>{JSON.stringify(payload, null, 2)}</pre>
          </details>
        )}
      </section>

      <section className="card layer next">
        <div className="layer-h">④ Decode the message — what to say (draft only; nothing is sent)</div>
        {!draft && <div className="muted">No entry path, so no draft.</div>}
        {draft && (
          <>
            <div><b>To:</b> {draft.to ?? "no one yet (run Clay in ③)"}</div>
            <div><b>First question:</b> {path?.firstAsk}</div>
            <div className="muted">Evidence cited: {draft.evidence.map((e) => <a key={e.url} href={e.url} target="_blank">{e.company}: {e.title.slice(0, 40)} ({e.date ? d(e.date) : "date unknown"})</a>)} {draft.placeholders.length > 0 && <>· To fill in: {draft.placeholders.join(" / ")}</>}</div>
            <div className="drafts">
              <div><div className="muted">English</div><pre className="draft">{draft.en}</pre><CopyButton text={draft.en} /></div>
              <div><div className="muted">Send in Japanese 日本語版 — same message for a Japanese contact; have a native speaker check it before sending</div><pre className="draft">{draft.ja}</pre><CopyButton text={draft.ja} /></div>
            </div>
          </>
        )}
      </section>
    </>
  );
}

import { notFound } from "next/navigation";
import { loadStore } from "@/lib/store";
import { SIGNALS, SIGNAL_EN, SIGNAL_LABEL, SCOPE_LABEL, RELIABILITY_LABEL, ORIGIN_LABEL } from "@/lib/labels";
import { StatusPill, StagePill, Motions, d } from "../../ui";

export default async function Company({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = loadStore();
  const c = s.companies.find((x) => x.slug === slug);
  if (!c) notFound();
  const a = [...s.assessments].reverse().find((x) => x.companySlug === slug);
  const ev = new Map(s.evidence.map((e) => [e.id, e]));
  const sigs = s.signals.filter((x) => x.companySlug === slug);
  const excluded = s.evidence.filter((e) => e.companySlug === slug && ["excluded_other_company", "duplicate"].includes(e.relevance));
  const timeline = sigs.map((x) => ({ x, e: ev.get(x.evidenceId)! })).sort((p, q) => (q.e.publishedAt ?? q.e.fetchedAt).localeCompare(p.e.publishedAt ?? p.e.fetchedAt));
  const changes = s.feed.filter((f) => f.companySlug === slug).sort((p, q) => q.occurredAt.localeCompare(p.occurredAt));
  const jobs = s.jobs.filter((j) => j.companySlug === slug && j.japanRelated);
  return (
    <>
      <h1>{c.name} <span className="muted">{c.category} · <a href={c.website}>{c.website}</a></span></h1>
      <div className="sub">Identity: {c.disambiguation}</div>
      {a ? (
        <div className="card">
          <div><StagePill s={a.stage} /> <Motions m={a.motions} /> {a.stageCandidate && <span className="muted">Jev stage: {a.stageCandidate} (confidence {a.stageConfidence?.toFixed(2)})</span>} {a.needsReview && <span className="pill review">Needs review: {a.reviewReasons.join("; ")}</span>}</div>
          <h2>GTM hypothesis / 仮説 <span className="muted">(inference)</span></h2>
          <div>{a.hypothesis}</div>
          <div className="grid">
            <div><h2>Supporting facts / 確認できた事実</h2><ul>{a.facts.map((f, i) => <li key={i}><a href={ev.get(f.evidenceId)?.url}>{f.text}</a></li>)}</ul></div>
            <div><h2>Counter-evidence & uncertainty / 反対材料・不確実な点</h2><ul>{a.counterpoints.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <h2>Next checks / 次に確認すべき情報</h2><ul>{a.nextChecks.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          </div>
        </div>
      ) : <div className="card">Not assessed yet.</div>}
      <h2>Signals / シグナル</h2>
      <table><thead><tr>{SIGNALS.map((sg) => <th key={sg}>{SIGNAL_EN[sg]}<br /><span className="muted">{SIGNAL_LABEL[sg]}</span></th>)}</tr></thead>
        <tbody><tr>{SIGNALS.map((sg) => <td key={sg}><StatusPill s={a?.signalStatus[sg]?.status ?? "unconfirmed"} /></td>)}</tr></tbody></table>
      <h2>Japan activity timeline & evidence / 時系列と根拠</h2>
      <table>
        <thead><tr><th>Published / 発表日</th><th>Fetched / 取得日</th><th>Signal</th><th>Status</th><th>Evidence</th><th>Jev confidence</th><th>Source reliability</th><th>Fact vs inference</th></tr></thead>
        <tbody>{timeline.map(({ x, e }) => (
          <tr key={x.id}>
            <td>{d(e.publishedAt)}</td><td>{d(e.fetchedAt)}</td>
            <td>{SIGNAL_EN[x.signal as "jobs"]}</td>
            <td><StatusPill s={x.reviewedStatus ?? x.status} />{x.needsReview && x.reviewState === "pending" && <div><span className="pill review">Needs review</span></div>}</td>
            <td style={{ maxWidth: 360 }}><a href={e.url}>{e.title}</a><div className="muted">{ORIGIN_LABEL[e.origin]} · {SCOPE_LABEL[e.japanScope ?? ""] ?? e.japanScope}</div><div className="muted">“{e.excerpt}”</div></td>
            <td>presence {x.presentProb.toFixed(2)}<br />status {x.statusConfidence.toFixed(2)}<br />same-company {(e.targetProb ?? 0).toFixed(2)}</td>
            <td>{RELIABILITY_LABEL[e.reliability] ?? e.reliability}</td>
            <td style={{ maxWidth: 260 }}><b>Fact:</b> {x.fact}<br /><b>Inference:</b> {x.inference}{x.reviewReasons.length > 0 && <div className="muted">Review: {x.reviewReasons.join("; ")}</div>}</td>
          </tr>))}</tbody>
      </table>
      <h2>Job & page change history / 求人・ページの変更履歴</h2>
      <table><thead><tr><th>Date</th><th>Change</th><th>Before → After</th></tr></thead>
        <tbody>{changes.map((f) => <tr key={f.id}><td>{d(f.occurredAt)}</td><td>{f.title}<div className="muted">{f.summary}</div></td><td>{(f.before || f.after) && <><pre className="del">{f.before}</pre><pre className="ins">{f.after}</pre></>}</td></tr>)}</tbody></table>
      <h2>Japan-related job postings / 日本関連求人 ({jobs.length})</h2>
      <table><thead><tr><th>Title</th><th>Location</th><th>Status</th><th>First seen</th><th>Last seen</th></tr></thead>
        <tbody>{jobs.map((j) => <tr key={j.externalId}><td><a href={j.url}>{j.title}</a></td><td>{j.location}</td><td>{j.status === "open" ? "Open" : "No longer listed (not proof of hire)"}</td><td>{d(j.firstSeenAt)}</td><td>{d(j.lastSeenAt)}</td></tr>)}</tbody></table>
      <h2>Excluded evidence / 除外した証拠 ({excluded.length})</h2>
      <table><tbody>{excluded.map((e) => <tr key={e.id}><td>{e.relevance === "duplicate" ? "Duplicate / reprint" : `Different company (same-company prob ${(e.targetProb ?? 0).toFixed(2)})`}</td><td><a href={e.url}>{e.title}</a></td></tr>)}</tbody></table>
    </>
  );
}

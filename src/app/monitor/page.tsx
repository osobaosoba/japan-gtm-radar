import { loadStore } from "@/lib/store";
import { SIGNAL_EN } from "@/lib/labels";
import { StatusPill, d } from "../ui";

export default function Monitor() {
  const s = loadStore();
  const name = (slug: string) => s.companies.find((c) => c.slug === slug)?.name ?? slug;
  const ev = new Map(s.evidence.map((e) => [e.id, e]));
  const review = s.signals.filter((x) => x.needsReview && x.reviewState === "pending");
  const runs = [...s.fetchRuns].reverse().slice(0, 40);
  return (
    <>
      <h1>Monitoring & review / 監視・確認</h1>
      <h2>Monitored sources / 監視URL ({s.sources.filter((x) => x.status === "active").length})</h2>
      <table><thead><tr><th>Company</th><th>URL</th><th>Kind</th><th>Last success / 最終成功</th><th>Last attempt</th><th>Error</th></tr></thead>
        <tbody>{s.sources.map((x) => <tr key={x.id}><td>{name(x.companySlug)}</td><td><a href={x.url}>{x.label}</a><div className="muted">{x.url}</div></td><td>{x.kind}</td><td>{d(x.lastSuccessAt)}</td><td>{d(x.lastAttemptAt)}</td><td>{x.lastError ? <span className="pill review" title={x.lastError}>{x.lastError.slice(0, 60)}</span> : "—"}{x.lastError && <div className="muted">Fetch failure ≠ absence</div>}</td></tr>)}</tbody></table>
      <h2>Needs review / 要確認 ({review.length})</h2>
      <table><thead><tr><th>Company</th><th>Signal</th><th>Status</th><th>Evidence</th><th>Reason</th></tr></thead>
        <tbody>{review.map((x) => <tr key={x.id}><td>{name(x.companySlug)}</td><td>{SIGNAL_EN[x.signal as "jobs"]}</td><td><StatusPill s={x.status} /></td><td><a href={ev.get(x.evidenceId)?.url}>{ev.get(x.evidenceId)?.title}</a></td><td>{x.reviewReasons.join("; ")}</td></tr>)}</tbody></table>
      <h2>Recent fetch runs / 取得履歴</h2>
      <table><thead><tr><th>Time</th><th>Company</th><th>Kind</th><th>Provider</th><th>Request</th><th>Status</th><th>Results</th></tr></thead>
        <tbody>{runs.map((r) => <tr key={r.id}><td>{r.startedAt.slice(0, 16).replace("T", " ")}</td><td>{name(r.companySlug)}</td><td>{r.kind}</td><td>{r.provider}</td><td className="muted">{String(r.request.url ?? r.request.query)}</td><td>{r.status}{r.httpStatus ? ` (${r.httpStatus})` : ""}</td><td>{r.resultCount ?? ""}</td></tr>)}</tbody></table>
    </>
  );
}

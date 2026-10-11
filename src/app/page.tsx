import Link from "next/link";
import { loadStore } from "@/lib/store";
import { SIGNALS, SIGNAL_EN, SIGNAL_LABEL, STAGES, STAGE_EN } from "@/lib/labels";
import { StatusPill, StagePill, Motions, d } from "./ui";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = await searchParams;
  const s = loadStore();
  const rows = s.companies.map((c) => {
    const a = [...s.assessments].reverse().find((x) => x.companySlug === c.slug);
    const feed = s.feed.filter((f) => f.companySlug === c.slug && f.type !== "baseline").sort((x, y) => y.occurredAt.localeCompare(x.occurredAt))[0];
    const lastOk = s.sources.filter((x) => x.companySlug === c.slug).map((x) => x.lastSuccessAt ?? "").sort().pop();
    const pending = s.signals.filter((x) => x.companySlug === c.slug && x.needsReview && x.reviewState === "pending").length;
    return { c, a, feed, lastOk, pending };
  }).filter((r) => (!q.stage || r.a?.stage === q.stage) && (!q.signal || (r.a && r.a.signalStatus[q.signal]?.status !== "unconfirmed")) && (!q.review || r.pending > 0));
  const f = (k: string, v?: string) => { const p = new URLSearchParams(q); if (v) p.set(k, v); else p.delete(k); return `/?${p}`; };
  return (
    <>
      <h1>GTM readout — overseas AI startups in Japan / 日本市場GTMヨミ表</h1>
      <div className="sub">Every cell is derived from evidence fetched with Nimble and classified by Jev. Unconfirmed ≠ zero. No scores or rankings.</div>
      <div className="filters">
        <a href={f("stage")} className={!q.stage ? "on" : ""}>All stages</a>
        {STAGES.map((st) => <a key={st} href={f("stage", st)} className={q.stage === st ? "on" : ""}>{STAGE_EN[st]}</a>)}
        <span style={{ width: 12 }} />
        {SIGNALS.map((sg) => <a key={sg} href={f("signal", q.signal === sg ? undefined : sg)} className={q.signal === sg ? "on" : ""}>{SIGNAL_EN[sg]}</a>)}
        <a href={f("review", q.review ? undefined : "1")} className={q.review ? "on" : ""}>Needs review / 要確認</a>
      </div>
      <table>
        <thead><tr><th>Company</th><th>Category</th>{SIGNALS.map((sg) => <th key={sg}>{SIGNAL_EN[sg]}<br /><span className="muted">{SIGNAL_LABEL[sg]}</span></th>)}<th>GTM stage</th><th>Sales motion</th><th>Latest change</th><th>Last checked</th></tr></thead>
        <tbody>
          {rows.map(({ c, a, feed, lastOk, pending }) => (
            <tr key={c.slug}>
              <td><Link href={`/companies/${c.slug}`}><b>{c.name}</b></Link>{pending > 0 && <div><span className="pill review">{pending} to review</span></div>}</td>
              <td>{c.category}</td>
              {SIGNALS.map((sg) => <td key={sg}><StatusPill s={a?.signalStatus[sg]?.status ?? "unconfirmed"} />{(a?.signalStatus[sg]?.evidenceIds.length ?? 0) > 0 && <div className="muted">{a!.signalStatus[sg].evidenceIds.length} evidence</div>}</td>)}
              <td>{a ? <StagePill s={a.stage} /> : <span className="muted">not run</span>}</td>
              <td>{a && <Motions m={a.motions} />}</td>
              <td style={{ maxWidth: 220 }}>{feed ? <><div>{feed.title}</div><div className="muted">{d(feed.occurredAt)}</div></> : <span className="muted">—</span>}</td>
              <td>{d(lastOk)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

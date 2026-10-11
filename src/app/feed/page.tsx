import Link from "next/link";
import { loadStore } from "@/lib/store";
import { FEED_TYPE_LABEL } from "@/lib/labels";
import { d } from "../ui";

export default async function Feed({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = await searchParams;
  const s = loadStore();
  const items = s.feed.filter((f) => (q.all ? true : f.type !== "baseline")).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const name = (slug: string) => s.companies.find((c) => c.slug === slug)?.name ?? slug;
  const ev = new Map(s.evidence.map((e) => [e.id, e]));
  return (
    <>
      <h1>Update feed / 更新フィード</h1>
      <div className="sub">Only meaningful changes vs. the previous snapshot. First snapshots are baselines (no invented history). <Link href={q.all ? "/feed" : "/feed?all=1"}>{q.all ? "Hide" : "Show"} baselines</Link></div>
      {items.map((f) => (
        <div className="card" key={f.id}>
          <div className="muted">{d(f.occurredAt)} · <Link href={`/companies/${f.companySlug}`}>{name(f.companySlug)}</Link> · {FEED_TYPE_LABEL[f.type] ?? f.type}</div>
          <div><b>{f.title}</b></div>
          <div className="muted">{f.summary}</div>
          {(f.before || f.after) && <div className="grid"><div><div className="muted">Before / 変更前</div><pre className="del">{f.before}</pre></div><div><div className="muted">After / 変更後</div><pre className="ins">{f.after}</pre></div></div>}
          <div className="muted">Evidence: {f.url ? <a href={f.url}>{f.url}</a> : f.evidenceId ? <a href={ev.get(f.evidenceId)?.url}>{ev.get(f.evidenceId)?.url}</a> : "—"}</div>
        </div>
      ))}
      {items.length === 0 && <div className="card">No changes detected yet. Run the pipeline again to compare with the saved snapshots.</div>}
    </>
  );
}

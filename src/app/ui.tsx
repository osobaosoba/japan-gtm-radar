import { STATUS_EN, STATUS_LABEL, STAGE_EN, STAGE_LABEL, MOTION_EN, MOTION_LABEL, type SignalStatus, type Stage } from "@/lib/labels";

export const StatusPill = ({ s }: { s: string }) => (
  <span className={`pill s-${s}`} title={STATUS_LABEL[s as SignalStatus]}>{STATUS_EN[s as SignalStatus] ?? s}</span>
);
export const StagePill = ({ s }: { s: string }) => (
  <span className="pill stage">{STAGE_EN[s as Stage]} / {STAGE_LABEL[s as Stage]}</span>
);
export const Motions = ({ m }: { m: string[] }) => (
  <>{m.map((x) => <span key={x} className="pill s-unconfirmed" style={{ marginRight: 4, color: "#344054" }}>{MOTION_EN[x]} / {MOTION_LABEL[x as "direct"]}</span>)}</>
);
export const d = (x?: string | null) => (x ? x.slice(0, 10) : "unknown");

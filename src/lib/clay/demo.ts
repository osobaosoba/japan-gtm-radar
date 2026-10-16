import { DEMO_CLAY_SAMPLES } from "./demo-profiles";
import type { ClayAdapter } from "./types";

/** demoモードのClay。外部は呼ばず、架空のサンプルを返す */
export function createDemoClayAdapter(): ClayAdapter {
  return {
    name: "demo-sample",
    async start(payload) {
      return { ok: true, externalRunId: `demo:${payload.subjectKey}` };
    },
    async poll(_id, payload) {
      const people = DEMO_CLAY_SAMPLES[payload.subjectKey] ?? [];
      return {
        status: people.length ? "partial" : "complete",
        people,
        usage: { results: 0, note: "Demo sample — no Clay searches or credits used" },
      };
    },
  };
}

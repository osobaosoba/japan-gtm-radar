import { getMode } from "../mode";
import { createDemoClayAdapter } from "./demo";
import { createLiveClayAdapter } from "./live";
import type { ClayAdapter } from "./types";

export function clayKeyConfigured() {
  return Boolean(process.env.CLAY_PUBLIC_API_KEY?.trim());
}

/** demoでは必ずサンプル。liveでキーがない時は null（実行ボタンを出さない） */
export function getClayAdapter(): ClayAdapter | null {
  if (getMode() === "demo") return createDemoClayAdapter();
  return clayKeyConfigured() ? createLiveClayAdapter() : null;
}

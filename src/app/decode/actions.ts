"use server";
import { revalidatePath } from "next/cache";
import { getClayAdapter } from "@/lib/clay";
import { latestClayRun, pollClayRun, profiles, startClayRun, subjectKey } from "@/lib/decode";
import { loadStore, saveStore } from "@/lib/store";

export async function runClay(profileId: string, pathId: string) {
  const s = loadStore();
  const profile = profiles(s.mode).find((p) => p.id === profileId);
  if (!profile) return;
  const adapter = getClayAdapter();
  const r = await startClayRun(s, profile, pathId, adapter);
  if (r.kind === "started" || r.kind === "reused") {
    await pollClayRun(r.run, adapter);
    saveStore(s);
  }
  revalidatePath("/decode");
}

export async function refreshClay(profileId: string, pathId: string) {
  const s = loadStore();
  const run = latestClayRun(s, subjectKey(profileId, pathId));
  if (run) {
    await pollClayRun(run, getClayAdapter());
    saveStore(s);
  }
  revalidatePath("/decode");
}

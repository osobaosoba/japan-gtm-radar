"use server";
import { revalidatePath } from "next/cache";
import { getClayAdapter } from "@/lib/clay";
import { latestClayRun, pollClayRun, profiles, startClayRun, subjectKey } from "@/lib/decode";
import { loadStore, saveStore } from "@/lib/store";

let queue: Promise<unknown> = Promise.resolve();
/** Serialize load→save so overlapping requests can't start duplicate searches or overwrite each other's runs */
const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
};

export async function runClay(profileId: string, pathId: string) {
  await serial(() => runClayLocked(profileId, pathId));
  revalidatePath("/decode");
}

async function runClayLocked(profileId: string, pathId: string) {
  const s = loadStore();
  const profile = profiles(s.mode).find((p) => p.id === profileId);
  if (!profile) return;
  const adapter = getClayAdapter();
  const r = await startClayRun(s, profile, pathId, adapter);
  if (r.kind === "started" || r.kind === "reused") {
    await pollClayRun(r.run, adapter);
    saveStore(s);
  }
}

export async function refreshClay(profileId: string, pathId: string) {
  await serial(async () => {
    const s = loadStore();
    const run = latestClayRun(s, subjectKey(profileId, pathId));
    if (run) {
      await pollClayRun(run, getClayAdapter());
      saveStore(s);
    }
  });
  revalidatePath("/decode");
}

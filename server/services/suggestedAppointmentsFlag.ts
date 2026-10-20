/**
 * Suggested appointments stay on unless Admin settings or the env flag turns them off.
 * SUGGESTED_APPOINTMENTS_ENABLED=false wins, so the pills can be forced off without a deploy.
 */

import admin from "firebase-admin";
import {
  suggestedAppointmentsEnabled,
  suggestedAppointmentsEnvOverride,
} from "../../shared/suggestedAppointments";

const CACHE_MS = 15_000;

let cache: { at: number; stored: boolean | undefined } | null = null;
let loggedReadFailure = false;

export function resetSuggestedAppointmentsCache(): void {
  cache = null;
  loggedReadFailure = false;
}

export async function suggestedAppointmentsAreEnabled(
  env: Record<string, string | undefined> = process.env,
  readStored: () => Promise<boolean | undefined> = readStoredFlag,
  now = Date.now(),
): Promise<boolean> {
  const override = suggestedAppointmentsEnvOverride(env);
  if (override !== undefined) return override;
  if (!cache || now - cache.at > CACHE_MS) {
    cache = { at: now, stored: await readStored() };
  }
  return suggestedAppointmentsEnabled(env, cache.stored);
}

async function readStoredFlag(): Promise<boolean | undefined> {
  try {
    if (!admin.apps.length) return undefined;
    const snap = await admin.firestore().collection("settings").doc("global").get();
    const value = snap.data()?.suggestedAppointments;
    return typeof value === "boolean" ? value : undefined;
  } catch (error) {
    if (!loggedReadFailure) {
      loggedReadFailure = true;
      const message = error instanceof Error ? error.message : "unavailable";
      console.error(`[Booking] Suggested appointments setting could not be read. Leaving the feature on. ${message}`);
    }
    return undefined;
  }
}

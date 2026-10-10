import { isPlaytestRecord } from "./playtestRecord";

/**
 * onOrderCreated must leave a playtest order alone: no Gmail, no template
 * reads, and no other side effects. The Cloud Function returns before that
 * work when this is false.
 */
export function shouldRunOrderCreated(order: unknown): boolean {
  return !isPlaytestRecord(order);
}

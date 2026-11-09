/**
 * Office events. Thankful is always included. Sample extras stay in this tab.
 * Does not email or text.
 */

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  OFFICE_EVENTS_COLLECTION,
  buildOfficeEvent,
  mergeOfficeEvents,
  readOfficeEvent,
  sampleOfficeEvents,
  type OfficeEvent,
} from "@shared/officeEvents";

export function useOfficeEvents(sample: boolean, today: string) {
  const [stored, setStored] = useState<OfficeEvent[]>([]);
  const [extras, setExtras] = useState<OfficeEvent[]>([]);
  const [loading, setLoading] = useState(!sample);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sample) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return onSnapshot(collection(db, OFFICE_EVENTS_COLLECTION), (snap) => {
      setStored(snap.docs.map((entry) => readOfficeEvent(entry.id, entry.data())).filter((event): event is OfficeEvent => Boolean(event)));
      setError("");
      setLoading(false);
    }, () => {
      setError("Saved events could not be loaded. Thankful is still listed.");
      setLoading(false);
    });
  }, [sample]);

  const events = useMemo(
    () => mergeOfficeEvents(sample ? [...sampleOfficeEvents(today), ...extras] : stored, today),
    [sample, today, extras, stored],
  );

  async function create(input: {
    name: string;
    type: OfficeEvent["type"];
    date: string;
    time: string;
    location: string;
    status: OfficeEvent["status"];
    notes: string;
  }) {
    const built = buildOfficeEvent({
      ...input,
      id: `event_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
      sample,
    });
    if (built.ok === false) return built;
    if (sample) {
      setExtras((current) => [...current, built.event]);
      return built;
    }
    await setDoc(doc(db, OFFICE_EVENTS_COLLECTION, built.event.id), {
      ...built.event,
      updatedAt: serverTimestamp(),
    });
    return built;
  }

  return { events, loading, error, create };
}

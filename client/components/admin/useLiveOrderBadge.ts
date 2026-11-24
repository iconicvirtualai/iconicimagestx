import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { actionableOrderCount } from "@shared/adminOrdersDesk";
import { db } from "@/lib/firebase";

/**
 * Orders nav badge. Counts distinct new requests already in orderRequests.
 * The old badge subtracted a seen cursor from a counter that only ever
 * incremented, so it kept climbing after orders were handled.
 * This read does not write Firestore and does not send texts.
 */
export function useLiveOrderBadge(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      setCount(null);
      return undefined;
    }
    const stop = onSnapshot(
      collection(db, "orderRequests"),
      (snap) => {
        setCount(actionableOrderCount(snap.docs.map((item) => ({ id: item.id, ...item.data() }))));
      },
      () => setCount(null),
    );
    return () => stop();
  }, [enabled]);
  return count;
}

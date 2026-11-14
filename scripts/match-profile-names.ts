/**
 * Match static person names to existing profiles.
 *
 *   pnpm profiles:match
 *   pnpm profiles:match -- --live
 *   pnpm profiles:match -- --apply --confirm-unique
 *
 * The default uses a built-in fixture and writes nothing.
 * --live reads staff, clients, orders, task board rows, and messages.
 * It still writes nothing.
 *
 * --apply --confirm-unique writes peopleProfileLinks only for unique
 * name matches. Ambiguous names are never written. This does not email,
 * text, or touch the Holy Grail sheet.
 */

import { pathToFileURL } from "node:url";
import admin from "firebase-admin";
import {
  matchProfileNames,
  previewProfiles,
  profileFromClient,
  profileFromStaff,
  uniqueWrites,
  type MigrationReport,
  type NameSighting,
  type PersonProfile,
} from "../shared/peopleProfiles.ts";

const APPLY = process.argv.includes("--apply");
const CONFIRM = process.argv.includes("--confirm-unique");
const LIVE = process.argv.includes("--live");

function fixture(): { profiles: PersonProfile[]; sightings: NameSighting[] } {
  const profiles = previewProfiles();
  const alex = profiles.find((profile) => profile.id === "client:sample-riley");
  if (alex) {
    profiles.push({ ...alex, id: "client:fixture-alex-a", sourceId: "fixture-alex-a", uid: "fixture-alex-a", displayName: "Alex Rivera", legalName: "Alex Rivera" });
    profiles.push({ ...alex, id: "staff:fixture-alex-b", kind: "staff", sourceId: "fixture-alex-b", uid: "fixture-alex-b", role: "photographer", displayName: "Alex Rivera", legalName: "Alex Rivera" });
  }
  return {
    profiles,
    sightings: [
      { source: "order", recordId: "fixture-order", field: "assignedPhotographerName", name: "Mike Luna" },
      { source: "task", recordId: "fixture-task", field: "assigneeName", name: "Daniel Adaclog" },
      { source: "message", recordId: "fixture-message", field: "senderName", name: "Someone New" },
      { source: "order", recordId: "fixture-ambiguous", field: "photographerName", name: "Alex Rivera" },
    ],
  };
}

function printReport(report: MigrationReport, label: string): void {
  console.log(`\n${label}`);
  console.log(`Unique matches: ${report.unique.length}`);
  for (const row of report.unique) {
    console.log(`  ${row.sighting.source} ${row.sighting.recordId} ${row.sighting.field} "${row.sighting.name}" -> ${row.profileId}`);
  }
  console.log(`Ambiguous (not written): ${report.ambiguous.length}`);
  for (const row of report.ambiguous) {
    console.log(`  ${row.sighting.source} ${row.sighting.recordId} "${row.sighting.name}" -> ${row.profileIds.join(", ")}`);
  }
  console.log(`Unmatched: ${report.unmatched.length}`);
  for (const row of report.unmatched) {
    console.log(`  ${row.source} ${row.recordId} ${row.field} "${row.name}"`);
  }
  console.log("No ambiguous match was written.");
}

async function liveInput(): Promise<{ profiles: PersonProfile[]; sightings: NameSighting[] }> {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    } else {
      throw new Error("No Firebase credentials. Nothing was read and nothing was written.");
    }
  }
  const db = admin.firestore();
  const [staff, clients, orders, tasks, messages] = await Promise.all([
    db.collection("staff").limit(300).get(),
    db.collection("clients").limit(300).get(),
    db.collection("orders").limit(300).get(),
    db.collection("taskBoardItems").limit(300).get(),
    db.collection("messages").limit(200).get(),
  ]);
  const profiles = [
    ...staff.docs.map((doc) => profileFromStaff(doc.id, doc.data())),
    ...clients.docs.map((doc) => profileFromClient(doc.id, doc.data())),
  ];
  const sightings: NameSighting[] = [];
  for (const doc of orders.docs) {
    const data = doc.data();
    for (const field of ["assignedPhotographerName", "photographerName", "preferredPhotographer"]) {
      if (typeof data[field] === "string" && data[field].trim()) {
        sightings.push({ source: "order", recordId: doc.id, field, name: data[field] });
      }
    }
    const names = Array.isArray(data.photographerNames) ? data.photographerNames : [];
    names.forEach((name, index) => {
      if (typeof name === "string" && name.trim()) {
        sightings.push({ source: "order", recordId: doc.id, field: `photographerNames.${index}`, name });
      }
    });
    const providers = Array.isArray(data.assignedProviders) ? data.assignedProviders : [];
    providers.forEach((provider: { name?: string }, index: number) => {
      if (provider && typeof provider.name === "string" && provider.name.trim()) {
        sightings.push({ source: "order", recordId: doc.id, field: `assignedProviders.${index}.name`, name: provider.name });
      }
    });
  }
  for (const doc of tasks.docs) {
    const name = doc.data().assigneeName;
    if (typeof name === "string" && name.trim()) {
      sightings.push({ source: "task", recordId: doc.id, field: "assigneeName", name });
    }
  }
  for (const doc of messages.docs) {
    const name = doc.data().senderName;
    if (typeof name === "string" && name.trim()) {
      sightings.push({ source: "message", recordId: doc.id, field: "senderName", name });
    }
  }
  return { profiles, sightings };
}

async function writeUnique(report: MigrationReport): Promise<number> {
  const writes = uniqueWrites(report).filter((row) => row.sighting.source !== "appointment");
  if (!admin.apps.length || writes.length === 0) return 0;
  const db = admin.firestore();
  const grouped = new Map<string, { collection: string; id: string; links: Record<string, string> }>();
  for (const row of writes) {
    const collection = row.sighting.source === "order" ? "orders" : row.sighting.source === "task" ? "taskBoardItems" : "messages";
    const key = `${collection}/${row.sighting.recordId}`;
    const current = grouped.get(key) || { collection, id: row.sighting.recordId, links: {} };
    current.links[row.sighting.field] = row.profileId;
    grouped.set(key, current);
  }
  for (const row of grouped.values()) {
    await db.collection(row.collection).doc(row.id).set({ peopleProfileLinks: row.links }, { merge: true });
  }
  return writes.length;
}

async function main(): Promise<void> {
  const input = LIVE ? await liveInput() : fixture();
  const report = matchProfileNames(input.profiles, input.sightings);
  printReport(report, LIVE ? "Live dry run" : "Fixture dry run");
  if (!APPLY) {
    console.log("\nDry run only. Pass --apply --confirm-unique to write unique matches.");
    return;
  }
  if (!CONFIRM) {
    console.log("\nRefusing to write. Pass --confirm-unique with --apply. Ambiguous matches are never included.");
    return;
  }
  if (!LIVE) {
    console.log("\nFixture apply does not write. Use --live --apply --confirm-unique against the connected project.");
    return;
  }
  const count = await writeUnique(report);
  console.log(`\nWrote ${count} unique profile link${count === 1 ? "" : "s"}. Ambiguous rows were skipped.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

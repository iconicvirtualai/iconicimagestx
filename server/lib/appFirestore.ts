/**
 * Firestore handle for payment routes.
 * Production uses the Admin SDK. The Square webhook fixture and its tests
 * install an in-memory database here so they never touch a live project.
 */

import admin from "firebase-admin";

let override: FirebaseFirestore.Firestore | null = null;

export function useAppFirestore(db: FirebaseFirestore.Firestore | null): void {
  override = db;
}

export function appFirestore(): FirebaseFirestore.Firestore {
  return override ?? admin.firestore();
}

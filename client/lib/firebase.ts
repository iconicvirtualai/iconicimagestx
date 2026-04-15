/**
 * Iconic Images — Firebase Client Init
 * Replaces the existing client/lib/firebase.ts
 * Adds: Firebase Auth, Storage alongside existing Firestore
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  getStorage,
  connectStorageEmulator,
} from "firebase/storage";

const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    import.meta.env.VITE_PUBLIC_FIREBASE_API_KEY,
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    import.meta.env.VITE_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID ||
    import.meta.env.VITE_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    import.meta.env.VITE_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    import.meta.env.VITE_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    import.meta.env.VITE_PUBLIC_FIREBASE_APP_ID,
};

// Validate config
const requiredKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "appId"];
const missingKeys = requiredKeys.filter(
  (k) => !firebaseConfig[k as keyof typeof firebaseConfig]
);
if (missingKeys.length > 0) {
  console.warn(
    `[Firebase] Missing environment variables: ${missingKeys.join(", ")}`
  );
}

// Initialize app (prevent re-init in dev hot reload)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Firestore — keep existing long-polling config for proxy compatibility
let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
  });
} catch {
  db = getFirestore(app);
}

// Auth
const auth = getAuth(app);

// Storage
const storage = getStorage(app);

// Local emulator support (set VITE_USE_EMULATORS=true in .env.local)
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectFirestoreEmulator(db, "localhost", 8080);
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectStorageEmulator(storage, "localhost", 9199);
  console.log("[Firebase] Using local emulators");
}

export { app, db, auth, storage, onAuthStateChanged };
export type { User };

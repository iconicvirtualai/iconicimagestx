/**
 * Iconic Images — Firebase Client Init
 * Replaces the existing client/lib/firebase.ts
 * Adds: Firebase Auth, Storage alongside existing Firestore
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
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

// Project: iconic-images-aicon (main platform)
// Using hardcoded values as requested to verify initialization when env vars are missing
const firebaseConfig = {
  apiKey: "AIzaSyBp8lJvshIAFrTYTkDSD6OzK4IFvwrq76E",
  authDomain: "iconic-images-aicon.firebaseapp.com",
  projectId: "iconic-images-aicon",
  storageBucket: "iconic-images-aicon.firebasestorage.app",
  messagingSenderId: "1064967965539",
  appId: "1:1064967965539:web:5b32bc58b25e75ad26a156",
  measurementId: "G-FEGBDBEH68",
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

// Analytics
let analytics: any = null;
isSupported().then(supported => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

// Local emulator support (set VITE_USE_EMULATORS=true in .env.local)
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectFirestoreEmulator(db, "localhost", 8080);
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectStorageEmulator(storage, "localhost", 9199);
  console.log("[Firebase] Using local emulators");
}

export { app, db, auth, storage, analytics, onAuthStateChanged };
export type { User };

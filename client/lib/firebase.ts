
import { initializeApp, getApps, getApp } from "firebase/app"
import { getFirestore, initializeFirestore, terminate } from "firebase/firestore"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || import.meta.env.VITE_PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || import.meta.env.VITE_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || import.meta.env.VITE_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || import.meta.env.VITE_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || import.meta.env.VITE_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || import.meta.env.VITE_PUBLIC_FIREBASE_APP_ID
}

// Check if config is likely missing
const isConfigMissing = !firebaseConfig.apiKey || !firebaseConfig.projectId || firebaseConfig.projectId.includes("__");

if (isConfigMissing) {
  console.warn("Firebase configuration appears to be missing or incomplete. Check your environment variables.");
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp()

let firestore;
try {
  // Use initializeFirestore with long-polling to avoid connectivity issues in some environments
  // We use a try-catch because initializeFirestore can only be called once
  firestore = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false // Important for some proxy environments
  })
} catch (e) {
  // If already initialized, get the existing instance
  firestore = getFirestore(app)
}

export const db = firestore

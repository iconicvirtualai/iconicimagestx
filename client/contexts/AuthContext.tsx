/**
 * Iconic Images — AuthContext
 * Wraps the entire app. Provides current user, staff profile, and auth helpers.
 * Place this at: client/contexts/AuthContext.tsx
 * Then wrap your App.tsx <BrowserRouter> with <AuthProvider>
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import type { StaffMember, Client } from "../lib/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthUserType = "staff" | "client" | null;

interface AuthContextValue {
  // State
  user: User | null;
  staffProfile: StaffMember | null;
  clientProfile: Client | null;
  userType: AuthUserType;
  loading: boolean;
  error: string | null;

  // Auth actions
  signIn: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;

  // Client portal registration
  registerClient: (
    email: string,
    password: string,
    clientId: string
  ) => Promise<void>;

  // Helpers
  isAdmin: boolean;
  isCoordinator: boolean;
  isPhotographer: boolean;
  isStaff: boolean;
  isClient: boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffMember | null>(null);
  const [clientProfile, setClientProfile] = useState<Client | null>(null);
  const [userType, setUserType] = useState<AuthUserType>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setStaffProfile(null);
      setClientProfile(null);
      setUserType(null);

      if (firebaseUser) {
        try {
          // Check if this UID belongs to a staff member
          const staffDoc = await getDoc(doc(db, "staff", firebaseUser.uid));
          if (staffDoc.exists()) {
            setStaffProfile({ id: staffDoc.id, ...staffDoc.data() } as StaffMember);
            setUserType("staff");
          } else {
            // Check if client record links to this UID
            // We query clients where firebaseUid == user.uid
            // For efficiency, clients collection uses UID as document ID when portal is active
            const clientDoc = await getDoc(doc(db, "clients", firebaseUser.uid));
            if (clientDoc.exists()) {
              setClientProfile({ id: clientDoc.id, ...clientDoc.data() } as Client);
              setUserType("client");
            }
          }
        } catch (err) {
          console.error("[AuthContext] Profile fetch error:", err);
        }
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Sign in (works for both staff and clients)
  const signIn = async (email: string, password: string) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const message = getAuthErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  // Sign out
  const signOutUser = async () => {
    setError(null);
    await signOut(auth);
  };

  // Password reset
  const resetPassword = async (email: string) => {
    setError(null);
    await sendPasswordResetEmail(auth, email);
  };

  /**
   * Register a client for portal access.
   * Pass the existing Firestore clientId so we can link the auth account
   * to their existing client record.
   */
  const registerClient = async (
    email: string,
    password: string,
    clientId: string
  ) => {
    setError(null);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;

      // Link auth UID into the client document
      await setDoc(
        doc(db, "clients", clientId),
        { firebaseUid: uid, portalAccess: true, updatedAt: Timestamp.now() },
        { merge: true }
      );

      // Also create a lookup doc at /clients/{uid} so AuthContext can find them
      // by UID if clientId !== uid
      if (clientId !== uid) {
        await setDoc(doc(db, "clients", uid), {
          _redirect: clientId, // Lookup pointer
          updatedAt: Timestamp.now(),
        });
      }
    } catch (err: unknown) {
      const message = getAuthErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  // Convenience role flags
  const isAdmin = staffProfile?.role === "admin";
  const isCoordinator =
    staffProfile?.role === "admin" || staffProfile?.role === "coordinator";
  const isPhotographer =
    isCoordinator || staffProfile?.role === "photographer";
  const isStaff = userType === "staff";
  const isClient = userType === "client";

  return (
    <AuthContext.Provider
      value={{
        user,
        staffProfile,
        clientProfile,
        userType,
        loading,
        error,
        signIn,
        signOutUser,
        resetPassword,
        registerClient,
        isAdmin,
        isCoordinator,
        isPhotographer,
        isStaff,
        isClient,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAuthErrorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: string }).code;
    const map: Record<string, string> = {
      "auth/invalid-email": "Invalid email address.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/user-not-found": "No account found with that email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/too-many-requests": "Too many attempts. Please try again later.",
      "auth/network-request-failed": "Network error. Check your connection.",
    };
    return map[code] ?? "Authentication error. Please try again.";
  }
  return "An unexpected error occurred.";
}

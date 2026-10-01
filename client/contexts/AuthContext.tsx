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
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import type { StaffMember, Client } from "../lib/schema";
import {
  INITIAL_AUTH_SESSION,
  reduceAuthSession,
  sessionFromProfiles,
  type AuthSessionEvent,
  type AuthSessionState,
} from "@shared/staffAccess";
import { isTempAdminClientEnabled } from "@shared/tempAdmin";

// ─── Types ────────────────────────────────────────────────────────────────────

const TEMP_ADMIN_ENABLED = isTempAdminClientEnabled({
  flag: import.meta.env.VITE_ENABLE_TEMP_ADMIN,
  hostname: typeof window === "undefined" ? undefined : window.location.hostname,
});

type AuthUserType = "staff" | "client" | null;

function isPermissionDenied(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) return false;
  const code = String((err as { code: unknown }).code);
  return code === "permission-denied" || code.endsWith("/permission-denied");
}

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

  // Client portal registration. Creates Firebase Auth + clients/{uid}.
  registerClient: (
    email: string,
    password: string,
    profile: { firstName: string; lastName: string; phone?: string }
  ) => Promise<void>;
  refreshProfile: () => Promise<void>;

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
  const tempSession = useRef(false);
  const sessionRef = useRef<AuthSessionState>(INITIAL_AUTH_SESSION);

  const commitSession = (event: AuthSessionEvent) => {
    const next = reduceAuthSession(sessionRef.current, event);
    if (event.type === "profiles-resolved" && next === sessionRef.current) return null;
    sessionRef.current = next;
    setLoading(next.loading);
    setUserType(next.userType);
    if (event.type !== "profiles-resolved") {
      setStaffProfile(null);
      setClientProfile(null);
    }
    if (event.type === "signed-out") setUser(null);
    return next;
  };

  const loadProfiles = async (firebaseUser: User) => {
    let staffData: Record<string, unknown> | null = null;
    let staffId = firebaseUser.uid;
    try {
      const staffDoc = await getDoc(doc(db, "staff", firebaseUser.uid));
      if (staffDoc.exists()) {
        staffData = staffDoc.data() as Record<string, unknown>;
        staffId = staffDoc.id;
      }
    } catch (err) {
      // Current rules hide a missing or inactive staff doc behind permission-denied.
      // That is "no active staff record", not a failed login. Other errors still throw.
      if (!isPermissionDenied(err)) throw err;
    }

    const staffRecord = staffData as { role?: unknown; isActive?: unknown } | null;
    const staffSession = sessionFromProfiles({ staff: staffRecord, hasClient: false });
    let clientData: Record<string, unknown> | null = null;
    let clientId = firebaseUser.uid;
    if (staffSession.userType !== "staff") {
      try {
        const clientDoc = await getDoc(doc(db, "clients", firebaseUser.uid));
        if (clientDoc.exists()) {
          clientData = clientDoc.data() as Record<string, unknown>;
          clientId = clientDoc.id;
        }
      } catch (err) {
        // permission-denied is "could not read clients/{uid}", not a resolved
        // empty profile. Rules must allow that own-doc read or a real client
        // is classified as not-a-client. Other errors still fail the load.
        if (!isPermissionDenied(err)) throw err;
      }
    }

    const classified = sessionFromProfiles({
      staff: staffRecord,
      client: clientData as { status?: unknown; portalAccess?: unknown } | null,
    });
    const applied = commitSession({
      type: "profiles-resolved",
      userId: firebaseUser.uid,
      userType: classified.userType,
      role: classified.role,
    });
    if (!applied) return;

    setStaffProfile(
      classified.userType === "staff" && staffData
        ? ({ id: staffId, ...staffData } as StaffMember)
        : null,
    );
    setClientProfile(
      classified.userType === "client" && clientData
        ? ({ id: clientId, ...clientData } as Client)
        : null,
    );
  };

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser && tempSession.current) return;

      tempSession.current = false;

      if (!firebaseUser) {
        commitSession({ type: "signed-out" });
        return;
      }

      // Same turn as setUser: loading stays true until staff and client
      // profile reads settle, so login cannot treat this user as signed-out
      // or not-a-client while clients/{uid} is still in flight.
      setUser(firebaseUser);
      commitSession({ type: "signed-in", userId: firebaseUser.uid });

      try {
        await loadProfiles(firebaseUser);
      } catch (err) {
        console.error("[AuthContext] Profile fetch error:", err);
        const applied = commitSession({
          type: "profiles-resolved",
          userId: firebaseUser.uid,
          userType: null,
        });
        if (applied) {
          setStaffProfile(null);
          setClientProfile(null);
        }
      }
    });

    return unsubscribe;
  }, []);

  // Sign in (works for both staff and clients)
  const signIn = async (email: string, password: string) => {
    setError(null);

    // Local/dev only. The flag is build-time; the host check is runtime.
    if (TEMP_ADMIN_ENABLED && email === "temp-admin@iconicimagestx.com" && password === "TempAdmin!2024") {
      console.log("[Auth] Using temporary local admin bypass");
      tempSession.current = true;
      const tempUser = {
        uid: "temp-admin-uid",
        email: "temp-admin@iconicimagestx.com",
        displayName: "Temporary Admin",
        getIdToken: async () => "temp-admin-token",
      } as unknown as User;

      setUser(tempUser);
      setStaffProfile({
        id: "temp-admin-uid",
        firebaseUid: "temp-admin-uid",
        firstName: "Temporary",
        lastName: "Admin",
        email: "temp-admin@iconicimagestx.com",
        role: "admin",
        isActive: true,
      } as StaffMember);
      sessionRef.current = {
        userId: "temp-admin-uid",
        userType: "staff",
        role: "admin",
        loading: false,
      };
      setUserType("staff");
      setLoading(false);
      return;
    }

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
    tempSession.current = false;
    commitSession({ type: "signed-out" });
    try {
      await signOut(auth);
    } catch (err) {
      console.error("[Auth] Sign out error:", err);
    }
  };

  // Password reset
  const resetPassword = async (email: string) => {
    setError(null);
    await sendPasswordResetEmail(auth, email);
  };

  const refreshProfile = async () => {
    if (!auth.currentUser) return;
    commitSession({ type: "signed-in", userId: auth.currentUser.uid });
    await loadProfiles(auth.currentUser);
  };

  /**
   * Create a client portal account.
   * The server writes clients/{uid} with the Admin SDK because Firestore rules
   * do not allow a new client to create their own document.
   */
  const registerClient = async (
    email: string,
    password: string,
    profile: { firstName: string; lastName: string; phone?: string }
  ) => {
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth.currentUser) {
        headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
      }
      const res = await fetch("/api/clients/register", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not create the account.");
      }

      if (auth.currentUser) {
        commitSession({ type: "signed-in", userId: auth.currentUser.uid });
        await loadProfiles(auth.currentUser);
      } else {
        await signInWithEmailAndPassword(auth, normalizedEmail, password);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : getAuthErrorMessage(err);
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
        refreshProfile,
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
      "auth/invalid-credential": "No matching login was found. Check the email/password or create this staff account first.",
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

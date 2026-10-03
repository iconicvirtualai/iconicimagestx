export const STAFF_ROLES = ["admin", "coordinator", "photographer", "editor"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: unknown): role is StaffRole {
  return typeof role === "string" && (STAFF_ROLES as readonly string[]).includes(role);
}

/** Active staff record with a known ops role. Missing isActive is treated as active. */
export function isActiveStaffRecord(data: { role?: unknown; isActive?: unknown } | null | undefined): boolean {
  if (!data) return false;
  if (data.isActive === false) return false;
  return isStaffRole(data.role);
}

export function staffHomePath(role: string | undefined): string {
  if (role === "photographer") return "/admin/photographer";
  if (role === "editor") return "/admin/editor";
  return "/admin/dashboard";
}

export type AuthUserType = "staff" | "client" | null;

export const CLIENT_HOME_PATH = "/portal/home";

/** Where a signed-in client may return after portal login. */
export function clientReturnPath(pathname?: string | null): string {
  if (!pathname) return CLIENT_HOME_PATH;
  const pathOnly = pathname.split("?")[0].split("#")[0];
  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//") || pathOnly.includes("..")) return CLIENT_HOME_PATH;
  const allowed = pathOnly === CLIENT_HOME_PATH
    || pathOnly.startsWith("/portal/listings/")
    || pathOnly.startsWith("/gallery/")
    || pathOnly.startsWith("/invoice/")
    || pathOnly.startsWith("/studio/");
  return allowed ? pathname : CLIENT_HOME_PATH;
}

/**
 * Portal client record. Missing portalAccess is allowed (older docs).
 * An explicit false or an inactive status is not a portal login.
 */
export function isActiveClientRecord(
  data: { status?: unknown; portalAccess?: unknown } | null | undefined,
): boolean {
  if (!data) return false;
  if (data.status === "inactive") return false;
  if (data.portalAccess === false) return false;
  return true;
}

/** Classify a resolved staff/client pair. Inactive staff do not count as staff. */
export function sessionFromProfiles(input: {
  staff?: { role?: unknown; isActive?: unknown } | null;
  /** Legacy flag used when the caller already decided the client doc counts. */
  hasClient?: boolean;
  /** Raw clients/{uid} document. Null means the read finished with no doc. */
  client?: { status?: unknown; portalAccess?: unknown } | null;
}): { userType: AuthUserType; role?: string } {
  if (input.staff && isActiveStaffRecord(input.staff)) {
    return { userType: "staff", role: String(input.staff.role) };
  }
  if ("client" in input) {
    return isActiveClientRecord(input.client) ? { userType: "client" } : { userType: null };
  }
  if (input.hasClient) return { userType: "client" };
  return { userType: null };
}

export interface AuthSessionState {
  userId: string | null;
  userType: AuthUserType;
  role?: string;
  loading: boolean;
}

export const INITIAL_AUTH_SESSION: AuthSessionState = {
  userId: null,
  userType: null,
  loading: true,
};

export type AuthSessionEvent =
  | { type: "signed-out" }
  | { type: "signed-in"; userId: string }
  | {
      type: "profiles-resolved";
      userId: string;
      userType: AuthUserType;
      role?: string;
    };

/**
 * Auth UI must not observe a signed-in user until profile reads settle.
 * `signed-in` keeps `loading` true; only `profiles-resolved` for that same
 * uid clears it. A stale resolve (signed out, or a newer uid) is ignored.
 */
export function reduceAuthSession(state: AuthSessionState, event: AuthSessionEvent): AuthSessionState {
  switch (event.type) {
    case "signed-out":
      return { userId: null, userType: null, loading: false };
    case "signed-in":
      return { userId: event.userId, userType: null, loading: true };
    case "profiles-resolved": {
      if (state.userId !== event.userId) return state;
      return {
        userId: state.userId,
        userType: event.userType,
        role: event.userType === "staff" ? event.role : undefined,
        loading: false,
      };
    }
  }
}

export type StaffLoginAction =
  | { type: "pending" }
  | { type: "redirect"; path: string }
  | { type: "not-staff" };

/** Admin login decision. Pending covers signed-out and in-flight profile loads. */
export function staffLoginAction(input: {
  loading: boolean;
  hasUser: boolean;
  isStaff: boolean;
  role?: string;
}): StaffLoginAction {
  if (input.loading || !input.hasUser) return { type: "pending" };
  if (input.isStaff) return { type: "redirect", path: staffHomePath(input.role) };
  return { type: "not-staff" };
}

export type ClientLoginAction =
  | { type: "pending" }
  | { type: "redirect"; path: string }
  | { type: "not-client" };

/**
 * Client login decision. Pending while signed out or while clients/{uid} is
 * still loading. Redirect only after an active portal profile resolves.
 * not-client is only returned once that read has finished.
 */
export function clientLoginAction(input: {
  loading: boolean;
  hasUser: boolean;
  isClient: boolean;
  destination?: string;
}): ClientLoginAction {
  if (input.loading || !input.hasUser) return { type: "pending" };
  if (input.isClient) return { type: "redirect", path: input.destination || CLIENT_HOME_PATH };
  return { type: "not-client" };
}

export type ClientPortalAction =
  | { type: "pending" }
  | { type: "show-home" }
  | { type: "signed-out" }
  | { type: "not-client" };

/**
 * Client home decision. A signed-in user with no client profile yet stays
 * pending. Bounce to login only after the profile read settles, or when the
 * session is actually signed out.
 */
export function clientPortalAction(input: {
  loading: boolean;
  hasUser: boolean;
  isClient: boolean;
}): ClientPortalAction {
  if (input.loading) return { type: "pending" };
  if (!input.hasUser) return { type: "signed-out" };
  if (input.isClient) return { type: "show-home" };
  return { type: "not-client" };
}

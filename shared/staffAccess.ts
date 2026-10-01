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

/** Classify a resolved staff/client pair. Inactive staff do not count as staff. */
export function sessionFromProfiles(input: {
  staff?: { role?: unknown; isActive?: unknown } | null;
  hasClient: boolean;
}): { userType: AuthUserType; role?: string } {
  if (input.staff && isActiveStaffRecord(input.staff)) {
    return { userType: "staff", role: String(input.staff.role) };
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

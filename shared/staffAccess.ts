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

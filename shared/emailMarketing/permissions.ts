/**
 * Marketing access is permission-based so a future "can send" role can be
 * added here without rewriting routes. Today every permission is admin-only.
 */
export const MARKETING_PERMISSIONS = ["view", "manage", "send"] as const;

export type MarketingPermission = (typeof MARKETING_PERMISSIONS)[number];

export function marketingPermissionsForRole(role: string | undefined): MarketingPermission[] {
  if (role === "admin") return ["view", "manage", "send"];
  return [];
}

export function hasMarketingPermission(
  role: string | undefined,
  permission: MarketingPermission,
): boolean {
  return marketingPermissionsForRole(role).includes(permission);
}

/** Send is its own permission. Only admins have it today. */
export function canSendMarketing(role: string | undefined): boolean {
  return hasMarketingPermission(role, "send");
}

/**
 * Temporary admin login is a local/dev convenience only.
 * Production builds and hosted deployments must use Firebase Auth staff roles.
 */

export type EnvLike = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLocalAdminHost(hostname: string | undefined): boolean {
  return Boolean(hostname && LOCAL_HOSTS.has(hostname));
}

/** True when this process is a hosted deploy (Vercel or NODE_ENV=production). */
export function isHostedDeployment(env: EnvLike): boolean {
  if (env.VERCEL === "1" || env.VERCEL_ENV) return true;
  return env.NODE_ENV === "production";
}

/**
 * Server gate. Requires the explicit flag and a non-hosted runtime.
 * Read NODE_ENV from the live environment object — do not rely on a
 * build-time replacement of process.env.NODE_ENV.
 */
export function isTempAdminEnabled(env: EnvLike = liveServerEnv()): boolean {
  if (env.ENABLE_TEMP_ADMIN !== "true") return false;
  return !isHostedDeployment(env);
}

export function isTempAdminClientEnabled(options: {
  flag: string | boolean | undefined;
  hostname: string | undefined;
}): boolean {
  const flagOn = options.flag === true || options.flag === "true";
  return flagOn && isLocalAdminHost(options.hostname);
}

export function liveServerEnv(env: NodeJS.ProcessEnv = process.env): EnvLike {
  return {
    ENABLE_TEMP_ADMIN: env.ENABLE_TEMP_ADMIN,
    VERCEL: env.VERCEL,
    VERCEL_ENV: env.VERCEL_ENV,
    // Bracket access so production server bundles keep the runtime value.
    NODE_ENV: env["NODE_ENV"],
  };
}

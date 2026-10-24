/**
 * Studio video editor flags.
 * Production stays off until the owner sets the flag. Vercel preview is on
 * when the flag is unset. An explicit true or false always wins.
 * The client bundle only sees VITE_ variables, so preview builds set
 * VITE_VIDEO_EDITOR_ENABLED and VITE_VIDEO_TEMPLATES_ENABLED. See DEPLOY.md.
 */

export type EnvLike = Record<string, string | undefined>;

function explicit(value: string | undefined): boolean | null {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

function fallback(env: EnvLike): boolean {
  const vercel = env.VERCEL_ENV || env.VITE_VERCEL_ENV;
  if (vercel === "production") return false;
  if (vercel === "preview") return true;
  if (env.NODE_ENV === "production" && (env.VERCEL === "1" || vercel)) return false;
  return true;
}

export function videoEditorEnabled(env: EnvLike): boolean {
  const set = explicit(env.VIDEO_EDITOR_ENABLED ?? env.VITE_VIDEO_EDITOR_ENABLED);
  if (set !== null) return set;
  return fallback(env);
}

export function videoTemplatesEnabled(env: EnvLike): boolean {
  if (!videoEditorEnabled(env)) return false;
  const set = explicit(env.VIDEO_TEMPLATES_ENABLED ?? env.VITE_VIDEO_TEMPLATES_ENABLED);
  if (set !== null) return set;
  return fallback(env);
}

export function clientVideoFlags(env: EnvLike): { editor: boolean; templates: boolean } {
  return {
    editor: videoEditorEnabled({
      VITE_VIDEO_EDITOR_ENABLED: env.VITE_VIDEO_EDITOR_ENABLED,
      VIDEO_EDITOR_ENABLED: env.VITE_VIDEO_EDITOR_ENABLED,
      VERCEL_ENV: env.VITE_VERCEL_ENV,
      VITE_VERCEL_ENV: env.VITE_VERCEL_ENV,
      NODE_ENV: env.DEV === "true" ? "development" : env.NODE_ENV,
    }),
    templates: videoTemplatesEnabled({
      VITE_VIDEO_EDITOR_ENABLED: env.VITE_VIDEO_EDITOR_ENABLED,
      VIDEO_EDITOR_ENABLED: env.VITE_VIDEO_EDITOR_ENABLED,
      VITE_VIDEO_TEMPLATES_ENABLED: env.VITE_VIDEO_TEMPLATES_ENABLED,
      VIDEO_TEMPLATES_ENABLED: env.VITE_VIDEO_TEMPLATES_ENABLED,
      VERCEL_ENV: env.VITE_VERCEL_ENV,
      VITE_VERCEL_ENV: env.VITE_VERCEL_ENV,
      NODE_ENV: env.DEV === "true" ? "development" : env.NODE_ENV,
    }),
  };
}

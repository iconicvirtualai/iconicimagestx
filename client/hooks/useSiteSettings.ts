import { useState, useEffect } from "react";
import { DEFAULT_SITE_SETTINGS } from "@/pages/AdminSiteCustomizer";

export function useSiteSettings() {
  const [settings, setSettings] = useState(DEFAULT_SITE_SETTINGS);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // First try to see if we have them in the server (the persistent ones)
        // Using a short timeout to avoid long waits on network issues
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 3000);

        try {
          const res = await fetch("/api/settings", { signal: controller.signal });
          clearTimeout(id);

          if (res && res.ok) {
            const serverSettings = await res.json();
            setSettings(serverSettings);
          }
        } catch (fetchError) {
          // If fetch fails (network error, abort), we just fall back
          console.log("useSiteSettings: Server settings not available (fetch error)");
        }

        // Check for drafting in local storage
        const saved = localStorage.getItem("site_customization");
        if (saved) {
          try {
            const localSettings = JSON.parse(saved);
            setSettings(prev => ({ ...prev, ...localSettings }));
          } catch (e) {
            // Ignore parse errors from local storage
          }
        }
      } catch (e) {
        // Catch-all to prevent any uncaught errors in the hook
        console.warn("useSiteSettings: Silent fallback to defaults", e);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "site_customization") {
        fetchSettings();
      }
    };

    fetchSettings();

    // Listen for updates from the customizer (same tab)
    window.addEventListener('site-settings-updated', fetchSettings);

    // Listen for updates from other tabs
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('site-settings-updated', fetchSettings);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return settings;
}

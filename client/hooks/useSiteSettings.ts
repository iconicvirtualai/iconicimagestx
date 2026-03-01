import { useState, useEffect } from "react";
import { DEFAULT_SITE_SETTINGS } from "@/pages/AdminSiteCustomizer";

export function useSiteSettings() {
  const [settings, setSettings] = useState(DEFAULT_SITE_SETTINGS);

  useEffect(() => {
    const fetchSettings = async () => {
      // First try to see if we have them in the server (the persistent ones)
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const serverSettings = await res.json();
          setSettings(serverSettings);
        }
      } catch (e) {
        console.warn("Failed to fetch settings from server, using local/default", e);
      }

      // Check for drafting in local storage
      const saved = localStorage.getItem("site_customization");
      if (saved) {
        try {
          const localSettings = JSON.parse(saved);
          // Only use local settings if they are different/newer or if server settings failed
          setSettings(prev => ({ ...prev, ...localSettings }));
        } catch (e) {
          console.error("Failed to parse settings", e);
        }
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

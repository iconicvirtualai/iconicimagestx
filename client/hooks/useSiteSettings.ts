import { useState, useEffect } from "react";
import { DEFAULT_SITE_SETTINGS } from "@/pages/AdminSiteCustomizer";

export function useSiteSettings() {
  const [settings, setSettings] = useState(DEFAULT_SITE_SETTINGS);

  useEffect(() => {
    const fetchSettings = () => {
      const saved = localStorage.getItem("site_customization");
      if (saved) {
        try {
          setSettings(JSON.parse(saved));
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

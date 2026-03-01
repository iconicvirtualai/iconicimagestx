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

    fetchSettings();

    // Listen for updates from the customizer
    window.addEventListener('site-settings-updated', fetchSettings);
    
    return () => {
      window.removeEventListener('site-settings-updated', fetchSettings);
    };
  }, []);

  return settings;
}

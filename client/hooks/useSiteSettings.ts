import { useState, useEffect } from "react";

// Default Site Settings Schema
export const DEFAULT_SITE_SETTINGS = {
  global: {
    primaryColor: "#0d9488",
    secondaryColor: "#0ea5e9",
    logoText: "ICONIC",
    showPromoBar: true,
    promoBarText: "FREE AI STAGING ON YOUR FIRST ORDER - CODE: ICONICAI",
  },
  homepage: {
    heroTitle: "ELEVATE YOUR LISTINGS WITH MEDIA THAT SELLS",
    heroSubtitle: "Your Creative Media Partners for Real Estate & Business Professionals.",
    heroImage: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80",
    showAudienceSection: true,
    showAIToolsSection: true,
    showBeforeAfter: true,
  },
  pricing: {
    title: "Pick the Perfect Price for Your Presence",
    subtitle: "Transparent pricing for every stage of your real estate career.",
    showBasics: true,
    showPhase2: true,
  }
};

// Global state to store settings and avoid redundant fetches
let globalSettings = DEFAULT_SITE_SETTINGS;
let listeners: Array<(settings: typeof DEFAULT_SITE_SETTINGS) => void> = [];
let isFetching = false;
let lastFetchTime = 0;
const FETCH_COOLDOWN = 2000; // 2 seconds cooldown between server fetches

// Broadcast changes to all active hooks
const notifyListeners = () => {
  listeners.forEach(listener => listener(globalSettings));
};

// Singleton fetch function
const fetchSettingsSingleton = async (force = false) => {
  // Always check local storage first for immediate updates (especially during customization)
  const saved = localStorage.getItem("site_customization");
  if (saved) {
    try {
      const localSettings = JSON.parse(saved);
      const nextSettings = { ...globalSettings, ...localSettings };
      if (JSON.stringify(nextSettings) !== JSON.stringify(globalSettings)) {
        globalSettings = nextSettings;
        notifyListeners();
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Then consider fetching from server if forced or outside cooldown
  const now = Date.now();
  if (isFetching || (!force && now - lastFetchTime < FETCH_COOLDOWN)) {
    return;
  }

  isFetching = true;
  lastFetchTime = now;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch("/api/settings", { 
        signal: controller.signal,
        cache: 'no-cache' // Ensure we get fresh data
      });
      clearTimeout(timeoutId);

      if (res && res.ok) {
        const serverSettings = await res.json();
        
        // Merge server settings with any local drafts (drafts take priority)
        const currentLocal = localStorage.getItem("site_customization");
        let merged = serverSettings;
        if (currentLocal) {
          try {
            merged = { ...serverSettings, ...JSON.parse(currentLocal) };
          } catch(e) {}
        }

        if (JSON.stringify(merged) !== JSON.stringify(globalSettings)) {
          globalSettings = merged;
          notifyListeners();
        }
      }
    } catch (fetchError) {
      // Catch fetch errors (network down, abort) completely silently to avoid stack traces in console
    }
  } catch (e) {
    // Silent catch-all
  } finally {
    isFetching = false;
  }
};

// Exported hook
export function useSiteSettings() {
  const [settings, setSettings] = useState(globalSettings);

  useEffect(() => {
    // Register this component's listener
    const listener = (newSettings: typeof DEFAULT_SITE_SETTINGS) => {
      setSettings(newSettings);
    };
    
    listeners.push(listener);
    
    // Initial fetch if we haven't fetched recently
    fetchSettingsSingleton();

    const handleUpdateEvent = () => fetchSettingsSingleton(false); // Don't force server fetch on every visual update
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "site_customization") {
        fetchSettingsSingleton(false);
      }
    };

    // Listen for updates from the customizer (same tab)
    window.addEventListener('site-settings-updated', handleUpdateEvent);
    // Listen for updates from other tabs
    window.addEventListener('storage', handleStorageChange);

    return () => {
      listeners = listeners.filter(l => l !== listener);
      window.removeEventListener('site-settings-updated', handleUpdateEvent);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return settings;
}

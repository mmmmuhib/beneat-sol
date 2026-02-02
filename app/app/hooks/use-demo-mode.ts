"use client";

import { useState, useEffect, useCallback } from "react";

const DEMO_MODE_KEY = "beneat-demo-mode";

export function useDemoMode() {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const checkDemoMode = () => {
      if (typeof window === "undefined") return false;

      const urlParams = new URLSearchParams(window.location.search);
      const urlDemo = urlParams.get("demo");

      if (urlDemo === "1" || urlDemo === "true") {
        localStorage.setItem(DEMO_MODE_KEY, "true");
        return true;
      }

      const stored = localStorage.getItem(DEMO_MODE_KEY);
      return stored === "true";
    };

    setIsDemoMode(checkDemoMode());
    setIsHydrated(true);
  }, []);

  const enableDemoMode = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(DEMO_MODE_KEY, "true");
    setIsDemoMode(true);
  }, []);

  const disableDemoMode = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(DEMO_MODE_KEY);
    setIsDemoMode(false);
  }, []);

  const toggleDemoMode = useCallback(() => {
    if (isDemoMode) {
      disableDemoMode();
    } else {
      enableDemoMode();
    }
  }, [isDemoMode, enableDemoMode, disableDemoMode]);

  return {
    isDemoMode,
    isHydrated,
    enableDemoMode,
    disableDemoMode,
    toggleDemoMode,
  };
}

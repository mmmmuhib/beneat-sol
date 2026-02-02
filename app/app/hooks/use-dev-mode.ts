"use client";

import { useState } from "react";

export function useDevMode() {
  const [isDevMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("dev") === "1";
  });

  return { isDevMode };
}

"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/lx/Button";

type Mode = "dark" | "light";

function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
  return () => obs.disconnect();
}
const getMode = (): Mode => (document.documentElement.dataset.mode === "light" ? "light" : "dark");
const getServerMode = (): Mode => "dark";

/** Dark is the default; the inline script in layout.tsx has already set data-mode before paint. */
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, getMode, getServerMode);

  function toggle() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    document.documentElement.dataset.mode = next;
    try {
      localStorage.setItem("pd2meta-theme", next);
    } catch {
      // storage can be blocked; the mode still applies for this visit
    }
  }

  return (
    <Button
      variant="ghost"
      onClick={toggle}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="size-10 px-0"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {mode === "dark" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </>
        ) : (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        )}
      </svg>
    </Button>
  );
}

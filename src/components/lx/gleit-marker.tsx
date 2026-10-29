"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Sliding marker (port of the package's motion/gleit-marker.tsx, reduced to what the shell needs):
 * a surface under the active entry of its parent that glides to the new entry with a spring.
 * Until it stands, the active entry carries its own surface (no flash); then the marker sets
 * `data-gleit` on the parent and CSS takes the surface off the entry.
 */
export function GleitMarker({ ziel, className }: { ziel: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const marker = ref.current;
    const eltern = marker?.parentElement;
    if (!marker || !eltern) return;
    let beobachtet: Element | null = null;
    let bild = 0;

    const setzen = () => {
      const aktiv = eltern.querySelector<HTMLElement>(ziel);
      if (aktiv !== beobachtet) {
        if (beobachtet) groesse.unobserve(beobachtet);
        if (aktiv) groesse.observe(aktiv);
        beobachtet = aktiv;
      }
      if (!aktiv || aktiv.offsetParent === null) {
        marker.dataset.leer = "";
        eltern.removeAttribute("data-gleit");
        return;
      }
      marker.style.setProperty("--gm-x", `${aktiv.offsetLeft}px`);
      marker.style.setProperty("--gm-y", `${aktiv.offsetTop}px`);
      marker.style.setProperty("--gm-b", `${aktiv.offsetWidth}px`);
      marker.style.setProperty("--gm-h", `${aktiv.offsetHeight}px`);
      delete marker.dataset.leer;
      eltern.setAttribute("data-gleit", "");
      // Glide only after the first placement, else the marker flies in from 0,0.
      if (!("bereit" in marker.dataset)) {
        bild = requestAnimationFrame(() => {
          marker.dataset.bereit = "";
        });
      }
    };
    const groesse = new ResizeObserver(setzen);
    groesse.observe(eltern);
    const zustand = new MutationObserver(setzen);
    zustand.observe(eltern, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-current", "aria-pressed"],
    });
    setzen();
    return () => {
      cancelAnimationFrame(bild);
      groesse.disconnect();
      zustand.disconnect();
      eltern.removeAttribute("data-gleit");
    };
  }, [ziel]);

  return (
    <span
      ref={ref}
      aria-hidden
      data-slot="gleit-marker"
      data-leer=""
      className={cn("gleit-marker", className)}
    />
  );
}

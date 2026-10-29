"use client";

import dynamic from "next/dynamic";

/** The calculator reads localStorage on first render, so it never prerenders. */
export const GoldCalcClient = dynamic(() => import("./GoldCalc").then((m) => m.GoldCalc), {
  ssr: false,
  loading: () => <div aria-hidden className="mx-auto h-[70vh] max-w-7xl" />,
});

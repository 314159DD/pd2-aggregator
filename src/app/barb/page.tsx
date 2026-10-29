import type { Metadata } from "next";
import { GoldCalcClient } from "@/components/barb/GoldCalcClient";

export const metadata: Metadata = {
  title: "Gold Find Barb | PD2 Meta Info",
  description: "Gold per hour and the best gold to WSS route for a gold find Barbarian in Project Diablo 2.",
};

export default function BarbPage() {
  return (
    <main className="lx lx-stage flex-1 px-3 pt-4 pb-16 sm:px-5">
      <GoldCalcClient />
    </main>
  );
}

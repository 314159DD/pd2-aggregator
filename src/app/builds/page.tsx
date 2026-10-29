import type { Metadata } from "next";
import { Suspense } from "react";
import { BuildsSkeleton, BuildsView } from "@/components/builds/BuildsView";

export const metadata: Metadata = { title: "Builds | PD2 Meta Info" };

export default function BuildsPage() {
  return (
    <main className="lx lx-stage flex-1 px-3 pt-4 pb-16 sm:px-5">
      <Suspense fallback={<BuildsSkeleton />}>
        <BuildsView />
      </Suspense>
    </main>
  );
}

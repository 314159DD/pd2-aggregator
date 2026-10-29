import type { Metadata } from "next";
import { Suspense } from "react";
import { BuildsSkeleton, BuildsView } from "@/components/builds/BuildsView";

export const metadata: Metadata = { title: "Builds | PD2 Meta Info" };

export default function BuildsPage() {
  return (
    <main className="lx flex-1 px-4 pt-6 pb-8 sm:px-6">
      <Suspense fallback={<BuildsSkeleton />}>
        <BuildsView />
      </Suspense>
    </main>
  );
}

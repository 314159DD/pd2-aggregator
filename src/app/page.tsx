import { Suspense } from "react";
import { MetaSkeleton, MetaView } from "@/components/meta/MetaView";

export default function Page() {
  return (
    <main className="lx lx-stage min-h-screen flex-1 px-3 pt-4 pb-16 sm:px-5">
      <Suspense fallback={<MetaSkeleton />}>
        <MetaView />
      </Suspense>
    </main>
  );
}

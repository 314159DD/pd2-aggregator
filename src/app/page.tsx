import { Suspense } from "react";
import { MetaSkeleton, MetaView } from "@/components/meta/MetaView";

export default function Page() {
  return (
    <main className="lx flex-1 px-4 pt-6 pb-8 sm:px-6">
      <Suspense fallback={<MetaSkeleton />}>
        <MetaView />
      </Suspense>
    </main>
  );
}

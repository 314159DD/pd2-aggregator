import type { Metadata } from "next";
import { Suspense } from "react";
import { CharacterSkeleton, CharacterView } from "@/components/character/CharacterView";

export const metadata: Metadata = { title: "Character | PD2 Meta Info" };

export default function CharacterPage() {
  return (
    <main className="lx lx-stage flex-1 px-3 pt-4 pb-16 sm:px-5">
      <Suspense fallback={<CharacterSkeleton />}>
        <CharacterView />
      </Suspense>
    </main>
  );
}

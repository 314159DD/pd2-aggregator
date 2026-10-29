import type { Metadata } from "next";
import { Suspense } from "react";
import { CharacterSkeleton, CharacterView } from "@/components/character/CharacterView";

export const metadata: Metadata = { title: "Character | PD2 Meta Info" };

export default function CharacterPage() {
  return (
    <main className="lx flex-1 px-4 pt-6 pb-8 sm:px-6">
      <Suspense fallback={<CharacterSkeleton />}>
        <CharacterView />
      </Suspense>
    </main>
  );
}

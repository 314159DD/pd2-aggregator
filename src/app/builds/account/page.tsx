import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountSkeleton, AccountView } from "@/components/builds/AccountView";

export const metadata: Metadata = { title: "Account | PD2 Meta Info" };

export default function AccountPage() {
  return (
    <main className="lx lx-stage flex-1 px-3 pt-4 pb-16 sm:px-5">
      <Suspense fallback={<AccountSkeleton />}>
        <AccountView />
      </Suspense>
    </main>
  );
}
